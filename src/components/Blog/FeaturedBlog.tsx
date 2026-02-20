"use client";
import Link from "next/link";
import React from "react";
import styles from "./FeaturedBlog.module.css";

export type FeaturedBlogProps = {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};

const FeaturedBlog: React.FC<{ blog: FeaturedBlogProps }> = ({ blog }) => {
  if (!blog) return null;
  // Remove S3 URLs from content for preview
  return (
    <section className={styles.featuredSection}>
      {blog.coverPhoto && (
        <div
          className={styles.backgroundOverlay}
          style={{
            backgroundImage: `url(${blog.coverPhoto})`,
          }}
        >
          <div className={styles.warmOverlay} />
        </div>
      )}
      <div className={styles.featuredContent}>
        <div className={styles.featuredMeta}>Article</div>
        <h2 className={styles.featuredTitle}>{blog.title}</h2>
        <div className={styles.featuredMeta}>
          by {blog.author} | {new Date(blog.createdAt).toLocaleDateString()}
        </div>
        <Link href={`/blogs/${blog.id}`}>
          <button className={styles.readMoreBtn}>Read More</button>
        </Link>
      </div>
    </section>
  );
};

export default FeaturedBlog;
