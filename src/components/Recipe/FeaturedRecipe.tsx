'use client';
import Link from "next/link";
import React from "react";
import styles from "./FeaturedRecipe.module.css";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";

export type FeaturedRecipeProps = {
  id: number;
  title: string;
  author: string;
  coverPhoto?: string;
  description?: string;
};


const FeaturedRecipe: React.FC<{ recipe: FeaturedRecipeProps }> = ({ recipe }) => {
  const { url: coverUrl } = useS3ImageUrl(recipe.coverPhoto);
  if (!recipe) return null;

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
      className={styles.featuredCard}
      style={cardStyle}
      tabIndex={0}
      aria-label={`View recipe: ${recipe.title}`}
      prefetch={false}
    >
      <div className={styles.glassOverlay} />
      <div className={styles.featuredContent}>
        <div className={styles.featuredTitle}>{recipe.title}</div>
        <div className={styles.featuredMeta}>By {recipe.author}</div>
        {recipe.description && (
          <div className={styles.featuredExcerpt}>{recipe.description}</div>
        )}
      </div>
    </Link>
  );
};

export default FeaturedRecipe;
