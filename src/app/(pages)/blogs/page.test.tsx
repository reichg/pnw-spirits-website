import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getS3ImageUrl, redisMock, routerReplace } = vi.hoisted(() => ({
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
  routerReplace: vi.fn(),
}));

// Mocked at the s3 and Redis primitives rather than at the signing service, so
// the page's real resolution path — cache read, null-on-failure guard, cache
// write — runs in every case.
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// The archive's search control is a leaf client component calling useRouter,
// which throws outside a mounted App Router tree. Mocked at the router so the
// real control still renders into the page's controls slot.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

import BlogsArchivePage from "./page";
import { ARCHIVE_PAGE_SIZE } from "@/utils/contentArchive";
import { MAX_SEARCH_LENGTH } from "@/utils/pagination";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `fetchArchiveBlogs` is module-private and deliberately stays that way. It is
// reachable anyway: the page is an async server component whose only prop is a
// `searchParams` promise, so it can be awaited directly and its returned element
// rendered with renderToStaticMarkup. Every assertion below therefore runs
// through the real public entry point with a stubbed global `fetch` — no
// production code was changed or exported to make this testable.
//
// Deliberately parallel to recipes/page.test.tsx. The two archives are the same
// page over a different domain, and the adapters they share were previously one
// copy per route that drifted apart; keeping the test files parallel is what
// makes a difference between them visible rather than plausible. The videos
// archive is the one that genuinely differs, and its file says how.
//
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts). Cover photos are signed on the
// server, so the whole tree — imagery included — renders here. What static
// render cannot show is the search control's interactive behavior (debounce,
// navigation); that gap is documented in ContentArchiveSearch.test.tsx.
//
// Rows are counted by their <h2> titles, which only ContentRow emits. No
// assertion depends on a CSS-module class name: they are hashed and are not a
// contract.

type BlogPayload = {
  id: number;
  title: string;
  author: string;
  excerpt?: string;
  coverPhoto?: string | null;
  createdAt?: string;
};

function blog(id: number, title: string): BlogPayload {
  return {
    id,
    title,
    author: `Author ${id}`,
    excerpt: `Summary ${id}`,
    coverPhoto: `blogs/${id}.jpg`,
    createdAt: "2026-01-02T12:00:00.000Z",
  };
}

/** A full page of rows, so page-sized behavior is visible. */
const FULL_PAGE = Array.from({ length: ARCHIVE_PAGE_SIZE }, (_, index) =>
  blog(index + 1, `Article ${index + 1}`),
);

/**
 * The distinguishing half of the no-content empty message, chosen to avoid the
 * apostrophe in "aren't": React escapes it to &#x27; in static markup, so an
 * assertion spelling it literally never matches — and the NEGATIVE assertions
 * below would then pass for free, which is exactly the failure they exist to
 * catch.
 */
const NO_CONTENT_COPY = "any articles yet. Check back soon";

/** Shaped like a real presigned URL, including the params the signer adds. */
function signedUrlFor(key: string): string {
  return `https://pnw-spirits.s3.us-west-1.amazonaws.com/${key}?X-Amz-Expires=3600&X-Amz-Signature=abc`;
}

type FetchCall = { url: string; init?: RequestInit };

let calls: FetchCall[];

/**
 * Replaces global fetch with a stub resolving to the minimal slice of `Response`
 * the page touches, and records the calls it receives.
 */
function stubFetch(response: {
  ok: boolean;
  json: () => Promise<unknown>;
}): void {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  });
}

/** Stubs the blogs endpoint with a list and the archive-wide total. */
function stubBlogs(blogs: BlogPayload[], total = blogs.length): void {
  stubFetch({ ok: true, json: async () => ({ blogs, total }) });
}

/** Replaces global fetch with a stub that fails the way a network error does. */
function stubFetchRejecting(): void {
  vi.stubGlobal("fetch", (url: string) => {
    calls.push({ url });
    return Promise.reject(new Error("network down"));
  });
}

/** Renders the page for a given `?` query string, e.g. { page: "2", q: "gin" }. */
async function renderPage(
  params: Record<string, string | string[] | undefined> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await BlogsArchivePage({ searchParams: Promise.resolve(params) }),
  );
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** The `search` value the page actually sent to the API on its only call. */
function searchParamSent(): string | null {
  return new URL(calls[0].url).searchParams.get("search");
}

/**
 * The decoded query string of the first rendered href containing `marker`, so an
 * emitted URL can be parsed back into params rather than string-matched. HTML
 * entity-escapes `&` inside an attribute, which has to be undone first.
 */
