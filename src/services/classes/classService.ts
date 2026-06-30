import { MAX_ALBUM_PHOTOS } from "@/config/album";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis, { invalidateClassCache } from "@/utils/redisClient";
import { deleteS3Objects, getS3ImageUrl } from "@/utils/s3";
import type {
  CocktailClass,
  ClassSession,
  ClassPhoto,
} from "../../../generated/prisma";
import { ClassNotFoundError, NoClassPageError } from "./classErrors";
import type {
  ClassContentInput,
  PhotoInput,
  SessionInput,
} from "./classSchemas";
import type { ClassPageView, ClassPhotoView } from "./classView";

/**
 * Service layer for the Cocktail Classes feature.
 *
 * The public /classes page is a SINGLETON: one title + one description plus a
 * list of upcoming sessions and an album of previous-class photos. The class
 * row is therefore treated as a single page record (findFirst / upsert
 * semantics). Routes stay thin and call into these functions (Standard C).
 *
 * Read paths:
 *   - getClassPage(): raw read returning unsigned s3Key values (backward-
 *     compatible /api/classes contract; no caching).
 *   - getClassPageView(): the signed + Redis-cached read path used by the
 *     /classes page. It signs each photo's s3Key server-side and caches the
 *     signed payload, mirroring the blogs pattern. Mutations invalidate this
 *     cache via invalidateClassCache(). Redis is used fail-open: any Redis
 *     failure degrades to live signing without caching, never an outage.
 */

const CONTEXT = "classService";

/** Redis key for the signed, cached /classes page payload. */
const CLASS_PAGE_CACHE_KEY = "classes:page";

// Cache TTL is held below the 3600s signed-URL lifetime so the cached payload
// is refreshed (and re-signed) before its URLs can expire under normal reads;
// the per-photo expiry check on read is the secondary safety net.
const CLASS_PAGE_CACHE_TTL_SECONDS = 55 * 60; // 55 minutes

/**
 * Parse a raw cached payload into a ClassPageView, returning null when the
 * value is malformed or poisoned (bad JSON, or missing the expected `photos`
 * array). A null result is treated as a cache miss so a corrupted/poisoned
 * cache entry can never throw or be trusted as a real signed payload.
 */
function parseCachedView(cached: string): ClassPageView | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cached);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { photos?: unknown }).photos)
  ) {
    return null;
  }
  return parsed as ClassPageView;
}

/**
 * Return false when a signed S3 URL is within 5s of expiry (or already
 * expired), mirroring the blogs read-path freshness check. URLs without the
 * signing params (e.g. absolute URLs or null) are treated as fresh.
 */
function isSignedUrlFresh(url: string | null): boolean {
  if (!url) return true;
  const expiresMatch = url.match(/X-Amz-Expires=(\d+)/);
  const dateMatch = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/);
  if (!expiresMatch || !dateMatch) return true;

  const expires = parseInt(expiresMatch[1], 10);
  const dateStr = dateMatch[1];
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  const hour = parseInt(dateStr.slice(9, 11), 10);
  const min = parseInt(dateStr.slice(11, 13), 10);
  const sec = parseInt(dateStr.slice(13, 15), 10);
  const issued = Date.UTC(year, month, day, hour, min, sec);
  const expiresAt = issued + expires * 1000;
  return Date.now() <= expiresAt - 5000; // 5s buffer
}

/**
 * Resolve the singleton class page row, or null when it has not been created
 * yet. Centralized so every caller shares one lookup definition (DRY).
 */
async function getSingletonClass(): Promise<CocktailClass | null> {
  return prisma.cocktailClass.findFirst({ orderBy: { id: "asc" } });
}

/**
 * Resolve the singleton class id, or null when no class page exists yet. This
 * is the single non-throwing source of truth for id resolution; callers that
 * need the full row use getSingletonClass, and guarded writes use
 * requireSingletonClassId. Selects only the id to avoid over-fetching.
 */
export async function getSingletonClassId(): Promise<number | null> {
  const existing = await prisma.cocktailClass.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return existing?.id ?? null;
}

