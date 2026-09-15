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
 * How much of the next plate every tier leaves showing at the clip edge, as a
 * fraction of one slide. It is the album's only "there is more" affordance, so
 * it is declared once and added to every tier rather than written four times.
 *
 * THIS SUPERSEDES THE DECISION THIS COMMENT USED TO RECORD - "on phones it shows
 * one full slide with no peek for a clean, touch-first view". That decision was
 * correct while it was true, and it is no longer true, because the thing it
 * leaned on has been deleted. A full-bleed phone plate was clean rather than
 * mute only because an animated swipe overlay was painted across it announcing
 * the gesture; that overlay is gone (PhotoAlbum.tsx records why), and with it
 * gone a single flush plate says nothing about the four photographs behind it.
 * The peek is now carrying work that used to be carried by something else.
 *
 * The phone tier is the one that needs it MOST, not least, which is the reverse
 * of the old reading. At 1440 a reader already sees four of five photographs and
 * the peek only corrects a misreading - four equal plates flush to the spine
 * assert "a complete row of four". At 390 a reader sees ONE of five, and the
 * whole remaining signal is a 7px dot and four dots of 3-5px. The cost is real
 * and is paid where it is highest: the phone plate goes 342 -> 293px. That buys
 * the other 80% of the album a way of being found.
 *
 * WHY 0.16. A peek has to be decisively wider than the 16px gutter that precedes
 * it, or the eye reads one oversized gap instead of a strip that continues.
 * Twice the gutter, ~32px, is the narrowest width that cannot be misread; much
 * past that it stops being a sliver and starts being a cropped photograph.
 * Swiper sizes a slide as `(track - (slidesPerView - 1) * gutter) / slidesPerView`,
 * which leaves a rendered peek of `f * slide - (1 - f) * gutter` - so the px a
 * given fraction buys depends on the slide width, not on the tier count. Every
 * tier here lands a slide between 274 and 311px, so one fraction holds across
 * all four: measured 30.5 / 31.1 / 33.4px at 1440 / 1024 / 390.
 */
const ALBUM_PEEK = 0.16;

/**
 * Responsive tiers, ordered ascending by minWidth. Mirrors the prior grid's
 * ~220px min tile: more slides as the viewport grows. The base tier (minWidth 0)
 * is always present so Swiper has a default below the first breakpoint.
 *
 * `slidesPerView` carries the peek and `slidesPerGroup` deliberately does not:
 * a swipe advances by whole plates, so the sliver is a signal at the edge rather
 * than a partial page the reader has to chase.
 */
export const ALBUM_BREAKPOINTS: readonly AlbumBreakpoint[] = [
  { minWidth: 0, slidesPerView: 1 + ALBUM_PEEK, slidesPerGroup: 1 },
  { minWidth: 600, slidesPerView: 2 + ALBUM_PEEK, slidesPerGroup: 2 },
  { minWidth: 900, slidesPerView: 3 + ALBUM_PEEK, slidesPerGroup: 3 },
  { minWidth: 1200, slidesPerView: 4 + ALBUM_PEEK, slidesPerGroup: 4 },
];

/**
 * Fixed upper bound on photos rendered/fetched for the album; Swiper paginates
 * them responsively. The backend caps its query to this and the client renders
 * at most this many slides.
 */
export const MAX_ALBUM_PHOTOS: number = 16;

/**
 * The widest `slidesPerView` across all tiers (evaluates to 4 + ALBUM_PEEK).
 * Used as the loop-enable threshold: loop only when there are more photos than
 * the widest view shows, so the component holds no breakpoint math of its own.
 *
 * The peek rides along on purpose and changes no outcome. Photo counts are
 * integers, and the threshold is a strict `>`, so `n > 4.16` and `n > 4` answer
 * identically for every n - four photos still lock the strip (Swiper's
 * watchOverflow hides the bullets, and PhotoAlbum.module.css withdraws their
 * reserve), five still loop. Flooring it back to a whole number would only
 * describe the widest view less accurately.
 */
export const MAX_ALBUM_SLIDES_PER_VIEW: number = Math.max(
  ...ALBUM_BREAKPOINTS.map((breakpoint) => breakpoint.slidesPerView),
);

/**
 * The tiers to hand Swiper for an album of `photoCount` photos: ALBUM_BREAKPOINTS
 * with the peek withdrawn from every tier the album cannot overflow.
 *
 * A PEEK WITH NOTHING BEHIND IT IS A HOLE, which is why this exists rather than
 * the tier table being used directly. Swiper sizes slides from `slidesPerView`
 * whether or not the strip can scroll, so a tier the album exactly fills renders
 * plates shrunk to make room for a sliver that is never occupied, and the room
 * stays empty: measured 50.5px of dead spine at 1440 with four photos, 50.7px at
 * 1024 with three, 53.4px at 390 with one. Those are the three most ordinary
 * small-album cases, and before the peek every one of them landed flush.
 *
 * Withdrawing per tier rather than per album is the whole point: three photos
 * overflow the phone's one-up and need the peek badly, while the same three
 * underfill the desktop's four-up and must not pay for it. `photoCount >
 * wholePlates` is the same question Swiper's own overflow lock asks, so the two
 * cannot disagree - a tier that keeps the peek is exactly a tier that scrolls.
 *
 * Below that threshold this returns the integer tier, so an underfilled album
 * renders precisely the geometry it had before the peek existed.
 */
export function albumBreakpointsFor(
  photoCount: number,
): readonly AlbumBreakpoint[] {
  return ALBUM_BREAKPOINTS.map((tier) => {
    const wholePlates = Math.floor(tier.slidesPerView);
    return photoCount > wholePlates
      ? tier
      : { ...tier, slidesPerView: wholePlates };
  });
}
