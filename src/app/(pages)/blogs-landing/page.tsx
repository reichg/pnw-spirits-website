// Server component: fetches blogs only once on the server
import ContentLandingLayout from "@/components/ui/ContentLandingLayout";
import { mapWithSignedImageUrl } from "@/services/media/signedImageService";
import { SITE_ORIGIN } from "@/utils/contentDetail";
import { toBlogItem, type BlogRecord } from "@/utils/contentItems";
import styles from "./BlogsLandingPage.module.css";

async function fetchLandingBlogs(): Promise<BlogRecord[]> {
  // Fetch exactly the 3 newest blogs: one per card in the layout's row.
  // Both failure modes converge on the layout's empty state instead of a 500:
  // `!res.ok` catches a clean error response, the catch block catches a network
  // failure or an unparseable body. Collapsing either guard reintroduces a crash.
  try {
    const res = await fetch(`${SITE_ORIGIN}/api/blogs?page=1&pageSize=3`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const blogs: BlogRecord[] = data.blogs || [];
    return blogs;
  } catch {
    return [];
  }
}

const BlogsLandingPage = async () => {
  const blogs = await fetchLandingBlogs();
  // Cover photos are signed here, on the server, and in parallel; see
  // mapWithSignedImageUrl for why the client path is not good enough.
  const items = await mapWithSignedImageUrl(
    blogs,
    (blog) => blog.coverPhoto,
    toBlogItem,
  );
  return (
    <ContentLandingLayout
      className={styles.blogsLandingRoot}
      eyebrow="Distillery Journal"
      heading="Blogs"
      intro="Longer reads on Pacific Northwest drinking — seasonal pours, local spirits, and the occasional foraging guide."
      items={items}
      emptyMessage="There aren't any blogs yet. Check back soon for cozy stories and updates!"
      viewAllHref="/blogs"
      viewAllLabel="View All Articles"
    />
  );
};

export default BlogsLandingPage;
