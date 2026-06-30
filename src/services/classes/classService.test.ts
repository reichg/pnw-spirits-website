import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so the service never touches a real client/DB.
// The default export is the prisma instance; each model gets vi.fn() methods.
// vi.hoisted lets these mocks exist before the hoisted vi.mock factories run.
const { prismaMock, deleteS3Objects, getS3ImageUrl, redisMock, invalidateClassCache } =
  vi.hoisted(() => ({
    prismaMock: {
      cocktailClass: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      classSession: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      classPhoto: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    deleteS3Objects: vi.fn(),
    getS3ImageUrl: vi.fn(),
    redisMock: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      keys: vi.fn(),
    },
    invalidateClassCache: vi.fn(),
  }));

vi.mock("@/utils/prisma", () => ({
  default: prismaMock,
}));

vi.mock("@/utils/s3", () => ({
  deleteS3Objects,
  getS3ImageUrl,
}));

// Mock the Redis client: the default export is the ioredis instance used for the
// signed-page cache; invalidateClassCache is the named helper called by mutations.
vi.mock("@/utils/redisClient", () => ({
  default: redisMock,
  invalidateClassCache,
}));

// Silence structured logging during tests.
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  createPhoto,
  createSession,
  deletePhoto,
  getClassPage,
  getClassPageView,
  getSingletonClassId,
  reorderPhotos,
  updatePhoto,
} from "./classService";
import { ClassNotFoundError, NoClassPageError } from "./classErrors";
// Assert against the shared cap (single source of truth) rather than a literal,
// so the test tracks src/config/album.ts instead of duplicating its value.
import { MAX_ALBUM_PHOTOS } from "@/config/album";

const SINGLETON = { id: 1, title: "T", description: "D" };

const CLASS_PAGE_CACHE_KEY = "classes:page";
const CLASS_PAGE_CACHE_TTL_SECONDS = 55 * 60;

/**
 * Build a signed-looking S3 URL whose embedded X-Amz-Date/X-Amz-Expires make it
 * fresh or already-expired relative to `Date.now()`, matching how classService's
 * isSignedUrlFresh parses the freshness window (issued + expires - 5s buffer).
 */
function signedUrlIssuedSecondsAgo(secondsAgo: number, expiresIn: number): string {
  const issued = new Date(Date.now() - secondsAgo * 1000);
  const amzDate = issued
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z"); // YYYYMMDDTHHMMSSZ
  return `https://s3.example.com/key?X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresIn}&X-Amz-Signature=sig`;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteS3Objects.mockResolvedValue({ deleted: [], errors: [] });
  invalidateClassCache.mockResolvedValue(undefined);
  redisMock.set.mockResolvedValue("OK");
  redisMock.del.mockResolvedValue(1);
});

describe("getClassPage", () => {
  it("returns an empty shape when no class page exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    const result = await getClassPage();

    expect(result).toEqual({ class: null, sessions: [], photos: [] });
    // Must not query children when the singleton is absent.
    expect(prismaMock.classSession.findMany).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.findMany).not.toHaveBeenCalled();
  });

  it("returns the class with its sessions and photos when it exists", async () => {
    const sessions = [{ id: 10 }];
    const photos = [{ id: 20 }];
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classSession.findMany.mockResolvedValue(sessions);
    prismaMock.classPhoto.findMany.mockResolvedValue(photos);

    const result = await getClassPage();

    expect(result).toEqual({ class: SINGLETON, sessions, photos });
    expect(prismaMock.classSession.findMany).toHaveBeenCalledWith({
      where: { classId: SINGLETON.id },
      orderBy: { startTime: "asc" },
    });
    // Photos are capped to MAX_ALBUM_PHOTOS (the fixed album set): the
    // deterministic ordering means `take` returns exactly the photos the album
    // can ever display (no over-fetch).
    expect(prismaMock.classPhoto.findMany).toHaveBeenCalledWith({
      where: { classId: SINGLETON.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: MAX_ALBUM_PHOTOS,
    });
  });

  describe("photoLimit option", () => {
    beforeEach(() => {
      // Singleton present so the photo read path runs for each option case.
      prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
      prismaMock.classSession.findMany.mockResolvedValue([]);
      prismaMock.classPhoto.findMany.mockResolvedValue([]);
    });

    // The ordering is identical in every case; only `take` (the size cap) is
    // expected to change, so each assertion targets just the take behavior.
    it("default (no args) caps the photo read at MAX_ALBUM_PHOTOS", async () => {
      await getClassPage();

      expect(prismaMock.classPhoto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_ALBUM_PHOTOS }),
      );
    });

    it("photoLimit: null lifts the cap (no take -> all photos)", async () => {
      await getClassPage({ photoLimit: null });

      // Admin read: the query must NOT carry a `take`, so every photo is
      // returned. Asserting the absence of the key (not just take: undefined).
      const [args] = prismaMock.classPhoto.findMany.mock.calls[0];
      expect("take" in args).toBe(false);
    });

    it("photoLimit: N caps the photo read at N", async () => {
      await getClassPage({ photoLimit: 3 });

      expect(prismaMock.classPhoto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });
  });
});

