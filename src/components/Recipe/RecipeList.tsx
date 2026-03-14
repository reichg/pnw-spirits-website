"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import featuredStyles from "./FeaturedRecipe.module.css";
import styles from "./RecipeList.module.css";

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
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={featuredStyles.featuredCard}
      tabIndex={0}
      aria-label={`View recipe: ${recipe.title}`}
      prefetch={false}
    >
      <S3CardBackgroundImage
        s3Key={recipe.coverPhoto}
        alt={`Cover image for ${recipe.title}`}
        sizes="(max-width: 900px) 100vw, 1200px"
        className={featuredStyles.cardImage}
      />
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
  // Search state
  const [search, setSearch] = useState("");
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>(recipes);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce hook
  function useDebounce(value: string, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
      return () => {
        clearTimeout(handler);
      };
    }, [value, delay]);
    return debouncedValue;
  }
  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => {
    if (!debouncedSearch) {
      setFilteredRecipes(recipes);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchRecipes = async () => {
      try {
        const url = `/api/recipes?search=${encodeURIComponent(debouncedSearch)}`;
        const res = await fetch(url);
        const data = await res.json();
        setFilteredRecipes(data.recipes || []);
      } catch (err) {
        setFilteredRecipes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipes();
  }, [debouncedSearch, recipes]);

  return (
    <>
      <div className={styles.searchContainer}>
        <input
          ref={inputRef}
          id="recipe-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type to search..."
          className={styles.searchInput}
          aria-label="Search Recipes"
        />
      </div>
      <div className={styles.recipeList}>
        {loading ? (
          <div className={styles.loadingText}>Loading...</div>
        ) : filteredRecipes.length === 0 ? (
          <div className={styles.noResultsText}>No recipes found.</div>
        ) : (
          filteredRecipes.map((recipe) => (
            <RecipeCard recipe={recipe} key={recipe.id} />
          ))
        )}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Previous page"
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
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
};

export default RecipeList;
