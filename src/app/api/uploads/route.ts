import { requireAdmin } from "@/utils/auth";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
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

  // Only support image uploads to S3
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image uploads are supported." },
      { status: 400 },
    );
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `blog-media/${filename}`,
      Body: buffer,
      ContentType: file.type,
    }),
  );
  const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/blog-media/${filename}`;
  return NextResponse.json({ url: fileUrl });
}
