import Link from "next/link";
import type { CSSProperties } from "react";
import ContentRow from "./ContentRow";
import Pagination from "./Pagination";
import type { ContentArchiveLayoutProps } from "./content.types";
import styles from "./ContentArchiveLayout.module.css";

/**
 * Shared shell for the three content archives (`/blogs`, `/recipes`,
 * `/videos`). Sibling of ContentLandingLayout: same ground, same spine, same
 * tokens, a different page.
 *
 * Presentational and server-only. It fetches nothing, holds no state, and takes
 * its copy, its already-adapted items and its page math from the page. That is
 * what keeps cover photos signed on the server and rendered as real <img> in
 * the server response; the one stateful control an archive has - the search
 * field - arrives through `controls` as a leaf client component, below this
 * boundary rather than through it.
 *
 * It also carries no domain knowledge: `resultCount` arrives already worded and
 * `hrefForPage` already knows the URL shape, so this file never learns what a
 * recipe is or how the archive spells its search param.
 */
export default function ContentArchiveLayout({
  columns = 1,
  backLink,
  heading,
  resultCount,
  items,
  emptyMessage,
  controls,
  page,
  totalPages,
  hrefForPage,
  className,
}: ContentArchiveLayoutProps): React.ReactNode {
  return (
    <main className={[styles.root, className].filter(Boolean).join(" ")}>
      <header className={styles.header}>
        {backLink ? (
          <p className={styles.backRow}>
            <Link className={styles.backLink} href={backLink.href}>
              {/* Decoration, not content: the accessible name stays the bare
                  section title, so the link is announced as "Recipes" rather
                  than as "left arrow Recipes". */}
              <span className={styles.backArrow} aria-hidden="true">
                &larr;
              </span>
              {backLink.label}
            </Link>
          </p>
        ) : null}
        <h1 className={styles.heading}>{heading}</h1>
        {/* One shared baseline under the title: the inventory statement at the
            left of the spine, the controls at its right. The landing header
            leaves its right side deliberately empty; the archive is the page
            that earns the right to fill it, and only with the control that
            operates the list below. */}
        {resultCount || controls ? (
          <div className={styles.headerFoot}>
            {resultCount ? (
              <p className={styles.resultCount}>{resultCount}</p>
            ) : null}
            {controls ? (
              <div className={styles.controls}>{controls}</div>
            ) : null}
          </div>
        ) : null}
      </header>

      {items.length > 0 ? (
        <div
          className={styles.list}
          // The grid reads this; see .list in ContentArchiveLayout.module.css.
          // Written here rather than declared on a page class because the same
          // number decides which rows are preloaded two lines below, and a
          // custom property is invisible to the server render. An inline style
          // is also the one declaration that cannot lose an emission-order
          // contest - the objection recorded against declaring
          // --card-media-ratio in two places is about two CLASS rules on one
          // element at equal specificity, and the style attribute is a
          // higher-precedence origin than either.
          style={{ "--archive-columns": columns } as CSSProperties}
        >
          {items.map((item, index) => (
            <ContentRow
              key={item.id}
              item={item}
              // The page does not know render order; the layout does. Preload
              // exactly the first LINE, not the first item: at two per line both
              // of the first two rows are above the fold and either can be the
              // LCP element, so preloading only index 0 left an LCP candidate on
              // loading="lazy". Everything past the first line stays lazy, which
              // is the original rule and still the reason it exists - twelve
              // preloads would compete with the LCP for the same bandwidth.
              //
              // Not viewport-aware, and cannot be: `priority` is decided during
              // the server render, while the column count is a media query. A
              // two-up page therefore preloads two images at 390px as well,
              // where the second is at the fold rather than above it. That is
              // one extra thumbnail fetch on the one page that opts in, and the
              // alternative - resolving the column count on the client - would
              // move this boundary into the browser and stop the cover images
              // server-rendering as real <img>, which is the whole reason this
              // component is not a client component.
              priority={index < columns}
            />
          ))}
        </div>
      ) : (
        /* Empty, and every other state that leaves the list without rows, is a
           lede on the page ground - the same treatment ContentLandingLayout
           uses, verbatim. No panel, no spinner, no skeleton and no error
           colour: a skeleton would draw twelve grey card shapes on a page whose
           thesis is that there are no card shapes, and --color-error is a
           red-orange inside the copper family that reads as an accent here
           rather than as an alarm. The page owns the wording, including whether
           the reason is "nothing published" or "nothing matched". */
        <div className={styles.emptyMessage}>
          <span>{emptyMessage}</span>
        </div>
      )}

      {/* The pager renders nothing at one page, so the row that brackets it must
          not render either - an empty ruled band under a short archive reads as
          a broken footer. */}
      {totalPages > 1 ? (
        <div className={styles.pagerRow}>
          <Pagination
            page={page}
            totalPages={totalPages}
            hrefForPage={hrefForPage}
          />
        </div>
      ) : null}
    </main>
  );
}
