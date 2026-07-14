import { logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  invalidateBlogCache,
  invalidateClassCache,
  invalidateRecipeCache,
} from "@/utils/redisClient";

/**
 * Service layer for the demo/placeholder database seed.
 *
 * Holds all demo content and write logic (Standard C: business logic lives in
 * services/). The `prisma/seedDemo.ts` entrypoint stays thin and only wires up
 * process lifecycle. Writes are wrapped in a single transaction and are safe to
 * re-run: previously-seeded demo rows are identified by unmistakable sentinels
 * and removed before recreation, so re-runs never accumulate duplicates.
 */

const CONTEXT = "demoSeedService";

/**
 * Sentinels that unambiguously mark demo-seeded rows. Re-runs delete by these
 * first, then recreate, which is what makes the seed idempotent. Keep these
 * values distinctive so they can never collide with real production content.
 */
const DEMO_AUTHOR = "PNW Spirits Demo";
const DEMO_SUBSCRIBER_DOMAIN = "@demo.pnw-spirits.test";
const DEMO_CLASS_TITLE = "Craft Cocktail Fundamentals (Demo)";

/**
 * Sentinel `location` shared by every demo session. The /classes page is a
 * singleton, so demo sessions attach to the real class alongside any real
 * sessions; this distinctive location lets re-runs delete only demo sessions
 * and never touch real ones.
 */
const DEMO_SESSION_LOCATION = "The PNW Spirits Lab (Demo)";

/**
 * Dedicated demo namespace for class photo S3 keys. Stays within the app's
 * `class-media/` allowlist prefix but is distinctive enough that re-runs can
 * delete only demo photos (by this prefix) without disturbing real photos.
 */
const DEMO_PHOTO_PREFIX = "class-media/demo/";

interface DemoComment {
  name: string;
  comment: string;
}

interface DemoReaction {
  type: string;
  count: number;
}

interface DemoBlog {
  title: string;
  content: string;
  comments: DemoComment[];
  reactions: DemoReaction[];
}

interface DemoRecipe {
  title: string;
  description: string;
  /** Newline-separated; the recipe page splits this into a list. */
  ingredients: string;
  /** Newline-separated numbered steps; the recipe page splits on newlines. */
  instructions: string;
}

interface DemoSubscriber {
  firstName: string;
  lastName: string;
  /** Combined with DEMO_SUBSCRIBER_DOMAIN to form the sentinel email. */
  localPart: string;
}

interface DemoSession {
  daysFromNow: number;
  startHour: number;
  /** When set, an endTime is derived; otherwise endTime stays null. */
  durationHours?: number;
}

interface DemoPhoto {
  fileName: string;
  caption: string;
  sortOrder: number;
}

const DEMO_BLOGS: readonly DemoBlog[] = [
  {
    title: "Distilling the Pacific Northwest: A Sense of Place",
    content:
      "From Douglas-fir tips to marionberries, the PNW gives distillers a pantry unlike anywhere else. In this post we walk through how local botanicals shape the spirits pouring in tasting rooms from Portland to Bellingham.",
    comments: [
      {
        name: "Harper Lane",
        comment: "The fir-tip gin at your last tasting was unreal.",
      },
      { name: "Marcus Bell", comment: "Would love a map of local distilleries!" },
    ],
    reactions: [
      { type: "like", count: 24 },
      { type: "love", count: 11 },
    ],
  },
  {
    title: "Barrel-Aging in a Wet Climate: What the Damp Does",
    content:
      "Humidity changes everything about how a spirit matures. We sat down with a Woodinville cooper to talk angel's share, char levels, and why Northwest whiskey tastes rounder younger.",
    comments: [
      {
        name: "Priya Nair",
        comment: "Fascinating - never thought about humidity's role.",
      },
    ],
    reactions: [
      { type: "like", count: 18 },
      { type: "love", count: 7 },
    ],
  },
  {
    title: "Foraged Botanicals: A Responsible Harvest Guide",
    content:
      "Wild spruce, nettle, and rose hip make gorgeous infusions, but overharvesting hurts fragile ecosystems. Here is how we source responsibly and keep the forest floor thriving.",
    comments: [
      { name: "Dana Ruiz", comment: "Thank you for stressing sustainability." },
      { name: "Owen Fields", comment: "Nettle spirit sounds incredible." },
      {
        name: "Sasha Kim",
        comment: "Any tips for first-time foragers near Seattle?",
      },
    ],
    reactions: [
      { type: "like", count: 31 },
      { type: "love", count: 15 },
    ],
  },
  {
    title: "The Rise of Northwest Amaro",
    content:
      "Bittersweet, herbaceous, and deeply local: Northwest amaro is having a moment. We taste through five bottles built on regional roots and barks and explain how to use them behind your home bar.",
    comments: [
      { name: "Lena Voss", comment: "Added three of these to my cart already." },
    ],
    reactions: [
      { type: "like", count: 12 },
      { type: "love", count: 5 },
    ],
  },
  {
    title: "Cocktails for a Gray Day: Warming the Drizzle Away",
    content:
      "When the marine layer settles in, we reach for richer, warmer drinks. This roundup covers spiced toddies, barrel-aged Manhattans, and a smoky riff on the hot buttered rum.",
    comments: [
      { name: "Theo Marsh", comment: "The toddy recipe saved my rainy weekend." },
      { name: "Ivy Chen", comment: "More cold-weather drinks please!" },
    ],
    reactions: [
      { type: "like", count: 27 },
      { type: "love", count: 9 },
    ],
  },
];

