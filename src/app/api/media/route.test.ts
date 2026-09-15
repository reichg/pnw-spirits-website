import { beforeEach, describe, expect, it, vi } from "vitest";

const { getS3ImageUrl } = vi.hoisted(() => ({ getS3ImageUrl: vi.fn() }));

vi.mock("@/utils/s3", () => ({ getS3ImageUrl }));

import type { NextRequest } from "next/server";
import { GET } from "./route";

const KEY = "blog-media/blog-content-media/pour.jpg";
const SIGNED = `https://pnw-bucket.s3.us-west-2.amazonaws.com/${KEY}?X-Amz-Signature=abc`;

/** The handler reads nothing but `url`, so a bare object stands in faithfully. */
function request(query: string): NextRequest {
  return { url: `https://pnwspirits.test/api/media${query}` } as NextRequest;
}

const forKey = (key: string) => request(`?key=${encodeURIComponent(key)}`);

beforeEach(() => {
  vi.clearAllMocks();
  getS3ImageUrl.mockResolvedValue(SIGNED);
});

describe("GET /api/media", () => {
  it("redirects a stored key to its freshly signed URL", async () => {
    const res = await GET(forKey(KEY));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNED);
    expect(getS3ImageUrl).toHaveBeenCalledWith(KEY);
  });

  it.each([
    ["an absolute https URL", "https://evil.example/phish"],
    ["an absolute http URL", "http://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example/phish"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
  ])("refuses to redirect to %s", async (_label, key) => {
    // The open redirect this guard closes: getS3ImageUrl hands an absolute URL
    // straight back, so an unfiltered key turned the production origin into a
    // 302 to anywhere — on the endpoint every OG and JSON-LD image points at.
    const res = await GET(forKey(key));

    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["no key parameter", ""],
    ["an empty key", "?key="],
  ])("rejects a request with %s", async (_label, query) => {
    const res = await GET(request(query));

    expect(res.status).toBe(400);
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it("rejects a key longer than an S3 object key can be", async () => {
    const res = await GET(forKey(`blog-media/${"a".repeat(1024)}.jpg`));

    expect(res.status).toBe(400);
    expect(getS3ImageUrl).not.toHaveBeenCalled();
  });

  it("answers the same way for every rejected key, revealing no accepted shape", async () => {
    const [absolute, empty] = await Promise.all([
      GET(forKey("https://evil.example/phish")).then((res) => res.json()),
      GET(request("?key=")).then((res) => res.json()),
    ]);

    expect(absolute).toEqual(empty);
  });

  it("returns 500 without a Location when the signer echoes the key back", async () => {
    // How signing fails in production: getS3ImageUrl returns its input when the
    // AWS env vars are missing. A bare key must never reach the header.
    getS3ImageUrl.mockResolvedValue(KEY);

    const res = await GET(forKey(KEY));

    expect(res.status).toBe(500);
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns 500 without leaking the signer's error when it throws", async () => {
    getS3ImageUrl.mockRejectedValue(new Error("credential provider failed"));

    const res = await GET(forKey(KEY));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to generate signed URL",
    });
  });
});
