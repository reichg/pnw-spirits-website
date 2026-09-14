import { mapWithSignedImageUrl } from "@/services/media/signedImageService";
import { MARKDOWN_IMAGE_TOKEN } from "./markdownTokens";
import type {
  RecipeContent,
  RecipeContentInput,
  RecipeImageStep,
  RecipeInstructionStep,
  RecipeTextStep,
} from "./recipeContent.types";

/**
 * Server-side parsing of a recipe's stored free-text `ingredients` and
 * `instructions` columns into the structured shape the recipe page renders.
 * The shapes themselves live in `./recipeContent.types`.
 *
 * Both columns are plain strings typed into a textarea by an admin, with photos
 * spliced in at the cursor as markdown image tokens. Splitting them was
 * previously inline in the page, which then re-inspected each resulting string
 * with an image regex inside its render loop. The page now receives a
 * discriminated union and renders by `kind`, never parsing.
 *
 * Instruction photos resolve to a server-signed URL here. `signedUrl` is null
 * when signing is unavailable; the raw key travels alongside it so the page can
 * hand it to the existing client-side resolver instead.
 */

/** An instruction photo before its URL has been resolved. */
type UnsignedImageStep = Omit<RecipeImageStep, "signedUrl">;
type ParsedStep = RecipeTextStep | UnsignedImageStep;

/**
 * Ingredients are entered one per line. A comma *inside* a line is content, not
 * a separator: "Fir tip, for garnish" and "Angostura, 2 dashes" are ordinary
 * cocktail phrasing, and splitting on them tore every seeded recipe's garnish
 * into two list items and reported 7 ingredients on a 6-ingredient recipe.
 *
 * Comma-splitting survives only as the fallback for a value with no second
 * line, where a comma is the sole delimiter available — a legacy row typed as
 * "2 oz rye, 0.75 oz vermouth" on one line would otherwise be one ingredient.
 * That single-line case stays genuinely ambiguous; it is the weaker signal, so
 * the newline-delimited list wins wherever one exists.
 */
const INGREDIENT_LINE = /\r?\n/;
const INGREDIENT_FALLBACK = /,/;

/**
 * Instructions are entered one per line, and additionally split on a numeric
 * list marker so a whole recipe pasted onto one line ("1. Stir 2. Strain")
 * still renders as separate steps.
 *
 * The marker must stand alone — start of text or preceded by whitespace, and
 * followed by whitespace or end of text. Without those guards `\d+\.` also
 * fires inside a measurement ("1.5 oz rye" became "Add" / "5 oz rye") and
 * inside a photo's filename ("IMG_4821.jpg" split mid-key), which is stored
 * data this has to survive rather than a hypothetical.
 */
const INSTRUCTION_SEPARATOR = /\r?\n|(?<![^\s])\d+\.(?=\s|$)/;

/**
 * Photo tokens as the recipe editor splices them in: `![alt](s3-key)`.
 *
 * The key is whatever the uploaded file was named, so the shared pattern's
 * tolerance of parentheses is what keeps `IMG(1).jpg` — a name Windows and most
 * browsers hand out for a duplicate download — from being cut at its first `)`.
 */
const INSTRUCTION_IMAGE = new RegExp(MARKDOWN_IMAGE_TOKEN, "g");

const DEFAULT_INSTRUCTION_ALT = "Instruction image";

/**
 * The alt text the recipe editor hardcodes into every photo it splices in
 * (`![image](key)`), so it is baked into stored recipes and cannot be repaired
 * by fixing the editor alone.
 *
 * Be clear about what this is: a content-level placeholder carrying no
 * information. A screen reader announcing "image" tells the listener only that
 * an image exists, which the element's role already said. Normalising it to
 * `DEFAULT_INSTRUCTION_ALT` swaps one uninformative string for a marginally
 * less useless one — a floor, not a fix. The real fix is letting admins author
 * alt text, which needs editor UI and a schema this service does not own.
 */
const PLACEHOLDER_INSTRUCTION_ALT = "image";

/**
 * Parse a recipe's stored content, resolving every instruction photo's signed
 * URL in parallel. Never throws: an unsignable photo yields a null `signedUrl`
 * rather than failing the page.
 */
export async function parseRecipeContent(
  recipe: RecipeContentInput,
): Promise<RecipeContent> {
  const ingredients = parseIngredients(recipe.ingredients);
  const parsed = parseInstructionSteps(recipe.instructions);

  // Numbering is assigned above, before signing: mapWithSignedImageUrl resolves
  // concurrently, so a counter incremented inside its mapper would number steps
  // in signing-completion order rather than in reading order.
  const steps = await mapWithSignedImageUrl(
    parsed,
    (step) => (step.kind === "image" ? step.s3Key : null),
    (step, signedUrl): RecipeInstructionStep =>
      step.kind === "image" ? { ...step, signedUrl } : step,
  );

  return {
    ingredients,
    steps,
    stats: {
      ingredientCount: ingredients.length,
      stepCount: parsed.filter((step) => step.kind === "text").length,
    },
  };
}

/** Split, trim, and drop the entries that trimmed away to nothing. */
function splitTrimmed(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseIngredients(value: string): string[] {
  const lines = splitTrimmed(value, INGREDIENT_LINE);
  // Decided on the count of non-empty lines rather than on whether a newline is
  // present: a textarea routinely leaves a trailing one behind, and
  // "2 oz rye, ice\n" is still a single-line legacy value that has to reach the
  // comma fallback. A line count of 1 also leaves a comma-free single line as
  // one ingredient, since splitting it yields the same single entry.
  return lines.length === 1
    ? splitTrimmed(lines[0], INGREDIENT_FALLBACK)
    : lines;
}

/** The alt to render for a photo token, placeholder and empty alike. */
function instructionAlt(raw: string): string {
  const alt = raw.trim();
  if (!alt || alt.toLowerCase() === PLACEHOLDER_INSTRUCTION_ALT) {
    return DEFAULT_INSTRUCTION_ALT;
  }
  return alt;
}

/**
 * Split instructions into numbered text steps and photo steps.
 *
 * Photo tokens are lifted out before the text is split, so a key is never
 * broken apart by a separator that happens to appear inside it, and a photo
 * spliced mid-line still renders as a photo instead of as literal markdown.
 */
function parseInstructionSteps(value: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  let number = 0;
  let cursor = 0;

  const pushTextSteps = (chunk: string): void => {
    for (const text of splitTrimmed(chunk, INSTRUCTION_SEPARATOR)) {
      steps.push({ kind: "text", number: ++number, text });
    }
  };

  for (const match of value.matchAll(INSTRUCTION_IMAGE)) {
    pushTextSteps(value.slice(cursor, match.index));
    const s3Key = match[2].trim();
    // A token with no key can never resolve to an image; dropping it keeps a
    // dead entry out of the list instead of rendering nothing in its place.
    if (s3Key) {
      steps.push({
        kind: "image",
        s3Key,
        alt: instructionAlt(match[1]),
      });
    }
    cursor = match.index + match[0].length;
  }
  pushTextSteps(value.slice(cursor));

  return steps;
}
