import { getSignedImageUrl } from "@/services/media/signedImageService";
import { Marked, Renderer, type RendererObject } from "marked";
import { MARKDOWN_DESTINATION, MARKDOWN_IMAGE_TOKEN } from "./markdownTokens";

/**
 * Server-side rendering of stored blog markdown into the HTML the blog post
 * page injects, plus the reading estimate its at-a-glance strip needs and the
 * plain-text reduction both that estimate and the page's metadata share.
 *
 * Two concerns share this module: resolving image sources, and keeping the
 * emitted HTML free of script.
 *
 * Image resolution. Blog content stores raw S3 keys (`blog-media/...`) and, for
 * older posts, absolute bucket URLs — neither is fetchable by a browser,
 * because the bucket is private. Both used to be rewritten to
 * `/api/media?key=...`, a route that 302-redirects to a freshly signed URL.
 * That costs an extra round-trip per inline image and hands back a different
 * URL every time, so nothing downstream can cache it.
 *
 * Each key is instead resolved through the media service before parsing, which
 * returns a Redis-cached, byte-identical signed URL. The proxy route stays as
 * the fallback for keys that cannot be signed, so an unavailable signer costs
 * the old redirect hop rather than a broken image.
 *
 * Sanitization. The output is injected with `dangerouslySetInnerHTML` from a
 * server component, so it lands in the initial SSR document and the browser's
 * HTML parser runs whatever it finds there. Marked's defaults pass raw
 * `<script>` and `javascript:` hrefs straight through; see `sanitizingRenderer`.
 */

/** Content media written by the blog editor is stored under this prefix. */
const S3_KEY_PREFIX = /^blog-media\//;

/**
 * Absolute bucket URLs written before content media moved to stored keys.
 * Deliberately unanchored, matching the check this replaced.
 */
const LEGACY_S3_URL = /https:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/(.+)/;

/**
 * Average adult silent reading rate for English non-fiction prose, in words per
 * minute. From Brysbaert (2019), "How many words do we read per minute? A
 * review and meta-analysis of reading rate" (Journal of Memory and Language),
 * which puts silent reading of non-fiction at ~238 wpm across 190 studies.
 */
export const BLOG_WORDS_PER_MINUTE = 238;

/**
 * The S3 key behind an image href, or null when the href is already fetchable
 * (an external URL, a relative path) and must pass through untouched.
 */
function s3KeyFromHref(href: string): string | null {
  if (!href) return null;
  if (S3_KEY_PREFIX.test(href)) return href;
  const legacy = href.match(LEGACY_S3_URL);
  return legacy ? legacy[1] : null;
}

/** The redirect-to-signed-URL proxy that carried every inline image before. */
function mediaProxyUrl(key: string): string {
  return `/api/media?key=${encodeURIComponent(key)}`;
}

async function resolveImageHref(href: string): Promise<string> {
  const key = s3KeyFromHref(href);
  if (!key) return href;
  return (await getSignedImageUrl(key)) ?? mediaProxyUrl(key);
}

/**
 * Characters a browser discards from a URL before resolving its scheme: the C0
 * controls, space and DEL. The href is tested in that reduced form, so a
 * leading control byte cannot hide a scheme from the allowlist below.
 */
const URL_IGNORED_CHARS = /[\u0000-\u0020\u007F]/g;

/** The only schemes allowed to reach a rendered `href` or `src`. */
const ALLOWED_SCHEME = /^(?:https?|mailto):/i;

/**
 * A colon introduces a scheme, and an ampersand can begin an entity that
 * decodes into one — `java&#09;script:` reaches the browser as a tab the URL
 * parser then strips. Neither may appear in the first segment of a reference
 * carrying no allowed scheme. Everything else is a genuine relative reference
 * (`blog-media/x.jpg`, `/images/a.png`, `#section`, `//cdn/a.jpg`) out of which
 * no browser can read a scheme.
 */
const SCHEME_CAPABLE = /[:&]/;

/** Whether an href may be emitted as-is, or must be dropped as a script vector. */
function isSafeHref(href: string): boolean {
  const url = href.replace(URL_IGNORED_CHARS, "");
  if (ALLOWED_SCHEME.test(url)) return true;
  return !SCHEME_CAPABLE.test(url.split(/[/?]/, 1)[0]);
}

