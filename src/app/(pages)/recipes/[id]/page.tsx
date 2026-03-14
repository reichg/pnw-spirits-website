import prisma from "@/utils/prisma";
import { notFound } from "next/navigation";
import styles from "./RecipesPostPage.module.css";
import S3InstructionImage from "./S3InstructionImage";

function normalizeIngredients(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeInstructions(value: string): string[] {
  return value
    .split(/\r?\n|\d+\./)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!id) notFound();

  const recipe = await prisma.cocktailRecipe.findUnique({ where: { id } });
  if (!recipe) notFound();

  const ingredients = normalizeIngredients(recipe.ingredients);
  const instructions = normalizeInstructions(recipe.instructions);

  return (
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
              {ingredients.map((item, idx) =>
                item ? <div key={idx}>{item}</div> : null,
              )}
            </div>
          </div>
          <div className={styles.section}>
            <h2>Instructions</h2>
            <div className={styles.instructions}>
              {instructions.map((step, idx) => {
                const trimmed = step.trim();
                // Match markdown image ![alt](key)
                const mdImg = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
                if (mdImg) {
                  return (
                    <S3InstructionImage
                      key={idx}
                      s3Key={mdImg[2]}
                      alt={mdImg[1] || "Instruction image"}
                    />
                  );
                }
                return trimmed ? <div key={idx}>{trimmed}</div> : null;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
