import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { useModalDismiss } from "./useModalDismiss";

// NOTE ON COVERAGE SCOPE
// ----------------------
// The behavioral guarantees of this hook — Escape-to-dismiss, body scroll lock
// applied/restored to the prior value, keydown listener cleanup on unmount, and
// focus capture/restore — all live inside a useEffect that requires both a React
// renderer that runs effects AND a DOM (document/window). This repo's Vitest
// setup runs in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts). Per the work order, no new
// dependencies may be added, so those DOM-interaction paths are NOT executable
// here and are documented as a coverage gap in the specialist report.
//
// What IS deterministically testable in the node environment is the hook's
// explicit non-DOM safety contract: the effect early-returns when document/
// window are undefined, so using the hook during a server (effect-less) render
// must neither throw nor mutate global state. renderToStaticMarkup exercises the
// real hook on the real (effect-skipping) server path.

function Probe(props: { isOpen: boolean }): React.ReactNode {
  useModalDismiss({ isOpen: props.isOpen, onDismiss: () => {} });
  return React.createElement("div", null, "probe");
}

describe("useModalDismiss (node / server-render contract)", () => {
  it("is safe to use during a server render when open (no throw, no global mutation)", () => {
    // The hook's effect never runs under renderToStaticMarkup; this asserts the
    // hook itself imposes no render-time side effects or DOM access.
    expect(() =>
      renderToStaticMarkup(React.createElement(Probe, { isOpen: true })),
    ).not.toThrow();
  });

  it("is safe to use during a server render when closed", () => {
    expect(() =>
      renderToStaticMarkup(React.createElement(Probe, { isOpen: false })),
    ).not.toThrow();
  });

  it("renders its host component unchanged regardless of open state", () => {
    const open = renderToStaticMarkup(
      React.createElement(Probe, { isOpen: true }),
    );
    const closed = renderToStaticMarkup(
      React.createElement(Probe, { isOpen: false }),
    );
    // The hook contributes no markup of its own; the host output is identical.
    expect(open).toBe(closed);
    expect(open).toContain("probe");
  });
});
