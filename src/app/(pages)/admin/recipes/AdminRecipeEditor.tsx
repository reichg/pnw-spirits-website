"use client";
import { logger } from "@/utils/logger";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminToken } from "../AdminTokenContext";
import styles from "./AdminRecipeEditor.module.css";

interface CocktailRecipe {
  id?: number;
  title: string;
  description: string;
  author: string;
  coverImageUrl?: string;
  coverPhoto?: string; // S3 key for cover image
  ingredients: string;
  instructions: string;
}

interface AdminRecipeEditorProps {
  recipe: CocktailRecipe | null;
  onClose: (refresh?: boolean) => void;
  forceEmpty?: boolean;
}

export default function AdminRecipeEditor({
  recipe,
  onClose,
  forceEmpty = false,
}: AdminRecipeEditorProps) {
  const { token: adminToken, setToken } = useAdminToken();
  useEffect(() => {
    const checkToken = () => {
      const t =
        typeof window !== "undefined"
          ? localStorage.getItem("adminToken")
          : null;
      if (t !== adminToken) setToken(t);
    };
    checkToken();
    const interval = setInterval(checkToken, 500);
    return () => clearInterval(interval);
  }, [adminToken, setToken]);

  const getInitialField = (field: keyof CocktailRecipe) => {
    if (recipe) return recipe[field] || "";
    if (forceEmpty) return "";
    if (typeof window !== "undefined") {
      const draft = localStorage.getItem("recipeDraft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          return parsed[field] || "";
        } catch {}
      }
    }
    return "";
  };

  const [title, setTitle] = useState(() => getInitialField("title"));
  const [description, setDescription] = useState(() =>
    getInitialField("description"),
  );
  const [author, setAuthor] = useState(() => getInitialField("author"));
  const [ingredients, setIngredients] = useState(() =>
    getInitialField("ingredients"),
  );
  const [instructions, setInstructions] = useState(() =>
    getInitialField("instructions"),
  );
  const [coverImageKey, setCoverImageKey] = useState<string>(
    recipe?.coverPhoto || "",
  );
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string>("");
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    if (!adminToken) {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "recipeDraft",
          JSON.stringify({
            title,
            description,
            author,
            ingredients,
            instructions,
            coverPhoto: coverImageKey,
          }),
        );
      }
      window.location.href = "/admin/login";
    }
  }, [
    adminToken,
    title,
    description,
    author,
    ingredients,
    instructions,
    coverImageKey,
  ]);

  const isDisabled = !adminToken;

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setCoverImageLoading(true);
    setError("");
    try {
      // 1. Get a signed upload URL
      const key = `recipe-media/recipe-cover-photos/${file.name}`;
      const res = await fetch("/api/s3-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Cover upload failed");
        setCoverImageLoading(false);
        if (coverInputRef.current) coverInputRef.current.value = "";
        return;
      }
      // 2. Upload file directly to S3
      const uploadRes = await fetch(data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setError("Cover upload failed (S3 error)");
        setCoverImageLoading(false);
        if (coverInputRef.current) coverInputRef.current.value = "";
        return;
      }
      setCoverImageKey(key);
    } catch {
      setError("Cover upload failed");
    }
    setCoverImageLoading(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  useEffect(() => {
    async function fetchSignedUrl() {
      if (!coverImageKey) {
        setCoverImagePreviewUrl("");
        return;
      }
      try {
        const res = await fetch(
          `/api/s3-signed-url?key=${encodeURIComponent(coverImageKey)}`,
        );
        const data = await res.json();
        if (res.ok && data.url) {
          logger.info("Cover image signed URL:", data.url);
          setCoverImagePreviewUrl(data.url);
        } else {
          setCoverImagePreviewUrl("");
        }
      } catch {
        setCoverImagePreviewUrl("");
      }
    }
    // Fallback: if we have a key but no preview URL, fetch it on mount
    if (coverImageKey && !coverImagePreviewUrl) {
      fetchSignedUrl();
    }
  }, [coverImageKey, coverImagePreviewUrl]);

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setMediaLoading(true);
    setError("");
    try {
      // 1. Get a signed upload URL
      const key = `recipe-media/recipe-content-media/${file.name}`;
      const res = await fetch("/api/s3-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Media upload failed");
        setMediaLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      // 2. Upload file directly to S3
      const uploadRes = await fetch(data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setError("Media upload failed (S3 error)");
        setMediaLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      // 3. Insert S3 key or markdown image into instructions
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const s3Key = key;
        const isImage = file.type.startsWith("image/");
        let insert = s3Key;
        if (isImage) insert = `![image](${s3Key})`;
        setInstructions(
          instructions.slice(0, start) + insert + instructions.slice(end),
        );
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd =
            start + insert.length;
          textarea.focus();
        }, 0);
      }
    } catch {
      setError("Upload failed");
    }
    setMediaLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("You are not authenticated. Please log in again.");
      window.location.href = "/admin/login";
      return;
    }
    setLoading(true);
    setError("");
    const method = recipe ? "PUT" : "POST";
    const url = recipe ? `/api/recipes/${recipe.id}` : "/api/recipes";
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title,
        description,
        author,
        ingredients,
        instructions,
        coverPhoto: coverImageKey,
      }),
    });
    setLoading(false);
    if (res.status === 401) {
      localStorage.setItem(
        "recipeDraft",
        JSON.stringify({
          title,
          description,
          author,
          ingredients,
          instructions,
          coverPhoto: coverImageKey,
        }),
      );
      setError("Session expired. Your draft is saved. Please log in again.");
      setTimeout(() => {
        window.location.href = "/admin/login";
      }, 1500);
      return;
    }
    if (res.ok) {
      localStorage.removeItem("recipeDraft");
      onClose(true);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save recipe");
    }
  };

  if (typeof window === "undefined") return null;
  return createPortal(
    <div className={styles.modal}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 className={styles.heading}>
          {recipe ? "Edit Recipe" : "New Recipe"}
        </h3>
        <div className={styles.fieldsContainer}>
          {/* Cover Photo Upload */}
          <div className={styles.field}>
            <label className={styles.label}>
              Cover Photo
              <br />
              <div className={styles.coverRow}>
                <button
                  type="button"
                  className={styles.mediaBtn}
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverImageLoading || loading || isDisabled}
                >
                  {coverImageLoading
                    ? "Uploading..."
                    : coverImagePreviewUrl
                      ? "Change Cover"
                      : "Add Cover"}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={coverInputRef}
                  style={{ display: "none" }}
                  onChange={handleCoverChange}
                  tabIndex={-1}
                  disabled={isDisabled}
                />
                {coverImagePreviewUrl &&
                  /^https?:\/\//.test(coverImagePreviewUrl) && (
                    <Image
                      src={coverImagePreviewUrl}
                      alt="Cover preview"
                      className={styles.coverPreview}
                      width={90}
                      height={60}
                    />
                  )}
              </div>
              <small>
                Optional. This image will be shown as the recipe card
                background.
              </small>
            </label>
          </div>
          {/* Title Field */}
          <div className={styles.field}>
            <label className={styles.label}>
              Title
              <br />
              <input
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={isDisabled}
              />
            </label>
          </div>
          {/* Description Field */}
          <div className={styles.field}>
            <label className={styles.label}>
              Description
              <br />
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={3}
                disabled={isDisabled}
              />
            </label>
          </div>
          {/* Ingredients Field */}
          <div className={styles.field}>
            <label className={styles.label}>
              Ingredients
              <br />
              <textarea
                className={styles.textarea}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                required
                rows={3}
                disabled={isDisabled}
              />
              <small>Comma-separated or JSON list.</small>
            </label>
          </div>
          {/* Instructions Field & Media */}
          <div className={styles.field}>
            <label className={styles.label}>
              Instructions
              <br />
              <textarea
                className={styles.textarea}
                ref={textareaRef}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                required
                rows={6}
                disabled={isDisabled}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (isDisabled) return;
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length === 0) return;
                  const file = files[0];
                  setLoading(true);
                  setError("");
                  try {
                    // 1. Get a signed upload URL
                    const key = `recipe-media/${file.name}`;
                    const res = await fetch("/api/s3-signed-url", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key, contentType: file.type }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.url) {
                      setError(data.error || "Upload failed");
                      setLoading(false);
                      return;
                    }
                    // 2. Upload file directly to S3
                    const uploadRes = await fetch(data.url, {
                      method: "PUT",
                      headers: { "Content-Type": file.type },
                      body: file,
                    });
                    if (!uploadRes.ok) {
                      setError("Upload failed (S3 error)");
                      setLoading(false);
                      return;
                    }
                    // 3. Insert S3 key or markdown image into instructions
                    const textarea = textareaRef.current;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const s3Key = key;
                      const isImage = file.type.startsWith("image/");
                      let insert = s3Key;
                      if (isImage) insert = `![image](${s3Key})`;
                      setInstructions(
                        instructions.slice(0, start) +
                          insert +
                          instructions.slice(end),
                      );
                      setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd =
                          start + insert.length;
                        textarea.focus();
                      }, 0);
                    }
                  } catch {
                    setError("Upload failed");
                  }
                  setLoading(false);
                }}
                onDragOver={(e) => e.preventDefault()}
              />
              <div className={styles.mediaRow}>
                <button
                  type="button"
                  className={styles.mediaBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={mediaLoading || loading || isDisabled}
                >
                  {mediaLoading ? "Uploading..." : "Add Media"}
                </button>
                <input
                  type="file"
                  accept="image/*,video/*"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleMediaChange}
                  tabIndex={-1}
                  disabled={isDisabled}
                />
              </div>
              <small>Drag and drop media, or Add Media.</small>
            </label>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Author
              <br />
              <input
                className={styles.input}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                required
                disabled={isDisabled}
              />
            </label>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={loading || isDisabled}
          >
            Cancel
          </button>
          <button type="submit" disabled={loading || isDisabled}>
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
