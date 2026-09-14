/**
 * Cross-layer contract for the recipe detail page's parsed content.
 *
 * Type-only module: no runtime values. `recipeContentService` is server-only
 * (it reaches Redis and the AWS signer), but these types are read by the page's
 * render branch, which chooses between a server-rendered `<Image>` and the
 * `"use client"` fallback component per step. Keeping the shapes here lets the
 * client-capable graph name them without pulling a server module in behind
 * them. Same constraint, and same reason, as `ContentLanding.types.ts`.
 *
 * The instruction union mirrors that file's `{ kind: "s3" } | { kind: "url" }`
 * media split: the page renders by `kind` and never re-parses stored text.
 */

/** One numbered instruction. Numbers count text steps only. */
export type RecipeTextStep = {
  kind: "text";
  /** 1-based display number among text steps. */
  number: number;
  text: string;
};

/**
 * A photo between instructions. Carries no number: a photo illustrates the
 * steps around it, it is not a step of its own, and numbering it would shift
 * every following step away from what the author wrote.
 */
export type RecipeImageStep = {
  kind: "image";
  /** Stored S3 key, for the client-side fallback when `signedUrl` is null. */
  s3Key: string;
  alt: string;
  /** Server-signed URL, or null when no usable URL could be produced. */
  signedUrl: string | null;
};

export type RecipeInstructionStep = RecipeTextStep | RecipeImageStep;

/** Derived at-a-glance counts. No schema column backs either of these. */
export type RecipeContentStats = {
  ingredientCount: number;
  /** Text steps only; photos are not steps. */
  stepCount: number;
};

export type RecipeContent = {
  ingredients: string[];
  steps: RecipeInstructionStep[];
  stats: RecipeContentStats;
};

/**
 * The stored columns the service reads. Structural rather than the Prisma
 * model, so a content contract carries no persistence dependency.
 */
export type RecipeContentInput = {
  ingredients: string;
  instructions: string;
};
