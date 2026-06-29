/**
 * Single source of truth for the /classes photo album sizing rules.
 *
 * This module is layer-neutral: it imports nothing from React, Swiper, Prisma,
 * or any runtime-specific package so both the server (query cap) and the client
 * (Swiper config) can import it safely.
 *
 * The album renders a single fixed, capped photo set. Swiper owns all responsive
 * sizing via its own `breakpoints` map, so there is no per-breakpoint photo
 * re-slicing: the slide count is stable across resize and Swiper never has to
 * re-initialize. The breakpoints, photo cap, and widest-view threshold live here
 * so the server and client layers stay in agreement without duplicated literals.
 */

/**
 * A single responsive tier. `minWidth` is the lower viewport-width bound (px);
 * a tier is active when the viewport width is >= its minWidth and < the next
 * tier's minWidth. These drive Swiper's own `breakpoints` map only.
 */
export type AlbumBreakpoint = {
  minWidth: number;
  slidesPerView: number;
  slidesPerGroup: number;
};

/**
 * Responsive tiers, ordered ascending by minWidth. Mirrors the prior grid's
 * ~220px min tile: more slides as the viewport grows. The base tier (minWidth 0)
 * is always present so Swiper has a default below the first breakpoint; on phones
 * it shows one full slide with no peek for a clean, touch-first view.
 */
export const ALBUM_BREAKPOINTS: readonly AlbumBreakpoint[] = [
  { minWidth: 0, slidesPerView: 1, slidesPerGroup: 1 },
  { minWidth: 600, slidesPerView: 2, slidesPerGroup: 2 },
  { minWidth: 900, slidesPerView: 3, slidesPerGroup: 3 },
  { minWidth: 1200, slidesPerView: 4, slidesPerGroup: 4 },
];

/**
 * Fixed upper bound on photos rendered/fetched for the album; Swiper paginates
 * them responsively. The backend caps its query to this and the client renders
 * at most this many slides.
 */
export const MAX_ALBUM_PHOTOS: number = 16;

/**
 * The widest `slidesPerView` across all tiers (evaluates to 4). Used as the
 * loop-enable threshold: loop only when there are more photos than the widest
 * view shows, so the component holds no breakpoint math of its own.
 */
export const MAX_ALBUM_SLIDES_PER_VIEW: number = Math.max(
  ...ALBUM_BREAKPOINTS.map((breakpoint) => breakpoint.slidesPerView),
);
