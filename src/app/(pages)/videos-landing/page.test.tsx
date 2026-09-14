import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import VideoLandingPage from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `fetchLandingVideos` is module-private and deliberately stays that way. It is
// reachable anyway: the page is an async server component taking no props, so it
// can be awaited directly and its returned element rendered with
// renderToStaticMarkup. Every assertion below therefore runs through the real
// public entry point with a stubbed global `fetch` — no production code was
// changed or exported to make this testable.
//
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts). That costs this page nothing:
// it composes ContentLandingLayout, which is server-only, around items whose
// media is a YouTube thumbnail URL rather than a stored S3 key, so every card
// emits a real <img> under static render with no client round-trip anywhere in
// the path. This is the only one of the three landing pages that is fully
// observable here — and the only one that renders ContentCard's external-link
// branch, which is why the target/rel contract is asserted below against the
// live page rather than only against the card in isolation.
//
// Card dates are asserted exactly. They no longer depend on the host: the
// adapter formats with an explicit en-US locale and a UTC time zone, replacing
// the bare `toLocaleDateString()` the deleted FeaturedVideo/VideoGrid used,
// whose output shifted with the machine's zone and could not be pinned at all.
//
// Cards are counted by their <h2> titles, which only ContentCard emits, and by
// their accessible names; images by their tag. CSS-module class names are hashed
// by the transform and are not a contract, so nothing below keys off one.

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
    publishedAt: "2026-01-02T12:00:00.000Z",
  };
}

/** One page's worth of videos: exactly the three the layout's row holds. */
const VIDEOS: VideoPayload[] = [
  video("v1", "Barrel Room Tour"),
  video("v2", "Gin Botanicals"),
  video("v3", "Cocktail Basics"),
];

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

/** Stubs the videos endpoint with a fixed list of videos. */
function stubVideos(videos: unknown[]): void {
  stubFetch({ ok: true, json: async () => ({ videos }) });
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await VideoLandingPage());
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** Every card shares this accessible-name prefix. */
function countCards(html: string): number {
  return countOccurrences(html, 'aria-label="Watch video on YouTube: ');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VideoLandingPage data fetching", () => {
  it("requests exactly the three newest videos, uncached", async () => {
    const calls = stubFetch({
      ok: true,
      json: async () => ({ videos: VIDEOS }),
    });

    await renderPage();

    expect(calls).toHaveLength(1);
    // One video per slot in the layout's row. Nothing downstream trims the list
    // any more — the featured split that used to consume a fourth video is gone
    // — so pageSize is the only thing keeping the row from overflowing.
    expect(calls[0].url).toContain("/api/videos?page=1&pageSize=3");
    // The landing row must not serve a stale cache entry after an upload.
    expect(calls[0].init).toEqual({ cache: "no-store" });
  });

  it("renders one card per video, mapped through the landing adapter", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(3);
    expect(countCards(html)).toBe(3);
    expect(html).toContain("Barrel Room Tour");
    expect(html).toContain(">Video<");
    expect(html).toContain(
      'aria-label="Watch video on YouTube: Barrel Room Tour"',
    );
    // The oldest of the three is a card like any other, not an afterthought.
    expect(html).toContain(
      'aria-label="Watch video on YouTube: Cocktail Basics"',
    );
    // No description field on the wire, so no card carries a summary: title,
    // kicker and date only, which is two paragraphs short of the blog card.
    expect(countTags(html, "p")).toBe(2 + VIDEOS.length); // eyebrow + intro + meta
  });

  it("passes its own copy into the shared layout", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    // The layout owns the header markup; the page owns these strings. Together
    // they are what makes this /videos-landing rather than a sibling page.
    expect(html).toContain(">From the Channel<");
    expect(html).toContain("<h1");
    expect(html).toContain(">Videos<");
    expect(html).toContain("Cocktail builds and technique");
  });

  it("gives every video the same card, promoting none to a hero", async () => {
    // The migration regression this file exists to pin: the newest video used to
    // be pulled out into a FeaturedVideo — since deleted, along with the rest of
    // src/components/Video — above a ">VIDEOS<" heading, leaving the row with
    // the remaining three. Three peer cards, and no section furniture between
    // them, is the shape that replaced it.
    stubVideos(VIDEOS);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(3);
    expect(html).not.toContain("Featured Video");
    expect(html).not.toContain(">VIDEOS<");
    // Identical per-card structure: one kicker and one accessible name each, so
    // no card carries extra chrome the others do not.
    expect(countOccurrences(html, ">Video<")).toBe(3);
    expect(countCards(html)).toBe(3);
  });

  it("renders a short list as fewer cards rather than failing", async () => {
    // pageSize=3 is a ceiling, not a promise: a channel with one video must
    // render one card and no empty state, and must not reserve slots for videos
    // that do not exist.
    stubVideos([VIDEOS[0]]);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(1);
    expect(countCards(html)).toBe(1);
    expect(html).toContain("Barrel Room Tour");
    expect(html).not.toContain("any videos yet.");
    expect(html).toContain("View All Videos");
  });
});

