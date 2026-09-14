import Link from "next/link";
import ContentCard from "./ContentCard";
import type { ContentLandingLayoutProps } from "./ContentLanding.types";
import styles from "./ContentLandingLayout.module.css";

// Shared shell for the three content-landing pages. Presentational and
// server-only: it fetches nothing, holds no state, and takes its copy and its
// already-adapted items from the page. Pages differ only in their copy, their
// optional root class, and the --card-media-ratio that class may set.
export default function ContentLandingLayout({
  eyebrow,
  heading,
  intro,
  items,
  emptyMessage,
  viewAllHref,
  viewAllLabel,
  className,
}: ContentLandingLayoutProps): React.ReactNode {
  return (
    <main className={[styles.root, className].filter(Boolean).join(" ")}>
      <header className={styles.header}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.heading}>{heading}</h1>
        {intro ? <p className={styles.intro}>{intro}</p> : null}
      </header>

      {items.length > 0 ? (
        <div className={styles.grid}>
          {items.map((item, index) => (
            <ContentCard
              key={item.id}
              item={item}
              // The page does not know render order; the layout does. Index 0
              // only: the first card's image is the LCP element, and extra
              // preloads would compete with it for the same bandwidth.
              priority={index === 0}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyMessage}>
          <span>{emptyMessage}</span>
        </div>
      )}

      <div className={styles.viewAllRow}>
        {/* One element, not a <button> inside a <Link>: interactive content is
            not permitted inside an anchor, and the nesting left the control's
            role and accessible name up to each browser's error recovery. */}
        <Link href={viewAllHref} className={styles.viewAllButton}>
          {viewAllLabel}
        </Link>
      </div>
    </main>
  );
}
