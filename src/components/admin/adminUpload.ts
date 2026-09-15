import { readAdminError, type AdminFetch } from "@/hooks/useAdminFetch";

/**
 * The two-request S3 upload both record editors perform, in one place.
 *
 * It was four hand-rolled copies - a cover and a content-media path in each of
 * the blog and recipe editors - and the copies had already drifted: three said
 * "Cover upload failed (S3 error)" and one said "Upload failed (S3 error)",
 * two surfaced the server's `error` verbatim and two did not.
 *
 * WHY ONLY THE FIRST REQUEST IS AUTHENTICATED, which is the single thing about
 * this flow that must not be "tidied up" later: `/api/s3-signed-url` is an
 * admin route and needs the bearer, but the PUT goes directly to S3 against a
 * presigned URL whose SigV4 signature covers a fixed set of headers. Adding an
 * `Authorization` header to that request makes S3 reject it outright. So the
 * second call is a plain `fetch` on purpose, and routing it through
 * `adminFetch` would break every upload in the admin.
 *
 * Returns a result rather than throwing, and never surfaces a raw upstream
 * body: the caller renders `message` straight into the UI, so the only server
 * text that can reach it is what `readAdminError` judges safe.
 */
export type AdminUploadResult =
  | { ok: true; key: string }
  | { ok: false; message: string };

/** Used when the signing route answers with something other than a URL - a
 *  shape failure rather than a status failure, so there is no `{ error }` to
 *  read and nothing more specific that can honestly be said. */
const UPLOAD_FAILED = "Upload failed. Please try again.";

function readSignedUrl(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const url = (payload as { url?: unknown }).url;
  // Absolute http(s) only. The value is fed to `fetch` as a request target, and
  // a relative or non-http string here would silently re-point the upload at
  // this origin.
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return "";
  return url;
}

export async function uploadToS3(
  adminFetch: AdminFetch,
  key: string,
  file: File,
): Promise<AdminUploadResult> {
  let signed: Response;
  try {
    signed = await adminFetch("/api/s3-signed-url", {
      method: "POST",
      json: { key, contentType: file.type },
    });
  } catch {
    return { ok: false, message: UPLOAD_FAILED };
  }

  if (!signed.ok) {
    return { ok: false, message: await readAdminError(signed, UPLOAD_FAILED) };
  }

  const payload: unknown = await signed.json().catch(() => null);
  const uploadUrl = readSignedUrl(payload);
  if (!uploadUrl) return { ok: false, message: UPLOAD_FAILED };

  try {
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) {
      // Deliberately not `readAdminError`: this response is S3's, not ours, and
      // its body is an XML fault document that would be meaningless here even
      // if it passed the safe-message shape test.
      return {
        ok: false,
        message: "Upload failed: the file did not reach storage.",
      };
    }
  } catch {
    return { ok: false, message: UPLOAD_FAILED };
  }

  // The KEY, not the signed URL. The URL expires; the key is what the record
  // stores and what the list re-signs on demand.
  return { ok: true, key };
}
