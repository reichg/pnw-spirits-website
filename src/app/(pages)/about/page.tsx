import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import styles from "./AboutPage.module.css";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <article className={styles.contentShell}>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>Our Story</p>
            <h1 className={styles.heading}>About PNW Spirits</h1>
          </header>

          <section className={styles.sectionGrid} aria-label="About sections">
            <section className={styles.section}>
              <h2 className={styles.subheading}>Our Purpose</h2>
              <p className={styles.text}>
                PNW Spirits exists for one purpose: to help you make exceptional
                cocktails. We are your go‑to destination for cocktail recipes,
                drink history, and the stories that make the craft worth
                savoring.
              </p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.subheading}>
                Rooted in the Pacific Northwest
              </h2>
              <p className={styles.text}>
                Growing up in the PNW means plenty of time spent indoors, hiding
                from the rain—a perfect excuse to dive deep into cocktail books,
                experiment with flavors, and learn the traditions behind the
                classics.
              </p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.subheading}>Inspired by Exploration</h2>
              <p className={styles.text}>
                My inspiration doesn’t stop at the Northwest. Whenever possible,
                I travel to bars across the country (and beyond), exploring new
                techniques, regional flavors, and the creative minds behind the
                drinks. From tucked‑away speakeasies to award‑winning cocktail
                bars, those experiences shape the recipes and insights I share
                here.
              </p>
            </section>
            <section className={styles.section}>
              <h2 className={styles.subheading}>Bringing the Craft Home</h2>
              <p className={styles.text}>
                PNW Spirits is where all of that curiosity, research, and
                bar‑hopping energy comes together, with one goal: bringing the
                craft cocktail experience into your home. Whether you’re a
                seasoned home bartender or just getting started, I’m here to
                help you shake, stir, and sip like a pro from the comfort of
                your own kitchen.
              </p>
            </section>
          </section>

          <div className={styles.signatureBox}>
            <span className={styles.signature}>
              Welcome to The PNW Spirits!
            </span>
          </div>
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
