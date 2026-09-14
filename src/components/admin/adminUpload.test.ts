import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadToS3 } from "./adminUpload";
import type { AdminFetch } from "@/hooks/useAdminFetch";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `uploadToS3` is plain async code with no React and no DOM, so the node
// environment is no constraint at all here: both requests are observable by
// substituting `adminFetch` (a parameter) and the global `fetch` (the direct S3
// PUT). `File` and `Response` are Node globals, so the real types are used
// rather than shapes that look like them.
//
// WHAT THIS FILE IS REALLY GUARDING, beyond the four failure messages. Two
// invariants in adminUpload.ts are stated as prose warnings against a future
// tidy-up, and prose does not fail a build:
//
//   1. THE PUT MUST NOT CARRY `Authorization`. The presigned URL's SigV4
//      signature covers a fixed set of headers, so routing the second call
//      through `adminFetch` - the obvious "why are there two fetch styles here"
//      cleanup - makes S3 reject every upload in the admin.
//
//   2. THE URL MUST BE ABSOLUTE http(s). The value is fed to `fetch` as a
//      request target, so a relative or non-http string from a compromised or
//      merely broken signing route would silently re-point the upload at this
//      origin - with the file's bytes as the body.
//
// Both are asserted below against the request that was actually issued.

const KEY = "blog-media/1700000000000-cover.jpg";
const SIGNED_URL = "https://bucket.s3.us-west-2.amazonaws.com/blog-media/cover";
const UPLOAD_FAILED = "Upload failed. Please try again.";
const NOT_STORED = "Upload failed: the file did not reach storage.";

function file(): File {
  return new File(["binary"], "cover.jpg", { type: "image/jpeg" });
}

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/** An `adminFetch` that answers the signing route with `response`. */
function signer(response: Response | Error): AdminFetch {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("uploadToS3 — the successful path", () => {
  it("returns the KEY, not the signed URL", async () => {
    // The URL expires; the key is what the record stores and what the list
    // re-signs on demand. Returning the URL would put an expiring string in the
    // database.
    const result = await uploadToS3(signer(json({ url: SIGNED_URL })), KEY, file());

    expect(result).toEqual({ ok: true, key: KEY });
  });

  it("asks the signing route for this key and content type, through adminFetch", async () => {
    // THE TITLE USED TO END "with the bearer", which this test does not assert
    // and cannot: the Authorization header is added inside `useAdminFetch`,
    // downstream of the `adminFetch` parameter substituted here, so nothing
    // about a bearer is observable at this seam. What IS asserted - and what
    // actually matters - is that the signing call goes through that parameter at
    // all, because routing it through the bare global `fetch` instead is what
    // would send it unauthenticated. The end-to-end "a stored token reaches the
    // Authorization header" contract is pinned in useAdminFetch.test.ts.
    const adminFetch = signer(json({ url: SIGNED_URL }));

    await uploadToS3(adminFetch, KEY, file());

    expect(adminFetch).toHaveBeenCalledWith("/api/s3-signed-url", {
      method: "POST",
      json: { key: KEY, contentType: "image/jpeg" },
    });
  });

  it("PUTs the file to the signed URL and sends NO Authorization header", async () => {
    // INVARIANT 1. Adding a bearer here breaks the SigV4 signature and S3
    // rejects the upload outright, so "unify the two fetches" is a change that
    // must fail this test rather than fail in production.
    await uploadToS3(signer(json({ url: SIGNED_URL })), KEY, file());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(SIGNED_URL);
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(File);

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("image/jpeg");
    expect(
      Object.keys(headers).some((name) => /^authorization$/i.test(name)),
    ).toBe(false);
  });
});

describe("uploadToS3 — the four failure shapes", () => {
  it("reports a signing request that never completed", async () => {
    // A network failure reaching our own route: there is no response to read a
    // message out of, so the generic line is all that can honestly be said.
    const result = await uploadToS3(
      signer(new TypeError("Failed to fetch")),
      KEY,
      file(),
    );

    expect(result).toEqual({ ok: false, message: UPLOAD_FAILED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the signing route's own curated error when it refuses", async () => {
    const result = await uploadToS3(
      signer(json({ error: "Unsupported file type." }, { status: 400 })),
      KEY,
      file(),
    );

    expect(result).toEqual({ ok: false, message: "Unsupported file type." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never renders an unexpected upstream body as UI text", async () => {
    // `readAdminError` only surfaces a single-line `{ error }` under 200 chars.
    // A proxy's HTML page or a driver dump fails that shape and must be
    // replaced by the fallback rather than shown to the admin.
    const proxyPage = new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });

    const result = await uploadToS3(signer(proxyPage), KEY, file());

    expect(result).toEqual({ ok: false, message: UPLOAD_FAILED });
  });

  it("refuses a signed URL that is missing, malformed, or not absolute http(s)", async () => {
    // INVARIANT 2. Each of these would otherwise become a `fetch` target. The
    // relative and protocol-relative entries are the dangerous ones: they
    // re-point the PUT at this origin (or an attacker's) carrying the file.
    const badPayloads: unknown[] = [
      null,
      "a string",
      {},
      { url: null },
      { url: 42 },
      { url: "" },
      { url: "/api/s3-signed-url" },
      { url: "//evil.example.com/steal" },
      { url: "javascript:alert(1)" },
      { url: "ftp://bucket/object" },
      { url: " https://bucket/object" },
    ];

    for (const payload of badPayloads) {
      fetchMock.mockClear();

      const result = await uploadToS3(signer(json(payload)), KEY, file());

      expect(result).toEqual({ ok: false, message: UPLOAD_FAILED });
      // The point is not only the message: no request may be issued at all.
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("refuses a signing response whose body is not JSON at all", async () => {
    const notJson = new Response("OK", { status: 200 });

    const result = await uploadToS3(signer(notJson), KEY, file());

    expect(result).toEqual({ ok: false, message: UPLOAD_FAILED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a rejected S3 PUT without quoting S3's XML fault document", async () => {
    const s3Fault =
      "<?xml version='1.0'?><Error><Code>EntityTooLarge</Code></Error>";
    fetchMock.mockResolvedValueOnce(
      new Response(s3Fault, { status: 400, headers: { "Content-Type": "application/xml" } }),
    );

    const result = await uploadToS3(signer(json({ url: SIGNED_URL })), KEY, file());

    expect(result).toEqual({ ok: false, message: NOT_STORED });
    // Deliberately not readAdminError: this response is S3's, not ours, and its
    // body would be meaningless here even if it passed the safe-shape test.
    expect(JSON.stringify(result)).not.toContain("EntityTooLarge");
  });

  it("reports an S3 PUT that never completed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    const result = await uploadToS3(signer(json({ url: SIGNED_URL })), KEY, file());

    expect(result).toEqual({ ok: false, message: UPLOAD_FAILED });
  });

  it("resolves rather than throwing on every failure path", async () => {
    // The caller renders `message` straight into the UI and has no catch, so a
    // throw from here would surface as an unhandled rejection instead of an
    // error line in the editor.
    await expect(
      uploadToS3(signer(new Error("boom")), KEY, file()),
    ).resolves.toMatchObject({ ok: false });
  });
});
