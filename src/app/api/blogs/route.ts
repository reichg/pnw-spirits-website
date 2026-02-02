// API route for /api/blogs

import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";
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

  const blogs = await prisma.blog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.blog.count({ where });
  const response = { blogs, total, page, pageSize };
  await redis.set(cacheKey, JSON.stringify(response), "EX", 8 * 60); // cache for 8 minutes
  logger?.info?.("Blogs cache miss, fetched and cached (redis)", {
    context: "/api/blogs",
    data: { page, pageSize, search },
  });
  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
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
      // Use createMany for batch insert
      const result = await prisma.blog.createMany({
        data: data.map(({ title, content, author }) => ({
          title,
          content,
          author,
        })),
      });
      // Invalidate all blog list cache entries in Redis
      const keys = await redis.keys("blogs:*");
      if (keys.length > 0) await redis.del(...keys);
      return NextResponse.json({ count: result.count }, { status: 201 });
    } else {
      const { title, content, author } = data;
      if (!title || !content || !author) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 },
        );
      }
      const blog = await prisma.blog.create({
        data: { title, content, author },
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
