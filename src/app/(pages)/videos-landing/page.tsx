// Video Landing Page - displays featured and recent videos
import FeaturedVideo from "@/components/Video/FeaturedVideo";
import VideoGrid from "@/components/Video/VideoGrid";
import Link from "next/link";
import styles from "./VideoLandingPage.module.css";

type Video = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

async function fetchLandingVideos(): Promise<{
  featured: Video | null;
  videos: Video[];
}> {
  // Fetch 4 newest videos (1 featured, 3 for grid)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/videos?page=1&pageSize=4`, {
    cache: "no-store",
  });
  if (!res.ok) return { featured: null, videos: [] };
  const data = await res.json();
  const videos: Video[] = data.videos || [];
  return {
    featured: videos[0] || null,
    videos: videos.slice(1, 4),
  };
}

const VideoLandingPage = async () => {
  const { featured, videos } = await fetchLandingVideos();
  const noVideos = !featured && (!videos || videos.length === 0);
  return (
    <main className={styles.videoLandingRoot}>
      {noVideos ? (
        <div className={styles.noVideosMsg}>
          <span>
            There aren&apos;t any videos yet. Check back soon for new content!
          </span>
        </div>
      ) : (
        <>
          {featured && <FeaturedVideo video={featured} />}
          <VideoGrid videos={videos} />
        </>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2.5rem",
        }}
      >
        <Link href="/videos">
          <button className="articlesBtn">View All Videos</button>
        </Link>
      </div>
    </main>
  );
};

export default VideoLandingPage;
