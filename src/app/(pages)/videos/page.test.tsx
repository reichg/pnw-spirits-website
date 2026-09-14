import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getS3ImageUrl, redisMock } = vi.hoisted(() => ({
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Mocked so that a regression which STARTED signing on this page would be
// visible as a call on these, rather than silently reaching a real signer.
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import VideosArchivePage from "./page";
import { ARCHIVE_PAGE_SIZE } from "@/utils/contentArchive";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `fetchArchiveVideos` is module-private and deliberately stays that way. It is
// reachable anyway: the page is an async server component whose only prop is a
// `searchParams` promise, so it can be awaited directly and its returned element
// rendered with renderToStaticMarkup. Every assertion below therefore runs
// through the real public entry point with a stubbed global `fetch` — no
// production code was changed or exported to make this testable.
//
// THIS IS THE ARCHIVE THAT DIFFERS FROM THE OTHER TWO, and the differences are
// asserted rather than assumed:
//
//   1. No search. /api/videos pages a cached YouTube response and has no search
//      capability, so the page renders no search control, sends no `search`
//      param, and can never reach the "no-results" empty state.
//   2. No signing. YouTube hands back absolute thumbnail URLs, so there is no
//      stored S3 key to sign; the mapping is synchronous and the signer must
//      never be called. That also makes this the only archive whose imagery is
//      fully observable under static render with no signing stub at all.
//   3. Two different numbers. This route sends BOTH `total` (the size of the
//      whole channel listing) and `totalPages` (the count of pages over it),
//      where the other two send only the former. The header counts videos and so
//      reads `total`; reading `totalPages` there would headline "5 videos" above
//      five pages of twelve.
//
// It is also the archive whose empty state is the NORMAL local case: /api/videos
// answers 400 whenever the YouTube key or channel id is absent, so the degraded
// path below is what a developer sees every day, not a rare failure.
//
// Rows are counted by their <h2> titles, which only ContentRow emits. No
// assertion depends on a CSS-module class name: they are hashed and are not a
// contract.

type VideoPayload = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

function video(id: string, title: string): VideoPayload {
  return {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    publishedAt: "2026-03-04T09:30:00.000Z",
  };
}

/** A full page of rows, so page-sized behavior is visible. */
const FULL_PAGE = Array.from({ length: ARCHIVE_PAGE_SIZE }, (_, index) =>
  video(`v${index + 1}`, `Video ${index + 1}`),
);

/**
 * The distinguishing half of the no-content empty message, chosen to avoid the
 * apostrophe in "aren't": React escapes it to &#x27; in static markup, so an
 * assertion spelling it literally never matches — and the NEGATIVE assertions
 * below would then pass for free.
 */
const NO_CONTENT_COPY = "any videos yet. Check back soon";

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

/**
 * Stubs the videos endpoint the way the real route answers: a page of videos,
 * the channel-wide `total`, and a separately computed `totalPages`.
 */
function stubVideos(
  videos: VideoPayload[],
  total = videos.length,
  totalPages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE)),
): void {
  stubFetch({ ok: true, json: async () => ({ videos, total, totalPages }) });
}

/** Renders the page for a given `?` query string, e.g. { page: "2" }. */
async function renderPage(
  params: Record<string, string | string[] | undefined> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await VideosArchivePage({ searchParams: Promise.resolve(params) }),
  );
}

/**
 * The `columns` this page passes to the layout. Named rather than spelled 2 at
 * each assertion so the preload expectations below read as a consequence of the
 * grid rather than as two unexplained magic numbers.
 */
const VIDEOS_COLUMNS = 2;

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** Every href the page rendered, so navigation URLs can be checked on their own. */
function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VideosArchivePage happy path", () => {
  it("renders one row per video, under the archive heading", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(ARCHIVE_PAGE_SIZE);
    expect(html).toContain(">All Videos<");
    expect(html).toContain("Video 1");
    expect(html).toContain('aria-label="Watch video on YouTube: Video 1"');
  });

  it("requests the first page at the shared archive page size, uncached", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    await renderPage();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      `/api/videos?page=1&pageSize=${ARCHIVE_PAGE_SIZE}`,
    );
    expect(calls[0].init).toEqual({ cache: "no-store" });
  });

  it("opens each row on YouTube in a new tab, opener-safe", async () => {
    // The only archive whose rows leave the site, and the only place the
    // external-link branch of ContentRow is exercised against a live page.
    stubVideos([video("v1", "Shaking vs. Stirring")], 1, 1);

    const html = await renderPage();

    expect(html).toContain('href="https://www.youtube.com/watch?v=v1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // The destination is named before activation, not after.
    expect(html).toContain("Watch video on YouTube:");
  });

  it("offers a way back to the landing page", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    expect(await renderPage()).toContain('href="/videos-landing"');
  });
});