function queryStringOf(html: string, marker: string): string {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const match = hrefs.find((href) => href.includes(marker));
  if (!match) throw new Error(`no href containing "${marker}" was rendered`);
  return match.replaceAll("&amp;", "&").split("?")[1] ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BlogsArchivePage happy path", () => {
  it("renders one row per article, under the archive heading", async () => {
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(ARCHIVE_PAGE_SIZE);
    expect(html).toContain(">All Articles<");
    expect(html).toContain("Article 1");
    expect(html).toContain('href="/blogs/1"');
    expect(html).toContain('aria-label="Read article: Article 1"');
  });

  it("requests the first page at the shared archive page size, uncached", async () => {
    stubBlogs(FULL_PAGE, 47);

    await renderPage();

    // Only the blogs request: cover photos are signed in-process, not fetched.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      `/api/blogs?page=1&pageSize=${ARCHIVE_PAGE_SIZE}`,
    );
    // An archive must not serve a stale cache entry after a publish, and this is
    // also what keeps the route dynamic so `?q=` and `?page=` are honoured.
    expect(calls[0].init).toEqual({ cache: "no-store" });
  });

  it("offers a way back to the landing page", async () => {
    stubBlogs(FULL_PAGE, 47);

    expect(await renderPage()).toContain('href="/blogs-landing"');
  });
});

describe("BlogsArchivePage result count", () => {
  it("counts the whole archive, not the rows on this page", async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. `items.length` would headline
    // "12 articles" above a four-page pager, which is simply false. The number
    // has to be the API's `total`.
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage();

    expect(html).toContain(">47 articles<");
    expect(html).not.toContain(`>${ARCHIVE_PAGE_SIZE} articles<`);
    // And the pager agrees with it: 47 over a page size of 12 is four pages.
    expect(html).toContain("Page 1 of 4");
  });

  it("counts the filtered archive when a search is active", async () => {
    stubBlogs([blog(1, "Gin Notes"), blog(2, "Rye Notes")], 2);

    const html = await renderPage({ q: "notes" });

    expect(html).toContain(`2 articles matching “notes”`);
  });

  it("uses the singular for a single match", async () => {
    // "1 articles" is the failure the noun pair exists to prevent, asserted
    // here against the live page rather than only against the helper.
    stubBlogs([blog(1, "Gin Notes")], 1);

    expect(await renderPage({ q: "gin" })).toContain(
      `1 article matching “gin”`,
    );
  });

  it("states a count of zero when the archive is genuinely empty", async () => {
    // A SUCCESSFUL fetch of an empty archive: the count is known, and it is
    // zero. Contrast the failure-contract tests below, where the fetch failed
    // and the count is unknown — those assert no count at all. The two cases
    // look contradictory side by side and are not: one states a fact, the other
    // declines to state one it does not have.
    stubBlogs([], 0);

    expect(await renderPage()).toContain(">0 articles<");
  });

  it("states no count when the API omits a total", async () => {
    // A missing `total` becomes NaN, which both totalPagesFor and
    // archiveResultCount drop rather than rendering verbatim.
    stubFetch({ ok: true, json: async () => ({ blogs: FULL_PAGE }) });

    const html = await renderPage();

    expect(html).not.toContain("NaN");
    expect(countTags(html, "h2")).toBe(ARCHIVE_PAGE_SIZE);
  });
});

