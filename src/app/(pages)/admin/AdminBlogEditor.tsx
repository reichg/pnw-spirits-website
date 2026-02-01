"use client";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AdminBlogEditor.module.css";
import { logger } from "@/utils/logger";

interface Blog {
  id?: number;
  title: string;
  content: string;
  author: string;
}

export default function AdminBlogEditor({
  blog,
  onClose,
  adminToken,
}: {
  blog: Blog | null;
  onClose: (refresh?: boolean) => void;
  adminToken: string;
}) {
  const [title, setTitle] = useState(blog?.title || "");
  const [content, setContent] = useState(blog?.content || "");
  const [author, setAuthor] = useState(blog?.author || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  // Handles file selection from the "Add Media" button (mobile-friendly)
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
          logger.info(`poster: ${poster}`);
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
    // Reset file input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
      body: JSON.stringify({ title, content, author }),
    });
    setLoading(false);
    if (res.ok) {
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
