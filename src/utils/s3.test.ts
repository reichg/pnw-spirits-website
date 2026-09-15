import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteS3Objects, getS3ImageUrl, getS3UploadUrl } from "./s3";

// NOTE ON COVERAGE SCOPE
// ----------------------
// These are regression tests for a credential leak: four sites in s3.ts were
// writing presigned S3 URLs to the logs. A presigned URL is a bearer credential
// — whoever holds it can act on the object until it expires, with no further
// authentication — and one of the four fired once per signed image, twelve times
// per archive page view.
//
// THE LOGGER IS DELIBERATELY NOT MOCKED, and neither is the AWS presigner. That
// is the whole design of this file, not a stylistic preference. Mocking the
// logger is what let this bug class hide in the first place: a sibling test
// mocked the logger module, so `formatMessage` never ran and the test asserted
// against its own re-implementation of the serialization rather than against
// what reaches the console. These tests spy on `console` itself, so they observe
// the exact bytes the real logger emits through the real `serializeData`. If a
// future change moves a URL into a nested object, an Error `cause`, or anything
// else the serializer walks into, these still catch it.
//
// The real presigner is used because it signs offline: SigV4 is an HMAC over the
// request, so fake credentials produce a genuinely signed URL with no network
// and no AWS account. That matters — a stubbed signer returning a fixed string
// could not prove that a real signature stays out of the logs.
//
// Every assertion is paired. "No signature in the log" passes for free against
// code that simply stopped logging, so each site also asserts that the S3 KEY is
// still present: what is being pinned is redaction, not deletion of the log line.
//
// deleteS3Objects is only ever called here with inputs that reach its skip and
// invalid-URL branches. Any other input would issue a real DeleteObjectCommand
// over the network.

/**
 * The query parameters that make a presigned URL a credential. `X-Amz-Signature`
 * is the HMAC that authorizes the request; `X-Amz-Credential` carries the access
 * key id that produced it. Neither may ever appear in log output.
 */
const CREDENTIAL_MARKERS = ["X-Amz-Signature", "X-Amz-Credential"] as const;

const BUCKET = "pnw-spirits-test";
const KEY = "recipes/12.jpg";

/**
 * A path-style S3 URL carrying a live-looking signature.
 *
 * Path style (`s3.<region>.amazonaws.com/<bucket>/<key>`) rather than virtual
 * host style on purpose: its hostname does NOT contain the bucket name, which is
 * what routes it into deleteS3Objects' "non-bucket URL" branch even though it is
 * one of our own URLs. That mismatch is the reason that branch could leak.
 */
const SIGNED_PATH_STYLE_URL =
  `https://s3.us-west-1.amazonaws.com/${BUCKET}/${KEY}` +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
  "&X-Amz-Credential=AKIAFAKEFAKEFAKEFAKE%2F20260914%2Fus-west-1%2Fs3%2Faws4_request" +
  "&X-Amz-Signature=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

/** The same URL reduced to what is safe to log: origin + path, no query. */
const REDACTED_PATH_STYLE_URL = `https://s3.us-west-1.amazonaws.com/${BUCKET}/${KEY}`;

type Captured = {
  info: string[];
  warn: string[];
  error: string[];
  debug: string[];
  /** Every line, whatever the level — for the cross-cutting leak sweep. */
  all: string[];
};

/**
 * Spies on the console methods the real logger writes through, capturing the
 * formatted strings rather than the structured payload. This is the point of
 * observation the leak actually happened at.
 */
function captureConsole(): Captured {
  const captured: Captured = {
    info: [],
    warn: [],
    error: [],
    debug: [],
    all: [],
  };
  for (const level of ["info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(" ");
      captured[level].push(line);
      captured.all.push(line);
    });
  }
  return captured;
}

/** Asserts no line in the given output carries either credential marker. */
function expectNoCredentials(lines: string[]): void {
  for (const line of lines) {
    for (const marker of CREDENTIAL_MARKERS) {
      expect(line).not.toContain(marker);
    }
  }
}

let logs: Captured;

