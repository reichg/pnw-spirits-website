import styles from "./Pagination.module.css";

interface PaginationProps {
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages (>= 1). The pager renders nothing when this is <= 1. */
  totalPages: number;
  /** Called with the clamped target page when the user activates Previous/Next. */
  onPageChange: (page: number) => void;
}

// Shared, fully controlled page navigator. Holds no internal state so it can be
// driven by either server-backed paging (blog list) or client-side paging
// (classes), with the parent owning the current page. Presentational only: it
// reports the clamped target page back through onPageChange and never fetches.
export default function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps): React.ReactNode {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={styles.pagination}>
      <button
        type="button"
        className={styles.pageButton}
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Previous
      </button>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className={styles.pageButton}
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Next
      </button>
    </nav>
  );
}
