import { useCallback, useEffect, useRef, useState } from "react";

import { totalPagesFor } from "@/utils/pagination";
import {
  readAdminError,
  useAdminFetch,
  type AdminFetch,
} from "./useAdminFetch";

/**
 * One paged, searchable, reloadable read for the admin record screens.
 *
 * The seam between the two lists is the DATA, not the screen. The blogs list and
 * the recipes list render different cards, open different editors, word their
 * own empty states and delete through different endpoints - a shared
 * `<AdminRecordListScreen>` would need two render props and six more to stay
 * honest. What they genuinely share is everything below: the query the endpoint
 * expects, the response envelope it answers with, the four pieces of state a
 * list is ever in, and the page clamp.
 *
 * ENDPOINT CONTRACT. The endpoint accepts `page`, `pageSize` and `search` as
 * query params and answers `{ <rows>, total, page, pageSize }`. `/api/blogs` and
 * `/api/recipes` both do; both parse their half of it through
 * `@/utils/pagination`, which is the other end of this contract.
 *
 * WRITES ARE NOT HERE. A create, an edit and a delete each belong to the screen
 * that owns the confirm dialog, the busy flag and the record-specific wording,
 * and they differ between the two screens in all three. The hook's part in a
 * write is `reload()`.
 */

/**
 * Pulls the rows out of a response body.
 *
 * A selector rather than a `key: string` option. A bare key cannot be related to
 * `T` by the type system - any string type-checks and a typo degrades silently
 * to an empty list - and the two keys (`blogs`, `recipes`) have nothing in
 * common but their position in the envelope. The selector is also the one place
 * an `unknown` body becomes `T[]` without proof, which is worth having in a
 * named, reviewed spot rather than inline on each screen.
 */
export type AdminListSelect<T> = (payload: unknown) => T[];

/**
 * The selector for the common case: rows under a top-level key.
 *
 * Exists so the `Array.isArray` guard is written once. A body that is not an
 * object, or whose key is missing or not an array, yields `[]` rather than
 * reaching `.map()` in a render - the shape a route returns on an error it
 * answered 200 to, or a response from a future version of the API.
 *
 * Call it at module scope, not inline in a render: it allocates a new function
 * each call, and while the hook is built to tolerate that (see `selectRef`), a
 * stable selector is free.
 */
export function rowsAtKey<T>(key: string): AdminListSelect<T> {
  return (payload) => {
    if (typeof payload !== "object" || payload === null) return [];
    const rows = (payload as Record<string, unknown>)[key];
    return Array.isArray(rows) ? (rows as T[]) : [];
  };
}

export type AdminListOptions<T> = {
  /** Collection endpoint with no query string, e.g. `/api/blogs`. */
  endpoint: string;
  /**
   * Rows per page. Sent explicitly even when it matches the route's own default
   * so the two cannot drift apart silently: the count line, the pager and the
   * clamp are all derived from this number on the client, and the route slices
   * by the one it receives.
   */
  pageSize: number;
  select: AdminListSelect<T>;
  /**
   * Shown when the read fails and the server offered no safe message of its own.
   * Prose for the empty slot, so it should read as a sentence to someone who was
   * expecting a list.
   */
  loadFailedMessage: string;
};

export type AdminListRequest<T> = AdminListOptions<T> & {
  page: number;
  search: string;
};

/**
 * A settled read. A union rather than `{ items, total, error }` so the two
 * outcomes cannot be half-applied: a failed read must clear the rows and the
 * total, which is what stops a stale page from sitting under an error message.
 */
export type AdminListResult<T> =
  | { ok: true; items: T[]; total: number }
  | { ok: false; error: string };

/**
 * The `?page=&pageSize=&search=` query the list routes parse.
 *
 * `URLSearchParams` rather than a template literal: the search term is user
 * input, and a term containing `&`, `#` or `=` concatenated raw would be read by
 * the route as extra parameters. Encoding is the point, not tidiness.
 *
 * An empty term is omitted rather than sent as `search=`. Both are equivalent to
 * the route (`searchParam` trims to "" either way), but the omission keeps the
 * unfiltered request byte-identical to the one the archives send, and so on the
 * same Redis cache key.
 */
export function adminListQuery(
  page: number,
  pageSize: number,
  search: string,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set("search", search);
  return params.toString();
}

/**
 * The page a list should actually be on, given what the server just reported.
 *
 * Deleting the last record on the last page leaves the admin on a page that no
 * longer exists: an empty grid, a count line reading "0 of 40 posts" and a pager
 * whose only way back is Previous. Clamping to the last page that does exist is
 * what closes that.
 *
 * Never returns 0 - `totalPagesFor` floors at 1 - so an emptied collection lands
 * on page 1 rather than on a page number no pager can render.
 */
export function clampedPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  const lastPage = totalPagesFor(total, pageSize);
  return page > lastPage ? lastPage : page;
}

