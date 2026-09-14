import Image from "next/image";
import Link from "next/link";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import type { ContentRowProps } from "./content.types";
import styles from "./ContentRow.module.css";

// Matches ContentCard's CARD_IMAGE_QUALITY rather than importing it: that value
// is a module-private const in a sibling component, and next.config.ts
// `images.qualities` is the source of truth for which values the optimizer will
// accept at all - an undeclared quality is a hard 400, not a silent downgrade.
// S3CardBackgroundImage already carries the same literal for the same reason.
const ROW_IMAGE_QUALITY = 85;

// The row's media column is the one place in this system where a real `sizes`
// is worth stating instead of falling back to `fill`'s 100vw. A landing page
// renders three plates and over-serving costs one wasted fetch; an archive page
// renders twelve.
//
// THESE FIGURES ARE THE SOURCE WIDTH THE BOX NEEDS, NOT THE BOX WIDTH, and the
// difference is a real defect this once had. The plate is square and the image
// is `object-fit: cover`, so the source is scaled until its SHORT axis fills
// the box: a landscape source has to arrive wider than the box or it is
// upscaled. Declaring the box width (160px) made the browser pick a 160px-wide
// candidate, and measured served sources came back `natural: [160,120]` on
// /videos (4:3, 1.33x upscale) and `[160,106]` on /recipes (3:2, 1.51x) -
// visibly soft at 1x and twice as soft on a 2x display. Portrait sources were
// unaffected, which is why it did not show everywhere.
//
// So every figure is the box multiplied by 1.5, the widest ratio this library
// holds (the S3 covers are 2:3 portrait and 3:2 landscape; YouTube's hqdefault
// is 4:3, inside it). The widest box at >=600px is the 10rem ceiling, so
// 160 x 1.5 = 240px covers the single-column archives, the narrower two-up
// column on /videos and the whole 600-899 band alike.
//
// NO `vw` UNIT ANYWHERE IN THIS STRING, and the two mobile clauses are px for
// that reason alone rather than for accuracy. next/image parses `sizes` for vw
// tokens and, if it finds any, builds the srcset from `deviceSizes` filtered to
// `>= 640 * smallestRatio` - so ONE vw figure sets the floor for every
// breakpoint, not just its own. A first attempt at this fix wrote the phone
// case honestly as `150vw` and measured the consequence: the srcset collapsed
// to `1080w 1200w 1920w 2048w 3840w`, and a 148px plate on a 1440px desktop
// fetched `w=1080`. All-px keeps the full candidate list, so the browser picks
// 256w for a 240px hint and 640w for a 640px one.
//
// The two phone steps bound the stacked plate, which is the container width:
// at most 360px at a 400px viewport (needs 540 -> 640w) and at most 539px at
// 599px (needs 809 -> 828w).
const ROW_IMAGE_SIZES =
  "(max-width: 400px) 640px, (max-width: 599px) 828px, 240px";

/**
 * Domain-agnostic archive row: a media-leading index entry that opens on a
 * hairline carrying its own date and category.
 *
 * A sibling of ContentCard rather than a variant of it. The two share an item
 * contract and a measurement (--row-media-col), not a composition: the card is
 * a grid cell whose photograph is the object, and the row is a list entry whose
 * photograph is the left margin. They also differ in the things a variant flag
 * could not express - the row has no resting veil, no entrance stagger, and no
 * straddling kicker badge, because it has no seam for one to straddle.
 *
 * Server component, and that is load-bearing rather than incidental: archive
 * cover photos are signed on the server, so this must render a real <img> in
 * the server response. Any future state belongs in a new leaf client component
 * below this one, never by flipping this file.
 */
export default function ContentRow({
  item,
  priority = false,
}: ContentRowProps): React.ReactNode {
  const alt = `Cover image for ${item.title}`;
  const isExternal = item.link.kind === "external";

  const media =
    item.media.kind === "s3" ? (
      <S3CardBackgroundImage
        s3Key={item.media.key}
        alt={alt}
        className={styles.rowImage}
        priority={priority}
        sizes={ROW_IMAGE_SIZES}
      />
    ) : (
      <Image
        src={item.media.src}
        alt={alt}
        fill
        sizes={ROW_IMAGE_SIZES}
        quality={ROW_IMAGE_QUALITY}
        className={styles.rowImage}
        priority={priority}
        loading={priority ? undefined : "lazy"}
      />
    );

  // The metadata rule renders inside the anchor, so the whole row - rule
  // included - is one link target rather than a rule sitting between two of
  // them. The link's accessible name still comes from item.ariaLabel, which is
  // why a date tracked at 0.12em uppercase is not read out letter by letter.
  const body = (
    <>
      <div className={styles.rule}>
        {item.timestamp ? (
          <time className={styles.date} dateTime={item.timestamp.iso}>
            {item.timestamp.label}
          </time>
        ) : null}
        {/* margin-inline-start: auto rather than justify-content: space-between,
            so the kicker still sits at the right end of the rule on a row whose
            source carried no usable date.

            The glyph is the row's only VISIBLE signal that it leaves the site.
            Every /videos row opens youtube.com in a new tab; the accessible name
            already says so ("Watch video on YouTube: ...") and the anchor
            already carries target/rel, but a sighted reader had nothing - the
            kicker reads "Video", not "YouTube". Decoration to assistive
            technology, which would otherwise announce the destination twice.

            It rides inside the kicker rather than beside it so the two read as
            one mark at the rule's right end, and the whole group is rendered
            whenever EITHER exists, so an external row with no category still
            gets its signal. Changing the kicker copy itself would be the better
            fix and is not available from here: it is set by the adapter in
            src/utils/contentItems.ts. */}
        {item.kicker || isExternal ? (
          <span className={styles.kicker}>
            {item.kicker}
            {isExternal ? (
              <span className={styles.external} aria-hidden="true">
                &#8599;
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className={styles.media}>{media}</div>
      <div className={styles.content}>
        {/* The inner span is load-bearing: the underline wipe is painted on an
            inline box so it fragments per line and each line is underlined at
            its own width. See .titleText in ContentRow.module.css. */}
        <h2 className={styles.title}>
          <span className={styles.titleText}>{item.title}</span>
        </h2>
        {item.excerpt ? <p className={styles.excerpt}>{item.excerpt}</p> : null}
        {/* Only when there is a byline. The card falls back to the timestamp
            label here because it has a single secondary line; the row already
            placed the date on its rule, so falling back would print the same
            date twice. A video legitimately has no byline and reserves no
            space for one. */}
        {item.meta ? <p className={styles.meta}>{item.meta}</p> : null}
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a
        className={styles.row}
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
      className={styles.row}
      href={item.link.href}
      aria-label={item.ariaLabel}
      prefetch={false}
    >
      {body}
    </Link>
  );
}
