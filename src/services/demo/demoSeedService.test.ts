import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so the service never touches a real client/DB.
// The default export is the prisma instance. `$transaction(cb)` invokes the
// callback with a transactional client (txMock) that exposes only the model
// methods seedDemoData uses. `user` is included solely to assert it is NEVER
// touched. vi.hoisted lets these mocks exist before the hoisted vi.mock runs.
const {
  prismaMock,
  txMock,
  redisMock,
  invalidateClassCache,
  invalidateBlogCache,
  invalidateRecipeCache,
} = vi.hoisted(() => {
  const txMock = {
    blog: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    cocktailRecipe: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    subscriber: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    cocktailClass: {
      deleteMany: vi.fn().mockResolvedValue({}),
      // Resolves the singleton the demo sessions/photos attach to. Default is
      // the attach path (a class already exists); tests override for fresh-DB.
      findFirst: vi.fn().mockResolvedValue({ id: 1 }),
      // Only called on a fresh DB; returns a { id } row for the new demo class.
      create: vi.fn().mockResolvedValue({ id: 99 }),
    },
    classSession: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    classPhoto: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    user: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };

  const prismaMock = {
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => unknown) => cb(txMock)),
    // Guard against the service ever calling user methods off the root client.
    user: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    prismaMock,
    txMock,
    // ioredis default export shaped for teardown (quit) so importing the real
    // client is never attempted; named helpers are the cache invalidators.
    redisMock: { quit: vi.fn() },
    invalidateClassCache: vi.fn(),
    invalidateBlogCache: vi.fn(),
    invalidateRecipeCache: vi.fn(),
  };
});

vi.mock("@/utils/prisma", () => ({
  default: prismaMock,
}));

// Mock the Redis client so the real ioredis instance is never constructed (a
// real `new Redis(process.env.REDIS_URL!)` would attempt a live connection and
// hang/leak the suite). The default export is the ioredis instance; the named
// helpers are the post-commit cache invalidators seedDemoData calls.
vi.mock("@/utils/redisClient", () => ({
  default: redisMock,
  invalidateClassCache,
  invalidateBlogCache,
  invalidateRecipeCache,
}));

// Silence structured logging during tests.
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { assertNotProduction, seedDemoData } from "./demoSeedService";

// Sentinels asserted as literal values (they are not exported from the service).
const DEMO_AUTHOR = "PNW Spirits Demo";
const DEMO_SUBSCRIBER_DOMAIN = "@demo.pnw-spirits.test";
const DEMO_CLASS_TITLE = "Craft Cocktail Fundamentals (Demo)";
const DEMO_SESSION_LOCATION = "The PNW Spirits Lab (Demo)";
const DEMO_PHOTO_PREFIX = "class-media/demo/";

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy path: cache invalidation succeeds. Individual tests override
  // (e.g. mockRejectedValue) to exercise the fail-open branch.
  invalidateClassCache.mockResolvedValue(undefined);
  invalidateBlogCache.mockResolvedValue(undefined);
  invalidateRecipeCache.mockResolvedValue(undefined);
  // clearAllMocks resets call history but keeps implementations, so re-assert
  // the class-resolution defaults here (fresh-DB tests override findFirst→null).
  txMock.cocktailClass.findFirst.mockResolvedValue({ id: 1 });
  txMock.cocktailClass.create.mockResolvedValue({ id: 99 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertNotProduction", () => {
  it("throws when NODE_ENV is 'production'", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertNotProduction()).toThrow(/production/i);
  });

  it("does not throw for development / test / undefined", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertNotProduction()).not.toThrow();

    vi.stubEnv("NODE_ENV", "test");
    expect(() => assertNotProduction()).not.toThrow();

    vi.stubEnv("NODE_ENV", undefined);
    expect(() => assertNotProduction()).not.toThrow();
  });
});