describe("VideoLandingPage external link contract", () => {
  // This is the first — and still the only — page in the app that renders
  // ContentCard's external branch. Until it shipped, target/rel were guarded
  // solely by ContentCard's own unit test, with no live consumer to catch a
  // page that declared its links the wrong `kind`.

  it("opens every card in a new tab with an opener-safe rel", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    // rel="noopener noreferrer" is the security half: without noopener the
    // opened YouTube tab gets a handle on this window via `window.opener`.
    expect(countOccurrences(html, 'target="_blank"')).toBe(3);
    expect(countOccurrences(html, 'rel="noopener noreferrer"')).toBe(3);
    // Exactly one target per card and not one more: the View All action is an
    // internal Link and must keep navigating in place.
    expect(countOccurrences(html, 'target="_blank"')).toBe(countCards(html));
  });

  it("links each card straight at its YouTube watch URL", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    for (const entry of VIDEOS) {
      expect(html).toContain(
        `href="https://www.youtube.com/watch?v=${entry.id}"`,
      );
    }
    // No internal /videos/:id route exists for these, so a card that lost its
    // external `kind` would route through next/link to a 404.
    expect(html).not.toContain('href="/videos/v1"');
  });

  it("names the destination in the accessible name, before activation", async () => {
    // The card leaves the site. A screen-reader user must hear that from the
    // link's name rather than discover it after following it.
    stubVideos(VIDEOS);

    const html = await renderPage();

    expect(html).toContain(
      'aria-label="Watch video on YouTube: Barrel Room Tour"',
    );
    expect(countOccurrences(html, "on YouTube: ")).toBe(3);
  });

  it("keeps the View All action internal", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    // One anchor, in place, to the in-app archive — not a fourth external jump.
    expect(html).toContain('href="/videos"');
    expect(html).toContain(">View All Videos<");
  });
});

describe("VideoLandingPage published dates", () => {
  // The regression lock on the timezone fix. The date on a card is now formatted
  // with an explicit en-US locale and a UTC time zone, so the string below is
  // the same on every machine that runs this suite and on the server that
  // renders it. Under the old `toLocaleDateString()` this could not be asserted.

  it("renders each card's published date in full", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    expect(countOccurrences(html, ">January 2, 2026<")).toBe(3);
  });

  it("does not roll a late-UTC timestamp back a day", async () => {
    // 00:30 UTC on March 14 is still March 13 in US Pacific, so a host-zone
    // format renders the wrong date for every reader on a server west of UTC.
    stubVideos([{ ...VIDEOS[0], publishedAt: "2026-03-14T00:30:00.000Z" }]);

    const html = await renderPage();

    expect(html).toContain(">March 14, 2026<");
    expect(html).not.toContain("March 13, 2026");
  });

  it("renders an empty meta line rather than failing on a bad timestamp", async () => {
    // Intl.DateTimeFormat.format throws a RangeError on an invalid date, which
    // would take the whole server render down. The card keeps its other content.
    stubVideos([{ ...VIDEOS[0], publishedAt: "not a date" }]);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(1);
    expect(html).toContain("Barrel Room Tour");
    expect(html).not.toContain("Invalid Date");
    expect(html).not.toContain("NaN");
  });
});

