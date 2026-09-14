import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminClassManager, {
  formatSessionLocation,
  formatSessionTime,
  isoToLocalInput,
  localInputToIso,
  sessionEditLabel,
} from "./AdminClassManager";
import { AdminTokenProvider } from "@/components/admin/AdminTokenContext";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (vitest.config.ts); adding one is a dependency change
// and out of scope. Most of what this file covers is the screen's PURE LAYER:
// the five helpers its contracts are spelled in. Each is exported for this file,
// and each export site says why.
//
// THIS NOTE USED TO SAY THE SCREEN "cannot be rendered here at all - it fetches
// on mount, holds a dozen pieces of state, and restores focus through real DOM
// reads". THAT WAS FALSE, and it is the third claim of its kind the review gate
// found in this suite (the other two were in useAdminFetch.test.ts and
// useAdminList.test.ts). Every reason it gave is a reason the screen cannot be
// DRIVEN, not a reason it cannot be rendered: effects do not run under
// renderToStaticMarkup, so the mount fetch never fires and the focus restore
// never reaches for a DOM. Wrapped in the exported `AdminTokenProvider` the
// component renders its first paint cleanly, and the block at the bottom of this
// file asserts it - including the loading state, which nothing covered before.
//
// WHAT IS STILL GENUINELY UNCOVERED, stated plainly rather than implied by
// silence: the post-delete focus-restore effect itself (successor / index clamp
// / empty album / empty session list), the reorder commit, and every network
// path. Those need a browser and are verified by driving the live screen; the
// measurements are in the specialist report.
//
// DATES ARE BUILT WITHOUT A ZONE SUFFIX ON PURPOSE. "2026-01-02T18:00:00" is
// parsed as LOCAL time, so "same day" means the same thing in every timezone
// this test might run in. A `Z` suffix would make the same-day/cross-day split
// depend on the machine's offset. For the same reason the locale-formatted
// output is never asserted as a literal: `formatSessionTime` passes `undefined`
// as the locale deliberately, so the assertions below compare against
// `toLocaleString` called the same way rather than against "Jan 2, 2026".

type Session = {
  id: number;
  startTime: string;
  endTime: string | null;
  location: string | null;
};

function session(over: Partial<Session> = {}): Session {
  return {
    id: 1,
    startTime: "2026-01-02T18:00:00",
    endTime: null,
    location: "Barrel Room",
    ...over,
  };
}

const asDate = (local: string) => new Date(local);
const medium = (d: Date) =>
  d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const clock = (d: Date) => d.toLocaleTimeString(undefined, { timeStyle: "short" });

describe("formatSessionTime", () => {
  it("renders a start-only session as one medium date and a short time", () => {
    expect(formatSessionTime(session())).toBe(medium(asDate("2026-01-02T18:00:00")));
  });

  it("drops the repeated date when the session ends on the day it started", () => {
    // THE DEFECT THIS REPLACED: `toLocaleString()`'s default produced
    // "1/2/2026, 6:00:00 PM - 1/2/2026, 8:00:00 PM" - seconds nobody set, a
    // date repeated, and a string long enough to be ellipsed out of a one-line
    // card title on a phone.
    const formatted = formatSessionTime(
      session({ endTime: "2026-01-02T20:00:00" }),
    );

    expect(formatted).toBe(
      `${medium(asDate("2026-01-02T18:00:00"))} – ${clock(asDate("2026-01-02T20:00:00"))}`,
    );
    // The date appears once, not twice: the end half is a bare clock time.
    expect(formatted).not.toContain("2026 –");
  });

  it("keeps the date on an end time that falls on another day", () => {
    const formatted = formatSessionTime(
      session({ startTime: "2026-01-02T22:00:00", endTime: "2026-01-03T01:00:00" }),
    );

    expect(formatted).toBe(
      `${medium(asDate("2026-01-02T22:00:00"))} – ${medium(asDate("2026-01-03T01:00:00"))}`,
    );
  });

  it("never renders seconds", () => {
    for (const end of [null, "2026-01-02T20:00:00", "2026-01-05T20:00:00"]) {
      expect(formatSessionTime(session({ endTime: end }))).not.toMatch(
        /:\d{2}:\d{2}/,
      );
    }
  });

  it("falls back to the raw start value rather than rendering 'Invalid Date'", () => {
    // `new Date("nonsense")` does not throw, and formatting an Invalid Date
    // yields the literal words "Invalid Date" - which would become a session's
    // title, and then the stem of its Edit control's accessible name.
    expect(formatSessionTime(session({ startTime: "nonsense" }))).toBe("nonsense");
    expect(formatSessionTime(session({ startTime: "" }))).toBe("");
  });

  it("ignores an unreadable end time instead of letting it poison the title", () => {
    const startOnly = medium(asDate("2026-01-02T18:00:00"));

    expect(formatSessionTime(session({ endTime: "nonsense" }))).toBe(startOnly);
    expect(formatSessionTime(session({ endTime: "" }))).toBe(startOnly);
  });
});

