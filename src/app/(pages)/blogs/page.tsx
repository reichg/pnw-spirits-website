'use client';
import BlogList from "@/components/Blog/BlogList";
import React, { useCallback, useEffect, useState } from "react";
import styles from "./BlogsPage.module.css";

type Blog = {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
};

const PAGE_SIZE = 10;

const BlogsPage: React.FC = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fetchBlogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/blogs?page=${pageNum}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error("Failed to fetch blogs");
      const data = await res.json();
      setBlogs(data.blogs || []);
      setTotalPages(Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE)));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlogs(page);
  }, [page, fetchBlogs]);

  return (
    <div className={styles.page} style={{ fontFamily: "var(--font-primary)" }}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Blogs</h1>
        {error && (
          <div style={{ color: "var(--color-error)", margin: "1em 0" }}>
            {error}
          </div>
        )}
        {loading ? (
          <div
            style={{
              color: "var(--color-accent-secondary)",
              margin: "2em 0",
              fontSize: "1.2em",
            }}
          >
            Loading blogs...
          </div>
        ) : (
          <BlogList
            blogs={blogs}
            page={page}
            totalPages={totalPages}
            setPage={setPage}
          />
        )}
      </main>
    </div>
  );
};

export default BlogsPage;