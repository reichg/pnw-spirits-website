"use client";
import RecipeList from "@/components/Recipe/RecipeList";
import React, { useCallback, useEffect, useState } from "react";
import styles from "./RecipesPage.module.css";

type Recipe = {
  id: string | number;
  title: string;
  instructions: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};
const PAGE_SIZE = 10;

const RecipesPage: React.FC = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fetchRecipes = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/recipes?page=${pageNum}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error("Failed to fetch recipes");
      const data = await res.json();
      setRecipes(data.recipes || []);
      setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes(page);
  }, [page, fetchRecipes]);

  return (
    <div className={styles.page} style={{ fontFamily: "var(--font-primary)" }}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Recipes</h1>
        {error && (
          <div style={{ color: "var(--color-error)", margin: "1em 0" }}>
            {error}
          </div>
        )}
        {loading ? (
          <div
            style={{
              color: "var(--color-accent-secondary)",
              margin: "2em 0",
              fontSize: "1.2em",
            }}
          >
            Loading recipes...
          </div>
        ) : (
          <RecipeList
            recipes={recipes}
            page={page}
            totalPages={totalPages}
            setPage={setPage}
          />
        )}
      </main>
    </div>
  );
};

export default RecipesPage;
