"use client";

import { useRef, useState } from "react";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import {
  ALBUM_BREAKPOINTS,
  MAX_ALBUM_PHOTOS,
  MAX_ALBUM_SLIDES_PER_VIEW,
} from "@/config/album";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import type { SwiperOptions } from "swiper/types";
import { A11y, Keyboard, Pagination } from "swiper/modules";
import styles from "./PhotoAlbum.module.css";

import "swiper/css";
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
            sizes="(max-width: 600px) 80vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
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

// Decorative-only swipe affordance shown at every breakpoint. The overlay
// blurs/dims the slide row behind it while a sharp, cocktail-themed glass
// animation floats centered on top; pointer-events: none lets pointers pass
// through to Swiper, which performs the drag and fires onTouchStart to dismiss.
// Marked aria-hidden because Swiper A11y + clickable pagination already announce
// navigation to assistive tech; this is a purely visual nudge.
//
// The glass pours full, then slides left (the direction the user swipes to
// advance), then loops — tying the affordance to the site's cocktail theme.
// All motion lives in CSS so the SVG stays static markup; the unique clipPath
// id keeps the liquid clip scoped to this instance.
function SwipeHint() {
  return (
    <div className={styles.swipeHint} aria-hidden="true">
      <span className={styles.swipeHintGlass}>
        <svg
          className={styles.glassSvg}
          viewBox="0 0 40 60"
          width="34"
          height="51"
          role="presentation"
        >
          <defs>
            {/* Interior of the martini bowl: the V cone, inset from the walls so
                the stroke stays visible. The liquid rect is clipped to this so it
                reads as filling the cone from the point up, not a floating block. */}
            <clipPath id="swipeGlassInterior">
              <path d="M9.5 17.2 L30.5 17.2 L20 33 Z" />
            </clipPath>
          </defs>

          {/* Pour stream dropping in from above the rim during the fill phase. */}
          <rect
            className={styles.glassStream}
            x="19.1"
            y="1"
            width="1.8"
            height="15"
            rx="0.9"
          />

          {/* Liquid: a rect bounding the bowl interior, scaled up from the bottom
              (the cone's point) by the fill keyframe and clipped to the V above. */}
          <g clipPath="url(#swipeGlassInterior)">
            <rect
              className={styles.glassLiquid}
              x="9"
              y="17"
              width="22"
              height="16"
            />
          </g>

          {/* Martini glass: V bowl with rim line, thin stem, and a foot ellipse.
              Drawn over the liquid so the rim/walls stay crisp. */}
          <path
            className={styles.glassBody}
            d="M7.5 16 L32.5 16 L20 35 Z M20 35 V49 M13 50.5 H27"
            fill="none"
          />
          <ellipse
            className={styles.glassFoot}
            cx="20"
            cy="50.5"
            rx="7"
            ry="1.6"
          />

          {/* Garnish: an olive resting on a cocktail pick laid across the rim. The
              pick crosses the rim line; the olive sits at its upper end. Static —
              it rides the slide with the rest of the group. */}
          <g className={styles.glassGarnish}>
            <line x1="14" y1="18.5" x2="27" y2="12.5" />
            <circle cx="27.6" cy="12.2" r="2" />
          </g>
        </svg>
        <span className={styles.swipeHintLabel}>Swipe</span>
        {/* Left-pointing chevron arrow reinforcing the swipe-left direction. Its
            own nudge loop (arrowNudge) plays on top of the group's glassSlide; the
            slender double-chevron reads as a refined arrow rather than a triangle. */}
        <svg
          className={styles.swipeHintArrow}
          viewBox="0 0 28 12"
          width="26"
          height="11"
          role="presentation"
        >
          <path
            d="M11.5 1.5 L6 6 L11.5 10.5 M21.5 1.5 L16 6 L21.5 10.5"
            fill="none"
          />
        </svg>
      </span>
    </div>
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

export default function PhotoAlbum({
  photos,
  preview = false,
}: {
  photos: ClassPhotoView[];
  preview?: boolean;
}) {
  // Dismissed the moment the user touches or advances the carousel; gates the
  // decorative swipe hint. Declared before any early return per rules-of-hooks.
  const [interacted, setInteracted] = useState(false);

  // True once Swiper has finished initializing. Loop setup can emit a synthetic
  // slideChange before the user acts; this guard ignores those so the hint is
  // not dismissed before a real navigation.
  const readyRef = useRef(false);

  // Last logical slide index seen. Async image loads (useS3ImageUrl + its 9-min
  // refresh) trigger swiper.update() -> loopFix(), which shifts the raw
  // activeIndex and emits slideChange while realIndex stays put. Dismiss only
  // when realIndex actually changes so those reposition events don't hide the
  // hint before a genuine navigation.
  const lastRealIndexRef = useRef<number | null>(null);

  // Mirrors Swiper's watchOverflow lock: when every photo already fits a
  // breakpoint the carousel can't scroll (and its pagination hides), so the
  // swipe hint should hide too.
  const [locked, setLocked] = useState(false);

  // Fixed, viewport-independent slice: the same set renders on server and
  // client, so Swiper initializes once and never remounts slides on resize.
  const visible = photos.slice(0, MAX_ALBUM_PHOTOS);

  if (visible.length === 0) {
    return (
      <p className={styles.empty}>
        Photos from past classes will appear here after our next session.
      </p>
    );
  }

  // Decided once from the fixed set against the widest possible view, so loop
  // never toggles during resize (Swiper owns the per-breakpoint sizing itself).
  const canLoop = visible.length > MAX_ALBUM_SLIDES_PER_VIEW;

  // Show only when there is more than one slide, the user hasn't acted yet, and
  // the carousel can actually scroll (not locked by watchOverflow at this width).
  const showSwipeHint = visible.length > 1 && !interacted && !locked;

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
        onAfterInit={(s) => {
          readyRef.current = true;
          lastRealIndexRef.current = s.realIndex;
        }}
        onTouchStart={() => setInteracted(true)}
        onSlideChange={(s) => {
          if (!readyRef.current) return;
          if (s.realIndex !== lastRealIndexRef.current) {
            lastRealIndexRef.current = s.realIndex;
            setInteracted(true);
          }
        }}
        onSwiper={(s) => setLocked(s.isLocked)}
        onLock={() => setLocked(true)}
        onUnlock={() => setLocked(false)}
      >
        {visible.map((photo) => (
          <SwiperSlide key={photo.id}>
            {preview ? (
              <PreviewPhoto photo={photo} />
            ) : (
              <AlbumPhoto photo={photo} />
            )}
          </SwiperSlide>
        ))}
      </Swiper>
      {showSwipeHint && <SwipeHint />}
    </div>
  );
}
