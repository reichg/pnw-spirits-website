import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminNewsletterComposer, {
  describeResult,
  joinDetailMessages,
  NewsletterPreview,
  resultTone,
} from "./AdminNewsletterComposer";
import { AdminTokenProvider } from "@/components/admin/AdminTokenContext";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (vitest.config.ts); adding one is a dependency change
// and out of scope. So this file asserts the INITIAL server render only, via
// renderToStaticMarkup, and that boundary is unusually consequential here
// because the composer is almost entirely state-driven. Stated plainly:
//
// WHAT IS REACHABLE. The document ORDER of the three blocks, which is the whole
// SC 1.3.2 fix and is structural rather than stateful; the empty-form state of
// both send controls; the preview's accessible name; and which control is the
// form's submit. Effects do not run, so the localStorage draft never seeds and
// `subject`/`html` stay "" - which is exactly the empty-composer state asserted
// below, not a distortion of it.
//
// THE PREVIEW IS NO LONGER ON THAT BOUNDARY. This note used to list "everything
// behind `html` being non-empty - the <iframe> branch, the filled-plate class"
// as unreachable, on the grounds that `useState` cannot be driven from outside
// the component without a DOM. That was true of the component as it was written
// and it was a SHAPE problem, not an environment one: the same move this file
// already made for `resultTone` and `describeResult` applies to markup. The
// preview section is now `NewsletterPreview({ html })`, a pure function of its
// prop, so both of its branches render on demand and the sandbox that protects
// the bearer token is asserted against real markup instead of grepped out of
// this file's source text.
//
// WHAT IS NOT REACHABLE, AND IS THEREFORE NOT FAKED HERE.
//
//   * The preview updating as the admin TYPES - that is still `useState` behind
//     a real DOM event. What is covered is that each input maps to the right
//     output, which is the half with the security consequence.
//   * The RENDERED result block and error line. `resultTone`,
//     `describeResult` and `joinDetailMessages` are now exported and are
//     covered directly at the bottom of this file, but only as functions: the
//     markup they feed still renders only after a fetch resolves into state, so
//     what is pinned is the decision, not its presentation.
//   * The confirmation dialog. `AdminConfirmDialog` renders through `Modal`,
//     which returns null on the server snapshot and then portals into
//     document.body, so it contributes no markup in EITHER state. An assertion
//     that it is absent while closed would therefore pass just as happily when
//     it is open, which is worse than no test - so it is not written. Its own
//     contract is covered in AdminConfirmDialog.test.tsx by walking the element
//     tree instead.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists anyway - see the canonical note in
// Pagination.test.tsx.
// Elements are located by tag, visible text and ARIA attributes.

// useAdminFetch reads AdminTokenContext and throws without a provider. Wrapping
// is inert under static render: the provider seeds its state from a
// `typeof window`-guarded useState initialiser and its effects do not run.
function render(): string {
  return renderToStaticMarkup(
    <AdminTokenProvider>
      <AdminNewsletterComposer />
    </AdminTokenProvider>,
  );
}

const SEND_TO_ALL = "Send to all subscribers";
const SEND_TEST = "Send test email";

describe("AdminNewsletterComposer — reading order is source, specimen, commit", () => {
  // THE DEFECT THIS LOCKS OUT. The blocks used to be source -> commit ->
  // specimen, which put the irreversible "Send to all subscribers" ABOVE the
  // only thing that could have talked the admin out of pressing it, and left
  // the preview stranded below the bottom of the task. Below the layout's seam
  // there is one column, so DOM order IS reading order; above it
  // grid-template-areas puts the preview back in column 2, which is why the fix
  // had to be a DOM reorder and could not be a CSS `order` trick.
  //
  // renderToStaticMarkup observes document order exactly, so this is one of the
  // few genuinely important things about this screen that this environment CAN
  // see.
  it("puts the preview after the fields and before the send controls", () => {
    const html = render();

    const fields = html.indexOf("HTML content");
    const preview = html.indexOf(">Preview<");
    const commit = html.indexOf(`>${SEND_TO_ALL}<`);

    expect(fields).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(-1);

    expect(preview).toBeGreaterThan(fields);
    expect(commit).toBeGreaterThan(preview);
  });

  it("keeps the preview inside the form, which is what makes that order possible", () => {
    // The send controls must stay inside <form> to submit it, so the only way
    // to get the preview between the fields and the actions is to put it there
    // in the DOM. SC 1.3.2 asks that a meaningful sequence survive in the DOM:
    // a keyboard user tabbing out of the textarea would otherwise still reach
    // Send before the preview even if CSS had reordered it visually.
    const html = render();

    const formStart = html.indexOf("<form");
    const formEnd = html.indexOf("</form>");
    const preview = html.indexOf(">Preview<");

    expect(formStart).toBeGreaterThan(-1);
    expect(formEnd).toBeGreaterThan(formStart);
    expect(preview).toBeGreaterThan(formStart);
    expect(preview).toBeLessThan(formEnd);
  });

  it("puts the rehearsal before the commitment in the action row", () => {
    // Left to right, the irreversible control is last, for the same reason
    // Delete is last in a row: the pointer travelling the cluster reaches it
    // only on purpose.
    const html = render();

    expect(html.indexOf(`>${SEND_TEST}<`)).toBeLessThan(
      html.indexOf(`>${SEND_TO_ALL}<`),
    );
  });

  it("gives the preview an accessible name rather than leaving it an unnamed region", () => {
    const html = render();

    const labelledBy = /<section[^>]*aria-labelledby="([^"]+)"/.exec(html);
    expect(labelledBy).not.toBeNull();
    // The caption element the name points at must exist and be the word the eye
    // sees; a section pointing at an id nothing carries is an unnamed region.
    expect(html).toMatch(
      new RegExp(`id="${labelledBy?.[1]}"[^>]*>Preview<`),
    );
  });
});

