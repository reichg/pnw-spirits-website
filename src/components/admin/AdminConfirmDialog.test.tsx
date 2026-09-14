import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminConfirmDialog from "./AdminConfirmDialog";
import type { AdminConfirmDialogProps } from "./AdminConfirmDialog";

// NOTE ON COVERAGE SCOPE
// ----------------------
// THE DIALOG ITSELF RENDERS NOTHING IN THIS ENVIRONMENT, and that is not a
// limitation of the assertions below but of what can exist here at all.
// `Modal` gates its output on `useSyncExternalStore(subscribe, clientSnapshot,
// () => false)` and then returns `createPortal(...)`: in a server render the
// snapshot is false, so Modal returns null, and even once mounted its subtree
// goes through a portal into `document.body`, which does not exist here.
// `renderToStaticMarkup(<AdminConfirmDialog isOpen />)` is therefore the empty
// string - verified, not assumed. No markup assertion about this component is
// possible in the node environment, and adding jsdom is a dependency change.
//
// WHAT IS REACHABLE, and it is the part that matters. AdminConfirmDialog is a
// hook-free pure function of its props that returns one element, so calling it
// IS rendering it: the element tree it returns carries every decision this
// component makes, and the two AdminButton elements inside it can be rendered
// on their own - away from the portal - to see the attributes the DOM would
// receive. This is the technique AdminButton.test.tsx uses for its handler, for
// the same reason.
//
// THE CONTRACT THIS FILE EXISTS TO PIN. While the confirmed action is in
// flight, Modal's close is disabled by the dismiss lock and Cancel is disabled
// by `busy`. If the confirming control were ALSO natively disabled, the dialog
// would contain zero focusable elements and the browser would drop focus to
// <body> under the admin's own press, inside a focus trap, with body scroll
// locked. The fix is that `busy` is `aria-disabled` - focusable, named, and
// inert only because AdminButton cancels the activation - leaving exactly one
// tab stop, and it is the control that is working. A regression to native
// `disabled` here is invisible to `toContain("disabled")`, so `nativelyDisabled`
// below is borrowed from Pagination.test.tsx / AdminButton.test.tsx.

const BASE: AdminConfirmDialogProps = {
  isOpen: true,
  heading: "Delete blog",
  message: "“Old Fashioned” will be permanently deleted.",
  confirmLabel: "Delete blog",
  confirmBusyLabel: "Deleting…",
  cancelLabel: "Keep blog",
  onConfirm: () => {},
  onCancel: () => {},
};

type LockElement = React.ReactElement<{
  locked: boolean;
  children: React.ReactElement<{ actions: React.ReactNode; heading: string }>;
}>;

/** The element tree the component returns. Calling it is rendering it. */
function tree(props: Partial<AdminConfirmDialogProps> = {}): LockElement {
  return AdminConfirmDialog({ ...BASE, ...props }) as LockElement;
}

/** The two action controls, rendered away from the portal that hides them. */
function actionsMarkup(props: Partial<AdminConfirmDialogProps> = {}): string {
  return renderToStaticMarkup(
    <>{tree(props).props.children.props.actions}</>,
  );
}

describe("AdminConfirmDialog — the dismiss lock", () => {
  it("locks every dismissal route while the confirmed action is in flight", () => {
    // Declared for Modal to enforce rather than handled here. The first version
    // neutered `onClose`, which reaches Escape and the backdrop but NOT the
    // close button Modal renders itself - so the most clickable control in the
    // dialog sat enabled and did nothing, as the only stop in the tab ring.
    expect(tree({ busy: true }).props.locked).toBe(true);
  });

  it("leaves every dismissal route live when it is not busy", () => {
    expect(tree({ busy: false }).props.locked).toBe(false);
    expect(tree({}).props.locked).toBe(false);
  });
});

