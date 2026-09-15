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
 *   pnpm screenshot --admin                             the auth-gated admin set
 *
 * Admin routes
 * ------------
 * Every /admin route except /admin/login sits behind `AdminAuthGate`, which is
 * a *client-side* gate: `AdminTokenProvider` reads a JWT out of localStorage
 * under "adminToken", and without a valid one the page renders its
 * "Checking access…" panel and then redirects to /admin/login. An
 * unauthenticated capture is therefore a screenshot of a spinner, which is why
 * these routes were excluded from this script until it learned to carry a
 * token.
 *
 * Pass one with --admin-token, or - better - through SCREENSHOT_ADMIN_TOKEN,
 * which keeps an admin-scoped bearer credential out of shell history and out of
 * process listings. The flag wins when both are set. Mint one from the running
 * dev server:
 *
 *   Git Bash (read -rs keeps the password out of history too)
 *     read -rs ADMIN_PASSWORD
 *     export SCREENSHOT_ADMIN_TOKEN=$(curl -s http://localhost:3000/api/admin \
 *       -H 'Content-Type: application/json' \
 *       -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" \
 *       | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
 *     pnpm screenshot --admin
 *
 *   PowerShell
 *     $body = '{"username":"admin","password":"<password>"}'
 *     $env:SCREENSHOT_ADMIN_TOKEN = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/admin -ContentType application/json -Body $body).token
 *     pnpm screenshot --admin
 *
 * A failed login makes that pipeline export the string "undefined" rather than
 * a token; the pre-flight check below catches that and says so, so a bad
 * credential surfaces as a message instead of ten screenshots of the gate.
 *
 * Two things this script deliberately does not do:
 *
 *   - It never prints the token, or any substring of it, on any stream. The
 *     token is a bearer credential with admin scope, and the reasoning is the
 *     same one docs/decision-log.md records for presigned S3 URLs: a value that
 *     authenticates by itself must not be echoed, not even inside an error
 *     message the script did not compose. No output path interpolates the
 *     token, and every error path - ours and Playwright's and parseArgs' -
 *     is filtered through scrub() before it reaches a stream.
 *   - It never verifies the token's signature. It has no access to JWT_SECRET
 *     and does not need it: the server is the thing that verifies, and the
 *     browser gate only decodes. The pre-flight check here is structural
 *     (three base64url segments, a numeric `exp` still in the future), which is
 *     exactly what `isTokenValid()` in AdminTokenContext.tsx asks of it.
 *
 * Because that gate is client-side only, a structurally valid token clears it
 * even if the server would reject the same token. What renders behind it is
 * then a mixture: whatever a public read serves still fills the page, while
 * anything the server actually authorizes fails. So a captured admin page is
 * evidence about layout, not about authorization - and if one screenshots as
 * an empty state, suspect a stale token before suspecting the design.
 */

import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

/**
 * Public pages the design work targets. Each archive follows its landing page
 * so the pair sorts together in the output directory, where the review loop
 * compares a landing page against its archive.
 *
 * Admin routes are deliberately absent: the public loop runs far more often
 * than the admin one, and it must not start demanding a credential - or
 * spending capture time - on pages it is not reviewing. Ask for those with
 * --admin.
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

/**
 * The auth-gated admin set, selected by --admin. /admin/login belongs here even
 * though it needs no token: it is a designed page in its own right, and the one
 * admin route that renders without one.
 */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/blogs",
  "/admin/recipes",
  "/admin/classes",
  "/admin/newsletter",
  "/admin/login",
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

/** Must match AdminTokenContext.tsx and AdminAuthGate.tsx. */
const ADMIN_TOKEN_STORAGE_KEY = "adminToken";
const ADMIN_LOGIN_ROUTE = "/admin/login";
const ADMIN_GATE_TEXT = "Checking access";

const ADMIN_TOKEN_ENV_VAR = "SCREENSHOT_ADMIN_TOKEN";

/**
 * Budget for the gate to clear. Generous because the first admin route of a run
 * pays for the dev server's on-demand compile, and cheap because it is only
 * ever spent when something is actually wrong - a cleared gate resolves at once.
 */
const ADMIN_GATE_TIMEOUT_MS = 15_000;

