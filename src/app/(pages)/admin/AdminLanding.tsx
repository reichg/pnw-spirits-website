"use client";
import Link from "next/link";
import styles from "./AdminLanding.module.css";

export default function AdminLanding() {
  return (
    <div className={styles.adminLandingBg}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Admin Portal</h1>
        <div className={styles.adminNavLinks}>
          <Link href="/admin/blogs" className={styles.adminNavBtn}>
            <button>Manage Blogs</button>
          </Link>
          <Link href="/admin/recipes" className={styles.adminNavBtn}>
            <button>Manage Recipes</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
