import type { AdminEmptyStateProps } from "./admin.types";
import styles from "./AdminEmptyState.module.css";

/**
 * The "nothing here yet" line for an empty list.
 *
 * A separate primitive from AdminStatus rather than an `info`-toned one, and
 * the difference is not cosmetic: an empty state describes what the page
 * CONTAINS, while a status reports what just HAPPENED. Rendering this into a
 * live region would announce a fact the reader is about to encounter anyway.
 *
 * It serves every reason a list has no rows - nothing created yet, nothing
 * matched the search, a page number past the end, and a failed read - because
 * all of them are the same event for the reader. The screen supplies the
 * wording that distinguishes them.
 *
 * The span is load-bearing: the composed rule caps the MEASURE on a child, so
 * the block keeps the full spine width and starts on the same left edge as the
 * heading and the rules above it. Capping the block itself would either centre
 * the measure or pull it into the gutter.
 */
export default function AdminEmptyState({
  message,
}: AdminEmptyStateProps): React.ReactNode {
  return (
    <div className={styles.emptyMessage}>
      <span>{message}</span>
    </div>
  );
}
