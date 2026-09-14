import { CLASS_MEDIA_PREFIX } from "@/services/classes/classSchemas";
import { z } from "zod";

/**
 * Trust-boundary contract for presigned S3 upload requests.
 *
 * A presigned PUT bypasses `/api/uploads` entirely — the caller writes straight
 * to the bucket — so the constraints that route applies in-process have to be
 * baked into the signature instead. Both fields below are signed into the URL,
 * so validating them here is what actually binds the upload:
 *
 * - `key` decides which object is written, and therefore what can be overwritten.
 * - `contentType` decides what S3 later serves the bytes back as, and therefore
 *   whether an upload can be rendered as active content in a browser.
 */

/** The bucket's top-level media namespaces, one per content type. */
export const BLOG_MEDIA_PREFIX = "blog-media/";
export const RECIPE_MEDIA_PREFIX = "recipe-media/";
export const MISC_MEDIA_PREFIX = "misc-media/";

/**
 * Allowlisted S3 key prefixes for admin uploads. Confining the key to these
 * prefixes keeps an upload inside the site's own media namespaces rather than
 * letting it target an arbitrary object.
 *
 * This is also the bucket layout `/api/uploads` writes into, and that is
 * enforced rather than mirrored by hand: the route types its destination as
 * `UploadKeyPrefix`-rooted, so adding a namespace there without listing it here
 * fails typecheck instead of 400-ing at signing time.
 */
export const UPLOAD_KEY_PREFIXES = [
  BLOG_MEDIA_PREFIX,
  RECIPE_MEDIA_PREFIX,
  CLASS_MEDIA_PREFIX,
  MISC_MEDIA_PREFIX,
] as const;

/** One of the bucket's media namespaces; the root of every uploadable key. */
export type UploadKeyPrefix = (typeof UPLOAD_KEY_PREFIXES)[number];

/** S3's own hard limit on object key length. */
export const MAX_S3_KEY_LENGTH = 1024;

/**
 * Allowlisted still-image types, matching `/api/uploads` exactly.
 * `image/svg+xml` is deliberately absent: SVG can carry script.
 */
export const UPLOAD_IMAGE_CONTENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Whether a MIME type may be signed for upload. Images are an explicit
 * allowlist; video is accepted by family because the admin editors offer
 * `accept="image/*,video/*"` and browsers report a long tail of container
 * types. Markup types (`text/html`, `image/svg+xml`, ...) match neither, so a
 * signed upload can never be served back as a renderable document.
 */
export function isAllowedUploadContentType(contentType: string): boolean {
  return (
    UPLOAD_IMAGE_CONTENT_TYPES.includes(contentType) ||
    contentType.startsWith("video/")
  );
}

/** Request body accepted by `POST /api/s3-signed-url`. */
export const signedUploadRequestSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_S3_KEY_LENGTH)
    .refine(
      (key) => UPLOAD_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
      { message: "Upload key must be within an allowed media folder." },
    ),
  contentType: z.string().refine(isAllowedUploadContentType, {
    message: "Unsupported upload content type.",
  }),
});

export type SignedUploadRequest = z.infer<typeof signedUploadRequestSchema>;
