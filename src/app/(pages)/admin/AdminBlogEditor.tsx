"use client";
import { logger } from "@/utils/logger";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AdminBlogEditor.module.css";

interface Blog {
  id?: number;
  title: string;
  content: string;
  author: string;
  coverImageUrl?: string;
}

interface AdminBlogEditorProps {
  blog: Blog | null;
  onClose: (refresh?: boolean) => void;
  adminToken: string;
  forceEmpty?: boolean;
}

export default function AdminBlogEditor({
  blog,
  onClose,
  adminToken,
  forceEmpty = false,
}: AdminBlogEditorProps) {
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
    blog?.coverImageUrl || "",
  );
  // Signed URL for preview
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState<string>("");
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  // Handle cover image upload
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "cover");
    setCoverImageLoading(true);
    setError("");
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.key) {
        setCoverImageKey(data.key);
      } else {
        setError(data.error || "Cover upload failed");
      }
    } catch {
      setError("Cover upload failed");
    }
    setCoverImageLoading(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  // Fetch a signed URL for preview whenever the coverImageKey changes
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
    fetchSignedUrl();
  }, [coverImageKey]);

  // Handle media upload for content
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);
    setMediaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.key) {
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const s3Key = data.key;
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
      } else {
        setError(data.error || "Upload failed");
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
    setLoading(true);
    setError("");
    const method = blog ? "PUT" : "POST";
    const url = blog ? `/api/blogs/${blog.id}` : "/api/blogs";
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
        coverPhoto: coverImageKey,
      }),
    });
    setLoading(false);
    if (res.status === 401) {
      localStorage.setItem(
        "blogDraft",
        JSON.stringify({ title, content, author, coverPhoto: coverImageKey }),
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
            <label className={styles.label}>
              Cover Photo
              <br />
              <div className={styles.coverRow}>
                <button
                  type="button"
                  className={styles.mediaBtn}
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverImageLoading || loading}
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
                Optional. This image will be shown as the blog card background.
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
                onDrop={async (e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length === 0) return;
                  const file = files[0];
                  const formData = new FormData();
                  formData.append("file", file);
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
                        const poster = data.poster;
                        const isImage = file.type.startsWith("image/");
                        const isVideo = file.type.startsWith("video/");
                        let insert = url;
                        if (isImage) insert = `![alt text](${url})`;
                        if (isVideo) {
                          if (poster) {
                            insert = `![video|poster=${poster}](${url})`;
                          } else {
                            insert = `![video](${url})`;
                          }
                        }
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
                  disabled={mediaLoading || loading}
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
              />
            </label>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
