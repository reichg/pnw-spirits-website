// FeaturedVideo.tsx - styled to match FeaturedBlog for a cozy, speakeasy-inspired look
import Image from "next/image";
import React from "react";
import styles from "./FeaturedVideo.module.css";

type FeaturedVideoProps = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  description?: string;
};

const FeaturedVideo: React.FC<{ video: FeaturedVideoProps }> = ({ video }) => {
  if (!video) return null;
  return (
    <a
      href={video.url}
      className={styles.featuredCard}
      tabIndex={0}
      aria-label={`Watch video: ${video.title}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className={styles.glassOverlay} />
      <Image
        className={styles.featuredThumb}
        src={video.thumbnail}
        alt={video.title}
        width={340}
        height={220}
        style={{ objectFit: "cover" }}
        loading="lazy"
      />
      <div className={styles.featuredContent}>
        <div className={styles.featuredTitle}>{video.title}</div>
        <div className={styles.featuredMeta}>
          {new Date(video.publishedAt).toLocaleDateString()}
        </div>
        {video.description && (
          <div className={styles.featuredExcerpt}>{video.description}</div>
        )}
      </div>
    </a>
  );
};

export default FeaturedVideo;
export type { FeaturedVideoProps };
