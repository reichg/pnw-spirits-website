import { notFound } from "next/navigation";
import styles from "./BlogPostPage.module.css";

async function getBlog(id: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/blogs/${id}`,
  );
  if (!res.ok) return null;
  return res.json();
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
          By {blog.author} &middot;{" "}
          {new Date(blog.createdAt).toLocaleDateString()}
        </div>
        <article className={styles.content}>{blog.content}</article>
      </main>
    </div>
  );
}
