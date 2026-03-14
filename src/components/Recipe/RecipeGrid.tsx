"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import Link from "next/link";
import styles from "./RecipeGrid.module.css";

export interface RecipeCardProps {
  id: number;
  title: string;
  author: string;
  coverPhoto?: string | null;
}

const RecipeCard: React.FC<{ recipe: RecipeCardProps }> = ({ recipe }) => {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={styles.recipeCard}
      tabIndex={0}
      aria-label={`View recipe: ${recipe.title}`}
      prefetch={false}
    >
      <S3CardBackgroundImage
        s3Key={recipe.coverPhoto}
        alt={`Cover image for ${recipe.title}`}
        sizes="(max-width: 900px) 100vw, 300px"
        className={styles.cardImage}
      />
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
