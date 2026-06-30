import Image from "next/image";
import { FaFacebook, FaInstagram, FaYoutube } from "react-icons/fa";
import styles from "./AboutPage.module.css";

/* Story rows are data-driven so the alternating zig-zag layout stays declarative;
   `image` side flips automatically based on row index in the render below. */
const storyRows = [
  {
    subheading: "Our Purpose",
    text: "The PNW Spirits exists for one purpose: to help you make exceptional cocktails. We are your go‑to destination for cocktail recipes, drink history, and the stories that make the craft worth savoring.",
    src: "/images/Martini.jpg",
    alt: "A martini glass with a citrus garnish on a dark bar surface",
  },
  {
    subheading: "Rooted in the Pacific Northwest",
    text: "Growing up in the PNW means plenty of time spent indoors, hiding from the rain—a perfect excuse to dive deep into cocktail books, experiment with flavors, and learn the traditions behind the classics.",
    src: "/images/DaqVert.jpg",
    alt: "A freshly poured daiquiri-style cocktail in a coupe glass",
  },
  {
    subheading: "Inspired by Exploration",
    text: "My inspiration doesn’t stop at the Northwest. Whenever possible, I travel to bars across the country (and beyond), exploring new techniques, regional flavors, and the creative minds behind the drinks. From tucked‑away speakeasies to award‑winning cocktail bars, those experiences shape the recipes and insights I share here.",
    src: "/images/AmaronFloat.jpg",
    alt: "A layered cocktail with a delicate float, lit warmly",
  },
  {
    subheading: "Bringing the Craft Home",
    text: "PNW Spirits is where all of that curiosity, research, and bar‑hopping energy comes together, with one goal: bringing the craft cocktail experience into your home. Whether you’re a seasoned home bartender or just getting started, I’m here to help you shake, stir, and sip like a pro from the comfort of your own kitchen.",
    src: "/images/Improvedverticalrecp.jpg",
    alt: "An improved-classic cocktail served in a rocks glass",
  },
] as const;

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.hero}>
          <Image
            className={styles.heroImage}
            src="/images/HighFive.jpg"
            alt="Two cocktails raised in a celebratory toast"
            fill
            priority
            // style={{ objectFit: "contain" }}
          />
          <div className={styles.heroScrim} />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>Our Story</p>
            <h1 className={styles.heading}>About The PNW Spirits</h1>
            <p className={styles.lead}>
              Craft cocktails, drink history, and the stories worth savoring —
              from the rainy Pacific Northwest to your home bar.
            </p>
          </div>
        </header>

        <section className={styles.stories} aria-label="About sections">
          {storyRows.map((row, index) => (
            <article
              key={row.subheading}
              className={`${styles.storyRow} ${
                index % 2 === 1 ? styles.storyRowReversed : ""
              }`}
            >
              <div className={styles.storyMedia}>
                <Image
                  className={styles.storyImage}
                  src={row.src}
                  alt={row.alt}
                  fill
                  loading="lazy"
                  sizes="(max-width: 900px) 100vw, 45vw"
                />
              </div>
              <div className={styles.storyBody}>
                <h2 className={styles.subheading}>{row.subheading}</h2>
                <p className={styles.text}>{row.text}</p>
              </div>
            </article>
          ))}
        </section>

        <div className={styles.signatureBox}>
          <span className={styles.signature}>Welcome to The PNW Spirits!</span>
        </div>

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
