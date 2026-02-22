'use client';
import Link from "next/link";
import styles from "./RecipeGrid.module.css";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";

export interface RecipeCardProps {
  id: number;
  title: string;
  author: string;
  coverPhoto?: string | null;
}

const RecipeCard: React.FC<{ recipe: RecipeCardProps }> = ({ recipe }) => {
  const { url: coverUrl } = useS3ImageUrl(recipe.coverPhoto);
  const cardStyle = coverUrl
    ? {
        backgroundImage: `url(${coverUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {};
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={styles.recipeCard}
      style={cardStyle}
      tabIndex={0}
      aria-label={`View recipe: ${recipe.title}`}
      prefetch={false}
    >
      <div className={styles.glassOverlay} />
      <div className={styles.recipeContent}>
        <div className={styles.recipeTitle}>{recipe.title}</div>
        <div className={styles.recipeMeta}>By {recipe.author}</div>
      </div>
    </Link>
  );
};

const RecipeGrid: React.FC<{ recipes: RecipeCardProps[] }> = ({ recipes }) => {
  if (!recipes?.length) return null;
  return (
    <section className={styles.recipesSection}>
      <div className={styles.recipesTitle}>RECIPES</div>
      <div className={styles.recipesGrid}>
        {recipes.map((recipe) => (
          <RecipeCard recipe={recipe} key={recipe.id} />
        ))}
      </div>
    </section>
  );
};

export default RecipeGrid;
