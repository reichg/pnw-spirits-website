// Blogs Landing Page - displays featured and recent blogs

import BlogGrid from "@/components/Blog/BlogGrid";
import FeaturedBlog, {
  FeaturedBlogProps,
} from "@/components/Blog/FeaturedBlog";
import Link from "next/link";
import styles from "./BlogsLandingPage.module.css";

type Blog = FeaturedBlogProps;

async function fetchLandingBlogs(): Promise<{
  featured: Blog | null;
  articles: Blog[];
}> {
  // Fetch 4 newest blogs (1 featured, 3 for grid)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/blogs?page=1&pageSize=4`, {
    cache: "no-store",
  });
  if (!res.ok) return { featured: null, articles: [] };
  const data = await res.json();
  const blogs: Blog[] = data.blogs || [];
  return {
    featured: blogs[0] || null,
    articles: blogs.slice(1, 4),
  };
}

const BlogsLandingPage = async () => {
  const { featured, articles } = await fetchLandingBlogs();

  return (
    <main className={styles.blogsLandingRoot}>
      {featured && <FeaturedBlog blog={featured} />}
      <BlogGrid blogs={articles} />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2.5rem",
        }}
      >
        <Link href="/blogs">
          <button className="articlesBtn">View All Articles</button>
        </Link>
      </div>
    </main>
  );
};

export default BlogsLandingPage;
