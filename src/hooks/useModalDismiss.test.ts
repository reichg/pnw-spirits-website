import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveFocusRestoreTarget,
  scheduleSettleCorrection,
  SETTLE_WINDOW_MS,
  useModalDismiss,
  type FocusAnchorStep,
} from "./useModalDismiss";

// NOTE ON COVERAGE SCOPE
// ----------------------
// The side effects of this hook — Escape-to-dismiss, the body scroll lock, and
// listener cleanup — live inside a useEffect that needs both a React renderer
// that runs effects AND a DOM. This repo runs Vitest in the "node" environment
// with no jsdom/happy-dom and no @testing-library/react (see vitest.config.ts),
// and no new dependency may be added, so those paths remain a documented
// coverage gap.
//
// What IS executable here is the part that matters most, and it is executable
// because it was deliberately shaped that way: resolveFocusRestoreTarget is
// pure, takes its DOM in as arguments and touches nothing global, so the
// focus-restore decision — including the success path, where the trigger has
// been destroyed by the very action that closed the dialog — can be driven by
// structural fakes with no DOM at all. That path is the one nobody exercises by
// hand, which is exactly why it is worth pinning here.

// --- Structural fakes -------------------------------------------------------
// Only the four members the resolver actually reads: isConnected, tagName,
// children and matches/querySelector. Casting through `unknown` is the honest
// spelling — these are not Elements and are not pretending to be, they satisfy
// the narrow contract the resolver was written against.
type FakeNode = {
  name: string;
  tagName: string;
  isConnected: boolean;
  children: FakeNode[];
  focusable?: boolean;
  focus?: () => void;
};

function node(
  name: string,
  opts: Partial<Omit<FakeNode, "name">> = {},
): FakeNode {
  const self: FakeNode = {
    name,
    tagName: opts.tagName ?? "DIV",
    isConnected: opts.isConnected ?? true,
    children: opts.children ?? [],
    focusable: opts.focusable ?? false,
    focus: () => {},
  };
  // matches() answers "is this element itself focusable"; querySelector()
  // answers "is there a focusable one inside", depth-first, which is what
  // Element.querySelector does.
  Object.assign(self, {
    matches: () => self.focusable === true,
    querySelector: () => findFocusable(self.children),
  });
  return self;
}

function findFocusable(nodes: FakeNode[]): FakeNode | null {
  for (const child of nodes) {
    if (child.focusable) return child;
    const nested = findFocusable(child.children);
    if (nested) return nested;
  }
  return null;
}

const asElement = (n: FakeNode | null) => n as unknown as Element | null;
const step = (parent: FakeNode, index: number) =>
  ({ parent: asElement(parent), index }) as FocusAnchorStep;

/** Builds a list of `rowCount` rows, each holding an Edit and a Delete. */
function buildList(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) =>
    node(`row-${i}`, {
      tagName: "LI",
      children: [
        node(`edit-${i}`, { tagName: "BUTTON", focusable: true }),
        node(`delete-${i}`, { tagName: "BUTTON", focusable: true }),
      ],
    }),
  );
  const list = node("list", { tagName: "UL", children: rows });
  return { list, rows };
}