const USAGE = `
Capture page screenshots from the local dev server.

  pnpm screenshot [routes...] [options]

Routes take an optional leading slash ("/classes" or "classes"). Prefer the
slashless form in Git Bash, which rewrites a leading "/" into a Windows path.

Options:
  --viewport <WxH>     Repeatable or comma-separated. Default: ${DEFAULT_VIEWPORTS.join(", ")}
  --base-url <url>     Default: ${DEFAULT_BASE_URL}
  --out <dir>          Default: ${DEFAULT_OUT_DIR}
  --viewport-only      Capture the visible viewport instead of the full page
  --admin              Capture the admin route set instead of the public one.
                       Cannot be combined with named routes
  --admin-token <jwt>  Admin JWT for /admin routes. Overrides ${ADMIN_TOKEN_ENV_VAR},
                       which is the preferred way to pass it
  --help, -h           Show this message

Default routes: ${DEFAULT_ROUTES.join(" ")}
Admin routes:   ${ADMIN_ROUTES.join(" ")}

Admin routes are gated in the browser: the page reads a JWT from localStorage
("${ADMIN_TOKEN_STORAGE_KEY}") and redirects to ${ADMIN_LOGIN_ROUTE} without one, so an
unauthenticated capture would only photograph the "${ADMIN_GATE_TEXT}…" panel.
Rather than hand you a directory of those, this script stops. ${ADMIN_LOGIN_ROUTE} is
the exception: it renders for anyone and needs no token.

Mint a token from the running dev server and pass it through the environment;
this script never prints it, and the environment keeps it out of shell history.
The password does not get the same protection in the one-liner below - see the
header of scripts/screenshot.mjs for a variant that prompts for it instead.

  Git Bash
    export ${ADMIN_TOKEN_ENV_VAR}=$(curl -s ${DEFAULT_BASE_URL}/api/admin \\
      -H 'Content-Type: application/json' \\
      -d '{"username":"admin","password":"<password>"}' \\
      | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
    pnpm screenshot --admin

  PowerShell
    $body = '{"username":"admin","password":"<password>"}'
    $env:${ADMIN_TOKEN_ENV_VAR} = (Invoke-RestMethod -Method Post -Uri ${DEFAULT_BASE_URL}/api/admin -ContentType application/json -Body $body).token
    pnpm screenshot --admin

--admin cannot be combined with named routes, but a named /admin route is seeded
with the token just the same:  pnpm screenshot admin/blogs admin/classes

The run stops before a browser is launched if a route needs a token and none was
given, or if the token is not a JWT, carries no numeric "exp", or has expired.
A route whose gate never clears fails that route and exits non-zero rather than
saving a picture of the gate. A token is only checked and seeded when the run
actually includes an /admin route, so a stale exported one cannot break an
unrelated public capture.
`;

/**
 * Resolved admin token. Declared before fail() so scrub() can reach it no
 * matter how early the script exits; it stays null until argv is parsed.
 */
let adminToken = null;

/** A JWT is three base64url segments, and the header almost always starts "eyJ". */
const JWT_SHAPED =
  /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;

/**
 * Strip anything token-shaped out of a message before it reaches a stream.
 *
 * The exact-value pass covers our own messages; the shape pass covers messages
 * we did not write. parseArgs, for one, quotes the offending argument back at
 * you - so a mistyped `--admin-tokn=eyJhb...` would otherwise print an admin
 * credential into the terminal (and into CI logs) by way of an error we merely
 * forwarded. Same rule as "never log a presigned S3 URL" in
 * docs/decision-log.md: a value that authenticates by itself never gets echoed,
 * including down a path that failed to parse it.
 */
function scrub(message) {
  const text = String(message);
  const withoutKnown = adminToken
    ? text.split(adminToken).join("<redacted>")
    : text;
  return withoutKnown.replace(JWT_SHAPED, "<redacted>");
}

/** Print a human-readable error and exit; never surface a raw Playwright stack. */
function fail(headline, ...details) {
  console.error(`\nscreenshot: ${scrub(headline)}`);
  for (const detail of details) console.error(`  ${scrub(detail)}`);
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

/** Compare routes without letting a trailing slash change the answer. */
function routePath(route) {
  return route.replace(/\/+$/, "") || "/";
}

function isAdminRoute(route) {
  const routeWithoutSlash = routePath(route);
  return (
    routeWithoutSlash === "/admin" || routeWithoutSlash.startsWith("/admin/")
  );
}

/** /admin/login renders for anyone; every other admin route needs a token. */
function requiresAdminToken(route) {
  return isAdminRoute(route) && routePath(route) !== ADMIN_LOGIN_ROUTE;
}

/**
 * Structural pre-flight on the token: enough to tell "you forgot to log in
 * again" from "the design is broken", without a JWT dependency and without the
 * signing secret. Mirrors `isTokenValid()` in AdminTokenContext.tsx, because
 * that function is what actually decides whether the gate opens - matching a
 * stricter rule here would reject tokens the app would have accepted.
 *
 * Returns { ok: true, expiresAt } or { ok: false, reason }. `reason` never
 * quotes the token.
 */
function inspectAdminToken(token) {
  const segments = token.split(".");
  if (
    segments.length !== 3 ||
    !segments.every((segment) => /^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return {
      ok: false,
      reason:
        "it is not a decodable JWT (expected three dot-separated base64url segments)",
    };
  }

  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    );
  } catch {
    return { ok: false, reason: "its payload segment is not base64url JSON" };
  }

  if (typeof payload?.exp !== "number") {
    return {
      ok: false,
      reason: "its payload carries no numeric `exp`, which the gate requires",
    };
  }

  const expiresAt = new Date(payload.exp * 1000);
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: `it expired at ${expiresAt.toISOString()}` };
  }

  return { ok: true, expiresAt };
}

