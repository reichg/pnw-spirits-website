import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, s3Mock, authMock, cacheMock } = vi.hoisted(() => ({
  prismaMock: {
    blog: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  s3Mock: { getS3ImageUrl: vi.fn(), deleteS3Objects: vi.fn() },
  authMock: { requireAdmin: vi.fn() },
  cacheMock: { invalidateBlogCache: vi.fn() },
}));

// Mocked at the primitives, not at the handlers, so every assertion runs
// through the route's real id parsing, body parsing and error handling.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/s3", () => s3Mock);
vi.mock("@/utils/auth", () => authMock);
vi.mock("@/utils/redisClient", () => cacheMock);
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from "@/utils/logger";
import { NextResponse, type NextRequest } from "next/server";
import { DELETE, GET, PUT } from "./route";

/**
 * A string no real error or response would contain by chance, so every "does
 * not contain" assertion below is meaningful rather than tautological. Shaped
 * like the Prisma and connection detail this route used to hand back.
 */
const SENTINEL =
  "P2002-SENTINEL Unique constraint failed on db.internal:5432 Blog.title";

const blogRow = {
  id: 7,
  title: "A Post",
  content: "Body copy",
  author: "PNW Spirits",
  coverPhoto: "blog-media/cover.jpg",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

/** The handlers read only `headers` and `json`, so a bare object stands in. */
function request(body?: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Every string the logger was handed at error level, as one searchable blob.
 *
 * The replacer is load-bearing. This file mocks the logger module, so the real
 * `formatMessage` never runs and the assertions below see only the raw call
 * arguments — and a plain `JSON.stringify` flattens an Error to `{}`, which is
 * the exact bug the real logger was fixed to stop doing. Without the replacer
 * the helper would re-create that bug locally and report a leak-free log for a
 * payload the production logger retains in full. `name` and `stack` are
 * unwrapped alongside `message` so this mirrors what `plainError` emits, which
 * is what makes "the detail survived" mean the same thing here as in the app.
 */
const loggedText = () =>
  vi
    .mocked(logger.error)
    .mock.calls.map((c) =>
      JSON.stringify(c, (_k, v: unknown) =>
        v instanceof Error
          ? { name: v.name, message: v.message, stack: v.stack }
          : v,
      ),
    )
    .join("\n");

const validBody = {
  title: "A Post",
  content: "Body copy",
  author: "PNW Spirits",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Authorized by default; the auth tests override this.
  authMock.requireAdmin.mockReturnValue(null);
  prismaMock.blog.findUnique.mockResolvedValue(blogRow);
  prismaMock.blog.findMany.mockResolvedValue([]);
  prismaMock.blog.update.mockResolvedValue(blogRow);
  prismaMock.blog.delete.mockResolvedValue(blogRow);
  s3Mock.getS3ImageUrl.mockResolvedValue("https://signed.example/cover.jpg");
  s3Mock.deleteS3Objects.mockResolvedValue(undefined);
  cacheMock.invalidateBlogCache.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/blogs/[id] error disclosure", () => {
  // The leak this route carried: a raw Prisma message was returned to the
  // caller as `details`. An admin session is privileged, not a debug console,
  // and the message names the model, column, constraint and database host.
  it("answers 500 with nothing but a generic message when the update throws", async () => {
    prismaMock.blog.update.mockRejectedValue(new Error(SENTINEL));

    const res = await PUT(request(validBody), ctx("7"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to update blog" });
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain("db.internal");
    expect(text).not.toContain("P2002");
    expect(text).not.toContain("details");
  });

  it("keeps the thrown detail in the log so the failure stays diagnosable", async () => {
    prismaMock.blog.update.mockRejectedValue(new Error(SENTINEL));

    await PUT(request(validBody), ctx("7"));

    expect(loggedText()).toContain(SENTINEL);
  });

  // A bare console.error writes the payload unescaped; logger.formatMessage
  // runs it through JSON.stringify, which escapes the newlines an attacker
  // would need to forge a log line.
  it("routes the failure through the project logger, not console.error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.blog.update.mockRejectedValue(new Error(SENTINEL));

    await PUT(request(validBody), ctx("7"));

    expect(logger.error).toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  // A non-Error throw took the String(error) branch, which stringifies whatever
  // was thrown - including an object carrying connection detail.
  it("leaks nothing when a non-Error value is thrown", async () => {
    prismaMock.blog.update.mockRejectedValue({ detail: SENTINEL });

    const text = await (await PUT(request(validBody), ctx("7"))).text();

    expect(text).not.toContain(SENTINEL);
  });

  // req.json() throws on an unparseable body, which lands in the same catch.
  it("leaks nothing when the request body is not JSON", async () => {
    const bad = {
      headers: new Headers(),
      json: async () => {
        throw new Error(SENTINEL);
      },
    } as unknown as NextRequest;

    const res = await PUT(bad, ctx("7"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain(SENTINEL);
  });
});

describe("GET and DELETE error disclosure", () => {
  // Neither handler had a catch at all, so a throw left the handler and what
  // the caller saw was whatever Next.js decided to render.
  it("answers GET 500 generically when the query throws", async () => {
    prismaMock.blog.findUnique.mockRejectedValue(new Error(SENTINEL));

    const res = await GET(request(), ctx("7"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch blog" });
    expect(text).not.toContain(SENTINEL);
  });

  it("answers GET 500 generically when signing the cover photo throws", async () => {
    s3Mock.getS3ImageUrl.mockRejectedValue(new Error(SENTINEL));

    const res = await GET(request(), ctx("7"));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL);
  });

  it("answers DELETE 500 generically when the delete throws", async () => {
    prismaMock.blog.delete.mockRejectedValue(new Error(SENTINEL));

    const res = await DELETE(request(), ctx("7"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "Failed to delete blog" });
    expect(text).not.toContain(SENTINEL);
  });

  it("answers DELETE 500 generically when cache invalidation throws", async () => {
    cacheMock.invalidateBlogCache.mockRejectedValue(new Error(SENTINEL));

    const res = await DELETE(request(), ctx("7"));

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL);
  });

  // A media object that will not delete must not abort the row delete.
  it("still deletes the row when an S3 object delete fails", async () => {
    s3Mock.deleteS3Objects.mockRejectedValue(new Error(SENTINEL));

    const res = await DELETE(request(), ctx("7"));

    expect(res.status).toBe(200);
    expect(prismaMock.blog.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});

describe("[id] path param validation", () => {
  // parseInt reads a leading integer and discards the rest, so `1abc` resolved
  // to blog 1; and it returns values past the column's 32-bit range, where
  // Prisma throws instead of returning no rows - straight into the leaky catch.
  const rejected: [string, string][] = [
    ["trailing garbage", "1abc"],
    ["non-numeric", "abc"],
    ["empty", ""],
    ["fractional", "1.5"],
    ["negative", "-1"],
    ["zero", "0"],
    ["past the 32-bit column range", "3000000000"],
    ["whitespace-padded garbage", "7 OR 1=1"],
  ];

  it.each(rejected)("GET rejects %s without querying", async (_l, id) => {
    const res = await GET(request(), ctx(id));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid blog id" });
    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
  });

  it.each(rejected)("PUT rejects %s without querying", async (_l, id) => {
    const res = await PUT(request(validBody), ctx(id));

    expect(res.status).toBe(400);
    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.blog.update).not.toHaveBeenCalled();
  });

  it.each(rejected)("DELETE rejects %s without querying", async (_l, id) => {
    const res = await DELETE(request(), ctx(id));

    expect(res.status).toBe(400);
    expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.blog.delete).not.toHaveBeenCalled();
  });

  it("accepts a well-formed id and passes it through as a number", async () => {
    await GET(request(), ctx("7"));

    expect(prismaMock.blog.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
  });
});

describe("PUT body validation", () => {
  it.each([
    ["a non-string title", { ...validBody, title: 123 }],
    ["a null author", { ...validBody, author: null }],
    ["an object content", { ...validBody, content: { $ne: null } }],
    ["a missing title", { content: "c", author: "a" }],
    ["a non-string coverPhoto", { ...validBody, coverPhoto: 5 }],
  ])("rejects %s with 400 before reaching Prisma", async (_label, body) => {
    const res = await PUT(request(body), ctx("7"));

    expect(res.status).toBe(400);
    expect(prismaMock.blog.update).not.toHaveBeenCalled();
  });

  // The admin editor uses coverPhoto's three states as a protocol. Absent means
  // "leave the photo alone" - JSON.stringify drops an undefined value, so the
  // key never arrives - null means "clear it", and a string sets it.
  it("leaves the photo untouched when coverPhoto is absent", async () => {
    await PUT(request(validBody), ctx("7"));

    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ...validBody, coverPhoto: undefined },
    });
  });

  it("clears the photo when coverPhoto is explicitly null", async () => {
    await PUT(request({ ...validBody, coverPhoto: null }), ctx("7"));

    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ...validBody, coverPhoto: null },
    });
  });

  it("stores the S3 key when coverPhoto is a key", async () => {
    await PUT(
      request({ ...validBody, coverPhoto: "blog-media/new.jpg" }),
      ctx("7"),
    );

    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ...validBody, coverPhoto: "blog-media/new.jpg" },
    });
  });

  // A signed URL is reduced to its key before it is stored or compared.
  it("reduces a signed URL to its S3 key", async () => {
    await PUT(
      request({
        ...validBody,
        coverPhoto:
          "https://bucket.s3.amazonaws.com/blog-media/new.jpg?X-Amz=1",
      }),
      ctx("7"),
    );

    expect(prismaMock.blog.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ...validBody, coverPhoto: "blog-media/new.jpg" },
    });
  });
});

