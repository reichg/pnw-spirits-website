import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClassSessions, { type ClassSessionView } from "./ClassSessions";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This component has no client state, no effects and no portal any more: the
// session-details dialog was removed because it rendered the same three values
// the row already shows. So renderToStaticMarkup observes essentially the ENTIRE
// contract rather than just an initial frame, and the coverage caveat the
// previous version of this file carried no longer applies.
//
// Two assertions below are regression markers rather than ordinary expectations,
// and both pin an absence:
//   - no <button> anywhere. Each row used to be one, and the count was asserted
//     exactly; the rows are now plain markup, so the honest replacement is that
//     the component emits no control at all except the empty state's link.
//   - no role="dialog". Previously true only because the Modal started closed;
//     now permanently true because there is no Modal.
//
// Formatted times are intentionally NOT asserted because Intl formatting is
// timezone-dependent and would be flaky across machines/CI; the ISO `dateTime`
// attribute is asserted instead since it is timezone-independent. Class names
// are never asserted: under Vitest a CSS-module import is a Proxy that echoes
// any key back, so a class assertion proves nothing (see Pagination.test.tsx).

const SESSION: ClassSessionView = {
  id: 1,
  startTime: "2026-07-01T18:30:00.000Z",
  endTime: "2026-07-01T20:30:00.000Z",
  location: "The Rooftop Loft",
};

describe("ClassSessions", () => {
  it("states the absence and carries the alternative path inline when there are no sessions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [] }),
    );

    expect(html).toContain("No dates are on the calendar right now");
    // The path out is a link inside the sentence, not a second button: the page
    // has exactly one filled CTA and it closes the page.
    expect(html).toContain('href="/contact"');
    expect(html).toContain("tell us what you have in mind");
    expect(html).not.toContain("<button");

    // The composed empty-state treatment caps its measure on a child <span>, so
    // the sentence has to be wrapped in one or the 48ch cap never applies.
    expect(html).toContain("<span>");
  });

  it("renders one non-interactive row per session", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, {
        sessions: [SESSION, { ...SESSION, id: 2, location: null }],
      }),
    );

    const rowCount = (html.match(/<li/g) ?? []).length;
    expect(rowCount).toBe(2);
    expect(html).not.toContain("<button");
  });

  it("exposes the session start/end as machine-readable, timezone-independent times", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );

    expect(html).toContain('dateTime="2026-07-01T18:30:00.000Z"');
    expect(html).toContain('dateTime="2026-07-01T20:30:00.000Z"');
  });

  it("shows the location when present and omits the block entirely when it is null", () => {
    const withLocation = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );
    expect(withLocation).toContain("The Rooftop Loft");

    // `location` is nullable and the right-hand track simply resolves to zero
    // width; nothing is rendered in its place.
    const withoutLocation = renderToStaticMarkup(
      React.createElement(ClassSessions, {
        sessions: [{ ...SESSION, location: null }],
      }),
    );
    expect(withoutLocation).not.toContain("The Rooftop Loft");
  });

  it("renders a session with no end time as a single start time", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, {
        sessions: [{ ...SESSION, endTime: null }],
      }),
    );

    const timeCount = (html.match(/<time/g) ?? []).length;
    expect(timeCount).toBe(1);
    expect(html).toContain('dateTime="2026-07-01T18:30:00.000Z"');
  });

  it("emits no dialog, because the session-details modal was removed", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );

    expect(html).not.toContain('role="dialog"');
  });
});
