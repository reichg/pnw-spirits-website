import PaginatedBlogList from "@/components/Blog/PaginatedBlogList";
import styles from "./BlogsPage.module.css";

export default function BlogsPage() {
  return (
    <div className={styles.page} style={{ fontFamily: "var(--font-primary)" }}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Blogs</h1>
        <PaginatedBlogList />
      </main>
    </div>
  );
}
