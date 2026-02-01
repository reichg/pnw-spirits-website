import MiniBlogList from "@/components/Blog/MiniBlogList";
import SubscribeForm from "@/components/Subscriber/SubscribeForm";
import VideoList from "@/components/Video/VideoList";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.landing} style={{ flex: 1 }}>
        <div className={styles.hero}>
          <h1>Welcome to PNW Spirits</h1>
          <p>
            Discover the best cocktails, stories, and videos from the Pacific
            Northwest.
          </p>
          <div className={styles.cta}>
            <a className="button" href="#subscribe">
              Subscribe
            </a>
            <a className="button" href="#blogs">
              Read Blogs
            </a>
          </div>
        </div>
        <div className={styles.section} id="blogs">
          <div className={styles.sectionHeader}>
            <h2>Latest Blogs</h2>
          </div>
          <Link
            href="/blogs"
            className={styles.blogsPageLink}
            aria-label="Go to all blogs"
            style={{
              display: "block",
              margin: "0.5em auto 1.2em auto",
              textAlign: "center",
              maxWidth: "220px",
            }}
          >
            View All Blogs
          </Link>
          <div className={styles.miniBlogListWrapper}>
            <MiniBlogList />
          </div>
        </div>
        <div className={styles.section} id="videos">
          <h2>Latest Videos</h2>
          <Link
            href="/videos"
            className={styles.blogsPageLink}
            aria-label="Go to all videos"
            style={{
              display: "block",
              margin: "0.5em auto 1.2em auto",
              textAlign: "center",
              maxWidth: "220px",
            }}
          >
            View All Videos
          </Link>
          <VideoList />
        </div>
        <div className={styles.section} id="subscribe">
          <h2>Subscribe for Updates</h2>
          <SubscribeForm />
        </div>
      </div>
    </div>
  );
}
