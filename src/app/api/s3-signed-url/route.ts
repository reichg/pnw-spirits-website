import { signedUploadRequestSchema } from "@/services/media/mediaSchemas";
import { requireAdmin } from "@/utils/auth";
import { getS3ImageUrl, getS3UploadUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";

/**
 * Issue a presigned S3 PUT URL. Admin-only, and deliberately narrower than it
 * looks: the returned URL is a bearer credential for one write, so the caller
 * must be an authenticated admin AND the key/contentType it asks to have signed
 * must pass `signedUploadRequestSchema` before anything is signed.
 */
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  try {
    const parsed = signedUploadRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      // One generic message for every rejection, so the response is not an
      // oracle for which prefixes and content types are accepted.
      return NextResponse.json(
        { error: "Invalid key or contentType in request body" },
        { status: 400 },
      );
    }
    const { key, contentType } = parsed.data;
    const url = await getS3UploadUrl(key, contentType);
    if (!url) {
      return NextResponse.json(
        { error: "Could not generate signed upload URL" },
        { status: 500 },
      );
    }
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate signed upload URL" },
      { status: 500 },
    );
  }
}

/**
 * Resolve a stored media key to a short-lived read URL.
 *
 * Intentionally NOT gated. Every key prefix this bucket holds stores media that
 * is already rendered on public pages, and the public read paths depend on this
 * endpoint: `useS3ImageUrl` (recipe instruction images, card backgrounds) calls
 * it after hydration from anonymous visitors' browsers. Gating it would hide
 * public images, not protect private data.
 *
 * The key is likewise not prefix-constrained here: legacy rows still store
 * absolute S3 URLs, which `getS3ImageUrl` passes through unchanged.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json(
      { error: "Missing key parameter" },
      { status: 400 },
    );
  }
  try {
    const url = await getS3ImageUrl(key);
    if (!url) {
      return NextResponse.json(
        { error: "Could not generate signed URL" },
        { status: 500 },
      );
    }
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
}
