// API route for /api/blogs

import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../../generated/prisma";

export async function GET(req: NextRequest) {
  // List blogs (pagination, search)
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);
  const search = searchParams.get("search") || "";

  const cacheKey = `blogs:page=${page}:size=${pageSize}:search=${search}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger?.info?.("Blogs cache hit (redis)", {
      context: "/api/blogs",
      data: { page, pageSize, search },
    });
    return NextResponse.json(JSON.parse(cached));
  }

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { content: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : {};

  const blogsRaw = await prisma.blog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  // Resolve S3 signed URLs for coverPhoto (server-side)
  const blogs = await Promise.all(
    blogsRaw.map(async (blog) => ({
      ...blog,
      coverPhoto: blog.coverPhoto ? await getS3ImageUrl(blog.coverPhoto) : null,
    })),
  );
  const total = await prisma.blog.count({ where });
  const response = { blogs, total, page, pageSize };
  await redis.set(cacheKey, JSON.stringify(response), "EX", 60 * 60); // cache for 60 minutes
  logger?.info?.("Blogs cache miss, fetched and cached (redis)", {
    context: "/api/blogs",
    data: { page, pageSize, search },
  });
  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  try {
    const data = await req.json();
    // Check if data is an array (batch create) or single object
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return NextResponse.json(
          { error: "No blogs provided" },
          { status: 400 },
        );
      }
      // Validate all entries
      const invalid = data.find(
        (item) => !item.title || !item.content || !item.author,
      );
      if (invalid) {
        return NextResponse.json(
          { error: "Each blog must have title, content, and author" },
          { status: 400 },
        );
      }
      // Use createMany for batch insert (coverPhoto is optional)
      const result = await prisma.blog.createMany({
        data: data.map(({ title, content, author, coverPhoto }) => ({
          title,
          content,
          author,
          coverPhoto: coverPhoto || null,
        })),
      });
      // Invalidate all blog list cache entries in Redis
      const keys = await redis.keys("blogs:*");
      if (keys.length > 0) await redis.del(...keys);
      return NextResponse.json({ count: result.count }, { status: 201 });
    } else {
      // Accept coverPhoto (URL or file reference) in single create
      const { title, content, author, coverPhoto } = data;
      if (!title || !content || !author) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 },
        );
      }
      // Store coverPhoto if provided, else null
      const blog = await prisma.blog.create({
        data: { title, content, author, coverPhoto: coverPhoto || null },
      });
      // Invalidate all blog list cache entries in Redis
      const keys = await redis.keys("blogs:*");
      if (keys.length > 0) await redis.del(...keys);
      return NextResponse.json(blog, { status: 201 });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to create blog" },
      { status: 500 },
    );
  }
}
