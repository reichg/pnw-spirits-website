import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, redisMock, invalidateRecipeCache } = vi.hoisted(() => ({
  prismaMock: {
    cocktailRecipe: { findMany: vi.fn(), count: vi.fn() },
  },
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
  invalidateRecipeCache: vi.fn(),
}));

// Mocked at the primitives, not at the handler, so every assertion runs through
// the route's real param parsing, cache-key construction and query assembly.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/redisClient", () => ({
  default: redisMock,
  invalidateRecipeCache,
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { NextRequest } from "next/server";
import { GET } from "./route";

const DEFAULT_PAGE_SIZE = 10;

const RECIPE = {
  id: 1,
  title: "Pacific Negroni",
  description: "...",
  author: "Ada",
  ingredients: "...",
  instructions: "...",
  coverPhoto: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

/** The handler reads nothing but `url`, so a bare object stands in faithfully. */
function request(query = ""): NextRequest {
  return {
    url: `https://pnwspirits.test/api/recipes${query}`,
  } as unknown as NextRequest;
}

/** The `skip`/`take` the route handed Prisma for a given query string. */
async function prismaPageArgs(
  query?: string,
): Promise<{ skip: number; take: number }> {
  await GET(request(query));
  const [args] = prismaMock.cocktailRecipe.findMany.mock.calls.at(-1) as [
    { skip: number; take: number },
  ];
  return { skip: args.skip, take: args.take };
}

/** The Redis key the route read for a given query string. */
async function cacheKeyFor(query?: string): Promise<string> {
  await GET(request(query));
  return redisMock.get.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  prismaMock.cocktailRecipe.findMany.mockResolvedValue([RECIPE]);
  prismaMock.cocktailRecipe.count.mockResolvedValue(1);
});