/**
 * Closes the two holes marked's defaults leave in HTML destined for
 * `dangerouslySetInnerHTML`: raw HTML tokens are emitted verbatim, and link and
 * image hrefs are emitted unfiltered. Both were reproduced against marked
 * 18.0.5 — a raw `<script>` survived intact, and `[x](javascript:alert(1))`
 * rendered a live anchor.
 *
 * React's own `javascript:` blocking is no defence here: React never sees these
 * values, only the finished HTML string, and the page is a server component, so
 * a `<script>` in the payload runs on first load. `Blog.content` is admin-only,
 * but the admin JWT lives in same-origin `localStorage`, which makes a poisoned
 * post a token-theft vector against the next admin who reads it.
 *
 * Raw HTML is dropped outright; a link with an unusable href degrades to its
 * own text, an image to nothing. Anything that passes is rendered by marked's
 * own methods rather than re-emitted here, so attribute escaping stays marked's
 * job and safe content renders byte-identically to the default.
 */
const sanitizingRenderer: RendererObject = {
  html() {
    return "";
  },
  link(token) {
    return isSafeHref(token.href)
      ? Renderer.prototype.link.call(this, token)
      : this.parser.parseInline(token.tokens);
  },
  image(token) {
    return isSafeHref(token.href)
      ? Renderer.prototype.image.call(this, token)
      : "";
  },
};

/** Own instance, so the sanitizing renderer never leaks onto the shared `marked`. */
const blogMarked = new Marked({ renderer: sanitizingRenderer });

/**
 * Render stored blog markdown to HTML with every S3-backed image already
 * resolved to a directly fetchable URL, and with script vectors removed.
 *
 * Resolution runs as an async `walkTokens` pass, which marked issues for every
 * token before awaiting any of them: N images cost one round-trip, not N. Only
 * image hrefs are touched, so every other token reaches the renderer exactly as
 * marked produced it.
 */
export function renderBlogMarkdown(markdown: string): Promise<string> {
  return blogMarked.parse(markdown, {
    async: true,
    walkTokens: async (token) => {
      if (token.type === "image") {
        token.href = await resolveImageHref(token.href);
      }
    },
  });
}

/**
 * Whole minutes of reading for a post, or 0 when it has no prose at all.
 * Rounded, with a floor of one minute so a short post never reads as "0 min".
 */
export function estimateReadingMinutes(markdown: string): number {
  const words = countProseWords(markdown);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / BLOG_WORDS_PER_MINUTE));
}

/** Image and link tokens, both dropped whole; see `./markdownTokens`. */
const IMAGE_TOKEN = new RegExp(MARKDOWN_IMAGE_TOKEN, "g");
const LINK_TOKEN = new RegExp(
  String.raw`\[([^\]]*)\]${MARKDOWN_DESTINATION}`,
  "g",
);

/**
 * HTML's raw text elements, body and all.
 *
 * Stripping tags alone keeps their content, and the content of these is program
 * text rather than prose, so a `<script>` body that `renderBlogMarkdown` drops
 * from the page still reached the meta description, the social card and the
 * word count. The rule is the category, not two special cases: raw text
 * elements are exactly where markup stops being markup, and `script` and
 * `style` are the complete set HTML defines. An unclosed one runs to the end of
 * the input, as it would in a browser.
 */
const RAW_TEXT_ELEMENT = /<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;

/**
 * Stored markdown reduced to the prose a reader actually reads, with runs of
 * whitespace collapsed to single spaces and the result trimmed.
 *
 * Everything removed here is text nobody reads but a naive split counts: an
 * image token's S3 key, a link's href, a fenced code block, raw HTML tags and
 * the bodies of the ones that hold no prose, a bare URL, and the list, heading
 * and emphasis markers. A link's *text* is kept, because that is read.
 *
 * Two callers, one pass: the reading estimate below, and the blog page's meta
 * description, which held a near-identical private copy of these rules. The
 * full text is returned deliberately — truncation is a per-consumer
 * presentation concern (a meta description's 155-character limit means nothing
 * to a word counter), so it belongs at the call site, not here.
 */
export function blogPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(IMAGE_TOKEN, " ")
    .replace(LINK_TOKEN, "$1")
    .replace(RAW_TEXT_ELEMENT, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[ \t]{0,3}(?:[#>]+|[-*+]|\d+[.)])[ \t]+/gm, " ")
    .replace(/[*_~#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countProseWords(markdown: string): number {
  // Tokens with no letter or digit are leftover punctuation (rules, table
  // borders, stray brackets), not words.
  return blogPlainText(markdown)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
