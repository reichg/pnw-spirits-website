"use client";
import { useEffect, useState } from "react";
import styles from "./BlogList.module.css";

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
    <div
      className={styles.pagination}
      style={{ display: "flex", justifyContent: "center", marginTop: "2em" }}
    >
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

type Blog = {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
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
    <>
      <div className={styles.blogList}>
        {blogs.length === 0 && <div>No blog posts yet.</div>}
        {blogs.map((blog) => {
          const cardStyle = blog.coverPhoto
            ? {
                backgroundImage: `linear-gradient(rgba(38,28,24,0.22), rgba(38,28,24,0.22)), url(${blog.coverPhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : {
                background:
                  "linear-gradient(120deg, var(--color-bg-soft) 80%, var(--color-bg-warm) 100%)",
              };
          return (
            <a
              href={`/blogs/${blog.id}`}
              className={styles.blogCard}
              key={blog.id}
              tabIndex={0}
              aria-label={`Read blog post: ${blog.title}`}
              style={cardStyle}
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
          );
        })}
      </div>
      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
    </>
  );
};

export default BlogList;