describe("resolveFocusRestoreTarget", () => {
  it("returns the trigger when it is still connected (Escape / Cancel path)", () => {
    const { list, rows } = buildList(3);
    const trigger = rows[1].children[1];

    const target = resolveFocusRestoreTarget(asElement(trigger), [
      step(rows[1], 1),
      step(list, 1),
    ]);

    expect((target as unknown as FakeNode).name).toBe("delete-1");
  });

  it("lands on the record that took the deleted one's place (success path)", () => {
    // The admin deleted row index 1 of 4. Its row and every ancestor below the
    // list have unmounted; the list element itself survives reconciliation with
    // one fewer child.
    const { list, rows } = buildList(4);
    const trigger = rows[1].children[1];
    const anchorPath = [step(rows[1], 1), step(list, 1)];

    rows[1].isConnected = false;
    trigger.isConnected = false;
    list.children = [rows[0], rows[2], rows[3]];

    const target = resolveFocusRestoreTarget(asElement(trigger), anchorPath);

    // Slot 1 is now the record that used to be row 2, and its first focusable
    // control is that record's Edit — not the top of the list.
    expect((target as unknown as FakeNode).name).toBe("edit-2");
  });

  it("clamps to the last record when the deleted one was last", () => {
    const { list, rows } = buildList(3);
    const trigger = rows[2].children[1];
    const anchorPath = [step(rows[2], 2), step(list, 2)];

    rows[2].isConnected = false;
    trigger.isConnected = false;
    list.children = [rows[0], rows[1]];

    const target = resolveFocusRestoreTarget(asElement(trigger), anchorPath);

    expect((target as unknown as FakeNode).name).toBe("edit-1");
  });

  it("declines when the only survivor is the page shell (<main>)", () => {
    // THIS TEST REPLACES ONE THAT ASSERTED THE OPPOSITE, and the inversion is
    // the point. The old fixture made <main> the survivor and expected the walk
    // to reach into it and focus its first control - which is exactly what
    // shipped, and exactly what was measured going wrong: on /admin/classes a
    // confirmed delete unmounts all three panels, the walk entered <main> at the
    // album panel's index, and focus landed in the UPLOAD caption field above
    // the grid. Keystrokes after a delete silently became the next upload's
    // caption. A passing test built on the same wrong model was defending it.
    const { list, rows } = buildList(1);
    const trigger = rows[0].children[1];
    const newRecord = node("new-record", { tagName: "BUTTON", focusable: true });
    const region = node("region", {
      tagName: "MAIN",
      children: [newRecord, list],
    });
    const anchorPath = [step(rows[0], 1), step(list, 0), step(region, 1)];

    trigger.isConnected = false;
    rows[0].isConnected = false;
    list.isConnected = false;

    expect(resolveFocusRestoreTarget(asElement(trigger), anchorPath)).toBeNull();
  });

  it("still enters a surviving non-shell ancestor when the list itself is gone", () => {
    // The shell stop must not become "give up whenever the list unmounts": a
    // real container the user was inside is still a legitimate landing place.
    const { list, rows } = buildList(1);
    const trigger = rows[0].children[1];
    const replacement = node("replacement-list", {
      tagName: "UL",
      children: [node("edit-new", { tagName: "BUTTON", focusable: true })],
    });
    const panel = node("panel", {
      tagName: "SECTION",
      children: [replacement],
    });
    const anchorPath = [step(rows[0], 1), step(list, 0), step(panel, 0)];

    trigger.isConnected = false;
    rows[0].isConnected = false;
    list.isConnected = false;

    const target = resolveFocusRestoreTarget(asElement(trigger), anchorPath);
    expect((target as unknown as FakeNode).name).toBe("edit-new");
  });

  it("returns null rather than guessing when only <body> survives", () => {
    // <body> and <main> are both shell; see the <main> case above.
    // The whole region unmounted. The first focusable element in the body is
    // the site header, so landing there would teleport a keyboard user to the
    // top of the page and make it look deliberate.
    const { list, rows } = buildList(2);
    const trigger = rows[0].children[1];
    const header = node("header-link", { tagName: "A", focusable: true });
    const body = node("body", { tagName: "BODY", children: [header] });
    const anchorPath = [step(rows[0], 1), step(list, 0), step(body, 0)];

    trigger.isConnected = false;
    rows[0].isConnected = false;
    list.isConnected = false;

    expect(resolveFocusRestoreTarget(asElement(trigger), anchorPath)).toBeNull();
  });

  it("returns null when there is no trigger and no path at all", () => {
    expect(resolveFocusRestoreTarget(null, [])).toBeNull();
  });

  it("skips disconnected rungs and stops at the first surviving one", () => {
    const { list, rows } = buildList(2);
    const trigger = rows[0].children[0];
    const inner = node("inner", { children: [trigger] });
    const outer = node("outer", { children: [inner] });
    const anchorPath = [
      step(inner, 0),
      step(outer, 0),
      step(rows[0], 0),
      step(list, 0),
    ];

    trigger.isConnected = false;
    inner.isConnected = false;
    outer.isConnected = false;
    rows[0].isConnected = false;

    const target = resolveFocusRestoreTarget(asElement(trigger), anchorPath);

    // The list is the first rung still standing, so the walk stops there rather
    // than continuing outward to something further from where the user was.
    expect((target as unknown as FakeNode).name).toBe("edit-0");
  });
});