describe("formatSessionLocation", () => {
  it("returns the trimmed location when there is one", () => {
    expect(formatSessionLocation(session({ location: "Barrel Room" }))).toBe(
      "Barrel Room",
    );
    expect(formatSessionLocation(session({ location: "  Barrel Room  " }))).toBe(
      "Barrel Room",
    );
  });

  it("reports a missing location rather than omitting the row", () => {
    // A metadata column with gaps in it stops being a column the eye can run
    // down, and a session with no location is something the admin needs to see.
    // This is the branch an "omit empty values" tidy-up deletes without
    // noticing that the gap it leaves is the defect.
    for (const location of [null, "", "   ", "\t\n"]) {
      expect(formatSessionLocation(session({ location }))).toBe("Not set");
    }
  });
});

describe("sessionEditLabel — the name the focus restore searches for", () => {
  // WHY THIS IS A CONTRACT AND NOT AN IMPLEMENTATION DETAIL. After a confirmed
  // session delete, AdminClassManager restores focus to the successor row's
  // Edit control, and its only route there is
  // `findByAccessibleName(sessionListRef.current, sessionEditLabel(successor))`
  // - an exact string comparison against the rendered `aria-label`. AdminCard
  // exposes no id and no ref by design, so there is no other handle. Drift
  // between the two spellings is a focus restore that silently stops working:
  // no error, no warning, just a keyboard admin dropped on <body>.
  //
  // This is the same failure mode `photoGripLabel` is pinned against in
  // SortablePhotoCard.test.tsx. There the tile renders statically, so that test
  // can compare the function against real markup. Here the SESSION ROWS do not
  // exist on first paint - they arrive with the fetch, which no effect runs to
  // make - so the rendered aria-label is still out of reach even though the
  // screen itself renders. What is pinned instead is the composition: that the
  // label is the title plus one fixed prefix, which is what makes a reword of
  // `formatSessionTime` reach the lookup and the render together.

  const PREFIX = "Edit session: ";

  it("is the session's own title under a fixed prefix", () => {
    const s = session({ endTime: "2026-01-02T20:00:00" });

    expect(sessionEditLabel(s)).toBe(`${PREFIX}${formatSessionTime(s)}`);
  });

  it("never collapses to the bare prefix on any branch of the title", () => {
    // WHY THE TEST THAT USED TO SIT HERE IS GONE. It looped five inputs through
    // `expect(sessionEditLabel(s)).toBe(\`Edit session: ${formatSessionTime(s)}\`)`
    // - which is this function's entire body, restated. `sessionEditLabel` is a
    // single template literal with no branches of its own, so four of those five
    // iterations could not fail unless the first one did, and the first is the
    // test above. What looked like five cases was one assertion, and what looked
    // like branch coverage was `formatSessionTime`'s branches, which are already
    // covered on their own further up this file.
    //
    // What the fallbacks CAN do that is worth pinning is COLLAPSE. The restore
    // matches this string exactly, so a label that degraded to just the prefix
    // would give every session with an unreadable date the same name - the
    // collision the test below rules out for readable ones.
    for (const over of [
      {},
      { endTime: "2026-01-02T20:00:00" },
      { endTime: "2026-01-05T20:00:00" },
      { startTime: "nonsense" },
      { endTime: "nonsense" },
    ] satisfies Partial<Session>[]) {
      const label = sessionEditLabel(session(over));

      expect(label.startsWith(PREFIX), JSON.stringify(over)).toBe(true);
      expect(label, JSON.stringify(over)).not.toBe(PREFIX);
    }
  });

  it("gives two different sessions two different names", () => {
    // The restore finds a row BY this string, so two rows sharing one would
    // send focus to whichever came first - the wrong session, silently.
    const first = sessionEditLabel(session({ startTime: "2026-01-02T18:00:00" }));
    const second = sessionEditLabel(session({ startTime: "2026-01-03T18:00:00" }));

    expect(first).not.toBe(second);
  });

  it("is stable across calls for the same session", () => {
    // The render and the lookup happen at different moments, sometimes a
    // network round trip apart. A name that varied between them would never
    // match.
    const s = session();

    expect(sessionEditLabel(s)).toBe(sessionEditLabel(s));
  });
});

