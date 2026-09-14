import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock } = vi.hoisted(() => ({
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Mocked at the primitives, not at the handler, so every assertion runs through
// the route's real param parsing, slicing and response assembly.
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { NextRequest } from "next/server";
import { logger } from "@/utils/logger";
import { GET } from "./route";

const CHANNEL_ID = "UCtestchannel";
const DEFAULT_PAGE_SIZE = 9;

/** The handler reads nothing but `url`, so a bare object stands in faithfully. */
function request(query = ""): NextRequest {
  return {
    url: `https://pnwspirits.test/api/videos${query}`,
  } as unknown as NextRequest;
}

/** One entry in the shape the route caches and returns (already mapped). */
const video = (n: number) => ({
  id: `vid${n}`,
  title: `Video ${n}`,
  url: `https://www.youtube.com/watch?v=vid${n}`,
  thumbnail: `https://i.ytimg.com/vi/vid${n}/hq.jpg`,
  publishedAt: "2026-01-01T00:00:00Z",
});

/** Serve the whole list from the Redis cache, so no fetch is involved. */
function cacheHolding(count: number): void {
  redisMock.get.mockResolvedValue(
    JSON.stringify(Array.from({ length: count }, (_, i) => video(i + 1))),
  );
}

type VideosBody = {
  videos: { id: string }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const bodyOf = async (query?: string): Promise<VideosBody> =>
  (await GET(request(query))).json();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("YOUTUBE_CHANNEL_ID", CHANNEL_ID);
  vi.stubEnv("YOUTUBE_API_KEY", "test-api-key");
  redisMock.set.mockResolvedValue("OK");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/videos page count", () => {
  // The defect this route carried: `Math.ceil(0 / pageSize)` is 0, so an empty
  // channel — or a cached-empty `yt-videos:*` entry — served `totalPages: 0`
  // into a public response every consumer reads as `>= 1`.
  it("reports one page for an empty video list", async () => {
    cacheHolding(0);

    const body = await bodyOf();

    expect(body.totalPages).toBe(1);
    expect(body.total).toBe(0);
    expect(body.videos).toEqual([]);
  });

  it("reports one page for an empty list fetched from YouTube", async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );

    const body = await bodyOf();

    expect(body.totalPages).toBe(1);
    expect(body.total).toBe(0);
  });

  it("counts the partial final page", async () => {
    cacheHolding(20);

    const body = await bodyOf();

    expect(body.totalPages).toBe(3);
    expect(body.total).toBe(20);
  });
});

describe("GET /api/videos pagination params", () => {
  // `parseInt("abc")` is NaN, and NaN reached both `slice` and the response
  // body, where JSON.stringify serialized it as `null`.
  it.each([
    ["non-numeric", "?page=abc&pageSize=xyz"],
    ["empty", "?page=&pageSize="],
    ["fractional", "?page=1.5&pageSize=2.5"],
    // `searchParams.get` yields null, which the schema must absorb too.
    ["absent", ""],
  ])("falls back to the defaults for %s params", async (_label, query) => {
    cacheHolding(20);

    const body = await bodyOf(query);

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(body.totalPages).toBe(3);
    expect(body.videos).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(body.videos[0].id).toBe("vid1");
  });

  it("emits no NaN-derived null in any numeric field", async () => {
    cacheHolding(20);

    const res = await GET(request("?page=abc&pageSize=abc"));

    // JSON.stringify turns NaN into null, so the old bug was invisible in the
    // types and visible only in the wire format.
    expect(await res.text()).not.toContain("null");
  });

  // A negative page produced a negative `start`, and Array.prototype.slice reads
  // negative bounds from the end: `?page=-1&pageSize=5` on a 20-video channel
  // served videos 11-15 as if they were a real page.
  it.each([
    ["a negative page", "?page=-1&pageSize=5"],
    ["page zero", "?page=0&pageSize=5"],
  ])("serves the first page for %s", async (_label, query) => {
    cacheHolding(20);

    const body = await bodyOf(query);

    expect(body.page).toBe(1);
    expect(body.videos.map((v) => v.id)).toEqual([
      "vid1",
      "vid2",
      "vid3",
      "vid4",
      "vid5",
    ]);
  });

  // `Math.ceil(n / 0)` is Infinity, which JSON.stringify also writes as null.
  it("rejects a zero pageSize rather than dividing by it", async () => {
    cacheHolding(20);

    const body = await bodyOf("?pageSize=0");

    expect(body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(body.totalPages).toBe(3);
  });

  it("serves a requested in-range page", async () => {
    cacheHolding(20);

    const body = await bodyOf("?page=2&pageSize=5");

    expect(body).toEqual({
      videos: [video(6), video(7), video(8), video(9), video(10)],
      total: 20,
      page: 2,
      pageSize: 5,
      totalPages: 4,
    });
  });

  // The archive clamps its own pager to totalPages, but the route is still asked
  // for out-of-range pages directly; it must answer emptily, not incoherently.
  it("serves an empty page beyond the end without distorting the count", async () => {
    cacheHolding(20);

    const body = await bodyOf("?page=999&pageSize=5");

    expect(body.videos).toEqual([]);
    expect(body.page).toBe(999);
    expect(body.total).toBe(20);
    expect(body.totalPages).toBe(4);
  });

  // `.max()` would have been a validation failure, which `.catch()` turns into
  // the *default* — so asking for 200 would have served 9, not the 100 the
  // caller can actually have.
  it("clamps an over-large pageSize to the ceiling, not to the default", async () => {
    cacheHolding(20);

    const body = await bodyOf("?pageSize=200");

    expect(body.pageSize).toBe(100);
    expect(body.pageSize).not.toBe(DEFAULT_PAGE_SIZE);
    expect(body.videos).toHaveLength(20);
  });

  // Both ceilings exist to bound `(page - 1) * pageSize`, which is the `slice`
  // start here and a Prisma `skip` on the sibling routes.
  it("clamps an absurd page rather than computing an unsafe slice bound", async () => {
    cacheHolding(20);

    const body = await bodyOf("?page=9007199254740991&pageSize=100");

    expect(body.page).toBe(1_000_000);
    expect(body.videos).toEqual([]);
    expect(body.totalPages).toBe(1);
  });
});

describe("GET /api/videos preserved behavior", () => {
  // The normal local-dev case: the archive page depends on a clean 400 here
  // rather than a 500, and degrades to its empty state.
  it("returns 400 when the API key is absent, without fetching or caching", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(request());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing channelId or API key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("caches a freshly fetched list under the channel's key", async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: { videoId: "vid1" },
              snippet: {
                title: "Video 1",
                publishedAt: "2026-01-01T00:00:00Z",
                thumbnails: {
                  high: { url: "https://i.ytimg.com/vi/vid1/hq.jpg" },
                },
              },
            },
          ],
        }),
      }),
    );

    const body = await bodyOf();

    expect(body.videos).toEqual([video(1)]);
    expect(redisMock.set).toHaveBeenCalledWith(
      `yt-videos:${CHANNEL_ID}:maxResults50`,
      JSON.stringify([video(1)]),
      "EX",
      600,
    );
  });
});

