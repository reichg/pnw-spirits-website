import { mapClassServiceError } from "@/services/classes/classErrors";
import { deleteSession, updateSession } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { rowIdParamSchema } from "@/utils/rowId";
import { NextRequest, NextResponse } from "next/server";
import {
  sessionBodyErrorMessage,
  sessionRequestSchema,
} from "../sessionRequestSchema";

const CONTEXT = "api.classes.sessions.id";

/**
 * PUT /api/classes/sessions/[id]
 * Update a session by path id. Requires admin. The id is taken from the path
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
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: sessionBodyErrorMessage(parsed.error),
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const session = await updateSession(idParsed.data, parsed.data);
    logger.info("Class session updated", {
      context: CONTEXT,
      data: { id: session.id },
    });
    return NextResponse.json(session);
  } catch (err) {
    logger.error("Class session update error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/classes/sessions/[id]
 * Delete a session by path id. Requires admin.
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
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    await deleteSession(idParsed.data);
    logger.info("Class session deleted", {
      context: CONTEXT,
      data: { id: idParsed.data },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Class session delete error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
