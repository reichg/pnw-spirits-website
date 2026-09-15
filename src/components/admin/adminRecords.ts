/**
 * The three pure helpers every admin *record screen* shares - a screen that
 * lists stored records, pages through them and opens one in an editor.
 *
 * Not a home for anything a single screen needs. Each of these exists because
 * two screens were about to spell the same decision twice and disagree: the
 * blogs list and the recipes list both word an inventory line, both render a
 * created-at column, and both editors read the same fields back out of a
 * localStorage draft that a previous version of the app wrote.
 *
 * Free of React and of any DOM access on purpose, so the count and the date can
 * be asserted directly in a test without a renderer - which is the whole
 * reason the wording lives here rather than inline in the two JSX trees.
 */

/** Placeholder for a stored date that cannot be read. Deliberately a word, not
 *  an em dash: a screen reader announces "Posted, unknown" rather than pausing
 *  at a value it has no way to pronounce. */
const UNREADABLE_DATE = "Unknown";

/**
 * How a record's timestamp is set in a list row.
 *
 * Date only, no clock. The stored value is a full ISO instant and the previous
 * lists rendered `toLocaleString()`, which produces "6/18/2026, 6:20:18 PM" -
 * 22 characters of which four matter to an admin hunting "the old fashioned
 * post I wrote Tuesday". The minute a post was published is never the thing
 * being scanned for, and in an 80px row it competes with the title for the one
 * line of metadata there is room for.
 *
 * Locale is the reader's (`undefined`), not a fixed one: this renders only
 * inside the authenticated client subtree - AdminAuthGate emits "Checking
 * access..." on the server - so there is no server pass to disagree with, and a
 * hardcoded locale would just be wrong for whoever is actually looking.
 */
const RECORD_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

export function formatRecordDate(value: string | null | undefined): string {
  if (!value) return UNREADABLE_DATE;
  const date = new Date(value);
  // `new Date("nonsense")` is an Invalid Date rather than a throw, and
  // `toLocaleDateString` on one returns the literal string "Invalid Date".
  if (Number.isNaN(date.getTime())) return UNREADABLE_DATE;
  return date.toLocaleDateString(undefined, RECORD_DATE_FORMAT);
}

/**
 * The inventory line in the page header's second band: "1-10 of 43 blogs".
 *
 * It answers one question - am I looking at everything? - which is the question
 * a pager alone cannot answer, and it is why this is worth wording carefully
 * rather than deriving at each call site. The noun is required and plural
 * because the count is the subject and "1-10 of 43" alone reads as an
 * unattributed fragment once it is set in the header's tracked micro-caps.
 *
 * An empty collection reports "0 blogs" rather than "0-0 of 0 blogs": the band
 * must stay mounted when the list is empty (it holds the search field that
 * caused the empty state), so this string has to read as a sentence in that
 * state and not as an arithmetic accident.
 *
 * A page past the end reports "0 of 43 blogs" rather than the "21-5 of 5" the
 * naive arithmetic produces. That state is transient - the list clamps the page
 * and refetches - but it renders for one frame after deleting the last record
 * on the last page, and a reversed range is the kind of thing that gets
 * screenshotted.
 */
export function formatRecordCount(
  page: number,
  pageSize: number,
  total: number,
  noun: string,
): string {
  if (!Number.isFinite(total) || total <= 0) return `0 ${noun}`;
  const first = (page - 1) * pageSize + 1;
  if (first > total) return `0 of ${total} ${noun}`;
  const last = Math.min(page * pageSize, total);
  return `${first}–${last} of ${total} ${noun}`;
}

/**
 * Reads one text field out of a stored draft.
 *
 * `useAdminDraft<T>` states plainly that `T` is a compile-time shape only:
 * whatever is in localStorage was written by an earlier, possibly older version
 * of this app, and a caller that cares must validate. Both editors care - they
 * feed these values straight into `useState` and then into `String.prototype`
 * methods when inserting uploaded media at the cursor, so a stored number would
 * survive as a rendered input value and then throw on the first upload.
 *
 * A non-string becomes "" rather than `String(value)`: a draft that cannot be
 * read is a draft that was never usable, and coercing `{}` into "[object
 * Object]" would put that in the editor and then POST it.
 */
export function draftText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
