/**
 * Pagination in one place for every pager in the app: the page-count formula the
 * UI reads, and the query-param contract the API routes parse.
 *
 * Its own module rather than a home inside any one feature: the callers are a
 * URL-driven server archive, a client hook slicing an in-memory array, an admin
 * list over a paged API and three route handlers, and they share nothing else.
 * Housed in a feature module, most of them would be importing a file whose
 * subject they have no business knowing about.
 *
 * Pure, and free of server-only imports, because its callers require it: the
 * page-count half is read from server components and client components alike, so
 * anything server-only pulled in here would be dragged into the client bundle.
 * `zod` is the one dependency and is safe on that count - it is isomorphic and
 * declares `sideEffects: false`, so a client importing only `totalPagesFor`
 * tree-shakes the schema half away entirely.
 */

import { z } from "zod";

/**
 * The largest page any route will address, and the largest page size any route
 * will serve.
 *
 * These exist to bound one multiplication. `skip: (page - 1) * pageSize` reaches
 * Prisma and `slice` bounds, and with both factors free to sit near
 * `Number.MAX_SAFE_INTEGER` their product leaves the safe-integer range, which
 * Prisma rejects - a public endpoint turned into a 500 by a query param. Bounded
 * at these values the product cannot exceed 1e8, which is exactly representable
 * and which every sink handles as an ordinary empty page.
 *
 * Both are far above any legitimate caller: the archives request 12 a page and
 * the largest in-app page size is 50 (the YouTube per-request maximum), and no
 * client here pages a million records deep.
 */
export const MAX_PAGE = 1_000_000;
export const MAX_PAGE_SIZE = 100;

/**
 * The longest search term that becomes part of a Redis cache key.
 *
 * An unbounded term is an unbounded key space: one caller can mint arbitrarily
 * many distinct cache entries, each holding a full page of rows, and on
 * /api/blogs each survives an hour. The compounding cost is the reason for the
 * bound rather than the memory itself - both list routes invalidate with
 * `redis.keys("<prefix>:*")`, an O(N) scan that blocks Redis, so an inflated key
 * space makes every admin write progressively slower.
 */
export const MAX_SEARCH_LENGTH = 100;

/**
 * Page count for a total, always >= 1 so no consumer special-cases an empty
 * collection: zero entries still report a single, empty page. That floor is the
 * whole reason this is shared - a pager handed 0 pages is a latent bug that only
 * stays invisible while some other component happens to guard against it.
 *
 * `total` may arrive straight from a JSON body, so a missing or non-numeric one
 * degrades to one page rather than producing the NaN page count a pager would
 * render verbatim. A zero `pageSize` degrades the same way instead of dividing
 * to Infinity.
 */
export function totalPagesFor(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * The `?page=` / `?pageSize=` contract every list route parses, with the default
 * page size each route already served.
 *
 * `.catch()` rather than a 400: an unreadable page number is not worth failing a
 * public read over, and the archives depend on these routes answering with a
 * body they can render. Absent, non-numeric, fractional, zero and negative
 * values all land on the default rather than reaching the sinks, where a NaN
 * used to serialize into the response and fail a Prisma query, and a negative
 * `start` made `slice` count back from the end of the list.
 *
 * `.catch()` then `.transform()`, not `.max()`, for the ceilings: `.max()` is a
 * validation failure, which `.catch()` would turn into the *default* page size,
 * so asking for 200 would silently serve 10 rather than the 100 the caller can
 * actually have. Over-large values clamp; only unreadable ones fall back.
 *
 * Both keys are always present when a route passes `searchParams.get(...)`
 * (which yields `null`, coercing to 0 and being caught), so this cannot throw -
 * load-bearing where the handler has no try/catch around it.
 */
export function paginationParams(defaultPageSize: number) {
  return z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .catch(1)
      .transform((page) => Math.min(page, MAX_PAGE)),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .catch(defaultPageSize)
      .transform((size) => Math.min(size, MAX_PAGE_SIZE)),
  });
}

/**
 * The `?search=` term the list routes filter and cache by, trimmed and bounded.
 *
 * Over-length truncates rather than falling back to "". Falling back would turn
 * a 150-character search into "return everything", which reads as a query that
 * matched the whole collection; truncating searches a prefix instead, and since
 * `contains` on a prefix matches a superset, the results the caller wanted are
 * still among the ones they get. Whitespace-only trims to "" and so disables the
 * filter, rather than searching for spaces and keying the cache on them.
 */
export const searchParam = z
  .string()
  .catch("")
  .transform((term) => term.trim().slice(0, MAX_SEARCH_LENGTH));
