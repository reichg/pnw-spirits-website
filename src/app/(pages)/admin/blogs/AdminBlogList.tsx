"use client";
import { useEffect, useState } from "react";
import { useAdminToken } from "../AdminTokenContext";
import AdminBlogEditor from "./AdminBlogEditor";
import Pagination from "@/components/ui/Pagination";
import styles from "./AdminBlogList.module.css";

interface Blog {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function AdminBlogList() {
  const { token: adminToken, setToken } = useAdminToken();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Blog | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [forceEmpty, setForceEmpty] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const pageSize = 10;
  const totalPages = Math.ceil(total / pageSize);

  // Check for blog draft in localStorage and listen for token removal
  useEffect(() => {
    if (typeof window !== "undefined") {
      // SSR-safe: localStorage is only available on the client, so the initial
      // draft flag must be synced from an effect to avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasDraft(!!localStorage.getItem("blogDraft"));
      // Listen for changes to localStorage (e.g., draft removed after save or token removed)
      const syncDraft = () => setHasDraft(!!localStorage.getItem("blogDraft"));
      const handleStorage = (event: StorageEvent) => {
        if (event.key === "blogDraft") syncDraft();
        if (event.key === "adminToken" && event.newValue === null) {
          setToken(null);
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, [setToken]);
  // Redirect or logout if adminToken is missing
  useEffect(() => {
    if (!adminToken) {
      // Optionally redirect to login or show error
      window.location.href = "/admin/login";
    }
  }, [adminToken]);

  const fetchBlogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/blogs?page=${page}&pageSize=${pageSize}`, {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
      });
      const data = await res.json();
      setBlogs(data.blogs || []);
      setTotal(data.total || 0);
    } catch {
      setError("Failed to load blogs");
    }
    setLoading(false);
  };

  useEffect(() => {
    // Data fetch on page change; the leading setLoading(true) inside fetchBlogs
    // runs synchronously and is intended (loading state must reflect immediately).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBlogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleEdit = (blog: Blog) => {
    setEditing(blog);
    setShowEditor(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this blog?")) return;
    const res = await fetch(`/api/blogs/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (res.ok) fetchBlogs();
  };

  const handleCreate = () => {
    setEditing(null);
    setForceEmpty(true);
    setShowEditor(true);
  };

  const handleContinueDraft = () => {
    setEditing(null); // new blog, but draft will be loaded by editor
    setForceEmpty(false);
    setShowEditor(true);
  };

  const handleEditorClose = (refresh = false) => {
    setShowEditor(false);
    setEditing(null);
    setForceEmpty(false);
    // Update hasDraft immediately in case the draft was removed on save
    if (typeof window !== "undefined") {
      setHasDraft(!!localStorage.getItem("blogDraft"));
    }
    if (refresh) fetchBlogs();
  };

  return (
    <div className={styles.adminPageBg}>
      <div className={styles.container}>
        <div className={styles.actionRow}>
          <button onClick={handleCreate}>New Blog</button>
          {hasDraft && (
            <button onClick={handleContinueDraft}>Continue Draft</button>
          )}
        </div>
        <h2 className={styles.heading}>Blogs</h2>
        {loading && <div>Loading...</div>}
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.adminBlogList}>
          {blogs.map((blog) => (
            <div
              key={blog.id}
              className={styles.adminCard}
              tabIndex={0}
              role="button"
              onClick={(e) => {
                // Prevent card click if Edit/Delete button is clicked
                if ((e.target as HTMLElement).closest("button")) return;
                handleEdit(blog);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleEdit(blog);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <div className={styles.glassOverlay}></div>
              <div className={styles.adminCardContent}>
                <div className={styles.adminCardHeader}>
                  <div className={styles.adminCardTitle}>{blog.title}</div>
                </div>
                <div className={styles.adminCardMeta}>
                  <div>By {blog.author}</div>
                  <div>Date {new Date(blog.createdAt).toLocaleString()}</div>
                </div>
                <div className={styles.adminCardActions}>
                  <button
                    className={styles.editBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(blog);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(blog.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
      {showEditor && (
        <AdminBlogEditor
          blog={editing}
          onClose={handleEditorClose}
          forceEmpty={forceEmpty}
        />
      )}
    </div>
  );
}
