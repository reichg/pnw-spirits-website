// VideoGrid.tsx - styled to match BlogGrid for a cozy, speakeasy-inspired look
"use client";
import Image from "next/image";
import React from "react";
import styles from "./VideoGrid.module.css";

type Video = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

const VideoCard: React.FC<{ video: Video }> = ({ video }) => {
  return (
    <a
      href={video.url}
      className={styles.videoCard}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={0}
      aria-label={`Watch video: ${video.title}`}
    >
      {/* Glassy overlay for text readability and cozy effect */}
      <div className={styles.glassOverlay} />
      <Image
        className={styles.videoThumb}
        src={video.thumbnail}
        alt={video.title}
        width={320}
        height={180}
        style={{ objectFit: "cover", borderRadius: 12 }}
        loading="lazy"
      />
      <div className={styles.videoContent}>
        <div className={styles.videoTitle}>{video.title}</div>
        <div className={styles.videoMeta}>
          {new Date(video.publishedAt).toLocaleDateString()}
        </div>
      </div>
    </a>
  );
};

const VideoGrid: React.FC<{ videos: Video[] }> = ({ videos }) => {
  if (!videos?.length) return null;
  return (
    <section className={styles.videosSection}>
      <div className={styles.videosTitle}>VIDEOS</div>
      <div className={styles.videosGrid}>
        {videos.map((video) => (
          <VideoCard video={video} key={video.id} />
        ))}
      </div>
    </section>
  );
};

export default VideoGrid;
