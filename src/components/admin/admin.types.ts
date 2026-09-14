import type { ReactNode } from "react";
import type { AdminNavItem } from "@/components/Layout/adminNavItems";

/**
 * Shared contract for the admin design layer: the page shell, the card, the
 * grid, the panel and the status primitives that every "Manage <content>"
 * screen is built from. Types only - this module is imported by the admin
 * client components ("use client") and by their tests alike, so it must stay
 * free of runtime values. Both imports above are type-only and are erased at
 * compile time, so neither draws a runtime edge.
 *
 * The directory holds the admin module, not only this design layer: the session
 * context (`AdminTokenContext.tsx`) sits beside these files for the same reason
 * they do, which is the dependency direction argued below. Read that file's own
 * header for why it is no longer in the route segment.
 *
 * WHY `src/components/admin/` AND NOT `src/components/ui/`. `ui/` is the
 * domain-agnostic public surface set: `ContentCard` knows nothing of recipes,
 * blogs or videos and is reachable from any page. Everything described here is
 * admin-only - it assumes an authenticated operator, destructive actions and an
 * editing posture - and must never be imported by a public page. A sibling
 * directory states that boundary in the import path, where a reviewer sees it,
 * rather than leaving it to a filename prefix inside a shared folder.
 *
 * WHY NOT `src/app/(pages)/admin/_components/`. Three reasons, the last
 * decisive. (1) The tree has no `_`-prefixed folder anywhere, so a private-
 * folder convention introduced for one directory is a convention the next
 * person has to learn for one directory. (2) A route segment is routing space;
 * a design system parked inside one reads as route-private implementation
 * instead of the peer of `ui/` it actually is. (3) Dependency direction:
 * `src/app/**` imports `src/components/**` and nothing under `src/components/**`
 * imports back out of `src/app/**`. `AdminHeader` and the admin route roster
 * already live under `src/components/`, so a layer in the route folder would
 * have to be imported upward the moment the header adopts these tokens,
 * inverting the one direction this tree keeps straight.
 *
 * WHY THE CARD IS NOT ITSELF INTERACTIVE - the decision the whole contract is
 * shaped around. Each admin list card USED TO BE a
 * `<div role="button" tabIndex={0} onClick>` containing `<button>Edit</button>`
 * and `<button>Delete</button>` (AdminBlogList, AdminRecipeList), and the album
 * tile was the same shape with dnd-kit's `role="button"` on the root
 * (SortablePhotoCard). Interactive content nested inside an interactive element
 * is invalid, and the cost is not theoretical: the card is a single ambiguous
 * tab stop announced as a button whose content is two more buttons, every inner
 * handler has to `stopPropagation` to keep the outer one from firing, and the
 * outer `onKeyDown` swallows Space inside the album's caption field. So a card
 * here is a plain container and its actions are real, individually focusable
 * controls. Whole-card click-to-edit is deliberately not preserved: every way
 * of restoring it re-creates the nesting, and `actions` already gives each card
 * a named, reachable Edit control.
 *
 * No field here carries the admin JWT. The token lives in `localStorage` and
 * reaches the network through `AdminTokenContext`; a view prop is never its
 * carrier.
 */

/**
 * A card's image, always an S3 object key - every admin image in this app is
 * one (`Blog.coverPhoto`, `CocktailRecipe.coverPhoto` and `ClassPhoto.s3Key`
 * all store keys, resolved to a signed URL at render time). The public
 * `ContentMedia`'s second `{ kind: "url" }` variant is deliberately not carried
 * over: no admin surface has a direct-URL image, and a variant nothing renders
 * is a branch the next person has to guess the intent of.
 *
 * Wrapped in an object rather than flattened to `mediaKey?: string | null` so
 * two states stay distinguishable at the call site: an omitted `media` means
 * the card has no image slot at all (the session card, which must not reserve
 * space for one), while `{ s3Key: null }` means the slot exists but the key is
 * unset - a blog or recipe with no cover - and the card holds an empty plate so
 * a grid of mostly-illustrated cards stays even. Flattened, those two states
 * would be `undefined` versus `null` on one field, which no adapter can be
 * trusted to spell consistently.
 */
export type AdminCardMedia = {
  s3Key: string | null;
};

