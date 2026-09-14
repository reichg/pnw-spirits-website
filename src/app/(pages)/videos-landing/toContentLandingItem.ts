import type { ContentLandingItem } from "@/components/ui/ContentLanding.types";

/** The subset of the videos API response this landing page consumes. */
export type LandingVideo = {
  /** YouTube video (or playlist) id; already a string on the wire. */
  id: string;
  /** Absolute YouTube watch URL, assembled by /api/videos from the id. */
  url: string;
  title: string;
  /** Snippet thumbnail URL, or "" when the snippet carried no usable image. */
  thumbnail: string;
  /** ISO 8601 UTC timestamp from the YouTube snippet. */
  publishedAt: string;
};

/**
 * Fixed locale and time zone on purpose. A bare `toLocaleDateString()` — still
 * what VideoGrid calls — formats against the host's locale and
 * zone, so one video renders a different date depending on where the server
 * runs, and the string cannot be asserted in a test at all. UTC matches the
 * wire format, which is already UTC, so no date is shifted in the process.
 */
const publishedAtFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Landing-page-specific mapping.
 *
 * Pure and synchronous, like the sibling adapters — but with no signing
 * parameter: YouTube thumbnails arrive as absolute URLs, not as S3 keys, so
 * there is nothing for the page to sign beforehand.
 */
export function toContentLandingItem(video: LandingVideo): ContentLandingItem {
  return {
    id: video.id,
    title: video.title,
    kicker: "Video",
    meta: formatPublishedAt(video.publishedAt),
    // No excerpt: the /api/videos payload carries no description field.
    media: video.thumbnail
      ? { kind: "url", src: video.thumbnail }
      : // /api/videos falls back to "" when a snippet has no thumbnail at all.
        // An empty src makes next/image throw "Failed to parse src" and takes
        // the entire server render down with it, so the empty case has to leave
        // the `url` branch. `s3` media with a null key is the one branch that
        // renders nothing rather than throwing.
        { kind: "s3", key: null },
    link: { kind: "external", href: video.url },
    // Names the destination before activation rather than after: the card is an
    // external link that opens YouTube in a new tab, and a screen-reader user
    // should not have to discover that by following it.
    ariaLabel: `Watch video on YouTube: ${video.title}`,
  };
}

/**
 * Format a snippet timestamp, or "" when it is missing or unparseable —
 * `Intl.DateTimeFormat.format` throws a RangeError on an invalid date, which
 * would fail the render for the same reason an empty image src does. An empty
 * meta line is the graceful degradation.
 */
function formatPublishedAt(publishedAt: string): string {
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return "";
  return publishedAtFormatter.format(published);
}