const DEMO_RECIPES: readonly DemoRecipe[] = [
  {
    title: "Douglas-Fir Gin Fizz",
    description:
      "A bright, piney fizz that tastes like a walk through an old-growth forest after rain.",
    ingredients: [
      "2 oz Douglas-fir gin",
      "0.75 oz fresh lemon juice",
      "0.5 oz simple syrup",
      "1 egg white",
      "2 oz chilled soda water",
      "Fir tip, for garnish",
    ].join("\n"),
    instructions: [
      "1. Add gin, lemon, simple syrup, and egg white to a shaker.",
      "2. Dry shake hard for 15 seconds without ice.",
      "3. Add ice and shake again until well chilled.",
      "4. Strain into a chilled glass and top with soda water.",
      "5. Garnish with a fir tip and serve immediately.",
    ].join("\n"),
  },
  {
    title: "Marionberry Bramble",
    description:
      "Summer in a glass: tart Oregon marionberries tumbling over crushed ice.",
    ingredients: [
      "2 oz gin",
      "1 oz fresh lemon juice",
      "0.5 oz simple syrup",
      "0.5 oz marionberry liqueur",
      "Fresh marionberries, for garnish",
    ].join("\n"),
    instructions: [
      "1. Shake gin, lemon, and simple syrup with ice.",
      "2. Strain over a glass packed with crushed ice.",
      "3. Drizzle marionberry liqueur over the top.",
      "4. Garnish with fresh berries and a short straw.",
    ].join("\n"),
  },
  {
    title: "Woodinville Rye Manhattan",
    description:
      "A rounder, rain-country take on the classic, built on local barrel-aged rye.",
    ingredients: [
      "2 oz Woodinville rye whiskey",
      "1 oz sweet vermouth",
      "2 dashes aromatic bitters",
      "Brandied cherry, for garnish",
    ].join("\n"),
    instructions: [
      "1. Stir rye, vermouth, and bitters with ice for 30 seconds.",
      "2. Strain into a chilled coupe.",
      "3. Garnish with a brandied cherry.",
    ].join("\n"),
  },
  {
    title: "Nettle & Honey Collins",
    description:
      "Grassy foraged nettle syrup lengthened with gin and sparkling water.",
    ingredients: [
      "2 oz gin",
      "0.75 oz nettle-honey syrup",
      "0.75 oz fresh lemon juice",
      "Soda water, to top",
      "Lemon wheel, for garnish",
    ].join("\n"),
    instructions: [
      "1. Shake gin, nettle-honey syrup, and lemon with ice.",
      "2. Strain into a tall glass over fresh ice.",
      "3. Top with soda water and stir gently.",
      "4. Garnish with a lemon wheel.",
    ].join("\n"),
  },
  {
    title: "Smoked Cedar Old Fashioned",
    description:
      "A slow-sipping old fashioned finished with a wisp of Northwest cedar smoke.",
    ingredients: [
      "2 oz bourbon",
      "0.25 oz maple syrup",
      "2 dashes orange bitters",
      "Orange peel, for garnish",
      "Cedar smoke, to finish",
    ].join("\n"),
    instructions: [
      "1. Stir bourbon, maple syrup, and bitters with ice.",
      "2. Strain over a large cube in a rocks glass.",
      "3. Capture cedar smoke under an inverted glass for 10 seconds.",
      "4. Express an orange peel over the top and drop it in.",
    ].join("\n"),
  },
];