beforeEach(() => {
  // Fake but well-formed credentials: SigV4 signs offline, so these produce a
  // real signature without a real account or a network call.
  vi.stubEnv("AWS_REGION", "us-west-1");
  vi.stubEnv("AWS_S3_BUCKET", BUCKET);
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAFAKEFAKEFAKEFAKE");
  vi.stubEnv(
    "AWS_SECRET_ACCESS_KEY",
    "fakefakefakefakefakefakefakefakefakefake",
  );
  logs = captureConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("getS3UploadUrl logging", () => {
  it("logs the key and expiry of a signed write URL, never the URL", async () => {
    // The highest-privilege of the four: this URL grants writes to the bucket.
    const signedUrl = await getS3UploadUrl(KEY, "image/jpeg");

    // The signer really ran, so there was a real credential available to leak.
    expect(signedUrl).toContain("X-Amz-Signature=");
    expect(signedUrl).toContain(`${BUCKET}.s3.us-west-1.amazonaws.com/${KEY}`);

    expect(logs.info).toHaveLength(1);
    const [line] = logs.info;
    // Redaction, not deletion: the key and the expiry — every bit of diagnostic
    // value the URL carried — are still there.
    expect(line).toContain(KEY);
    expect(line).toContain('"expiresIn":900');
    expect(line).toContain("S3 signed upload URL generated");
    expectNoCredentials([line]);
    // The signed URL must not appear in any form, including a bare host prefix.
    expect(line).not.toContain("X-Amz-");
    expect(line).not.toContain("?");
  });

  it("stays at info, because an upload is a rare privileged mutation", async () => {
    // Unlike the per-render read path below, an upload is worth an audit trail,
    // so this line must NOT follow getS3ImageUrl down to debug.
    await getS3UploadUrl(KEY, "image/jpeg");

    expect(logs.info).toHaveLength(1);
    expect(logs.debug).toHaveLength(0);
  });

  it("writes through the real logger's format", async () => {
    // Proof that no logger mock is in play: the ISO timestamp, level, context
    // and ` | data: ` separator are all produced by formatMessage itself. If
    // this file ever starts mocking the logger, this assertion fails first.
    await getS3UploadUrl(KEY, "image/jpeg");

    expect(logs.info[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[INFO\] \[getS3UploadUrl\]: .+ \| data: \{/,
    );
  });
});

describe("getS3ImageUrl signing path logging", () => {
  it("logs the key and expiry of a signed read URL, never the URL", async () => {
    const signedUrl = await getS3ImageUrl(KEY);

    expect(signedUrl).toContain("X-Amz-Signature=");

    expect(logs.debug).toHaveLength(1);
    const [line] = logs.debug;
    expect(line).toContain(KEY);
    expect(line).toContain('"expiresIn":3600');
    expectNoCredentials([line]);
    expect(line).not.toContain("X-Amz-");
  });

  it("is emitted at debug, not info, because it fires once per signed image", async () => {
    // Twelve per view on an archive page against three on a landing page: this
    // was the highest-rate log line in the app and the one carrying a
    // credential. A move back to info is a rate regression worth failing on.
    await getS3ImageUrl(KEY);

    expect(logs.debug).toHaveLength(1);
    expect(logs.info).toHaveLength(0);
  });

  it("writes nothing at all in production, where debug is a no-op", async () => {
    // The gate is load-bearing for the rate decision above: it is what makes the
    // hot path free in production. A change flipping debug on in production
    // would not re-expose a credential today, but it would restore the volume,
    // so the gate is pinned here rather than left implicit.
    vi.stubEnv("NODE_ENV", "production");

    const signedUrl = await getS3ImageUrl(KEY);

    expect(signedUrl).toContain("X-Amz-Signature=");
    expect(logs.all).toHaveLength(0);
  });
});

describe("getS3ImageUrl absolute-URL passthrough logging", () => {
  // The branch where `keyOrUrl` is itself a URL. Callers do feed already-signed
  // URLs back in — classService caches signed photo URLs and re-checks their
  // freshness — so this line, not only the signing branches, could write a live
  // credential.

  it("strips the query from an already-signed URL before logging it", async () => {
    const returned = await getS3ImageUrl(SIGNED_PATH_STYLE_URL);

    // The caller still gets its URL back untouched; only the log is reduced.
    expect(returned).toBe(SIGNED_PATH_STYLE_URL);

    expect(logs.debug).toHaveLength(1);
    const [line] = logs.debug;
    // Origin and path survive, so the log still says which object was involved.
    expect(line).toContain(REDACTED_PATH_STYLE_URL);
    expectNoCredentials([line]);
    expect(line).not.toContain("X-Amz-");
    expect(line).not.toContain("deadbeef");
  });

  it("logs the value once, not twice under two different keys", async () => {
    // It previously emitted the same URL as both `image` and `keyOrUrl`, which
    // doubled the exposure and the volume for one event.
    await getS3ImageUrl(SIGNED_PATH_STYLE_URL);

    const [line] = logs.debug;
    expect(countOccurrences(line, REDACTED_PATH_STYLE_URL)).toBe(1);
    expect(line).not.toContain('"image"');
  });

  it("fails closed on an unparseable URL rather than echoing it", async () => {
    // The fail-closed path. A malformed value must not fall through to the
    // input being logged verbatim, because the thing that makes it malformed
    // says nothing about whether it carries a signature — as this input does.
    const malformed =
      "https://bad host/recipes/12.jpg?X-Amz-Signature=deadbeefdeadbeef";

    const returned = await getS3ImageUrl(malformed);

    expect(returned).toBe(malformed);
    expect(logs.debug).toHaveLength(1);
    const [line] = logs.debug;
    expect(line).toContain("[unparseable url]");
    expectNoCredentials([line]);
    expect(line).not.toContain("deadbeef");
    expect(line).not.toContain("bad host");
  });
});

describe("deleteS3Objects non-bucket-URL logging", () => {
  it("strips the query from a path-style URL it declines to delete", async () => {
    // A path-style URL's hostname does not contain the bucket name, so one of
    // our own signed URLs lands in this branch and gets logged.
    const result = await deleteS3Objects(SIGNED_PATH_STYLE_URL);

    // Skipped, not deleted — and no network call was made.
    expect(result).toEqual({ deleted: [], errors: [] });

    expect(logs.info).toHaveLength(1);
    const [line] = logs.info;
    expect(line).toContain("Skipping deletion for non-bucket URL");
    // Still identifies the object, which is the point of the line.
    expect(line).toContain(REDACTED_PATH_STYLE_URL);
    expectNoCredentials([line]);
    expect(line).not.toContain("X-Amz-");
    expect(line).not.toContain("deadbeef");
  });

  it("redacts every skipped URL in a batch, not just the first", async () => {
    // The loop logs per item, so a batch is where a partial fix would show.
    const second = SIGNED_PATH_STYLE_URL.replace(KEY, "blogs/7.jpg");

    await deleteS3Objects([SIGNED_PATH_STYLE_URL, second]);

    expect(logs.info).toHaveLength(2);
    expectNoCredentials(logs.info);
    expect(logs.info[1]).toContain("blogs/7.jpg");
  });
});

describe("deleteS3Objects invalid-URL branch logging", () => {
  /**
   * Malformed enough that `new URL` throws, with the signature still verbatim.
   *
   * The unencoded space is in the HOST; the query is untouched. That is the
   * whole point of this case. The branch under test was originally left
   * unredacted on the reasoning that `new URL` had already rejected the value,
   * so it could not be a well-formed presigned URL — but a parse failure says
   * nothing about whether the credential survived, because the malformation and
   * the signature live in different parts of the string.
   */
  const MALFORMED_SIGNED_URL =
    `https://bad host.s3.us-west-1.amazonaws.com/${BUCKET}/${KEY}` +
    "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
    "&X-Amz-Credential=AKIAFAKEFAKEFAKEFAKE%2F20260914%2Fus-west-1%2Fs3%2Faws4_request" +
    "&X-Amz-Signature=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

  it("really does fail to parse while keeping the signature intact", () => {
    // Pins the premise the rest of this block rests on. If a future runtime
    // makes this input parse, it stops reaching the branch under test and this
    // case says so directly instead of the others silently going vacuous.
    expect(() => new URL(MALFORMED_SIGNED_URL)).toThrow();
    for (const marker of CREDENTIAL_MARKERS) {
      expect(MALFORMED_SIGNED_URL).toContain(marker);
    }
  });

  it("logs no credential for a malformed but signature-bearing URL", async () => {
    const result = await deleteS3Objects(MALFORMED_SIGNED_URL);

    // Confirms the invalid-URL branch is the one that ran: reported as an
    // error, never deleted, so no DeleteObjectCommand went over the network.
    expect(result.deleted).toEqual([]);
    expect(result.errors).toEqual([MALFORMED_SIGNED_URL]);
    expect(logs.error.length).toBeGreaterThan(0);

    expectNoCredentials(logs.all);
    for (const line of logs.all) {
      expect(line).not.toContain("deadbeef");
    }
  });

  it("still reports the input as malformed, so the branch stays diagnosable", async () => {
    await deleteS3Objects(MALFORMED_SIGNED_URL);

    const errorText = logs.error.join("\n");
    expect(errorText).toContain("Invalid URL format for S3 deletion");
    // urlWithoutQuery fails closed, and here the placeholder IS the diagnostic:
    // "this input was malformed" is the fact worth recording, not the bytes.
    expect(errorText).toContain("[unparseable url]");
  });
});

describe("s3 logging leak sweep", () => {
  it("emits no credential on any path, across every logging site at once", () => {
    // The cross-cutting assertion the individual cases roll up into. Written as
    // a sweep so a NEW logging site added to this module is covered by it the
    // day it is added, rather than the day someone remembers to write a case.
    return (async () => {
      await getS3UploadUrl(KEY, "image/jpeg");
      await getS3ImageUrl(KEY);
      await getS3ImageUrl(SIGNED_PATH_STYLE_URL);
      await deleteS3Objects(SIGNED_PATH_STYLE_URL);

      // Every site actually fired, so the sweep is not vacuously clean.
      expect(logs.all.length).toBeGreaterThanOrEqual(4);
      expectNoCredentials(logs.all);
      for (const line of logs.all) {
        expect(line).not.toContain("deadbeef");
      }
      // And the keys are all still there: this is redaction, not silence.
      expect(logs.all.join("\n")).toContain(KEY);
    })();
  });
});

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
