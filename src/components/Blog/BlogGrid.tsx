"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
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
  return (
    <Link
      href={`/blogs/${blog.id}`}
      className={styles.articleCard}
      tabIndex={0}
      aria-label={`Read blog: ${blog.title}`}
      prefetch={false}
    >
      <S3CardBackgroundImage
        s3Key={blog.coverPhoto}
        alt={`Cover image for ${blog.title}`}
        sizes="(max-width: 900px) 100vw, 300px"
        className={styles.cardImage}
      />
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
