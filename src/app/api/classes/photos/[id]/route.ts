import { mapClassServiceError } from "@/services/classes/classErrors";
import {
  classBodyErrorMessage,
  photoInputSchema,
} from "@/services/classes/classSchemas";
import { deletePhoto, updatePhoto } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { rowIdParamSchema } from "@/utils/rowId";
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
  // The raw segment goes in unconverted: the `Number(idRaw)` that used to
  // stand here is the defect, not the parser after it. `details` is dropped
  // with it - one short message is all `readAdminError` will surface anyway.
  const idParsed = rowIdParamSchema.safeParse(idRaw);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid photo id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = photoInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: classBodyErrorMessage(parsed.error),
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const photo = await updatePhoto(idParsed.data, parsed.data);
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
  // The raw segment goes in unconverted: the `Number(idRaw)` that used to
  // stand here is the defect, not the parser after it. `details` is dropped
  // with it - one short message is all `readAdminError` will surface anyway.
  const idParsed = rowIdParamSchema.safeParse(idRaw);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid photo id" }, { status: 400 });
  }

  try {
    await deletePhoto(idParsed.data);
    logger.info("Class photo deleted", {
      context: CONTEXT,
      data: { id: idParsed.data },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Class photo delete error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
