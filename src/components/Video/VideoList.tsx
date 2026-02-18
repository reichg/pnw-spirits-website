"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./VideoList.module.css";

type Video = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
};

type PaginatedVideos = {
  videos: Video[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 9;

const VideoList = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/videos?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch videos");
        return res.json();
      })
      .then((data: PaginatedVideos) => {
        setVideos(data.videos || []);
        setTotalPages(data.totalPages || 1);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load videos.");
        setLoading(false);
      });
  }, [page]);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  if (loading) return <div className={styles.videoList}>Loading...</div>;
  if (error) return <div className={styles.videoList}>{error}</div>;

  return (
    <>
      <div className={styles.videoList}>
        {videos.length === 0 && <div>No videos yet.</div>}
        {videos.map((video) => (
          <div className={styles.videoCard} key={video.id}>
            <Image
              className={styles.videoThumb}
              src={video.thumbnail}
              alt={video.title}
              width={320}
              height={180}
              style={{ objectFit: "cover", borderRadius: 12 }}
              loading="lazy"
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
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={handlePrev}
            disabled={page === 1}
            aria-label="Previous page"
          >
            &larr; Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageBtn}
            onClick={handleNext}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            Next &rarr;
          </button>
        </div>
      )}
    </>
  );
};

export default VideoList;
