import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import { paginationParams, searchParam } from "@/utils/pagination";
import prisma from "@/utils/prisma";
import redis, { invalidateRecipeCache } from "@/utils/redisClient";
import { rowIdSchema } from "@/utils/rowId";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** The shared contract, with this route's own default page size. */
const PaginationParams = paginationParams(10);

const RecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().min(1),
  ingredients: z.string().min(1),
  instructions: z.string().min(1),
  coverPhoto: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  /**
   * After recipe creation, invalidate all recipe cache keys.
   * This ensures all recipe queries return fresh data.
   */
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const body = await req.json();
  const parsed = RecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const recipe = await prisma.cocktailRecipe.create({
      data: {
        ...parsed.data,
        coverPhoto: parsed.data.coverPhoto || null,
      },
    });
    await invalidateRecipeCache();
    logger.info("Recipe created", { data: recipe });
    return NextResponse.json(recipe);
  } catch (err) {
    logger.error("Recipe create error", { data: err });
    return NextResponse.json(
      { error: "Failed to create recipe" },
      { status: 500 },
    );
  }
}
/**
 * The body id gets the same parser every path and query id already uses.
 * `z.number()` accepted `59.5`, which Prisma truncated onto recipe 59 - a
 * request aimed at a row that does not exist editing one that does - and it had
 * no Int ceiling, so an oversized id reached the driver as a 500.
 */
const RecipeUpdateSchema = RecipeSchema.extend({
  id: rowIdSchema,
});

/**
 * PATCH /api/recipes
 * Update a recipe by id. Requires admin.
 * After update, invalidates all recipe cache keys.
 */
export async function PATCH(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const body = await req.json();
  // The body goes in unconverted: the `Number(body.id)` that used to stand here
  // is what defeated the check, exactly as `Number(idRaw)` did on the path routes.
  const parsed = RecipeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const { id, ...updateData } = parsed.data;
    const updatedRecipe = await prisma.cocktailRecipe.update({
      where: { id },
      data: {
        ...updateData,
        coverPhoto: updateData.coverPhoto || null,
      },
    });
    await invalidateRecipeCache();
    logger.info("Recipe updated", { data: updatedRecipe });
    return NextResponse.json(updatedRecipe);
  } catch (err) {
    logger.error("Recipe update error", { data: err });
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 500 },
    );
  }
}

/** Same body id, same parser as the PATCH above. */
const RecipeDeleteSchema = z.object({ id: rowIdSchema });
/**
 * DELETE /api/recipes
 * Delete a recipe by id. Requires admin.
 * After deletion, invalidates all recipe cache keys.
 */
export async function DELETE(req: NextRequest) {
  const authResult = requireAdmin(req);
  if (authResult) return authResult;
  const body = await req.json();
  const parsed = RecipeDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const deletedRecipe = await prisma.cocktailRecipe.delete({
      where: { id: parsed.data.id },
    });
    await invalidateRecipeCache();
    logger.info("Recipe deleted", { data: deletedRecipe });
    return NextResponse.json(deletedRecipe);
  } catch (err) {
    logger.error("Recipe delete error", { data: err });
    return NextResponse.json(
      { error: "Failed to delete recipe" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  /**
   * GET /api/recipes
   * Query Parameters:
   * - search (optional): string. Filters recipes where any text field (title, description, ingredients, instructions) contains the search string (case-insensitive).
   * - page (optional): number. Page number for pagination.
   * - pageSize (optional): number. Number of recipes per page.
   * Example: /api/recipes?search=vodka&page=1&pageSize=10
   */
  const { searchParams } = new URL(req.url);
  const { page, pageSize } = PaginationParams.parse({
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
  });
  const search = searchParam.parse(searchParams.get("search"));

  const cacheKey = `recipes:page=${page}:size=${pageSize}:search=${search || ""}`;
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached));
  try {
    // Build Prisma filter for search
    const insensitive = "insensitive" as const;
    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: insensitive } },
            { description: { contains: search, mode: insensitive } },
            { ingredients: { contains: search, mode: insensitive } },
            { instructions: { contains: search, mode: insensitive } },
          ],
        }
      : undefined;

    const total = await prisma.cocktailRecipe.count({ where });
    const recipes = await prisma.cocktailRecipe.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // Only return S3 keys for coverPhoto; signed URLs are fetched on-demand by the frontend
    const response = { recipes, total, page, pageSize };
    await redis.set(cacheKey, JSON.stringify(response), "EX", 60 * 5); // Cache for 5 min
    return NextResponse.json(response);
  } catch (err) {
    logger.error("Recipe list error", { data: err });
    return NextResponse.json(
      { error: "Failed to fetch recipes" },
      { status: 500 },
    );
  }
}
