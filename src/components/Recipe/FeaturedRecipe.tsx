"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import Link from "next/link";
import React from "react";
import styles from "./FeaturedRecipe.module.css";

export type FeaturedRecipeProps = {
  id: number;
  title: string;
  author: string;
  coverPhoto?: string;
  description?: string;
};

const FeaturedRecipe: React.FC<{ recipe: FeaturedRecipeProps }> = ({
  recipe,
}) => {
  if (!recipe) return null;

  return (
    <section className={styles.featuredSection}>
      <h2 className={styles.featuredHeading}>Featured Recipe</h2>
      <Link
        href={`/recipes/${recipe.id}`}
        className={styles.featuredCard}
        tabIndex={0}
        aria-label={`View recipe: ${recipe.title}`}
        prefetch={false}
      >
        <S3CardBackgroundImage
          s3Key={recipe.coverPhoto}
          alt={`Cover image for ${recipe.title}`}
          sizes="(max-width: 900px) 100vw, 1200px"
          className={styles.cardImage}
        />
        <div className={styles.glassOverlay} />
        <div className={styles.featuredContent}>
          <div className={styles.featuredTitle}>{recipe.title}</div>
          <div className={styles.featuredMeta}>By {recipe.author}</div>
        </div>
      </Link>
    </section>
  );
};

export default FeaturedRecipe;