describe("AdminConfirmDialog — one tab stop while busy", () => {
  it("makes the confirming control aria-disabled and never natively disabled", () => {
    // THE REGRESSION THIS FILE EXISTS TO CATCH. With the close button locked
    // and Cancel disabled, a natively-disabled confirm leaves the focus trap
    // with nothing focusable in it.
    const html = actionsMarkup({ busy: true });
    const confirm = controlLabelled(html, "Deleting…");

    expect(confirm).toContain('aria-disabled="true"');
    expect(confirm).toContain('aria-busy="true"');
    expect(nativelyDisabled(confirm)).toBe(false);
  });

  it("natively disables the cancel control while busy", () => {
    // Closed toward disabled rather than enabled: the request is already in
    // flight and cannot be recalled, so a "cancel" that dismisses without
    // cancelling would return the admin to a list that is about to change under
    // them with no sign that it will. Cancel never held focus and is not the
    // control the admin is pressing, so the browser's stronger refusal is right
    // here - which is also what leaves exactly one tab stop.
    const html = actionsMarkup({ busy: true });

    expect(nativelyDisabled(controlLabelled(html, "Keep blog"))).toBe(true);
  });

  it("leaves exactly one focusable control while busy", () => {
    // The property the two assertions above add up to, stated directly so that
    // a change to either control is measured against the thing that actually
    // matters rather than against its own attribute.
    const buttons = buttonsIn(actionsMarkup({ busy: true }));

    expect(buttons).toHaveLength(2);
    expect(buttons.filter((html) => !nativelyDisabled(html))).toHaveLength(1);
  });

  it("leaves both controls live when it is not busy", () => {
    const buttons = buttonsIn(actionsMarkup({}));

    expect(buttons).toHaveLength(2);
    expect(buttons.every((html) => !nativelyDisabled(html))).toBe(true);
    expect(buttons.every((html) => !html.includes("aria-disabled"))).toBe(true);
  });
});

describe("AdminConfirmDialog — naming the action", () => {
  it("names both buttons for the actions they perform, never OK and Cancel", () => {
    // The whole value of this component over `window.confirm` is that its
    // buttons are the actions rather than the browser's OK/Cancel, and that a
    // default of "Confirm"/"Cancel" is not reachable by omission - both labels
    // are required props.
    const html = actionsMarkup({});

    expect(html).toContain(">Delete blog<");
    expect(html).toContain(">Keep blog<");
    expect(html).not.toContain(">OK<");
    expect(html).not.toContain(">Cancel<");
  });

  it("swaps the confirming label for its in-flight wording, and only that one", () => {
    // `confirmBusyLabel` is a separate prop because only the screen knows
    // whether the word is "Deleting…", "Sending…" or "Publishing…".
    const html = actionsMarkup({ busy: true });

    expect(html).toContain(">Deleting…<");
    expect(html).not.toContain(">Delete blog<");
    // The way out keeps its wording: it is the same action it always was.
    expect(html).toContain(">Keep blog<");
  });

  it("passes the heading through to the dialog", () => {
    expect(tree({}).props.children.props.heading).toBe("Delete blog");
  });
});

describe("AdminConfirmDialog — the alarm sits on the commitment", () => {
  it("puts the destructive control last and paints only it as danger", () => {
    // A row's Delete is neutral at rest - eight red rows are eight alarms and
    // none of them is one - so the alarm belongs here, where the commitment is,
    // and last, so a pointer travelling the cluster reaches it only on purpose.
    const html = actionsMarkup({});
    const buttons = buttonsIn(html);

    expect(buttons[0]).toContain(">Keep blog<");
    expect(buttons[1]).toContain(">Delete blog<");
    // Asserted as "which control asks for the danger rank", not as a colour:
    // the colours belong to the shared design layer. That is the ONLY thing a
    // CSS-module class can show here - under Vitest the import is a Proxy that
    // echoes any key back, so this can never prove a `.danger` rule exists. See
    // the canonical note in Pagination.test.tsx.
    //
    // Underscored rather than the bare word because "danger" is a plausible
    // substring of a confirm dialog's own prose; `_danger_` can only be the
    // class token.
    expect(buttons[0]).not.toMatch(/_danger_/);
    expect(buttons[1]).toMatch(/_danger_/);
  });
});

/** Each `<button …>…</button>` in document order. */
function buttonsIn(html: string): string[] {
  return html.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

/** The single button whose visible text is `text`. */
function controlLabelled(html: string, text: string): string {
  const found = buttonsIn(html).filter((button) =>
    button.includes(`>${text}<`),
  );
  expect(found).toHaveLength(1);
  return found[0];
}

/**
 * True when the markup carries a NATIVE `disabled` attribute, as opposed to
 * `aria-disabled`. Borrowed from Pagination.test.tsx and AdminButton.test.tsx:
 * React emits a boolean `disabled` as `disabled=""`, and `aria-disabled="true"`
 * ends in the same eight characters, so a plain substring check cannot tell the
 * two apart - and the whole point of this component's busy state is that they
 * are not the same thing.
 */
function nativelyDisabled(html: string): boolean {
  return /(?<!aria-)disabled=""/.test(html);
}