describe("VideosArchivePage has no search", () => {
  it("renders no search control at all", async () => {
    // The archive has no search capability, and a search box that filtered only
    // the page already in hand would search a twelfth of the channel.
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    expect(html).not.toContain('role="search"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Clear search");
  });

  it("sends no search param, even when the URL carries one", async () => {
    // `?q=` on this archive is meaningless and must not reach the API, which
    // would neither understand it nor filter by it.
    stubVideos(FULL_PAGE, 47, 4);

    await renderPage({ q: "gin" });

    expect(new URL(calls[0].url).searchParams.get("search")).toBeNull();
    expect(calls[0].url).not.toContain("gin");
  });

  it("never claims a search matched nothing", async () => {
    // The "no-results" state is unreachable here, so an empty archive must say
    // it is empty even when the URL carries a stray `?q=`.
    stubVideos([], 0, 1);

    const html = await renderPage({ q: "gin" });

    expect(html).toContain(NO_CONTENT_COPY);
    expect(html).not.toContain("matching");
    expect(html).not.toContain("gin");
  });
});

describe("VideosArchivePage result count", () => {
  it("counts the whole channel, not the rows on this page", async () => {
    // THE REGRESSION THIS FILE EXISTS FOR, in the form specific to this route:
    // `total` and `totalPages` are different numbers here, and the header must
    // read the former. Stubbed with values that cannot be confused — 47 videos
    // across 4 pages of 12 — so reading the wrong one fails loudly.
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    expect(html).toContain(">47 videos<");
    expect(html).not.toContain(">4 videos<");
    expect(html).not.toContain(`>${ARCHIVE_PAGE_SIZE} videos<`);
    expect(html).toContain("Page 1 of 4");
  });

  it("pages by the API's own totalPages rather than deriving one", async () => {
    // This route computes its own page count over the cached channel listing,
    // so the page takes it rather than recomputing from `total` as the other two
    // archives must. Stubbed inconsistently on purpose: the API is the authority.
    stubVideos(FULL_PAGE, 47, 9);

    const html = await renderPage();

    expect(html).toContain("Page 1 of 9");
    expect(html).toContain(">47 videos<");
  });

  it("falls back to a single page when the API omits totalPages", async () => {
    stubFetch({
      ok: true,
      json: async () => ({ videos: FULL_PAGE, total: 12 }),
    });

    const html = await renderPage();

    expect(html).not.toContain("<nav");
    expect(html).toContain(">12 videos<");
  });

  it("states a count of zero when the channel is genuinely empty", async () => {
    // A SUCCESSFUL fetch of an empty channel: the count is known, and it is
    // zero. Contrast the failure-contract tests below, which stub a FAILED
    // fetch and assert no count at all — on this archive that distinction is
    // the sharpest, because an absent YouTube key is the everyday local case
    // and "0 videos" there would state an empty channel the reader could not
    // tell apart from a real one. The two blocks sit adjacent and look
    // contradictory; they are not, and the fixtures are the difference.
    stubVideos([], 0, 1);

    expect(await renderPage()).toContain(">0 videos<");
  });

  it("uses the singular for a channel holding one video", async () => {
    stubVideos([video("v1", "Only")], 1, 1);

    const html = await renderPage();

    expect(html).toContain(">1 video<");
    expect(html).not.toContain(">1 videos<");
  });
});

describe("VideosArchivePage URL contract", () => {
  it("sends the requested page through to the API", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage({ page: "3" });

    expect(calls[0].url).toContain("page=3");
    expect(html).toContain("Page 3 of 4");
  });

  it("falls back to page 1 for a page number that is not a whole page", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    await renderPage({ page: "abc" });

    expect(calls[0].url).toContain("page=1");
  });

  it("builds pager hrefs with no search term to carry", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage({ page: "2" });

    // Page one is spelled as the bare path, not as ?page=1.
    expect(html).toContain('href="/videos"');
    expect(html).toContain('href="/videos?page=3"');
    // Checked against the hrefs alone rather than the whole document: next/image
    // puts its own `q=` quality param in every srcSet, which a document-wide
    // assertion would match and which has nothing to do with the search term.
    for (const href of hrefsIn(html)) {
      expect(href).not.toContain("q=");
    }
  });

  it("reports a page past the end, and clamps the pager back into range", async () => {
    stubVideos([], 47, 4);

    const html = await renderPage({ page: "999" });

    expect(countTags(html, "h2")).toBe(0);
    expect(html).toContain("That page is past the end of the channel.");
    expect(html).toContain("Page 4 of 4");
    expect(html).toContain('href="/videos?page=3"');
  });
});

describe("VideosArchivePage failure contract", () => {
  // Each case below would otherwise be a 500 on a public read.

  it("degrades to the empty state on the 400 an unconfigured YouTube key returns", async () => {
    // The normal local case, not an exotic failure: /api/videos answers 400
    // whenever the YouTube key or channel id is absent. A developer with no key
    // must get an archive page that says the channel is empty, never a crash.
    const json = vi.fn(async () => ({
      error: "Missing YouTube configuration",
    }));
    stubFetch({ ok: false, json });

    expectUsableEmptyPage(await renderPage());
    // The `!res.ok` guard short-circuits: the error body is never parsed, so
    // `{ error: ... }` cannot be mistaken for a payload.
    expect(json).not.toHaveBeenCalled();
  });

  it("degrades to the empty state on the 502 an upstream YouTube failure returns", async () => {
    stubFetch({
      ok: false,
      json: async () => ({ error: "Failed to fetch videos" }),
    });

    expectUsableEmptyPage(await renderPage());
  });

  it("degrades to the empty state when the request rejects", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    expectUsableEmptyPage(await renderPage());
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

  it("degrades to the empty state when the payload has no videos key", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expectUsableEmptyPage(await renderPage());
  });

  it("degrades to the empty state when videos is null", async () => {
    stubFetch({ ok: true, json: async () => ({ videos: null }) });

    expectUsableEmptyPage(await renderPage());
  });
});

