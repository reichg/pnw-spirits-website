import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

/**
 * The logger writes only to `console`, and `formatMessage` is module-private,
 * so the console sink is both the real output and the only seam - asserting
 * here exercises the same path production takes rather than a test-only export.
 */
let errorSpy: ReturnType<typeof vi.spyOn>;

/** The single line the logger wrote, which is what a log sink actually stores. */
const logged = () => String(errorSpy.mock.calls[0]?.[0] ?? "");

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger data serialization", () => {
  // The bug this file exists for: `message` and `stack` are non-enumerable own
  // properties, so a bare JSON.stringify of any Error is the string "{}" and
  // every handler that logged a caught error was recording nothing.
  it("keeps an Error's message when the error is the whole payload", () => {
    logger.error("Recipe delete error", { data: new Error("boom") });

    expect(logged()).toContain("boom");
    expect(logged()).not.toContain("data: {}");
  });

  it("keeps an Error's name and stack", () => {
    logger.error("Recipe delete error", { data: new TypeError("boom") });

    expect(logged()).toContain("TypeError");
    expect(logged()).toContain("logger.test.ts");
  });

  // The majority shape at real call sites: `data: { coverPhoto, error: err }`.
  it("unwraps an Error nested inside a data object", () => {
    logger.error("Failed to delete S3 coverPhoto", {
      context: "blog.delete",
      data: { coverPhoto: "blog-media/cover.jpg", error: new Error("denied") },
    });

    expect(logged()).toContain("denied");
    expect(logged()).toContain("blog-media/cover.jpg");
  });

  it("unwraps an Error inside an array", () => {
    logger.error("Batch failed", { data: [new Error("first"), "plain"] });

    expect(logged()).toContain("first");
    expect(logged()).toContain("plain");
  });

  // How Node's fetch reports a connection failure, and how a wrapped failure
  // keeps the original. `cause` is non-enumerable like the rest.
  it("unwraps a nested cause chain", () => {
    const wrapped = new Error("fetch failed", {
      cause: new Error("ECONNREFUSED 127.0.0.1:5432"),
    });

    logger.error("Unexpected error", { data: wrapped });

    expect(logged()).toContain("fetch failed");
    expect(logged()).toContain("ECONNREFUSED 127.0.0.1:5432");
  });

  it("serializes a non-Error thrown value", () => {
    logger.error("Class photo delete error", {
      data: { code: 1, detail: "nope" },
    });

    expect(logged()).toContain('"code":1');
    expect(logged()).toContain("nope");
  });

  it("serializes a thrown string", () => {
    logger.error("Class photo delete error", { data: "thrown string" });

    expect(logged()).toContain("thrown string");
  });

  // A circular payload made JSON.stringify throw, out of a log statement whose
  // caller is already inside a catch - there is nothing left to recover it.
  it("does not throw on a circular payload, and keeps the rest of it", () => {
    const circular: Record<string, unknown> = { key: "blog-media/cover.jpg" };
    circular.self = circular;

    expect(() => logger.error("Failed", { data: circular })).not.toThrow();
    expect(logged()).toContain("blog-media/cover.jpg");
    expect(logged()).toContain("[Circular]");
  });

  it("does not throw on a cyclic cause chain", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    first.cause = second;

    expect(() => logger.error("Failed", { data: first })).not.toThrow();
    expect(logged()).toContain("first");
    expect(logged()).toContain("second");
  });

  it("does not throw when a payload cannot be serialized at all", () => {
    expect(() => logger.error("Failed", { data: { big: 1n } })).not.toThrow();
  });

  // The line shape is a contract with whatever reads these logs; only what an
  // Error serializes to was meant to change.
  it("leaves an ordinary payload and the line format unchanged", () => {
    logger.error("Newsletter blast completed", {
      context: "api/admin/newsletter",
      data: { attempted: 3, sent: 2, failed: 1 },
    });

    expect(logged()).toMatch(
      /^\[[\d-]+T[\d:.]+Z\] \[ERROR\] \[api\/admin\/newsletter\]: Newsletter blast completed \| data: \{"attempted":3,"sent":2,"failed":1\}$/,
    );
  });

  it("omits the data segment entirely when no payload is given", () => {
    logger.error("Loading environment variables");

    expect(logged()).not.toContain("data:");
  });
});