/**
 * One labelled metadata pair, e.g. `{ label: "Author", value: "Jane" }`,
 * rendered as a definition-style row. Labelled rather than the pre-composed
 * strings the current cards emit ("By Jane", "Date 1/2/2026"): a screen reader
 * hears "Author: Jane" instead of a bare fragment, and the view - not each call
 * site - decides how a label sits against its value.
 *
 * `value` is a plain string and carries no machine-readable instant, unlike the
 * public `ContentTimestamp`. That split exists because the archives emit
 * `<time dateTime={iso}>`, read by machines that never reach an authenticated
 * page. Here a formatted local date is the whole requirement, and an unread ISO
 * field would be carried by every adapter for nothing.
 */
export type AdminCardMetaItem = {
  label: string;
  value: string;
};

/**
 * Emphasis for one card action. `primary` is the card's main action (Edit on a
 * list card, Save on the session card's inline edit form), `secondary` the
 * supporting one (Cancel on that same form), `danger` the destructive one
 * (Delete, on every card that has one). Defaults to `secondary`, so an action
 * that states no tone cannot accidentally read as destructive.
 */
export type AdminCardActionTone = "primary" | "secondary" | "danger";

/**
 * One control in a card's action row, rendered as a real `<button>`.
 *
 * `ariaLabel` is required, not optional. Card actions only ever appear inside
 * repeated cards, where a keyboard user tabbing the list otherwise hears
 * "Edit, Delete, Edit, Delete" with nothing to say which row they are on; the
 * visible `label` stays short and the accessible name disambiguates it. It must
 * contain the visible label verbatim - "Delete blog: Old Fashioned", never
 * "Remove Old Fashioned" - or the control fails WCAG 2.5.3 Label in Name for
 * anyone driving the page by voice.
 *
 * No `busy` field. Every named consumer disables its actions from a single
 * in-flight flag and none re-labels a card button while a request is open, so a
 * busy state would be a prop nothing reads; add it with the first card that
 * actually needs "Deleting...".
 */
export type AdminCardAction = {
  /** Visible text, e.g. "Edit". */
  label: string;
  /** Accessible name naming the row, e.g. "Edit blog: Old Fashioned". */
  ariaLabel: string;
  onClick: () => void;
  tone?: AdminCardActionTone;
  disabled?: boolean;
};

/**
 * A short status chip on the card, e.g. "Not shown publicly" on an album photo
 * ordered past the public cap. The card owns the whole attention treatment the
 * chip implies - chip plus frame - so a consumer never reaches for a state
 * class of its own; that reach is what produced the per-page drift the public
 * token contract exists to prevent.
 *
 * An object with one field rather than `badge?: string`, because the tone split
 * this will eventually need (a neutral informational chip beside the warning
 * one) can then be added without rewriting the call sites. It is not added now:
 * only the warning reading has a consumer today.
 *
 * The chip needs no `aria-describedby` wiring, unlike the id-tethered note
 * SortablePhotoCard used to carry. That wiring existed only because the card
 * root was a button and its content was therefore collapsed into that button's
 * accessible name; a non-interactive card is read in document order and the
 * chip is simply part of it. The tile dropped the wiring when it dropped the
 * button root, and its own comment says so.
 */
export type AdminCardBadge = {
  label: string;
};

/**
 * A non-interactive container for one manageable entity. Holds no `id`: each
 * consumer maps over its own rows and sets React's `key` there, so an id on the
 * props would be a second, unread copy of it.
 *
 * No `kicker`. The public card carries one because a landing grid mixes
 * articles, recipes and videos; an admin list is single-typed by construction
 * and its panel heading already says what every card in it is, so a per-card
 * category label would repeat that heading once per row.
 */
