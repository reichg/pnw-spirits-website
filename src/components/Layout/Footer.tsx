import Link from "next/link";
import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLinks}>
        <Link className={styles.footerLink} href="/blogs-landing">
          Blogs
        </Link>
        <Link className={styles.footerLink} href="/recipes-landing">
          Recipes
        </Link>
        <Link className={styles.footerLink} href="/videos-landing">
          Videos
        </Link>
        <Link className={styles.footerLink} href="/about">
          About
        </Link>
        <Link className={styles.footerLink} href="/contact">
          Contact
        </Link>
        <Link
          className={`${styles.footerLink} ${styles.adminFooterLink}`}
          href="/admin"
        >
          Admin
        </Link>
      </div>
      <div className={styles.copyright}>
        &copy; {new Date().getFullYear()} PNW Spirits. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
