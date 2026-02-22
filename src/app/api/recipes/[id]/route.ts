import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { invalidateRecipeCache } from "@/utils/redisClient";
import { getS3ImageUrl } from "@/utils/s3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteS3Objects } from "../../../../utils/s3";
// Utility to extract file names from recipe fields
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFileNamesFromRecipe(recipe: any): string[] {
  const fields = [recipe.description, recipe.ingredients, recipe.instructions];
  const regex = /([a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi))/gi;
  const fileNames: string[] = [];
  for (const field of fields) {
    if (typeof field === "string") {
      let match;
      while ((match = regex.exec(field)) !== null) {
        fileNames.push(match[1]);
      }
    }
  }
  return fileNames;
}

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
  // Fetch previous recipe to compare coverPhoto
  const prevRecipe = await prisma.cocktailRecipe.findUnique({ where: { id } });
  let shouldDeletePrevPhoto = false;
  if (
    prevRecipe &&
    prevRecipe.coverPhoto &&
    prevRecipe.coverPhoto !== parsed.data.coverPhoto
  ) {
    // Check if previous coverPhoto is referenced elsewhere
    const otherRecipes = await prisma.cocktailRecipe.findMany({
      where: {
        coverPhoto: prevRecipe.coverPhoto,
        id: { not: id },
      },
    });
    if (otherRecipes.length === 0) {
      shouldDeletePrevPhoto = true;
    }
  }
  // Prevent duplicate uploads: if coverPhoto is unchanged, don't re-upload
  // (Assume upload logic is elsewhere; here, just avoid unnecessary S3 actions)
  try {
    const recipe = await prisma.cocktailRecipe.update({
      where: { id },
      data: {
        ...parsed.data,
        coverPhoto: parsed.data.coverPhoto || null,
      },
    });
    if (shouldDeletePrevPhoto) {
      try {
        if (prevRecipe && prevRecipe.coverPhoto) {
          await deleteS3Objects(prevRecipe.coverPhoto);
          logger.info("Deleted unused S3 coverPhoto", {
            context: "recipe.update",
            data: { coverPhoto: prevRecipe.coverPhoto },
          });
        }
      } catch (err) {
        logger.error("Failed to delete S3 coverPhoto", {
          context: "recipe.update",
          data: { coverPhoto: prevRecipe?.coverPhoto, error: err },
        });
      }
    }
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
  // Fetch recipe to check coverPhoto and embedded media
  const recipe = await prisma.cocktailRecipe.findUnique({ where: { id } });
  // 1. Cover photo (delete by exact key)
  if (recipe && recipe.coverPhoto) {
    try {
      await deleteS3Objects(recipe.coverPhoto);
      logger.info("Deleted S3 coverPhoto (exact match)", {
        context: "recipe.delete",
        data: { coverPhoto: recipe.coverPhoto },
      });
    } catch (err) {
      logger.error("Failed to delete S3 coverPhoto (exact match)", {
        context: "recipe.delete",
        data: { coverPhoto: recipe.coverPhoto, error: err },
      });
    }
  }
  // 2. Media in recipe fields (delete by exact key)
  if (recipe) {
    const fileNames = extractFileNamesFromRecipe(recipe);
    logger.info("Extracted file names from recipe fields", {
      context: "recipe.delete",
      data: { fileNames, recipe },
    });
    for (const fileName of fileNames) {
      // Assume all media are stored under recipe-media/recipe-content-media/ or similar
      // Try both possible directories for safety
      const possibleKeys = [
        `recipe-media/recipe-content-media/${fileName}`,
        `recipe-media/${fileName}`,
      ];
      try {
        await deleteS3Objects(possibleKeys);
        logger.info("Deleted S3 recipe media by exact key(s)", {
          context: "recipe.delete",
          data: { fileName, possibleKeys },
        });
      } catch (err) {
        logger.error("Failed to delete S3 recipe media by exact key(s)", {
          context: "recipe.delete",
          data: { fileName, possibleKeys, error: err },
        });
      }
    }
  }
  try {
    await prisma.cocktailRecipe.delete({ where: { id } });
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
