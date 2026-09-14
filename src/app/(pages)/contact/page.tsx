import ContactForm from "./ContactForm";
import styles from "./ContactPage.module.css";

/** Where the brand publishes. Ranked as a footnote, in the masthead's right
 *  track, rather than as a third panel of equal weight. */
const CHANNELS = [
  { label: "Instagram", href: "https://www.instagram.com/thepnwspirits" },
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61573458505824",
  },
  { label: "YouTube", href: "https://www.youtube.com/@thepnwspirits" },
] as const;

export default function ContactPage() {
  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.mastheadLead}>
          <p className={styles.eyebrow}>Get in touch</p>
          <h1 className={styles.heading}>Contact</h1>
          <p className={styles.lede}>
            Have a question, a collaboration in mind, or a date to hold? Write
            to{" "}
            <a className={styles.email} href="mailto:info@thepnwspirits.com">
              info@thepnwspirits.com
            </a>
            , or send the note below.
          </p>
        </div>

        <section
          className={styles.channels}
          aria-labelledby="contact-channels-heading"
        >
          <h2 id="contact-channels-heading" className={styles.channelsHeading}>
            Follow along
          </h2>
          <ul className={styles.channelList}>
            {CHANNELS.map(({ label, href }) => (
              <li key={label}>
                <a
                  className={styles.channelLink}
                  href={href}
                  aria-label={`${label} (opens in a new tab)`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </header>

      <section
        className={styles.formSection}
        aria-labelledby="contact-form-heading"
      >
        <h2 id="contact-form-heading" className={styles.formHeading}>
          Send a message
        </h2>
        <ContactForm />
      </section>
    </main>
  );
}
