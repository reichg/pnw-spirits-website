"use client";
import { useEffect, useState } from "react";
import AdminBlogEditor from "./AdminBlogEditor";
import styles from "./AdminBlogList.module.css";

function Pagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button
        className={styles.pageButton}
        onClick={() => setPage(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        Previous
      </button>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages}
      </span>
      <button
        className={styles.pageButton}
        onClick={() => setPage(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  );
}

interface Blog {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function AdminBlogList({ adminToken }: { adminToken: string }) {
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

  // Check for blog draft in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasDraft(!!localStorage.getItem("blogDraft"));
      // Listen for changes to localStorage (e.g., draft removed after save)
      const syncDraft = () => setHasDraft(!!localStorage.getItem("blogDraft"));
      window.addEventListener("storage", syncDraft);
      return () => window.removeEventListener("storage", syncDraft);
    }
  }, []);

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
    <>
      <div className={styles.container}>
        <div className={styles.actionRow}>
          <button className={styles.newBtn} onClick={handleCreate}>
            New Blog
          </button>
          {hasDraft && (
            <button
              className={styles.continueDraftBtn}
              onClick={handleContinueDraft}
            >
              Continue Draft
            </button>
          )}
        </div>
        {loading && <div>Loading...</div>}
        {error && <div className={styles.error}>{error}</div>}
        <ul className={styles.list}>
          {blogs.map((blog) => (
            <li key={blog.id} className={styles.item}>
              <div className={styles.cardHeader}>
                <div className={styles.title}>{blog.title}</div>
              </div>
              <div className={styles.cardMeta}>
                <div className={styles.metaAuthor}>By {blog.author}</div>
                <div className={styles.metaDate}>
                  {new Date(blog.createdAt).toLocaleString()}
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.editBtn}
                  onClick={() => handleEdit(blog)}
                >
                  Edit
                </button>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(blog.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      </div>
      {showEditor && (
        <AdminBlogEditor
          blog={editing}
          onClose={handleEditorClose}
          adminToken={adminToken}
          forceEmpty={forceEmpty}
        />
      )}
    </>
  );
}
