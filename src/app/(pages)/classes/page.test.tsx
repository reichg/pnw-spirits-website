import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Swiper is a client-only carousel whose ESM + CSS side-effect imports do not
// resolve under the node test environment; stub it with passthrough wrappers so
// PhotoAlbum's slides render inline. Its configuration is PhotoAlbum's own
// subject (PhotoAlbum.test.tsx records the props it is handed) and is not
// asserted here - this file only needs the album to render or not render.
vi.mock("swiper/react", () => ({
  Swiper: (props: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "swiper" }, props.children),
  SwiperSlide: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "slide" }, children),
}));
vi.mock("swiper/modules", () => ({ A11y: {}, Keyboard: {}, Pagination: {} }));
vi.mock("swiper/css", () => ({}));
vi.mock("swiper/css/pagination", () => ({}));

const { prismaMock, getS3ImageUrl, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    cocktailClass: { findFirst: vi.fn() },
    classSession: { findMany: vi.fn() },
    classPhoto: { findMany: vi.fn() },
  },
  getS3ImageUrl: vi.fn(),
  redisMock: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

// Mocked at the Prisma, S3 and Redis primitives rather than at
// getClassPageView, so the page's real resolution path - the upcoming-session
// scope, the cache read, the server-side signing, the null-on-failure guard -
// runs in every case below. Only the process boundaries are stubbed.
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/s3", () => ({ getS3ImageUrl, deleteS3Objects: vi.fn() }));
vi.mock("@/utils/redisClient", () => ({
  default: redisMock,
  invalidateClassCache: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import ClassesPage from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `ClassesPage` is an async server component taking no props, so it can be
// awaited directly and its returned element rendered with renderToStaticMarkup.
// No production code was changed or exported to make this testable.
//
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and
// no @testing-library/react (see vitest.config.ts). Everything this file asserts
// is server-rendered markup, so that costs it nothing: the page's own subject is
// which BLOCKS it composes and in what order, and all three - the schedule, the
// conditional album, the closing CTA - are plain SSR output. PhotoAlbum and
// ClassSessions own their internals in their own suites; this file asserts the
// page's wiring around them.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists - see the canonical note in Pagination.test.tsx.
// Blocks are located by their heading ids, their copy, and their position in
// the serialized markup instead.

const SINGLETON = {
  id: 1,
  title: "Cocktail Classes with PNW Spirits",
  description: "Two hours, four builds, one bar.",
};

/** Shaped like a real presigned URL, so signPhotoUrl accepts it as signed. */
function signedUrlFor(key: string): string {
  return `https://pnw-spirits.s3.us-west-1.amazonaws.com/${key}?X-Amz-Expires=3600&X-Amz-Signature=abc`;
}

const RAW_PHOTOS = [
  { id: 20, s3Key: "classes/a.jpg", caption: "Opening night" },
  { id: 21, s3Key: "classes/b.jpg", caption: null },
];

const SESSIONS = [
  {
    id: 1,
    classId: 1,
    startTime: new Date("2026-07-04T18:00:00.000Z"),
    endTime: new Date("2026-07-04T20:00:00.000Z"),
    location: "Tacoma",
  },
  {
    id: 2,
    classId: 1,
    startTime: new Date("2026-07-11T18:00:00.000Z"),
    endTime: null,
    location: null,
  },
];

/** Point the mocked primitives at one page state. */
function mockPage(state: {
  cocktailClass?: unknown;
  sessions?: unknown[];
  photos?: unknown[];
}): void {
  prismaMock.cocktailClass.findFirst.mockResolvedValue(
    state.cocktailClass === undefined ? SINGLETON : state.cocktailClass,
  );
  prismaMock.classSession.findMany.mockResolvedValue(state.sessions ?? []);
  prismaMock.classPhoto.findMany.mockResolvedValue(state.photos ?? []);
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await ClassesPage());
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/**
 * The page's own element tree, with React 19's hoisted resource hints removed.
 *
 * next/image's `priority` emits a <link rel="preload"> that React lifts to the
 * front of the serialized output. It belongs to the document head rather than
 * to the page tree, so it is stripped before any assertion about what element
 * the page opens with.
 */
function pageTree(html: string): string {
  return html.replace(/^(?:<link\b[^>]*>)+/, "");
}

/** Every `<a>` start tag in the markup. */
function anchorTags(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
}

/** PhotoAlbum's own defensive empty copy, which the page must never reach. */
const ALBUM_EMPTY_COPY =
  "Photos from past classes will appear here after our next session.";

const CTA_LABEL = "Hire The PNW Spirits";

beforeEach(() => {
  vi.clearAllMocks();
  // Uncached by default: the page signs live, which is the path that renders
  // real <img> tags and therefore the one worth exercising here.
  redisMock.get.mockResolvedValue(null);
  redisMock.set.mockResolvedValue("OK");
  redisMock.del.mockResolvedValue(1);
  getS3ImageUrl.mockImplementation(async (key: string) => signedUrlFor(key));
  mockPage({ sessions: SESSIONS, photos: RAW_PHOTOS });
});

describe("ClassesPage shell", () => {
  it("is a single <main> with no wrapper element above it", async () => {
    // The regression marker for the editorial-shell migration. <main> IS the
    // shell and carries the shared 1200px spine, so an element between it and
    // the blocks - the <div className={styles.page}> that used to wrap it -
    // cancels that spine for everything underneath. Opening AND closing the
    // document are both asserted: a wrapper shows up at one end or the other.
    const tree = pageTree(await renderPage());

    expect(tree.startsWith("<main")).toBe(true);
    expect(tree.endsWith("</main>")).toBe(true);
    expect(countTags(tree, "main")).toBe(1);
  });

  it("renders the admin-editable title as the page's only <h1>, under a static eyebrow", async () => {
    const html = await renderPage();

    expect(countTags(html, "h1")).toBe(1);
    expect(html).toContain(`>${SINGLETON.title}<`);
    expect(html).toContain("Two hours, four builds, one bar.");
    // Authored on the page, not read from the singleton, which carries no
    // kicker field of its own.
    expect(html).toContain(">Behind the Bar<");
  });

  it("falls back to a static title when no class page row exists", async () => {
    // The singleton is created by an admin; until then getClassPageView returns
    // class: null and the page must still render rather than 500.
    mockPage({ cocktailClass: null });

    const html = await renderPage();

    expect(countTags(html, "h1")).toBe(1);
    expect(html).toContain(">Cocktail Classes<");
    expect(html).toContain(">Behind the Bar<");
  });

  it("omits the intro paragraph when the singleton carries no description", async () => {
    mockPage({ cocktailClass: { ...SINGLETON, description: null } });

    const html = await renderPage();

    expect(html).toContain(`>${SINGLETON.title}<`);
    expect(html).not.toContain("Two hours, four builds, one bar.");
  });
});

describe("ClassesPage photo section guard", () => {
  // THE ASSERTIONS THIS FILE EXISTS FOR. The album section used to render
  // unconditionally, so an empty album spent a heading, a rule and a whole
  // section of vertical space on PhotoAlbum's empty copy - a paragraph
  // promising a future. The guard is the page's, not PhotoAlbum's; PhotoAlbum
  // keeps its own empty branch only as a defensive fallback, which is why the
  // absence of that copy below is the precise test for the guard.

  it("renders the album section when there are photos", async () => {
    const html = await renderPage();

    expect(html).toContain('id="album-heading"');
    expect(html).toContain(">From Past Classes<");
    expect(html).toContain('aria-labelledby="album-heading"');
    // One slide per photo: the page hands the whole set through untouched.
    expect(countOccurrences(html, 'data-testid="slide"')).toBe(
      RAW_PHOTOS.length,
    );
    expect(html).not.toContain(ALBUM_EMPTY_COPY);
  });

  it("omits the album section entirely when there are no photos", async () => {
    mockPage({ sessions: SESSIONS, photos: [] });

    const html = await renderPage();

    // No heading, no section bracket, and - the part only this guard can
    // deliver - no empty-state paragraph, because PhotoAlbum is never rendered.
    expect(html).not.toContain('id="album-heading"');
    expect(html).not.toContain("From Past Classes");
    expect(html).not.toContain(ALBUM_EMPTY_COPY);
    expect(html).not.toContain('data-testid="swiper"');
    // The schedule heading is the only <h2> left.
    expect(countTags(html, "h2")).toBe(1);
    expect(html).toContain('id="upcoming-heading"');
  });

  it("keeps the schedule section even when its list is empty", async () => {
    // The asymmetry with the album is deliberate: a missing schedule is the
    // answer the reader came for and has to be stated, while a missing gallery
    // is a non-event. A guard copied onto both sections would break this.
    mockPage({ sessions: [], photos: [] });

    const html = await renderPage();

    expect(html).toContain('id="upcoming-heading"');
    expect(html).toContain(">Upcoming Sessions<");
    expect(html).toContain("No dates are on the calendar right now");
    // And the empty schedule hands over the alternative path in the same
    // sentence, as an inline link rather than a second button.
    expect(html).toContain("tell us what you have in mind");
  });

  it("emits both section headings when the page is fully populated", async () => {
    const html = await renderPage();

    expect(countTags(html, "h2")).toBe(2);
    expect(html.indexOf("Upcoming Sessions")).toBeLessThan(
      html.indexOf("From Past Classes"),
    );
  });
});

describe("ClassesPage closing CTA", () => {
  it("links to /contact with the hire label", async () => {
    const html = await renderPage();

    expect(html).toContain('href="/contact"');
    expect(html).toContain(`>${CTA_LABEL}<`);
    // Exactly one hire CTA: it was moved, not duplicated.
    expect(countOccurrences(html, CTA_LABEL)).toBe(1);
  });

  it("closes the page rather than opening it", async () => {
    // It used to sit directly under the <h1>, above both sections, so a reader
    // was asked to act before being shown anything to act on. Position in the
    // serialized markup is the observable half of that move.
    const html = await renderPage();

    expect(html.indexOf(CTA_LABEL)).toBeGreaterThan(
      html.indexOf("Upcoming Sessions"),
    );
    expect(html.indexOf(CTA_LABEL)).toBeGreaterThan(
      html.indexOf("From Past Classes"),
    );
    // Last thing in the document, with only the closing tags after it.
    expect(html.slice(html.indexOf(CTA_LABEL))).not.toContain("<section");
  });

  it("is the page's only CTA when the schedule has dates", async () => {
    // ClassSessions adds a second /contact link, but only on its empty state.
    const html = await renderPage();

    expect(countOccurrences(html, 'href="/contact"')).toBe(1);
  });

  it("navigates in place and never off-site", async () => {
    // Asserted across every anchor rather than the CTA alone, so the schedule's
    // inline /contact link is held to the same rule. Scoped to <a> tags because
    // next/image's hoisted preload carries a `rel` of its own.
    const html = await renderPage();

    expect(anchorTags(html).length).toBeGreaterThan(0);
    for (const tag of anchorTags(html)) {
      expect(tag).not.toMatch(/\starget=/);
      expect(tag).not.toMatch(/\srel=/);
    }
  });
});

describe("ClassesPage session details", () => {
  it("renders the schedule as plain markup with no dialog", async () => {
    // The per-session Modal is gone: it re-stated the same three values the row
    // already showed. Nothing in the schedule is interactive any more, so with
    // the album omitted the page has no <button> at all.
    mockPage({ sessions: SESSIONS, photos: [] });

    const html = await renderPage();

    expect(html).not.toContain('role="dialog"');
    expect(countTags(html, "button")).toBe(0);
    // The rows themselves still render, one per session.
    expect(countTags(html, "li")).toBe(SESSIONS.length);
    expect(html).toContain("Tacoma");
  });

  it("still opens the lightbox from a photo, which is the one dialog left", async () => {
    const html = await renderPage();

    // One enlarge trigger per photo; the schedule contributes none.
    expect(countTags(html, "button")).toBe(RAW_PHOTOS.length);
    expect(html).toContain('aria-label="Enlarge photo: Opening night"');
    // Closed at first render.
    expect(html).not.toContain('role="dialog"');
  });
});

describe("ClassesPage photo resolution", () => {
  it("signs each photo server-side and emits a real <img>", async () => {
    const html = await renderPage();

    expect(getS3ImageUrl).toHaveBeenCalledTimes(RAW_PHOTOS.length);
    expect(countTags(html, "img")).toBe(RAW_PHOTOS.length);
    // Raw S3 keys never cross to the client; only the signed URL does, through
    // the optimizer.
    expect(html).toContain("/_next/image?url=");
    expect(html).not.toContain('"classes/a.jpg"');
  });

  it("renders the section, minus the broken tile, when signing fails", async () => {
    // getS3ImageUrl echoes the key back when the AWS env is missing, which the
    // service maps to url: null. The album section is still keyed off the photo
    // COUNT, so it renders - and must not take the page down with an unusable
    // image src.
    getS3ImageUrl.mockImplementation(async (key: string) => key);

    const html = await renderPage();

    expect(html).toContain(">From Past Classes<");
    expect(countTags(html, "img")).toBe(0);
    expect(countTags(html, "button")).toBe(0);
    expect(countOccurrences(html, 'aria-label="Photo unavailable"')).toBe(
      RAW_PHOTOS.length,
    );
  });
});
