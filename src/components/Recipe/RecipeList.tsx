"use client";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import styles from "./RecipeList.module.css";
import featuredStyles from "./FeaturedRecipe.module.css";
import Link from "next/link";

type Recipe = {
  id: string | number;
  title: string;
  instructions: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};

type RecipeListProps = {
  recipes: Recipe[];
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
};


const RecipeCard: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
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
      className={featuredStyles.featuredCard}
      style={cardStyle}
      tabIndex={0}
      aria-label={`View recipe: ${recipe.title}`}
      prefetch={false}
    >
      <div className={featuredStyles.glassOverlay} />
      <div className={featuredStyles.featuredContent}>
        <div className={featuredStyles.featuredTitle}>{recipe.title}</div>
        <div className={featuredStyles.featuredMeta}>
          by {recipe.author} | {new Date(recipe.createdAt).toLocaleDateString()}
        </div>
        {recipe.excerpt && (
          <div className={featuredStyles.featuredExcerpt}>{recipe.excerpt}</div>
        )}
      </div>
    </Link>
  );
};

const RecipeList: React.FC<RecipeListProps> = ({
  recipes,
  page,
  totalPages,
  setPage,
}) => {
  return (
    <>
      <div className={styles.recipeList}>
        {recipes.length === 0 && <div>No recipes yet.</div>}
        {recipes.map((recipe) => (
          <RecipeCard recipe={recipe} key={recipe.id} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
};

export default RecipeList;
  