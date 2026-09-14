import {
  BLOG_MEDIA_PREFIX,
  MISC_MEDIA_PREFIX,
  RECIPE_MEDIA_PREFIX,
  UPLOAD_IMAGE_CONTENT_TYPES,
  type UploadKeyPrefix,
} from "@/services/media/mediaSchemas";
import { requireAdmin } from "@/utils/auth";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * The image allowlist as a reader sees it, derived rather than re-typed in
 * prose, so widening `UPLOAD_IMAGE_CONTENT_TYPES` cannot leave this message
 * naming a set the route no longer enforces.
 */
const ALLOWED_IMAGE_NAMES = UPLOAD_IMAGE_CONTENT_TYPES.map((type) =>
  type.replace(/^image\//, "").toUpperCase(),
).join(", ");

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
    // Validate file type. Shares one allowlist with the presigned-upload route
    // so the two upload paths cannot drift on what may enter the bucket. This
    // route stays image-only: it does not accept the video types the presigned
    // path allows.
    if (!UPLOAD_IMAGE_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Only ${ALLOWED_IMAGE_NAMES} images are allowed.` },
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

    // Determine S3 directory based on type (blog or recipe). Rooted in the
    // shared namespace prefixes and typed against them, so a directory added
    // here that the presigned route would reject cannot compile.
    let s3Dir: `${UploadKeyPrefix}${string}`;
    if (type === "cover") {
      s3Dir = `${BLOG_MEDIA_PREFIX}blog-cover-photos/`;
    } else if (
      type === "content" ||
      type === "blog-image" ||
      type === "blog-video" ||
      type === "blog-media"
    ) {
      s3Dir = `${BLOG_MEDIA_PREFIX}blog-content-media/`;
    } else if (type === "recipe-cover") {
      s3Dir = `${RECIPE_MEDIA_PREFIX}recipe-cover-photos/`;
    } else if (type === "recipe-content") {
      s3Dir = `${RECIPE_MEDIA_PREFIX}recipe-content-media/`;
    } else {
      s3Dir = MISC_MEDIA_PREFIX;
    }

    const s3Key = `${s3Dir}${filename}`;
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
