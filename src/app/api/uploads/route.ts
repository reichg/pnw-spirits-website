import { logger } from "@/utils/logger";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";

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

  // Cloudinary setup
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
    secure: true,
  });

  // Upload file to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `blog-media/${filename}`,
      Body: buffer,
      ContentType: file.type,
    }),
  );
  // Generate a pre-signed S3 URL for the uploaded video
  const fileUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/blog-media/${filename}`;

  // If video, generate a poster image using Cloudinary (from S3 URL)
  const isVideo = file.type.startsWith("video/");
  let posterUrl = null;
  if (isVideo) {
    try {
      // Upload video to Cloudinary using a Promise wrapper
      logger.info("Uploading video to Cloudinary...");
      const uploadToCloudinary = (buffer: Buffer, publicId: string) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: "video",
              folder: "blog-media",
              public_id: publicId,
            },
            (error, result) => {
              if (error) {
                logger.error(`Cloudinary video upload error: ${error}`);
                reject(error);
              } else {
                logger.info(
                  `Cloudinary video upload result: ${JSON.stringify(result)}`,
                );
                resolve(result);
              }
            },
          );
          stream.end(buffer);
        });
      };

      await uploadToCloudinary(buffer, filename.replace(ext, ""));
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
      const cloudinaryVideoPublicId = `blog-media/${filename.replace(ext, "")}`;
      const cloudinaryPosterUrl = `https://res.cloudinary.com/${cloudName}/video/upload/so_1,w_640,c_scale/${cloudinaryVideoPublicId}.jpg`;
      logger.info(`Cloudinary poster URL: ${cloudinaryPosterUrl}`);

      // Download the poster image from Cloudinary
      let posterResponse;
      try {
        posterResponse = await fetch(cloudinaryPosterUrl);
      } catch (fetchErr) {
        logger.error(`Error fetching poster from Cloudinary: ${fetchErr}`);
        throw new Error(`Fetch failed: ${fetchErr}`);
      }
      if (!posterResponse.ok) {
        logger.error(
          `Cloudinary fetch failed. Status: ${posterResponse.status}`,
        );
        throw new Error(
          `Failed to fetch poster from Cloudinary. Status: ${posterResponse.status}`,
        );
      }
      const posterBuffer = Buffer.from(await posterResponse.arrayBuffer());

      // Upload the poster image to S3
      const posterFilename = `${filename.replace(ext, "")}-poster.jpg`;
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
      logger.error(`Error generating/uploading poster image: ${err}`);
      posterUrl = null;
    }
  }
  return NextResponse.json({ url: fileUrl, poster: posterUrl });
}