/**
 * Resolve the singleton class id, throwing a clear error when no class page
 * has been saved yet. Sessions and photos cannot be attached before content
 * exists, so dependent writes funnel through this guard.
 */
async function requireSingletonClassId(): Promise<number> {
  const classId = await getSingletonClassId();
  if (classId === null) {
    throw new NoClassPageError();
  }
  return classId;
}

/**
 * Options for {@link getClassPage}.
 *
 * `photoLimit` controls how many album photos the read returns:
 *   - omitted / `undefined` (the default): cap at `MAX_ALBUM_PHOTOS`. This is the
 *     public contract — every existing caller (getClassPageView, the
 *     /api/classes route) gets the same capped, deterministically ordered set
 *     it always has.
 *   - `null`: return ALL photos for the class (no `take`). Used by the
 *     admin-facing read where the full album must be managed; gating of this
 *     uncapped path is enforced at the route via isAdmin.
 *   - a number: return at most that many photos.
 *
 * Ordering is identical in every case (sortOrder asc, then createdAt asc), so
 * the only thing this option changes is the size of the returned photo set.
 */
export type GetClassPageOptions = {
  photoLimit?: number | null;
};

/**
 * Raw read for the singleton class plus its sessions (soonest first) and photos
 * (admin sort order, then oldest first). Returns raw s3Key values and is the
 * backward-compatible source for the /api/classes route. The /classes page uses
 * getClassPageView, which signs and Redis-caches these photos.
 *
 * See {@link GetClassPageOptions}: by default the photo read is capped at
 * `MAX_ALBUM_PHOTOS` (public contract, unchanged); pass `{ photoLimit: null }`
 * for the admin read that needs the full album.
 */
export async function getClassPage(
  options?: GetClassPageOptions,
): Promise<{
  class: CocktailClass | null;
  sessions: ClassSession[];
  photos: ClassPhoto[];
}> {
  const cocktailClass = await getSingletonClass();
  if (!cocktailClass) {
    return { class: null, sessions: [], photos: [] };
  }

  // Default (photoLimit undefined) caps at MAX_ALBUM_PHOTOS to preserve the
  // public contract; an explicit null lifts the cap entirely (admin read), and
  // a number caps at that value. A non-positive number falls through as null
  // here only if explicitly passed; null is the documented "all" signal.
  const take =
    options?.photoLimit === undefined ? MAX_ALBUM_PHOTOS : options.photoLimit;

  const [sessions, photos] = await Promise.all([
    prisma.classSession.findMany({
      where: { classId: cocktailClass.id },
      orderBy: { startTime: "asc" },
    }),
    // Cap fetched photos to `take` (MAX_ALBUM_PHOTOS by default): the album
    // renders at most this many slides, so the deterministic ordering below
    // means take returns exactly the photos the album can ever display (no
    // over-fetch). A null take (admin read) omits the cap to return all photos.
    prisma.classPhoto.findMany({
      where: { classId: cocktailClass.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      ...(take != null ? { take } : {}),
    }),
  ]);

  return { class: cocktailClass, sessions, photos };
}

/**
 * Sign one raw S3 key into a client-facing url, returning null when signing is
 * unavailable. getS3ImageUrl falls back to returning the raw key on
 * missing-env / signing failure; treating that fallback (a non-signed key, not
 * an absolute URL) as null prevents the raw s3Key from crossing to the client
 * masquerading as a working signed URL (classView contract: raw keys never
 * leave the server).
 */
async function signPhotoUrl(s3Key: string): Promise<string | null> {
  const signed = await getS3ImageUrl(s3Key);
  if (!signed) return null;
  if (signed === s3Key) return null; // signing failed; key returned as-is
  return signed;
}

/** Sign raw photos into client-facing views (failed signer result -> null). */
async function signPhotos(photos: ClassPhoto[]): Promise<ClassPhotoView[]> {
  return Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      url: await signPhotoUrl(photo.s3Key),
      caption: photo.caption,
    })),
  );
}

