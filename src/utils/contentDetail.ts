/**
 * Helpers shared by the content detail pages (`/blogs/[id]`, `/recipes/[id]`).
 *
 * The first three were written twice, once per page, when the two pages were
 * built in parallel - and one of the two copies of `formatDate` carried a real
 * off-by-one-day bug that the other had already fixed, which is exactly what a
 * second copy is for. One declaration site now.
 *
 * Deliberately neutral: no `"use client"`, no React, no Prisma. Both pages are
 * server components and `generateMetadata` runs before either renders.
 */

/**
 * Absolute origin for canonical, Open Graph and JSON-LD URLs.
 *
 * The localhost fallback is for local development only; a deployed build sets
 * NEXT_PUBLIC_SITE_URL. Read at module scope because it is inlined at build
 * time for a NEXT_PUBLIC_ variable either way.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * A stable, crawlable URL for a stored cover photo.
 *
 * Never a signed S3 URL. Crawlers refetch Open Graph and JSON-LD images long
 * after a signature has expired, at which point the image 404s silently and the
 * card renders blank. `/api/media` is unauthenticated and 302s to a freshly
 * signed URL on every request, so the href stays valid indefinitely.
 */
export function stableMediaUrl(key: string): string {
  return absoluteUrl(`/api/media?key=${encodeURIComponent(key)}`);
}

/**
 * A root-relative path resolved against the site's own origin.
 *
 * Every self-referential URL a detail page emits has to be the same string:
 * `alternates.canonical`, `openGraph.url` and the JSON-LD `mainEntityOfPage`
 * all name the page they sit on, and a crawler that sees three spellings of it
 * treats at least two of them as other pages. They are built from the row's own
 * id rather than from the request param for the same reason - the id parse is
 * lenient, so `/blogs/7`, `/blogs/004` and `/blogs/7.9` all resolve to one row
 * and each would otherwise declare itself canonical.
 */
export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

/** The site's name, as it is spelled in a browser tab and a search result. */
export const SITE_NAME = "The PNW Spirits";

/**
 * A document title: the page's own subject, then the site.
 *
 * The suffix was written out at four sites across the two pages - once for each
 * page's real title and once for each page's not-found title - so a rename
 * would have had four chances to be half-applied and the not-found variants,
 * which nobody looks at, would have been the two left behind.
 */
export function pageTitle(subject: string): string {
  return `${subject} | ${SITE_NAME}`;
}

/**
 * A JSON-LD block, serialized for `dangerouslySetInnerHTML`.
 *
 * `<` is escaped because the contents of a `<script>` element are not parsed as
 * markup but ARE terminated by the literal text `</script>`: a stored title
 * containing one would close the block early and hand the rest of the row to
 * the HTML parser as markup, which is stored XSS rather than a broken block.
 * `<` is valid inside a JSON string and parses back to `<`, so the
 * structured data a crawler reads is unchanged.
 *
 * Shared rather than repeated per page because the failure mode of omitting it
 * on the next detail page is invisible - the block renders, validates and
 * looks right until a title contains a tag.
 *
 * The replacement string is a two-character escape in the source (`\\u003c`),
 * which is the six characters `<` at runtime. Written as one backslash it
 * would be the single character `<` and the whole pass would be a no-op that
 * reads identically. `contentDetail.test.ts` pins that distinction.
 */
export function jsonLdHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The human form of a stored timestamp, for the text of a `<time>` element.
 *
 * Explicit locale so the rendered date does not vary with server environment,
 * and explicit UTC so it agrees with the `dateTime` attribute beside it.
 * `dateTime` carries the full ISO instant, which is what a machine reads, and
 * the element's text is supposed to be the human form of that same value.
 * Formatting in the server's local zone breaks that: a post stored at
 * 2026-07-06T05:36Z rendered as "July 5, 2026" on a UTC-7 host, so the
 * attribute and the text disagreed by a day. The landing adapters pin the zone
 * for the same reason and with the same fields.
 */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatDate(value: Date): string {
  return dateFormatter.format(value);
}