describe("isoToLocalInput / localInputToIso", () => {
  it("renders an ISO instant in the shape <input type='datetime-local'> requires", () => {
    // The browser rejects anything else outright and shows an empty field, so
    // the zero-padding here is what makes an existing session editable at all.
    expect(isoToLocalInput("2026-01-02T18:05:00")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
    expect(isoToLocalInput("2026-01-02T09:05:00")).toBe("2026-01-02T09:05");
  });

  it("returns an empty field rather than a broken one when there is no value", () => {
    for (const value of [null, undefined, "", "nonsense", "2026-13-45"]) {
      expect(isoToLocalInput(value)).toBe("");
    }
  });

  it("round-trips an instant back to the same minute", () => {
    // The half that is only ever wrong by an hour: a local/UTC slip here would
    // silently reschedule a class rather than fail. Seconds are dropped by the
    // input's format, so the minute is the resolution that must survive.
    const original = "2026-01-02T18:05:00";
    const restored = new Date(localInputToIso(isoToLocalInput(original)));

    expect(restored.getFullYear()).toBe(2026);
    expect(restored.getMonth()).toBe(0);
    expect(restored.getDate()).toBe(2);
    expect(restored.getHours()).toBe(18);
    expect(restored.getMinutes()).toBe(5);
    expect(restored.getSeconds()).toBe(0);
  });

  it("round-trips across a day boundary without moving the day", () => {
    for (const original of [
      "2026-01-02T00:00:00",
      "2026-01-02T23:59:00",
      "2026-12-31T23:59:00",
    ]) {
      const restored = new Date(localInputToIso(isoToLocalInput(original)));
      const expected = new Date(original);

      expect(restored.getDate()).toBe(expected.getDate());
      expect(restored.getHours()).toBe(expected.getHours());
      expect(restored.getMinutes()).toBe(expected.getMinutes());
    }
  });

  // RECORDED, NOT ENDORSED. `new Date("").toISOString()` throws a RangeError,
  // and `localInputToIso` has no guard, so a cleared datetime-local field
  // raises straight out of the submit handler with nothing in this file
  // catching it. The screen currently avoids it because the fields are
  // `required` and the browser blocks the submit - which means the protection
  // lives in the markup, not here, and would be gone the moment a caller
  // submitted programmatically or the attribute was dropped.
  //
  // This test asserts today's behaviour so the throw is visible and a future
  // change to it is deliberate rather than accidental. It is NOT an argument
  // that throwing is right; see the specialist report.
  it("throws on an unreadable input value, which nothing here guards", () => {
    expect(() => localInputToIso("")).toThrow(RangeError);
    expect(() => localInputToIso("nonsense")).toThrow(RangeError);
  });

  it("does not throw on the values the field actually produces", () => {
    expect(() => localInputToIso("2026-01-02T18:05")).not.toThrow();
    expect(localInputToIso("2026-01-02T18:05")).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

/**
 * The screen the note above once called unrenderable, rendered.
 *
 * One static render inside the real `AdminTokenProvider` reaches the frame an
 * admin sees before the mount fetch resolves. That frame has a defect available
 * to it that nothing else here would catch, and it is the same one
 * `useAdminList` guards with `loading: true`: a screen that opened in its EMPTY
 * state would tell every visitor there are no classes, on every visit, for as
 * long as the request takes - and then quietly replace it with the real list.
 */
describe("AdminClassManager — the frame before the first fetch resolves", () => {
  function firstPaint(): string {
    return renderToStaticMarkup(
      React.createElement(
        AdminTokenProvider,
        null,
        React.createElement(AdminClassManager),
      ),
    );
  }

  it("paints LOADING, not an empty collection", () => {
    const html = firstPaint();

    expect(html).toContain("Loading cocktail classes…");
    // The empty state must not be what an admin reads while the read is in
    // flight. These are the words the screen settles on when there genuinely is
    // nothing, and they must not appear yet.
    expect(html).not.toContain("No sessions");
    expect(html).not.toContain("No photos");
  });

  it("gives the screen its heading and landmark before any data arrives", () => {
    // The page title is static chrome, so it is available immediately - and a
    // screen-reader user landing mid-fetch should still be told where they are
    // rather than meeting an unnamed region.
    const html = firstPaint();

    expect(html).toMatch(/<main[^>]*>/);
    expect(html).toMatch(/<h1[^>]*>Classes<\/h1>/);
  });

  it("issues no request during render", () => {
    // The read is armed by an effect. A render that fetched would re-fetch on
    // every re-render of a screen that holds a dozen pieces of state.
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    firstPaint();

    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
