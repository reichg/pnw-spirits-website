/**
 * Capture page screenshots from the local dev server for design review.
 *
 * Usage:
 *   pnpm screenshot                                     default routes, desktop + mobile
 *   pnpm screenshot / /classes                          specific routes
 *   pnpm screenshot / --viewport 1024x768               one custom size
 *   pnpm screenshot / --viewport 1440x900,320x640       several sizes
 *   pnpm screenshot / --base-url http://localhost:3001
 *   pnpm screenshot / --out .screenshots/before         compare before/after
 *   pnpm screenshot / --viewport-only                   above-the-fold only
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

/**
 * Public pages the design work targets; admin routes are auth-gated and excluded.
 * Each archive follows its landing page so the pair sorts together in the output
 * directory, where the review loop compares a landing page against its archive.
 */
const DEFAULT_ROUTES = [
  "/",
  "/about",
  "/classes",
  "/contact",
  "/recipes-landing",
  "/recipes",
  "/blogs-landing",
  "/blogs",
  "/videos-landing",
  "/videos",
];

/** The two sizes this project designs against. */
const DEFAULT_VIEWPORTS = ["1440x900", "390x844"];

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_OUT_DIR = ".screenshots";

/** Below this width Chromium is emulated as a touch device, not a narrow desktop. */
const MOBILE_MAX_WIDTH = 768;

const PROBE_TIMEOUT_MS = 5_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_MS = 300;

const USAGE = `
Capture page screenshots from the local dev server.

  pnpm screenshot [routes...] [options]

Routes take an optional leading slash ("/classes" or "classes"). Prefer the
slashless form in Git Bash, which rewrites a leading "/" into a Windows path.

Options:
  --viewport <WxH>   Repeatable or comma-separated. Default: ${DEFAULT_VIEWPORTS.join(", ")}
  --base-url <url>   Default: ${DEFAULT_BASE_URL}
  --out <dir>        Default: ${DEFAULT_OUT_DIR}
  --viewport-only    Capture the visible viewport instead of the full page
  --help, -h         Show this message

Default routes: ${DEFAULT_ROUTES.join(" ")}
`;

/** Print a human-readable error and exit; never surface a raw Playwright stack. */
function fail(headline, ...details) {
  console.error(`\nscreenshot: ${headline}`);
  for (const detail of details) console.error(`  ${detail}`);
  console.error("");
  process.exit(1);
}

function parseViewport(value) {
  const match = /^(\d{2,5})\s*[x\u00d7]\s*(\d{2,5})$/i.exec(value.trim());
  if (!match) {
    fail(
      `Invalid viewport "${value}".`,
      "Expected WIDTHxHEIGHT, for example 1440x900.",
    );
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function normalizeRoute(route) {
  return route.startsWith("/") ? route : `/${route}`;
}

function routeSlug(route) {
  const slug = route
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
  return slug || "home";
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      viewport: { type: "string", multiple: true },
      "base-url": { type: "string" },
      out: { type: "string" },
      "viewport-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
} catch (error) {
  fail(error.message, "Run `pnpm screenshot --help` for usage.");
}

if (args.values.help) {
  console.log(USAGE);
  process.exit(0);
}

const routes = (
  args.positionals.length > 0 ? args.positionals : DEFAULT_ROUTES
).map(normalizeRoute);
const viewports = (args.values.viewport ?? DEFAULT_VIEWPORTS)
  .flatMap((value) => value.split(","))
  .filter((value) => value.trim() !== "")
  .map(parseViewport);
const baseUrl = (args.values["base-url"] ?? DEFAULT_BASE_URL).replace(
  /\/+$/,
  "",
);
const outDir = path.resolve(args.values.out ?? DEFAULT_OUT_DIR);
const fullPage = !args.values["viewport-only"];

// Probe before launching a browser so a stopped dev server fails fast and clearly.
try {
  await fetch(baseUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
} catch {
  fail(
    `Cannot reach a dev server at ${baseUrl}`,
    "Start one in another terminal:  pnpm dev",
    "Or target another origin:       pnpm screenshot --base-url http://localhost:3001",
  );
}

await mkdir(outDir, { recursive: true });

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  fail(
    "Could not launch Chromium.",
    "Install the browser once with:  pnpm exec playwright install chromium",
    `Playwright said: ${error.message.split("\n")[0]}`,
  );
}

console.log(
  `Capturing ${routes.length} route(s) at ${viewports.length} viewport(s) from ${baseUrl}`,
);

let failures = 0;

for (const viewport of viewports) {
  const isMobile = viewport.width < MOBILE_MAX_WIDTH;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: "reduce",
  });

  for (const route of routes) {
    const label = `${routeSlug(route)}-${viewport.width}x${viewport.height}`;
    const file = path.join(outDir, `${label}.png`);
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: "load",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({ path: file, fullPage });

      const status = response?.status() ?? 0;
      const note = status >= 400 ? `  (HTTP ${status} - check the route)` : "";
      console.log(`  ${label}.png${note}`);
    } catch (error) {
      failures += 1;
      console.error(`  ${label} FAILED: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
}

await browser.close();

console.log(`\nSaved to ${outDir}`);
if (failures > 0) {
  fail(`${failures} capture(s) failed.`);
}
