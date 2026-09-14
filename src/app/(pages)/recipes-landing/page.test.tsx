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

import RecipesLandingPage from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `fetchLandingRecipes` is module-private and deliberately stays that way. It is
// reachable anyway: the page is an async server component taking no props, so it
// can be awaited directly and its returned element rendered with
// renderToStaticMarkup. Every assertion below therefore runs through the real
// public entry point with a stubbed global `fetch` — no production code was
// changed or exported to make this testable.
//
// Cover photos are signed on the server, so the whole tree — imagery included —
// renders here: a signed recipe emits a real <img> under static render, which is
// exactly what ships in the SSR HTML. Only the unsigned fallback stays invisible
// to this test, because it defers to the client component that resolves a signed
// URL in an effect. Cards are counted by their <h2> titles, images by their tag.

type RecipePayload = {
  id: number;
  title: string;
  author: string;
  description: string;
  coverPhoto?: string | null;
};

const RECIPES: RecipePayload[] = [
  {
    id: 1,
    title: "Spruce Tip Gimlet",
    author: "Jane",
    description: "Gin, lime, spruce tip syrup.",
    coverPhoto: "recipes/1.jpg",
  },
  {
    id: 2,
    title: "Marionberry Smash",
    author: "Ben",
    description: "Bourbon, berries, mint.",
    coverPhoto: null,
  },
  {
    id: 3,
    title: "Fir Old Fashioned",
    author: "Ana",
    description: "Rye, fir bitters, demerara.",
  },
];

/** Every recipe carrying a cover photo, so per-card image behavior is visible. */
const RECIPES_WITH_COVERS: RecipePayload[] = RECIPES.map((recipe) => ({
  ...recipe,
  coverPhoto: `recipes/${recipe.id}.jpg`,
}));

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

/** Stubs the recipes endpoint with a fixed list of recipes. */
function stubRecipes(recipes: RecipePayload[]): void {
  stubFetch({ ok: true, json: async () => ({ recipes }) });
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await RecipesLandingPage());
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
});

/** Makes the Redis mock behave like a real store for the duration of a test. */
function useInMemoryCache(): void {
  const store = new Map<string, string>();
  redisMock.get.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisMock.set.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return "OK";
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecipesLandingPage data fetching", () => {
  it("requests exactly the three newest recipes, uncached", async () => {
    const calls = stubFetch({
      ok: true,
      json: async () => ({ recipes: RECIPES }),
    });

    await renderPage();

    // Only the recipes request: cover photos are signed in-process, not fetched.
    expect(calls).toHaveLength(1);
    // One recipe per slot in the layout's row; a different pageSize would
    // overflow or underfill it.
    expect(calls[0].url).toContain("/api/recipes?page=1&pageSize=3");
    // The landing row must not serve a stale cache entry after a publish. It is
    // also what keeps the route dynamic, which is why a signed URL rendered here
    // is always seconds old rather than replayed from a cache.
    expect(calls[0].init).toEqual({ cache: "no-store" });
  });

  it("renders one card per recipe, mapped through the landing adapter", async () => {
    stubRecipes(RECIPES);

    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(3);
    expect(html).toContain("Spruce Tip Gimlet");
    expect(html).toContain("By Jane");
    expect(html).toContain('href="/recipes/1"');
    expect(html).toContain('aria-label="View recipe: Spruce Tip Gimlet"');
    // A recipe with no cover photo at all still gets a card.
    expect(html).toContain("Fir Old Fashioned");
  });
});

