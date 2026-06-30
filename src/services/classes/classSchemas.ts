import { z } from "zod";

/**
 * Shared Zod contracts for the Cocktail Classes feature.
 *
 * Single source of truth imported by the service layer, the API routes, and
 * the frontend so all three reuse ONE contract. Field names match the agreed
 * Prisma models (CocktailClass / ClassSession / ClassPhoto) exactly.
 */

/**
 * Allowlisted S3 key prefix for class-feature media. `s3Key` is later passed to
 * `deleteS3Objects` on update/delete, so it must be confined to this feature's
 * own namespace to prevent deletion of unrelated objects (e.g. blog-media/,
 * recipe-media/). Uploads land under `class-media/album/...`; the broader
 * `class-media/` prefix is intentional to leave room for future class subfolders.
 */
export const CLASS_MEDIA_PREFIX = "class-media/";

/** Title + general description shown on the public /classes page. */
export const classContentSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

/**
 * A single upcoming class session.
 *
 * `z.coerce.date()` accepts an ISO datetime string from JSON and produces a
 * Date instance, which Prisma's DateTime columns consume directly. Invalid
 * date strings fail validation, so this doubles as the trust-boundary check.
 * `endTime` and `location` are optional and may be explicitly null.
 */
export const sessionInputSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable().optional(),
  location: z.string().nullable().optional(),
});

/** Session payload that targets an existing row by id (update path). */
export const sessionUpdateSchema = sessionInputSchema.extend({
  id: z.number(),
});

/**
 * A photo from a previous class. `s3Key` is the stored object key; signed URLs
 * are resolved on demand by the frontend (matching the recipe coverPhoto flow).
 * `sortOrder` defaults to 0 so the album has a stable, admin-controllable order.
 */
export const photoInputSchema = z.object({
  s3Key: z
    .string()
    .min(1)
    .startsWith(CLASS_MEDIA_PREFIX, {
      message: "Photo key must be within the class media folder.",
    }),
  caption: z.string().nullable().optional(),
  sortOrder: z.number().optional().default(0),
});

/** Photo payload that targets an existing row by id (update path). */
export const photoUpdateSchema = photoInputSchema.extend({
  id: z.number(),
});

/**
 * Batch photo reorder request body. `ids` is the FULL ordered list of photo
 * ids; each photo's resulting `sortOrder` is its index in this array (index 0
 * sorts first). The list is the untrusted client view of the album order, so
 * the service must scope the renumber to the singleton class's own photos and
 * ignore unknown ids (ordered id list -> sortOrder assigned by array index).
 */
export const photoReorderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

/** Shared id param for delete/lookup operations. */
export const idParamSchema = z.object({
  id: z.number(),
});

export type ClassContentInput = z.infer<typeof classContentSchema>;
export type SessionInput = z.infer<typeof sessionInputSchema>;
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;
export type PhotoInput = z.infer<typeof photoInputSchema>;
export type PhotoUpdateInput = z.infer<typeof photoUpdateSchema>;
export type PhotoReorderInput = z.infer<typeof photoReorderSchema>;
