"use client";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
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
  const { url: coverUrl } = useS3ImageUrl(blog.coverPhoto);
  if (!blog) return null;

  // Card background style
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
      className={styles.featuredCard}
      style={cardStyle}
      tabIndex={0}
      aria-label={`Read blog: ${blog.title}`}
      prefetch={false}
    >
      {/* Glassy overlay for text readability and cozy effect */}
      <div className={styles.glassOverlay} />
      <div className={styles.featuredContent}>
        <div className={styles.featuredTitle}>{blog.title}</div>
        <div className={styles.featuredMeta}>
          by {blog.author} | {new Date(blog.createdAt).toLocaleDateString()}
        </div>
        {blog.excerpt && (
          <div className={styles.featuredExcerpt}>{blog.excerpt}</div>
        )}
      </div>
    </Link>
  );
};

export default FeaturedBlog;
