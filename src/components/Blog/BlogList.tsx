"use client";
import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import Link from "next/link";
import styles from "./BlogList.module.css";
import featuredStyles from "./FeaturedBlog.module.css";

type Blog = {
  id: string | number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  coverPhoto?: string | null;
  excerpt?: string;
};

type BlogListProps = {
  blogs: Blog[];
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
};

const BlogCard: React.FC<{ blog: Blog }> = ({ blog }) => {
  return (
    <Link
      href={`/blogs/${blog.id}`}
      className={featuredStyles.featuredCard}
      tabIndex={0}
      aria-label={`Read blog: ${blog.title}`}
      prefetch={false}
    >
      <S3CardBackgroundImage
        s3Key={blog.coverPhoto}
        alt={`Cover image for ${blog.title}`}
        sizes="(max-width: 900px) 100vw, 1200px"
        className={featuredStyles.cardImage}
      />
      <div className={featuredStyles.glassOverlay} />
      <div className={featuredStyles.featuredContent}>
        <div className={featuredStyles.featuredTitle}>{blog.title}</div>
        <div className={featuredStyles.featuredMeta}>
          by {blog.author} | {new Date(blog.createdAt).toLocaleDateString()}
        </div>
        {blog.excerpt && (
          <div className={featuredStyles.featuredExcerpt}>{blog.excerpt}</div>
        )}
      </div>
    </Link>
  );
};

const BlogList: React.FC<BlogListProps> = ({
  blogs,
  page,
  totalPages,
  setPage,
}) => {
  return (
    <>
      <div className={styles.blogList}>
        {blogs.length === 0 && (
          <div className={styles.noResultsText}>No blog posts yet.</div>
        )}
        {blogs.map((blog) => (
          <BlogCard blog={blog} key={blog.id} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageButton}
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
};

export default BlogList;
