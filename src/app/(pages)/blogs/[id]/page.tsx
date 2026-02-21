import prisma from "@/utils/prisma";
import { marked } from "marked";
import { notFound } from "next/navigation";
import styles from "./BlogPostPage.module.css";

// Custom renderer for marked to support ![video](url) as <video>
// and to proxy S3 images through the /api/media endpoint

// --- Markdown image proxy logic ---
const renderer = new marked.Renderer();
const imageRenderer = renderer.image.bind(renderer);
function proxiedUrl(url: string) {
  if (!url) return url;
  // Proxy S3 keys and legacy S3 URLs
  if (/^blog-media\//.test(url)) {
    return `/api/media?key=${encodeURIComponent(url)}`;
  }
  const match = url.match(/https:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/(.+)/);
  if (match) {
    const key = encodeURIComponent(match[1]);
    return `/api/media?key=${key}`;
  }
  return url;
}
renderer.image = function (image) {
  return imageRenderer({
    ...image,
    href: proxiedUrl(image.href),
    tokens: (image.tokens ?? []) as import("marked").Token[],
  });
};

// --- Fetch blog post by ID ---
async function getBlog(id: string) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId)) return null;
  return prisma.blog.findUnique({ where: { id: parsedId } });
}

// --- Blog Post Page: warm, elegant, responsive ---
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
          <span className={styles.author}>By {blog.author}</span>
          <span className={styles.date}>
            {new Date(blog.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
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
