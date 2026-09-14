import { logger } from "@/utils/logger";
import redis from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";

/**
 * Server-side signing of stored S3 keys for render paths that need a real
 * `src` at SSR time rather than a post-hydration round-trip.
 *
 * Two problems are solved here, and both matter:
 *
 * 1. Unusable signer results. `getS3ImageUrl` is deliberately lenient: it
 *    returns `undefined` for an empty key and echoes its *input* back when the
 *    AWS env vars are missing or signing throws. An echoed raw key is not a
 *    URL, and handing one to next/image throws "Failed to parse src" and takes
 *    the whole render down. Every unusable outcome collapses to `null` so a
 *    caller has one unambiguous signal to branch on.
 *
 * 2. Signature rotation. A presigned URL carries its signature in the query
 *    string, and Next's image optimizer keys its cache on the full href. Signing
 *    afresh per request would rotate that href every time and force a re-download
 *    and re-encode of the full-resolution original on every page view. The signed
 *    URL is therefore Redis-cached so it stays byte-identical across requests for
 *    the life of the entry.
 *
 * Mirrors `src/services/classes/classService.ts`, which applies the same
 * null-on-failure contract, the same sub-expiry cache TTL, and the same
 * fail-open Redis handling to class album photos.
 */

const CONTEXT = "signedImageService";

/**
 * Cache namespace for signed image URLs.
 *
 * Deliberately outside `recipes:*` / `blogs:*` / `classes:*`, all of which are
 * cleared wholesale by their `invalidate*Cache()` wildcard helpers. A recipe
 * edit must not drop these entries: doing so would rotate the signature — and
 * therefore the optimizer's cache key — on every content mutation.
 *
 * No invalidation is needed. The key is the S3 object key, which is the object's
 * identity: swapping a cover photo writes a *different* key and so reads a
 * different entry, and editing any other field cannot make a signed URL wrong.
 * The only stale window is a deleted object, whose URL 404s until the entry ages
 * out — the same bounded window the class album already accepts.
 */
const SIGNED_URL_CACHE_PREFIX = "media:signed:";

// Held below the 3600s signature lifetime so an entry is always re-signed before
// its URL can expire under normal reads; the freshness check below is the
// secondary safety net. Matches the class page's buffer.
const SIGNED_URL_CACHE_TTL_SECONDS = 55 * 60; // 55 minutes

/**
 * Return false when a signed S3 URL is within 5s of expiry (or already expired).
 * URLs without the signing params (e.g. absolute URLs) are treated as fresh.
 *
 * Shared implementation of the check `classService.isSignedUrlFresh` and the
 * blogs read path each carry their own copy of.
 */
export function isSignedUrlFresh(url: string | null): boolean {
  if (!url) return true;
  const expiresMatch = url.match(/X-Amz-Expires=(\d+)/);
  const dateMatch = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/);
  if (!expiresMatch || !dateMatch) return true;

  const expires = parseInt(expiresMatch[1], 10);
  const dateStr = dateMatch[1];
  const issued = Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(4, 6), 10) - 1,
    parseInt(dateStr.slice(6, 8), 10),
    parseInt(dateStr.slice(9, 11), 10),
    parseInt(dateStr.slice(11, 13), 10),
    parseInt(dateStr.slice(13, 15), 10),
  );
  return Date.now() <= issued + expires * 1000 - 5000; // 5s buffer
}

/**
 * Sign one S3 key, or return null when no usable signed URL can be produced.
 *
 * Null covers an unavailable signer and a thrown signer alike — callers cannot
 * act differently on those — so this never throws.
 *
 * An already-absolute URL is echoed back by the signer too and is therefore
 * indistinguishable from the failure echo, so it also resolves to null. That is
 * intentional: absolute sources keep flowing through the existing client path,
 * where an unconfigured remote host degrades inside a leaf component instead of
 * failing the server render.
 */
async function signS3ImageUrl(keyOrUrl: string): Promise<string | null> {
  try {
    const signed = await getS3ImageUrl(keyOrUrl);
    if (!signed) return null;
    if (signed === keyOrUrl) return null; // signer echoed its input: unusable
    return signed;
  } catch (error) {
    logger.error("Image signing failed", {
      context: CONTEXT,
      data: { error },
    });
    return null;
  }
}

/**
 * Resolve a stable, client-facing URL for a stored S3 key, or null when none
 * can be produced (absent key, or signing unavailable — see signS3ImageUrl).
 *
 * The returned URL is byte-identical across requests until the cache entry
 * expires, which is what lets Next's image optimizer reuse its encoded output
 * instead of re-processing the original on every page view.
 *
 * Redis is used fail-open, as on the class page: any cache fault degrades to
 * live signing rather than an outage. Unsignable results are never cached, so a
 * transient signer failure cannot be pinned in place for the TTL.
 */
export async function getSignedImageUrl(
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;

  const cacheKey = `${SIGNED_URL_CACHE_PREFIX}${key}`;
  // Read and write are guarded separately so a failed write still returns the
  // URL that was just signed, rather than throwing the work away and re-signing.
  const cached = await cacheGet(cacheKey);
  if (cached && isSignedUrlFresh(cached)) return cached;

  const signed = await signS3ImageUrl(key);
  if (signed) await cacheSet(cacheKey, signed);
  return signed;
}

/**
 * Map records onto view items, resolving each record's stored S3 key to a
 * signed URL first. Shared by the content-landing pages, whose cards *are*
 * their photographs.
 *
 * Signing happens here, on the server, rather than in the card. The client path
 * renders nothing until a post-hydration request to /api/s3-signed-url returns,
 * so a page built from cover photos first-paints empty and the layout's
 * `priority` hint has no <img> to preload.
 *
 * The URLs come from this module's cache, not from a fresh signature per render:
 * these routes are dynamic, so signing inline would rotate the query string on
 * every request and defeat the image optimizer's cache, which keys on the full
 * href. Resolution is parallel, so N keys cost one round-trip, and each failure
 * degrades on its own to a null URL.
 *
 * Generic in the record and item types on purpose: it keeps a media service free
 * of any dependency on the UI contract it happens to feed, so the dependency
 * still points from the page into services/ and never back out.
 *
 * @param keyOf Reads the stored S3 key off a record; may yield null/undefined.
 * @param toItem Receives the record and its signed URL, or null when no usable
 * URL could be produced (see getSignedImageUrl). Called with exactly those two
 * arguments, so a mapper may safely take fewer.
 */
export function mapWithSignedImageUrl<TRecord, TItem>(
  records: TRecord[],
  keyOf: (record: TRecord) => string | null | undefined,
  toItem: (record: TRecord, signedUrl: string | null) => TItem,
): Promise<TItem[]> {
  return Promise.all(
    records.map(async (record) =>
      toItem(record, await getSignedImageUrl(keyOf(record))),
    ),
  );
}

/** Cache read, fail-open: a Redis fault reads as a miss, never as an outage. */
async function cacheGet(cacheKey: string): Promise<string | null> {
  try {
    return await redis.get(cacheKey);
  } catch (error) {
    logCacheFault("read", error);
    return null;
  }
}

/** Cache write, fail-open: a Redis fault costs a re-sign next request, nothing more. */
async function cacheSet(cacheKey: string, url: string): Promise<void> {
  try {
    await redis.set(cacheKey, url, "EX", SIGNED_URL_CACHE_TTL_SECONDS);
  } catch (error) {
    logCacheFault("write", error);
  }
}

function logCacheFault(operation: "read" | "write", error: unknown): void {
  logger.error(`Signed image cache ${operation} failed; continuing uncached`, {
    context: CONTEXT,
    data: { error },
  });
}
