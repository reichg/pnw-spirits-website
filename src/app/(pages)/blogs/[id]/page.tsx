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
  if (text && text.toLowerCase().startsWith("video")) {
    // Support poster: ![video|poster=https://...](video.mp4)
    let poster = "";
    const match = text.match(/poster=(\S+)/i);
    if (match) poster = match[1];
    const proxiedPoster = proxiedUrl(poster);
    return `<video controls playsinline src="${proxiedUrl(href)}" preload="metadata"${poster ? ` poster=\"${proxiedPoster}\"` : ""} style="max-width:100%;border-radius:8px;margin:1.2em 0;box-shadow:0 2px 8px rgba(35,66,54,0.1);background:var(--pnw-cream,#f8f5f2);">
      Sorry, your browser doesn't support embedded videos.
    </video>`;
  }
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
