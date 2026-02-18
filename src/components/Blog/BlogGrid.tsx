import Link from "next/link";
import React from "react";
import styles from "./BlogGrid.module.css";

export type BlogGridBlog = {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  imageUrl?: string;
  excerpt?: string;
};

const BlogGrid: React.FC<{ blogs: BlogGridBlog[] }> = ({ blogs }) => {
  if (!blogs?.length) return null;
  return (
    <section className={styles.articlesSection}>
      <div className={styles.articlesTitle}>ARTICLES</div>
      <div className={styles.articlesGrid}>
        {blogs.map((blog) => (
          <div className={styles.articleCard} key={blog.id}>
            {blog.imageUrl && (
              <img
                src={blog.imageUrl}
                alt={blog.title}
                className={styles.articleImage}
              />
            )}
            <div className={styles.articleContent}>
              <div className={styles.articleTitle}>{blog.title}</div>
              <div className={styles.articleMeta}>
                by {blog.author} |{" "}
                {new Date(blog.createdAt).toLocaleDateString()}
              </div>
              <div className={styles.articleExcerpt}>
                {blog.excerpt ||
                  blog.content.slice(0, 100) +
                    (blog.content.length > 100 ? "..." : "")}
              </div>
              <Link href={`/blogs/${blog.id}`}>
                <button className={styles.readMoreBtn}>Read More</button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BlogGrid;
