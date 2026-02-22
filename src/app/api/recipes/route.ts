import { requireAdmin } from "@/utils/auth";
import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import redis from "@/utils/redisClient";
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

export async function POST(req: NextRequest) {
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
    await redis.del("recipes:list"); // Invalidate cache
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

export async function GET(req: NextRequest) {
  // Pagination support
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "10", 10);
  const cacheKey = `recipes:page=${page}:size=${pageSize}`;
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached));
  try {
    const total = await prisma.cocktailRecipe.count();
    const recipes = await prisma.cocktailRecipe.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
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
