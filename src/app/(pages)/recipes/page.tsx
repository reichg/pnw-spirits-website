import PaginatedRecipeList from "@/components/Recipe/PaginatedRecipeList";
import styles from "./RecipesPage.module.css";

export default function RecipesPage() {
  return (
    <div className={styles.page} style={{ fontFamily: "var(--font-primary)" }}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Recipes</h1>
        <PaginatedRecipeList />
      </main>
    </div>
  );
}
