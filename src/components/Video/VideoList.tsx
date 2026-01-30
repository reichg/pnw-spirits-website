"use client";
import { useEffect, useState } from "react";
import styles from "./VideoList.module.css";

type Video = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

const VideoList = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/videos")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch videos");
        return res.json();
      })
      .then((data) => {
        setVideos(data.videos || data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Could not load videos.");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className={styles.videoList}>Loading...</div>;
  if (error) return <div className={styles.videoList}>{error}</div>;

  return (
    <div className={styles.videoList}>
      {videos.length === 0 && <div>No videos yet.</div>}
      {videos.map((video) => (
        <div className={styles.videoCard} key={video.id}>
          <img
            className={styles.videoThumb}
            src={video.thumbnail}
            alt={video.title}
          />
          <div className={styles.videoTitle}>{video.title}</div>
          <div className={styles.videoMeta}>
            {new Date(video.publishedAt).toLocaleDateString()}
          </div>
          <a
            className={styles.watchBtn}
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch Video
          </a>
        </div>
      ))}
    </div>
  );
};

export default VideoList;
