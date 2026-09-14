import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { invalidateBlogCache } from "@/utils/redisClient";
import { rowIdParamSchema } from "@/utils/rowId";
import { deleteS3Objects, getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CONTEXT = "api.blogs.id";

/**
 * The PUT body, which is untrusted and is spread into `prisma.blog.update`.
 *
 * Deliberately types the fields without adding business rules: the point is
 * that a wrong-typed field is answered with a 400 here instead of throwing out
 * of Prisma and into the catch below, which is what surfaced a raw database
 * error to the caller. Emptiness and length rules are the editor's to own.
 *
 * `coverPhoto` must keep all three of its states distinct, because the admin
 * editor uses them as a protocol: absent means "leave the photo alone" (Prisma
 * skips an `undefined` field), explicit null means "clear it", and a string
 * sets it. `.nullish()` preserves exactly that.
 */
const BlogUpdateInput = z.object({
  title: z.string(),
  content: z.string(),
  author: z.string(),
  coverPhoto: z.string().nullish(),
});

// Utility to extract file names from blog content
function extractFileNamesFromContent(content: string): string[] {
  // Match file names in URLs (e.g., .../something.jpg, .../file.png)
  const regex = /([a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi))/gi;
  const fileNames: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    fileNames.push(match[1]);
  }
  return fileNames;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const idResult = rowIdParamSchema.safeParse(id);
  if (!idResult.success)
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  const parsedId = idResult.data;
  // Previously unguarded: a throw from Prisma or S3 left the handler entirely,
  // and what the caller then saw was Next.js's default, which is not generic in
  // every environment. Every field of Blog is public content, so the success
  // body is unchanged.
  try {
    const blog = await prisma.blog.findUnique({ where: { id: parsedId } });
    if (!blog)
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    // Resolve coverPhoto to signed S3 URL if present
    const coverPhotoUrl = blog.coverPhoto
      ? await getS3ImageUrl(blog.coverPhoto)
      : null;
    // Return both the S3 key and the signed URL for frontend compatibility
    return NextResponse.json({
      ...blog,
      coverPhoto: blog.coverPhoto || null,
      coverImageUrl: coverPhotoUrl,
    });
  } catch (err) {
    logger.error("Failed to fetch blog", {
      context: CONTEXT,
      data: { id: parsedId, error: err },
    });
    return NextResponse.json(
      { error: "Failed to fetch blog" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = requireAdmin(req);
    if (authResult) return authResult;
    const { id } = await context.params;
    const idResult = rowIdParamSchema.safeParse(id);
    if (!idResult.success)
      return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
    const parsedId = idResult.data;
    const parsedBody = BlogUpdateInput.safeParse(await req.json());
    if (!parsedBody.success)
      return NextResponse.json(
        { error: "Invalid input", details: parsedBody.error.issues },
        { status: 400 },
      );
    const { title, content, author, coverPhoto } = parsedBody.data;
    // Helper to extract S3 key from a signed URL or return as-is if already a key
    function extractS3Key(
      input: string | null | undefined,
    ): string | null | undefined {
      if (!input) return input;
      try {
        // If input is a signed URL, extract the path after the bucket domain
        const url = new URL(input);
        // Remove leading slash
        return url.pathname.startsWith("/")
          ? url.pathname.slice(1)
          : url.pathname;
      } catch {
        // Not a URL, assume it's already a key
        return input;
      }
    }
    // Always store and compare S3 keys only
    const prevBlog = await prisma.blog.findUnique({ where: { id: parsedId } });
    // This row was already being read for its previous coverPhoto, so answering
    // 404 here costs no extra query and matches GET and DELETE. Without it the
    // update below threw Prisma's P2025 into the catch, which is the likeliest
    // way a real caller ever saw the raw database message this handler leaked.
    if (!prevBlog)
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    const prevKey = extractS3Key(prevBlog.coverPhoto);
    const newKey = extractS3Key(coverPhoto);
    let shouldDeletePrevPhoto = false;
    if (prevKey && prevKey !== newKey) {
      // Check if previous coverPhoto is referenced elsewhere
      const otherBlogs = await prisma.blog.findMany({
        where: {
          coverPhoto: prevKey,
          id: { not: parsedId },
        },
      });
      if (otherBlogs.length === 0) {
        shouldDeletePrevPhoto = true;
      }
    }
    // Prevent duplicate uploads: if coverPhoto is unchanged, don't re-upload
    // (Assume upload logic is elsewhere; here, just avoid unnecessary S3 actions)
    const updated = await prisma.blog.update({
      where: { id: parsedId },
      data: { title, content, author, coverPhoto: newKey },
    });
    // `shouldDeletePrevPhoto` is only ever set inside `if (prevKey && ...)`, so
    // re-testing prevKey changes no behavior; it is what narrows the key to a
    // string for deleteS3Objects, which the old `any` return type had been
    // hiding rather than satisfying.
    if (shouldDeletePrevPhoto && prevKey) {
      try {
        await deleteS3Objects(prevKey);
        logger.info("Deleted unused S3 coverPhoto", {
          context: "blog.update",
          data: { coverPhoto: prevKey },
        });
      } catch (err) {
        logger.error("Failed to delete S3 coverPhoto", {
          context: "blog.update",
          data: { coverPhoto: prevKey, error: err },
        });
      }
    }
    await invalidateBlogCache();
    const coverPhotoUrl = updated.coverPhoto
      ? await getS3ImageUrl(updated.coverPhoto)
      : null;
    // Always return the S3 key as coverPhoto, and the signed URL as coverImageUrl
    return NextResponse.json({
      ...updated,
      coverPhoto: updated.coverPhoto || null,
      coverImageUrl: coverPhotoUrl,
    });
  } catch (error) {
    // The project logger, not console.error: it serializes the payload, which
    // escapes the newlines a bare console.error would have written straight
    // into the log stream, and it unwraps the Error that JSON.stringify alone
    // would have flattened to `{}`.
    logger.error("Failed to update blog", {
      context: CONTEXT,
      data: { error },
    });
    // The detail stays in the log. A Prisma error carries the failing model,
    // column and constraint, and a connection error carries the database host;
    // an admin session is a privileged caller, not a debugging console.
    return NextResponse.json(
      { error: "Failed to update blog" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const { id } = await context.params;
  const idResult = rowIdParamSchema.safeParse(id);
  if (!idResult.success)
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  const parsedId = idResult.data;
  // Previously unguarded, like GET: the per-object S3 deletes below each have
  // their own catch, but the three Prisma calls and the cache invalidation did
  // not, so any of them left the handler and let Next.js decide what the caller
  // saw. The individual S3 catches are left as they are - a media object that
  // will not delete must not abort the row delete.
  try {
    const blog = await prisma.blog.findUnique({ where: { id: parsedId } });
    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }
    // Delete associated media from S3 if not referenced elsewhere
    // 1. Cover photo
    if (blog.coverPhoto) {
      const otherBlogs = await prisma.blog.findMany({
        where: {
          coverPhoto: blog.coverPhoto,
          id: { not: parsedId },
        },
      });
      if (otherBlogs.length === 0) {
        try {
          await deleteS3Objects(blog.coverPhoto);
          logger.info("Deleted unused S3 coverPhoto", {
            context: "blog.delete",
            data: { coverPhoto: blog.coverPhoto },
          });
        } catch (err) {
          logger.error("Failed to delete S3 coverPhoto", {
            context: "blog.delete",
            data: { coverPhoto: blog.coverPhoto, error: err },
          });
        }
      }
    }
    // 2. Media in blog content
    if (blog.content) {
      const fileNames = extractFileNamesFromContent(blog.content);
      // The extracted names are the diagnostic value here; the whole post body
      // used to be written to the log alongside them on every delete.
      logger.info("Extracted file names from blog content", {
        context: "blog.delete",
        data: { fileNames },
      });
      for (const fileName of fileNames) {
        // Assume all blog content media are stored under blog-media/blog-content-media/
        const s3Key = `blog-media/blog-content-media/${fileName}`;
        try {
          await deleteS3Objects(s3Key);
          logger.info("Deleted S3 blog content media by exact key", {
            context: "blog.delete",
            data: { fileName, s3Key },
          });
        } catch (err) {
          logger.error("Failed to delete S3 blog content media by exact key", {
            context: "blog.delete",
            data: { fileName, s3Key, error: err },
          });
        }
      }
    }
    await prisma.blog.delete({ where: { id: parsedId } });
    await invalidateBlogCache();
    return NextResponse.json({ message: "Blog deleted" });
  } catch (err) {
    logger.error("Failed to delete blog", {
      context: CONTEXT,
      data: { id: parsedId, error: err },
    });
    return NextResponse.json(
      { error: "Failed to delete blog" },
      { status: 500 },
    );
  }
}
