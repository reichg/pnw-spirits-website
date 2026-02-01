"use client";
import { useEffect, useState } from "react";
import styles from "./BlogList.module.css";

type Blog = {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
};

const BlogList = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchBlogs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/blogs?page=${page}&pageSize=${pageSize}`);
        if (!res.ok) throw new Error("Failed to fetch blogs");
        const data = await res.json();
        setBlogs(data.blogs || []);
        setTotal(data.total || 0);
      } catch {
        setError("Could not load blogs.");
      } finally {
        setLoading(false);
      }
    };
    fetchBlogs();
  }, [page, pageSize]);

  if (loading) return <div className={styles.blogList}>Loading...</div>;
  if (error) return <div className={styles.blogList}>{error}</div>;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className={styles.blogList}>
      {blogs.length === 0 && <div>No blog posts yet.</div>}
      {blogs.map((blog) => (
        <a
          href={`/blogs/${blog.id}`}
          className={styles.blogCard}
          key={blog.id}
          tabIndex={0}
          aria-label={`Read blog post: ${blog.title}`}
        >
          <div className={styles.blogTitle}>{blog.title}</div>
          <div className={styles.blogMetaContainer}>
            <div className={styles.blogAuthor}>By {blog.author}</div>
            <div className={styles.blogDate}>
              {new Date(blog.createdAt).toLocaleDateString()}
            </div>
          </div>
          <span className={styles.readMore}>Read More</span>
        </a>
      ))}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default BlogList;