export type AdminCardProps = {
  /**
   * The card's heading line. Not always a name: the session card's title is its
   * formatted start/end date-time, because that is what identifies a session.
   */
  title: string;
  /**
   * Short summary under the title, CSS-clamped by the view and never
   * pre-truncated - a recipe's `description`, or the opening of a blog's body.
   */
  excerpt?: string;
  meta?: AdminCardMetaItem[];
  badge?: AdminCardBadge;
  media?: AdminCardMedia;
  /**
   * Controls for this entity, rendered as a row of real buttons at the foot of
   * the card. Omitted on a card whose only controls live in `children`.
   */
  actions?: AdminCardAction[];
  /**
   * A drag grip rendered in the card's own corner slot, for a card inside a
   * sortable list (the photo album). A node rather than a boolean because the
   * activator has to carry a drag library's attributes, listeners and activator
   * ref, all of which belong to the consumer.
   *
   * Note what this slot does NOT include: the sortable node ref, the transform
   * style and the dragging state. Those position the card within its list, so
   * they belong to a wrapper the consumer owns and renders around this card -
   * which is also how the contract avoids a `rootRef`/`style`/`...rest`
   * passthrough on the card root. Such a passthrough would let any consumer
   * spread an `onClick` or a `role="button"` back onto the root and silently
   * re-create the nested-interactive bug documented at the top of this file.
   * There is no escape hatch here on purpose.
   */
  dragHandle?: ReactNode;
  /**
   * Body content the card cannot express as text: the album tile's caption
   * field and its Save control, or the session card's inline edit form.
   * Anything focusable passed here is a sibling of `actions`, never a
   * descendant of an interactive ancestor.
   */
  children?: ReactNode;
};

/**
 * The `/admin` landing entry, and the one place a whole card is a link.
 *
 * Decided against giving `AdminCardAction` an `href` variant. A landing entry
 * is not a card with a link in its action row - it is a card whose entire
 * surface is the target, which is only legal because it contains no other
 * interactive content, and which is the exact inverse of `AdminCardProps`'
 * defining guarantee that the card is a non-interactive container. Folding both
 * into one component would mean a card that is interactive or not depending on
 * which fields were passed, and the first consumer to put a link action beside
 * two buttons would land back on the rule stated in
 * `ContentLandingLayout.module.css`: interactive content may not be nested
 * inside an anchor. Two components, each with one honest shape.
 *
 * Takes the roster entry whole rather than restating `href`/`label`/`hint` as
 * three props: `ADMIN_NAV_ITEMS` is already the single source of admin routes
 * and the landing maps it straight through, so a second declaration of its
 * shape could only drift from it.
 */
export type AdminNavCardProps = {
  item: AdminNavItem;
};

/**
 * How many cards share a line. Named rather than a raw minimum track width,
 * because a numeric prop would let each page pick its own and reintroduce the
 * per-surface drift these shared modules exist to stop.
 *
 *   rows   the blogs list, the recipes list and the classes sessions list -
 *          a card is a single wide line with an 80px floor;
 *   cards  the /admin landing, two entries to a line above 900px;
 *   tiles  the photo album, whose entries are thumbnails and pack several to a
 *          line.
 *
 * The blogs and recipes lists were assigned to `cards` when this contract was
 * written and take `rows` instead, on the density measurement that arrived a
 * wave later: a 3-up grid of 320px cards shows six of a ten-record page and the
 * 80px line shows eight or nine, while gaining a thumbnail the grid never had.
 * A grid is for browsing by image; an admin is scanning by title.
 */
export type AdminCardGridDensity = "rows" | "cards" | "tiles";

export type AdminCardGridProps = {
  /**
   * Defaults to `cards`. All five grids pass this explicitly - three `rows`,
   * one `cards`, one `tiles` - so the default is currently unexercised, and it
   * is kept optional only so a new grid is not forced to state a density
   * before it knows which one it wants. It was once described here as "the
   * shape three of the five grids want"; the density measurement recorded on
   * AdminCardGridDensity moved the two record lists to `rows` and left that
   * claim describing nothing.
   */
  density?: AdminCardGridDensity;
  /**
   * One `AdminCard` or `AdminNavCard` per entry. The grid wraps each child in
   * its own list item and is itself a list, so assistive tech announces how many
   * entries there are - which is why this takes a list of cards and not
   * arbitrary nodes.
   */
  children: ReactNode;
};

