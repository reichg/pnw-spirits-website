import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mocked at the primitives, not at the handler, so every assertion runs through
// the route's real query parsing and error handling.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

/** The handler reads only `req.url`, so a bare object stands in. */
const request = (query: string) =>
  ({ url: `https://spirits.example/api/reactions${query}` }) as NextRequest;

/** Shaped like the Prisma detail this route would have surfaced unguarded. */
const SENTINEL =
  "P2020-SENTINEL Value out of range for the type on db.internal:5432";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.reaction.findMany.mockResolvedValue([]);
  prismaMock.reaction.findFirst.mockResolvedValue(null);
  prismaMock.reaction.create.mockResolvedValue({ id: 7, count: 1 });
  prismaMock.reaction.update.mockResolvedValue({ id: 7, count: 2 });
});

describe("GET /api/reactions blogId", () => {
  // The live defect, identical to the sibling /api/comments GET: an out-of-int4
  // value passed the `!blogId` guard and reached an unguarded findMany where the
  // driver rejects it - an anonymous 500 on a public read.
  it.each(["99999999999", "31.5", "0x1f", "1abc", "-1", "0"])(
    "answers 400 for blogId=%s without touching the database",
    async (blogId) => {
      const res = await GET(request(`?blogId=${encodeURIComponent(blogId)}`));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid blogId" });
      expect(prismaMock.reaction.findMany).not.toHaveBeenCalled();
    },
  );

  it("answers 400 when blogId is absent", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing blogId" });
    expect(prismaMock.reaction.findMany).not.toHaveBeenCalled();
  });

  it("passes a canonical blogId through as a number", async () => {
    const res = await GET(request("?blogId=31"));

    expect(res.status).toBe(200);
    expect(prismaMock.reaction.findMany).toHaveBeenCalledWith({
      where: { blogId: 31 },
    });
  });

  // Defence in depth behind the parser: the handler had no catch at all, so a
  // Prisma throw left it entirely and the caller saw whatever Next.js rendered.
  it("answers 500 generically when the query throws", async () => {
    prismaMock.reaction.findMany.mockRejectedValue(new Error(SENTINEL));

    const res = await GET(request("?blogId=31"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch reactions" });
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

const VALID_BODY = { blogId: 31, type: "like" };

describe("POST /api/reactions blogId", () => {
  // The other half of the GET defect, in the same file: blogId came out of an
  // anonymous, unauthenticated body behind `!blogId` alone and reached
  // `findFirst`/`create`, so an oversized or non-numeric id was a 500.
  it.each([2147483648, 59.5, 0, -1, "0x1f", "abc", "31", null, true])(
    "answers 400 for blogId=%s without touching the database",
    async (blogId) => {
      const res = await POST(postRequest({ ...VALID_BODY, blogId }));

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid blogId" });
      expect(prismaMock.reaction.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.reaction.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["blogId", { type: VALID_BODY.type }],
    ["type", { blogId: 31 }],
  ])("answers 400 when %s is absent", async (_field, body) => {
    const res = await POST(postRequest(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing required fields",
    });
    expect(prismaMock.reaction.findFirst).not.toHaveBeenCalled();
  });

  // A body that parses to `null` or to a bare scalar used to throw on the
  // destructure and come back as the write-failure 500.
  it.each([null, 7, "a string", []])(
    "answers 400 for a non-object body (%s)",
    async (body) => {
      const res = await POST(postRequest(body));

      expect(res.status).toBe(400);
      expect(prismaMock.reaction.findFirst).not.toHaveBeenCalled();
    },
  );

  // `await req.json()` sat inside the write's try/catch, so bytes that are not
  // JSON - the commonest thing an anonymous caller sends - were reported as a
  // server-side write failure.
  it("answers 400 for a malformed JSON body", async () => {
    const res = await POST(malformedRequest());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(prismaMock.reaction.findFirst).not.toHaveBeenCalled();
  });

  it("creates the reaction for a canonical blogId", async () => {
    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(201);
    expect(prismaMock.reaction.create).toHaveBeenCalledWith({
      data: { blogId: 31, type: "like", count: 1 },
    });
  });

  it("increments an existing reaction for a canonical blogId", async () => {
    prismaMock.reaction.findFirst.mockResolvedValue({ id: 7, count: 1 });

    const res = await POST(postRequest(VALID_BODY));

    expect(res.status).toBe(201);
    expect(prismaMock.reaction.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { count: { increment: 1 } },
    });
    expect(prismaMock.reaction.create).not.toHaveBeenCalled();
  });

  it("answers 500 generically when the write throws", async () => {
    prismaMock.reaction.findFirst.mockRejectedValue(new Error(SENTINEL));

    const res = await POST(postRequest(VALID_BODY));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to add reaction" });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("db.internal");
  });
});
