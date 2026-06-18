"use client";

// FeaturedVideo.tsx - styled to match FeaturedBlog for a cozy, speakeasy-inspired look
import Image from "next/image";
import React, { useState } from "react";
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
  // YouTube's max-resolution (1280x720) cover, derived from the video id;
  // falls back to the API-provided thumbnail when maxres is unavailable (404).
  const maxResThumbnail = video
    ? `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`
    : "";
  const [coverSrc, setCoverSrc] = useState(maxResThumbnail);

  if (!video) return null;

  return (
    <section className={styles.featuredSection}>
      <h2 className={styles.featuredHeading}>Featured Video</h2>
      <a
        href={video.url}
        className={styles.featuredCard}
        tabIndex={0}
        aria-label={`Watch video: ${video.title}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image
          src={coverSrc}
          alt={`Cover image for ${video.title}`}
          fill
          sizes="(max-width: 900px) 100vw, 1200px"
          className={styles.cardImage}
          onError={() => setCoverSrc(video.thumbnail)}
        />
        <div className={styles.glassOverlay} />
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
    </section>
  );
};

export default FeaturedVideo;
export type { FeaturedVideoProps };