// --- The deferred settle correction -----------------------------------------
//
// WHY THIS IS TESTED AT ALL, since it was reported as unreachable. It is not.
// Instrumented against the live app, it FIRES on the page-clamp delete on both
// /admin/blogs and /admin/recipes: the clamp arrives as two reads, the first
// leaves the rows container rendered with no children, so the immediate restore
// declines and focus lands on <body>, and the second read is what this catches.
// The measurements are in the specialist report; what follows pins the
// mechanism so the next reader does not have to re-derive it from a browser.
//
// It is executable here for the same reason resolveFocusRestoreTarget is: it
// takes its DOM in as arguments. The three globals it does reach for -
// document, window.setTimeout/clearTimeout and MutationObserver - are supplied
// by vi.stubGlobal, exactly as adminFocus.test.ts supplies `document`.

type FakeObserver = {
  target: unknown;
  options: unknown;
  disconnected: boolean;
  /** Fire the callback, as a real MutationObserver would after a DOM change. */
  fire: () => void;
};

type FakeTimer = { ms: number; cleared: boolean; expire: () => void };

/**
 * Installs the three globals and returns handles on what was registered.
 * `active` is what document.activeElement reports: "body" is the state this
 * correction exists for - the browser dropped focus because the focused element
 * was unmounted.
 */
function installSettleEnv(active: "body" | FakeNode) {
  const body = { tagName: "BODY" };
  const observers: FakeObserver[] = [];
  const timers: FakeTimer[] = [];

  vi.stubGlobal("document", {
    body,
    activeElement: active === "body" ? body : active,
  });

  vi.stubGlobal(
    "MutationObserver",
    class {
      /** The entry this instance registered, so disconnect() marks its own. */
      private entry: FakeObserver | null = null;
      constructor(private readonly callback: () => void) {}
      observe(target: unknown, options: unknown) {
        this.entry = {
          target,
          options,
          disconnected: false,
          // A real observer stops delivering once disconnected; modelling that
          // is what makes "bounded" and "one correction only" assertable.
          fire: () => {
            if (!this.entry?.disconnected) this.callback();
          },
        };
        observers.push(this.entry);
      }
      disconnect() {
        if (this.entry) this.entry.disconnected = true;
      }
    },
  );

  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ ms, cleared: false, expire: fn });
      return timers.length;
    },
    clearTimeout: (id: number) => {
      const timer = timers[id - 1];
      if (timer) timer.cleared = true;
    },
  });

  return { body, observers, timers };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A row's Delete inside grid inside listRegion inside <main>, as the admin
 *  lists render it. `spy` is the focus() of the replacement row's Edit. */
function listFixture() {
  const spy = vi.fn();
  const replacementEdit = node("edit-replacement", {
    tagName: "BUTTON",
    focusable: true,
  });
  replacementEdit.focus = spy;
  const replacementGrid = node("grid-new", {
    tagName: "UL",
    children: [replacementEdit],
  });

  // The deleted row and the grid it lived in are already detached at cleanup,
  // which is the state the clamp's first read leaves behind.
  const row = node("row", { tagName: "LI", isConnected: false });
  const grid = node("grid-old", {
    tagName: "UL",
    children: [row],
    isConnected: false,
  });
  // Rendered but EMPTY: the rows have gone and the replacements have not
  // arrived, so the walk finds this container and has nothing to offer.
  const listRegion = node("listRegion", { tagName: "DIV", children: [] });
  const main = node("main", { tagName: "MAIN", children: [listRegion] });

  const anchorPath = [
    step(row, 0),
    step(grid, 0),
    step(listRegion, 0),
    step(main, 0),
  ];
  return { spy, row, grid, listRegion, main, replacementGrid, anchorPath };
}