/**
 * THE ADMIN EYEBROW, AND THE ONLY LEGAL VALUE OF IT.
 *
 * The eyebrow states the screen's FUNCTION, never the brand. The chrome bar
 * overhead already says "Admin Portal" on every screen, so an eyebrow reading
 * "PNW Spirits" spends 36px of list area telling the admin something the header
 * above it just said - and the shell's own comment (AdminPageLayout.module.css,
 * .eyebrow) had already recorded that a screen which repeats the chrome is
 * saying it twice. "Manage" is the word the list screens landed on and it is
 * the one that earns the line: it names the mode the screen is in.
 *
 * A CONSTANT RATHER THAN A CONVENTION, because a convention is exactly what
 * this was: three screens shipped two spellings ("Manage" twice, "PNW Spirits"
 * once) and this file's own example suggested a third ("The PNW Spirits"). A
 * value nobody can retype cannot drift.
 *
 * THE PROP BELOW IS NARROWED TO `typeof ADMIN_EYEBROW`, which is what makes
 * drift impossible rather than merely inconvenient: a second spelling is now a
 * compile error at the call site, not a review catch. It landed in the same
 * change as the three imports, because a narrowing ahead of them is a type
 * error inside files that still pass literals. No import is needed to express
 * it - the constant and the prop are declared in one file, so the narrowing
 * draws no new edge and cannot form a cycle.
 *
 * The cost, accepted: a screen that genuinely wants a different eyebrow cannot
 * have one without widening this. That is the intent. The eyebrow names the
 * mode, the mode is "manage", and the two admin screens that are NOT lists -
 * the landing and the newsletter composer - already answer by passing no
 * eyebrow at all, which stays legal. A third answer would need a reason this
 * file does not have yet, and would arrive as a union here rather than as a
 * literal typed into one screen.
 */
export const ADMIN_EYEBROW = "Manage";

/**
 * The shell every admin screen renders into: header block, optional toolbar,
 * body, optional footer.
 *
 * No `className`. The public layouts take one because each landing page
 * art-directs its own background; the admin screens share a single ground, and
 * an open class hook is how they would stop doing so.
 */
export type AdminPageLayoutProps = {
  /**
   * Short label above the heading. Pass `ADMIN_EYEBROW` or nothing - and the
   * type says so, because those are the only two values it accepts. The eyebrow
   * names the screen's function and never the brand; the reasoning, and the
   * cost of the narrowing, are on that constant. Omitting it is the common
   * case: the chrome bar already says where the admin is.
   */
  eyebrow?: typeof ADMIN_EYEBROW;
  /** Screen title and the page's only `<h1>`, e.g. "Blogs". */
  heading: string;
  /** Optional short lede under the heading. */
  intro?: string;
  /**
   * Screen-level controls beside the header, e.g. "New post" and "Continue
   * draft". A node rather than a prop set so the shell stays free of any
   * knowledge of what a given screen's controls are.
   */
  toolbar?: ReactNode;
  /**
   * The second header band: an inventory line at the left of the spine and the
   * list's own controls at its right.
   *
   * Added by the design layer, after the research settled a two-band header as
   * the shape every measured reference converges on - and settled four bands as
   * the failure mode, at ~200px of chrome before the first record on a 900px
   * screen. Without a slot here each of the five screens would build its own
   * band, which is how the admin acquired two copies of one card block in the
   * first place.
   *
   * `count` is already worded ("1-10 of 43"), so the shell never learns what a
   * recipe is; `controls` is the screen's own search field, which is a
   * client-state-driven control and deliberately NOT the public
   * ContentArchiveSearch - that component drives the router and the URL, which
   * an admin list does not have.
   */
  count?: string;
  controls?: ReactNode;
  children: ReactNode;
  /** Rendered below the body, e.g. the list pager. */
  footer?: ReactNode;
};

/**
 * One titled section within a screen - "Page Content", "Class Dates & Times",
 * "Photo Album". Its heading is the `<h2>` under the layout's single `<h1>`, so
 * the level is fixed and is not a prop.
 */
export type AdminPanelProps = {
  heading: string;
  /**
   * Static explanatory copy under the heading, e.g. "The public album shows the
   * first 12 photos in album order." Deliberately not an `AdminStatus`: this
   * text is present from first paint and never changes, and putting it in a
   * live region would make an announcement out of a caption.
   */
  description?: string;
  children: ReactNode;
};

/**
 * What kind of outcome a status message reports. A closed set because the
 * component derives the announcement from it - `error` is assertive and
 * interrupts, `success` and `info` are polite - so no screen restates
 * `role="status" aria-live="polite"` by hand the way the newsletter composer
 * used to, and none omits it the way every list's error path used to.
 */
