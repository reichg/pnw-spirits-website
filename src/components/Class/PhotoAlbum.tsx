"use client";

import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Keyboard, Navigation, Pagination } from "swiper/modules";
import styles from "./PhotoAlbum.module.css";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export type ClassPhotoView = {
  id: number;
  s3Key: string;
  caption: string | null;
};

function AlbumPhoto({ photo }: { photo: ClassPhotoView }) {
  const { url, loading } = useS3ImageUrl(photo.s3Key);
  const alt = photo.caption ?? "Photo from a previous cocktail class";

  return (
    <figure className={styles.item}>
      <div className={styles.thumb}>
        {url ? (
          <Image
            src={url}
            alt={alt}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 900px) 33vw, 25vw"
            className={styles.image}
          />
        ) : (
          <div
            className={styles.placeholder}
            aria-busy={loading}
            aria-label={loading ? "Loading photo" : "Photo unavailable"}
          />
        )}
      </div>
      {photo.caption && (
        <figcaption className={styles.caption}>{photo.caption}</figcaption>
      )}
    </figure>
  );
}

// Static preview tile: no S3 fetch and no loading shimmer, used when the page
// shows sample content before any class is published.
function PreviewPhoto({ photo }: { photo: ClassPhotoView }) {
  return (
    <figure className={styles.item}>
      <div className={styles.thumb}>
        <div className={styles.previewFill} aria-hidden="true" />
      </div>
      {photo.caption && (
        <figcaption className={styles.caption}>{photo.caption}</figcaption>
      )}
    </figure>
  );
}

export default function PhotoAlbum({
  photos,
  preview = false,
}: {
  photos: ClassPhotoView[];
  preview?: boolean;
}) {
  if (photos.length === 0) {
    return (
      <p className={styles.empty}>
        Photos from past classes will appear here after our next session.
      </p>
    );
  }

  return (
    <div className={styles.carousel}>
      <Swiper
        modules={[Navigation, Pagination, A11y, Keyboard]}
        navigation
        pagination={{ clickable: true }}
        keyboard={{ enabled: true }}
        grabCursor
        spaceBetween={16}
        slidesPerView={1.2}
        // Mirror the prior grid's ~220px min tile: more slides as the viewport grows.
        breakpoints={{
          600: { slidesPerView: 2 },
          900: { slidesPerView: 3 },
          1200: { slidesPerView: 4 },
        }}
      >
        {photos.map((photo) => (
          <SwiperSlide key={photo.id}>
            {preview ? (
              <PreviewPhoto photo={photo} />
            ) : (
              <AlbumPhoto photo={photo} />
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