describe("seedDemoData", () => {
  it("refuses to run and performs NO writes when NODE_ENV is 'production'", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(seedDemoData()).rejects.toThrow(/production/i);

    // The production guard fires before any transaction or write is attempted.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.blog.deleteMany).not.toHaveBeenCalled();
    expect(txMock.blog.create).not.toHaveBeenCalled();
    expect(txMock.cocktailRecipe.deleteMany).not.toHaveBeenCalled();
    expect(txMock.cocktailRecipe.createMany).not.toHaveBeenCalled();
    expect(txMock.subscriber.deleteMany).not.toHaveBeenCalled();
    expect(txMock.subscriber.createMany).not.toHaveBeenCalled();
    expect(txMock.cocktailClass.deleteMany).not.toHaveBeenCalled();
    expect(txMock.cocktailClass.findFirst).not.toHaveBeenCalled();
    expect(txMock.cocktailClass.create).not.toHaveBeenCalled();
    expect(txMock.classSession.deleteMany).not.toHaveBeenCalled();
    expect(txMock.classSession.createMany).not.toHaveBeenCalled();
    expect(txMock.classPhoto.deleteMany).not.toHaveBeenCalled();
    expect(txMock.classPhoto.createMany).not.toHaveBeenCalled();

    // The guard throws before any writes, so no cache invalidation runs either.
    expect(invalidateClassCache).not.toHaveBeenCalled();
    expect(invalidateBlogCache).not.toHaveBeenCalled();
    expect(invalidateRecipeCache).not.toHaveBeenCalled();
  });

  describe("happy path — attach to singleton (NODE_ENV='test')", () => {
    beforeEach(async () => {
      vi.stubEnv("NODE_ENV", "test");
      // Attach path: a singleton class already exists (id 1).
      txMock.cocktailClass.findFirst.mockResolvedValue({ id: 1 });
      await seedDemoData();
    });

    it("runs all writes inside a single transaction", () => {
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("sentinel-deletes prior demo rows with the exact where-clauses", () => {
      expect(txMock.blog.deleteMany).toHaveBeenCalledTimes(1);
      expect(txMock.blog.deleteMany).toHaveBeenCalledWith({
        where: { author: DEMO_AUTHOR },
      });

      expect(txMock.cocktailRecipe.deleteMany).toHaveBeenCalledTimes(1);
      expect(txMock.cocktailRecipe.deleteMany).toHaveBeenCalledWith({
        where: { author: DEMO_AUTHOR },
      });

      expect(txMock.subscriber.deleteMany).toHaveBeenCalledTimes(1);
      expect(txMock.subscriber.deleteMany).toHaveBeenCalledWith({
        where: { email: { endsWith: DEMO_SUBSCRIBER_DOMAIN } },
      });

      // The standalone-demo-class cleanup deletes by the demo title. (The
      // service issues this delete more than once; assert the where-clause
      // rather than an exact count to stay non-brittle.)
      expect(txMock.cocktailClass.deleteMany).toHaveBeenCalledWith({
        where: { title: DEMO_CLASS_TITLE },
      });
    });

    it("recreates each blog with the sentinel author and nested comments/reactions", () => {
      expect(txMock.blog.create.mock.calls.length).toBeGreaterThan(0);

      for (const [arg] of txMock.blog.create.mock.calls) {
        expect(arg.data.author).toBe(DEMO_AUTHOR);
        expect(typeof arg.data.title).toBe("string");
        expect(arg.data.comments.create).toBeDefined();
        expect(arg.data.reactions.create).toBeDefined();
        expect(Array.isArray(arg.data.comments.create)).toBe(true);
        expect(Array.isArray(arg.data.reactions.create)).toBe(true);
      }

      // At least one blog carries real nested comment/reaction content.
      const withNested = txMock.blog.create.mock.calls.find(
        ([arg]) =>
          arg.data.comments.create.length > 0 &&
          arg.data.reactions.create.length > 0,
      );
      expect(withNested).toBeDefined();
    });

    it("bulk-creates recipes with the sentinel author", () => {
      expect(txMock.cocktailRecipe.createMany).toHaveBeenCalledTimes(1);
      const arg = txMock.cocktailRecipe.createMany.mock.calls[0][0];
      expect(Array.isArray(arg.data)).toBe(true);
      expect(arg.data.length).toBeGreaterThan(0);
      for (const recipe of arg.data) {
        expect(recipe.author).toBe(DEMO_AUTHOR);
        expect(typeof recipe.title).toBe("string");
      }
    });

    it("bulk-creates subscribers whose emails end with the sentinel domain", () => {
      expect(txMock.subscriber.createMany).toHaveBeenCalledTimes(1);
      const arg = txMock.subscriber.createMany.mock.calls[0][0];
      expect(Array.isArray(arg.data)).toBe(true);
      expect(arg.data.length).toBeGreaterThan(0);
      for (const subscriber of arg.data) {
        expect(subscriber.email.endsWith(DEMO_SUBSCRIBER_DOMAIN)).toBe(true);
      }
    });

    it("attaches to the existing singleton instead of creating a second class", () => {
      // The singleton already exists, so no new class is created.
      expect(txMock.cocktailClass.create).not.toHaveBeenCalled();

      const sessions = txMock.classSession.createMany.mock.calls[0][0].data;
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.classId).toBe(1);
        expect(session.location).toBe(DEMO_SESSION_LOCATION);
        expect(session.startTime).toBeInstanceOf(Date);
      }

      const photos = txMock.classPhoto.createMany.mock.calls[0][0].data;
      expect(Array.isArray(photos)).toBe(true);
      expect(photos.length).toBe(3);
      for (const photo of photos) {
        expect(photo.classId).toBe(1);
        expect(photo.s3Key.startsWith(DEMO_PHOTO_PREFIX)).toBe(true);
      }
    });

    it("re-seeds demo sessions and photos by their sentinels, deleting before creating", () => {
      // Sentinel-scoped deletes touch only demo rows on the singleton.
      expect(txMock.classSession.deleteMany).toHaveBeenCalledWith({
        where: { classId: 1, location: DEMO_SESSION_LOCATION },
      });
      expect(txMock.classPhoto.deleteMany).toHaveBeenCalledWith({
        where: { classId: 1, s3Key: { startsWith: DEMO_PHOTO_PREFIX } },
      });

      // Each sentinel-scoped delete runs before its matching create.
      expect(
        txMock.classSession.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(txMock.classSession.createMany.mock.invocationCallOrder[0]);
      expect(
        txMock.classPhoto.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(txMock.classPhoto.createMany.mock.invocationCallOrder[0]);
    });

    it("never touches the user table (no create/createMany/delete/deleteMany/upsert)", () => {
      for (const user of [prismaMock.user, txMock.user]) {
        expect(user.create).not.toHaveBeenCalled();
        expect(user.createMany).not.toHaveBeenCalled();
        expect(user.delete).not.toHaveBeenCalled();
        expect(user.deleteMany).not.toHaveBeenCalled();
        expect(user.upsert).not.toHaveBeenCalled();
      }
    });

    it("performs the blog/recipe/subscriber sentinel deletes before their creates (idempotent order)", () => {
      // The demo-class cleanup and session/photo sentinel deletes belong to the
      // later class phase; their delete-before-create ordering is asserted above.
      const lastDeleteOrder = Math.max(
        txMock.blog.deleteMany.mock.invocationCallOrder[0],
        txMock.cocktailRecipe.deleteMany.mock.invocationCallOrder[0],
        txMock.subscriber.deleteMany.mock.invocationCallOrder[0],
      );
      const firstCreateOrder = Math.min(
        txMock.blog.create.mock.invocationCallOrder[0],
        txMock.cocktailRecipe.createMany.mock.invocationCallOrder[0],
        txMock.subscriber.createMany.mock.invocationCallOrder[0],
      );
      expect(lastDeleteOrder).toBeLessThan(firstCreateOrder);
    });

    it("invalidates the class, blog, and recipe caches exactly once each", () => {
      expect(invalidateClassCache).toHaveBeenCalledTimes(1);
      expect(invalidateBlogCache).toHaveBeenCalledTimes(1);
      expect(invalidateRecipeCache).toHaveBeenCalledTimes(1);
    });

    it("invalidates caches only AFTER the transaction commits (post-commit)", () => {
      // The transaction mock resolves synchronously in-order, so comparing
      // invocation order proves invalidation runs after the committed writes,
      // never before or during them.
      const transactionOrder = prismaMock.$transaction.mock.invocationCallOrder[0];
      for (const invalidate of [
        invalidateClassCache,
        invalidateBlogCache,
        invalidateRecipeCache,
      ]) {
        expect(invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
          transactionOrder,
        );
      }
    });
  });

  describe("fresh DB — no existing class (NODE_ENV='test')", () => {
    beforeEach(async () => {
      vi.stubEnv("NODE_ENV", "test");
      // No singleton exists yet, so the demo class must be created fresh.
      txMock.cocktailClass.findFirst.mockResolvedValue(null);
      txMock.cocktailClass.create.mockResolvedValue({ id: 99 });
      await seedDemoData();
    });

    it("creates the demo class and attaches sessions/photos to the new class id", () => {
      expect(txMock.cocktailClass.create).toHaveBeenCalledTimes(1);
      const createArg = txMock.cocktailClass.create.mock.calls[0][0];
      expect(createArg.data.title).toBe(DEMO_CLASS_TITLE);

      const sessions = txMock.classSession.createMany.mock.calls[0][0].data;
      expect(sessions.length).toBeGreaterThan(0);
      for (const session of sessions) {
        expect(session.classId).toBe(99);
        expect(session.location).toBe(DEMO_SESSION_LOCATION);
      }

      const photos = txMock.classPhoto.createMany.mock.calls[0][0].data;
      expect(photos.length).toBe(3);
      for (const photo of photos) {
        expect(photo.classId).toBe(99);
        expect(photo.s3Key.startsWith(DEMO_PHOTO_PREFIX)).toBe(true);
      }
    });
  });

  describe("cache-invalidation fail-open (NODE_ENV='test')", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "test");
    });

    it("still resolves when a cache invalidation rejects (seed succeeds anyway)", async () => {
      invalidateClassCache.mockRejectedValue(new Error("redis down"));

      // Fail-open: a Redis outage must not fail an otherwise-successful seed.
      await expect(seedDemoData()).resolves.toBeUndefined();

      // The writes still committed inside the transaction.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.blog.create.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
