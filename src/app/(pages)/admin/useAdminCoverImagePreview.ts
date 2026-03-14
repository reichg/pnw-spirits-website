"use client";

import { logger } from "@/utils/logger";
import { useEffect, useState } from "react";

export function useAdminCoverImagePreview(
  coverImageKey: string,
  coverMarkedForRemoval: boolean,
) {
  const [coverImagePreviewUrl, setCoverImagePreviewUrl] = useState("");

  useEffect(() => {
    let isActive = true;

    async function fetchSignedUrl(key: string) {
      try {
        const res = await fetch(
          `/api/s3-signed-url?key=${encodeURIComponent(key)}`,
        );
        const data = await res.json();

        if (!isActive) return;

        if (res.ok && data.url) {
          logger.info("Cover image signed URL:", data.url);
          setCoverImagePreviewUrl(data.url);
          return;
        }

        setCoverImagePreviewUrl("");
      } catch {
        if (isActive) {
          setCoverImagePreviewUrl("");
        }
      }
    }

    if (!coverImageKey || coverMarkedForRemoval) {
      setCoverImagePreviewUrl("");

      return () => {
        isActive = false;
      };
    }

    setCoverImagePreviewUrl("");
    void fetchSignedUrl(coverImageKey);

    return () => {
      isActive = false;
    };
  }, [coverImageKey, coverMarkedForRemoval]);

  return { coverImagePreviewUrl, setCoverImagePreviewUrl };
}
