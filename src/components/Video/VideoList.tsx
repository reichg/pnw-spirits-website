"use client";
import { useEffect, useState } from "react";
import VideoGrid from "./VideoGrid";
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
    // Use an async function to avoid calling setState synchronously in the effect body
    const fetchVideos = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/videos?page=${page}&pageSize=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error("Failed to fetch videos");
        const data: PaginatedVideos = await res.json();
        setVideos(data.videos || []);
        setTotalPages(data.totalPages || 1);
      } catch {
        setError("Could not load videos.");
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [page]);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  if (loading) return <div className={styles.videoList}>Loading...</div>;
  if (error) return <div className={styles.videoList}>{error}</div>;

  return (
    <>
      <VideoGrid videos={videos} />
      {videos.length === 0 && (
        <div className={styles.videoList}>No videos yet.</div>
      )}
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
