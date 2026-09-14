import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { getS3ImageUrl, redisMock } = vi.hoisted(() => ({
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Mocked at the s3 and Redis primitives rather than at the signing service, so
// the page's real resolution path — cache read, null-on-failure guard, cache
// write — runs in every case.
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import BlogsLandingPage from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `fetchLandingBlogs` is module-private and deliberately stays that way. It is
// reachable anyway: the page is an async server component taking no props, so it
// can be awaited directly and its returned element rendered with
// renderToStaticMarkup. Every assertion below therefore runs through the real
// public entry point with a stubbed global `fetch` — no production code was
// changed or exported to make this testable.
//
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts). That costs this page very
// little: it composes ContentLandingLayout, which is server-only, around items
// whose cover photos are signed on the server, so a signed blog emits a real
// <img> under static render — exactly what ships in the SSR HTML. Only the
// *unsigned* fallback stays invisible here, because it defers to
// S3CardBackgroundImage, a client component that resolves its URL in an effect
// that never runs under a static render.
//
// Cards are counted by their <h2> titles, which only ContentCard emits, and by
// their accessible names; images by their tag. CSS-module class names are hashed
// by the transform and are not a contract, so nothing below keys off one.

type BlogPayload = {
  id: number;
  title: string;
  /** Full article body. Present on the wire, and deliberately never rendered. */
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};

function blog(id: number, title: string): BlogPayload {
  return {
    id,
    title,
    content: `Body of ${title}`,
    author: `Author ${id}`,
    createdAt: "2026-01-02T12:00:00.000Z",
    coverPhoto: `blogs/${id}.jpg`,
  };
}

/** One page's worth of blogs: exactly the three the layout's row holds. */
const BLOGS: BlogPayload[] = [
  { ...blog(1, "Spruce Tip Season"), excerpt: "A cozy winter story." },
  blog(2, "Cellar Notes"),
  blog(3, "Barrel Diary"),
];

/** Shaped like a real presigned URL, including the params the signer adds. */
function signedUrlFor(key: string): string {
  return `https://pnw-spirits.s3.us-west-1.amazonaws.com/${key}?X-Amz-Expires=3600&X-Amz-Signature=abc`;
}

/** The `src` substring next/image emits for a given signed URL. */
function encodedSrcFor(key: string): string {
  return encodeURIComponent(signedUrlFor(key));
}

type FetchCall = { url: string; init?: RequestInit };

/**
 * Replaces global fetch with a stub resolving to the minimal slice of `Response`
 * the page touches, and records the calls it receives.
 */
function stubFetch(response: {
  ok: boolean;
  json: () => Promise<unknown>;
}): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  });
  return calls;
}

/** Replaces global fetch with a stub that fails the way a network error does. */
function stubFetchRejecting(error: Error): void {
  vi.stubGlobal("fetch", () => Promise.reject(error));
}

