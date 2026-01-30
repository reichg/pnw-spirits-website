// API route for /api/comments
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // List comments by blog
  const { searchParams } = new URL(req.url);
  const blogId = parseInt(searchParams.get("blogId") || "0", 10);
  if (!blogId)
    return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  const comments = await prisma.comment.findMany({
    where: { blogId },
    orderBy: { createdAt: "asc" },
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
