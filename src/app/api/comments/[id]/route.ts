import { requireAdmin } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { rowIdParamSchema } from "@/utils/rowId";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const { id } = await context.params;
  const parsedId = rowIdParamSchema.safeParse(id);
  if (!parsedId.success)
    return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
  await prisma.comment.delete({ where: { id: parsedId.data } });
  return NextResponse.json({ message: "Comment deleted" });
}
