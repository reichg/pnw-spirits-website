import type {
  ContentItem,
  ContentTimestamp,
} from "@/components/ui/content.types";
import { formatDate } from "./contentDetail";

/**
 * Record -> `ContentItem` adapters for the three content domains, shared by both
 * content surfaces: the landing grids (`/blogs-landing`, ...) and the archive
 * row lists (`/blogs`, ...).
 *
 * One adapter per domain, not one per (domain, surface) pair. The surfaces
 * differ in composition, not in content: the card has a single secondary line,
 * the row places the byline and the date in slots of their own, and both read
 * the same item. Keeping the date in `timestamp` rather than pre-formatted into
 * `meta` is what makes that work with no `variant` flag and no surface branch in
 * here. These three were previously one copy per landing route, and the copies
 * had already drifted apart in exactly that way.
 *
 * Pure and synchronous: the pages sign cover photos first and pass the result in
 * as `signedCoverUrl`. Keeping the async work outside keeps these directly
 * unit-testable.
 *
 * Lives in `utils/`, beside `contentDetail.ts` — the other neutral helper the
 * content pages share, and the owner of the date formatter reused below — rather
 * than in `services/`. These are view-model mappings onto a UI contract, not
 * domain rules, and a module under `services/` may not depend on
 * `components/ui/`: `signedImageService` stays generic in its item type for
 * exactly that reason, so the dependency points from a page into `services/` and
 * never back out.
 */

/** The subset of the blogs API response the content surfaces consume. */
export type BlogRecord = {
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
   * accepts one, so entries start carrying summaries the day the column lands.
   */
  excerpt?: string;
  coverPhoto?: string | null;
  /**
   * ISO instant, serialized from `Blog.createdAt`. Optional because the route
   * caches whole payloads as JSON in Redis, so an entry written before a field
   * existed can arrive without it; the adapter degrades to no date rather than
   * inventing one.
   */
  createdAt?: string;
};

/** The subset of the recipes API response the content surfaces consume. */
export type RecipeRecord = {
  id: number;
  title: string;
  author: string;
  /** Non-nullable in the schema (prisma/schema.prisma CocktailRecipe.description). */
  description: string;
  coverPhoto?: string | null;
  /** ISO instant from `CocktailRecipe.createdAt`; optional for the reason `BlogRecord.createdAt` is. */
  createdAt?: string;
};

/** The subset of the videos API response the content surfaces consume. */
export type VideoRecord = {
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
 * Map a blog record onto the shared item contract.
 *
 * @param signedCoverUrl A server-signed URL for `blog.coverPhoto`, or null when
 * signing produced nothing usable. A signed URL yields `url` media, which the
 * view server-renders as a real `<img>`; null falls back to `s3` media, so the
 * key is resolved on the client exactly as it was before. Required rather than
 * optional so no caller can silently drop back to the slow path.
 */
export function toBlogItem(
  blog: BlogRecord,
  signedCoverUrl: string | null,
): ContentItem {
  return {
    id: String(blog.id),
    kicker: "Article",
    title: blog.title,
    meta: `By ${blog.author}`,
    // Never derived from the post body: `content` is full article text of
    // unknown format, so truncating it would invent a summary the author never
    // wrote. Until the API sends a real excerpt this stays undefined, which the
    // view renders as no summary line at all.
    excerpt: blog.excerpt,
    timestamp: toContentTimestamp(blog.createdAt),
    media: signedCoverUrl
      ? { kind: "url", src: signedCoverUrl }
      : { kind: "s3", key: blog.coverPhoto ?? null },
    link: { kind: "internal", href: `/blogs/${blog.id}` },
    ariaLabel: `Read article: ${blog.title}`,
  };
}

/**
 * Map a recipe record onto the shared item contract.
 *
 * @param signedCoverUrl As on {@link toBlogItem}.
 */
export function toRecipeItem(
  recipe: RecipeRecord,
  signedCoverUrl: string | null,
): ContentItem {
  return {
    id: String(recipe.id),
    kicker: "Recipe",
    title: recipe.title,
    meta: `By ${recipe.author}`,
    // Passed through whole: the view clamps it in CSS, so the full text stays in the DOM.
    excerpt: recipe.description,
    timestamp: toContentTimestamp(recipe.createdAt),
    media: signedCoverUrl
      ? { kind: "url", src: signedCoverUrl }
      : { kind: "s3", key: recipe.coverPhoto ?? null },
    link: { kind: "internal", href: `/recipes/${recipe.id}` },
    ariaLabel: `View recipe: ${recipe.title}`,
  };
}

/**
 * Map a video record onto the shared item contract.
 *
 * Takes no signing parameter, unlike its siblings: YouTube thumbnails arrive as
 * absolute URLs, not as S3 keys, so there is nothing for the page to sign
 * beforehand.
 *
 * Emits no `meta`: a video has a published date and no author, and the date is
 * `timestamp`. The card renders that timestamp's label as its single secondary
 * line, which is the same string this adapter used to put in `meta` directly.
 */
export function toVideoItem(video: VideoRecord): ContentItem {
  return {
    id: video.id,
    kicker: "Video",
    title: video.title,
    // No excerpt: the /api/videos payload carries no description field.
    timestamp: toContentTimestamp(video.publishedAt),
    media: video.thumbnail
      ? { kind: "url", src: video.thumbnail }
      : // /api/videos falls back to "" when a snippet has no thumbnail at all.
        // An empty src makes next/image throw "Failed to parse src" and takes
        // the entire server render down with it, so the empty case has to leave
        // the `url` branch. `s3` media with a null key is the one branch that
        // renders nothing rather than throwing.
        { kind: "s3", key: null },
    link: { kind: "external", href: video.url },
    // Names the destination before activation rather than after: the link is
    // external and opens YouTube in a new tab, and a screen-reader user should
    // not have to discover that by following it.
    ariaLabel: `Watch video on YouTube: ${video.title}`,
  };
}

/**
 * Both forms of a stored timestamp, or undefined when it is missing or
 * unparseable — `Intl.DateTimeFormat.format` throws a RangeError on an invalid
 * date, which would fail the render for the same reason an empty image src does.
 *
 * Undefined rather than an empty label: an absent date is absent, so a row omits
 * its `<time>` element entirely instead of emitting one whose `dateTime` says
 * nothing.
 *
 * `iso` is re-serialized rather than echoed, so the `dateTime` attribute is a
 * valid instant even when the wire carried a looser parseable spelling.
 *
 * Formatting is delegated to `contentDetail.formatDate`, which pins the same
 * en-US locale and UTC zone this module used to pin in a second copy of the
 * formatter. A bare `toLocaleDateString()` — what the deleted archive lists
 * called — formats against the host's locale and zone, so one entry renders a
 * different date depending on where the server runs, and the string cannot be
 * asserted in a test at all.
 */
function toContentTimestamp(
  value: string | null | undefined,
): ContentTimestamp | undefined {
  if (!value) return undefined;
  const published = new Date(value);
  if (Number.isNaN(published.getTime())) return undefined;
  return { iso: published.toISOString(), label: formatDate(published) };
}
