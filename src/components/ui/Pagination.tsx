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
    //
    // ON FOCUS, WHICH CALLBACK MODE BELOW HAD TO CHANGE AND THIS DOES NOT.
    // A boundary span is not focusable, so reaching one does drop focus - but
    // reaching one here means a NAVIGATION happened, and after a navigation the
    // App Router moves focus to the top of the new document on purpose, so a
    // reader meets the page they asked for rather than its pager. Restoring
    // focus to this row would fight that, would drag a screen-reader user past
    // a whole archive page of content they have not heard, and would need state
    // and an effect in a component that must keep rendering inside a server
    // component. Callback mode has no navigation and no such arbiter, which is
    // why only it changed. The shared part is the principle - a boundary keeps
    // its name, its place and an announced state - and both modes now spell
    // that state `aria-disabled`; only the element differs, because only one of
    // the two has focus worth preserving.
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

  // CALLBACK MODE. A boundary here is `aria-disabled`, NOT `disabled`, and that
  // is the one substantive difference from the version this replaces.
  //
  // `disabled` made the control un-focusable, and paging is exactly the action
  // that reaches a boundary: pressing Next on the second-to-last page disables
  // the button under the admin's own finger, the browser blurs it because a
  // disabled element cannot hold focus, and focus falls to <body>. Measured
  // stable at BODY for >935ms on both admin lists, at both ends of the range.
  // A keyboard admin who paged to the end of the list was then tabbing from the
  // top of the document to get back to it.
  //
  // aria-disabled keeps the control mounted, named, focusable and inert, so
  // focus never moves at all - the least surprising possible outcome, and the
  // only one that needs no guess about where the admin wanted to be. A screen
  // reader announces the state change on the focused element, which is a better
  // answer to "why did nothing happen" than silence from <body>. It also makes
  // the pager a stable two-stop shape at every page instead of a widget that
  // grows and shrinks its tab order as you move through it.
  //
  // The inertness is the same `available` flag that draws the state, so the two
  // cannot disagree: no handler is attached at a boundary, and Enter/Space on a
  // type="button" with no onClick is a no-op.
  //
  // REJECTED: keeping `disabled` and moving focus to the "Page X of Y" status,
  // or to the opposite control. Both are recoveries from a drop that does not
  // have to happen, both need this file to hold a ref and an effect - which
  // means "use client", which link mode cannot have (see above) - and focusing
  // the opposite control puts a reflexive Enter on the one press that silently
  // undoes the admin's own paging.
  const { onPageChange } = pager;
  return (
    <button
      type="button"
      // Both spellings of "unavailable" already share one class in the
      // stylesheet, because link mode has never been able to use :disabled.
      className={
        available
          ? styles.pageButton
          : `${styles.pageButton} ${styles.pageButtonDisabled}`
      }
      aria-label={label}
      aria-disabled={available ? undefined : true}
      onClick={available ? () => onPageChange(target) : undefined}
    >
      {children}
    </button>
  );
}
