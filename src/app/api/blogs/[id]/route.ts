import { requireAdmin } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { invalidateBlogCache } from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";

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
    console.log("[PUT /api/blogs/:id] Incoming data:", data);
    const { title, content, author, coverPhoto } = data;
    console.log("[PUT /api/blogs/:id] Before prisma.blog.update");
    const updated = await prisma.blog.update({
      where: { id: parsedId },
      data: { title, content, author, coverPhoto },
    });
    console.log("[PUT /api/blogs/:id] After prisma.blog.update", updated);
    await invalidateBlogCache();
    // Resolve coverPhoto to signed S3 URL if present
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
  await prisma.blog.delete({ where: { id: parsedId } });
  // Invalidate all blog list cache entries in Redis
  await invalidateBlogCache();
  return NextResponse.json({ message: "Blog deleted" });
}
