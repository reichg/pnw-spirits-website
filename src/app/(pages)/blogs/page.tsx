import BlogList from "@/components/Blog/BlogList";
import styles from "./BlogsPage.module.css";

export default function BlogsPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Blogs</h1>
        <BlogList />
      </main>
    </div>
  );
}
