"use client";

import Image from "next/image";
import type { RecipeImageStep } from "@/services/content/recipeContent.types";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import styles from "./RecipesPostPage.module.css";

// Props come from the service contract rather than being restated, so a change
// to either field fails typecheck here instead of silently diverging from what
// the page passes. recipeContent.types is a type-only module and `import type`
// erases completely, so no server module reaches the client bundle.
type S3InstructionImageProps = Pick<RecipeImageStep, "s3Key" | "alt">;

// Rendered ceiling of the prose column: --measure-prose (44ch) against Geist's
// measured 0.6630em per ch at --fs-prose's 19px ceiling, which
// editorialTokens.module.css records as 554px.
//
// `sizes` is deliberately omitted rather than derived per breakpoint - the same
// call ContentCard documents for its own images. Without it, next/image builds
// a 1x/2x srcset from this width, which snaps to the 640w and 1200w device
// sizes: 640 covers the 554px column at DPR 1, 1200 covers it at DPR 2-3 and
// covers a phone's narrower column at DPR 3 as well. That is every density the
// column can be read at, in two optimizer cache entries instead of the eight a
// `sizes` string would generate across the full deviceSizes list.
const STEP_IMAGE_WIDTH = 554;
// The 600x340 ratio this page has always declared, rescaled to the width above.
// It is a pre-load placeholder only - the stylesheet sizes the image
// responsively and the photo's own ratio takes over once it loads - and stored
// instruction photos have no fixed ratio for it to match, so it is carried
// forward rather than re-picked.
const STEP_IMAGE_HEIGHT = 314;

/**
 * Client-side fallback for an instruction photo the server could not sign.
 *
 * The page renders a plain server-side <Image> whenever `signedUrl` on the
 * step is non-null, and reaches this component only when it is null. This is
 * therefore the degradation path, not the common one: it re-resolves the raw
 * key through /api/s3-signed-url so a photo still appears when server-side
 * signing was unavailable.
 *
 * It stays a separate "use client" leaf for that reason alone. useS3ImageUrl
 * resolves in an effect, so folding this into page.tsx would flip the whole
 * recipe page to a client component to serve a case that rarely fires. Same
 * boundary, and same reason, as S3CardBackgroundImage under ContentCard.
 */
export default function S3InstructionImage({
  s3Key,
  alt,
}: S3InstructionImageProps) {
  const { url } = useS3ImageUrl(s3Key);

  // Renders nothing while resolving, and nothing if resolving fails. Both are
  // intended, not an unhandled state. A photo illustrates the steps around it
  // and carries no instruction text of its own, so the recipe stays complete
  // without it. An error message the reader cannot act on, or a reserved box
  // that stays empty whenever this path fails for the same reason server-side
  // signing did, would each read as damage where an absence does not.
  // ContentCard and S3CardBackgroundImage degrade the same way on the same
  // public pages.
  if (!url) return null;

  return (
    // A neutral wrapper rather than a <figure>: there is no caption to group
    // with the image, so `alt` already carries everything figure semantics
    // would add, and a <figure> would introduce the UA margin that .stepFigure
    // - a rule this component does not own - may or may not neutralize.
    <div className={styles.stepFigure}>
      <Image
        src={url}
        alt={alt}
        width={STEP_IMAGE_WIDTH}
        height={STEP_IMAGE_HEIGHT}
        className={styles.stepImage}
      />
    </div>
  );
}
