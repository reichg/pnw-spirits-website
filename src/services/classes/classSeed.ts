import prisma from "@/utils/prisma";
import {
  createPhoto,
  createSession,
  getSingletonClassId,
  upsertClassContent,
} from "./classService";
import { CLASS_MEDIA_PREFIX } from "./classSchemas";
import type { PhotoInput, SessionInput } from "./classSchemas";

/**
 * Seed album subfolder under the allowlisted `CLASS_MEDIA_PREFIX`. Reusing the
 * shared prefix keeps the s3Key namespace single-sourced with the schema's
 * `startsWith` validation; only the seed-specific `album/` segment is local.
 */
const SEED_ALBUM_PREFIX = `${CLASS_MEDIA_PREFIX}album/`;

/**
 * Idempotent, non-destructive seed for the public /classes singleton page.
 *
 * Routed through the existing service functions (Standard C) so each item runs
 * the same Zod validation and write semantics as the admin flow — no bulk raw
 * Prisma creation. Re-running adds nothing and never clobbers admin-entered
 * rows: content is upserted (idempotent), while sessions and photos are only
 * created when the class currently has zero of them.
 */

/** Singleton content with a PNW craft-cocktail workshop voice. */
const SEED_CONTENT = {
  title: "Pacific Northwest Craft Cocktail Workshop",
  description:
    "Spend an evening shaking, stirring, and tasting your way through small-batch PNW spirits. " +
    "Our bartenders guide you from foraged garnishes to your own signature pour, with hands-on " +
    "stations for citrus prep, house syrups, and balanced builds you can recreate at home.",
} as const;

/**
 * Deterministic future sessions (Pacific offset, in the future relative to
 * mid-2026). Fixed ISO strings keep seeded data stable across runs; the schema
 * coerces these to Date instances.
 */
const SEED_SESSIONS: SessionInput[] = [
  {
    startTime: new Date("2026-07-18T18:00:00-07:00"),
    endTime: new Date("2026-07-18T20:00:00-07:00"),
    location: "Capitol Hill Tasting Room, Seattle, WA",
  },
  {
    startTime: new Date("2026-08-15T18:30:00-07:00"),
    endTime: new Date("2026-08-15T20:30:00-07:00"),
    location: "Pearl District Loft, Portland, OR",
  },
  {
    startTime: new Date("2026-09-12T17:00:00-07:00"),
    endTime: new Date("2026-09-12T19:00:00-07:00"),
    location: "Waterfront Distillery, Tacoma, WA",
  },
  {
    startTime: new Date("2026-10-10T18:00:00-07:00"),
    endTime: new Date("2026-10-10T20:00:00-07:00"),
    location: "Riverfront Cocktail Lab, Spokane, WA",
  },
];

/**
 * Album photos. s3Keys are deterministic placeholders under the allowlisted
 * `class-media/album/` prefix and intentionally do NOT resolve to real S3
 * objects — they exist to populate the album layout for previews/local runs.
 * sortOrder is the array index for a stable, admin-controllable order.
 */
const SEED_PHOTO_DATA: { slug: string; caption: string }[] = [
  { slug: "foraged-garnishes", caption: "Foraged garnishes from the Cascades" },
  { slug: "small-batch-pour", caption: "Pouring a small-batch PNW gin" },
  { slug: "shaking-station", caption: "Guests at the shaking station" },
  { slug: "citrus-prep", caption: "Fresh citrus prep before service" },
  { slug: "house-syrups", caption: "House syrups simmering on the line" },
  { slug: "finished-cocktails", caption: "A flight of finished cocktails" },
  { slug: "barrel-aged-tasting", caption: "Sampling a barrel-aged variation" },
  { slug: "garnish-plating", caption: "Plating an expressed-citrus garnish" },
  { slug: "group-build", caption: "Guests building their signature pour" },
  { slug: "closing-toast", caption: "Cheers to a great class" },
];

const SEED_PHOTOS: PhotoInput[] = SEED_PHOTO_DATA.map((photo, index) => ({
  // Zero-padded index + slug keeps keys deterministic and album-ordered.
  s3Key: `${SEED_ALBUM_PREFIX}seed-${String(index + 1).padStart(2, "0")}-${photo.slug}`,
  caption: photo.caption,
  sortOrder: index,
}));

/**
 * Seed the singleton class page. Safe to run repeatedly: content is upserted,
 * and sessions/photos are only added when none exist yet, so admin-entered rows
 * are never deleted or overwritten.
 */
export async function seedClassPage(): Promise<void> {
  // upsert first so dependent session/photo writes always have a class to
  // attach to (createSession/createPhoto throw when content is absent).
  await upsertClassContent(SEED_CONTENT);

  const classId = await getSingletonClassId();
  if (classId === null) {
    return;
  }

  const [sessionCount, photoCount] = await Promise.all([
    prisma.classSession.count({ where: { classId } }),
    prisma.classPhoto.count({ where: { classId } }),
  ]);

  // Empty-check guards make the seed non-destructive: skip creation entirely
  // once any session/photo exists so we never duplicate or clobber real data.
  if (sessionCount === 0) {
    for (const session of SEED_SESSIONS) {
      await createSession(session);
    }
  }

  if (photoCount === 0) {
    for (const photo of SEED_PHOTOS) {
      await createPhoto(photo);
    }
  }
}
