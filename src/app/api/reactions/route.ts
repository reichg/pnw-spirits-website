// API route for /api/reactions
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";

export async function GET(req: NextRequest) {
  // Get reactions by blog
  const { searchParams } = new URL(req.url);
  const blogId = parseInt(searchParams.get("blogId") || "0", 10);
  if (!blogId) return NextResponse.json({ error: "Missing blogId" }, { status: 400 });
  const reactions = await prisma.reaction.findMany({
    where: { blogId },
  });
  return NextResponse.json({ reactions });
}

export async function POST(req: NextRequest) {
  // Add reaction
  try {
    const data = await req.json();
    const { blogId, type } = data;
    if (!blogId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // Increment if exists, else create
    const existing = await prisma.reaction.findFirst({ where: { blogId, type } });
    let reaction;
    if (existing) {
      reaction = await prisma.reaction.update({
        where: { id: existing.id },
        data: { count: { increment: 1 } },
      });
    } else {
      reaction = await prisma.reaction.create({ data: { blogId, type, count: 1 } });
    }
    return NextResponse.json(reaction, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
  }
}
