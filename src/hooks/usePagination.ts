import { useCallback, useMemo, useState } from "react";

// Client-side pagination for an already-fetched array. Owns page state and
// slicing so presentational pagination UI (a `Pagination` control + a list)
// stays free of paging math. Generic over `T` so it makes no assumption about
// the item shape; its first consumer is the /admin/classes photo list.
//
// Design: the load-bearing invariant is "never surface an out-of-range page or
// an empty slice for a non-empty list when `items` shrinks" (e.g. deleting the
// last photo on the last page drops `totalPages` below the current page). We
// keep the raw page *intent* in state but derive the EFFECTIVE page during
// render via `Math.min(storedPage, totalPages)`. Because the clamp happens in
// render (not in an effect), a shrink is reflected in the same commit: no
// one-frame flash of an empty page, SSR-safe, and no setState-in-effect. The
// stored value may stay stale-high and is harmless, because it is never read
// directly — both the `effectivePage` derivation and `setPage`'s own clamp
// bound it. This is why there is deliberately no `useEffect` "fix-up" here.
export function usePagination<T>(
  items: T[],
  pageSize: number,
): {
  page: number;
  totalPages: number;
  pageItems: T[];
  setPage: (page: number) => void;
} {
  // Always >= 1, so consumers never have to special-case `totalPages === 0`
  // (an empty list still reports a single, empty page).
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const [storedPage, setStoredPage] = useState(1);

  // Pure render-time derivation. Lower bound is already >= 1 because
  // `totalPages >= 1` and `storedPage` is clamped to >= 1 by `setPage`.
  const effectivePage = Math.min(storedPage, totalPages);

  const pageItems = useMemo(
    () => items.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [items, effectivePage, pageSize],
  );

  // Clamp the requested page into [1, totalPages] before committing, and keep
  // the callback stable so it can be passed straight to a `Pagination`'s
  // `onPageChange` and used safely in effect dependency arrays.
  const setPage = useCallback(
    (target: number) => {
      setStoredPage(Math.min(totalPages, Math.max(1, target)));
    },
    [totalPages],
  );

  return { page: effectivePage, totalPages, pageItems, setPage };
}
