import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  // Upload file to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `blog-media/${filename}`,
      Body: buffer,
      ContentType: file.type,
    }),
  );
  const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/blog-media/${filename}`;

  // If video, generate a poster image using ffmpeg and upload to S3
  const isVideo = file.type.startsWith("video/");
  let posterUrl = null;
  if (isVideo) {
    const posterFilename = `${filename.replace(ext, "")}-poster.jpg`;
    const tmpDir = os.tmpdir();
    const tmpVideoPath = path.join(tmpDir, filename);
    const tmpPosterPath = path.join(tmpDir, posterFilename);
    // Ensure tmpDir exists (should always exist, but safe on Windows)
    await import("fs").then((fs) =>
      fs.promises.mkdir(tmpDir, { recursive: true }),
    );
    // Save video to tmp for ffmpeg
    await import("fs").then((fs) =>
      fs.promises.writeFile(tmpVideoPath, buffer),
    );
    try {
      await execFileAsync("ffmpeg", [
        "-i",
        tmpVideoPath,
        "-ss",
        "00:00:01.000",
        "-vframes",
        "1",
        "-vf",
        "scale=640:-1",
        tmpPosterPath,
      ]);
      // Read poster buffer
      const posterBuffer = await import("fs").then((fs) =>
        fs.promises.readFile(tmpPosterPath),
      );
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `blog-media/${posterFilename}`,
          Body: posterBuffer,
          ContentType: "image/jpeg",
        }),
      );
      posterUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/blog-media/${posterFilename}`;
    } catch (err) {
      posterUrl = null;
    }
    // Clean up tmp files
    await import("fs").then((fs) =>
      Promise.all([
        fs.promises.unlink(tmpVideoPath),
        fs.promises.unlink(tmpPosterPath),
      ]).catch(() => {}),
    );
  }
  return NextResponse.json({ url: fileUrl, poster: posterUrl });
}
