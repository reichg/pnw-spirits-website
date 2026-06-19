import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { deleteS3Objects } from "@/utils/s3";
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

/**
 * Service layer for the Cocktail Classes feature.
 *
 * The public /classes page is a SINGLETON: one title + one description plus a
 * list of upcoming sessions and an album of previous-class photos. The class
 * row is therefore treated as a single page record (findFirst / upsert
 * semantics). Routes stay thin and call into these functions (Standard C).
 *
 * No Redis caching is used here: this is a low-traffic, server-rendered
 * singleton page, so caching would add invalidation complexity for negligible
 * benefit. This is an intentional deferral (see specialist report).
 */

const CONTEXT = "classService";

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
 * Public read path for the /classes page. Returns the singleton class plus its
 * sessions (soonest first) and photos (admin sort order, then oldest first).
 * Raw s3Key values are returned; the frontend resolves signed URLs on demand.
 */
export async function getClassPage(): Promise<{
  class: CocktailClass | null;
  sessions: ClassSession[];
  photos: ClassPhoto[];
}> {
  const cocktailClass = await getSingletonClass();
  if (!cocktailClass) {
    return { class: null, sessions: [], photos: [] };
  }

  const [sessions, photos] = await Promise.all([
    prisma.classSession.findMany({
      where: { classId: cocktailClass.id },
      orderBy: { startTime: "asc" },
    }),
    prisma.classPhoto.findMany({
      where: { classId: cocktailClass.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return { class: cocktailClass, sessions, photos };
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
    return updated;
  }

  const created = await prisma.cocktailClass.create({
    data: { title: input.title, description: input.description },
  });
  logger.info("Class content created", { context: CONTEXT, data: { id: created.id } });
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
  return session;
}

/** Delete a session by id. */
export async function deleteSession(id: number): Promise<ClassSession> {
  const session = await prisma.classSession.delete({ where: { id } });
  logger.info("Class session deleted", { context: CONTEXT, data: { id: session.id } });
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
  return photo;
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
  return photo;
}
