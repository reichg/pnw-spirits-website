import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { invalidateRecipeCache } from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().min(1),
  ingredients: z.string().min(1),
  instructions: z.string().min(1),
  coverPhoto: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!id)
    return NextResponse.json(
      {
        error: "Invalid recipe id",
        idRaw,
        idType: typeof idRaw,
      },
      { status: 400 },
    );
  const recipe = await prisma.cocktailRecipe.findUnique({ where: { id } });
  if (!recipe)
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  // Resolve coverPhoto to signed S3 URL if present
  const coverPhotoUrl = recipe.coverPhoto
    ? await getS3ImageUrl(recipe.coverPhoto)
    : null;
  return NextResponse.json({ ...recipe, coverPhoto: coverPhotoUrl });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params;
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const id = Number(idRaw);
  if (!id)
    return NextResponse.json(
      {
        error: "Invalid recipe id",
        idRaw,
        idType: typeof idRaw,
      },
      { status: 400 },
    );
  const body = await req.json();
  const parsed = RecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const recipe = await prisma.cocktailRecipe.update({
      where: { id },
      data: {
        ...parsed.data,
        coverPhoto: parsed.data.coverPhoto || null,
      },
    });
    await invalidateRecipeCache();
    logger.info("Recipe updated", { data: recipe });
    return NextResponse.json(recipe);
  } catch (err) {
    logger.error("Recipe update error", { data: err });
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params;
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const id = Number(idRaw);
  if (!id)
    return NextResponse.json({ error: "Invalid recipe id" }, { status: 400 });
  try {
    await prisma.cocktailRecipe.delete({ where: { id } });
    // Invalidate all recipe cache entries in Redis
    await invalidateRecipeCache();
    logger.info("Recipe deleted", { data: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Recipe delete error", { data: err });
    return NextResponse.json(
      { error: "Failed to delete recipe" },
      { status: 500 },
    );
  }
}
