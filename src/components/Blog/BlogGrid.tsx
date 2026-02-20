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

const BlogGrid: React.FC<{ blogs: BlogGridBlog[] }> = ({ blogs }) => {
  if (!blogs?.length) return null;

  return (
    <section className={styles.articlesSection}>
      <div className={styles.articlesTitle}>ARTICLES</div>
      <div className={styles.articlesGrid}>
        {blogs.map((blog) => {
          const cardStyle = blog.coverPhoto
            ? {
                backgroundImage: `linear-gradient(rgba(38,28,24,0.32), rgba(38,28,24,0.32)), url(${blog.coverPhoto})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }
            : {
                background:
                  "linear-gradient(120deg, var(--color-bg-soft) 80%, var(--color-bg-warm) 100%)",
              };
          return (
            <div className={styles.articleCard} key={blog.id} style={cardStyle}>
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
          );
        })}
      </div>
    </section>
  );
};

export default BlogGrid;
