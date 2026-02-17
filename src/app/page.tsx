import SubscribeForm from "@/components/Subscriber/SubscribeForm";
import Link from "next/link";
import landingStyles from "./LandingPage.module.css";

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className={landingStyles.landingHero}>
        <div className={landingStyles.landingHeroOverlay}>
          <div className={landingStyles.landingHeroBrand}>PNW Spirits</div>
          <h1 className={landingStyles.landingHeroTitle}>
            Welcome to the PNW Spirits
          </h1>
        </div>
      </section>

      {/* Four Column Section */}
      <section className={landingStyles.landingFourColSection}>
        <div className={landingStyles.landingFourColRow}>
          <Link
            href="/blogs"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Martini.jpg')" }}
            aria-label="Blogs"
          >
            <span className={landingStyles.landingFourColCardLabel}>Blogs</span>
          </Link>
          <Link
            href="/videos"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Daq.jpg')" }}
            aria-label="Videos"
          >
            <span className={landingStyles.landingFourColCardLabel}>
              Videos
            </span>
          </Link>
          <Link
            href="/about"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/HighFive.jpg')" }}
            aria-label="About"
          >
            <span className={landingStyles.landingFourColCardLabel}>About</span>
          </Link>
          <Link
            href="/contact"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Vermouth.jpg')" }}
            aria-label="Contact"
          >
            <span className={landingStyles.landingFourColCardLabel}>
              Contact
            </span>
          </Link>
        </div>
      </section>

      {/* Two Column Section: Photo left, Signup right */}
      <section className={landingStyles.landingTwoColSection}>
        <div className={landingStyles.landingTwoColRow}>
          <div className={landingStyles.landingTwoColImg}>
            <img
              src="/images/Improved.jpg"
              alt="Sign up"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 18,
              }}
            />
          </div>
          <div className={landingStyles.landingTwoColForm}>
            <SubscribeForm />
          </div>
        </div>
      </section>
    </div>
  );
}
