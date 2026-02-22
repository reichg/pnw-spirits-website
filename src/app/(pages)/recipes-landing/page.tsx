// Server component: fetches recipes only once on the server
import FeaturedRecipe, {
  FeaturedRecipeProps,
} from "@/components/Recipe/FeaturedRecipe";
import RecipeGrid from "@/components/Recipe/RecipeGrid";
import Link from "next/link";
import styles from "./RecipesLandingPage.module.css";

type Recipe = FeaturedRecipeProps & { createdAt?: string };

async function fetchLandingRecipes(): Promise<{
  featured: Recipe | null;
  recipes: Recipe[];
}> {
  // Fetch 4 newest recipes (1 featured, 3 for grid)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/recipes?page=1&pageSize=4`, {
    cache: "no-store",
  });
  if (!res.ok) return { featured: null, recipes: [] };
  const data = await res.json();
  const recipes: Recipe[] = data.recipes || [];
  return {
    featured: recipes[0] || null,
    recipes: recipes.slice(1, 4),
  };
}

const RecipesLandingPage = async () => {
  const { featured, recipes } = await fetchLandingRecipes();
  const noRecipes = !featured && (!recipes || recipes.length === 0);
  return (
    <main className={styles.recipesLandingRoot}>
      {noRecipes ? (
        <div className={styles.noRecipesMsg}>
          <span>
            There aren&apos;t any recipes yet. Check back soon for new cocktails
            and inspiration!
          </span>
        </div>
      ) : (
        <>
          {featured && <FeaturedRecipe recipe={featured} />}
          <RecipeGrid recipes={recipes} />
        </>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2.5rem",
        }}
      >
        <Link href="/recipes">
          <button className={styles.recipesBtn}>View All Recipes</button>
        </Link>
      </div>
    </main>
  );
};

export default RecipesLandingPage;
