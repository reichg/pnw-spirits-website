// Server component: fetches videos only once on the server
import ContentLandingLayout from "@/components/ui/ContentLandingLayout";
import { SITE_ORIGIN } from "@/utils/contentDetail";
import styles from "./VideoLandingPage.module.css";
import {
  toContentLandingItem,
  type LandingVideo,
} from "./toContentLandingItem";

async function fetchLandingVideos(): Promise<LandingVideo[]> {
  // Fetch exactly the 3 newest videos: one per card in the layout's row.
  // Both failure modes converge on the layout's empty state instead of a 500:
  // `!res.ok` catches a clean error response - this route answers 400 whenever
  // the YouTube key or channel id is absent, which is the common local case -
  // and the catch block catches a network failure or an unparseable body.
  // Collapsing either guard reintroduces a crash.
  try {
    const res = await fetch(`${SITE_ORIGIN}/api/videos?page=1&pageSize=3`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const videos: LandingVideo[] = data.videos || [];
    return videos;
  } catch {
    return [];
  }
}

const VideoLandingPage = async () => {
  const videos = await fetchLandingVideos();
  // Synchronous, unlike the other two landing pages: YouTube hands back
  // absolute thumbnail URLs, so there is no stored S3 key to sign and nothing
  // for mapWithSignedImageUrl to do but add a cache round-trip per card.
  const items = videos.map(toContentLandingItem);
  return (
    <ContentLandingLayout
      className={styles.videoLandingRoot}
      eyebrow="From the Channel"
      heading="Videos"
      intro="Cocktail builds and technique, one pour at a time — short watches made for the home bar."
      items={items}
      emptyMessage="There aren't any videos yet. Check back soon for new content!"
      viewAllHref="/videos"
      viewAllLabel="View All Videos"
    />
  );
};

export default VideoLandingPage;
