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

    async function clearPreview() {
      if (isActive) {
        setCoverImagePreviewUrl("");
      }
    }

    async function fetchSignedUrl(key: string) {
      setCoverImagePreviewUrl("");

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
      void clearPreview();

      return () => {
        isActive = false;
      };
    }

    void fetchSignedUrl(coverImageKey);

    return () => {
      isActive = false;
    };
  }, [coverImageKey, coverMarkedForRemoval]);

  return { coverImagePreviewUrl, setCoverImagePreviewUrl };
}
