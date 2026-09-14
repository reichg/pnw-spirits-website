"use client";

import { useState } from "react";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Image from "next/image";

// Matches ContentCard's CARD_IMAGE_QUALITY rather than importing it: this module
// is "use client", so its exports become client references in the server graph
// and a shared value cannot travel in either direction without a third, neutral
// module. next.config.ts `images.qualities` is the source of truth for the
// allowed values; 85 must appear there or the optimizer answers 400.
const CARD_IMAGE_QUALITY = 85;

// The card call sites all render a full-bleed plate, so 100vw is both their
// honest hint and what `fill` falls back to when `sizes` is omitted; they pass
// nothing and keep it. The prop exists for the one call site that is NOT a
// card: the recipe detail page's lead cover is capped at 26rem by its own
// stylesheet, and inheriting 100vw there fetched a source roughly three times
// the box it renders into. A default rather than a required prop so the three
// card call sites are unchanged and a fourth cannot be broken by adding this.
type S3CardBackgroundImageProps = {
  s3Key?: string | null;
  alt: string;
  className: string;
  priority?: boolean;
  sizes?: string;
};

/** What `fill` resolves to on its own, kept as the default for card plates. */
const DEFAULT_SIZES = "100vw";

export default function S3CardBackgroundImage({
  s3Key,
  alt,
  className,
  priority = false,
  sizes = DEFAULT_SIZES,
}: S3CardBackgroundImageProps) {
  const { url } = useS3ImageUrl(s3Key);

  /**
   * THE URL THAT FAILED TO LOAD, not a boolean "it failed".
   *
   * The state this guards: a key whose object is no longer in the bucket -
   * deleted out of band, or a demo row seeded against an empty bucket - still
   * signs successfully, so `url` is a perfectly good URL that 404s. The browser
   * then paints its broken-image glyph, which in a list of photographs reads as
   * "this tool is broken" rather than the true and much quieter "this
   * photograph is gone".
   *
   * Holding the URL rather than a flag is what makes the retry free.
   * `useS3ImageUrl` re-signs every nine minutes and hands back a NEW url, so
   * the comparison below stops matching on its own and the image gets another
   * attempt - no effect to reset a flag, and no way for a stale flag to outlive
   * the key it was about. A boolean would need `useEffect(() => setFailed(false),
   * [url])`, which is a second source of truth for the same fact.
   */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // One return for both no-image states. There is no second "failed" rendering
  // to design: every call site already draws its own plate behind this image
  // for the case where the record has no cover at all, and a record whose cover
  // is GONE wants that same plate, not a different one. See AdminCard's
  // .mediaImage::after for the CSS half of this, which covers Chromium and
  // Firefox only and which this supersedes on every browser.
  if (!url || url === failedUrl) return null;

  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      quality={CARD_IMAGE_QUALITY}
      className={className}
      priority={priority}
      loading={priority ? undefined : "lazy"}
      onError={() => setFailedUrl(url)}
    />
  );
}
