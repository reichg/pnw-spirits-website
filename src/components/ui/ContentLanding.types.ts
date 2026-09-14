/**
 * Shared contract for the content-landing layout. Types only: this module is
 * imported by both server pages and client-capable components, and by the
 * per-route adapters, so it must stay free of runtime values.
 */

/** Where a card's image comes from. Discriminated so the card never guesses. */
export type ContentMedia =
  | { kind: "s3"; key: string | null }
  | { kind: "url"; src: string };

/** Where a card navigates. Discriminated so target/rel are never inferred from the href. */
export type ContentLink =
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string };

/** One landing-page entry, already stripped of all domain knowledge. */
export type ContentLandingItem = {
  /** Stable React key, unique within one landing page. Adapters stringify numeric ids. */
  id: string;
  /**
   * Short category label, e.g. "Recipe" / "Article" / "Video". Rendered as an
   * outlined badge straddling the lower edge of the card's image. Optional:
   * when absent the card renders with no badge and identical dimensions.
   */
  kicker?: string;
  title: string;
  /** Pre-formatted secondary line, e.g. "By Jane" or "by Jane | 3/14/2026". */
  meta: string;
  /** Short summary under the title. CSS-clamped by the card; never pre-truncated. */
  excerpt?: string;
  media: ContentMedia;
  link: ContentLink;
  /** Accessible name for the card link, e.g. "View recipe: Old Fashioned". */
  ariaLabel: string;
};

export type ContentCardProps = {
  item: ContentLandingItem;
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
  items: ContentLandingItem[];
  /** Shown when `items` is empty. */
  emptyMessage: string;
  viewAllHref: string;
  /** Button text, e.g. "View All Recipes". */
  viewAllLabel: string;
  /** Page-specific root class (background art direction) merged onto <main>. */
  className?: string;
};
