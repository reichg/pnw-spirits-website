import Link from "next/link";
import styles from "./Pagination.module.css";

interface PaginationBaseProps {
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages (>= 1). The pager renders nothing when this is <= 1. */
  totalPages: number;
}

/**
 * Two mutually exclusive modes.
 *
 * Callback mode drives client-side paging over an already-fetched array (the
 * admin blog list). Link mode drives URL-driven paging on the content archives,
 * where the page number is part of the address: those pages are server
 * components with no handlers to give, and a real link is also what makes a page
 * of the archive shareable, crawlable and openable in a new tab.
 *
 * Spelled as a union of whole object types rather than `base & (a | b)` so
 * TypeScript narrows the props object on `hrefForPage` at the use site. The
 * `?: never` on each variant's opposite is what makes passing both a compile
 * error instead of a silent question of precedence.
 */
type PaginationProps =
  | (PaginationBaseProps & {
      /** Called with the clamped target page when the user activates Previous/Next. */
      onPageChange: (page: number) => void;
      hrefForPage?: never;
    })
  | (PaginationBaseProps & {
      /** Href for the clamped target page. Receives a page in [1, totalPages]. */
      hrefForPage: (page: number) => string;
      onPageChange?: never;
    });

// Shared, fully controlled page navigator. Holds no internal state so it can be
// driven by either server-backed paging (the archives) or client-side paging
// (admin lists), with the parent owning the current page. Presentational only:
// it reports the clamped target page back through onPageChange, or names it in
// an href, and never fetches.
//
// Free of "use client" and of any server-only import on purpose: one file has to
// render inside a client component and inside a server component alike.
export default function Pagination(props: PaginationProps): React.ReactNode {
  const { page, totalPages } = props;
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={styles.pagination}>
      <PageControl
        pager={props}
        label="Previous page"
        target={Math.max(1, page - 1)}
        available={page > 1}
      >
        Previous
      </PageControl>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages}
      </span>
      <PageControl
        pager={props}
        label="Next page"
        target={Math.min(totalPages, page + 1)}
        available={page < totalPages}
      >
        Next
      </PageControl>
    </nav>
  );
}

/**
 * One Previous/Next control, rendered in whichever mode the pager was given.
 *
 * Takes the whole props object rather than the two handlers separately so the
 * union narrowing survives the hop into here.
 */
function PageControl({
  pager,
  label,
  target,
  available,
  children,
}: {
  pager: PaginationProps;
  /** Accessible name, identical in both modes. */
  label: string;
  /** The page this control navigates to, already clamped to [1, totalPages]. */
  target: number;
  /** False at a boundary: page 1 for Previous, the last page for Next. */
  available: boolean;
  children: React.ReactNode;
}): React.ReactNode {
  if (pager.hrefForPage) {
    // There is no such thing as a disabled anchor: one without an href is not
    // focusable and one with an href is always followable. So a boundary renders
    // a non-interactive element that keeps the control's shape, its name and its
    // place in the row. `role="link"` is what lets a <span> carry an aria-label
    // at all - a bare span has no role that supports naming - and aria-disabled
    // is how a screen reader hears "there is no previous page" rather than
    // hearing nothing where a control used to be.
    return available ? (
      <Link
        // Not prefetched: an archive page is a dynamic, uncached fetch, and
        // prefetching both neighbours of every pager on the page would cost a
        // full render server-side for a link most readers never follow.
        prefetch={false}
        href={pager.hrefForPage(target)}
        className={styles.pageButton}
        aria-label={label}
      >
        {children}
      </Link>
    ) : (
      <span
        className={`${styles.pageButton} ${styles.pageButtonDisabled}`}
        role="link"
        aria-disabled="true"
        aria-label={label}
      >
        {children}
      </span>
    );
  }

  const { onPageChange } = pager;
  return (
    <button
      type="button"
      className={styles.pageButton}
      aria-label={label}
      disabled={!available}
      onClick={() => onPageChange(target)}
    >
      {children}
    </button>
  );
}
