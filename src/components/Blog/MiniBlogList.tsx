"use client";
import { useEffect, useState } from "react";
import styles from "./MiniBlogList.module.css";

type Blog = {
  id: number;
  title: string;
  author: string;
  createdAt: string;
};

const MiniBlogList = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/blogs?page=1&pageSize=5")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch blogs");
        return res.json();
      })
      .then((data) => {
        setBlogs(data.blogs || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load blogs.");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className={styles.miniBlogList}>Loading...</div>;
  if (error) return <div className={styles.miniBlogList}>{error}</div>;

  return (
    <div className={styles.miniBlogList}>
      <div className={styles.miniBlogListHeader}></div>
      {blogs.length === 0 && <div>No blog posts yet.</div>}
      {blogs.map((blog) => {
        return (
          <a
            className={styles.miniBlogCard}
            key={blog.id}
            href={`/blogs/${blog.id}`}
          >
            <div className={styles.miniBlogTitle}>{blog.title}</div>
            <div className={styles.miniBlogMetaContainer}>
              <div className={styles.miniBlogAuthor}>By {blog.author}</div>
              <div className={styles.miniBlogDate}>
                {new Date(blog.createdAt).toLocaleDateString()}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
};

export default MiniBlogList;