/** Stubs the blogs endpoint with a fixed list of blogs. */
function stubBlogs(blogs: BlogPayload[]): void {
  stubFetch({ ok: true, json: async () => ({ blogs }) });
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await BlogsLandingPage());
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** Every card shares this accessible-name prefix. */
function countCards(html: string): number {
  return countOccurrences(html, 'aria-label="Read article: ');
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BlogsLandingPage data fetching", () => {
  it("requests exactly the three newest blogs, uncached", async () => {
    const calls = stubFetch({ ok: true, json: async () => ({ blogs: BLOGS }) });

    await renderPage();

    // Only the blogs request: cover photos are signed in-process, not fetched.
    expect(calls).toHaveLength(1);
    // One blog per slot in the layout's row. Nothing downstream trims the list
    // any more — the featured split that used to consume a fourth blog is gone —
    // so pageSize is the only thing keeping the row from overflowing.
    expect(calls[0].url).toContain("/api/blogs?page=1&pageSize=3");
    // The landing row must not serve a stale cache entry after a publish. It is
    // also what keeps the route dynamic, which is why a signed URL rendered here
    // is always seconds old rather than replayed from a cache.
    expect(calls[0].init).toEqual({ cache: "no-store" });
  });

  it("renders one card per blog, mapped through the landing adapter", async () => {
    stubBlogs(BLOGS);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(3);
    expect(countCards(html)).toBe(3);
    expect(html).toContain("Spruce Tip Season");
    expect(html).toContain("A cozy winter story.");
    expect(html).toContain("By Author 1");
    expect(html).toContain(">Article<");
    expect(html).toContain('href="/blogs/1"');
    expect(html).toContain('aria-label="Read article: Spruce Tip Season"');
    // The oldest of the three is a card like any other, not an afterthought.
    expect(html).toContain('aria-label="Read article: Barrel Diary"');
  });

  it("passes its own copy into the shared layout", async () => {
    stubBlogs(BLOGS);

    const html = await renderPage();

    // The layout owns the header markup; the page owns these strings. Together
    // they are what makes this /blogs-landing rather than a sibling page.
    expect(html).toContain(">Distillery Journal<");
    expect(html).toContain("<h1");
    expect(html).toContain(">Blogs<");
    expect(html).toContain("Longer reads on Pacific Northwest drinking");
  });

  it("gives every blog the same card, promoting none to a hero", async () => {
    // The migration regression this file exists to pin: the newest blog used to
    // be pulled out into a FeaturedBlog above an ">ARTICLES<" heading, leaving
    // the row with the remaining three. Three peer cards, and no section
    // furniture between them, is the shape that replaced it.
    stubBlogs(BLOGS);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(3);
    expect(html).not.toContain("Featured Blog");
    expect(html).not.toContain(">ARTICLES<");
    // Identical per-card structure: one kicker and one accessible name each, so
    // no card carries extra chrome the others do not.
    expect(countOccurrences(html, ">Article<")).toBe(3);
    expect(countCards(html)).toBe(3);
  });

  it("renders a short list as fewer cards rather than failing", async () => {
    // pageSize=3 is a ceiling, not a promise: a site with one published post
    // must render one card and no empty state, and must not reserve slots for
    // blogs that do not exist.
    stubBlogs([BLOGS[0]]);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(1);
    expect(html).toContain("Spruce Tip Season");
    expect(html).not.toContain("any blogs yet.");
    expect(html).toContain("View All Articles");
  });

  it("never renders the article body, only a supplied excerpt", async () => {
    // `content` is full article text of unknown format, so a card summary can
    // only come from a real `excerpt`; truncating the body would invent one the
    // author never wrote. The adapter cannot even see `content` — LandingBlog
    // does not declare it — and this is the page-level lock on that.
    stubBlogs(BLOGS);

    const html = await renderPage();

    expect(html).toContain("A cozy winter story.");
    expect(html).not.toContain("Body of Spruce Tip Season");
    // A blog with no excerpt renders its title and byline and nothing else.
    expect(html).toContain("Cellar Notes");
    expect(html).not.toContain("Body of Cellar Notes");
  });
});

