import { afterEach, describe, expect, it, vi } from "vitest";

import { findByAccessibleName, focusIfOrphaned } from "./adminFocus";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom (see
// vitest.config.ts), and no new dependency may be added. Both functions here
// are nonetheless fully executable, because both take their DOM in rather than
// reaching for it: findByAccessibleName receives its root, and focusIfOrphaned
// reads exactly two properties off `document`, which vi.stubGlobal can provide.
// So the whole decision surface is driven below by structural fakes - the same
// approach useModalDismiss.test.ts takes, for the same reason.
//
// What is NOT covered is that a real browser drops focus to <body> when the
// focused element is unmounted. That is the browser's behaviour, not this
// module's, and it is verified by driving the live app; the measurements are in
// the specialist report.

// --- Structural fakes -------------------------------------------------------
// Casting through `unknown` is the honest spelling: these are not Elements and
// are not pretending to be. They satisfy the narrow contract each function was
// written against - `querySelectorAll("button")` on one side, `focus()` and
// identity comparison on the other.

type FakeButton = { label: string | null; marker: string; focus: () => void };

function button(label: string | null, marker = ""): FakeButton {
  return {
    label,
    // Only for the duplicate-name test: the root below hands out a fresh object
    // per call, so identity cannot distinguish two same-named buttons.
    marker,
    focus: () => {},
  };
}

/** A root whose querySelectorAll("button") yields exactly these, in order. */
function root(buttons: FakeButton[]): ParentNode {
  return {
    querySelectorAll: (selector: string) => {
      // The real call is always "button". Asserting it here means a future
      // widening of the selector cannot slip past these tests silently.
      expect(selector).toBe("button");
      return buttons.map((b) => ({
        ...b,
        getAttribute: (name: string) => (name === "aria-label" ? b.label : null),
      }));
    },
  } as unknown as ParentNode;
}

/** Installs a `document` whose activeElement is whatever is passed. */
function stubActiveElement(active: unknown): { body: unknown } {
  const body = { tagName: "BODY" };
  vi.stubGlobal("document", {
    body,
    activeElement: active === "body" ? body : active,
  });
  return { body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findByAccessibleName", () => {
  it("returns the button whose aria-label matches exactly", () => {
    const wanted = button("Edit post: Northwest Gin");
    const found = findByAccessibleName(
      root([button("New post"), wanted, button("Delete post: Northwest Gin")]),
      "Edit post: Northwest Gin",
    );

    expect(found).not.toBeNull();
    expect((found as unknown as FakeButton).label).toBe(
      "Edit post: Northwest Gin",
    );
  });

  it("returns null rather than throwing when the root is null", () => {
    // The callers pass refs, which are null before mount and after unmount -
    // and a restore that runs against a torn-down screen is the normal case,
    // not the exceptional one.
    expect(findByAccessibleName(null, "New post")).toBeNull();
  });

  it("returns null when nothing carries that name", () => {
    expect(
      findByAccessibleName(root([button("New post")]), "New recipe"),
    ).toBeNull();
  });

  it("does not match on a prefix, a suffix, or a differing case", () => {
    // Record titles are admin-authored and routinely share prefixes ("Gin" and
    // "Gin Two"); focusing the wrong row is silent, since both are real rows.
    const rows = root([
      button("Edit post: Gin Two"),
      button("Edit post: Gin"),
    ]);

    expect(
      (findByAccessibleName(rows, "Edit post: Gin") as unknown as FakeButton)
        .label,
    ).toBe("Edit post: Gin");
    expect(findByAccessibleName(rows, "Edit post: G")).toBeNull();
    expect(findByAccessibleName(rows, "edit post: gin")).toBeNull();
  });

  it("matches a name containing quotes and brackets, which a selector string could not", () => {
    // The reason this compares an attribute VALUE instead of building a
    // [aria-label="..."] selector: these names are interpolated from titles the
    // admin typed, and a quote in one would be a malformed query - a thrown
    // SyntaxError in the middle of a focus restore.
    const awkward = 'Edit post: The "Best" Gin [2026] \\ 50% off';

    expect(
      (
        findByAccessibleName(
          root([button("New post"), button(awkward)]),
          awkward,
        ) as unknown as FakeButton
      ).label,
    ).toBe(awkward);
  });

  it("skips buttons with no aria-label at all", () => {
    expect(findByAccessibleName(root([button(null)]), "New post")).toBeNull();
  });

  it("returns the FIRST match when a name is duplicated", () => {
    // Not a contract any caller should lean on, but it must be deterministic:
    // a restore that picked a different row from run to run would produce bug
    // reports nobody could reproduce.
    const found = findByAccessibleName(
      root([button("Clear", "first"), button("Clear", "second")]),
      "Clear",
    );

    expect((found as unknown as FakeButton).marker).toBe("first");
  });
});

describe("focusIfOrphaned", () => {
  it("focuses the target when the page has dropped focus to <body>", () => {
    stubActiveElement("body");
    const focus = vi.fn();

    focusIfOrphaned({ focus } as unknown as HTMLElement);

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("DECLINES when anything else already holds focus", () => {
    // THE WHOLE CONTRACT. These restores can land a network round trip after
    // the action that queued them, so by the time one fires the admin may have
    // put focus somewhere deliberately - and moving them is the more hostile of
    // the two failures. It is also how this coexists with useModalDismiss,
    // whose bounded MutationObserver asks the same question and stands down for
    // the same reason: whichever lands first wins, and neither has to know
    // about the other.
    stubActiveElement({ tagName: "INPUT" });
    const focus = vi.fn();

    focusIfOrphaned({ focus } as unknown as HTMLElement);

    expect(focus).not.toHaveBeenCalled();
  });

  it("focuses the target when activeElement is null", () => {
    // A detached or not-yet-painted document reports null rather than body.
    // Nothing holds focus in that state either, so the restore should proceed.
    stubActiveElement(null);
    const focus = vi.fn();

    focusIfOrphaned({ focus } as unknown as HTMLElement);

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and does not read the document, when the target is null", () => {
    // The lookup above returns null whenever the intended control is gone, and
    // every caller passes that result straight in. Bailing first is what lets
    // them do so without a guard apiece.
    vi.stubGlobal("document", {
      get activeElement(): never {
        throw new Error("activeElement must not be read for a null target");
      },
      get body(): never {
        throw new Error("body must not be read for a null target");
      },
    });

    expect(() => focusIfOrphaned(null)).not.toThrow();
  });
});
