import { mapClassServiceError } from "@/services/classes/classErrors";
import {
  idParamSchema,
  photoInputSchema,
} from "@/services/classes/classSchemas";
import { deletePhoto, updatePhoto } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "api.classes.photos.id";

/**
 * PUT /api/classes/photos/[id]
 * Update a photo by path id. Requires admin. The id is taken from the path
 * (not the body) and validated before the body is parsed.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const { id: idRaw } = await params;
  const idParsed = idParamSchema.safeParse({ id: Number(idRaw) });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Invalid photo id", details: idParsed.error.issues },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = photoInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const photo = await updatePhoto(idParsed.data.id, parsed.data);
    logger.info("Class photo updated", {
      context: CONTEXT,
      data: { id: photo.id },
    });
    return NextResponse.json(photo);
  } catch (err) {
    logger.error("Class photo update error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/classes/photos/[id]
 * Delete a photo by path id. Requires admin.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const { id: idRaw } = await params;
  const idParsed = idParamSchema.safeParse({ id: Number(idRaw) });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Invalid photo id", details: idParsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await deletePhoto(idParsed.data.id);
    logger.info("Class photo deleted", {
      context: CONTEXT,
      data: { id: idParsed.data.id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Class photo delete error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