const DEMO_SUBSCRIBERS: readonly DemoSubscriber[] = [
  { firstName: "Avery", lastName: "Sinclair", localPart: "avery.sinclair" },
  { firstName: "Rowan", lastName: "Beck", localPart: "rowan.beck" },
  { firstName: "Camila", lastName: "Ortiz", localPart: "camila.ortiz" },
  { firstName: "Devon", lastName: "Park", localPart: "devon.park" },
  { firstName: "Noor", lastName: "Haddad", localPart: "noor.haddad" },
];

const DEMO_CLASS_DESCRIPTION =
  "A hands-on evening covering balance, dilution, and technique using Pacific Northwest spirits. Leave able to build three cocktails with confidence.";

const DEMO_CLASS_SESSIONS: readonly DemoSession[] = [
  { daysFromNow: 7, startHour: 18, durationHours: 2 },
  { daysFromNow: 14, startHour: 18, durationHours: 2 },
  { daysFromNow: 21, startHour: 17 },
];

const DEMO_CLASS_PHOTOS: readonly DemoPhoto[] = [
  {
    fileName: "demo-1.jpg",
    caption: "Guests building a Douglas-Fir Gin Fizz.",
    sortOrder: 0,
  },
  {
    fileName: "demo-2.jpg",
    caption: "Fresh marionberries prepped for the bramble station.",
    sortOrder: 1,
  },
  {
    fileName: "demo-3.jpg",
    caption: "Stirring down a Woodinville rye Manhattan.",
    sortOrder: 2,
  },
];

/**
 * Build a Date offset from "now" at a fixed local hour. Seeds are scripts, not
 * the workflow engine, so runtime `new Date()` is acceptable here and keeps demo
 * sessions perpetually in the near future no matter when the seed runs.
 */
function futureDate(daysFromNow: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * Flush the app's Redis read caches after a seed. The seed writes rows directly
 * via Prisma and bypasses the service layer that normally invalidates these
 * caches, so without this the /classes, /blogs, and /recipes pages keep serving
 * stale (or empty) cached payloads until their TTLs expire. Best-effort and
 * fail-open: the DB writes are the source of truth, so a Redis outage logs a
 * warning and is swallowed rather than failing an otherwise-successful seed
 * (mirrors classService's fail-open Redis usage).
 */
async function invalidateSeededCaches(): Promise<void> {
  try {
    await Promise.all([
      invalidateClassCache(),
      invalidateBlogCache(),
      invalidateRecipeCache(),
    ]);
  } catch (error) {
    logger.warn("Demo seed cache invalidation failed; seed data is still written", {
      context: CONTEXT,
      data: { error: (error as Error).message },
    });
  }
}

/**
 * Refuse to run against production. Demo/placeholder data must never land in a
 * production database, so callers should invoke this before any writes.
 */
export function assertNotProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Demo seed refused: NODE_ENV is 'production'. Demo data must never be seeded into production.",
    );
  }
}

/**
 * Idempotently seed demo/placeholder content. Deletes prior demo rows by their
 * sentinels (Blog/CocktailRecipe author, Subscriber email domain) and recreates
 * everything inside one transaction, so repeated runs converge to the same state
 * with no duplicates. Comment/Reaction rows cascade from their parent deletes
 * and are recreated fresh.
 *
 * Classes are special: the /classes page is a singleton, so demo sessions and
 * photos ATTACH to the existing singleton class (its title/description are left
 * untouched) rather than creating a second class that would never render. Demo
 * sessions/photos are re-seeded by their own sentinels (session location, photo
 * key prefix) so real sessions/photos are never touched. On a fresh DB with no
 * class yet, the demo class is created so the page has content. The User table
 * is intentionally left untouched (the default admin is owned by the production
 * seed).
 */