describe("RecipesLandingPage server-rendered imagery", () => {
  // The regression these tests exist for: cover photos used to resolve in a
  // client effect, so the SSR HTML of a page whose cards *are* their
  // photographs contained no <img> at all, and the layout's LCP hint on the
  // first card had nothing to preload.

  it("signs each stored cover photo on the server, once per recipe", async () => {
    stubRecipes(RECIPES);

    await renderPage();

    // Only the recipe that actually has a key is signed; a null or missing
    // coverPhoto must never reach the signer.
    expect(getS3ImageUrl).toHaveBeenCalledTimes(1);
    expect(getS3ImageUrl).toHaveBeenCalledWith("recipes/1.jpg");
  });

  it("emits a real <img> per signed cover photo, pointing at the signed URL", async () => {
    stubRecipes(RECIPES_WITH_COVERS);

    const html = await renderPage();

    expect(countTags(html, "img")).toBe(3);
    // The server-signed URL is what the optimizer is told to fetch, proving the
    // signing happened before the HTML was produced rather than after hydration.
    for (const recipe of RECIPES_WITH_COVERS) {
      expect(html).toContain(encodedSrcFor(`recipes/${recipe.id}.jpg`));
    }
    // Served through the optimizer with the layout's size hint, so the source is
    // resized to the card instead of shipped at full resolution.
    expect(html).toContain("/_next/image?url=");
    expect(html).toContain('sizes="');
  });

  it("serves the same image src on every render instead of re-signing", async () => {
    // Next's image optimizer keys its cache on the full href, and a presigned
    // URL carries its signature in the query string. If this route — which is
    // dynamic, so it renders per request — re-signed each time, the href would
    // rotate on every page view and force a fresh download and re-encode of the
    // full-resolution original. Identical markup across renders is the property
    // that lets the optimizer's cache hit.
    useInMemoryCache();
    stubRecipes(RECIPES_WITH_COVERS);

    const first = await renderPage();
    stubRecipes(RECIPES_WITH_COVERS);
    const second = await renderPage();

    expect(second).toBe(first);
    // Three keys, signed once each across both renders — not once per render.
    expect(getS3ImageUrl).toHaveBeenCalledTimes(RECIPES_WITH_COVERS.length);
  });

  it("preloads the first card's image only and lazy-loads the rest", async () => {
    stubRecipes(RECIPES_WITH_COVERS);

    const html = await renderPage();

    // One LCP preload, and it belongs to the first card: `priority` is finally
    // observable in the markup.
    expect(countOccurrences(html, 'rel="preload"')).toBe(1);
    const preload = html.slice(0, html.indexOf("<img"));
    expect(preload).toContain(encodedSrcFor("recipes/1.jpg"));
    expect(preload).not.toContain(encodedSrcFor("recipes/2.jpg"));
    // The other two stay lazy so they cannot compete with the LCP image.
    expect(countOccurrences(html, 'loading="lazy"')).toBe(2);
  });
});

describe("RecipesLandingPage signing failure contract", () => {
  // The signer returns its input unchanged when the AWS env vars are missing or
  // signing fails. That raw key is not a URL: emitting it as an image src throws
  // "Failed to parse src" and fails the whole render. The page must fall back to
  // the client-resolved path instead.

  it.each([
    ["the signer echoes the raw key back", async (key: string) => key],
    ["the signer resolves nothing", async () => undefined],
    [
      "the signer throws",
      async () => {
        throw new Error("credential provider failed");
      },
    ],
  ])("degrades without throwing when %s", async (_label, implementation) => {
    stubRecipes(RECIPES_WITH_COVERS);
    getS3ImageUrl.mockImplementation(implementation);

    const html = await renderPage();

    // Rendered, not crashed: every card keeps its text and its link.
    expect(countTags(html, "h2")).toBe(3);
    expect(html).toContain("Spruce Tip Gimlet");
    expect(html).toContain('href="/recipes/1"');
    // Nothing unusable reached next/image; the client path takes over instead.
    expect(countTags(html, "img")).toBe(0);
    expect(html).not.toContain("recipes/1.jpg");
  });
});

describe("RecipesLandingPage failure contract", () => {
  // Each case below would otherwise be a 500 on a page whose content is
  // optional. The contract is that all of them degrade to the layout's empty
  // state with the page header and the View All action still rendered.

  it("falls back to the empty state when the request rejects", async () => {
    stubFetchRejecting(new Error("network down"));

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state on a non-ok response, without parsing it", async () => {
    const json = vi.fn(async () => ({ recipes: RECIPES }));
    stubFetch({ ok: false, json });

    expectEmptyStateWithHeader(await renderPage());
    // The `!res.ok` guard must short-circuit: parsing an error body and using
    // whatever it contains is the regression this pins down.
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

  it("falls back to the empty state when the payload has no recipes key", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("falls back to the empty state when recipes is null", async () => {
    stubFetch({ ok: true, json: async () => ({ recipes: null }) });

    expectEmptyStateWithHeader(await renderPage());
  });

  it("renders the empty state when the API returns an empty list", async () => {
    stubRecipes([]);

    expectEmptyStateWithHeader(await renderPage());
  });
});

// The shared failure contract: no cards, but the page still renders its own
// heading and its View All action rather than a blank or errored page.
function expectEmptyStateWithHeader(html: string): void {
  expect(countTags(html, "h2")).toBe(0);
  expect(html).toContain("<h1");
  expect(html).toContain(">Recipes<");
  expect(html).toContain('href="/recipes"');
  expect(html).toContain("View All Recipes");
}
