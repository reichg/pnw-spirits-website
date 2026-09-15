/**
 * The URL contract for the three content archives (`/blogs`, `/recipes`,
 * `/videos`), plus a re-export of the page-count helper they share with the
 * rest of the app.
 *
 * Deliberately pure, and dependent on no module but `@/utils/pagination`. The
 * same functions are read by the async server pages, by the pagination control
 * and by the leaf client search component, so anything server-only pulled in
 * here would be dragged into the client bundle by that last consumer. It is also
 * what makes the module directly unit-testable in this repo's node test
 * environment, which has no DOM.
 *
 * Note the seam these names sit on: the archives spell their search term `q` in
 * the address bar, while /api/blogs and /api/recipes spell the same thing
 * `search`. Each page translates once, at its fetch call.
 */

import { MAX_SEARCH_LENGTH } from "@/utils/pagination";

/** URL param carrying the 1-based page number. */
export const ARCHIVE_PAGE_PARAM = "page";

/** URL param carrying the search term. */
export const ARCHIVE_QUERY_PARAM = "q";

/**
 * Rows per archive page, for all three archives.
 *
 * One value, not three: the deleted client lists carried 10 / 10 / 9 for no
 * reason anyone recorded, and the archives now share a row layout, so three
 * page sizes would only mean three different scroll lengths.
 */
export const ARCHIVE_PAGE_SIZE = 12;

/**
 * The page an archive URL asks for, or 1 for anything that is not a whole page
 * number: absent, empty, zero, negative, fractional, unparseable, out of safe
 * integer range, or repeated (`?page=2&page=5` arrives as an array, and there
 * is no defensible way to pick one of the two).
 *
 * `searchParams` is user input; every value that reaches a fetch or an href goes
 * through here or {@link parseArchiveQuery} first.
 */
export function parseArchivePage(value: string | string[] | undefined): number {
  if (typeof value !== "string") return 1;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1) return 1;
  return page;
}

/**
 * The search term an archive URL asks for, trimmed and bounded, or "" when
 * absent or repeated.
 *
 * Bounded to the same `MAX_SEARCH_LENGTH` the list routes apply before they
 * filter and cache, and bounded here so that it is bounded once: this is the
 * only door `?q=` comes through, and every consumer downstream of it - the
 * `search` param sent to the API, the term rendered into the header count, the
 * term rendered into the empty message, the value put back into the search
 * field - then shows and searches the same string the API actually filtered on.
 * Truncating at each of those sites instead would be four copies of one rule,
 * and missing one of them renders an unbounded query param into the page.
 */
export function parseArchiveQuery(
  value: string | string[] | undefined,
): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

/**
 * The canonical URL for one state of an archive.
 *
 * Page one and an empty search are expressed by omitting their params, so each
 * archive state has exactly one spelling: `/recipes`, not `/recipes?page=1&q=`.
 *
 * Every URL in this feature is built here - the pager's Previous/Next hrefs, the
 * search control's navigation target and the empty state's clear-search link -
 * so no two of them can disagree about a param name or about which URL is page
 * one. Encoding is `URLSearchParams`, never concatenation: the search term is
 * user input and may contain `&`, `#` or a space.
 */
export function buildArchiveHref(
  basePath: string,
  params: { page?: number; query?: string },
): string {
  const search = new URLSearchParams();
  const query = params.query?.trim() ?? "";
  if (query) search.set(ARCHIVE_QUERY_PARAM, query);
  const page = params.page ?? 1;
  if (Number.isSafeInteger(page) && page > 1) {
    search.set(ARCHIVE_PAGE_PARAM, String(page));
  }
  const queryString = search.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Page count for a total, always >= 1. Defined in `@/utils/pagination` because
 * the admin lists and the client paging hook need the same formula and have no
 * business importing an archive-URL module; re-exported here so an archive page
 * names all of its paging concerns in one import.
 */
export { totalPagesFor } from "@/utils/pagination";

/** Why an archive has no rows to show. */
export type ArchiveEmptyState =
  /** The archive itself has nothing published. */
  | "no-content"
  /** A search ran and matched nothing. */
  | "no-results"
  /** The requested page is past the last one. */
  | "page-out-of-range";

/**
 * Which empty state an archive is in, so all three pages word their own copy
 * against the same decision instead of each re-deriving it.
 *
 * The search case is tested first on purpose: a user who searched "gin" and got
 * nothing must be told that the search matched nothing, never that the archive
 * is empty.
 */
export function archiveEmptyState(params: {
  /** The parsed `q` term; always "" for an archive with no search. */
  query: string;
  /** The page the URL asked for, before it was clamped for display. */
  requestedPage: number;
  /** Page count the API implies for the current filter (>= 1). */
  totalPages: number;
}): ArchiveEmptyState {
  if (params.query !== "") return "no-results";
  if (params.requestedPage > params.totalPages) return "page-out-of-range";
  return "no-content";
}

/** The thing an archive counts, in both the forms the sentence needs. */
export type ArchiveNoun = {
  /** Written for exactly one, e.g. "recipe". */
  singular: string;
  /** Written for any other count, e.g. "recipes". */
  plural: string;
};

/**
 * The archive header's inventory line, e.g. "47 recipes",
 * "3 recipes matching “gin”" or "0 recipes matching “gin”".
 *
 * Counts the whole filtered archive, never the current page: `items.length`
 * would render "12 videos" above a five-page pager, which is simply false. The
 * number therefore has to be the API's `total`, which already reports the
 * filtered count when a search is active - and the filtered count is the honest
 * one to show, because it is what the pager is paging through.
 *
 * Zero renders as a count rather than being omitted, and the no-results empty
 * message names no term of its own. The two are a pair, and neither half works
 * alone: the count is a stacked sibling below 600px, so omitting it shortens the
 * header and shifts the search field, the rule and every row beneath it upward
 * the moment a search stops matching - mid-keystroke, while the user is still
 * typing. Stating the term in both places instead would say it twice. So the
 * header carries the fact and the body carries the advice; they sit far enough
 * apart, with the page's loudest rule between them, not to read as a repetition.
 *
 * Undefined only for a total the API did not send as a usable count: absent
 * (`Number(undefined)` is NaN), fractional, or negative. "NaN recipes" across a
 * page header is a worse failure than a missing line.
 *
 * Both forms of the noun are supplied rather than an "s" being appended here: a
 * rule spelled once in a shared helper is a rule that will meet an irregular
 * plural eventually, and "1 recipes" is the failure this function exists to
 * prevent.
 *
 * The term is interpolated as it arrives from `parseArchiveQuery`, which has
 * already trimmed and bounded it, so the term shown is character-for-character
 * the term that was actually searched and an absurd `?q=` cannot push a page of
 * text through the header. The result is rendered by the layout as an ordinary
 * React text child and so is escaped; it must never reach
 * `dangerouslySetInnerHTML`.
 */
export function archiveResultCount(params: {
  /** Total matching entries across every page, from the API's `total`. */
  total: number;
  noun: ArchiveNoun;
  /** The active search term, or "" when the archive is unfiltered. */
  query: string;
}): string | undefined {
  const { total, noun, query } = params;
  if (!Number.isSafeInteger(total) || total < 0) return undefined;
  const counted = `${total} ${total === 1 ? noun.singular : noun.plural}`;
  if (query === "") return counted;
  return `${counted} matching “${query}”`;
}
