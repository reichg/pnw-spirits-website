import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so the seed (and the real service functions it
// routes through) never touch a real client/DB. Mirrors the harness used by
// classService.test.ts: the default export is the prisma instance and each
// model method is a vi.fn(). vi.hoisted lets the mock exist before the hoisted
// vi.mock factory runs. seedClassPage intentionally uses the REAL
// createSession/createPhoto/upsertClassContent/getSingletonClassId so their
// Zod validation and write semantics are exercised end-to-end against the mock.
const { prismaMock, redisMock, invalidateClassCache } = vi.hoisted(() => ({
  prismaMock: {
    cocktailClass: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    classSession: {
      count: vi.fn(),
      create: vi.fn(),
    },
    classPhoto: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
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
  deleteS3Objects: vi.fn(),
}));

// Mock the Redis client so the real service writes routed through by the seed
// (each ends in invalidateClassPageCache -> invalidateClassCache) never touch a
// live ioredis instance. Without this the cache-invalidation call hangs in CI
// where no Redis is reachable, timing the tests out. Mirrors classService.test.ts.
vi.mock("@/utils/redisClient", () => ({
  default: redisMock,
  invalidateClassCache,
}));

// Silence structured logging during tests.
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { seedClassPage } from "./classSeed";
import { CLASS_MEDIA_PREFIX } from "./classSchemas";

const SINGLETON = { id: 1, title: "T", description: "D" };

// Keep these in sync with classSeed.ts intent. The exact counts are asserted so
// a future change to the seed data length is caught here.
const EXPECTED_SESSION_COUNT = 4;
const EXPECTED_PHOTO_COUNT = 10;

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path: the class already exists so upsert takes the update
  // branch and id resolution returns the singleton. Individual tests override
  // count() to drive the empty-vs-populated guards.
  prismaMock.cocktailClass.findFirst.mockResolvedValue(SINGLETON);
  prismaMock.cocktailClass.update.mockResolvedValue(SINGLETON);
  prismaMock.cocktailClass.create.mockResolvedValue(SINGLETON);
  prismaMock.classSession.create.mockResolvedValue({ id: 99 });
  prismaMock.classPhoto.create.mockResolvedValue({ id: 50 });
});

describe("seedClassPage — first run on an empty DB", () => {
  beforeEach(() => {
    prismaMock.classSession.count.mockResolvedValue(0);
    prismaMock.classPhoto.count.mockResolvedValue(0);
  });

  it("creates the class content, all seed sessions, and all seed photos", async () => {
    // Simulate the content not yet existing so upsert takes the create branch,
    // then existing for all subsequent id lookups (createSession/createPhoto).
    prismaMock.cocktailClass.findFirst
      .mockResolvedValueOnce(null) // upsertClassContent -> getSingletonClass
      .mockResolvedValue(SINGLETON); // every later id resolution

    await seedClassPage();

    // Content was created (not updated) on the empty DB.
    expect(prismaMock.cocktailClass.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.cocktailClass.update).not.toHaveBeenCalled();

    // All seed sessions and photos were created.
    expect(prismaMock.classSession.create).toHaveBeenCalledTimes(
      EXPECTED_SESSION_COUNT,
    );
    expect(prismaMock.classPhoto.create).toHaveBeenCalledTimes(
      EXPECTED_PHOTO_COUNT,
    );
  });

  it("upserts content even when the class already exists, then seeds children", async () => {
    // findFirst always returns the singleton (content already present).
    await seedClassPage();

    expect(prismaMock.cocktailClass.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.cocktailClass.create).not.toHaveBeenCalled();
    expect(prismaMock.classSession.create).toHaveBeenCalledTimes(
      EXPECTED_SESSION_COUNT,
    );
    expect(prismaMock.classPhoto.create).toHaveBeenCalledTimes(
      EXPECTED_PHOTO_COUNT,
    );
  });

  it("derives every seeded photo s3Key from the class media prefix", async () => {
    await seedClassPage();

    expect(prismaMock.classPhoto.create).toHaveBeenCalledTimes(
      EXPECTED_PHOTO_COUNT,
    );
    for (const call of prismaMock.classPhoto.create.mock.calls) {
      const s3Key = call[0].data.s3Key as string;
      expect(s3Key.startsWith(CLASS_MEDIA_PREFIX)).toBe(true);
    }
  });

  it("seeds photos with stable, contiguous sortOrder starting at 0", async () => {
    await seedClassPage();

    const sortOrders = prismaMock.classPhoto.create.mock.calls.map(
      (call) => call[0].data.sortOrder as number,
    );
    expect(sortOrders).toEqual(
      Array.from({ length: EXPECTED_PHOTO_COUNT }, (_, i) => i),
    );
  });
});

