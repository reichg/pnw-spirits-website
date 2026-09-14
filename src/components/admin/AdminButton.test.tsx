import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AdminButton from "./AdminButton";
import type { AdminButtonProps } from "./admin.types";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (vitest.config.ts), and no dependency may be added, so
// there is no way to dispatch a real click here. Two techniques cover the
// contract between them:
//
//   1. renderToStaticMarkup, for the ATTRIBUTES - which is where the whole
//      defect lives. AdminButton has no state, no effects and no mount gate, so
//      static markup is its complete rendered output.
//
//   2. CALLING THE COMPONENT AS A FUNCTION, for the HANDLER. AdminButton is a
//      hook-free pure function of its props that returns one element, so
//      AdminButton(props).props.onClick IS the handler the DOM would receive.
//      Invoking it with a recording event object proves both halves of the
//      inertness contract - the caller's onClick is not reached, and the click's
//      default action is cancelled - without a DOM. That is the closest this
//      environment can get to "press it twice", and it is the assertion the
//      double-submit guarantee actually rests on.
//
// WHY THE NATIVE `disabled` ATTRIBUTE IS A REGRESSION MARKER, NOT AN EXPECTED
// ONE, ON A BUSY CONTROL. `disabled` removes an element from the tab order and
// the browser blurs it the instant it is set. `busy` is by definition raised by
// a control about its OWN press, so every busy admin control disabled itself
// under the admin's finger and dropped focus to <body> for the length of its own
// request - measured at 1ms, held for ~750ms, on the blog editor's Save. The
// same correction, for the same reason, is recorded in Pagination.tsx and pinned
// by Pagination.test.tsx.
//
// nativelyDisabled() below is borrowed from that file and is the reason this
// suite can see the difference at all: React emits a boolean `disabled` as
// `disabled=""`, and `aria-disabled="true"` ends in the same eight characters,
// so `toContain("disabled")` passes on either. A regression back to the native
// attribute would be invisible to a looser check.

const BASE: AdminButtonProps = { children: "Save post" };

const render = (props: Partial<AdminButtonProps>) =>
  renderToStaticMarkup(React.createElement(AdminButton, { ...BASE, ...props }));

describe("AdminButton — unavailable states", () => {
  it("renders a plain, enabled button when neither flag is set", () => {
    const html = render({});

    expect(nativelyDisabled(html)).toBe(false);
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-busy");
    expect(html).toContain('type="button"');
  });

  it("marks a busy control aria-disabled and aria-busy, and never natively disabled", () => {
    // THE REGRESSION THIS FILE EXISTS TO CATCH.
    const html = render({ busy: true });

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(nativelyDisabled(html)).toBe(false);
  });

  it("keeps a busy submit control a submit control", () => {
    // Not switched to type="button" while busy: that would stop submission by
    // removing the form's default button, which relocates implicit submission
    // rather than cancelling it. AdminButton cancels the activation instead, so
    // this button stays the one place the decision is made.
    const html = render({ type: "submit", busy: true });

    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-disabled="true"');
    expect(nativelyDisabled(html)).toBe(false);
  });

  it("natively disables a control that is merely disabled, and does not announce it twice", () => {
    // `disabled` is the STANDING precondition in this admin - no token yet, page
    // content not saved - on a control that has never held focus and was never
    // going to. The browser's own refusal is the stronger guarantee there,
    // including its refusal of implicit form submission, so it is kept.
    const html = render({ disabled: true });

    expect(nativelyDisabled(html)).toBe(true);
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-busy");
  });

  it("lets busy outrank disabled when a caller states both for the same moment", () => {
    // Several callers do: AdminClassManager's `addSessionLocked` includes
    // `sessionBusy`, AdminNewsletterComposer's `canSubmit` includes
    // `!sendingAction`. If the native attribute still won there, the focus fix
    // would miss the controls that need it most.
    const html = render({ disabled: true, busy: true });

    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(nativelyDisabled(html)).toBe(false);
  });

  it("does not relabel a busy control", () => {
    // The caller supplies "Saving…"/"Sending…"; only the screen knows the word.
    expect(render({ busy: true, children: "Save post" })).toContain(">Save post<");
  });

  it("keeps the accessible name in every state", () => {
    for (const props of [{}, { busy: true }, { disabled: true }]) {
      expect(render({ ...props, ariaLabel: "Delete Photo 3" })).toContain(
        'aria-label="Delete Photo 3"',
      );
    }
  });
});

describe("AdminButton — inertness while busy (the double-submit guarantee)", () => {
  // AdminButton is hook-free, so calling it is rendering it. See the header.
  function handlerFor(props: Partial<AdminButtonProps>) {
    const element = AdminButton({ ...BASE, ...props }) as React.ReactElement<
      React.ButtonHTMLAttributes<HTMLButtonElement>
    >;
    return element.props.onClick;
  }

  function fakeClick() {
    return { preventDefault: vi.fn(), stopPropagation: vi.fn() };
  }

  it("passes the caller's handler straight through when the control is live", () => {
    const onClick = vi.fn();
    const event = fakeClick();

    handlerFor({ onClick })?.(event as never);

    expect(onClick).toHaveBeenCalledTimes(1);
    // A live control must not swallow its own activation: a submit has to submit.
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("never reaches the caller's handler while busy, however many times it fires", () => {
    // A busy control is focusable and clickable now, so this - not the browser -
    // is what stands between a second Enter and a second newsletter to every
    // subscriber.
    const onClick = vi.fn();
    const handler = handlerFor({ onClick, busy: true });

    for (let i = 0; i < 3; i += 1) handler?.(fakeClick() as never);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("cancels the activation itself while busy, which is what stops a submit", () => {
    // Dropping onClick is only half of inertness: a type="submit" has an
    // activation behaviour of its own that no absent handler prevents, and
    // implicit submission (Enter in a text field) fires a click at the form's
    // default button without any gesture on the button at all.
    const event = fakeClick();

    handlerFor({ type: "submit", busy: true, onClick: vi.fn() })?.(event as never);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("is inert while busy even when the caller supplied no handler at all", () => {
    const event = fakeClick();

    handlerFor({ type: "submit", busy: true })?.(event as never);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not invoke the caller's handler during render", () => {
    const onClick = vi.fn();
    render({ onClick });
    render({ onClick, busy: true });

    expect(onClick).not.toHaveBeenCalled();
  });
});

/**
 * True when the markup carries a NATIVE `disabled` attribute, as opposed to
 * `aria-disabled`. Borrowed from Pagination.test.tsx, which needs it for the
 * same distinction: React emits a boolean `disabled` as `disabled=""`, and
 * `aria-disabled="true"` ends in the same eight characters, so a plain substring
 * check cannot tell the two apart - and the whole point of this change is that
 * they are not the same thing.
 */
function nativelyDisabled(html: string): boolean {
  return /(?<!aria-)disabled=""/.test(html);
}
