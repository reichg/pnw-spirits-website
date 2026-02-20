import prisma from "@/utils/prisma";
import { marked } from "marked";
import { notFound } from "next/navigation";
import styles from "./BlogPostPage.module.css";
// Custom renderer for marked to support ![video](url) as <video>
const renderer = new marked.Renderer();
const imageRenderer = renderer.image.bind(renderer);
// Helper to rewrite S3 URLs to use the /api/media proxy
function proxiedUrl(url: string) {
  if (!url) return url;
  // Only proxy S3 URLs (https://bucket.s3.region.amazonaws.com/key)
  if (!url) return url;
  // If the url looks like an S3 key (no protocol, no slashes at start), proxy it
  if (/^blog-media\//.test(url)) {
    return `/api/media?key=${encodeURIComponent(url)}`;
  }
  // Also support legacy full S3 URLs
  const match = url.match(/https:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/(.+)/);
  if (match) {
    const key = encodeURIComponent(match[1]);
    return `/api/media?key=${key}`;
  }
  return url;
}
renderer.image = function (image: {
  type: string;
  raw: string;
  href: string;
  title: string | null;
  text: string;
  tokens?: unknown;
}) {
  const { href, text, raw, title, tokens } = image;
  return imageRenderer({
    type: "image",
    raw,
    href: proxiedUrl(href),
    title,
    text,
    tokens: (tokens ?? []) as import("marked").Token[],
  });
};

async function getBlog(id: string) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId)) return null;
  return prisma.blog.findUnique({ where: { id: parsedId } });
}

export default async function BlogPostPage({
  params,
}: {
  params: { id: string };
}) {
  const resolved = params instanceof Promise ? await params : params;
  const { id } = resolved;
  const blog = await getBlog(id);
  if (!blog) return notFound();
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>{blog.title}</h1>
        <div className={styles.meta}>
          <div className={styles.author}>By {blog.author}</div>
          <div className={styles.date}>
            {new Date(blog.createdAt).toLocaleDateString()}
          </div>
        </div>
        <article
          className={styles.content}
          dangerouslySetInnerHTML={{
            __html: marked.parse(blog.content, { renderer }),
          }}
        />
      </main>
    </div>
  );
}
