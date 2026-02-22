"use client";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./RecipesPostPage.module.css";

// Helper component to render S3 images in instructions
function S3InstructionImage({ s3Key, alt }: { s3Key: string; alt: string }) {
  const { url } = useS3ImageUrl(s3Key);
  if (!url) return null;
  return (
    <div className={styles.instructionImageContainer}>
      <Image
        src={url}
        alt={alt}
        width={600}
        height={340}
        className={styles.instructionImage}
      />
    </div>
  );
}

interface Recipe {
  title: string;
  author: string;
  coverPhoto: string;
  description: string;
  ingredients: string[];
  instructions: string[];
}

export default function RecipeDetailPage() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchRecipe() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/recipes/${id}`);
        const data = await res.json();
        if (res.ok) {
          // Always normalize ingredients and instructions to string[]
          const normalized = { ...data };
          if (typeof normalized.ingredients === "string") {
            normalized.ingredients = normalized.ingredients
              .split(/\r?\n|,/) // split by newline or comma
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0);
          } else if (!Array.isArray(normalized.ingredients)) {
            normalized.ingredients = [];
          }
          if (typeof normalized.instructions === "string") {
            normalized.instructions = normalized.instructions
              .split(/\r?\n|\d+\./) // split by newline or numbered step
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0);
          } else if (!Array.isArray(normalized.instructions)) {
            normalized.instructions = [];
          }
          setRecipe(normalized);
        } else {
          setError(data.error || "Recipe not found");
        }
      } catch {
        setError("Recipe not found");
      }
      setLoading(false);
    }
    if (id) fetchRecipe();
  }, [id]);

  if (loading) return <div className={styles.loading}>Loading...</div>;
  if (error || !recipe)
    return <div className={styles.error}>{error || "Recipe not found."}</div>;

  // Render recipe like a blog post with media
  return (
    <>
      <div className={styles.page}>
        <div className={styles.featuredCard}>
          <div className={styles.glassOverlay} />
          <div className={styles.featuredContent}>
            <div className={styles.cardHeader}>
              <h1 className={styles.featuredTitle}>{recipe.title}</h1>
              <div className={styles.featuredMeta}>By {recipe.author}</div>
            </div>
            <div className={styles.section}>
              <h2>Description</h2>
              <div className={styles.description}>{recipe.description}</div>
            </div>
            <div className={styles.section}>
              <h2>Ingredients</h2>
              <div className={styles.ingredients}>
                {recipe.ingredients.map((item: string, idx: number) =>
                  item.trim() ? <div key={idx}>{item.trim()}</div> : null,
                )}
              </div>
            </div>
            <div className={styles.section}>
              <h2>Instructions</h2>
              <div className={styles.instructions}>
                {recipe.instructions.map((step: string, idx: number) => {
                  const trimmed = step.trim();
                  // Match markdown image ![alt](key) or just a raw S3 key
                  const mdImg = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
                  if (mdImg) {
                    // If markdown image, render only image container
                    return (
                      <S3InstructionImage
                        key={idx}
                        s3Key={mdImg[2]}
                        alt={mdImg[1] || "Instruction image"}
                      />
                    );
                  }
                  // Otherwise, render text container
                  return trimmed ? <div key={idx}>{trimmed}</div> : null;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
