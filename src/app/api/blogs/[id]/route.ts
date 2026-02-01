import { requireAdmin } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: { id: string } },
) {
  const { id } = context.params;
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId))
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  const blog = await prisma.blog.findUnique({ where: { id: parsedId } });
  if (!blog)
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  return NextResponse.json(blog);
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
    const { title, content, author } = data;
    console.log("[PUT /api/blogs/:id] Before prisma.blog.update");
    const updated = await prisma.blog.update({
      where: { id: parsedId },
      data: { title, content, author },
    });
    console.log("[PUT /api/blogs/:id] After prisma.blog.update", updated);
    return NextResponse.json(updated);
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
  await prisma.blog.delete({ where: { id: parsedId } });
  return NextResponse.json({ message: "Blog deleted" });
}
