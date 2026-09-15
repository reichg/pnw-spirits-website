import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getS3UploadUrl, getS3ImageUrl } = vi.hoisted(() => ({
  getS3UploadUrl: vi.fn(),
  getS3ImageUrl: vi.fn(),
}));

// Mocked at the S3 primitives so the real requireAdmin gate and the real Zod
// contract both execute; only the AWS calls are stubbed.
vi.mock("@/utils/s3", () => ({ getS3UploadUrl, getS3ImageUrl }));

import { GET, POST } from "./route";

// requireAdmin verifies against process.env.JWT_SECRET; pin it so the suite
// never depends on (or leaks) the real .env value.
const TEST_JWT_SECRET = "test-jwt-secret";

const SIGNED_URL = "https://bucket.s3.amazonaws.com/k?X-Amz-Signature=abc";
const VALID_KEY = "blog-media/blog-cover-photos/pour.jpg";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", TEST_JWT_SECRET);
  getS3UploadUrl.mockReset();
  getS3ImageUrl.mockReset();
  getS3UploadUrl.mockResolvedValue(SIGNED_URL);
  getS3ImageUrl.mockResolvedValue(SIGNED_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const adminToken = (): string => jwt.sign({ role: "admin" }, TEST_JWT_SECRET);
const userToken = (): string => jwt.sign({ role: "user" }, TEST_JWT_SECRET);

/**
 * Minimal request stand-in. The handler only reads the Authorization header and
 * the JSON body, so no Next runtime is needed.
 */
function postReq(body: unknown, authorization?: string): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name === "authorization" ? (authorization ?? null) : null,
    },
    json: async () => body,
  } as unknown as NextRequest;
}

function getReq(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

const validBody = { key: VALID_KEY, contentType: "image/jpeg" };

describe("POST /api/s3-signed-url", () => {
  // The gate is the point of this route: a presigned PUT is a bearer credential
  // for one write, so nothing may be signed for an unauthenticated caller.
  it("rejects an unauthenticated request with 401 and signs nothing", async () => {
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getS3UploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a forged token with 401 and signs nothing", async () => {
    const forged = jwt.sign({ role: "admin" }, "wrong-secret");
    const res = await POST(postReq(validBody, `Bearer ${forged}`));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Invalid token" });
    expect(getS3UploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a valid non-admin token with 403 and signs nothing", async () => {
    const res = await POST(postReq(validBody, `Bearer ${userToken()}`));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
    expect(getS3UploadUrl).not.toHaveBeenCalled();
  });

  it("signs an upload URL for an authenticated admin", async () => {
    const res = await POST(postReq(validBody, `Bearer ${adminToken()}`));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: SIGNED_URL });
    expect(getS3UploadUrl).toHaveBeenCalledWith(VALID_KEY, "image/jpeg");
  });

  // Every key the admin editors build, so the gate cannot break a real upload.
  it.each([
    "blog-media/blog-cover-photos/a.jpg",
    "blog-media/blog-content-media/a.jpg",
    "recipe-media/recipe-cover-photos/a.jpg",
    "recipe-media/recipe-content-media/a.jpg",
    "recipe-media/a.jpg",
    "class-media/album/1700000000000-a.jpg",
    "misc-media/a.jpg",
  ])("accepts the key prefix used by callers: %s", async (key) => {
    const res = await POST(
      postReq({ key, contentType: "image/png" }, `Bearer ${adminToken()}`),
    );
    expect(res.status).toBe(200);
  });

  it.each([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/quicktime",
  ])("accepts the upload content type %s", async (contentType) => {
    const res = await POST(
      postReq({ key: VALID_KEY, contentType }, `Bearer ${adminToken()}`),
    );
    expect(res.status).toBe(200);
  });

  // Defence in depth behind the gate. A presigned PUT bypasses /api/uploads'
  // in-process checks, so the key and content type have to be constrained
  // before they are signed into the URL.
  it.each([
    [
      "a key outside the allowed prefixes",
      { key: "etc/passwd", contentType: "image/jpeg" },
    ],
    [
      "an absolute URL as the key",
      { key: "https://evil.test/x.jpg", contentType: "image/jpeg" },
    ],
    ["an empty key", { key: "", contentType: "image/jpeg" }],
    ["a renderable content type", { key: VALID_KEY, contentType: "text/html" }],
    ["an SVG content type", { key: VALID_KEY, contentType: "image/svg+xml" }],
    ["a missing key", { contentType: "image/jpeg" }],
    ["a missing contentType", { key: VALID_KEY }],
    ["a non-string key", { key: 42, contentType: "image/jpeg" }],
  ])("rejects %s with 400 and signs nothing", async (_label, body) => {
    const res = await POST(postReq(body, `Bearer ${adminToken()}`));
    expect(res.status).toBe(400);
    expect(getS3UploadUrl).not.toHaveBeenCalled();
  });

  it("returns one generic message for every rejected body", async () => {
    const badPrefix = await POST(
      postReq(
        { key: "etc/passwd", contentType: "image/jpeg" },
        `Bearer ${adminToken()}`,
      ),
    );
    const badType = await POST(
      postReq(
        { key: VALID_KEY, contentType: "text/html" },
        `Bearer ${adminToken()}`,
      ),
    );
    const expected = { error: "Invalid key or contentType in request body" };
    await expect(badPrefix.json()).resolves.toEqual(expected);
    await expect(badType.json()).resolves.toEqual(expected);
  });

  it("returns 500 without detail when signing fails", async () => {
    getS3UploadUrl.mockResolvedValue(undefined);
    const res = await POST(postReq(validBody, `Bearer ${adminToken()}`));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not generate signed upload URL",
    });
  });
});

describe("GET /api/s3-signed-url", () => {
  // Intentionally ungated: the public read paths (useS3ImageUrl) call this from
  // anonymous browsers, and every prefix holds publicly-displayed media.
  it("serves an anonymous caller", async () => {
    const res = await GET(
      getReq(
        `http://localhost/api/s3-signed-url?key=${encodeURIComponent(VALID_KEY)}`,
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: SIGNED_URL });
    expect(getS3ImageUrl).toHaveBeenCalledWith(VALID_KEY);
  });

  it("returns 400 when the key parameter is missing", async () => {
    const res = await GET(getReq("http://localhost/api/s3-signed-url"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing key parameter",
    });
  });
});
