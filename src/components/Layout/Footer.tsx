import Link from "next/link";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
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
        <Link className={styles.footerLink} href="/classes">
          Classes
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
      </div>
      <div className={styles.socialLinks}>
        <a
          className={styles.socialLink}
          href="https://www.instagram.com/thepnwspirits"
          aria-label="Instagram"
        >
          <FaInstagram />
        </a>
        <a
          className={styles.socialLink}
          href="https://www.facebook.com/profile.php?id=61573458505824"
          aria-label="Facebook"
        >
          <FaFacebook />
        </a>
        <a
          className={styles.socialLink}
          href="https://www.youtube.com/@thepnwspirits"
          aria-label="YouTube"
        >
          <FaYoutube />
        </a>
      </div>
      <div className={styles.copyright}>
        &copy; {new Date().getFullYear()} The PNW Spirits. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
