"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
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

  return (
    <section className={styles.featuredSection}>
      <h2 className={styles.featuredHeading}>Featured Blog</h2>
      <Link
        href={`/blogs/${blog.id}`}
        className={styles.featuredCard}
        tabIndex={0}
        aria-label={`Read blog: ${blog.title}`}
        prefetch={false}
      >
        <S3CardBackgroundImage
          s3Key={blog.coverPhoto}
          alt={`Cover image for ${blog.title}`}
          sizes="(max-width: 900px) 100vw, 1200px"
          className={styles.cardImage}
          priority
        />
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
    </section>
  );
};

export default FeaturedBlog;
