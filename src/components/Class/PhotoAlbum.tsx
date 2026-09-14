"use client";

import { useState } from "react";
import {
  ALBUM_BREAKPOINTS,
  MAX_ALBUM_PHOTOS,
  MAX_ALBUM_SLIDES_PER_VIEW,
} from "@/config/album";
import type { ClassPhotoView } from "@/services/classes/classView";
import Modal from "@/components/ui/Modal";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import type { SwiperOptions } from "swiper/types";
import { A11y, Keyboard, Pagination } from "swiper/modules";
import styles from "./PhotoAlbum.module.css";

import "swiper/css";
import "swiper/css/pagination";

// Declared once and used by both thumbnail branches, so the two cannot drift.
//
// The breakpoints mirror ALBUM_BREAKPOINTS exactly (1 / 2 / 3 / 4 slides at
// 0 / 600 / 900 / 1200), and the widths are the slide's real share of the
// 1200px spine rather than a round guess: at 375px one slide is ~89vw of the
// viewport, at 768px two are ~44vw each, at 1024px three are ~29vw each, and
// from 1200px up the spine caps so four slides are ~288px each however wide the
// display gets. Each figure is rounded up a little for margin.
//
// Understating a width here costs more than it used to: the plate is now
// object-fit: cover at 1/1, so a portrait source fills the plate's full width,
// where `contain` used to render it at two-thirds of that and hide the
// shortfall.
const PHOTO_SIZES =
  "(max-width: 599px) 92vw, (max-width: 899px) 47vw, (max-width: 1199px) 32vw, 300px";

// Consumes the server-signed `photo.url` directly; no client-side signing.
// next/image lazy-loads off-screen slides by default, so only visible images
// download their bytes. `priority` is set on the first slide only so the
// above-the-fold image isn't lazy.
function AlbumPhoto({
  photo,
  priority,
  onOpen,
}: {
  photo: ClassPhotoView;
  priority: boolean;
  // Called to open the lightbox; only provided when a real image is present.
  onOpen?: () => void;
}) {
  const alt = photo.caption ?? "Photo from a previous cocktail class";

  // The thumb is the click/keyboard target. A real <button> wrapper gives native
  // Enter/Space activation and focus. Swiper suppresses click after a drag by
  // default, so a swipe never opens the lightbox; only a true tap/click does.
  const thumb =
    photo.url && onOpen ? (
      <button
        type="button"
        className={`${styles.thumb} ${styles.thumbButton}`}
        onClick={onOpen}
        aria-label={
          photo.caption
            ? `Enlarge photo: ${photo.caption}`
            : "Enlarge photo from a previous cocktail class"
        }
      >
        <Image
          src={photo.url}
          alt={alt}
          fill
          sizes={PHOTO_SIZES}
          className={styles.image}
          priority={priority}
        />
      </button>
    ) : (
      <div className={styles.thumb}>
        {photo.url ? (
          <Image
            src={photo.url}
            alt={alt}
            fill
            sizes={PHOTO_SIZES}
            className={styles.image}
            priority={priority}
          />
        ) : (
          // role="img" is what makes the label announce. As a bare <div> the
          // aria-label was dropped by assistive tech, so a tile whose signed url
          // failed was silent as well as blank.
          <div
            className={styles.placeholder}
            role="img"
            aria-label="Photo unavailable"
          />
        )}
      </div>
    );

  return (
    <figure className={styles.item}>
      {thumb}
      {photo.caption && (
        <figcaption className={styles.caption}>{photo.caption}</figcaption>
      )}
    </figure>
  );
}

// Base (mobile) tier and the per-breakpoint Swiper config are derived from the
// shared ALBUM_BREAKPOINTS so Swiper owns all responsive sizing from album.ts.
const [BASE_TIER, ...RESPONSIVE_TIERS] = ALBUM_BREAKPOINTS;

const SWIPER_BREAKPOINTS: SwiperOptions["breakpoints"] = Object.fromEntries(
  RESPONSIVE_TIERS.map((tier) => [
    tier.minWidth,
    { slidesPerView: tier.slidesPerView, slidesPerGroup: tier.slidesPerGroup },
  ]),
);

/**
 * Photographs from past classes, as square plates on the page ground.
 *
 * THE ANIMATED SWIPE OVERLAY IS GONE, and it is the reason this component has
 * so little state left. It painted a 0.58 scrim plus a 3px blur over the
 * photographs - the one asset this system says must never be permanently
 * dimmed - and put content on top of that scrim, which the card's own rules
 * forbid; it rendered at every breakpoint including 1440px, where "Swipe" is
 * not the interaction available; and under prefers-reduced-motion it degraded
 * into a static blurred veil, the worst of both outcomes. Swiper's gold
 * dynamicBullets pagination already carries the affordance.
 *
 * Removing it took with it the `interacted` and `locked` state, the `readyRef`
 * and `lastRealIndexRef` guards, and the six Swiper handlers (onAfterInit,
 * onTouchStart, onSlideChange, onSwiper, onLock, onUnlock) that existed only to
 * feed them. The lightbox is untouched.
 */
export default function PhotoAlbum({ photos }: { photos: ClassPhotoView[] }) {
  // Selected photo drives a single lightbox Modal. Only photos with a signed url
  // ever populate this, so the lightbox never opens on a broken/missing tile.
  const [lightbox, setLightbox] = useState<ClassPhotoView | null>(null);

  // Fixed, viewport-independent slice: the same set renders on server and
  // client, so Swiper initializes once and never remounts slides on resize.
  const visible = photos.slice(0, MAX_ALBUM_PHOTOS);

  if (visible.length === 0) {
    return (
      <p className={styles.empty}>
        <span>
          Photos from past classes will appear here after our next session.
        </span>
      </p>
    );
  }

  // Decided once from the fixed set against the widest possible view, so loop
  // never toggles during resize (Swiper owns the per-breakpoint sizing itself).
  const canLoop = visible.length > MAX_ALBUM_SLIDES_PER_VIEW;

  return (
    <div className={styles.carousel}>
      <Swiper
        modules={[Pagination, A11y, Keyboard]}
        pagination={{ clickable: true, dynamicBullets: true }}
        keyboard={{ enabled: true }}
        grabCursor
        loop={canLoop}
        spaceBetween={16}
        slidesPerView={BASE_TIER.slidesPerView}
        slidesPerGroup={BASE_TIER.slidesPerGroup}
        breakpoints={SWIPER_BREAKPOINTS}
      >
        {visible.map((photo, index) => (
          <SwiperSlide key={photo.id}>
            <AlbumPhoto
              photo={photo}
              priority={index === 0}
              onOpen={() => setLightbox(photo)}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <Modal
        isOpen={lightbox !== null}
        onClose={() => setLightbox(null)}
        label={lightbox?.caption ?? "Enlarged class photo"}
        className={styles.lightbox}
      >
        {lightbox?.url && (
          <figure className={styles.lightboxFigure}>
            {/* Dimensions are unknown, so fill within a viewport-capped frame;
                object-fit keeps the whole image visible without cropping. The
                plate crops, the lightbox is where the uncropped photograph
                lives. */}
            <div className={styles.lightboxFrame}>
              <Image
                src={lightbox.url}
                alt={lightbox.caption ?? "Photo from a previous cocktail class"}
                fill
                sizes="90vw"
                className={styles.lightboxImage}
              />
            </div>
            {lightbox.caption && (
              <figcaption className={styles.lightboxCaption}>
                {lightbox.caption}
              </figcaption>
            )}
          </figure>
        )}
      </Modal>
    </div>
  );
}
