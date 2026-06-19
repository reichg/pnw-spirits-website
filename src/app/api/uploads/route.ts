import { requireAdmin } from "@/utils/auth";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    // Validate file type (only allow JPEG, PNG, GIF, WEBP)
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, GIF, or WEBP images are allowed." },
        { status: 400 },
      );
    }
    // Validate file size (max 15MB)
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Image size must be under 15MB." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;

    // S3 setup
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    const bucket = process.env.AWS_S3_BUCKET!;

    // Determine S3 directory based on type (blog or recipe)
    let s3Dir;
    if (type === "cover") {
      s3Dir = "blog-media/blog-cover-photos";
    } else if (
      type === "content" ||
      type === "blog-image" ||
      type === "blog-video" ||
      type === "blog-media"
    ) {
      s3Dir = "blog-media/blog-content-media";
    } else if (type === "recipe-cover") {
      s3Dir = "recipe-media/recipe-cover-photos";
    } else if (type === "recipe-content") {
      s3Dir = "recipe-media/recipe-content-media";
    } else {
      s3Dir = "misc-media";
    }

    const s3Key = `${s3Dir}/${filename}`;
    // Check if object already exists in S3
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
      // If no error, object exists
      return NextResponse.json({ key: s3Key, existed: true });
    } catch (err: unknown) {
      const httpStatusCode = (
        err as { $metadata?: { httpStatusCode?: number } }
      )?.$metadata?.httpStatusCode;
      if (httpStatusCode !== 404) {
        // Unexpected error
        return NextResponse.json(
          { error: "Failed to check S3 for existing object." },
          { status: 500 },
        );
      }
      // Not found, proceed to upload
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: file.type,
        }),
      );
      return NextResponse.json({ key: s3Key, existed: false });
    }
  } catch {
    return NextResponse.json(
      { error: "Image upload failed. Please try again." },
      { status: 500 },
    );
  }
}
