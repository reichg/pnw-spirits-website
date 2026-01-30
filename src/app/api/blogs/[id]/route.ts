import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const resolved = params instanceof Promise ? await params : params;
  const { id } = resolved;
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
  { params }: { params: { id: string } },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const id = parseInt(params.id, 10);
  if (isNaN(id))
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  const data = await req.json();
  const { title, content } = data;
  const updated = await prisma.blog.update({
    where: { id },
    data: { title, content },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const id = parseInt(params.id, 10);
  if (isNaN(id))
    return NextResponse.json({ error: "Invalid blog id" }, { status: 400 });
  await prisma.blog.delete({ where: { id } });
  return NextResponse.json({ message: "Blog deleted" });
}