describe("AdminNewsletterComposer — an empty composer cannot send", () => {
  it("disables both send controls while there is nothing to send", () => {
    // `canSubmit` requires a non-blank subject AND non-blank HTML. This is a
    // STANDING precondition on controls that have never held focus, not a busy
    // state, so the native attribute is correct here and the browser's own
    // refusal - including its refusal of implicit form submission - is kept.
    const html = render();

    for (const label of [SEND_TEST, SEND_TO_ALL]) {
      const button = controlLabelled(html, label);
      expect(nativelyDisabled(button)).toBe(true);
      // Not the busy spelling: nothing is in flight on first paint.
      expect(button).not.toContain("aria-busy");
    }
  });

  it("keeps the test control out of the form's submit path", () => {
    // THE CONSEQUENCE IF THIS REGRESSES. Submitting the form opens the
    // broadcast confirmation - `handleSubmit` does not send, it sets
    // `pendingSend`. A test button that became type="submit" would therefore
    // put "email every subscriber" in front of an admin who asked to email
    // only themselves, and implicit submission (Enter in the subject field)
    // would reach whichever submit comes first in the form.
    const html = render();

    expect(controlLabelled(html, SEND_TEST)).toContain('type="button"');
    expect(controlLabelled(html, SEND_TO_ALL)).toContain('type="submit"');
  });

  it("labels the controls at rest rather than pre-announcing an in-flight state", () => {
    const html = render();

    expect(html).toContain(`>${SEND_TEST}<`);
    expect(html).toContain(`>${SEND_TO_ALL}<`);
    expect(html).not.toContain("Sending…");
    expect(html).not.toContain("Sending test…");
  });

  it("shows the preview's empty placeholder instead of an empty frame", () => {
    expect(render()).toContain("The rendered email appears here as you type.");
  });
});

/**
 * THE HIGHEST-CONSEQUENCE ATTRIBUTE ON THIS SCREEN, asserted against markup.
 *
 * A `srcDoc` frame inherits the EMBEDDER's origin. A <script> in pasted
 * newsletter HTML would therefore run same-origin with the admin portal and
 * could read the bearer token straight out of localStorage - and this HTML is
 * routinely pasted from third-party templates AND re-hydrated from a stored
 * draft on mount, with the token one getItem away. `sandbox=""` is what stops
 * that. Loosening it to `allow-scripts allow-same-origin` is equivalent to no
 * sandbox at all, because together those two flags let the frame reach out and
 * remove its own sandbox attribute - and it is the exact edit a future
 * "the preview doesn't run my tracking pixel" bug report invites.
 *
 * THIS BLOCK USED TO BE THREE GREPS OVER THIS FILE'S OWN SOURCE TEXT, on the
 * premise that the iframe branch needed state no renderer here could reach. The
 * premise was true of the component as it was written and false of the
 * component as it could be written: `NewsletterPreview` is a pure function of
 * `html`, so handing it a non-empty string renders the branch outright. The
 * greps were also actively rotting - the stripper dropped only lines BEGINNING
 * with a comment token, so moving the sandbox rationale into this component's
 * own prevailing `{ /* … *\/ }` style, a zero-behaviour edit, would have failed
 * them, while any regression spelled differently from the literal would have
 * passed.
 */