describe("scheduleSettleCorrection", () => {
  it("watches the OUTERMOST non-shell rung, not the nearest surviving one", () => {
    // The distinction is the whole reason the function works. At cleanup the
    // list has not re-rendered, so the NEAREST surviving rung is the row's own
    // doomed branch; observing it watches a node about to be detached and the
    // re-render happens in the container above it.
    const { row, grid, anchorPath } = listFixture();
    // At cleanup time these are still standing; the re-render happens above.
    row.isConnected = true;
    grid.isConnected = true;
    const { observers } = installSettleEnv("body");

    scheduleSettleCorrection(null, anchorPath);

    expect(observers).toHaveLength(1);
    expect((observers[0].target as unknown as FakeNode).name).toBe("listRegion");
    expect(observers[0].target).not.toBe(row);
    expect(observers[0].options).toEqual({ childList: true, subtree: true });
  });

  it("arms its timer with the declared settle window", () => {
    const { anchorPath } = listFixture();
    const { timers } = installSettleEnv("body");

    scheduleSettleCorrection(null, anchorPath);

    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(SETTLE_WINDOW_MS);
  });

  it("does nothing at all when only the page shell is left to watch", () => {
    const main = node("main", { tagName: "MAIN" });
    const { observers, timers } = installSettleEnv("body");

    scheduleSettleCorrection(null, [step(main, 0)]);

    expect(observers).toHaveLength(0);
    expect(timers).toHaveLength(0);
  });

  it("corrects to the clamped page's first row once the rows land", () => {
    // THE MEASURED PATH. Immediate restore declined, focus is on <body>, and
    // one round trip later the replacement grid arrives in the same container.
    const { spy, listRegion, replacementGrid, anchorPath } = listFixture();
    const { observers, timers } = installSettleEnv("body");

    scheduleSettleCorrection(null, anchorPath);
    listRegion.children = [replacementGrid];
    observers[0].fire();

    expect(spy).toHaveBeenCalledTimes(1);
    // One correction only: it stands down rather than staying armed.
    expect(observers[0].disconnected).toBe(true);
    expect(timers[0].cleared).toBe(true);
  });

  it("never steals focus from whoever holds it", () => {
    const { spy, listRegion, replacementGrid, anchorPath } = listFixture();
    const elsewhere = node("search-input", { tagName: "INPUT" });
    const { observers } = installSettleEnv(elsewhere);

    scheduleSettleCorrection(null, anchorPath);
    listRegion.children = [replacementGrid];
    observers[0].fire();

    expect(spy).not.toHaveBeenCalled();
    // And it gives up permanently, rather than waiting for focus to return.
    expect(observers[0].disconnected).toBe(true);
  });

  it("stays armed while the trigger is still connected, then corrects", () => {
    // The two declines are deliberately different: "focus is held" finishes,
    // "nothing has unmounted yet" only returns - a mutation arriving before the
    // row is actually dropped must not spend the one correction.
    const { spy, row, grid, listRegion, replacementGrid, anchorPath } =
      listFixture();
    const trigger = node("delete", { tagName: "BUTTON", focusable: true });
    row.children = [trigger];
    row.isConnected = true;
    grid.isConnected = true;
    const { observers } = installSettleEnv("body");

    scheduleSettleCorrection(asElement(trigger), anchorPath);

    observers[0].fire();
    expect(spy).not.toHaveBeenCalled();
    expect(observers[0].disconnected).toBe(false);

    trigger.isConnected = false;
    row.isConnected = false;
    grid.isConnected = false;
    listRegion.children = [replacementGrid];
    observers[0].fire();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("declines silently when the resolver still has no answer (/admin/classes)", () => {
    // That page destroys every rung below <main>, so the deferred pass asks the
    // same question of the same anchorPath and gets the same "no" - a detached
    // rung never re-attaches. The remaining fix there is the screen's own.
    const panel = node("panel", { tagName: "SECTION", isConnected: false });
    const main = node("main", { tagName: "MAIN" });
    const anchorPath = [step(panel, 0), step(main, 0)];
    const { observers } = installSettleEnv("body");

    scheduleSettleCorrection(null, anchorPath);
    expect(() => observers[0].fire()).not.toThrow();
    // Still armed: it declined, it did not spend itself.
    expect(observers[0].disconnected).toBe(false);
  });

  it("is bounded - after the window expires a later mutation does nothing", () => {
    const { spy, listRegion, replacementGrid, anchorPath } = listFixture();
    const { observers, timers } = installSettleEnv("body");

    scheduleSettleCorrection(null, anchorPath);
    timers[0].expire();
    expect(observers[0].disconnected).toBe(true);

    listRegion.children = [replacementGrid];
    observers[0].fire();
    expect(spy).not.toHaveBeenCalled();
  });
});

// --- Server-render contract (unchanged) -------------------------------------

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
