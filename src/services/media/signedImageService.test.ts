import { beforeEach, describe, expect, it, vi } from "vitest";

const { getS3ImageUrl, redisMock } = vi.hoisted(() => ({
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));

// Mocked at the primitives, not at this module, so every assertion runs through
// the real signing and caching contract this service exists to enforce.
vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getSignedImageUrl,
  isSignedUrlFresh,
  mapWithSignedImageUrl,
} from "./signedImageService";

const KEY = "recipes/12.jpg";
const CACHE_KEY = `media:signed:${KEY}`;
const SIGNED = `https://bucket.s3.amazonaws.com/${KEY}?X-Amz-Signature=abc`;

/** The signature lifetime getS3ImageUrl requests (src/utils/s3.ts). */
const SIGNATURE_LIFETIME_SECONDS = 60 * 60;

/**
 * Build a signed-looking S3 URL whose embedded X-Amz-Date/X-Amz-Expires place it
 * inside or outside the freshness window (issued + expires - 5s buffer).
 */
function signedUrlIssuedSecondsAgo(
  secondsAgo: number,
  expiresIn: number,
): string {
  const issued = new Date(Date.now() - secondsAgo * 1000);
  const amzDate = issued
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z"); // YYYYMMDDTHHMMSSZ
  return `https://s3.example.com/key?X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-Signature=sig`;
}

/** The TTL a `set(key, value, "EX", ttl)` call was made with. */
function ttlOfLastSet(): number {
  const call = redisMock.set.mock.calls.at(-1);
  expect(call?.[2]).toBe("EX");
  return call?.[3] as number;
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  getS3ImageUrl.mockResolvedValue(SIGNED);
});

