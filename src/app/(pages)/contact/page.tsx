import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import styles from "./ContactPage.module.css";

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.contactCard}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>Get In Touch</p>
            <h1 className={styles.heading}>Contact</h1>
          </header>
          <p className={styles.text}>
            Have a question, collaboration idea, or just want to say hello?
            Reach out to us:
          </p>
          <p className={styles.emailWrapper}>
            <a className={styles.email} href="mailto:info@thepnwspirits.com">
              info@thepnwspirits.com
            </a>
          </p>
        </article>
        <div className={styles.channelsSection}>
          <h2 className={styles.channelsHeading}>Check out my channels</h2>
          <div className={styles.socialLinks}>
            <a
              className={styles.socialLink}
              href="https://www.instagram.com/thepnwspirits"
              aria-label="Instagram"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaInstagram />
            </a>
            <a
              className={styles.socialLink}
              href="https://www.facebook.com/profile.php?id=61573458505824"
              aria-label="Facebook"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaFacebook />
            </a>
            <a
              className={styles.socialLink}
              href="https://www.youtube.com/@thepnwspirits"
              aria-label="YouTube"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaYoutube />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
