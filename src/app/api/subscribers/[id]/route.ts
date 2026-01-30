import { requireAdmin } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const { id } = await context.params;
  const parsedId = parseInt(id, 10);  
  if (isNaN(parsedId))
    return NextResponse.json(
      { error: "Invalid subscriber id" },
      { status: 400 },
    );
  await prisma.subscriber.delete({ where: { id: parsedId } });
  return NextResponse.json({ message: "Subscriber deleted" });
}
