import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import shell from "@/components/ui/ContentDetailShell.module.css";
import type {
  RecipeImageStep,
  RecipeInstructionStep,
  RecipeTextStep,
} from "@/services/content/recipeContent.types";
import { parseRecipeContent } from "@/services/content/recipeContentService";
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
import styles from "./RecipesPostPage.module.css";
import S3InstructionImage from "./S3InstructionImage";

// The cover is the largest object on the page, so it is served above
// next/image's default 75. 85 is the ceiling declared in next.config.ts
// `images.qualities`; an undeclared value is a hard 400 from the optimizer
// rather than a silent downgrade, so this must not be raised here alone.
// Matches ContentCard's CARD_IMAGE_QUALITY and /blogs/[id]'s constant of the
// same name: one role, one encode quality, across all three surfaces.
//
// Step photos are deliberately NOT covered by this and take next/image's
// default instead - see StepFigure. Named for the cover rather than for the
// page so the two roles cannot be conflated again.
const COVER_IMAGE_QUALITY = 85;

// The lead photograph is capped at 26rem (416px) at every viewport - it is a
// column-scale object beside the description, not a banner - so one fixed hint
// is accurate rather than a per-breakpoint derivation. It over-serves by ~19%
// on a 390px phone, where the box measures 350px; that is the same trade
// ContentCard states for its own `sizes`.
//
// Passed to BOTH branches that can fill the plate. The unsigned fallback is a
// card component, and a card is a full-bleed plate, so its own default is
// 100vw - which on this page asked the optimizer for a ~3x oversized source at
// 1440px. Two branches rendering one box must state one size.
const COVER_SIZES = "416px";

// Step-photo geometry, matching S3InstructionImage's constants exactly: the two
// render the same file and must not disagree about it. 554 is the rendered
// ceiling of the prose column and 314 rescales the 600x340 ratio this page has
// always declared. Both are pre-load placeholders only - verified in Chromium
// that an <img> sized `width: 100%; height: auto` takes its own natural ratio
// once decoded, whatever the attributes said - and stored instruction photos
// have no fixed ratio for them to match.
//
// `sizes` is deliberately omitted, as it is there and on ContentCard: without
// it next/image builds a 1x/2x srcset from the width, which snaps to the 640w
// and 1200w device sizes and covers every density this column is read at, in
// two optimizer cache entries rather than the eight a `sizes` string generates.
const STEP_IMAGE_WIDTH = 554;
const STEP_IMAGE_HEIGHT = 314;

/**
 * Cached per request so `generateMetadata` and the page body share one query
 * rather than reading the same row twice.
 */
