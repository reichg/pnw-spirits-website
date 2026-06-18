import { mapClassServiceError } from "@/services/classes/classErrors";
import { photoInputSchema } from "@/services/classes/classSchemas";
import { createPhoto } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "api.classes.photos";

/**
 * POST /api/classes/photos
 * Create a photo on the singleton class page. Requires admin.
 * Returns 409 when no class content has been saved yet.
 */
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const body = await req.json();
  const parsed = photoInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const photo = await createPhoto(parsed.data);
    logger.info("Class photo created", {
      context: CONTEXT,
      data: { id: photo.id },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (err) {
    logger.error("Class photo create error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
