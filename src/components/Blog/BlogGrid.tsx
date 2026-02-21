"use client";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Link from "next/link";
import React from "react";
import styles from "./BlogGrid.module.css";

export type BlogGridBlog = {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};

const BlogCard: React.FC<{ blog: BlogGridBlog }> = ({ blog }) => {
  const { url: coverUrl } = useS3ImageUrl(blog.coverPhoto);
  const cardStyle = coverUrl
    ? {
        backgroundImage: `url(${coverUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : {};
  return (
    <Link
      href={`/blogs/${blog.id}`}
      className={styles.articleCard}
      style={cardStyle}
      tabIndex={0}
      aria-label={`Read blog: ${blog.title}`}
      prefetch={false}
    >
      {/* Glassy overlay for text readability and cozy effect */}
      <div className={styles.glassOverlay} />
      <div className={styles.articleContent}>
        <div className={styles.articleTitle}>{blog.title}</div>
        <div className={styles.articleMeta}>
          by {blog.author} | {new Date(blog.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
};

const BlogGrid: React.FC<{ blogs: BlogGridBlog[] }> = ({ blogs }) => {
  if (!blogs?.length) return null;
  return (
    <section className={styles.articlesSection}>
      <div className={styles.articlesTitle}>ARTICLES</div>
      <div className={styles.articlesGrid}>
        {blogs.map((blog) => (
          <BlogCard blog={blog} key={blog.id} />
        ))}
      </div>
    </section>
  );
};

export default BlogGrid;
