import Image from "next/image";
import Link from "next/link";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import type { ContentCardProps } from "./ContentLanding.types";
import styles from "./ContentCard.module.css";

// Cover photography is the largest surface on the page and the thing that sells
// the click, so it is served above next/image's default 75. 85 is the ceiling
// declared in next.config.ts `images.qualities`; an undeclared value is a hard
// 400 from the optimizer rather than a silent downgrade, so this must not be
// raised here alone. Past ~85 WebP adds bytes without adding visible detail.
const CARD_IMAGE_QUALITY = 85;

// Domain-agnostic content card. Generic by design: it carries no knowledge of
// recipes, blogs or videos. Its only two branches are on media transport
// (s3 vs. direct URL) and on link intent (internal vs. external), both of
// which the caller states explicitly so nothing is inferred from an href.
//
// Server component on purpose. The client boundary stays where it already is,
// at S3CardBackgroundImage, which is "use client" only because it resolves a
// signed URL. If a future card needs client state, it must arrive as a new
// leaf client component below this one, not by flipping this file.
export default function ContentCard({
  item,
  priority = false,
}: ContentCardProps): React.ReactNode {
  const alt = `Cover image for ${item.title}`;

  const media =
    item.media.kind === "s3" ? (
      <S3CardBackgroundImage
        s3Key={item.media.key}
        alt={alt}
        className={styles.cardImage}
        priority={priority}
      />
    ) : (
      <Image
        src={item.media.src}
        alt={alt}
        fill
        // Deliberately over-serves instead of deriving per-breakpoint widths:
        // this is exactly what `fill` falls back to when `sizes` is omitted.
        // Dev warns that 100vw exceeds the render box; that warning is the
        // accepted cost of never re-deriving this, not a bug to fix.
        sizes="100vw"
        quality={CARD_IMAGE_QUALITY}
        className={styles.cardImage}
        priority={priority}
        loading={priority ? undefined : "lazy"}
      />
    );

  // Reading order matches visual order: title, summary, then the byline that
  // is pinned to the foot of the card body.
  const body = (
    <>
      <div className={styles.media}>{media}</div>
      <div className={styles.content}>
        {item.kicker ? (
          <span className={styles.kicker}>{item.kicker}</span>
        ) : null}
        {/* The inner span is load-bearing, not a wrapper for its own sake: the
            hover/focus underline is painted on it so that an inline box
            fragments per line and each line is underlined at its own width.
            See .titleText in ContentCard.module.css. */}
        <h2 className={styles.title}>
          <span className={styles.titleText}>{item.title}</span>
        </h2>
        {item.excerpt ? <p className={styles.excerpt}>{item.excerpt}</p> : null}
        <p className={styles.meta}>{item.meta}</p>
      </div>
    </>
  );

  if (item.link.kind === "external") {
    return (
      <a
        className={styles.card}
        href={item.link.href}
        aria-label={item.ariaLabel}
        target="_blank"
        rel="noopener noreferrer"
      >
        {body}
      </a>
    );
  }

  return (
    <Link
      className={styles.card}
      href={item.link.href}
      aria-label={item.ariaLabel}
      prefetch={false}
    >
      {body}
    </Link>
  );
}