export async function seedDemoData(): Promise<void> {
  assertNotProduction();

  const classId = await prisma.$transaction(async (tx) => {
    // Sentinel-delete first so re-runs are idempotent. Blog deletes cascade to
    // their child rows (comments/reactions). The demo class is cleaned up later,
    // just before the singleton is resolved.
    await tx.blog.deleteMany({ where: { author: DEMO_AUTHOR } });
    await tx.cocktailRecipe.deleteMany({ where: { author: DEMO_AUTHOR } });
    await tx.subscriber.deleteMany({
      where: { email: { endsWith: DEMO_SUBSCRIBER_DOMAIN } },
    });

    for (const blog of DEMO_BLOGS) {
      await tx.blog.create({
        data: {
          title: blog.title,
          content: blog.content,
          author: DEMO_AUTHOR,
          // Text-only demo: no external image URLs (the app allowlists only two
          // image hosts), so cover stays null and renders without a photo.
          coverPhoto: null,
          comments: { create: blog.comments },
          reactions: { create: blog.reactions },
        },
      });
    }

    await tx.cocktailRecipe.createMany({
      data: DEMO_RECIPES.map((recipe) => ({
        title: recipe.title,
        description: recipe.description,
        author: DEMO_AUTHOR,
        coverPhoto: null,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      })),
    });

    await tx.subscriber.createMany({
      data: DEMO_SUBSCRIBERS.map((subscriber) => ({
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        email: `${subscriber.localPart}${DEMO_SUBSCRIBER_DOMAIN}`,
      })),
    });

    // Clean up any standalone demo class from earlier buggy runs that created a
    // second class. Cascades its sessions/photos.
    await tx.cocktailClass.deleteMany({ where: { title: DEMO_CLASS_TITLE } });

    // The /classes page is a SINGLETON (renders only the lowest-id class), so a
    // second demo class would never be shown. Attach demo sessions/photos to the
    // existing singleton instead, leaving its title/description untouched. On a
    // fresh DB with no class yet, create the demo class so /classes has content.
    const singleton = await tx.cocktailClass.findFirst({
      orderBy: { id: "asc" },
      select: { id: true },
    });
    const classId =
      singleton?.id ??
      (
        await tx.cocktailClass.create({
          data: {
            title: DEMO_CLASS_TITLE,
            description: DEMO_CLASS_DESCRIPTION,
          },
          select: { id: true },
        })
      ).id;

    // Sentinel-scoped re-seed: delete only demo sessions (by their sentinel
    // location) so real sessions on the singleton are never touched, then
    // recreate. Keeps re-runs idempotent without duplicating.
    await tx.classSession.deleteMany({
      where: { classId, location: DEMO_SESSION_LOCATION },
    });
    await tx.classSession.createMany({
      data: DEMO_CLASS_SESSIONS.map((session) => ({
        classId,
        startTime: futureDate(session.daysFromNow, session.startHour),
        endTime:
          session.durationHours === undefined
            ? null
            : futureDate(
                session.daysFromNow,
                session.startHour + session.durationHours,
              ),
        location: DEMO_SESSION_LOCATION,
      })),
    });

    // Sentinel-scoped re-seed: delete only demo photos (by the demo key prefix)
    // so real photos are never touched, then recreate. Keyed under
    // class-media/demo/; images render blank in-app because there is no real S3
    // object and classService nulls non-signable keys. The rows exist so
    // table/caption data is present.
    await tx.classPhoto.deleteMany({
      where: { classId, s3Key: { startsWith: DEMO_PHOTO_PREFIX } },
    });
    await tx.classPhoto.createMany({
      data: DEMO_CLASS_PHOTOS.map((photo) => ({
        classId,
        s3Key: `${DEMO_PHOTO_PREFIX}${photo.fileName}`,
        caption: photo.caption,
        sortOrder: photo.sortOrder,
      })),
    });

    return classId;
  });

  // Writes committed: flush the caches the service layer would normally clear.
  await invalidateSeededCaches();

  logger.info("Demo data seeded", {
    context: CONTEXT,
    data: {
      blogs: DEMO_BLOGS.length,
      recipes: DEMO_RECIPES.length,
      subscribers: DEMO_SUBSCRIBERS.length,
      classId,
      demoSessions: DEMO_CLASS_SESSIONS.length,
      demoPhotos: DEMO_CLASS_PHOTOS.length,
    },
  });
}