/** Reads the envelope's `total`. A missing or non-numeric one is 0, which
 *  `totalPagesFor` and `formatRecordCount` both already degrade gracefully on. */
function totalFrom(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const total = (payload as { total?: unknown }).total;
  return typeof total === "number" ? total : 0;
}

/**
 * One read, as a plain async function. NEVER THROWS: every failure - a dead
 * network, a non-JSON body, a route answering 500, a selector that trips over an
 * unexpected shape - comes back as `{ ok: false }`. The hook depends on that to
 * clear `loading` without a `finally`, and a screen stuck at `loading: true`
 * renders nothing at all.
 *
 * A rejected status is read through `readAdminError`, which surfaces the
 * server's own message only when it looks like one of ours (single line, <= 200
 * chars) and otherwise substitutes `loadFailedMessage`. A 401/403 additionally
 * ends the session inside `adminFetch`; `AdminAuthGate` owns the redirect from
 * there, so there is nothing to do about it here.
 */
export async function fetchAdminListPage<T>(
  adminFetch: AdminFetch,
  request: AdminListRequest<T>,
): Promise<AdminListResult<T>> {
  const { endpoint, page, pageSize, search, select, loadFailedMessage } =
    request;
  try {
    const query = adminListQuery(page, pageSize, search);
    const res = await adminFetch(`${endpoint}?${query}`);
    if (!res.ok) {
      return { ok: false, error: await readAdminError(res, loadFailedMessage) };
    }
    const payload: unknown = await res.json();
    return { ok: true, items: select(payload), total: totalFrom(payload) };
  } catch {
    return { ok: false, error: loadFailedMessage };
  }
}

export type AdminList<T> = {
  items: T[];
  total: number;
  /** Always >= 1. The pager renders nothing at 1. */
  totalPages: number;
  page: number;
  /** Stable. Pass straight to `Pagination.onPageChange`. */
  setPage: (page: number) => void;
  /** The term the list is filtered by - not what is being typed. */
  search: string;
  /**
   * Commit a search term. Stable, which `AdminSearchField.onSearch` REQUIRES: it
   * is a dependency of that component's debounce effect, so a fresh identity
   * each render restarts the timer instead of firing it.
   */
  setSearch: (term: string) => void;
  /** True from the moment a read is armed until it settles. Distinguishes "no
   *  records" from "not fetched yet", which an empty `items` alone cannot. */
  loading: boolean;
  /** A failed READ. Nothing was lost, so screens render it as prose in the empty
   *  slot rather than as an alert. Empty string when the last read succeeded. */
  loadError: string;
  /** Refetch the current page. Stable, and what a screen calls after a write. */
  reload: () => void;
};

export function useAdminList<T>(options: AdminListOptions<T>): AdminList<T> {
  const { endpoint, pageSize, loadFailedMessage } = options;
  const adminFetch = useAdminFetch();

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // A ref rather than an effect dependency. `select` is a pure projection of a
  // body that has already arrived, so its identity is not a reason to re-fetch -
  // and listing it would make an inline `(p) => p.rows` request a new page on
  // every render, forever. The sync effect is declared before the read effect so
  // the ref is current by the time the read is armed on the same commit.
  const selectRef = useRef(options.select);
  useEffect(() => {
    selectRef.current = options.select;
  }, [options.select]);

  useEffect(() => {
    let active = true;
    // Synchronous and intended: screens tell "no records" from "not fetched yet"
    // by this flag, and a deferred one would flash an empty state over a request
    // that is already in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    void (async () => {
      const result = await fetchAdminListPage<T>(adminFetch, {
        endpoint,
        page,
        pageSize,
        search,
        select: selectRef.current,
        loadFailedMessage,
      });
      // Everything below is discarded for a read that has been superseded (a new
      // page, a new term) or unmounted. Checked once, on the settled result,
      // because `fetchAdminListPage` performs no state change of its own.
      if (!active) return;

      if (result.ok) {
        setItems(result.items);
        setTotal(result.total);
        setLoadError("");
        // Re-arms this effect against the page that does exist. The functional
        // form is a no-op re-render when nothing needs clamping, so the common
        // case costs nothing.
        setPage((current) => clampedPage(current, result.total, pageSize));
      } else {
        setItems([]);
        setTotal(0);
        setLoadError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
    // `adminFetch` is memoised on the token, so a token arriving after mount
    // yields a new identity here and replaces an anonymous first load with the
    // authenticated one.
  }, [
    adminFetch,
    endpoint,
    pageSize,
    page,
    search,
    reloadToken,
    loadFailedMessage,
  ]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // Back to page 1 on every new term. Without it a search run from page 7 asks
  // the route for page 7 of a result set that may have one page, and the admin
  // is handed an empty list for a term that matched.
  const setSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setPage(1);
  }, []);

  return {
    items,
    total,
    totalPages: totalPagesFor(total, pageSize),
    page,
    setPage,
    search,
    setSearch,
    loading,
    loadError,
    reload,
  };
}
