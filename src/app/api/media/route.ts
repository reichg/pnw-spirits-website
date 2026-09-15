import { MAX_S3_KEY_LENGTH } from "@/services/media/mediaSchemas";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Anything a browser could read as a scheme or an authority.
 *
 * `getS3ImageUrl` returns an absolute URL unchanged, so without this guard
 * `?key=https://evil.example/phish` is answered with a 302 to that host from
 * the production origin — an open redirect on the endpoint that is now the
 * public, crawled home of every OG and JSON-LD image URL. Stored keys only: the
 * one legacy shape this turns away, an absolute bucket URL, is echoed back
 * *unsigned* and so 403s against the private bucket anyway.
 */
const ABSOLUTE_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function isStoredMediaKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= MAX_S3_KEY_LENGTH &&
    !ABSOLUTE_REFERENCE.test(key)
  );
}

/**
 * Redirect a stored media key to a freshly signed, short-lived S3 URL.
 *
 * Deliberately ungated, like `/api/s3-signed-url`'s GET: every key this serves
 * names media already rendered on public pages, and crawlers refetch the OG and
 * JSON-LD images that point here long after any signature would have expired.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key || !isStoredMediaKey(key)) {
    // One message for both rejections, so the response is not an oracle for
    // which key shapes the bucket accepts.
    return NextResponse.json(
      { error: "Missing or invalid key parameter" },
      { status: 400 },
    );
  }
  try {
    const url = await getS3ImageUrl(key);
    // The signer echoes its input back when it cannot sign. Answering that here
    // keeps the failure deliberate rather than leaving NextResponse.redirect to
    // throw on a bare key, and keeps a non-URL out of the Location header.
    if (!url || url === key) {
      return NextResponse.json(
        { error: "Could not generate signed URL" },
        { status: 500 },
      );
    }
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
}