describe("getClassPageView", () => {
  const RAW_PHOTOS = [
    { id: 20, s3Key: "uploads/a.jpg", caption: "A" },
    { id: 21, s3Key: "uploads/b.jpg", caption: null },
  ];

  // Make getClassPage resolve to the singleton plus the raw photos above so the
  // view path has real keys to sign.
  function mockRawPage(): void {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classSession.findMany.mockResolvedValue([]);
    prismaMock.classPhoto.findMany.mockResolvedValue(RAW_PHOTOS);
  }

  it("cache miss: signs every photo, caches the signed view, returns urls (no s3Key)", async () => {
    mockRawPage();
    redisMock.get.mockResolvedValue(null);
    getS3ImageUrl.mockImplementation(
      async (key: string) => `https://signed.example.com/${key}?sig=1`,
    );

    const result = await getClassPageView();

    // The view path delegates to getClassPage() with no args, so the public
    // read stays capped at MAX_ALBUM_PHOTOS (uncapped reads are admin-only).
    expect(prismaMock.classPhoto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_ALBUM_PHOTOS }),
    );

    // Every raw key was signed.
    expect(getS3ImageUrl).toHaveBeenCalledTimes(RAW_PHOTOS.length);
    expect(getS3ImageUrl).toHaveBeenCalledWith("uploads/a.jpg");
    expect(getS3ImageUrl).toHaveBeenCalledWith("uploads/b.jpg");

    // View carries signed urls and no raw key crosses the boundary.
    expect(result.photos).toEqual([
      { id: 20, url: "https://signed.example.com/uploads/a.jpg?sig=1", caption: "A" },
      { id: 21, url: "https://signed.example.com/uploads/b.jpg?sig=1", caption: null },
    ]);
    for (const photo of result.photos) {
      expect("s3Key" in photo).toBe(false);
    }

    // Cached under the page key with the configured TTL.
    expect(redisMock.set).toHaveBeenCalledWith(
      CLASS_PAGE_CACHE_KEY,
      JSON.stringify(result),
      "EX",
      CLASS_PAGE_CACHE_TTL_SECONDS,
    );
  });

  it("cache hit (fresh): returns the parsed payload without re-signing", async () => {
    mockRawPage();
    const cached = {
      class: SINGLETON,
      sessions: [],
      photos: [
        { id: 20, url: signedUrlIssuedSecondsAgo(60, 3600), caption: "A" },
        { id: 21, url: signedUrlIssuedSecondsAgo(60, 3600), caption: null },
      ],
    };
    redisMock.get.mockResolvedValue(JSON.stringify(cached));

    const result = await getClassPageView();

    expect(result).toEqual(cached);
    // Fresh hit: never re-signs, never re-caches.
    expect(getS3ImageUrl).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it("cache hit (expired url): drops the stale cache, re-signs, and re-caches", async () => {
    mockRawPage();
    const stale = {
      class: SINGLETON,
      sessions: [],
      photos: [
        // Issued an hour ago with a 1h lifetime -> past the 5s buffer -> stale.
        { id: 20, url: signedUrlIssuedSecondsAgo(3600, 3600), caption: "A" },
        { id: 21, url: signedUrlIssuedSecondsAgo(60, 3600), caption: null },
      ],
    };
    redisMock.get.mockResolvedValue(JSON.stringify(stale));
    getS3ImageUrl.mockImplementation(
      async (key: string) => `https://fresh.example.com/${key}`,
    );

    const result = await getClassPageView();

    // Stale cache deleted, photos re-signed and re-cached.
    expect(redisMock.del).toHaveBeenCalledWith(CLASS_PAGE_CACHE_KEY);
    expect(getS3ImageUrl).toHaveBeenCalledTimes(RAW_PHOTOS.length);
    expect(result.photos.map((p) => p.url)).toEqual([
      "https://fresh.example.com/uploads/a.jpg",
      "https://fresh.example.com/uploads/b.jpg",
    ]);
    expect(redisMock.set).toHaveBeenCalledWith(
      CLASS_PAGE_CACHE_KEY,
      JSON.stringify(result),
      "EX",
      CLASS_PAGE_CACHE_TTL_SECONDS,
    );
  });

  it("fails open when Redis read throws: signs live and never caches or throws", async () => {
    mockRawPage();
    redisMock.get.mockRejectedValue(new Error("redis down"));
    getS3ImageUrl.mockImplementation(
      async (key: string) => `https://live.example.com/${key}`,
    );

    const result = await getClassPageView();

    expect(result.photos.map((p) => p.url)).toEqual([
      "https://live.example.com/uploads/a.jpg",
      "https://live.example.com/uploads/b.jpg",
    ]);
    // Fail-open path does not attempt to write the cache.
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("maps a null signer result to url: null", async () => {
    mockRawPage();
    redisMock.get.mockResolvedValue(null);
    getS3ImageUrl.mockResolvedValue(undefined);

    const result = await getClassPageView();

    expect(result.photos.every((p) => p.url === null)).toBe(true);
  });
});

describe("getSingletonClassId", () => {
  it("returns the id when a singleton class row exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue({ id: SINGLETON.id });

    await expect(getSingletonClassId()).resolves.toBe(SINGLETON.id);
    // Selects only the id to avoid over-fetching the full row.
    expect(prismaMock.cocktailClass.findFirst).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
      select: { id: true },
    });
  });

  it("returns null when no class page exists (non-throwing)", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(getSingletonClassId()).resolves.toBeNull();
  });
});

