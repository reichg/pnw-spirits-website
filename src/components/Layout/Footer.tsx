import Link from "next/link";
import styles from "./Footer.module.css";

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLinks}>
        <Link className={styles.footerLink} href="/blogs">
          Blogs
        </Link>
        <Link className={styles.footerLink} href="/videos">
          Videos
        </Link>
        <Link className={styles.footerLink} href="/about">
          About
        </Link>
        <Link className={styles.footerLink} href="/contact">
          Contact
        </Link>
      </div>
      <div className={styles.copyright}>
        &copy; {new Date().getFullYear()} PNW Spirits. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