describe("NewsletterPreview — the preview frame is sandboxed", () => {
  const PASTED = "<p>Hello</p><script>steal(localStorage.adminToken)</script>";

  const renderPreview = (html: string): string =>
    renderToStaticMarkup(<NewsletterPreview html={html} />);

  /** The rendered <iframe ...> open tag, so no assertion can match text elsewhere. */
  function frame(html: string): string {
    const tag = /<iframe[^>]*>/.exec(renderPreview(html));
    expect(tag, "the preview rendered no iframe").not.toBeNull();
    return tag![0];
  }

  it("renders a non-empty draft through an iframe rather than into this page", () => {
    // Guards the guard. If the frame were ever replaced by a
    // dangerouslySetInnerHTML preview, the sandbox assertions below would pass
    // vacuously while the exposure got strictly worse - so the pasted markup is
    // checked for having stayed INERT, escaped inside an attribute, rather than
    // having become part of this document.
    const markup = renderPreview(PASTED);

    expect(markup).toContain("<iframe");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<p>Hello</p>");
    // Case-insensitive on the attribute NAME only: HTML attribute names are
    // case-insensitive and React's chosen spelling is not this component's
    // contract. The escaped VALUE is the assertion - the pasted markup reached
    // the page as attribute text, not as elements.
    expect(frame(PASTED)).toMatch(/srcdoc="&lt;p&gt;Hello&lt;\/p&gt;/i);
  });

  it("declares an empty sandbox on it", () => {
    expect(frame(PASTED)).toContain('sandbox=""');
  });

  it("never grants the frame scripts or same-origin access", () => {
    const tag = frame(PASTED);

    expect(tag).not.toMatch(/sandbox="[^"]+"/);
    expect(tag).not.toContain("allow-scripts");
    expect(tag).not.toContain("allow-same-origin");
  });

  it("renders no frame at all until there is something to show", () => {
    // The empty branch is the one the composer paints on first load, and a
    // frame with an empty srcdoc would still be a frame to loosen later.
    for (const nothing of ["", "   ", "\n\t "]) {
      expect(renderPreview(nothing)).not.toContain("<iframe");
      expect(renderPreview(nothing)).toContain(
        "The rendered email appears here as you type.",
      );
    }
  });

  it("names the specimen region rather than leaving it unnamed", () => {
    // Carried over from the composer-level assertion below, which could only
    // ever see the empty branch: the wiring must survive in BOTH.
    for (const html of ["", PASTED]) {
      const markup = renderPreview(html);
      const labelledBy = /<section[^>]*aria-labelledby="([^"]+)"/.exec(markup);

      expect(labelledBy).not.toBeNull();
      expect(markup).toMatch(
        new RegExp(`id="${labelledBy?.[1]}"[^>]*>Preview<`),
      );
    }
  });

  it("marks the filled plate only when it is filled", () => {
    // The one branch of this component with no semantic or ARIA carrier, so the
    // class identifier is the only handle. It is read as "which branch did the
    // component choose", never as evidence that a rule exists - see the
    // CSS-module note in Pagination.test.tsx for why it cannot be the latter.
    expect(renderPreview(PASTED)).toContain("previewPlateFilled");
    expect(renderPreview("")).not.toContain("previewPlateFilled");
  });
});

// The shape the API answers a send with. Not exported from the component, but
// these are structural types, so a literal of the right shape is the real thing.
type Result = {
  status?: string;
  totalSubscribers?: number;
  attempted?: number;
  sent?: number;
  failed?: number;
  details?: Array<{ message?: string }>;
};

/** A result as the API actually reports one: failed is the remainder. */
const result = (attempted: number, sent: number): Result => ({
  totalSubscribers: attempted,
  attempted,
  sent,
  failed: attempted - sent,
});

describe("resultTone — what a completed send is reported in", () => {
  // The rule is by CONSEQUENCE, not by severity: a failed write is an alarm, a
  // failed read is prose, and a fact that destroyed nothing is neutral. A send
  // result is mostly the third case, so it is not --danger merely because one
  // of its numbers is non-zero.

  it("reports a send with no subscribers as neutral, because nothing was owed", () => {
    expect(resultTone(result(0, 0))).toBe("info");
  });

  // THE BRANCH THIS EXPORT EXISTS FOR. "Nothing reached anybody" is a failed
  // write by any reading, and reporting it in the success treatment is the
  // composer telling the admin the OPPOSITE of what happened - with the counts
  // all correct and the line perfectly calm, so nothing looks broken and the
  // admin walks away believing the send landed.
  it("reports a send that reached nobody as an error", () => {
    expect(resultTone(result(40, 0))).toBe("error");
    expect(resultTone(result(1, 0))).toBe("error");
  });

  it("reports a partial send as neutral, because the counts already say so", () => {
    expect(resultTone(result(40, 37))).toBe("info");
  });

  it("reports a send that reached everybody as a success", () => {
    expect(resultTone(result(40, 40))).toBe("success");
  });

  it("treats missing counts as zero rather than as a success", () => {
    // Every field on the response is optional. An empty body must not fall
    // through to "success" - the most reassuring of the three - by default.
    expect(resultTone({})).toBe("info");
    expect(resultTone({ attempted: 5 })).toBe("error");
  });
});