describe("createSession", () => {
  it("throws NoClassPageError when no singleton class exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(
      createSession({ startTime: new Date("2026-07-01T18:30:00.000Z") }),
    ).rejects.toBeInstanceOf(NoClassPageError);
    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
  });

  it("creates a session against the singleton class id", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classSession.create.mockResolvedValue({ id: 99 });
    const startTime = new Date("2026-07-01T18:30:00.000Z");

    await createSession({ startTime });

    expect(prismaMock.classSession.create).toHaveBeenCalledWith({
      data: { classId: SINGLETON.id, startTime, endTime: null, location: null },
    });
  });
});

describe("createPhoto", () => {
  it("throws NoClassPageError when no singleton class exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(
      createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(NoClassPageError);
    expect(prismaMock.classPhoto.create).not.toHaveBeenCalled();
  });

  it("creates a photo against the singleton class id", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classPhoto.create.mockResolvedValue({ id: 50 });

    await createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 2 });

    expect(prismaMock.classPhoto.create).toHaveBeenCalledWith({
      data: {
        classId: SINGLETON.id,
        s3Key: "uploads/a.jpg",
        caption: null,
        sortOrder: 2,
      },
    });
  });

  it("invalidates the class page cache after a successful create", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classPhoto.create.mockResolvedValue({ id: 50 });

    await createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 0 });

    expect(invalidateClassCache).toHaveBeenCalledTimes(1);
  });

  it("fails open: a throwing cache invalidation does not fail the mutation", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
    prismaMock.classPhoto.create.mockResolvedValue({ id: 50 });
    invalidateClassCache.mockRejectedValueOnce(new Error("redis down"));

    await expect(
      createPhoto({ s3Key: "uploads/a.jpg", sortOrder: 0 }),
    ).resolves.toEqual({ id: 50 });
  });
});

describe("deletePhoto", () => {
  it("throws ClassNotFoundError when the row does not exist", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue(null);

    await expect(deletePhoto(7)).rejects.toBeInstanceOf(ClassNotFoundError);
    expect(prismaMock.classPhoto.delete).not.toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });

  it("deletes the row then removes the backing S3 object by its key", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/old.jpg",
    });
    prismaMock.classPhoto.delete.mockResolvedValue({ id: 7 });

    await deletePhoto(7);

    expect(prismaMock.classPhoto.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(deleteS3Objects).toHaveBeenCalledWith(["uploads/old.jpg"]);
  });

  it("invalidates the class page cache after a successful delete", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/old.jpg",
    });
    prismaMock.classPhoto.delete.mockResolvedValue({ id: 7 });

    await deletePhoto(7);

    expect(invalidateClassCache).toHaveBeenCalledTimes(1);
  });
});