describe("GET /api/recipes pagination params reaching Prisma", () => {
  // `parseInt("abc")` is NaN, and NaN went straight into `skip`/`take` — a
  // query-layer failure, not merely a wrong number in the response body.
  it.each([
    ["non-numeric", "?page=abc&pageSize=xyz"],
    ["empty", "?page=&pageSize="],
    ["fractional", "?page=1.5&pageSize=2.5"],
    ["absent", ""],
  ])("sends a safe skip/take for %s params", async (_label, query) => {
    expect(await prismaPageArgs(query)).toEqual({
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  // A negative page made `skip` negative, which Prisma rejects outright.
  it.each([
    ["a negative page", "?page=-1&pageSize=5"],
    ["page zero", "?page=0&pageSize=5"],
    ["a negative pageSize", "?page=2&pageSize=-5"],
    ["a zero pageSize", "?page=2&pageSize=0"],
  ])(
    "never sends a negative skip or a non-positive take for %s",
    async (_label, query) => {
      const { skip, take } = await prismaPageArgs(query);

      expect(skip).toBeGreaterThanOrEqual(0);
      expect(take).toBeGreaterThanOrEqual(1);
    },
  );

  it("passes a valid page through untouched", async () => {
    expect(await prismaPageArgs("?page=3&pageSize=5")).toEqual({
      skip: 10,
      take: 5,
    });
  });

  it("never sends NaN to Prisma for any malformed input", async () => {
    for (const query of [
      "?page=abc",
      "?pageSize=abc",
      "?page=abc&pageSize=abc",
      "?page=-1",
      "?page=1e999",
    ]) {
      const { skip, take } = await prismaPageArgs(query);
      expect(Number.isSafeInteger(skip)).toBe(true);
      expect(Number.isSafeInteger(take)).toBe(true);
    }
  });
});

describe("GET /api/recipes cache key", () => {
  // The key is built from the parsed values, so validation fixes it: every
  // unparseable page used to collapse onto one `recipes:page=NaN:size=NaN` entry
  // that corresponded to no real page and held whatever the NaN query returned.
  it("never builds a key containing NaN", async () => {
    for (const query of ["?page=abc&pageSize=xyz", "?page=-1", "?pageSize=0"]) {
      expect(await cacheKeyFor(query)).not.toContain("NaN");
    }
  });

  it("resolves a malformed page onto the real page-one key", async () => {
    const garbage = await cacheKeyFor("?page=abc&pageSize=xyz");
    const explicit = await cacheKeyFor("?page=1&pageSize=10");

    expect(garbage).toBe(explicit);
    expect(garbage).toBe("recipes:page=1:size=10:search=");
  });

  it("keys distinct pages and searches distinctly", async () => {
    expect(await cacheKeyFor("?page=2&pageSize=5&search=gin")).toBe(
      "recipes:page=2:size=5:search=gin",
    );
    expect(await cacheKeyFor("?page=3&pageSize=5&search=gin")).toBe(
      "recipes:page=3:size=5:search=gin",
    );
  });
});

describe("GET /api/recipes bounded page size", () => {
  // `.max()` would have been a validation failure, which `.catch()` turns into
  // the *default* — so asking for 200 would have served 10, not the 100 the
  // caller can actually have.
  it("clamps an over-large pageSize to the ceiling, not to the default", async () => {
    const { take } = await prismaPageArgs("?pageSize=200");

    expect(take).toBe(100);
    expect(take).not.toBe(DEFAULT_PAGE_SIZE);
  });

  it("keeps the clamped size in the cache key it writes", async () => {
    expect(await cacheKeyFor("?pageSize=200")).toBe(
      "recipes:page=1:size=100:search=",
    );
  });
});

describe("GET /api/recipes bounded search term", () => {
  const longTerm = "a".repeat(150);

  it("truncates an over-length term rather than dropping the filter", async () => {
    await GET(request(`?search=${longTerm}`));

    const [args] = prismaMock.cocktailRecipe.findMany.mock.calls.at(-1) as [
      { where?: { OR?: { title?: { contains: string } }[] } },
    ];
    expect(args.where?.OR?.[0]?.title?.contains).toBe("a".repeat(100));
  });

  it("bounds the cache key an unbounded term could otherwise mint", async () => {
    const key = await cacheKeyFor(`?search=${longTerm}`);

    expect(key).toBe(`recipes:page=1:size=10:search=${"a".repeat(100)}`);
    expect(key.length).toBeLessThan(
      `recipes:page=1:size=10:search=`.length + 150,
    );
  });

  // Previously a truthy term: it filtered on spaces and keyed the cache on them.
  it("treats a whitespace-only term as no search at all", async () => {
    await GET(request("?search=%20%20%20"));

    const [args] = prismaMock.cocktailRecipe.findMany.mock.calls.at(-1) as [
      { where?: unknown },
    ];
    expect(args.where).toBeUndefined();
    expect(redisMock.get).toHaveBeenLastCalledWith(
      "recipes:page=1:size=10:search=",
    );
  });
});

describe("GET /api/recipes preserved behavior", () => {
  it("returns the documented response shape", async () => {
    const res = await GET(request("?page=2&pageSize=5"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      recipes: [{ ...RECIPE, createdAt: RECIPE.createdAt.toISOString() }],
      total: 1,
      page: 2,
      pageSize: 5,
    });
  });

  it("caches the response for 5 minutes", async () => {
    await GET(request("?page=1&pageSize=10"));

    expect(redisMock.set).toHaveBeenCalledWith(
      "recipes:page=1:size=10:search=",
      expect.any(String),
      "EX",
      60 * 5,
    );
  });

  it("serves a cache hit without querying Prisma", async () => {
    const cachedBody = { recipes: [], total: 0, page: 1, pageSize: 10 };
    redisMock.get.mockResolvedValue(JSON.stringify(cachedBody));

    const res = await GET(request());

    await expect(res.json()).resolves.toEqual(cachedBody);
    expect(prismaMock.cocktailRecipe.findMany).not.toHaveBeenCalled();
  });

  it("still applies the four-field case-insensitive search filter", async () => {
    await GET(request("?search=gin"));

    const [args] = prismaMock.cocktailRecipe.findMany.mock.calls.at(-1) as [
      { where?: { OR?: unknown[] } },
    ];
    expect(args.where?.OR).toHaveLength(4);
  });

  it("returns 500 without leaking the Prisma error when the query fails", async () => {
    prismaMock.cocktailRecipe.count.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.4:5432"),
    );

    const res = await GET(request());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to fetch recipes",
    });
  });
});
