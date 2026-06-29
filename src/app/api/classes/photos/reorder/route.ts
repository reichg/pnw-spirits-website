import { mapClassServiceError } from "@/services/classes/classErrors";
import { photoReorderSchema } from "@/services/classes/classSchemas";
import { reorderPhotos } from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "api.classes.photos.reorder";

/**
 * POST /api/classes/photos/reorder
 * Batch-reorder class photos by their id sequence. Requires admin. The service
 * enforces that the ids belong to the singleton class page.
 */
export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const body = await req.json();
  const parsed = photoReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await reorderPhotos(parsed.data.ids);
    logger.info("Class photos reordered", {
      context: CONTEXT,
      data: { count: parsed.data.ids.length },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Class photo reorder error", { context: CONTEXT, data: err });
    const { status, message } = mapClassServiceError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
