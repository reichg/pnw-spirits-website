import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }
  // Note: Add authentication/authorization if needed for sensitive media
}