describe("BlogsArchivePage URL contract", () => {
  it("sends the requested page through to the API", async () => {
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage({ page: "3" });

    expect(calls[0].url).toContain("page=3");
    expect(html).toContain("Page 3 of 4");
  });

  it("falls back to page 1 for a page number that is not a whole page", async () => {
    stubBlogs(FULL_PAGE, 47);

    await renderPage({ page: "-2" });

    expect(calls[0].url).toContain("page=1");
  });

  it("translates the URL's `q` into the API's `search`", async () => {
    // A real seam: the archive spells its term `q` in the address bar and
    // /api/blogs spells the same thing `search`. The translation happens on this
    // page and nowhere else, so nothing else can pin it.
    stubBlogs([blog(1, "Gin Notes")], 1);

    await renderPage({ q: "gin" });

    expect(searchParamSent()).toBe("gin");
    expect(calls[0].url).not.toContain("q=gin");
  });

  it("sends no search param for an unfiltered archive", async () => {
    stubBlogs(FULL_PAGE, 47);

    await renderPage();

    expect(searchParamSent()).toBeNull();
  });

  it("trims the term before searching and before showing it", async () => {
    stubBlogs([blog(1, "Gin Notes")], 1);

    const html = await renderPage({ q: "  gin  " });

    expect(searchParamSent()).toBe("gin");
    expect(html).toContain(`1 article matching “gin”`);
  });

  it("searches and displays the same bounded term for an over-long query", async () => {
    // The load-bearing one. `?q=` is bounded once, in parseArchiveQuery, so the
    // term rendered into the header is character-for-character the term the API
    // was asked to filter on.
    const raw = "g".repeat(MAX_SEARCH_LENGTH + 50);
    stubBlogs([], 0);

    const html = await renderPage({ q: raw });

    const sent = searchParamSent();
    expect(sent).toHaveLength(MAX_SEARCH_LENGTH);
    expect(html).toContain(sent);
    expect(html).not.toContain(raw);
  });

  it("ignores a repeated param rather than guessing which one was meant", async () => {
    stubBlogs(FULL_PAGE, 47);

    await renderPage({ page: ["2", "5"], q: ["gin", "rye"] });

    expect(calls[0].url).toContain("page=1");
    expect(searchParamSent()).toBeNull();
  });

  it("carries the search term across a page change", async () => {
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage({ q: "gin", page: "2" });

    expect(html).toContain('href="/blogs?q=gin"');
    expect(html).toContain('href="/blogs?q=gin&amp;page=3"');
  });

  it("re-encodes a term that would otherwise break out of its slot", async () => {
    // Asserted against a result set large enough to page, because the pager's
    // hrefs are the only place the term is re-encoded into a URL: a zero-result
    // search renders no pager, and the clear-search link is term-free by design.
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage({ q: "gin & tonic" });

    expect(searchParamSent()).toBe("gin & tonic");
    expect(html).toContain("q=gin+%26+tonic");
    expect(html).not.toContain("q=gin & tonic");
    expect(new URLSearchParams(queryStringOf(html, "page=2")).get("q")).toBe(
      "gin & tonic",
    );
  });

  it("escapes a term on its way into the page rather than trusting it", async () => {
    stubBlogs([], 0);

    const html = await renderPage({ q: '<img src=x onerror="alert(1)">' });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("BlogsArchivePage empty states", () => {
  it("says the archive is empty when nothing is published", async () => {
    stubBlogs([], 0);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(0);
    expect(html).toContain(NO_CONTENT_COPY);
  });

  it("says the search matched nothing, never that the archive is empty", async () => {
    // A reader who searched "gin" and got nothing must be told the search
    // matched nothing. Being told the journal is empty, when it holds 47
    // articles, is the failure the ordering inside archiveEmptyState prevents.
    stubBlogs([], 0);

    const html = await renderPage({ q: "gin" });

    // The term is stated once, in the header, rather than twice: the body copy
    // no longer quotes it back.
    expect(html).toContain(`0 articles matching “gin”`);
    expect(html).toContain(
      "Nothing in the journal matches that search. Try a shorter one, or clear it to read everything.",
    );
    expect(html).not.toContain(NO_CONTENT_COPY);
    // Exactly once, which is the point of dropping it from the body.
    expect(countOccurrences(html, "“gin”")).toBe(1);
  });

  it("offers a way to clear a search that matched nothing", async () => {
    stubBlogs([], 0);

    const html = await renderPage({ q: "gin" });

    expect(html).toContain("Clear search");
    // Back to the canonical page-one URL, with no leftover params.
    expect(html).toContain('href="/blogs"');
  });

  it("offers no clear-search link when there is no search to clear", async () => {
    stubBlogs(FULL_PAGE, 47);

    expect(await renderPage()).not.toContain("Clear search");
  });

  it("reports a page past the end, and clamps the pager back into range", async () => {
    stubBlogs([], 47);

    const html = await renderPage({ page: "999" });

    expect(countTags(html, "h2")).toBe(0);
    expect(html).toContain("That page is past the end of the journal.");
    expect(html).toContain("Page 4 of 4");
    expect(html).toContain('href="/blogs?page=3"');
  });
});

describe("BlogsArchivePage failure contract", () => {
  // Each case below would otherwise be a 500 on a public read. The contract is
  // that all of them degrade to the empty state with the page's own header, its
  // back link and its search control still rendered.

  it("degrades to the empty state when the request rejects", async () => {
    stubFetchRejecting();

    expectUsableEmptyPage(await renderPage());
  });

  it("degrades to the empty state on a non-ok response, without parsing it", async () => {
    const json = vi.fn(async () => ({ blogs: FULL_PAGE, total: 47 }));
    stubFetch({ ok: false, json });

    expectUsableEmptyPage(await renderPage());
    // The `!res.ok` guard must short-circuit: parsing an error body and using
    // whatever it contains is the regression this pins down.
    expect(json).not.toHaveBeenCalled();
  });

  it("degrades to the empty state when the body cannot be parsed", async () => {
    stubFetch({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    expectUsableEmptyPage(await renderPage());
  });

  it("degrades to the empty state when the payload has no blogs key", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expectUsableEmptyPage(await renderPage());
  });

  it("degrades to the empty state when blogs is null", async () => {
    stubFetch({ ok: true, json: async () => ({ blogs: null }) });

    expectUsableEmptyPage(await renderPage());
  });
});

describe("BlogsArchivePage server-rendered imagery", () => {
  it("signs each stored cover photo on the server, once per article", async () => {
    stubBlogs(FULL_PAGE, 47);

    await renderPage();

    expect(getS3ImageUrl).toHaveBeenCalledTimes(ARCHIVE_PAGE_SIZE);
    expect(getS3ImageUrl).toHaveBeenCalledWith("blogs/1.jpg");
  });

  it("never sends a missing cover photo to the signer", async () => {
    stubBlogs(
      [blog(1, "Signed"), { ...blog(2, "Unsigned"), coverPhoto: null }],
      2,
    );

    await renderPage();

    expect(getS3ImageUrl).toHaveBeenCalledTimes(1);
    expect(getS3ImageUrl).toHaveBeenCalledWith("blogs/1.jpg");
  });

  it("emits a real <img> per signed cover photo in the server response", async () => {
    // The regression this guards: cover photos used to resolve in a client
    // effect, so the SSR HTML of a photographic archive contained no <img> at
    // all and the layout's LCP hint had nothing to preload.
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(ARCHIVE_PAGE_SIZE);
    expect(html).toContain(encodeURIComponent(signedUrlFor("blogs/1.jpg")));
    expect(html).toContain("/_next/image?url=");
  });

  it("preloads the first row's image only", async () => {
    stubBlogs(FULL_PAGE, 47);

    const html = await renderPage();

    expect(html.split('rel="preload"').length - 1).toBe(1);
    expect(html.split('loading="lazy"').length - 1).toBe(ARCHIVE_PAGE_SIZE - 1);
  });

  it("keeps every row when signing is unavailable", async () => {
    // The signer echoes its input back when the AWS env vars are missing. That
    // raw key is not a URL, and emitting it as an image src throws "Failed to
    // parse src" and fails the whole render.
    stubBlogs(FULL_PAGE, 47);
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(ARCHIVE_PAGE_SIZE);
    expect(countTags(html, "img")).toBe(0);
    expect(html).toContain('href="/blogs/1"');
  });
});

describe("BlogsArchivePage row content", () => {
  it("renders the byline and the date in slots of their own", async () => {
    // The difference from the card, asserted on a live page: an article carries
    // both an author and a date, and the row has somewhere to put each. The card
    // has one secondary line and would have to choose.
    stubBlogs([blog(1, "Gin Notes")], 1);

    const html = await renderPage();

    expect(html).toContain("By Author 1");
    expect(html).toContain(">January 2, 2026</time>");
    expect(html).toMatch(/datetime="2026-01-02T12:00:00\.000Z"/i);
  });

  it("omits the date for an entry whose stored timestamp is unusable", async () => {
    // The route caches whole payloads as JSON, so an entry written before a
    // field existed can arrive without it. An absent date must omit the element
    // rather than render an invalid one — Intl throws a RangeError on an invalid
    // date, which would fail the whole render.
    stubBlogs([{ ...blog(1, "Undated"), createdAt: undefined }], 1);

    const html = await renderPage();

    expect(html).toContain("Undated");
    expect(html).not.toContain("<time");
  });
});

/**
 * The shared failure contract: no rows, but the page is still a usable archive
 * page rather than a blank or an error — its heading, its way back, and the
 * control that could recover it are all still there.
 */
function expectUsableEmptyPage(html: string): void {
  expect(countTags(html, "h2")).toBe(0);
  expect(html).toContain("<h1");
  expect(html).toContain(">All Articles<");
  expect(html).toContain('href="/blogs-landing"');
  expect(html).toContain('role="search"');
  expect(html).toContain(NO_CONTENT_COPY);
}
