import type { ReactNode } from "react";

/**
 * Shared contract for the two content surfaces: the landing grids
 * (`/blogs-landing`, `/recipes-landing`, `/videos-landing`) and the archive row
 * lists (`/blogs`, `/recipes`, `/videos`). Types only: this module is imported
 * by server pages, by client-capable components and by the adapters alike, so it
 * must stay free of runtime values. The `ReactNode` import above is type-only
 * and is erased entirely at compile time.
 *
 * Renamed from `ContentLanding.types.ts`: one item shape now feeds two
 * compositions, and a file named for one of them mislabels every archive
 * consumer that imports it.
 */

/** Where an item's image comes from. Discriminated so the view never guesses. */
export type ContentMedia =
  | { kind: "s3"; key: string | null }
  | { kind: "url"; src: string };

/** Where an item navigates. Discriminated so target/rel are never inferred from the href. */
export type ContentLink =
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string };

/**
 * A publication date in both the forms a view needs, so no consumer re-parses
 * or re-formats one.
 *
 * Split rather than pre-formatted into `meta` because the archive row places the
 * date independently of the byline and emits it as
 * `<time dateTime={iso}>{label}</time>`: the attribute is what a machine reads
 * and the text is the human form of that same instant, and a single string
 * cannot serve both. Keeping the date out of `meta` is also what lets one
 * adapter per domain serve both surfaces with no variant flag.
 */
export type ContentTimestamp = {
  /** Machine-readable instant, for a `<time dateTime>` attribute. */
  iso: string;
  /** The same instant in human form, e.g. "January 2, 2026". */
  label: string;
};

/** One content entry, already stripped of all domain knowledge. */
export type ContentItem = {
  /** Stable React key, unique within one page. Adapters stringify numeric ids. */
  id: string;
  /**
   * Short category label, e.g. "Recipe" / "Article" / "Video". Rendered as an
   * outlined badge straddling the lower edge of the card's image. Optional:
   * when absent the card renders with no badge and identical dimensions.
   */
  kicker?: string;
  title: string;
  /**
   * Byline-style secondary text, e.g. "By Jane". Never a date — that is
   * `timestamp`. Optional because a video carries a published date and no
   * author; the card falls back to the timestamp's label for those.
   */
  meta?: string;
  /** Short summary under the title. CSS-clamped by the view; never pre-truncated. */
  excerpt?: string;
  /** When the entry was published, or absent when the source carried no usable date. */
  timestamp?: ContentTimestamp;
  media: ContentMedia;
  link: ContentLink;
  /** Accessible name for the link, e.g. "View recipe: Old Fashioned". */
  ariaLabel: string;
};

export type ContentCardProps = {
  item: ContentItem;
  /** Marks the image as LCP. The layout sets this on the first card only. */
  priority?: boolean;
};

export type ContentLandingLayoutProps = {
  /**
   * Short label set above the heading, e.g. "Pacific Northwest". Optional:
   * when absent the heading is the first thing in the page header.
   */
  eyebrow?: string;
  /** Section title, e.g. "Recipes". */
  heading: string;
  /** Optional short lede under the heading. */
  intro?: string;
  items: ContentItem[];
  /** Shown when `items` is empty. */
  emptyMessage: string;
  viewAllHref: string;
  /** Button text, e.g. "View All Recipes". */
  viewAllLabel: string;
  /** Page-specific root class (background art direction) merged onto <main>. */
  className?: string;
};

export type ContentRowProps = {
  item: ContentItem;
  /** Marks the image as LCP. The layout sets this on the first row only. */
  priority?: boolean;
};

/**
 * The archive header's return path to its landing page.
 *
 * A pair rather than a formatted string because the layout renders the arrow
 * itself, as decoration hidden from assistive technology: a screen reader
 * should hear "Recipes", not "left arrow Recipes".
 */
export type ContentArchiveBackLink = {
  /** Landing page this archive was reached from, e.g. "/recipes-landing". */
  href: string;
  /** Section name alone, with no arrow and no "Back to", e.g. "Recipes". */
  label: string;
};

/**
 * Entries per line in the archive list at >=900px. Below that the list is always
 * a single column, because the row is either the composition `ContentCard`
 * produces for a landing card (600-899) or a full stack (<=599).
 *
 * Two is the ceiling rather than an arbitrary stop: at the 1200px spine a third
 * column would leave ~370px per entry, which is narrower than the 600px viewport
 * case the single-column row already collapses at.
 */
export type ContentArchiveColumns = 1 | 2;

export type ContentArchiveLayoutProps = {
  /**
   * How many entries share a line at >=900px. Defaults to 1.
   *
   * A prop rather than a page-class custom property, and the distinction is not
   * a style preference. The count drives two things that must agree: the grid,
   * which is CSS, and which images are LCP candidates, which is a server-render
   * decision. `--card-media-ratio` can live purely on a page class because
   * exactly one CSS rule reads it and nothing in JS does; this value is read by
   * both, and a value two systems must agree on cannot live in a channel only
   * one of them can see. So the layout takes it here and writes the custom
   * property itself.
   */
  columns?: ContentArchiveColumns;
  /**
   * Occupies the slot the landing header gives its eyebrow, and does a job an
   * eyebrow cannot: a reader arrives here from the landing page's "View All"
   * and needs the way back. Optional, so an archive reachable by other means
   * can omit it.
   */
  backLink?: ContentArchiveBackLink;
  /** Page title, e.g. "All Recipes". */
  heading: string;
  /**
   * Already-formatted inventory line shown where the landing header sets its
   * lede, e.g. "47 recipes" or "12 recipes matching “gin”". A string, not a
   * number: pluralisation, the word for the thing being counted, and whether a
   * search term belongs in the sentence are all domain knowledge, and this
   * layout must not know what a recipe is. Omitted when the count is unknown.
   */
  resultCount?: string;
  items: ContentItem[];
  /** Shown when `items` is empty — including when a search matched nothing. */
  emptyMessage: string;
  /**
   * Optional controls rendered under the header, e.g. a search field. A node
   * rather than a prop set so the layout stays free of search knowledge: the
   * page decides whether its archive has controls at all. Anything stateful
   * passed here must be a leaf client component — the layout and every row above
   * it are server components, which is what keeps cover images server-signed and
   * server-rendered as real `<img>`.
   */
  controls?: ReactNode;
  /** Current 1-based page, already clamped to [1, totalPages] by the page. */
  page: number;
  /** Total number of pages (>= 1). The pager renders nothing when this is 1. */
  totalPages: number;
  /**
   * Href for a target page, passed straight to `Pagination` in link mode. A
   * function rather than a base path so the caller owns the whole URL shape,
   * including the search term that has to survive paging.
   */
  hrefForPage: (page: number) => string;
  /** Page-specific root class (background art direction) merged onto <main>. */
  className?: string;
};

export type ContentArchiveSearchProps = {
  /** Archive path the control navigates within, e.g. "/recipes". */
  basePath: string;
  /** The current search term, read from the URL by the server page. */
  query: string;
  /** Accessible name for the field, e.g. "Search recipes". */
  label: string;
  placeholder?: string;
};
