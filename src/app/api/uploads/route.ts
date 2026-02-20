import { requireAdmin } from "@/utils/auth";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Image size must be under 5MB." },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".")
      ? file.name.substring(file.name.lastIndexOf("."))
      : ".bin";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    // S3 setup
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    const bucket = process.env.AWS_S3_BUCKET!;

    // Determine S3 directory based on type
    const s3Dir =
      type === "cover"
        ? "blog-media/blog-cover-photos"
        : "blog-media/blog-content-media";

    const s3Key = `${s3Dir}/${filename}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: file.type,
      }),
    );
    // Return only the S3 key, not the full URL
    return NextResponse.json({ key: s3Key });
  } catch (err) {
    return NextResponse.json(
      { error: "Image upload failed. Please try again." },
      { status: 500 },
    );
  }
}
