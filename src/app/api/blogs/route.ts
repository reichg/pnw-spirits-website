// API route for /api/blogs

import { requireAdmin } from "@/utils/auth";
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
  let cacheValid = true;
  if (cached) {
    const parsed = JSON.parse(cached);
    // Check coverPhoto expiry for each blog
    for (const blog of parsed.blogs) {
      if (blog.coverPhoto && typeof blog.coverPhoto === "string") {
        // Check for S3 signed URL expiry
        const url = blog.coverPhoto;
        const expiresMatch = url.match(/X-Amz-Expires=(\d+)/);
        const dateMatch = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/);
        if (expiresMatch && dateMatch) {
          const expires = parseInt(expiresMatch[1], 10);
          const dateStr = dateMatch[1];
          logger.info(`s3 blog expire: date=${dateStr} expiresIn=${expires}s`);
          // Parse dateStr (YYYYMMDDTHHMMSSZ)
          const year = parseInt(dateStr.slice(0, 4), 10);
          const month = parseInt(dateStr.slice(4, 6), 10) - 1;
          const day = parseInt(dateStr.slice(6, 8), 10);
          const hour = parseInt(dateStr.slice(9, 11), 10);
          const min = parseInt(dateStr.slice(11, 13), 10);
          const sec = parseInt(dateStr.slice(13, 15), 10);
          const issued = new Date(Date.UTC(year, month, day, hour, min, sec));
          const expiresAt = issued.getTime() + expires * 1000;
          if (Date.now() > expiresAt - 5000) {
            // 5s buffer
            cacheValid = false;
            break;
          }
        }
      }
    }
    if (cacheValid) {
      logger?.info?.("Blogs cache hit (redis, valid)", {
        context: "/api/blogs",
        data: { page, pageSize, search },
      });
      return NextResponse.json(parsed);
    } else {
      logger?.info?.("Blogs cache invalidated due to expired coverPhoto", {
        context: "/api/blogs",
        data: { page, pageSize, search },
      });
      await redis.del(cacheKey);
    }
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
  // Only return S3 keys for coverPhoto; signed URLs are fetched on-demand by the frontend
  const blogs = blogsRaw;
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
