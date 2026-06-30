"use client";

import { ADMIN_NAV_ITEMS } from "@/components/Layout/adminNavItems";
import Link from "next/link";
import styles from "./AdminLanding.module.css";

function AdminLanding() {
  return (
    <div className={styles.adminLandingBg}>
      <main className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>The PNW Spirits</p>
          <h1 className={styles.heading}>Admin Portal</h1>
          <p className={styles.subheading}>Choose a section to manage.</p>
        </header>
        <nav className={styles.adminNavLinks} aria-label="Admin sections">
          {ADMIN_NAV_ITEMS.map(({ href, label, hint }) => (
            <Link key={href} href={href} className={styles.adminNavBtn}>
              <span className={styles.navLabel}>{label}</span>
              <span className={styles.navHint}>{hint}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

export default AdminLanding;