describe("seedClassPage — idempotency / non-destructive guards", () => {
  it("creates NO sessions or photos when the class already has children", async () => {
    // Populated DB: counts are > 0, so both empty-check guards short-circuit.
    prismaMock.classSession.count.mockResolvedValue(EXPECTED_SESSION_COUNT);
    prismaMock.classPhoto.count.mockResolvedValue(EXPECTED_PHOTO_COUNT);

    await seedClassPage();

    // Content upsert still runs (idempotent), but no child rows are written.
    expect(prismaMock.cocktailClass.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.create).not.toHaveBeenCalled();
  });

  it("seeds sessions but not photos when only sessions are empty", async () => {
    prismaMock.classSession.count.mockResolvedValue(0);
    prismaMock.classPhoto.count.mockResolvedValue(EXPECTED_PHOTO_COUNT);

    await seedClassPage();

    expect(prismaMock.classSession.create).toHaveBeenCalledTimes(
      EXPECTED_SESSION_COUNT,
    );
    expect(prismaMock.classPhoto.create).not.toHaveBeenCalled();
  });

  it("seeds photos but not sessions when only photos are empty", async () => {
    prismaMock.classSession.count.mockResolvedValue(EXPECTED_SESSION_COUNT);
    prismaMock.classPhoto.count.mockResolvedValue(0);

    await seedClassPage();

    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.create).toHaveBeenCalledTimes(
      EXPECTED_PHOTO_COUNT,
    );
  });

  it("adds nothing on a second consecutive run (true idempotency)", async () => {
    // First run on an empty DB writes everything.
    prismaMock.classSession.count.mockResolvedValueOnce(0);
    prismaMock.classPhoto.count.mockResolvedValueOnce(0);
    await seedClassPage();

    const sessionsAfterFirst =
      prismaMock.classSession.create.mock.calls.length;
    const photosAfterFirst = prismaMock.classPhoto.create.mock.calls.length;
    expect(sessionsAfterFirst).toBe(EXPECTED_SESSION_COUNT);
    expect(photosAfterFirst).toBe(EXPECTED_PHOTO_COUNT);

    // Second run: the rows now exist, so counts report them and guards skip.
    prismaMock.classSession.count.mockResolvedValue(EXPECTED_SESSION_COUNT);
    prismaMock.classPhoto.count.mockResolvedValue(EXPECTED_PHOTO_COUNT);
    await seedClassPage();

    // No additional create calls beyond the first run.
    expect(prismaMock.classSession.create.mock.calls.length).toBe(
      sessionsAfterFirst,
    );
    expect(prismaMock.classPhoto.create.mock.calls.length).toBe(
      photosAfterFirst,
    );
  });

  it("returns early without counting when content cannot be created", async () => {
    // Defensive path: getSingletonClassId resolves to null (no row), so the
    // seed must bail before touching session/photo counts.
    prismaMock.cocktailClass.findFirst.mockResolvedValue(null);
    // create returns a row but the subsequent id lookup still finds none.

    await seedClassPage();

    expect(prismaMock.classSession.count).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.count).not.toHaveBeenCalled();
    expect(prismaMock.classSession.create).not.toHaveBeenCalled();
    expect(prismaMock.classPhoto.create).not.toHaveBeenCalled();
  });
});
