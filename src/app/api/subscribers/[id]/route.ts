import { requireAdmin } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const id = parseInt(params.id, 10);
  if (isNaN(id))
    return NextResponse.json(
      { error: "Invalid subscriber id" },
      { status: 400 },
    );
  await prisma.subscriber.delete({ where: { id } });
  return NextResponse.json({ message: "Subscriber deleted" });
}
