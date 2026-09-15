import ContactForm from "./ContactForm";
import styles from "./ContactPage.module.css";

/** Where the brand publishes. Ranked as a footnote, on the page's closing
 *  hairline row, rather than as a third panel of equal weight - and BELOW the
 *  form in the DOM, which is the half of that decision the tab order depends
 *  on: these three off-site links used to be reached before any field of the
 *  page's only conversion path, at every viewport. */
const CHANNELS = [
  { label: "Instagram", href: "https://www.instagram.com/thepnwspirits" },
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61573458505824",
  },
  { label: "YouTube", href: "https://www.youtube.com/@thepnwspirits" },
] as const;

export default function ContactPage() {
  // <main> IS the editorial shell, so every block below is a direct child of it
  // and lands on the shared 1200px spine. An element between <main> and these
  // blocks would cancel that spine for everything under it.
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Get in touch</p>
        <h1 className={styles.heading}>Contact</h1>
        <p className={styles.lede}>
          Have a question, a collaboration in mind, or a date to hold? Write to{" "}
          <a className={styles.email} href="mailto:info@thepnwspirits.com">
            info@thepnwspirits.com
          </a>
          , or send the note below.
        </p>
      </header>

      {/* Unclassed on purpose, and the reasoning is recorded in
          ContactPage.module.css where the rule for it would otherwise be. Its
          only job is to be the spine child, so that the form's own
          --measure-prose cap is not declared on a direct child of <main>. The
          form carries the accessible name; there is no section head, because
          the only one this page could honestly write is the sentence already
          printed on the button that closes it. */}
      <div>
        <ContactForm />
      </div>

      <div className={styles.channelsRow}>
        <section
          className={styles.channels}
          aria-labelledby="contact-channels-label"
        >
          <p id="contact-channels-label" className={styles.channelsLabel}>
            Follow along
          </p>
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
      </div>
    </main>
  );
}
