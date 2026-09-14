import type { ContentLandingItem } from "@/components/ui/ContentLanding.types";

/** The subset of the blogs API response this landing page consumes. */
export type LandingBlog = {
  /**
   * Numeric on the wire: /api/blogs returns raw rows and prisma/schema.prisma
   * Blog.id is an autoincrementing Int. `BlogGridBlog` declares this a string;
   * that declaration is the inaccurate one.
   */
  id: number;
  title: string;
  author: string;
  /**
   * Optional on the wire, and absent from every row today: Blog has no
   * `excerpt` column. Declared anyway because every other blog view already
   * accepts one, so cards start carrying summaries the day the column lands.
   */
  excerpt?: string;
  coverPhoto?: string | null;
};

/**
 * Landing-page-specific mapping. The `meta` wording is deliberately not shared
 * with /blogs, which renders a different line (`by {author} | {date}`); the
 * landing composition drops the date, matching the recipes adapter rather than
 * the detail views.
 *
 * Pure and synchronous: the page signs cover photos before calling this and
 * passes the result in as `signedCoverUrl`. Keeping the async work outside
 * keeps this adapter directly unit-testable.
 *
 * @param signedCoverUrl A server-signed URL for `blog.coverPhoto`, or null
 * when signing produced nothing usable. A signed URL yields `url` media, which
 * the card server-renders as a real `<img>`; null falls back to `s3` media, so
 * the card resolves the key on the client exactly as it did before. Required
 * rather than optional so no caller can silently drop back to the slow path.
 */
export function toContentLandingItem(
  blog: LandingBlog,
  signedCoverUrl: string | null,
): ContentLandingItem {
  return {
    id: String(blog.id),
    title: blog.title,
    kicker: "Article",
    meta: `By ${blog.author}`,
    // Never derived from the post body: `content` is full article text of
    // unknown format, so truncating it would invent a summary the author never
    // wrote. Until the API sends a real excerpt this stays undefined, which the
    // card renders as no summary line at all.
    excerpt: blog.excerpt,
    media: signedCoverUrl
      ? { kind: "url", src: signedCoverUrl }
      : { kind: "s3", key: blog.coverPhoto ?? null },
    link: { kind: "internal", href: `/blogs/${blog.id}` },
    ariaLabel: `Read article: ${blog.title}`,
  };
}