describe("updatePhoto", () => {
  it("throws ClassNotFoundError when the row does not exist", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue(null);

    await expect(
      updatePhoto(7, { s3Key: "uploads/new.jpg", sortOrder: 0 }),
    ).rejects.toBeInstanceOf(ClassNotFoundError);
    expect(prismaMock.classPhoto.update).not.toHaveBeenCalled();
  });

  it("deletes the OLD key only when s3Key changed", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/old.jpg",
    });
    prismaMock.classPhoto.update.mockResolvedValue({ id: 7 });

    await updatePhoto(7, { s3Key: "uploads/new.jpg", sortOrder: 0 });

    expect(deleteS3Objects).toHaveBeenCalledTimes(1);
    expect(deleteS3Objects).toHaveBeenCalledWith(["uploads/old.jpg"]);
  });

  it("does NOT delete from S3 when s3Key is unchanged", async () => {
    prismaMock.classPhoto.findUnique.mockResolvedValue({
      id: 7,
      s3Key: "uploads/same.jpg",
    });
    prismaMock.classPhoto.update.mockResolvedValue({ id: 7 });

    await updatePhoto(7, { s3Key: "uploads/same.jpg", sortOrder: 1 });

    expect(prismaMock.classPhoto.update).toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });
});

describe("reorderPhotos", () => {
  // Resolve the singleton and seed the class's owned photo ids. Each
  // classPhoto.update returns a token (the input args) so we can assert the
  // exact renumber mapping from the recorded calls; $transaction resolves so
  // the service's await completes.
  function mockOwnedPhotos(ownedIds: number[]): void {
    prismaMock.cocktailClass.findFirst.mockResolvedValue({ id: SINGLETON.id });
    prismaMock.classPhoto.findMany.mockResolvedValue(
      ownedIds.map((id) => ({ id })),
    );
    // Mirror the build call so the recorded args ARE the assertable mapping.
    prismaMock.classPhoto.update.mockImplementation((args) => args);
    prismaMock.$transaction.mockResolvedValue(undefined);
  }

  it("throws NoClassPageError when no class page exists", async () => {
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);

    await expect(reorderPhotos([1, 2, 3])).rejects.toBeInstanceOf(
      NoClassPageError,
    );
    expect(prismaMock.classPhoto.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("renumbers owned photos to their index in the input order", async () => {
    mockOwnedPhotos([10, 20, 30]);

    // Input order differs from current order: 30 first, then 10, then 20.
    await reorderPhotos([30, 10, 20]);

    expect(prismaMock.classPhoto.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.classPhoto.update).toHaveBeenNthCalledWith(1, {
      where: { id: 30 },
      data: { sortOrder: 0 },
    });
    expect(prismaMock.classPhoto.update).toHaveBeenNthCalledWith(2, {
      where: { id: 10 },
      data: { sortOrder: 1 },
    });
    expect(prismaMock.classPhoto.update).toHaveBeenNthCalledWith(3, {
      where: { id: 20 },
      data: { sortOrder: 2 },
    });
  });

  it("skips foreign/unknown ids and renumbers only class-owned photos by their input index", async () => {
    mockOwnedPhotos([10, 20]);

    // 999 is foreign (not owned by the class); it must be skipped entirely.
    // Crucially, the surviving owned ids keep their INPUT index as sortOrder
    // (10 -> 0, 20 -> 2), so a foreign id cannot renumber other classes' rows.
    await reorderPhotos([10, 999, 20]);

    expect(prismaMock.classPhoto.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.classPhoto.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { sortOrder: 0 },
    });
    expect(prismaMock.classPhoto.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { sortOrder: 2 },
    });
    expect(prismaMock.classPhoto.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 999 } }),
    );
  });

  it("runs all updates inside a single prisma.$transaction (atomicity)", async () => {
    mockOwnedPhotos([10, 20]);

    await reorderPhotos([20, 10]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // The single transaction call receives exactly the built update operations
    // (one per owned id) — the reorder is all-or-nothing.
    const [ops] = prismaMock.$transaction.mock.calls[0];
    expect(ops).toHaveLength(2);
    expect(ops).toEqual([
      { where: { id: 20 }, data: { sortOrder: 0 } },
      { where: { id: 10 }, data: { sortOrder: 1 } },
    ]);
  });

  it("invalidates the class page cache after a successful reorder", async () => {
    mockOwnedPhotos([10, 20]);

    await reorderPhotos([10, 20]);

    expect(invalidateClassCache).toHaveBeenCalledTimes(1);
  });
});
