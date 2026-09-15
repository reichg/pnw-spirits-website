// API route for /api/reactions
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { rowIdParamSchema, rowIdSchema } from "@/utils/rowId";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "/api/reactions";

export async function GET(req: NextRequest) {
  // Get reactions by blog
  const { searchParams } = new URL(req.url);
  const blogIdRaw = searchParams.get("blogId");
  if (blogIdRaw === null)
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  // Same defect and same fix as the sibling /api/comments GET: `parseInt(... ||
  // "0")` with a `!blogId` guard let `?blogId=99999999999` through to an
  // unguarded `findMany`, where the driver rejects a value the Int column cannot
  // hold - an anonymous 500 on a public read.
  const blogIdParsed = rowIdParamSchema.safeParse(blogIdRaw);
  if (!blogIdParsed.success)
    return NextResponse.json({ error: "Invalid blogId" }, { status: 400 });
  const blogId = blogIdParsed.data;
  // Previously unguarded: a throw left the handler entirely and the caller saw
  // whatever Next.js decided to render. The success body is unchanged.
  try {
    const reactions = await prisma.reaction.findMany({
      where: { blogId },
    });
    return NextResponse.json({ reactions });
  } catch (err) {
    logger.error("Failed to fetch reactions", {
      context: CONTEXT,
      data: { blogId, error: err },
    });
    return NextResponse.json(
      { error: "Failed to fetch reactions" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  // Add reaction
  let data;
  try {
    data = await req.json();
  } catch {
    // Same client error, same answer as the sibling /api/comments POST: a
    // malformed body used to fall into the catch below and come back as the
    // generic "Failed to add reaction" 500 kept for a failed write.
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // `?? {}` so a body that parses to `null` or to a bare scalar misses the
  // required fields instead of throwing on the destructure.
  const { blogId: blogIdRaw, type } = data ?? {};
  if (blogIdRaw === undefined || !type) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }
  // Same defect and same fix as the sibling /api/comments POST, and as the GET
  // half above: blogId came out of an anonymous JSON body behind `!blogId`
  // alone and reached `findFirst`/`create`, so `{"blogId": 2147483648}` was an
  // anonymous 500. `rowIdSchema` is the number form because this id arrives
  // already typed by JSON; the wording matches the GET half of this file.
  const blogIdParsed = rowIdSchema.safeParse(blogIdRaw);
  if (!blogIdParsed.success)
    return NextResponse.json({ error: "Invalid blogId" }, { status: 400 });
  const blogId = blogIdParsed.data;
  try {
    // Increment if exists, else create
    const existing = await prisma.reaction.findFirst({
      where: { blogId, type },
    });
    let reaction;
    if (existing) {
      reaction = await prisma.reaction.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    } else {
      reaction = await prisma.reaction.create({
        data: { blogId, type, count: 1 },
      });
    }
    return NextResponse.json(reaction, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 },
    );
  }
}
