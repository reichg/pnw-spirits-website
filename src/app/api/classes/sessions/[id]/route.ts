import { mapClassServiceError } from "@/services/classes/classErrors";
import {
  idParamSchema,
  sessionInputSchema,
} from "@/services/classes/classSchemas";
import {
  deleteSession,
  updateSession,
} from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

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
  const idParsed = idParamSchema.safeParse({ id: Number(idRaw) });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Invalid session id", details: idParsed.error.issues },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = sessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const session = await updateSession(idParsed.data.id, parsed.data);
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
  const idParsed = idParamSchema.safeParse({ id: Number(idRaw) });
  if (!idParsed.success) {
    return NextResponse.json(
      { error: "Invalid session id", details: idParsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await deleteSession(idParsed.data.id);
    logger.info("Class session deleted", {
      context: CONTEXT,
      data: { id: idParsed.data.id },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Class session delete error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
