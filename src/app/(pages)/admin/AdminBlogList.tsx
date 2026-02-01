"use client";
import { useEffect, useState } from "react";
import AdminBlogEditor from "./AdminBlogEditor";
import styles from "./AdminBlogList.module.css";

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

  const fetchBlogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/blogs", {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
      });
      const data = await res.json();
      setBlogs(data.blogs || []);
    } catch {
      setError("Failed to load blogs");
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await fetchBlogs();
    })();
  }, []);

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
    setShowEditor(true);
  };

  const handleEditorClose = (refresh = false) => {
    setShowEditor(false);
    setEditing(null);
    if (refresh) fetchBlogs();
  };

  return (
    <>
      <div className={styles.container}>
        <button className={styles.newBtn} onClick={handleCreate}>
          + New Blog
        </button>
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
      </div>
      {showEditor && (
        <AdminBlogEditor
          blog={editing}
          onClose={handleEditorClose}
          adminToken={adminToken}
        />
      )}
    </>
  );
}
