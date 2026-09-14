// API route for /api/comments
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";
import { rowIdParamSchema, rowIdSchema } from "@/utils/rowId";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "/api/comments";

export async function GET(req: NextRequest) {
  // List comments by blog
  const { searchParams } = new URL(req.url);
  const blogIdRaw = searchParams.get("blogId");
  if (blogIdRaw === null)
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  // `parseInt(... || "0")` stood here, and `!blogId` caught only 0 and NaN. So
  // `?blogId=99999999999` passed the guard, was interpolated into the cache key
  // below, and reached an unguarded `findMany` where the driver rejects a value
  // the Int column cannot hold - an anonymous 500 on a public read, reachable
  // with a query string. The shared parser is the same one every `[id]` route
  // uses; a null from an absent key is caught above rather than coerced to 0.
  const blogIdParsed = rowIdParamSchema.safeParse(blogIdRaw);
  if (!blogIdParsed.success)
    return NextResponse.json({ error: "Invalid blogId" }, { status: 400 });
  const blogId = blogIdParsed.data;
  // Previously unguarded: a throw from Redis or Prisma left the handler
  // entirely and the caller saw whatever Next.js decided to render. The body on
  // success is unchanged - every comment field is public content.
  try {
    const cacheKey = `comments:blogId=${blogId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger?.info?.("Comments cache hit (redis)", {
        context: CONTEXT,
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
      context: CONTEXT,
      data: { blogId },
    });
    return NextResponse.json({ comments });
  } catch (err) {
    logger.error("Failed to fetch comments", {
      context: CONTEXT,
      data: { blogId, error: err },
    });
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  // Add comment
  let data;
  try {
    data = await req.json();
  } catch {
    // A malformed body is exactly what an anonymous caller sends, and it is a
    // client error: it used to fall into the catch below and come back as the
    // generic "Failed to add comment" 500 this handler keeps for a failed write.
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // `?? {}` so a body that parses to `null` or to a bare scalar misses the
  // required fields instead of throwing on the destructure.
  const { blogId: blogIdRaw, name, comment } = data ?? {};
  if (blogIdRaw === undefined || !name || !comment) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }
  // The GET half above parses blogId with the shared row-id schema; this half
  // read the same parameter out of an anonymous JSON body behind `!blogId`
  // alone and handed it straight to `create`. So `{"blogId": 2147483648}` and
  // `{"blogId": "0x1f"}` reached the driver as an anonymous 500, and
  // `{"blogId": 59.5}` was truncated onto blog 59. Same parameter and same
  // file, so the same parser and the same wording as the GET; `rowIdSchema` is
  // the number form because this id arrives already typed by JSON.
  const blogIdParsed = rowIdSchema.safeParse(blogIdRaw);
  if (!blogIdParsed.success)
    return NextResponse.json({ error: "Invalid blogId" }, { status: 400 });
  const blogId = blogIdParsed.data;
  try {
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
