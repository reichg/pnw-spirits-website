import type { ContentLandingItem } from "@/components/ui/ContentLanding.types";

/** The subset of the recipes API response this landing page consumes. */
export type LandingRecipe = {
  id: number;
  title: string;
  author: string;
  /** Non-nullable in the schema (prisma/schema.prisma CocktailRecipe.description). */
  description: string;
  coverPhoto?: string | null;
};

/**
 * Landing-page-specific mapping. The `meta` wording is deliberately not shared
 * with /recipes, which renders a different line (`by {author} | {date}`).
 *
 * Pure and synchronous: the page signs cover photos before calling this and
 * passes the result in as `signedCoverUrl`. Keeping the async work outside
 * keeps this adapter directly unit-testable.
 *
 * @param signedCoverUrl A server-signed URL for `recipe.coverPhoto`, or null
 * when signing produced nothing usable. A signed URL yields `url` media, which
 * the card server-renders as a real `<img>`; null falls back to `s3` media, so
 * the card resolves the key on the client exactly as it did before. Required
 * rather than optional so no caller can silently drop back to the slow path.
 */
export function toContentLandingItem(
  recipe: LandingRecipe,
  signedCoverUrl: string | null,
): ContentLandingItem {
  return {
    id: String(recipe.id),
    title: recipe.title,
    kicker: "Recipe",
    meta: `By ${recipe.author}`,
    // Passed through whole: the card clamps it in CSS, so the full text stays in the DOM.
    excerpt: recipe.description,
    media: signedCoverUrl
      ? { kind: "url", src: signedCoverUrl }
      : { kind: "s3", key: recipe.coverPhoto ?? null },
    link: { kind: "internal", href: `/recipes/${recipe.id}` },
    ariaLabel: `View recipe: ${recipe.title}`,
  };
}