describe("VideosArchivePage unsigned imagery", () => {
  it("signs nothing, because a YouTube thumbnail is already absolute", async () => {
    // The difference from the other two archives, asserted rather than assumed.
    // Routing these through the signing service would add a Redis round-trip per
    // row — twelve per view — for a key that does not exist.
    stubVideos(FULL_PAGE, 47, 4);

    await renderPage();

    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("emits a real <img> per video straight from the YouTube URL", async () => {
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(ARCHIVE_PAGE_SIZE);
    expect(html).toContain(
      encodeURIComponent("https://i.ytimg.com/vi/v1/hqdefault.jpg"),
    );
  });

  it("renders a row with no image rather than throwing when a snippet had none", async () => {
    // /api/videos falls back to "" when a snippet carries no thumbnail at all.
    // An empty `src` makes next/image throw "Failed to parse src" and takes the
    // whole server render down, so the adapter routes the empty case away from
    // the url branch. This is the assertion that it still does.
    stubVideos([{ ...video("v1", "No Thumbnail"), thumbnail: "" }], 1, 1);

    const html = await renderPage();

    expect(html).toContain("No Thumbnail");
    expect(countTags(html, "img")).toBe(0);
    expect(html).toContain('href="https://www.youtube.com/watch?v=v1"');
  });

  it("preloads the first line's two images and lazy-loads the rest", async () => {
    // This archive is the two-up one, so its LCP candidate is a line rather than
    // a row: the layout derives priority from `index < columns` and this page
    // passes columns={2}. An earlier version of this test asserted a single
    // preload, which after the grid landed was asserting the exact LCP
    // regression the change removed — the second above-the-fold image being
    // lazy-loaded. Counts verified against the actual render, not derived.
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    expect(countOccurrences(html, 'rel="preload"')).toBe(VIDEOS_COLUMNS);
    expect(countOccurrences(html, 'loading="lazy"')).toBe(
      ARCHIVE_PAGE_SIZE - VIDEOS_COLUMNS,
    );
  });

  it("preloads the first two videos specifically, not any two", async () => {
    // The count alone would pass if priority landed on the wrong pair. The
    // preload links are hoisted ahead of the tree, so the images named in them
    // are the ones the browser is told to fetch eagerly.
    stubVideos(FULL_PAGE, 47, 4);

    const html = await renderPage();

    const preloads = html.slice(0, html.indexOf("<main"));
    for (const id of ["v1", "v2"]) {
      expect(preloads).toContain(
        encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
      );
    }
    expect(preloads).not.toContain(
      encodeURIComponent("https://i.ytimg.com/vi/v3/hqdefault.jpg"),
    );
  });
});

describe("VideosArchivePage row content", () => {
  it("puts the published date on the rule and leaves the byline slot empty", async () => {
    // A video has a date and no author. The row has a slot for each, so unlike
    // the card it never falls back to printing the date as a byline — which
    // would print the same date twice on one row.
    stubVideos([video("v1", "Shaking vs. Stirring")], 1, 1);

    const html = await renderPage();

    expect(html).toContain(">March 4, 2026</time>");
    expect(html).toMatch(/datetime="2026-03-04T09:30:00\.000Z"/i);
    // Exactly once, and no byline paragraph beside it.
    expect(html.split("March 4, 2026").length - 1).toBe(1);
    expect(html).not.toContain("By ");
  });

  it("formats the date in a fixed locale and zone, not the host's", async () => {
    // A bare toLocaleDateString formats against the host, so one entry renders a
    // different date depending on where the server runs — and the attribute and
    // the text beside it can disagree by a day. Pinned here because this is the
    // archive whose dates come from an upstream UTC instant.
    stubVideos(
      [{ ...video("v1", "Late"), publishedAt: "2026-07-06T05:36:00.000Z" }],
      1,
      1,
    );

    const html = await renderPage();

    expect(html).toContain(">July 6, 2026</time>");
  });
});

/**
 * The shared failure contract: no rows, but the page is still a usable archive
 * page rather than a blank or an error. Unlike the other two archives there is
 * no search control to assert, because this one has none.
 */
function expectUsableEmptyPage(html: string): void {
  expect(countTags(html, "h2")).toBe(0);
  expect(html).toContain("<h1");
  expect(html).toContain(">All Videos<");
  expect(html).toContain('href="/videos-landing"');
  expect(html).toContain(NO_CONTENT_COPY);
  // No pager under an empty archive, and no count above it.
  expect(html).not.toContain("<nav");
  expect(html).not.toContain("videos<");
}