describe("describeResult — the same outcome in words", () => {
  it("states each outcome plainly", () => {
    expect(describeResult(result(0, 0))).toBe(
      "There are no subscribers yet, so nothing was sent.",
    );
    expect(describeResult(result(40, 0))).toBe(
      "The newsletter reached nobody. Every delivery attempt failed.",
    );
    expect(describeResult(result(40, 37))).toBe(
      "Newsletter sent to 37 of 40 subscribers.",
    );
    expect(describeResult(result(40, 40))).toBe(
      "Newsletter sent to all 40 subscribers.",
    );
  });

  it("never reports a success it cannot support", () => {
    expect(describeResult({})).toBe(
      "There are no subscribers yet, so nothing was sent.",
    );
  });
});

describe("resultTone and describeResult agree", () => {
  // THE CONTRACT BETWEEN THEM, and the reason both are exported rather than
  // one. Colour is never the sole carrier: the words state the outcome and the
  // tone is an emphasis on them. If the two ever disagreed, the emphasis would
  // become a second, contradictory message - and the tone is the half a
  // colour-blind or screen-reader user does not receive, so the words would
  // win for some admins and the colour for others.
  it("across every realistic count the API can report", () => {
    for (const [attempted, sent] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [40, 0],
      [40, 1],
      [40, 39],
      [40, 40],
    ] as const) {
      const r = result(attempted, sent);
      const tone = resultTone(r);
      const words = describeResult(r);

      if (tone === "success") expect(words).toContain("all");
      if (words.includes("reached nobody")) expect(tone).toBe("error");
      if (words.includes("no subscribers yet")) expect(tone).toBe("info");
      // A success must never be announced over a non-zero failure count.
      if (tone === "success") expect(r.failed).toBe(0);
    }
  });
});

describe("joinDetailMessages — the API's own validation issues", () => {
  it("joins every message the response carries", () => {
    expect(
      joinDetailMessages({
        details: [{ message: "Subject is required" }, { message: "HTML is required" }],
      }),
    ).toBe("Subject is required, HTML is required");
  });

  it("returns nothing when there is nothing to say", () => {
    // Each of these reaches the caller as `joinDetailMessages(data) || message`,
    // so an empty string here is what hands the line back to readAdminError's
    // safe fallback. Anything truthy would suppress it.
    expect(joinDetailMessages(null)).toBe("");
    expect(joinDetailMessages({})).toBe("");
    expect(joinDetailMessages({ details: [] })).toBe("");
    expect(joinDetailMessages({ details: [{}, {}] })).toBe("");
    expect(joinDetailMessages({ details: [{ message: "" }] })).toBe("");
  });

  it("survives a details field that is not an array", () => {
    // The body is parsed from an untrusted response; `details` being an object
    // or a string is what an upstream proxy or a version skew produces, and
    // `.map` on it would throw inside the error handler.
    for (const details of ["oops", 42, {}, null] as unknown[]) {
      expect(
        joinDetailMessages({ details } as Result),
      ).toBe("");
    }
  });

  it("drops entries with no message rather than rendering blanks between commas", () => {
    expect(
      joinDetailMessages({
        details: [{ message: "Subject is required" }, {}, { message: undefined }],
      }),
    ).toBe("Subject is required");
  });
});

/** The single button whose visible text is `text`. */
function controlLabelled(html: string, text: string): string {
  const found = (html.match(/<button[\s\S]*?<\/button>/g) ?? []).filter(
    (button) => button.includes(`>${text}<`),
  );
  expect(found).toHaveLength(1);
  return found[0];
}

/**
 * True when the markup carries a NATIVE `disabled` attribute, as opposed to
 * `aria-disabled`. Borrowed from Pagination.test.tsx / AdminButton.test.tsx:
 * React emits a boolean `disabled` as `disabled=""`, and `aria-disabled="true"`
 * ends in the same eight characters, so a plain substring check cannot tell
 * them apart.
 */
function nativelyDisabled(html: string): boolean {
  return /(?<!aria-)disabled=""/.test(html);
}
