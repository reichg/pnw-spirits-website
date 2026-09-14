"use client";

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

  if (!url) return null;

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
    />
  );
}
