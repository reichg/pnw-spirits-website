import { mapClassServiceError } from "@/services/classes/classErrors";
import { sessionInputSchema } from "@/services/classes/classSchemas";
import { createSession } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "api.classes.sessions";

/**
 * POST /api/classes/sessions
 * Create a session on the singleton class page. Requires admin.
 * Returns 409 when no class content has been saved yet.
 */
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const body = await req.json();
  const parsed = sessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const session = await createSession(parsed.data);
    logger.info("Class session created", {
      context: CONTEXT,
      data: { id: session.id },
    });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    logger.error("Class session create error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
