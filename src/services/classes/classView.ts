/**
 * Cross-layer view contract for the Cocktail Classes page.
 *
 * This module defines the shared, server-to-client shape of an album photo and
 * the full class page payload. The contract is: the backend service signs each
 * photo's S3 key into `url` and caches the signed result in Redis; the client
 * (`PhotoAlbum`) consumes `url` directly and performs NO client-side signing.
 *
 * Type-only module: no runtime logic. Every layer (service, page server
 * component, carousel component) imports these types so the signed-URL contract
 * stays consistent across the client/server boundary.
 */
import type { CocktailClass, ClassSession } from "../../../generated/prisma";

/**
 * A single album photo as seen by the client. `url` is the server-signed S3
 * URL; it is `null` when signing is unavailable. The raw `s3Key` never crosses
 * to the client.
 */
export type ClassPhotoView = {
  id: number;
  url: string | null;
  caption: string | null;
};

/**
 * The full /classes page payload returned by the backend service and consumed
 * by the page server component. Photos carry server-signed URLs (no raw keys).
 */
export type ClassPageView = {
  class: CocktailClass | null;
  sessions: ClassSession[];
  photos: ClassPhotoView[];
};