export type AdminStatusTone = "error" | "success" | "info";

export type AdminStatusProps = {
  tone: AdminStatusTone;
  /**
   * A node, not a string: most messages are one line, but the newsletter send
   * result is a short block of counts and it is the same message in the same
   * place.
   */
  children: ReactNode;
};

/**
 * The "nothing here yet" line for an empty list - "No sessions scheduled yet."
 *
 * A separate primitive rather than `AdminStatus` with an `info` tone, and the
 * difference is not cosmetic: an empty state describes what the page contains,
 * while a status reports what just happened. Rendering it into a live region
 * would announce a fact the reader is about to encounter anyway.
 */
export type AdminEmptyStateProps = {
  message: string;
};

/*
 * The form primitives. Written with the components that read them, which is the
 * rule this file stated when it declined to guess them a wave early.
 *
 * Only two shapes are here. AdminInput and AdminTextarea are thin passthroughs
 * over InputHTMLAttributes / TextareaHTMLAttributes and declare no contract of
 * their own - a named alias for "the native input props" would be a second name
 * for a type React already exports, and the next person to add an attribute
 * would have to find and widen it.
 */

/**
 * What AdminField hands its control: the id it generated, the description
 * wiring, and the validity state. Spread onto the control verbatim.
 *
 * The attribute-named keys are intentional. They are exactly the DOM props the
 * control has to carry, so the render prop's body is `{...control}` and there
 * is no adapter in between that could drop one - which is the entire reason
 * this object exists rather than a set of camelCase fields the caller re-spells.
 */
export type AdminFieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  /** Present only when the field is in error; never spelled as `false`. */
  "aria-invalid"?: true;
};

export type AdminFieldProps = {
  label: string;
  /**
   * Optional. Falls back to useId(), so a form only names a field when
   * something outside the field needs to reference it.
   */
  id?: string;
  /** Read BEFORE typing - what the field wants. */
  hint?: string;
  /** Read AFTER typing - what went wrong. Drives aria-invalid on the control. */
  error?: string;
  required?: boolean;
  /**
   * A render prop, not a node. The field owns three attributes that must land
   * on a control it does not create, and this is the only delivery shape where
   * getting the wiring wrong is a compile error rather than a silent, invisible
   * accessibility failure. See AdminField.tsx for the three alternatives and
   * why each loses.
   */
  children: (control: AdminFieldControlProps) => ReactNode;
};

/**
 * A standalone control - "New post", "Save", "Send to all subscribers",
 * "Delete recipe", "Sign in".
 *
 * Reuses AdminCardActionTone rather than declaring a second tone vocabulary:
 * "which of these three things is this control" is one question, and answering
 * it with two enums is how `danger` ends up meaning something different
 * depending on where you are standing. The two components RENDER the shared
 * tone differently - a row's Delete is neutral at rest and a dialog's is not -
 * and that difference is about repetition, not about severity.
 *
 * `ariaLabel` is optional here, where AdminCardAction requires it. A card
 * action only ever appears inside a repeated card, where the visible label is
 * ambiguous by construction; a standalone button's visible text is usually its
 * whole accessible name, and a redundant one would be a second thing to keep in
 * sync. When it IS supplied it is still bound by WCAG 2.5.3 Label in Name and
 * must contain the visible label verbatim.
 */
export type AdminButtonProps = {
  /** Defaults to `secondary`, so a control that states no tone cannot read as destructive. */
  tone?: AdminCardActionTone;
  /**
   * Defaults to "button". The native default is "submit", which is how a
   * "Delete" rendered beside a form silently posts it.
   */
  type?: "button" | "submit";
  disabled?: boolean;
  /**
   * In flight. Marks the control `aria-disabled` and inert - NOT `disabled`,
   * which would drop the focus it is holding - and sets aria-busy. It outranks
   * `disabled`, because the callers that state both state them for the same
   * moment. See AdminButton.tsx, which carries the measurement and the reason
   * its inertness is now the component's job rather than the browser's.
   *
   * Deliberately does NOT change the label: only the screen knows whether the
   * right word is "Sending...", "Uploading..." or "Saving...".
   */
  busy?: boolean;
  /** For a submit at the foot of a narrow form - the login page, and phones. */
  fullWidth?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
  children: ReactNode;
};