/**
 * Wait for AdminAuthGate to hand the page over to the real admin UI.
 *
 * Admin pages are client-rendered behind that gate, so `waitUntil: "load"` can
 * fire while "Checking access…" is still the only thing painted. The gate's
 * panel is the honest signal that the wait is over - it is in the SSR markup
 * and is removed the moment the token is judged valid - so wait on it
 * disappearing rather than on a clock. A route where it never existed (the
 * login page) resolves immediately.
 *
 * The panel disappearing is necessary but not sufficient, because the gate has
 * two ways to clear: it hands over to the page, or it redirects to
 * /admin/login. Both remove the panel, and the second one would otherwise
 * produce a perfectly sharp screenshot of the login form filed under the name
 * of the route that was asked for. So the URL is checked too.
 */
async function waitForAdminGate(page, route) {
  try {
    await page
      .locator('[role="status"]', { hasText: ADMIN_GATE_TEXT })
      .first()
      .waitFor({ state: "detached", timeout: ADMIN_GATE_TIMEOUT_MS });
  } catch {
    throw new Error(
      `the auth gate never cleared - "${ADMIN_GATE_TEXT}…" was still on screen after ` +
        `${ADMIN_GATE_TIMEOUT_MS / 1000}s, so the page never accepted the seeded token`,
    );
  }

  const landedOn = routePath(new URL(page.url()).pathname);
  if (requiresAdminToken(route) && landedOn === ADMIN_LOGIN_ROUTE) {
    throw new Error(
      `the auth gate redirected to ${ADMIN_LOGIN_ROUTE}, so the seeded token was rejected by the page (expired mid-run?)`,
    );
  }
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
      admin: { type: "boolean", default: false },
      "admin-token": { type: "string" },
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

if (args.values.admin && args.positionals.length > 0) {
  fail(
    "--admin selects the whole admin route set, so it cannot be combined with named routes.",
    "Take the set:      pnpm screenshot --admin",
    "Or name routes:    pnpm screenshot admin/blogs admin/classes",
    "Either way the admin token is seeded for any /admin route in the run.",
  );
}

const selectedRoutes =
  args.positionals.length > 0
    ? args.positionals
    : args.values.admin
      ? ADMIN_ROUTES
      : DEFAULT_ROUTES;

const routes = selectedRoutes.map(normalizeRoute);
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

// The flag wins so a one-off capture can override an exported token, but the
// environment variable is the documented path: argv is visible in shell history
// and in process listings, and this token is admin-scoped.
adminToken =
  args.values["admin-token"]?.trim() ||
  process.env[ADMIN_TOKEN_ENV_VAR]?.trim() ||
  null;

const adminRoutes = routes.filter(isAdminRoute);
const gatedRoutes = routes.filter(requiresAdminToken);

if (gatedRoutes.length > 0 && !adminToken) {
  fail(
    `No admin token, but ${gatedRoutes.length} route(s) need one: ${gatedRoutes.join(" ")}`,
    `Every one of those would photograph the "${ADMIN_GATE_TEXT}…" gate instead of the page.`,
    `Set ${ADMIN_TOKEN_ENV_VAR} (preferred) or pass --admin-token <jwt>.`,
    "Run `pnpm screenshot --help` for a worked example of minting one.",
  );
}

// Validated only when it will actually be used, so a stale exported token never
// blocks an unrelated public capture.
if (adminToken && adminRoutes.length > 0) {
  const inspected = inspectAdminToken(adminToken);
  if (!inspected.ok) {
    fail(
      `The admin token was rejected before launching a browser: ${inspected.reason}.`,
      "The gate would have rejected it too, so the run would have produced gate screenshots.",
      `Mint a fresh one into ${ADMIN_TOKEN_ENV_VAR} - see \`pnpm screenshot --help\`.`,
    );
  }
  console.log(
    `Admin token accepted (structure and expiry only); expires ${inspected.expiresAt.toISOString()}`,
  );
}

const seedAdminToken = adminToken !== null && adminRoutes.length > 0;

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

  if (seedAdminToken) {
    // An init script, not a post-navigation page.evaluate: AdminTokenProvider
    // seeds its state from a lazy useState initialiser that reads localStorage
    // during the *first* render. By the time a page.evaluate could run, that
    // render has already happened with a null token and AdminAuthGate has
    // already started its redirect to /admin/login. addInitScript runs before
    // any page script on every navigation, which is the only point early
    // enough. (Playwright serialises the argument, so the token travels into
    // the browser without ever being interpolated into a string this process
    // might log.)
    await context.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // localStorage is origin-scoped and this runs on every page the
          // context opens, about:blank included, where access throws. Nothing
          // to do there: the real navigation gets its own run on the right
          // origin.
        }
      },
      [ADMIN_TOKEN_STORAGE_KEY, adminToken],
    );
  }

  for (const route of routes) {
    const label = `${routeSlug(route)}-${viewport.width}x${viewport.height}`;
    const file = path.join(outDir, `${label}.png`);
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: "load",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      if (isAdminRoute(route)) {
        await waitForAdminGate(page, route);
      }
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
      console.error(
        `  ${label} FAILED: ${scrub(error.message.split("\n")[0])}`,
      );
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