describe("getSignedImageUrl cache behavior", () => {
  it("signs on a miss and caches the result under the media namespace", async () => {
    await expect(getSignedImageUrl(KEY)).resolves.toBe(SIGNED);

    expect(getS3ImageUrl).toHaveBeenCalledWith(KEY);
    expect(redisMock.get).toHaveBeenCalledWith(CACHE_KEY);
    expect(redisMock.set).toHaveBeenCalledWith(
      CACHE_KEY,
      SIGNED,
      "EX",
      expect.any(Number),
    );
  });

  it("namespaces entries outside every invalidate*Cache wildcard", async () => {
    // invalidateRecipeCache/BlogCache/ClassCache delete `recipes:*`, `blogs:*`
    // and `classes:*` wholesale. A signed-URL entry caught by one of those would
    // be dropped on every content edit, rotating the signature — and with it the
    // image optimizer's cache key — far more often than the TTL implies.
    await getSignedImageUrl(KEY);
    const cacheKey = redisMock.set.mock.calls.at(-1)?.[0] as string;

    expect(cacheKey).toBe(CACHE_KEY);
    for (const prefix of ["recipes:", "blogs:", "classes:"]) {
      expect(cacheKey.startsWith(prefix)).toBe(false);
    }
  });

  it("holds the cache TTL below the signature lifetime", async () => {
    // An entry that outlived its signature would serve a URL S3 rejects.
    await getSignedImageUrl(KEY);

    expect(ttlOfLastSet()).toBeLessThan(SIGNATURE_LIFETIME_SECONDS);
    expect(ttlOfLastSet()).toBeGreaterThan(0);
  });

  it("returns the cached URL on a hit without re-signing", async () => {
    const cached = signedUrlIssuedSecondsAgo(60, 3600);
    redisMock.get.mockResolvedValue(cached);

    await expect(getSignedImageUrl(KEY)).resolves.toBe(cached);
    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("hands back a byte-identical URL across requests, signing once", async () => {
    // The property the image optimizer depends on: its cache key is the full
    // href, so a signature that rotated per request would force a re-download
    // and re-encode of the full-resolution original on every page view.
    let stored: string | null = null;
    redisMock.get.mockImplementation(async () => stored);
    redisMock.set.mockImplementation(async (_key: string, value: string) => {
      stored = value;
      return "OK";
    });

    const first = await getSignedImageUrl(KEY);
    const second = await getSignedImageUrl(KEY);
    const third = await getSignedImageUrl(KEY);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(getS3ImageUrl).toHaveBeenCalledTimes(1);
  });

  it("re-signs and re-caches when the cached signature is expiring", async () => {
    redisMock.get.mockResolvedValue(signedUrlIssuedSecondsAgo(3600, 3600));

    await expect(getSignedImageUrl(KEY)).resolves.toBe(SIGNED);
    expect(getS3ImageUrl).toHaveBeenCalledWith(KEY);
    expect(redisMock.set).toHaveBeenCalledWith(
      CACHE_KEY,
      SIGNED,
      "EX",
      expect.any(Number),
    );
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])(
    "returns null for %s without touching the cache or the signer",
    async (_label, key) => {
      await expect(getSignedImageUrl(key)).resolves.toBeNull();

      expect(redisMock.get).not.toHaveBeenCalled();
      expect(getS3ImageUrl).not.toHaveBeenCalled();
    },
  );
});

describe("getSignedImageUrl failure contract", () => {
  it("returns null when the signer echoes the raw key back, and caches nothing", async () => {
    // The crash guard. getS3ImageUrl returns its input unchanged when the AWS
    // env vars are missing or signing fails; a raw key reaching next/image
    // throws "Failed to parse src" and fails the whole server render. Caching
    // that outcome would pin the outage in place for the TTL.
    getS3ImageUrl.mockResolvedValue(KEY);

    await expect(getSignedImageUrl(KEY)).resolves.toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("returns null for an absolute URL, which the signer also echoes back", async () => {
    // Documented consequence of the echo guard: an absolute source is
    // indistinguishable from a signing failure, so it degrades to the caller's
    // fallback rather than being server-rendered.
    const absolute = "https://cdn.example.com/photo.jpg";
    getS3ImageUrl.mockResolvedValue(absolute);

    await expect(getSignedImageUrl(absolute)).resolves.toBeNull();
  });

  it("returns null when the signer resolves nothing, and caches nothing", async () => {
    getS3ImageUrl.mockResolvedValue(undefined);

    await expect(getSignedImageUrl(KEY)).resolves.toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("returns null instead of propagating a thrown signer", async () => {
    // Callers render imagery as optional; a signer fault must not become a 500.
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    await expect(getSignedImageUrl(KEY)).resolves.toBeNull();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("fails open when the cache read throws: signs live and still returns a URL", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));

    await expect(getSignedImageUrl(KEY)).resolves.toBe(SIGNED);
    expect(getS3ImageUrl).toHaveBeenCalledWith(KEY);
  });

  it("fails open when the cache write throws: still returns the signed URL", async () => {
    redisMock.set.mockRejectedValue(new Error("redis down"));

    await expect(getSignedImageUrl(KEY)).resolves.toBe(SIGNED);
    // The URL was already signed when the write failed; throwing that away and
    // signing again would double the cost of every request during an outage.
    expect(getS3ImageUrl).toHaveBeenCalledTimes(1);
  });
});

describe("isSignedUrlFresh", () => {
  it("accepts a signature well inside its window", () => {
    expect(isSignedUrlFresh(signedUrlIssuedSecondsAgo(60, 3600))).toBe(true);
  });

  it("rejects a signature past its window", () => {
    expect(isSignedUrlFresh(signedUrlIssuedSecondsAgo(3601, 3600))).toBe(false);
  });

  it("rejects a signature inside the 5s expiry buffer", () => {
    // Guards the buffer itself: without it a URL could be handed out with
    // milliseconds of life left and 403 by the time the optimizer fetched it.
    expect(isSignedUrlFresh(signedUrlIssuedSecondsAgo(3598, 3600))).toBe(false);
  });

  it.each([
    ["null", null],
    ["a URL carrying no signing params", "https://cdn.example.com/photo.jpg"],
    [
      "a URL missing X-Amz-Date",
      "https://s3.example.com/key?X-Amz-Expires=3600",
    ],
  ])("treats %s as fresh", (_label, url) => {
    expect(isSignedUrlFresh(url)).toBe(true);
  });
});

describe("mapWithSignedImageUrl", () => {
  interface Post {
    id: number;
    cover?: string | null;
  }

  const posts: Post[] = [
    { id: 1, cover: "a.jpg" },
    { id: 2, cover: "b.jpg" },
    { id: 3, cover: "c.jpg" },
  ];

  const coverOf = (post: Post) => post.cover;
  const toItem = (post: Post, signedUrl: string | null) => ({
    id: post.id,
    signedUrl,
  });
  const signedFor = (key: string) => `${SIGNED}&key=${key}`;

  /**
   * Signer whose per-key promises stay pending until released by hand, so a test
   * can choose resolution order independently of the order calls were issued.
   */
  function deferredSigner() {
    const resolvers = new Map<string, (url: string) => void>();
    getS3ImageUrl.mockImplementation(
      (key: string) =>
        new Promise<string>((resolve) => {
          resolvers.set(key, resolve);
        }),
    );
    return {
      release: (...keys: string[]) => {
        for (const key of keys) resolvers.get(key)?.(signedFor(key));
      },
    };
  }

  /** Settles once every record's key has reached the signer, none of them resolved. */
  const allSigningIssued = () =>
    vi.waitFor(() => expect(getS3ImageUrl).toHaveBeenCalledTimes(posts.length));

  it("issues every signing request before any of them resolves", async () => {
    // N keys must cost one round-trip, not N. A sequential map would never reach
    // the second key while the first was still pending, and this would time out.
    const signer = deferredSigner();

    const mapped = mapWithSignedImageUrl(posts, coverOf, toItem);
    await allSigningIssued();
    signer.release("a.jpg", "b.jpg", "c.jpg");

    await expect(mapped).resolves.toHaveLength(posts.length);
  });

  it("returns items in input order when signing resolves out of order", async () => {
    // Input order carries the landing layout's `priority={index === 0}` LCP
    // hint; a list reordered by signing latency preloads the wrong card.
    const signer = deferredSigner();

    const mapped = mapWithSignedImageUrl(posts, coverOf, toItem);
    await allSigningIssued();
    signer.release("c.jpg", "b.jpg", "a.jpg");

    await expect(mapped).resolves.toEqual([
      { id: 1, signedUrl: signedFor("a.jpg") },
      { id: 2, signedUrl: signedFor("b.jpg") },
      { id: 3, signedUrl: signedFor("c.jpg") },
    ]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])(
    "maps a record whose key is %s, handing toItem null",
    async (_label, cover) => {
      // The card's own fallback only runs if the record survives this far;
      // dropping it would silently shorten the grid instead.
      await expect(
        mapWithSignedImageUrl([{ id: 7, cover }], coverOf, toItem),
      ).resolves.toEqual([{ id: 7, signedUrl: null }]);

      expect(getS3ImageUrl).not.toHaveBeenCalled();
    },
  );

  it("resolves to an empty array without signing or reading the cache", async () => {
    await expect(mapWithSignedImageUrl([], coverOf, toItem)).resolves.toEqual(
      [],
    );

    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("degrades one unsignable key to null and maps the rest normally", async () => {
    // How signing actually fails in production: getS3ImageUrl echoes its input
    // back rather than throwing when it cannot sign.
    getS3ImageUrl.mockImplementation(async (key: string) =>
      key === "b.jpg" ? key : signedFor(key),
    );

    await expect(
      mapWithSignedImageUrl(posts, coverOf, toItem),
    ).resolves.toEqual([
      { id: 1, signedUrl: signedFor("a.jpg") },
      { id: 2, signedUrl: null },
      { id: 3, signedUrl: signedFor("c.jpg") },
    ]);
  });

  it("keeps the batch alive when one key's signer throws", async () => {
    // Promise.all is fail-fast, so a rejection escaping getSignedImageUrl would
    // take down every other card on the page alongside the one that failed.
    getS3ImageUrl.mockImplementation(async (key: string) => {
      if (key === "b.jpg") throw new Error("credential provider failed");
      return signedFor(key);
    });

    await expect(
      mapWithSignedImageUrl(posts, coverOf, toItem),
    ).resolves.toEqual([
      { id: 1, signedUrl: signedFor("a.jpg") },
      { id: 2, signedUrl: null },
      { id: 3, signedUrl: signedFor("c.jpg") },
    ]);
  });

  it("calls toItem with exactly the record and its URL, never an index", async () => {
    // Handing the adapter straight to Array.map would leak the index as a third
    // argument, feeding a number to a mapper whose second parameter is a URL.
    const mapper = vi.fn(toItem);

    await mapWithSignedImageUrl(posts, coverOf, mapper);

    expect(mapper.mock.calls.map((call) => call.length)).toEqual([2, 2, 2]);
    expect(mapper.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(posts),
    );
  });
});
