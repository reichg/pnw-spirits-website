import { getS3ImageUrl, getS3UploadUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { key, contentType } = await req.json();
    if (!key || !contentType) {
      return NextResponse.json(
        { error: "Missing key or contentType in request body" },
        { status: 400 },
      );
    }
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
