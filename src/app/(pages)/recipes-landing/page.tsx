// Server component: fetches recipes only once on the server
import ContentLandingLayout from "@/components/ui/ContentLandingLayout";
import { mapWithSignedImageUrl } from "@/services/media/signedImageService";
import { SITE_ORIGIN } from "@/utils/contentDetail";
import { toRecipeItem, type RecipeRecord } from "@/utils/contentItems";
import styles from "./RecipesLandingPage.module.css";

async function fetchLandingRecipes(): Promise<RecipeRecord[]> {
  // Fetch exactly the 3 newest recipes: one per card in the layout's row.
  // Both failure modes converge on the layout's empty state instead of a 500:
  // `!res.ok` catches a clean error response, the catch block catches a network
  // failure or an unparseable body. Collapsing either guard reintroduces a crash.
  try {
    const res = await fetch(`${SITE_ORIGIN}/api/recipes?page=1&pageSize=3`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const recipes: RecipeRecord[] = data.recipes || [];
    return recipes;
  } catch {
    return [];
  }
}

const RecipesLandingPage = async () => {
  const recipes = await fetchLandingRecipes();
  // Cover photos are signed here, on the server, and in parallel; see
  // mapWithSignedImageUrl for why the client path is not good enough.
  const items = await mapWithSignedImageUrl(
    recipes,
    (recipe) => recipe.coverPhoto,
    toRecipeItem,
  );
  return (
    <ContentLandingLayout
      className={styles.recipesLandingRoot}
      eyebrow="Craft Cocktails"
      heading="Recipes"
      intro="Small-batch drinks built on Pacific Northwest ingredients — seasonal, unfussy, and made to pour at home."
      items={items}
      emptyMessage="There aren't any recipes yet. Check back soon for new cocktails and inspiration!"
      viewAllHref="/recipes"
      viewAllLabel="View All Recipes"
    />
  );
};

export default RecipesLandingPage;
