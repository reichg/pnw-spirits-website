import { classContentSchema } from "@/services/classes/classSchemas";
import {
  getClassPage,
  upsertClassContent,
} from "@/services/classes/classService";
import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

const CONTEXT = "api.classes";

/**
 * GET /api/classes
 * Public read for the singleton /classes page. Returns the class plus its
 * sessions and photos (raw s3Keys; signed URLs resolved by the frontend).
 */
export async function GET() {
  try {
    const page = await getClassPage();
    return NextResponse.json(page);
  } catch (err) {
    logger.error("Class page fetch error", { context: CONTEXT, data: err });
    return NextResponse.json(
      { error: "Failed to fetch class page" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/classes
 * Create or update the singleton class title/description. Requires admin.
 */
export async function PUT(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;

  const body = await req.json();
  const parsed = classContentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const cocktailClass = await upsertClassContent(parsed.data);
    logger.info("Class content saved", {
      context: CONTEXT,
      data: { id: cocktailClass.id },
    });
    return NextResponse.json(cocktailClass);
  } catch (err) {
    logger.error("Class content save error", { context: CONTEXT, data: err });
    return NextResponse.json(
      { error: "Failed to save class content" },
      { status: 500 },
    );
  }
}
