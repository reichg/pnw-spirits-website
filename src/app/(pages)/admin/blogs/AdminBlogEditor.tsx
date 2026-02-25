"use client";
import { logger } from "@/utils/logger";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminToken } from "../AdminTokenContext";
import styles from "./AdminBlogEditor.module.css";

interface Blog {
  id?: number;
  title: string;
  content: string;
  author: string;
  coverImageUrl?: string;
  coverPhoto?: string; // S3 key for cover image
}

interface AdminBlogEditorProps {
  blog: Blog | null;
  onClose: (refresh?: boolean) => void;
  forceEmpty?: boolean;
}

export default function AdminBlogEditor({
  blog,
  onClose,
  forceEmpty = false,
}: AdminBlogEditorProps) {
  const { token: adminToken, setToken } = useAdminToken();
  // Always check localStorage for adminToken and update context
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

  const getInitialField = (field: "title" | "content" | "author") => {
    if (blog) return blog[field] || "";
    if (forceEmpty) return "";
    if (typeof window !== "undefined") {
      const draft = localStorage.getItem("blogDraft");
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
  const [content, setContent] = useState(() => getInitialField("content"));
  const [author, setAuthor] = useState(() => getInitialField("author"));
  // S3 key for the cover image
  const [coverImageKey, setCoverImageKey] = useState<string>(
    blog?.coverPhoto || "",
  );
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string>("");
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  // Removal state
  const [coverMarkedForRemoval, setCoverMarkedForRemoval] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Redirect or logout if adminToken is missing
  useEffect(() => {
    if (!adminToken) {
      // Save draft before redirect
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "blogDraft",
          JSON.stringify({
            title,
            content,
            author,
            coverPhoto: coverImageKey,
          }),
        );
      }
      window.location.href = "/admin/login";
    }
  }, [adminToken, title, content, author, coverImageKey]);

  // Disable form if token is missing
  const isDisabled = !adminToken;

  // Handle cover image upload
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setCoverImageLoading(true);
    setError("");
    try {
      // 1. Get a signed upload URL
      const key = `blog-media/blog-cover-photos/${file.name}`;
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

  // Fetch a signed URL for preview whenever the coverImageKey changes
  useEffect(() => {
    async function fetchSignedUrl() {
      if (!coverImageKey || coverMarkedForRemoval) {
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
    if (coverImageKey && !coverImagePreviewUrl && !coverMarkedForRemoval) {
      fetchSignedUrl();
    }
  }, [coverImageKey, coverImagePreviewUrl, coverMarkedForRemoval]);

  // Handle media upload for content
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setMediaLoading(true);
    setError("");
    try {
      // 1. Get a signed upload URL
      const key = `blog-media/blog-content-media/${file.name}`;
      const res = await fetch("/api/s3-signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Upload failed");
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
        setError("Upload failed (S3 error)");
        setMediaLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      // 3. Insert S3 key or markdown image into content
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const s3Key = key;
        const isImage = file.type.startsWith("image/");
        let insert = s3Key;
        if (isImage) insert = `![image](${s3Key})`;
        setContent(content.slice(0, start) + insert + content.slice(end));
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

  // Submit blog post, including cover image key
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("You are not authenticated. Please log in again.");
      window.location.href = "/admin/login";
      return;
    }
    setLoading(true);
    setError("");
    const method = blog ? "PUT" : "POST";
    const url = blog ? `/api/blogs/${blog.id}` : "/api/blogs";
    // If marked for removal, send coverPhoto: null
    const coverPhotoPayload = coverMarkedForRemoval
      ? null
      : coverImageKey || undefined;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title,
        content,
        author,
        coverPhoto: coverPhotoPayload,
      }),
    });
    setLoading(false);
    if (res.status === 401) {
      localStorage.setItem(
        "blogDraft",
        JSON.stringify({
          title,
          content,
          author,
          coverPhoto: coverPhotoPayload,
        }),
      );
      setError("Session expired. Your draft is saved. Please log in again.");
      setTimeout(() => {
        window.location.href = "/admin/login";
      }, 1500);
      return;
    }
    if (res.ok) {
      localStorage.removeItem("blogDraft");
      onClose(true);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save blog");
    }
  };

  if (typeof window === "undefined") return null;
  return createPortal(
    <div className={styles.modal}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 className={styles.heading}>{blog ? "Edit Blog" : "New Blog"}</h3>
        <div className={styles.fieldsContainer}>
          {/* Cover Photo Upload */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cover-photo-input">
              Cover Photo
            </label>
            <div
              className={styles.coverRow}
              aria-labelledby="cover-photo-input"
            >
              <button
                type="button"
                className={`${styles.mediaBtn} ${styles.coverAddBtn}`}
                onClick={() => coverInputRef.current?.click()}
                disabled={coverImageLoading || loading || isDisabled}
                aria-label={
                  coverImagePreviewUrl && !coverMarkedForRemoval
                    ? "Change cover photo"
                    : "Add cover photo"
                }
              >
                {coverImageLoading
                  ? "Uploading..."
                  : coverImagePreviewUrl && !coverMarkedForRemoval
                    ? "Change Cover"
                    : "Add Cover"}
              </button>
              <input
                id="cover-photo-input"
                type="file"
                accept="image/*"
                ref={coverInputRef}
                className={styles.coverInputHidden}
                onChange={(e) => {
                  handleCoverChange(e);
                  setCoverMarkedForRemoval(false);
                }}
                tabIndex={-1}
                disabled={isDisabled}
              />
              {coverImagePreviewUrl &&
                !coverMarkedForRemoval &&
                /^https?:\/\//.test(coverImagePreviewUrl) && (
                  <Image
                    src={coverImagePreviewUrl}
                    alt="Cover preview"
                    className={styles.coverPreview}
                    width={90}
                    height={60}
                  />
                )}
              {coverImagePreviewUrl && !coverMarkedForRemoval && (
                <button
                  type="button"
                  className={`${styles.mediaBtn} ${styles.coverRemoveBtn}`}
                  onClick={() => {
                    setCoverMarkedForRemoval(true);
                    setCoverImagePreviewUrl("");
                  }}
                  disabled={loading || isDisabled}
                  aria-label="Remove cover photo"
                >
                  Remove Cover
                </button>
              )}
              {coverMarkedForRemoval && (
                <div className={styles.coverPlaceholder} aria-live="polite">
                  Cover photo will be removed
                </div>
              )}
            </div>
            <small>
              Optional. This image will be shown as the blog card background.
            </small>
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
          {/* Content Field & Media */}
          <div className={styles.field}>
            <label className={styles.label}>
              Content
              <br />
              <textarea
                className={styles.textarea}
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={6}
                disabled={isDisabled}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (isDisabled) return;
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length === 0) return;
                  const file = files[0];
                  const formData = new FormData();
                  formData.append("file", file);
                  // Use the same type logic as handleMediaChange
                  const isImage = file.type.startsWith("image/");
                  if (isImage) {
                    formData.append("type", "blog-image");
                  } else {
                    formData.append("type", "blog-media");
                  }
                  setLoading(true);
                  setError("");
                  try {
                    const res = await fetch("/api/uploads", {
                      method: "POST",
                      body: formData,
                    });
                    const data = await res.json();
                    if (res.ok && data.url) {
                      const textarea = textareaRef.current;
                      if (textarea) {
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const url = data.url;
                        let insert = url;
                        if (isImage) insert = `![alt text](${url})`;
                        setContent(
                          content.slice(0, start) + insert + content.slice(end),
                        );
                        setTimeout(() => {
                          textarea.selectionStart = textarea.selectionEnd =
                            start + insert.length;
                          textarea.focus();
                        }, 0);
                      }
                    } else {
                      setError(data.error || "Upload failed");
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
