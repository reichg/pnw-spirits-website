"use client";
import { useEffect, useState } from "react";

/**
 * Custom hook to fetch and refresh S3 signed URLs for expiring images.
 * Automatically refreshes the URL before expiry to prevent 403 errors.
 *
 * @param key S3 object key or absolute URL
 * @param refreshIntervalSeconds How often to refresh the URL (default: 9 min)
 * @returns { url: string | undefined, loading: boolean, error: string | null }
 */
export function useS3ImageUrl(
  key?: string | null,
  refreshIntervalSeconds: number = 540, // 9 minutes
) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-memory cache for signed URLs
  type CacheEntry = { url: string; expiresAt: number };
  const cache: Record<string, CacheEntry> = {};

  useEffect(() => {
    let isMounted = true;

    async function fetchUrl() {
      setLoading(true);
      setError(null);
      if (!key) {
        setUrl(undefined);
        setLoading(false);
        return;
      }
      // If already absolute URL, use as-is
      if (key.startsWith("http://") || key.startsWith("https://")) {
        setUrl(key);
        setLoading(false);
        return;
      }
      // Check cache
      const now = Date.now();
      const cached = cache[key];
      if (cached && cached.expiresAt > now) {
        setUrl(cached.url);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/s3-signed-url?key=${encodeURIComponent(key)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch signed URL");
        const data = await res.json();
        // Assume expiry is refreshIntervalSeconds from now
        const expiresAt = now + refreshIntervalSeconds * 1000 - 5000; // 5s buffer
        cache[key] = { url: data.url, expiresAt };
        if (isMounted) setUrl(data.url);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message || "Error fetching S3 image URL");
        } else {
          setError("Error fetching S3 image URL");
        }
        if (isMounted) setUrl(undefined);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchUrl();
    // Refresh interval for signed URLs
    const interval = setInterval(fetchUrl, refreshIntervalSeconds * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
    // Only re-run if key changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshIntervalSeconds]);

  return { url, loading, error };
}