/**
 * Signed, Redis-cached read path for the /classes page. Returns the singleton
 * class and sessions unchanged from getClassPage, plus photos as ClassPhotoView
 * with server-signed URLs (raw s3Key never crosses to the client).
 *
 * Redis is used fail-open: a cache hit is validated for signed-URL freshness
 * (re-signing on any expired URL); on miss the payload is signed and cached.
 * Any Redis failure degrades to live signing without caching so a Redis outage
 * can never break the page (Standard D resilience).
 */
export async function getClassPageView(): Promise<ClassPageView> {
  const { class: cocktailClass, sessions, photos } = await getClassPage();

  try {
    const cached = await redis.get(CLASS_PAGE_CACHE_KEY);
    if (cached) {
      const parsed = parseCachedView(cached);
      if (!parsed) {
        // Malformed / poisoned cache value: drop the bad key and treat as miss.
        await redis.del(CLASS_PAGE_CACHE_KEY);
        logger.warn("Class page cache value malformed; treating as miss", {
          context: CONTEXT,
        });
      } else if (parsed.photos.every((photo) => isSignedUrlFresh(photo.url))) {
        logger.info("Class page cache hit (redis, valid)", { context: CONTEXT });
        return parsed;
      } else {
        await redis.del(CLASS_PAGE_CACHE_KEY);
        logger.info("Class page cache invalidated due to expired signed URL", {
          context: CONTEXT,
        });
      }
    }

    const view: ClassPageView = {
      class: cocktailClass,
      sessions,
      photos: await signPhotos(photos),
    };
    await redis.set(
      CLASS_PAGE_CACHE_KEY,
      JSON.stringify(view),
      "EX",
      CLASS_PAGE_CACHE_TTL_SECONDS,
    );
    logger.info("Class page cache miss, signed and cached (redis)", {
      context: CONTEXT,
    });
    return view;
  } catch (error) {
    // Fail open: never let a Redis/cache fault break the page.
    logger.error("Class page cache unavailable; signing live without cache", {
      context: CONTEXT,
      data: { error: (error as Error).message },
    });
    return {
      class: cocktailClass,
      sessions,
      photos: await signPhotos(photos),
    };
  }
}

/**
 * Invalidate the cached signed class page after a mutation. Fail-open: a failed
 * invalidation is logged and swallowed so it never fails the mutation itself.
 */
async function invalidateClassPageCache(): Promise<void> {
  try {
    await invalidateClassCache();
  } catch (error) {
    logger.error("Failed to invalidate class page cache", {
      context: CONTEXT,
      data: { error: (error as Error).message },
    });
  }
}

/**
 * Create the singleton class page when absent, otherwise update its title and
 * description. Returns the resulting class row.
 */
export async function upsertClassContent(
  input: ClassContentInput,
): Promise<CocktailClass> {
  const existing = await getSingletonClass();
  if (existing) {
    const updated = await prisma.cocktailClass.update({
      where: { id: existing.id },
      data: { title: input.title, description: input.description },
    });
    logger.info("Class content updated", { context: CONTEXT, data: { id: updated.id } });
    await invalidateClassPageCache();
    return updated;
  }

  const created = await prisma.cocktailClass.create({
    data: { title: input.title, description: input.description },
  });
  logger.info("Class content created", { context: CONTEXT, data: { id: created.id } });
  await invalidateClassPageCache();
  return created;
}

/**
 * Create a session attached to the singleton class page. Throws when no class
 * page exists yet (admin must save content first).
 */
export async function createSession(
  input: SessionInput,
): Promise<ClassSession> {
  const classId = await requireSingletonClassId();
  const session = await prisma.classSession.create({
    data: {
      classId,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      location: input.location ?? null,
    },
  });
  logger.info("Class session created", { context: CONTEXT, data: { id: session.id } });
  await invalidateClassPageCache();
  return session;
}

/** Update a session by id. */
export async function updateSession(
  id: number,
  input: SessionInput,
): Promise<ClassSession> {
  const session = await prisma.classSession.update({
    where: { id },
    data: {
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      location: input.location ?? null,
    },
  });
  logger.info("Class session updated", { context: CONTEXT, data: { id: session.id } });
  await invalidateClassPageCache();
  return session;
}