describe("PUT missing row", () => {
  // Previously the update threw Prisma's P2025 into the catch, which is the
  // likeliest way a real caller ever saw the raw database message.
  it("answers 404 rather than letting the update throw", async () => {
    prismaMock.blog.findUnique.mockResolvedValue(null);

    const res = await PUT(request(validBody), ctx("7"));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Blog not found" });
    expect(prismaMock.blog.update).not.toHaveBeenCalled();
  });
});

describe("authorization", () => {
  const forbidden = () =>
    NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  it.each([
    ["PUT", () => PUT(request(validBody), ctx("7"))],
    ["DELETE", () => DELETE(request(), ctx("7"))],
  ])(
    "%s refuses a non-admin before touching the database",
    async (_l, call) => {
      authMock.requireAdmin.mockReturnValue(forbidden());

      const res = await call();

      expect(res.status).toBe(401);
      expect(prismaMock.blog.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.blog.update).not.toHaveBeenCalled();
      expect(prismaMock.blog.delete).not.toHaveBeenCalled();
    },
  );

  // GET is a public read and must stay one: every Blog column is public content.
  it("GET serves an anonymous caller", async () => {
    const res = await GET(request(), ctx("7"));

    expect(res.status).toBe(200);
    expect(authMock.requireAdmin).not.toHaveBeenCalled();
  });
});

describe("DELETE logging", () => {
  // The whole post body was written to the log on every delete, alongside the
  // extracted file names that are the actual diagnostic value.
  it("logs the extracted file names without the post body", async () => {
    prismaMock.blog.findUnique.mockResolvedValue({
      ...blogRow,
      coverPhoto: null,
      content: `prose ${SENTINEL} prose photo.jpg more`,
    });

    await DELETE(request(), ctx("7"));

    const infoText = vi
      .mocked(logger.info)
      .mock.calls.map((c) => JSON.stringify(c))
      .join("\n");
    expect(infoText).toContain("photo.jpg");
    expect(infoText).not.toContain("prose");
  });
});
