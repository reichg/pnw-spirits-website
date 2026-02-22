import SubscribeForm from "@/components/Subscriber/SubscribeForm";
import Image from "next/image";
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
            href="/blogs-landing"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Martini.jpg')" }}
            aria-label="Blogs"
          >
            {/* Glassy overlay for cozy speakeasy effect, matches FeaturedBlog */}
            <div className={landingStyles.landingFourColGlassOverlay} />
            <span className={landingStyles.landingFourColCardLabel}>Blogs</span>
          </Link>
          <Link
            href="/videos-landing"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Daq.jpg')" }}
            aria-label="Videos"
          >
            <div className={landingStyles.landingFourColGlassOverlay} />
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
            <div className={landingStyles.landingFourColGlassOverlay} />
            <span className={landingStyles.landingFourColCardLabel}>About</span>
          </Link>
          <Link
            href="/contact"
            className={landingStyles.landingFourColCard}
            style={{ backgroundImage: "url('/images/Vermouth.jpg')" }}
            aria-label="Contact"
          >
            <div className={landingStyles.landingFourColGlassOverlay} />
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
            {/* Preload background images for four-column section */}
            <Image
              src="/images/Improved.jpg"
              alt="Sign up"
              width={600}
              height={400}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 18,
              }}
              priority
            />
            {/* Hidden preloads for background images */}
            <div style={{ display: "none" }}>
              <Image
                src="/images/Martini.jpg"
                alt="Preload Martini"
                width={10}
                height={10}
                priority
              />
              <Image
                src="/images/Daq.jpg"
                alt="Preload Daq"
                width={10}
                height={10}
                priority
              />
              <Image
                src="/images/HighFive.jpg"
                alt="Preload HighFive"
                width={10}
                height={10}
                priority
              />
              <Image
                src="/images/Vermouth.jpg"
                alt="Preload Vermouth"
                width={10}
                height={10}
                priority
              />
            </div>
          </div>
          <div className={landingStyles.landingTwoColForm}>
            <SubscribeForm />
          </div>
        </div>
      </section>
    </div>
  );
}