const getRecipe = cache(async (idParam: string) => {
  const id = Number.parseInt(idParam, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return prisma.cocktailRecipe.findUnique({ where: { id } });
});

function pluralize(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/** One numbered step together with the photos the author placed after it. */
type MethodStep = { step: RecipeTextStep; figures: RecipeImageStep[] };

/**
 * Regroup the service's flat step list for rendering.
 *
 * The method is a real `<ol>` so assistive technology announces a step count,
 * which means only text steps may be list items: a photo that consumed an index
 * would desynchronise the announced count from the numerals on screen, and from
 * the `number` the service assigned. Photos therefore render inside the step
 * they follow. A photo placed before step 1 has no step to attach to, so it is
 * returned separately and rendered above the list.
 *
 * This is a view-level regrouping of already-structured data, not parsing.
 * Nothing here inspects stored text.
 */
function toMethodSteps(steps: RecipeInstructionStep[]): {
  leadingFigures: RecipeImageStep[];
  methodSteps: MethodStep[];
} {
  const leadingFigures: RecipeImageStep[] = [];
  const methodSteps: MethodStep[] = [];

  for (const step of steps) {
    if (step.kind === "text") {
      methodSteps.push({ step, figures: [] });
    } else if (methodSteps.length > 0) {
      methodSteps[methodSteps.length - 1].figures.push(step);
    } else {
      leadingFigures.push(step);
    }
  }

  return { leadingFigures, methodSteps };
}

/**
 * One instruction photo.
 *
 * Two transports, mirroring ContentCard's `{ kind: "s3" } | { kind: "url" }`
 * split: a server-signed URL renders here, in the SSR HTML; a key the server
 * could not sign is handed to the client component that resolves one after
 * hydration. The markup is deliberately identical to S3InstructionImage's down
 * to the wrapper element - a plain <div>, not a <figure>, because there is no
 * caption to group with the image and `alt` already carries what figure
 * semantics would add.
 *
 * Neither path sets `quality`, so both take next/image's default 75 and one
 * photograph is encoded one way however it was signed. A step photo is a
 * supporting image in a 554px column, not the cover photography the constant
 * above raises to 85, and each distinct value is another optimizer cache entry
 * per image per width per format.
 */
function StepFigure({ figure }: { figure: RecipeImageStep }): React.ReactNode {
  if (!figure.signedUrl) {
    return <S3InstructionImage s3Key={figure.s3Key} alt={figure.alt} />;
  }

  return (
    <div className={styles.stepFigure}>
      <Image
        src={figure.signedUrl}
        alt={figure.alt}
        width={STEP_IMAGE_WIDTH}
        height={STEP_IMAGE_HEIGHT}
        className={styles.stepImage}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) return { title: pageTitle("Recipe not found") };

  // Passed through verbatim, where /blogs/[id] has to derive and clip one: a
  // recipe's `description` is an author-written short field rather than the
  // opening of a long body, and clipping an authored sentence mid-word to hit
  // a character budget would read worse than the sentence itself.
  const description = recipe.description;
  const images = recipe.coverPhoto
    ? [stableMediaUrl(recipe.coverPhoto)]
    : undefined;
  // Built from the row's own id, never from the request param: the id parse is
  // lenient, so /recipes/3, /recipes/003 and /recipes/3.9 all render this
  // recipe and only one of them should be the indexed page.
  const url = absoluteUrl(`/recipes/${recipe.id}`);

  return {
    title: pageTitle(recipe.title),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: recipe.title,
      description,
      url,
      images,
      publishedTime: recipe.createdAt.toISOString(),
      modifiedTime: recipe.updatedAt.toISOString(),
      authors: [recipe.author],
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description,
      images,
    },
  };
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // Splitting the stored free-text columns, numbering the steps and signing
  // every instruction photo all live in the content service, which also fixes
  // the separator that used to tear `1.5 oz` and `IMG_4821.jpg` in half. The
  // page renders by `kind` and never parses.
  const [{ ingredients, steps, stats }, coverUrl] = await Promise.all([
    parseRecipeContent(recipe),
    getSignedImageUrl(recipe.coverPhoto),
  ]);
  const { leadingFigures, methodSteps } = toMethodSteps(steps);
  const hasRecipeBody = ingredients.length > 0 || methodSteps.length > 0;
  const coverAlt = `Cover image for ${recipe.title}`;
  const coverImage = recipe.coverPhoto
    ? stableMediaUrl(recipe.coverPhoto)
    : null;

  // Recipe's only required properties are `name` and `image`. Without a cover
  // there is no image to give and the block would be invalid, so it is omitted
  // whole rather than emitted incomplete. prepTime, cookTime, totalTime,
  // recipeYield, recipeCategory, nutrition and aggregateRating are absent on
  // purpose: no column backs any of them, and losing rich-result carousel
  // eligibility is the right trade against publishing invented times and
  // yields. Serialized through jsonLdHtml, which carries the `<` escape this
  // block depends on.
  const jsonLd = coverImage
    ? {
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: recipe.title,
        image: [coverImage],
        description: recipe.description,
        author: { "@type": "Person", name: recipe.author },
        datePublished: recipe.createdAt.toISOString(),
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": absoluteUrl(`/recipes/${recipe.id}`),
        },
        ...(ingredients.length > 0 ? { recipeIngredient: ingredients } : {}),
        ...(methodSteps.length > 0
          ? {
              recipeInstructions: methodSteps.map(({ step }) => ({
                "@type": "HowToStep",
                text: step.text,
              })),
            }
          : {}),
      }
    : null;

  return (
    <main className={shell.page}>
      <article>
        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
          />
        ) : null}

        {/* Two-up: title block left, byline flush to the spine right edge,
            both landing on the copper rule. Identical in structure to
            /blogs/[id] and styled from the same shell module - the two
            mastheads are one object now, not two that agree. */}
        <header className={shell.masthead}>
          <div className={shell.mastheadLead}>
            {/* The landing page, not /recipes: /recipes is the pre-redesign
                archive, and sending a reader who arrived from
                /recipes-landing back out of the editorial system was the one
                thing on this page that undid the rest of it. */}
            <Link href="/recipes-landing" className={shell.backLink}>
              <span aria-hidden="true">&larr;</span> Back to Cocktails
            </Link>
            {/* The landing headers own words, not a shortened form of them:
                the eyebrow is the element that rhymes a detail page with the
                landing page it came from, and a different word is a weaker
                rhyme than the same word. */}
            <p className={shell.eyebrow}>Craft Cocktails</p>
            <h1 className={shell.title}>{recipe.title}</h1>
          </div>
          {/* A list of facts about the drink, so a real list. The counts are
              the only at-a-glance data this schema can honestly derive. */}
          <ul className={shell.meta}>
            <li>By {recipe.author}</li>
            <li>
              <time dateTime={recipe.createdAt.toISOString()}>
                {formatDate(recipe.createdAt)}
              </time>
            </li>
            {stats.ingredientCount > 0 ? (
              <li>{pluralize(stats.ingredientCount, "Ingredient")}</li>
            ) : null}
            {stats.stepCount > 0 ? (
              <li>{pluralize(stats.stepCount, "Step")}</li>
            ) : null}
          </ul>
        </header>

        {/* The photograph sits beside the description and never behind it:
            nothing is ever set over a cover, because covers are uploaded
            through /admin at uncontrolled brightness. A recipe with no cover at
            all drops the media column entirely rather than reserving an empty
            square - the lede then runs the full spine. A cover that exists but
            could not be signed keeps its plate and resolves on the client -
            the same degradation ContentCard uses, but with this page's own
            size hint rather than a card's full-bleed 100vw, because the plate
            is 416px wide at every viewport whichever branch fills it. */}
        {recipe.coverPhoto || recipe.description ? (
          <div className={styles.lead}>
            {recipe.coverPhoto ? (
              <div className={styles.leadMedia}>
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt={coverAlt}
                    fill
                    sizes={COVER_SIZES}
                    quality={COVER_IMAGE_QUALITY}
                    className={styles.leadImage}
                    priority
                  />
                ) : (
                  <S3CardBackgroundImage
                    s3Key={recipe.coverPhoto}
                    alt={coverAlt}
                    className={styles.leadImage}
                    sizes={COVER_SIZES}
                    priority
                  />
                )}
              </div>
            ) : null}
            {recipe.description ? (
              <p className={styles.lede}>{recipe.description}</p>
            ) : null}
          </div>
        ) : null}

        {ingredients.length > 0 ? (
          <section
            className={styles.section}
            aria-labelledby="recipe-ingredients"
          >
            <h2 id="recipe-ingredients" className={styles.sectionHeading}>
              Ingredients
            </h2>
            {/* Uncontrolled checkboxes: a real <input> and a real <label for>,
                no React state and no client boundary, so the page stays a
                server component. They exist for the one use this page has that
                a reading page does not - being worked through, in order, with
                one hand, while the other holds a jigger. */}
            <ul className={styles.ingredientList}>
              {ingredients.map((ingredient, index) => {
                const inputId = `ingredient-${index}`;
                return (
                  <li key={inputId} className={styles.ingredient}>
                    <input
                      type="checkbox"
                      id={inputId}
                      className={styles.ingredientCheck}
                    />
                    <label htmlFor={inputId} className={styles.ingredientLabel}>
                      {ingredient}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {methodSteps.length > 0 || leadingFigures.length > 0 ? (
          <section className={styles.section} aria-labelledby="recipe-method">
            <h2 id="recipe-method" className={styles.sectionHeading}>
              Method
            </h2>

            {leadingFigures.length > 0 ? (
              <div className={styles.leadingFigures}>
                {leadingFigures.map((figure, index) => (
                  <StepFigure key={`lead-${index}`} figure={figure} />
                ))}
              </div>
            ) : null}

            {methodSteps.length > 0 ? (
              <ol className={styles.stepList}>
                {methodSteps.map(({ step, figures }) => (
                  <li key={step.number} className={styles.step}>
                    {/* The numeral comes from the service, not from the list's
                        own counter: photos are deliberately not list items, so
                        the two would otherwise diverge the moment a recipe
                        carried one. aria-hidden because the <ol> already
                        announces the position. */}
                    <span className={styles.stepNumber} aria-hidden="true">
                      {step.number}
                    </span>
                    <div>
                      <p className={styles.stepText}>{step.text}</p>
                      {figures.map((figure, index) => (
                        <StepFigure
                          key={`${step.number}-${index}`}
                          figure={figure}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {!hasRecipeBody ? (
          <p className={styles.emptyMessage}>
            This recipe hasn&rsquo;t been written up yet — its ingredients and
            method are still to come. There are plenty more to pour in the
            meantime.
          </p>
        ) : null}
      </article>

      <div className={shell.closeRow}>
        <Link href="/recipes-landing" className={shell.closeButton}>
          {/* The gap is a non-breaking space inside the span, not the
              whitespace before it: .viewAllButton is a flex container, so the
              text and the arrow are two flex items and a whitespace-only
              anonymous item between them is dropped. */}
          More Cocktails<span aria-hidden="true">&nbsp;&rarr;</span>
        </Link>
      </div>
    </main>
  );
}
