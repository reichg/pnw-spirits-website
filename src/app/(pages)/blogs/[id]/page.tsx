import shell from "@/components/ui/ContentDetailShell.module.css";
import {
  blogPlainText,
  estimateReadingMinutes,
  renderBlogMarkdown,
} from "@/services/content/blogContentService";
import { getSignedImageUrl } from "@/services/media/signedImageService";
import {
  absoluteUrl,
  formatDate,
  jsonLdHtml,
  pageTitle,
  stableMediaUrl,
} from "@/utils/contentDetail";
import prisma from "@/utils/prisma";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import styles from "./BlogPostPage.module.css";

// The cover photograph is the largest object on the page, so it is served above
// next/image's default 75. 85 is the ceiling declared in next.config.ts
// `images.qualities`; an undeclared value is a hard 400 from the optimizer
// rather than a silent downgrade, so this must not be raised here alone.
// Matches ContentCard's CARD_IMAGE_QUALITY: one photograph, one encode quality.
const COVER_IMAGE_QUALITY = 85;

// The cover renders at --measure-prose (44ch, ~554px at 1440px) and releases to
// the full column below 600px. Deliberately over-serves at the small end rather
// than re-deriving the gutter arithmetic here, exactly as ContentCard does.
const COVER_SIZES = "(max-width: 599px) 100vw, 560px";

/** Meta descriptions are truncated by search engines past roughly this length. */
const DESCRIPTION_MAX_CHARS = 155;

/**
 * `Updated` is shown only once the two timestamps are more than a day apart.
 * `updatedAt` is touched by every write, so on a post that was never revised it
 * sits seconds from `createdAt` and printing both is noise, not information.
 */
const UPDATED_VISIBLE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Cached per request so `generateMetadata` and the page body share one query
 * rather than reading the same row twice.
 */
const getBlog = cache(async (idParam: string) => {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return prisma.blog.findUnique({ where: { id } });
});

/**
 * The post's opening prose, trimmed to a meta-description length.
 *
 * Deliberately verbatim opening text rather than a synthesized summary — the
 * distinction the landing adapter draws when it refuses to derive a visible
 * card excerpt from `content`. Nothing here is shown on the page; it exists so
 * that a search result and a shared link carry the author's own first sentence
 * instead of whatever a crawler decides to lift.
 *
 * The markdown stripping itself is `blogPlainText` from the content service,
 * which is the same pass `estimateReadingMinutes` counts words through — so a
 * post's reading time and its description can never disagree about what the
 * prose is. Only the truncation is local: 155 characters is a search-result
 * budget, not a property of the text.
 */
