import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import Modal from "./Modal";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Modal's interactive behavior — portaling into document.body, the role="dialog"
// + aria-modal + aria-label panel, the "Close" button and backdrop-click calling
// onClose, "click inside the panel does not close", and the focus trap — only
// manifests after the mount useEffect flips `mounted` to true, which requires a
// React renderer that runs effects AND a DOM. This repo runs Vitest in the
// "node" environment with no jsdom/happy-dom and no @testing-library/react, and
// the work order forbids adding dependencies, so those paths are NOT executable
// here (documented as a coverage gap in the specialist report).
//
// The deterministically testable contract in the node environment is Modal's
// hydration-safety guarantee: until the mount effect runs (i.e. on the server
// and first client paint) it renders nothing, so it never touches the
// unavailable document.body during SSR. This holds whether open or closed.
//
// THE BACKDROP MOUSEDOWN CONTRACT IS IN THAT GAP, and it is named here rather
// than left implicit, because it is the one that was found broken in review and
// because the obvious regression test for it is the one that does not work:
//
//   A backdrop mousedown must preventDefault. The browser's focusing step would
//   otherwise move focus to <body> - outside the panel - taking the sequential-
//   navigation starting point with it. While the dialog is dismiss-locked that
//   silently opens the modal boundary; while it is not, it overwrites the
//   unmount cleanup's focus restore, because a discrete event flushes
//   synchronously and the focusing step runs after the dispatch.
//
//   TEST IT WITH SHIFT+TAB, NOT TAB. The click parks the starting point on the
//   backdrop, which is last in document order, so forward Tab stays inside the
//   dialog even when the boundary is wide open. A Tab-based test passes against
//   the broken code; only Shift+Tab walks out.
//
// Verifying it needs a real browser: the handler only exists after `mounted`
// flips, and focus order, preventDefault and the browser's focusing step are
// browser behaviour rather than this component's. It is measured by driving the
// live app, and the before/after tab-stop sequences are in the specialist
// report - not asserted here, so that nothing in this file can be mistaken for
// covering it.

describe("Modal (server-render / hydration-safety contract)", () => {
  it("renders nothing on the server when closed", () => {
    const html = renderToStaticMarkup(
      <Modal isOpen={false} onClose={() => {}} label="Session details">
        content
      </Modal>,
    );
    expect(html).toBe("");
  });

  it("renders nothing on the server when open (portal deferred until mount)", () => {
    // Proves the mount guard prevents createPortal(document.body) from running at
    // render time, which would otherwise throw during SSR.
    const html = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}} label="Session details">
        content
      </Modal>,
    );
    expect(html).toBe("");
  });

  it("does not leak its children, label, or close affordance into server markup", () => {
    const html = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}} label="Enlarged class photo">
        <p>secret body</p>
      </Modal>,
    );
    expect(html).not.toContain("secret body");
    expect(html).not.toContain("Enlarged class photo");
    expect(html).not.toContain("Close");
  });
});