/** Delete a session by id. */
export async function deleteSession(id: number): Promise<ClassSession> {
  const session = await prisma.classSession.delete({ where: { id } });
  logger.info("Class session deleted", { context: CONTEXT, data: { id: session.id } });
  await invalidateClassPageCache();
  return session;
}

/**
 * Create a photo attached to the singleton class page. Throws when no class
 * page exists yet (admin must save content first).
 */
export async function createPhoto(input: PhotoInput): Promise<ClassPhoto> {
  const classId = await requireSingletonClassId();
  const photo = await prisma.classPhoto.create({
    data: {
      classId,
      s3Key: input.s3Key,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    },
  });
  logger.info("Class photo created", { context: CONTEXT, data: { id: photo.id } });
  await invalidateClassPageCache();
  return photo;
}

/**
 * Update a photo by id. When the s3Key changes, the superseded object is
 * removed from S3 via the shared deleteS3Objects primitive so storage does not
 * leak orphaned uploads.
 */
export async function updatePhoto(
  id: number,
  input: PhotoInput,
): Promise<ClassPhoto> {
  const existing = await prisma.classPhoto.findUnique({ where: { id } });
  if (!existing) {
    throw new ClassNotFoundError(`Class photo ${id} not found`);
  }

  const photo = await prisma.classPhoto.update({
    where: { id },
    data: {
      s3Key: input.s3Key,
      caption: input.caption ?? null,
      sortOrder: input.sortOrder,
    },
  });

  if (existing.s3Key !== input.s3Key) {
    await deleteS3Objects([existing.s3Key]);
    logger.info("Class photo s3Key replaced", {
      context: CONTEXT,
      data: { id: photo.id },
    });
  }

  logger.info("Class photo updated", { context: CONTEXT, data: { id: photo.id } });
  await invalidateClassPageCache();
  return photo;
}

/**
 * Atomically renumber photo `sortOrder` from an ordered id list, scoped to the
 * singleton class. `ids` is the untrusted client view of the album order: each
 * matched photo's `sortOrder` is set to its index in `ids` (index 0 sorts
 * first). Only photos belonging to the singleton class are touched — ids not
 * owned by the class are ignored (never trust client ids to address arbitrary
 * rows), and photos whose id is absent from `ids` are left unaffected. All
 * updates run in one transaction so the reorder is all-or-nothing. Throws when
 * no class page exists yet (NoClassPageError), mirroring sibling write guards.
 */
export async function reorderPhotos(ids: number[]): Promise<void> {
  const classId = await requireSingletonClassId();

  // Class-scope the renumber: only ids that actually belong to this class are
  // eligible, so foreign/unknown ids in the untrusted input are skipped.
  const owned = await prisma.classPhoto.findMany({
    where: { classId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((photo) => photo.id));

  const updates = ids
    .map((id, index) => ({ id, sortOrder: index }))
    .filter((update) => ownedIds.has(update.id))
    .map((update) =>
      prisma.classPhoto.update({
        where: { id: update.id },
        data: { sortOrder: update.sortOrder },
      }),
    );

  await prisma.$transaction(updates);
  logger.info("Class photos reordered", {
    context: CONTEXT,
    data: { count: updates.length },
  });
  await invalidateClassPageCache();
}

/**
 * Delete a photo by id and clean up its backing S3 object via the shared
 * deleteS3Objects primitive.
 */
export async function deletePhoto(id: number): Promise<ClassPhoto> {
  const existing = await prisma.classPhoto.findUnique({ where: { id } });
  if (!existing) {
    throw new ClassNotFoundError(`Class photo ${id} not found`);
  }

  const photo = await prisma.classPhoto.delete({ where: { id } });
  await deleteS3Objects([existing.s3Key]);
  logger.info("Class photo deleted", { context: CONTEXT, data: { id: photo.id } });
  await invalidateClassPageCache();
  return photo;
}
