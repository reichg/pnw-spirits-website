"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminToken } from "../AdminTokenContext";
import AdminRecipeEditor from "./AdminRecipeEditor";
import styles from "./AdminRecipeList.module.css";

interface CocktailRecipe {
  id: number;
  title: string;
  description: string;
  author: string;
  coverPhoto?: string;
  ingredients: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminRecipeList() {
  const { token: adminToken, setToken } = useAdminToken();
  const [recipes, setRecipes] = useState<CocktailRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingRecipe, setEditingRecipe] = useState<CocktailRecipe | null>(
    null,
  );
  const [showEditor, setShowEditor] = useState(false);
  const [forceEmpty, setForceEmpty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  // Check for recipe draft in localStorage and listen for token removal
  useEffect(() => {
    if (typeof window !== "undefined") {
      // SSR-safe: localStorage is only available on the client, so the initial
      // draft flag must be synced from an effect to avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasDraft(!!localStorage.getItem("recipeDraft"));
      // Listen for changes to localStorage (e.g., draft removed after save or token removed)
      const syncDraft = () =>
        setHasDraft(!!localStorage.getItem("recipeDraft"));
      const handleStorage = (event: StorageEvent) => {
        if (event.key === "recipeDraft") syncDraft();
        if (event.key === "adminToken" && event.newValue === null) {
          setToken(null);
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, [setToken]);

  const fetchRecipes = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recipes", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRecipes(Array.isArray(data.recipes) ? data.recipes : []);
      } else {
        setError(data.error || "Failed to fetch recipes");
      }
    } catch {
      setError("Failed to fetch recipes");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!adminToken) {
      window.location.href = "/admin/login";
      return;
    }
    // Data fetch when the token becomes available; the leading setLoading(true)
    // inside fetchRecipes runs synchronously and is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  function handleEdit(recipe: CocktailRecipe) {
    setEditingRecipe(recipe);
    setForceEmpty(false);
    setShowEditor(true);
  }

  function handleCreate() {
    setEditingRecipe(null);
    setForceEmpty(true);
    setShowEditor(true);
  }

  function handleContinueDraft() {
    setEditingRecipe(null); // new recipe, but draft will be loaded by editor
    setForceEmpty(false);
    setShowEditor(true);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this recipe?")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRecipes(recipes.filter((r) => r.id !== id));
      } else {
        setError(data.error || "Failed to delete recipe");
      }
    } catch {
      setError("Failed to delete recipe");
    }
    setLoading(false);
  }

  function handleEditorClose(refresh?: boolean) {
    setShowEditor(false);
    setEditingRecipe(null);
    setForceEmpty(false);
    // Update hasDraft immediately in case the draft was removed on save
    if (typeof window !== "undefined") {
      setHasDraft(!!localStorage.getItem("recipeDraft"));
    }
    if (refresh) fetchRecipes();
  }

  return (
    <div className={styles.adminPageBg}>
      <div className={styles.container}>
        <div className={styles.actionRow}>
          <Link href="/admin" className={styles.adminNavBtn}>
            <button>Back to Admin Portal</button>
          </Link>
          <button onClick={handleCreate} disabled={loading}>
            New Recipe
          </button>
          {hasDraft && (
            <button onClick={handleContinueDraft} disabled={loading}>
              Continue Draft
            </button>
          )}
        </div>
        <h2 className={styles.heading}>Cocktail Recipes</h2>
        {error && <div className={styles.error}>{error}</div>}
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className={styles.adminRecipeList}>
            {recipes.map((recipe) => (
              <div
                key={recipe.id}
                className={styles.adminCard}
                tabIndex={0}
                role="button"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  handleEdit(recipe);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleEdit(recipe);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <div className={styles.glassOverlay}></div>
                <div className={styles.adminCardContent}>
                  <div className={styles.adminCardHeader}>
                    <div className={styles.adminCardTitle}>{recipe.title}</div>
                  </div>
                  <div className={styles.adminCardMeta}>
                    <div>By {recipe.author}</div>
                    <div>{new Date(recipe.createdAt).toLocaleString()}</div>
                  </div>
                  <div className={styles.adminCardActions}>
                    <button
                      className={styles.editBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(recipe);
                      }}
                      disabled={loading}
                    >
                      Edit
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(recipe.id);
                      }}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {showEditor && (
          <AdminRecipeEditor
            recipe={editingRecipe}
            onClose={handleEditorClose}
            forceEmpty={forceEmpty}
          />
        )}
      </div>
    </div>
  );
}
