import { MAX_INT4, rowIdSchema } from "@/utils/rowId";
import { z, type ZodError } from "zod";

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

/**
 * Ceiling on the single-line free-text fields this feature renders on the
 * public /classes page (`title`, `location`, `caption`).
 *
 * All three were unbounded, so a 100,000-character value was accepted and
 * rendered publicly. One shared ceiling rather than three literals: they are the
 * same kind of field with the same reason for a bound. It is deliberately in the
 * same register as the repo's existing text bounds — `contactMessageSchema`
 * caps a name at 120 and an email at 200 — and short enough that an oversized
 * value is rejected rather than laid out.
 */
export const MAX_SINGLE_LINE_LENGTH = 200;

/**
 * Ceiling on the one long free-text field (`description`), matching the 5000 the
 * contact form already allows for a prose body.
 */
export const MAX_DESCRIPTION_LENGTH = 5000;

/**
 * The largest `ids` list a single reorder request may carry.
 *
 * `reorderPhotos` turns each entry into one `prisma.classPhoto.update` inside a
 * single transaction, and it filters by ownership rather than by uniqueness — so
 * a list that repeats one owned id 100,000 times produces 100,000 statements in
 * one transaction. Bounded far above any real album, which the public view caps
 * at 16.
 */
export const MAX_REORDER_IDS = 500;

/**
 * Top-level `{ error }` message for a rejected body on any class route.
 *
 * Every route here answered a body failure with a bare "Invalid input", which
 * names nothing: with the length caps above in place, an admin who pastes an
 * over-long caption is told only that something was wrong with a form that has
 * no visible limit on any field. Naming the failing field is the difference
 * between a usable message and a dead end.
 *
 * Only the field path, never the issue text and never the submitted value: the
 * path is our own schema's key, so it discloses nothing a caller did not already
 * send, and it keeps the message one short line - `readAdminError` discards an
 * `{ error }` that is multi-line or over 200 characters and substitutes a
 * generic fallback, which would hide the cause again. The deepest path these
 * schemas produce is `ids.<index>`, so the cap cannot be reached.
 */
export function classBodyErrorMessage(error: ZodError): string {
  const field = error.issues[0]?.path.join(".");
  return field ? `Invalid input: ${field}` : "Invalid input";
}

/** Title + general description shown on the public /classes page. */
export const classContentSchema = z.object({
  title: z.string().trim().min(1).max(MAX_SINGLE_LINE_LENGTH),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
});

/**
 * A single upcoming class session.
 *
 * `z.coerce.date()` accepts an ISO datetime string from JSON and produces a
 * Date instance, which Prisma's DateTime columns consume directly. Invalid
 * date strings fail validation, so this doubles as the trust-boundary check.
 * `endTime` and `location` are optional and may be explicitly null.
 *
 * `startTime` carries no upper bound on purpose. A JavaScript Date tops out at
 * year 275760, which a Postgres `timestamp` (year 294276) holds without error,
 * so an absurd date cannot produce a database failure or a leak; it can only
 * produce a nonsensical listing that the same admin can delete. Any sane horizon
 * would be a domain rule about what may be published, which belongs to the
 * service layer, not to this trust boundary.
 */
export const sessionInputSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable().optional(),
  location: z.string().trim().max(MAX_SINGLE_LINE_LENGTH).nullable().optional(),
});

/** Session payload that targets an existing row by id (update path). */
export const sessionUpdateSchema = sessionInputSchema.extend({
  id: rowIdSchema,
});

/**
 * A photo from a previous class. `s3Key` is the stored object key; signed URLs
 * are resolved on demand by the frontend (matching the recipe coverPhoto flow).
 * `sortOrder` defaults to 0 so the album has a stable, admin-controllable order.
 *
 * `sortOrder` is bounded rather than a bare `z.number()` because this schema and
 * `photoReorderSchema` both write the same column: reorder derives it as an
 * array index, so it is always a clean 0-based integer, while this path used to
 * accept `-5`, `2.7` and `1e308` into the same place. One strict path and one
 * loose path into one column is the defect; 0 stays legal because it is both the
 * default and the first reorder index.
 */
export const photoInputSchema = z.object({
  s3Key: z.string().min(1).startsWith(CLASS_MEDIA_PREFIX, {
    message: "Photo key must be within the class media folder.",
  }),
  caption: z.string().trim().max(MAX_SINGLE_LINE_LENGTH).nullable().optional(),
  sortOrder: z.number().int().min(0).max(MAX_INT4).optional().default(0),
});

/** Photo payload that targets an existing row by id (update path). */
export const photoUpdateSchema = photoInputSchema.extend({
  id: rowIdSchema,
});

/**
 * Batch photo reorder request body. `ids` is the FULL ordered list of photo
 * ids; each photo's resulting `sortOrder` is its index in this array (index 0
 * sorts first). The list is the untrusted client view of the album order, so
 * the service must scope the renumber to the singleton class's own photos and
 * ignore unknown ids (ordered id list -> sortOrder assigned by array index).
 */
export const photoReorderSchema = z.object({
  ids: z.array(rowIdSchema).min(1).max(MAX_REORDER_IDS),
});

export type ClassContentInput = z.infer<typeof classContentSchema>;
export type SessionInput = z.infer<typeof sessionInputSchema>;
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;
export type PhotoInput = z.infer<typeof photoInputSchema>;
export type PhotoUpdateInput = z.infer<typeof photoUpdateSchema>;
export type PhotoReorderInput = z.infer<typeof photoReorderSchema>;
