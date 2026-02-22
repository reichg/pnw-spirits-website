import { PutObjectCommand } from "@aws-sdk/client-s3";
/**
 * Returns a short-lived (15 min) signed S3 upload URL for a given key and content type.
 * Uses AWS credentials from environment variables for private uploads.
 *
 * @param key S3 object key (where to upload)
 * @param contentType MIME type of the file
 * @returns Promise<string | undefined> Signed upload URL or undefined
 */
export async function getS3UploadUrl(
  key: string,
  contentType: string,
): Promise<string | undefined> {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    logger.error(
      "Missing S3 environment variables for upload signed URL generation",
      {
        context: "getS3UploadUrl",
        data: {
          region,
          bucket,
          accessKeyId: !!accessKeyId,
          secretAccessKey: !!secretAccessKey,
        },
      },
    );
    return undefined;
  }

  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  try {
    const expiresIn = 15 * 60; // 15 minutes
    const signedUrl: string = await getSignedUrl(s3, command, {
      expiresIn,
    });
    logger.info("S3 signed upload URL generated", {
      context: "getS3UploadUrl",
      data: { key, signedUrl },
    });
    return signedUrl;
  } catch (error) {
    logger.error("Failed to generate S3 signed upload URL", {
      context: "getS3UploadUrl",
      data: { key, error: (error as Error).message },
    });
    return undefined;
  }
}
// Utility to get the full S3 image URL from a key or return the URL if already absolute
// Always use NEXT_PUBLIC_S3_BASE_URL from env for the bucket base URL
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

/**
 * Returns a short-lived (1 hour) signed S3 image URL for a given key, or returns the URL if already absolute.
 * Uses AWS credentials from environment variables for private images.
 * Logs every retrieval attempt and result for observability.
 *
 * @param keyOrUrl S3 object key or absolute URL
 * @returns Promise<string | undefined> Signed URL or undefined
 * @throws Error if S3 environment variables are missing or signing fails (returns fallback URL)
 */
export async function getS3ImageUrl(
  keyOrUrl?: string | null,
): Promise<string | undefined> {
  if (!keyOrUrl) return undefined;
  if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
    logger.info("S3 image retrieved (absolute URL)", {
      context: "getS3ImageUrl",
      data: { image: keyOrUrl, keyOrUrl },
    });
    return keyOrUrl;
  }

  // Gather required environment variables
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    logger.error("Missing S3 environment variables for signed URL generation", {
      context: "getS3ImageUrl",
      data: {
        region,
        bucket,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey,
      },
    });
    // fallback: return as-is
    return keyOrUrl;
  }

  // Create S3 client with credentials from env
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  // Prepare the GetObjectCommand for the requested key
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: keyOrUrl,
  });

  try {
    // Generate a signed URL valid for 1 hour (best practice for security)
    const expiresIn = 60 * 60; // seconds
    const signedUrl: string = await getSignedUrl(s3, command, {
      expiresIn,
    });
    logger.info("S3 signed image URL generated", {
      context: "getS3ImageUrl",
      data: { image: signedUrl, keyOrUrl },
    });
    return signedUrl;
  } catch (error) {
    logger.error("Failed to generate S3 signed URL", {
      context: "getS3ImageUrl",
      data: { keyOrUrl, error: (error as Error).message },
    });
    // fallback: return as-is
    return keyOrUrl;
  }
}