describe("GET /api/videos error paths", () => {
  // A value no real response would contain by chance, so "the body does not
  // contain this" is a meaningful assertion rather than a tautology.
  const SENTINEL_KEY = "AIzaSy-SENTINEL-KEY-MUST-NOT-LEAK-0123";

  /** Every string the logger was handed, as one blob to search. */
  const loggedText = () =>
    vi
      .mocked(logger.error)
      .mock.calls.map((c) => JSON.stringify(c))
      .join("\n");

  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", SENTINEL_KEY);
  });

  it("answers 502 with nothing but a generic message when YouTube fails", async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "quotaExceeded",
      }),
    );

    const res = await GET(request());

    // 502, not 500: the fault is in the dependency this route proxies.
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to fetch videos",
    });
  });

  // The leak this route carried: Google's error body can echo the request URL,
  // and that URL carries `key=` verbatim. The body went straight to an
  // unauthenticated caller alongside the upstream status and status text.
  it("leaks no part of the API key when the upstream body echoes the request URL", async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () =>
          JSON.stringify({
            error: { code: 403, errors: [{ reason: "quotaExceeded" }] },
            request: `https://www.googleapis.com/youtube/v3/search?key=${SENTINEL_KEY}&channelId=${CHANNEL_ID}`,
          }),
      }),
    );

    const text = await (await GET(request())).text();

    expect(text).not.toContain(SENTINEL_KEY);
    expect(text).not.toContain("quotaExceeded");
    expect(text).not.toContain("Forbidden");
    expect(text).not.toContain("googleapis.com");
  });

  // The log is the one sink the upstream body is still allowed to reach, so the
  // key has to be redacted on the way in rather than merely withheld from the
  // response.
  it("redacts the API key out of the upstream body before logging it", async () => {
    redisMock.get.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => `denied for key=${SENTINEL_KEY}`,
      }),
    );

    await GET(request());

    expect(loggedText()).not.toContain(SENTINEL_KEY);
    // Redaction must not gut the log: the diagnosable parts survive.
    expect(loggedText()).toContain("[REDACTED]");
    expect(loggedText()).toContain("Forbidden");
  });

  // The outer catch returned `details: err.message` to the same public caller.
  it("answers 500 with no thrown-error detail when something unexpected throws", async () => {
    redisMock.get.mockRejectedValue(
      new Error(`redis://user:${SENTINEL_KEY}@cache.internal:6379 refused`),
    );

    const res = await GET(request());
    const text = await res.text();

    // 500, not the previous 501: 501 advertises an unsupported method and is
    // heuristically cacheable, so an intermediary could pin a transient failure.
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Unexpected error" });
    expect(text).not.toContain(SENTINEL_KEY);
    expect(text).not.toContain("cache.internal");
    expect(text).not.toContain("refused");
  });

  it("keeps the API key out of the log on the missing-credentials path", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");

    await GET(request());

    expect(loggedText()).not.toContain(SENTINEL_KEY);
    expect(loggedText()).toContain("apiKeyPresent");
  });
});

describe("GET /api/videos channelId param", () => {
  // `?channelId=` is interpolated unescaped into the upstream URL and into the
  // Redis cache key. An `&` there appends query params to a YouTube call
  // authenticated with our key; an unbounded value mints unbounded cache keys.
  it.each([
    ["query-param injection", "?channelId=UCx%26key%3Devil"],
    ["a fragment", "?channelId=UCx%23frag"],
    ["a path traversal", "?channelId=..%2F..%2Fetc"],
    ["whitespace", "?channelId=UC%20x"],
    ["an over-long value", `?channelId=${"U".repeat(65)}`],
  ])("rejects %s without fetching or caching", async (_label, query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(request(query));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("still honors a well-formed channelId override", async () => {
    cacheHolding(3);

    const body = await bodyOf("?channelId=UCotherchannel");

    expect(body.total).toBe(3);
    expect(redisMock.get).toHaveBeenCalledWith(
      "yt-videos:UCotherchannel:maxResults50",
    );
  });
});

describe("GET /api/videos cache contents", () => {
  // `allVideos` was an evolving `any` fed by JSON.parse, so a cached value that
  // is not an array reached `slice` and threw out of the handler.
  it("serves an empty list when the cached entry is not an array", async () => {
    redisMock.get.mockResolvedValue('{"not":"an array"}');
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(request());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      videos: [],
      total: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
