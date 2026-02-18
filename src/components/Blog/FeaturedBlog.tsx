import Link from "next/link";
import React from "react";
import styles from "./FeaturedBlog.module.css";

export type FeaturedBlogProps = {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  imageUrl?: string;
  excerpt?: string;
};

const FeaturedBlog: React.FC<{ blog: FeaturedBlogProps }> = ({ blog }) => {
  if (!blog) return null;
  return (
    <section className={styles.featuredSection}>
      {blog.imageUrl && (
        <img
          src={blog.imageUrl}
          alt={blog.title}
          className={styles.featuredImage}
        />
      )}
      <div className={styles.featuredContent}>
        <div className={styles.featuredMeta}>Article</div>
        <h2 className={styles.featuredTitle}>{blog.title}</h2>
        <div className={styles.featuredMeta}>
          by {blog.author} | {new Date(blog.createdAt).toLocaleDateString()}
        </div>
        <div className={styles.featuredExcerpt}>
          {blog.excerpt ||
            blog.content.slice(0, 160) +
              (blog.content.length > 160 ? "..." : "")}
        </div>
        <Link href={`/blogs/${blog.id}`}>
          <button className={styles.readMoreBtn}>Read More</button>
        </Link>
      </div>
    </section>
  );
};

export default FeaturedBlog;
