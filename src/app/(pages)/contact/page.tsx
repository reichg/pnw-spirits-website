import styles from "./ContactPage.module.css";

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.heading}>Contact</h1>
        <p className={styles.text}>
          Have a question, collaboration idea, or just want to say hello? Reach
          out to us at{" "}
          <a className={styles.email} href="mailto:info@thepnwspirits.com">
            info@thepnwspirits.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
