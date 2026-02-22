import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { invalidateBlogCache } from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";
import { deleteS3Objects } from "../../../../utils/s3";
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
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId))
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  const blog = await prisma.blog.findUnique({ where: { id: parsedId } });
  if (!blog)
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  // Resolve coverPhoto to signed S3 URL if present
  const coverPhotoUrl = blog.coverPhoto
    ? await getS3ImageUrl(blog.coverPhoto)
    : null;
  return NextResponse.json({ ...blog, coverPhoto: coverPhotoUrl });
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = requireAdmin(req);
    if (authResult) return authResult;
    const { id } = await context.params;
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId))
      return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
    const data = await req.json();
    const { title, content, author, coverPhoto } = data;
    // Fetch previous blog to compare coverPhoto
    const prevBlog = await prisma.blog.findUnique({ where: { id: parsedId } });
    let shouldDeletePrevPhoto = false;
    if (prevBlog && prevBlog.coverPhoto && prevBlog.coverPhoto !== coverPhoto) {
      // Check if previous coverPhoto is referenced elsewhere
      const otherBlogs = await prisma.blog.findMany({
        where: {
          coverPhoto: prevBlog.coverPhoto,
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
      data: { title, content, author, coverPhoto },
    });
    if (shouldDeletePrevPhoto) {
      try {
        if (prevBlog && prevBlog.coverPhoto) {
          await deleteS3Objects(prevBlog.coverPhoto);
          logger.info("Deleted unused S3 coverPhoto", {
            context: "blog.update",
            data: { coverPhoto: prevBlog.coverPhoto },
          });
        }
      } catch (err) {
        logger.error("Failed to delete S3 coverPhoto", {
          context: "blog.update",
          data: { coverPhoto: prevBlog?.coverPhoto, error: err },
        });
      }
    }
    await invalidateBlogCache();
    const coverPhotoUrl = updated.coverPhoto
      ? await getS3ImageUrl(updated.coverPhoto)
      : null;
    return NextResponse.json({ ...updated, coverPhoto: coverPhotoUrl });
  } catch (error) {
    console.error("[PUT /api/blogs/:id] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to update blog",
        details: error instanceof Error ? error.message : String(error),
      },
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
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId))
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
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
    logger.info("Extracted file names from blog content", {
      context: "blog.delete",
      data: { fileNames, content: blog.content },
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
}
