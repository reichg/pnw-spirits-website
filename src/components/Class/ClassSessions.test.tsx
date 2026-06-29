import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClassSessions, { type ClassSessionView } from "./ClassSessions";

// NOTE ON COVERAGE SCOPE
// ----------------------
// The full click-to-open / close-to-clear flow needs a renderer that runs
// effects + state and a DOM (the Modal portals into document.body). This repo's
// Vitest setup is the "node" environment with no jsdom/happy-dom and no
// @testing-library/react, and the work order forbids new dependencies. So the
// asserted contract here is the initial server render: the trigger affordances
// that OPEN the modal, the empty state, and the fact that the (initially closed)
// Modal contributes no dialog markup. Formatted times are intentionally NOT
// asserted because Intl formatting is timezone-dependent and would be flaky
// across machines/CI; the ISO `dateTime` attribute is asserted instead since it
// is timezone-independent.

const SESSION: ClassSessionView = {
  id: 1,
  startTime: "2026-07-01T18:30:00.000Z",
  endTime: "2026-07-01T20:30:00.000Z",
  location: "The Rooftop Loft",
};

describe("ClassSessions", () => {
  it("renders the empty-state copy and no trigger when there are no sessions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [] }),
    );

    expect(html).toContain(
      "No sessions are scheduled right now. Check back soon for new dates.",
    );
    expect(html).not.toContain("<button");
  });

  it("renders one trigger button per session that opens the details modal", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, {
        sessions: [SESSION, { ...SESSION, id: 2, location: null }],
      }),
    );

    // Each session card is a button (the affordance that sets the selected
    // session and opens the single Modal).
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(2);
  });

  it("exposes the session start/end as machine-readable, timezone-independent times", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );

    expect(html).toContain('dateTime="2026-07-01T18:30:00.000Z"');
    expect(html).toContain('dateTime="2026-07-01T20:30:00.000Z"');
  });

  it("shows the location when present", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );

    expect(html).toContain("The Rooftop Loft");
  });

  it("starts with the details modal closed (no dialog in the initial markup)", () => {
    // selected === null initially, so Modal is closed; combined with Modal's
    // mount-deferred portal this means no dialog markup is emitted up front.
    const html = renderToStaticMarkup(
      React.createElement(ClassSessions, { sessions: [SESSION] }),
    );

    expect(html).not.toContain('role="dialog"');
  });
});