describe("BlogsLandingPage server-rendered imagery", () => {
  // The regression these tests exist for: cover photos used to resolve in a
  // client effect, so the SSR HTML of a page whose cards *are* their
  // photographs contained no <img> at all, and the layout's LCP hint on the
  // first card had nothing to preload.

  it("signs each stored cover photo on the server, and only those", async () => {
    stubBlogs([
      ...BLOGS,
      { ...blog(4, "Tasting Room Hours"), coverPhoto: null },
    ]);

    await renderPage();

    // A null coverPhoto must never reach the signer.
    expect(getS3ImageUrl).toHaveBeenCalledTimes(BLOGS.length);
    expect(getS3ImageUrl).toHaveBeenCalledWith("blogs/1.jpg");
    expect(getS3ImageUrl).not.toHaveBeenCalledWith(null);
  });

  it("emits a real <img> per signed cover photo, pointing at the signed URL", async () => {
    stubBlogs(BLOGS);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(3);
    // The server-signed URL is what the optimizer is told to fetch, proving the
    // signing happened before the HTML was produced rather than after hydration.
    for (const entry of BLOGS) {
      expect(html).toContain(encodedSrcFor(`blogs/${entry.id}.jpg`));
    }
    // Served through the optimizer with the card's size hint, so the source is
    // resized to the card instead of shipped at full resolution.
    expect(html).toContain("/_next/image?url=");
    expect(html).toContain('sizes="');
  });

  it("preloads the first card's image only and lazy-loads the rest", async () => {
    stubBlogs(BLOGS);

    const html = await renderPage();

    // One LCP preload, and it belongs to the first card: the layout sets
    // `priority` on index 0 only, and extra preloads would compete with it.
    expect(countOccurrences(html, 'rel="preload"')).toBe(1);
    const preload = html.slice(0, html.indexOf("<img"));
    expect(preload).toContain(encodedSrcFor("blogs/1.jpg"));
    expect(preload).not.toContain(encodedSrcFor("blogs/2.jpg"));
    expect(countOccurrences(html, 'loading="lazy"')).toBe(2);
  });

  it("degrades to the client path without throwing when signing is unavailable", async () => {
    // The signer is deliberately lenient: it echoes its input back when the AWS
    // env vars are missing or signing fails. That raw key is not a URL, and
    // handing it to next/image throws "Failed to parse src" and fails the whole
    // render, so the page must fall back to the client-resolved path instead.
    stubBlogs(BLOGS);
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderPage();

    // Rendered, not crashed: every card keeps its text and its link.
    expect(countTags(html, "h2")).toBe(3);
    expect(html).toContain("Spruce Tip Season");
    expect(html).toContain('href="/blogs/1"');
    // Nothing unusable reached next/image; the client path takes over instead.
    expect(countTags(html, "img")).toBe(0);
    expect(html).not.toContain("blogs/1.jpg");
  });
});

describe("BlogsLandingPage failure contract", () => {
  // Each case below would otherwise be a 500 on a page whose content is
  // optional. The contract is that all of them degrade to the layout's empty
  // state with the page header and the View All action still rendered.

  it("falls back to the empty state when the request rejects", async () => {
    stubFetchRejecting(new Error("ECONNRESET"));

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state on a non-ok response, without parsing it", async () => {
    const json = vi.fn(async () => ({ blogs: BLOGS }));
    stubFetch({ ok: false, json });

    expectEmptyStateWithHeader(await renderPage());
    // The `!res.ok` guard must short-circuit. Without this assertion the guard
    // could be deleted and the suite would stay green, because the catch block
    // silently absorbs whatever an error body does next.
    expect(json).not.toHaveBeenCalled();
  });

  it("falls back to the empty state when the body cannot be parsed", async () => {
    stubFetch({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state when the payload has no blogs key", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state when blogs is null", async () => {
    stubFetch({ ok: true, json: async () => ({ blogs: null }) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("renders the empty state when the API returns an empty list", async () => {
    stubBlogs([]);

    expectEmptyStateWithHeader(await renderPage());
  });
});

// The shared failure contract: no cards, but the page still renders its own
// header and its View All action rather than a blank or errored page.
function expectEmptyStateWithHeader(html: string): void {
  expect(countCards(html)).toBe(0);
  expect(countTags(html, "h2")).toBe(0);
  expect(countTags(html, "img")).toBe(0);
  expect(html).toContain("<h1");
  expect(html).toContain(">Blogs<");
  expect(html).toContain(
    "any blogs yet. Check back soon for cozy stories and updates!",
  );
  expect(html).toContain('href="/blogs"');
  expect(html).toContain("View All Articles");
}