describe("VideoLandingPage thumbnail fallback", () => {
  // /api/videos substitutes "" when a snippet carries no usable image, and its
  // Redis cache re-parses mapped entries from JSON, so a stale one can arrive
  // with the field missing outright. Either value as a next/image `src` throws
  // "Failed to parse src" and fails the entire server render — not one card.

  it.each([
    ["an empty thumbnail", { thumbnail: "" }],
    ["no thumbnail field at all", { thumbnail: undefined }],
  ])("still renders the card for %s", async (_label, override) => {
    stubVideos([{ ...VIDEOS[0], ...override }, VIDEOS[1], VIDEOS[2]]);

    const html = await renderPage();

    // The imageless video keeps its card, its link and its date.
    expect(countTags(html, "h2")).toBe(3);
    expect(countCards(html)).toBe(3);
    expect(html).toContain("Barrel Room Tour");
    expect(html).toContain('href="https://www.youtube.com/watch?v=v1"');
    // Its media box is simply empty: two images for the two videos that have
    // one, and no broken <img> for the one that does not.
    expect(countTags(html, "img")).toBe(2);
    expect(html).not.toContain('src=""');
    // And no LCP preload, because the first card has no image to preload.
    expect(html).not.toContain('rel="preload"');
  });

  it("renders a real <img> through the optimizer for each thumbnail it does have", async () => {
    stubVideos(VIDEOS);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(3);
    // Proxied rather than hotlinked, so the origin URL appears percent-encoded.
    expect(html).toContain("/_next/image?url=");
    expect(html).toContain("i.ytimg.com%2Fvi%2Fv1%2Fhqdefault.jpg");
    expect(html).toContain('sizes="');
    // First card preloaded as the LCP candidate, the rest lazy.
    expect(countOccurrences(html, 'rel="preload"')).toBe(1);
    expect(countOccurrences(html, 'loading="lazy"')).toBe(2);
  });
});

describe("VideoLandingPage failure contract", () => {
  // Each case below would otherwise be a 500 on a page whose content is
  // optional — and /api/videos answers 400 whenever the YouTube key or channel
  // id is absent, which is the common local case. The contract is that all of
  // them degrade to the layout's empty state with the page header and the View
  // All action still rendered.

  it("falls back to the empty state when the request rejects", async () => {
    stubFetchRejecting(new Error("ECONNRESET"));

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state on a non-ok response, without parsing it", async () => {
    const json = vi.fn(async () => ({ videos: VIDEOS }));
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

  it("falls back to the empty state when the payload has no videos key", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state when videos is null", async () => {
    stubFetch({ ok: true, json: async () => ({ videos: null }) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("renders the empty state when the API returns an empty list", async () => {
    stubVideos([]);

    expectEmptyStateWithHeader(await renderPage());
  });
});

// The shared failure contract: no cards, but the page still renders its own
// header and its View All action rather than a blank or errored page.
function expectEmptyStateWithHeader(html: string): void {
  expect(countCards(html)).toBe(0);
  expect(countTags(html, "h2")).toBe(0);
  expect(countTags(html, "img")).toBe(0);
  // No cards means nothing leaves the site, so no new-tab link survives either.
  expect(html).not.toContain('target="_blank"');
  expect(html).toContain("<h1");
  expect(html).toContain(">Videos<");
  expect(html).toContain("any videos yet. Check back soon for new content!");
  expect(html).toContain('href="/videos"');
  expect(html).toContain("View All Videos");
}
