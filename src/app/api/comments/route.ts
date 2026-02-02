// API route for /api/comments
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // List comments by blog
  const { searchParams } = new URL(req.url);
  const blogId = parseInt(searchParams.get("blogId") || "0", 10);
  if (!blogId)
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  const cacheKey = `comments:blogId=${blogId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger?.info?.("Comments cache hit (redis)", {
      context: "/api/comments",
      data: { blogId },
    });
    return NextResponse.json({ comments: JSON.parse(cached) });
  }
  const comments = await prisma.comment.findMany({
    where: { blogId },
    orderBy: { createdAt: "asc" },
  });
  await redis.set(cacheKey, JSON.stringify(comments), "EX", 5 * 60); // cache for 5 minutes
  logger?.info?.("Comments cache miss, fetched and cached (redis)", {
    context: "/api/comments",
    data: { blogId },
  });
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest) {
  // Add comment
  try {
    const data = await req.json();
    const { blogId, name, comment } = data;
    if (!blogId || !name || !comment) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }
    const newComment = await prisma.comment.create({
      data: { blogId, name, comment },
    });
    return NextResponse.json(newComment, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 },
    );
  }
}
