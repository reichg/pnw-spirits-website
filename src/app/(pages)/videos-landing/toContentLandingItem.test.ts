import { describe, expect, it } from "vitest";

import {
  toContentLandingItem,
  type LandingVideo,
} from "./toContentLandingItem";

// The adapter is the seam between the videos API shape and the domain-agnostic
// ContentLandingItem contract. It is pure and synchronous — and, unlike the
// blog and recipe adapters, takes no signed URL, because YouTube thumbnails are
// already absolute URLs — so it is tested directly rather than through the
// rendered page.

const VIDEO: LandingVideo = {
  id: "v1",
  url: "https://www.youtube.com/watch?v=v1",
  title: "Barrel Room Tour",
  thumbnail: "https://i.ytimg.com/vi/v1/hqdefault.jpg",
  publishedAt: "2026-01-02T12:00:00.000Z",
};

describe("toContentLandingItem", () => {
  it("maps a video onto the landing-item contract", () => {
    expect(toContentLandingItem(VIDEO)).toEqual({
      // Not stringified, unlike the blog and recipe adapters: a YouTube video id
      // is already a string on the wire.
      id: "v1",
      kicker: "Video",
      title: "Barrel Room Tour",
      meta: "January 2, 2026",
      media: { kind: "url", src: "https://i.ytimg.com/vi/v1/hqdefault.jpg" },
      link: { kind: "external", href: "https://www.youtube.com/watch?v=v1" },
      ariaLabel: "Watch video on YouTube: Barrel Room Tour",
    });
  });

  it("emits no excerpt, because the videos payload carries no description", () => {
    expect(toContentLandingItem(VIDEO).excerpt).toBeUndefined();
  });
});

describe("toContentLandingItem link", () => {
  it("declares video links external so the card opens YouTube in a new tab", () => {
    // Guards the discriminant, not just the href: the card derives target and
    // rel="noopener noreferrer" from `kind`, so an "internal" here would route
    // the click through next/link to a nonexistent internal path.
    expect(toContentLandingItem(VIDEO).link).toEqual({
      kind: "external",
      href: "https://www.youtube.com/watch?v=v1",
    });
  });

  it("names YouTube in the accessible name so the exit is known before activation", () => {
    // The card leaves the site. A screen-reader user must hear that from the
    // link's accessible name rather than discover it after following it.
    const ariaLabel = toContentLandingItem(VIDEO).ariaLabel;

    expect(ariaLabel).toBe("Watch video on YouTube: Barrel Room Tour");
    expect(ariaLabel).toContain("YouTube");
  });
});

describe("toContentLandingItem thumbnail media", () => {
  it("declares a snippet thumbnail as direct-URL media", () => {
    expect(toContentLandingItem(VIDEO).media).toEqual({
      kind: "url",
      src: "https://i.ytimg.com/vi/v1/hqdefault.jpg",
    });
  });

  it("falls back to s3 media when the thumbnail is empty", () => {
    // /api/videos substitutes "" when a snippet has no thumbnail of any size.
    // Passing that straight through as a `url` src is not a cosmetic problem:
    // next/image throws "Failed to parse src" on an empty string and fails the
    // whole server render. `s3` media with a null key renders nothing instead.
    const media = toContentLandingItem({ ...VIDEO, thumbnail: "" }).media;

    expect(media).toEqual({ kind: "s3", key: null });
    expect(media.kind).not.toBe("url");
  });

  it("falls back to s3 media when a payload omits the thumbnail entirely", () => {
    // /api/videos caches its mapped list in Redis as JSON and re-parses it, so a
    // stale or malformed entry can arrive without the field the type declares.
    // The guard is a truthiness check rather than `=== ""` precisely so this
    // takes the same branch — next/image throws on undefined too.
    const fromCache: LandingVideo = JSON.parse(
      JSON.stringify({ ...VIDEO, thumbnail: undefined }),
    );

    expect(toContentLandingItem(fromCache).media).toEqual({
      kind: "s3",
      key: null,
    });
  });
});

describe("toContentLandingItem published date", () => {
  it("formats the published date identically regardless of host timezone", () => {
    // The regression this file exists to prevent. 00:30 UTC on March 14 is
    // still March 13 in US Pacific, so a bare `toLocaleDateString()` — what
    // VideoGrid still calls — renders "3/13/2026" on a machine
    // set to that zone and "3/14/2026" on a UTC one. Pinning the formatter's
    // locale and timeZone is what makes this exact string assertable at all.
    const item = toContentLandingItem({
      ...VIDEO,
      publishedAt: "2026-03-14T00:30:00.000Z",
    });

    expect(item.meta).toBe("March 14, 2026");
  });

  it("formats the last instant of a UTC day without rolling into the next", () => {
    const item = toContentLandingItem({
      ...VIDEO,
      publishedAt: "2026-12-31T23:59:59.000Z",
    });

    expect(item.meta).toBe("December 31, 2026");
  });

  it("degrades to an empty meta line on an unparseable timestamp", () => {
    // Intl.DateTimeFormat.format throws a RangeError on an invalid date, which
    // would fail the render the same way an empty image src does. `meta` is
    // required by the contract, so the fallback is an empty line, not an
    // omitted field or an invented date.
    expect(toContentLandingItem({ ...VIDEO, publishedAt: "" }).meta).toBe("");
    expect(
      toContentLandingItem({ ...VIDEO, publishedAt: "not a date" }).meta,
    ).toBe("");
  });
});
