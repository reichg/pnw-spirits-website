import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: { comment: { findMany: vi.fn(), create: vi.fn() } },
  redisMock: { get: vi.fn(), set: vi.fn() },
}));

// Mocked at the primitives, not at the handler, so every assertion runs through
// the route's real query parsing and error handling.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/redisClient", () => ({ default: redisMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

/** The handler reads only `req.url`, so a bare object stands in. */
const request = (query: string) =>
  ({ url: `https://spirits.example/api/comments${query}` }) as NextRequest;

/** Shaped like the Prisma detail this route would have surfaced unguarded. */
const SENTINEL =
  "P2020-SENTINEL Value out of range for the type on db.internal:5432";

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  prismaMock.comment.findMany.mockResolvedValue([]);
  prismaMock.comment.create.mockResolvedValue({ id: 7 });
});

describe("GET /api/comments blogId", () => {
  // The live defect: `parseInt(... || "0")` behind a `!blogId` guard caught only
  // 0 and NaN, so an out-of-int4 value passed, was interpolated into the Redis
  // cache key, and reached an unguarded findMany where the driver rejects it -
  // an anonymous 500 on a public read, reachable with a query string.
  it.each(["99999999999", "31.5", "0x1f", "1abc", "-1", "0"])(
    "answers 400 for blogId=%s without touching Redis or the database",
    async (blogId) => {
      const res = await GET(request(`?blogId=${encodeURIComponent(blogId)}`));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid blogId" });
      expect(redisMock.get).not.toHaveBeenCalled();
      expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
    },
  );

  it("answers 400 when blogId is absent", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing blogId" });
    expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
  });

  it("passes a canonical blogId through as a number", async () => {
    const res = await GET(request("?blogId=31"));

    expect(res.status).toBe(200);
    expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
      where: { blogId: 31 },
      orderBy: { createdAt: "asc" },
    });
  });

  // Defence in depth behind the parser: the handler had no catch at all, so a
  // Redis or Prisma throw left it entirely and the caller saw whatever Next.js
  // decided to render.
  it.each([
    ["the query throws", () => prismaMock.comment.findMany],
    ["Redis throws", () => redisMock.get],
  ])("answers 500 generically when %s", async (_label, target) => {
    target().mockRejectedValue(new Error(SENTINEL));

    const res = await GET(request("?blogId=31"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch comments" });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("db.internal");
  });
});

/** The POST handler reads only `req.json()`, so a bare object stands in. */
const postRequest = (body: unknown) =>
  ({ json: async () => body }) as NextRequest;

/** What `req.json()` does when the bytes are not JSON at all. */
const malformedRequest = () =>
  ({
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  }) as unknown as NextRequest;

const VALID_BODY = { blogId: 31, name: "Commenter", comment: "Nice post!" };

describe("POST /api/comments blogId", () => {
  // The other half of the GET defect, in the same file: blogId came out of an
  // anonymous, unauthenticated body behind `!blogId` alone and went straight to
  // `create`, so an oversized or non-numeric id was a 500 and `59.5` was
  // truncated onto blog 59.
  it.each([2147483648, 59.5, 0, -1, "0x1f", "abc", "31", null, true])(
    "answers 400 for blogId=%s without touching the database",
    async (blogId) => {
      const res = await POST(postRequest({ ...VALID_BODY, blogId }));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid blogId" });
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["blogId", { name: VALID_BODY.name, comment: VALID_BODY.comment }],
    ["name", { blogId: 31, comment: VALID_BODY.comment }],
    ["comment", { blogId: 31, name: VALID_BODY.name }],
  ])("answers 400 when %s is absent", async (_field, body) => {
    const res = await POST(postRequest(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing required fields",
    });
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });

  // A body that parses to `null` or to a bare scalar used to throw on the
  // destructure and come back as the write-failure 500.
  it.each([null, 7, "a string", []])(
    "answers 400 for a non-object body (%s)",
    async (body) => {
      const res = await POST(postRequest(body));

      expect(res.status).toBe(400);
      expect(prismaMock.comment.create).not.toHaveBeenCalled();
    },
  );

  // `await req.json()` sat inside the write's try/catch, so bytes that are not
  // JSON - the commonest thing an anonymous caller sends - were reported as a
  // server-side write failure.
  it("answers 400 for a malformed JSON body", async () => {
    const res = await POST(malformedRequest());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(prismaMock.comment.create).not.toHaveBeenCalled();
  });

  it("creates the comment for a canonical blogId", async () => {
    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(201);
    expect(prismaMock.comment.create).toHaveBeenCalledWith({
      data: { blogId: 31, name: "Commenter", comment: "Nice post!" },
    });
  });

  it("answers 500 generically when the write throws", async () => {
    prismaMock.comment.create.mockRejectedValue(new Error(SENTINEL));

    const res = await POST(postRequest(VALID_BODY));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to add comment" });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("db.internal");
  });
});