function toDescription(markdown: string): string {
  const text = blogPlainText(markdown);
  if (text.length <= DESCRIPTION_MAX_CHARS) return text;
  const clipped = text.slice(0, DESCRIPTION_MAX_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : clipped.length).trimEnd()}…`;
}

/**
 * Add the two loading hints every other image on the site gets from next/image.
 *
 * Prose images arrive inside a finished HTML string, so `next/image` is not
 * available to them and they render as bare `<img>`: unoptimised, and eagerly
 * fetched even when they sit 3,000px down the article. `loading` and `decoding`
 * are the two attributes that do not require knowing the file's intrinsic
 * dimensions, which markdown never supplies; width/height are therefore still
 * absent and the CLS they would prevent is accepted rather than guessed at.
 *
 * Safe as a string pass because `renderBlogMarkdown` drops raw HTML tokens
 * outright (its `html()` renderer returns ""), so every `<img` in the output was
 * emitted by marked's own image renderer and none can come from stored text.
 * The insertion is a fixed attribute pair after the tag name; it introduces no
 * markup and cannot close or open a tag.
 */
function withLazyProseImages(html: string): string {
  return html.replace(/<img /g, '<img loading="lazy" decoding="async" ');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const blog = await getBlog(id);
  if (!blog) return { title: pageTitle("Article not found") };

  const description = toDescription(blog.content);
  const images = blog.coverPhoto
    ? [stableMediaUrl(blog.coverPhoto)]
    : undefined;

  // Built from the row's own id, never from the request param: the id parse
  // is lenient, so /blogs/4, /blogs/004 and /blogs/4.9 all render this post and
  // only one of them should be the indexed page.
  const url = absoluteUrl(`/blogs/${blog.id}`);

  return {
    title: pageTitle(blog.title),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: blog.title,
      description,
      url,
      images,
      publishedTime: blog.createdAt.toISOString(),
      modifiedTime: blog.updatedAt.toISOString(),
      authors: [blog.author],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description,
      images,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const blog = await getBlog(id);
  if (!blog) notFound();

  // Markdown rendering and the reading estimate both live in the content
  // service: image keys are signed there, in parallel, with the /api/media
  // redirect as the fallback when signing is unavailable.
  const [html, coverUrl] = await Promise.all([
    renderBlogMarkdown(blog.content),
    getSignedImageUrl(blog.coverPhoto),
  ]);
  const minutes = estimateReadingMinutes(blog.content);
  const showUpdated =
    blog.updatedAt.getTime() - blog.createdAt.getTime() >
    UPDATED_VISIBLE_AFTER_MS;

  // BlogPosting has no required properties; these are the recommended five,
  // all of which exist on the model. Serialized through jsonLdHtml, which
  // carries the `<` escape this block depends on.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: blog.title,
    description: toDescription(blog.content),
    datePublished: blog.createdAt.toISOString(),
    dateModified: blog.updatedAt.toISOString(),
    author: { "@type": "Person", name: blog.author },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(`/blogs/${blog.id}`),
    },
    ...(blog.coverPhoto ? { image: [stableMediaUrl(blog.coverPhoto)] } : {}),
  };

  return (
    <main className={shell.page}>
      <article>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />

        {/* Two-up: title block left, byline flush to the spine's right edge,
            both landing on the copper rule. The byline is a <ul> because it is
            a list of facts, and it is a sibling of the title group rather than
            a child so it can take the masthead's second grid track. */}
        <header className={shell.masthead}>
          <div className={shell.mastheadLead}>
            {/* The landing page, not /blogs: /blogs is the pre-redesign
                archive, and sending a reader who arrived from
                /blogs-landing back out of the editorial system was the one
                thing on this page that undid the rest of it. */}
            <Link href="/blogs-landing" className={shell.backLink}>
              <span aria-hidden="true">&larr;</span> Back to the Journal
            </Link>
            {/* The landing header's own words, not a shortened form of them:
                the eyebrow is the element that rhymes a detail page with the
                landing page it came from, and a different word is a weaker
                rhyme than the same word. */}
            <p className={shell.eyebrow}>Distillery Journal</p>
            <h1 className={shell.title}>{blog.title}</h1>
          </div>
          <ul className={shell.meta}>
            <li>By {blog.author}</li>
            <li>
              <time dateTime={blog.createdAt.toISOString()}>
                {formatDate(blog.createdAt)}
              </time>
            </li>
            {showUpdated ? (
              <li>
                <time dateTime={blog.updatedAt.toISOString()}>
                  Updated {formatDate(blog.updatedAt)}
                </time>
              </li>
            ) : null}
            {minutes > 0 ? <li>{minutes} min read</li> : null}
          </ul>
        </header>

        {/* No cover block at all when nothing can be signed, rather than an
            empty plate: this one is a page-scale square, and reserving it for a
            photograph that never arrives is a hole in the composition. */}
        {coverUrl ? (
          <figure className={styles.cover}>
            <div className={styles.coverMedia}>
              <Image
                src={coverUrl}
                alt={`Cover image for ${blog.title}`}
                fill
                sizes={COVER_SIZES}
                quality={COVER_IMAGE_QUALITY}
                className={styles.coverImage}
                priority
              />
            </div>
          </figure>
        ) : null}

        {/* Author-written markdown, rendered server-side. Styled entirely by
            descendant selectors from .prose, because nothing here can carry a
            class. */}
        <div
          className={styles.prose}
          dangerouslySetInnerHTML={{ __html: withLazyProseImages(html) }}
        />
      </article>

      <div className={shell.closeRow}>
        <Link href="/blogs-landing" className={shell.closeButton}>
          {/* The gap is a non-breaking space inside the span, not the
              whitespace before it: .viewAllButton is a flex container, so the
              text and the arrow are two flex items and a whitespace-only
              anonymous item between them is dropped. */}
          More from the Journal<span aria-hidden="true">&nbsp;&rarr;</span>
        </Link>
      </div>
    </main>
  );
}