const CREDENTIAL = "AKIAIOSFODNN7EXAMPLE-do-not-log-me";

/**
 * Unwrapping an Error follows its `cause` into graphs this project does not
 * own - an AWS SDK error carries the request headers - so the serializer is the
 * only altitude that can hold a floor under what those graphs contain.
 */
describe("logger credential redaction", () => {
  it("redacts a denylisted key at the top level", () => {
    logger.error("Failed", { data: { authorization: CREDENTIAL } });

    expect(logged()).not.toContain(CREDENTIAL);
    expect(logged()).toContain('"authorization":"[redacted]"');
  });

  // Keeping the key is itself diagnostic: it says the field was present.
  it("keeps the key it redacts", () => {
    logger.error("Failed", { data: { token: CREDENTIAL, s3Key: "cover.jpg" } });

    expect(logged()).toContain('"token":"[redacted]"');
    expect(logged()).toContain("cover.jpg");
  });

  it("redacts a denylisted key nested at any depth", () => {
    logger.error("Failed", {
      data: { request: { headers: { Authorization: CREDENTIAL } } },
    });

    expect(logged()).not.toContain(CREDENTIAL);
  });

  // The path the previous change opened, and the reason this one exists.
  it("redacts a denylisted key reached through an Error's cause", () => {
    const wrapped = new Error("s3 send failed", {
      cause: { headers: { "x-amz-security-token": CREDENTIAL } },
    });

    logger.error("Failed to delete S3 object", { data: wrapped });

    expect(logged()).not.toContain(CREDENTIAL);
    expect(logged()).toContain("s3 send failed");
  });

  it("redacts a denylisted key inside an array", () => {
    logger.error("Failed", { data: [{ apiKey: CREDENTIAL }] });

    expect(logged()).not.toContain(CREDENTIAL);
  });

  // One normalized entry has to cover every casing and separator the AWS SDK,
  // Node headers and this codebase's own camelCase all produce.
  it.each([
    "Authorization",
    "X-Amz-Signature",
    "X-Amz-Credential",
    "api_key",
    "secretAccessKey",
    "accessKeyId",
    "set-cookie",
    "sessionToken",
    "PASSWORD",
  ])("redacts %s regardless of case or separator", (key) => {
    logger.error("Failed", { data: { [key]: CREDENTIAL } });

    expect(logged()).not.toContain(CREDENTIAL);
  });

  // The over-match that would do real damage here: `author` is on every blog
  // payload, and `s3Key`/`cacheKey` are the primary S3 and cache diagnostics.
  it.each(["author", "key", "s3Key", "cacheKey", "possibleKeys", "keyOrUrl"])(
    "does not redact %s, which only resembles a denylisted key",
    (key) => {
      logger.error("Failed", { data: { [key]: "PNW Spirits" } });

      expect(logged()).toContain("PNW Spirits");
    },
  );

  // `s3.ts` logs these three times as `accessKeyId: !!accessKeyId`, where the
  // whole diagnostic is which variable is missing. A boolean cannot carry a
  // credential, so redacting one is pure loss.
  it("leaves a boolean presence check under a denylisted key intact", () => {
    logger.error("Missing S3 environment variables", {
      data: { region: "us-west-2", accessKeyId: true, secretAccessKey: false },
    });

    expect(logged()).toContain('"accessKeyId":true');
    expect(logged()).toContain('"secretAccessKey":false');
  });

  it("leaves an Error's own fields flowing", () => {
    logger.error("Failed", { data: new Error("denied") });

    expect(logged()).toContain('"message":"denied"');
    expect(logged()).toContain('"stack"');
    expect(logged()).toContain('"name"');
  });

  it("composes with the cycle guard rather than replacing it", () => {
    const cyclic: Record<string, unknown> = { token: CREDENTIAL };
    cyclic.self = cyclic;

    expect(() => logger.error("Failed", { data: cyclic })).not.toThrow();
    expect(logged()).not.toContain(CREDENTIAL);
    expect(logged()).toContain("[Circular]");
  });
});
