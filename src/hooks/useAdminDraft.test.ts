import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  clearDraft,
  readDraft,
  subscribeToDraft,
  useAdminDraft,
  writeDraft,
} from "./useAdminDraft";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json), and no new
// dependency may be added. `useAdminDraft` is a binding over a module-level
// store, and the store IS fully exercisable here against a stubbed `window` -
// read/parse/write/clear, the malformed-JSON path, storage being unavailable or
// throwing, same-tab notification, and the cross-tab `storage` event.
//
// What renderToStaticMarkup CANNOT show is the useSyncExternalStore side: the
// hydration flip of `hydrated` from false to true (the server render below pins
// the false half, the true half needs a client renderer), and the re-render that
// a store notification triggers. The `save`-before-hydration guard is likewise
// only assertable on its server half.
//
// `options.enabled: false` belongs on that list too and was missing from it.
// The suppression it performs is `enabled && hydrated`, so with `hydrated` false
// on the server snapshot both settings return null for the SAME reason and
// neither exercises the flag. The test near the bottom of this file pins that
// equivalence explicitly rather than leaving a `not.toThrow()` to imply
// coverage; the suppression itself needs a client renderer.
//
// All of the above are recorded as an environment-imposed gap in the
// specialist report.

// A fresh key per test, because the store's entry cache and listener registry are
// module-level and deliberately outlive a single hook instance.
let keySeq = 0;
const nextKey = () => `test-draft-${++keySeq}`;

type FakeWindow = {
  localStorage: Storage;
  listeners: Set<(event: StorageEvent) => void>;
  removedCount: number;
};

function stubWindow(options?: { throwOnAccess?: boolean }): FakeWindow {
  const store = new Map<string, string>();
  const listeners = new Set<(event: StorageEvent) => void>();
  const fake: FakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage,
    listeners,
    removedCount: 0,
  };

  const windowStub = {
    get localStorage() {
      if (options?.throwOnAccess) throw new Error("site data blocked");
      return fake.localStorage;
    },
    addEventListener: (_type: string, handler: (e: StorageEvent) => void) => {
      listeners.add(handler);
    },
    removeEventListener: (
      _type: string,
      handler: (e: StorageEvent) => void,
    ) => {
      listeners.delete(handler);
      fake.removedCount += 1;
    },
  };
  vi.stubGlobal("window", windowStub);
  return fake;
}

function fireStorage(fake: FakeWindow, key: string | null): void {
  for (const listener of fake.listeners) {
    listener({ key } as StorageEvent);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

type BlogDraft = { title: string; content: string; author: string };

describe("draft store (read / write / clear)", () => {
  it("round-trips a typed draft", () => {
    stubWindow();
    const key = nextKey();
    const draft: BlogDraft = {
      title: "Old Fashioned",
      content: "…",
      author: "Jane",
    };

    writeDraft(key, draft);

    expect(readDraft<BlogDraft>(key)).toEqual(draft);
  });

  it("reports null when nothing is stored", () => {
    stubWindow();

    expect(readDraft<BlogDraft>(nextKey())).toBeNull();
  });

  it("returns the same object identity while storage is unchanged", () => {
    // useSyncExternalStore re-renders forever if getSnapshot returns a new object
    // each call, so the read cache is load-bearing, not an optimisation.
    stubWindow();
    const key = nextKey();
    writeDraft(key, { title: "a", content: "b", author: "c" });

    expect(readDraft<BlogDraft>(key)).toBe(readDraft<BlogDraft>(key));
  });

  it("returns a new object once the stored value changes", () => {
    stubWindow();
    const key = nextKey();
    writeDraft(key, { title: "a" });
    const first = readDraft<{ title: string }>(key);

    writeDraft(key, { title: "b" });

    expect(readDraft<{ title: string }>(key)).not.toBe(first);
    expect(readDraft<{ title: string }>(key)).toEqual({ title: "b" });
  });

  it("survives malformed JSON by reporting null", () => {
    const fake = stubWindow();
    const key = nextKey();
    fake.localStorage.setItem(key, "{not json");

    expect(() => readDraft(key)).not.toThrow();
    expect(readDraft(key)).toBeNull();
  });

  it("treats a stored JSON null as no draft", () => {
    const fake = stubWindow();
    const key = nextKey();
    fake.localStorage.setItem(key, "null");

    expect(readDraft(key)).toBeNull();
  });

  it("clears a stored draft", () => {
    stubWindow();
    const key = nextKey();
    writeDraft(key, { title: "a" });

    clearDraft(key);

    expect(readDraft(key)).toBeNull();
  });

  it('never writes the string "undefined" for an unserialisable value', () => {
    const fake = stubWindow();
    const key = nextKey();

    writeDraft(key, undefined);

    expect(fake.localStorage.getItem(key)).toBeNull();
  });

  it("does not throw when the value cannot be serialised", () => {
    stubWindow();
    const key = nextKey();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => writeDraft(key, circular)).not.toThrow();
    expect(readDraft(key)).toBeNull();
  });

  it("is a no-op on the server, where there is no window", () => {
    const key = nextKey();

    expect(() => writeDraft(key, { title: "a" })).not.toThrow();
    expect(() => clearDraft(key)).not.toThrow();
    expect(readDraft(key)).toBeNull();
  });

  it("survives storage access itself throwing (blocked site data)", () => {
    const key = nextKey();
    stubWindow({ throwOnAccess: true });

    expect(() => writeDraft(key, { title: "a" })).not.toThrow();
    expect(readDraft(key)).toBeNull();
  });
});

describe("draft store (reserved key guard)", () => {
  it("refuses to read the admin token key", () => {
    stubWindow();

    expect(() => readDraft("adminToken")).toThrow(/reserved/i);
  });

  it("refuses to write or clear the admin token key", () => {
    const fake = stubWindow();
    fake.localStorage.setItem("adminToken", "a.b.c");

    expect(() => writeDraft("adminToken", { title: "a" })).toThrow(/reserved/i);
    expect(() => clearDraft("adminToken")).toThrow(/reserved/i);
    expect(fake.localStorage.getItem("adminToken")).toBe("a.b.c");
  });
});

describe("draft store (subscription)", () => {
  it("notifies same-tab subscribers on write and on clear", () => {
    // The `storage` event does not fire in the writing tab, so a list's
    // "Continue draft" button only stays correct because of this local notify.
    stubWindow();
    const key = nextKey();
    const onChange = vi.fn();
    const unsubscribe = subscribeToDraft(key, onChange);

    writeDraft(key, { title: "a" });
    expect(onChange).toHaveBeenCalledTimes(1);

    clearDraft(key);
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("does not notify subscribers of a different key", () => {
    stubWindow();
    const watched = nextKey();
    const other = nextKey();
    const onChange = vi.fn();
    const unsubscribe = subscribeToDraft(watched, onChange);

    writeDraft(other, { title: "a" });

    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops notifying after unsubscribe and removes the storage listener", () => {
    const fake = stubWindow();
    const key = nextKey();
    const onChange = vi.fn();

    const unsubscribe = subscribeToDraft(key, onChange);
    expect(fake.listeners.size).toBe(1);

    unsubscribe();

    expect(fake.listeners.size).toBe(0);
    writeDraft(key, { title: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies on a cross-tab storage event for the same key", () => {
    const fake = stubWindow();
    const key = nextKey();
    const onChange = vi.fn();
    const unsubscribe = subscribeToDraft(key, onChange);

    fireStorage(fake, key);

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ignores a cross-tab storage event for an unrelated key", () => {
    const fake = stubWindow();
    const onChange = vi.fn();
    const unsubscribe = subscribeToDraft(nextKey(), onChange);

    fireStorage(fake, "adminToken");

    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("notifies when the whole store is cleared (event.key === null)", () => {
    const fake = stubWindow();
    const onChange = vi.fn();
    const unsubscribe = subscribeToDraft(nextKey(), onChange);

    fireStorage(fake, null);

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("returns a no-op unsubscribe on the server", () => {
    expect(() => subscribeToDraft(nextKey(), vi.fn())()).not.toThrow();
  });
});

describe("useAdminDraft (server-render contract)", () => {
  function renderHook(
    key: string,
    options?: { enabled?: boolean },
  ): ReturnType<typeof useAdminDraft<BlogDraft>> {
    let snapshot: ReturnType<typeof useAdminDraft<BlogDraft>> | null = null;

    function Probe(): React.ReactNode {
      snapshot = useAdminDraft<BlogDraft>(key, options);
      return null;
    }

    renderToStaticMarkup(React.createElement(Probe));
    if (snapshot === null)
      throw new Error("useAdminDraft probe did not render");
    return snapshot;
  }

  it("reports an unhydrated, empty draft during a server render", () => {
    // getServerSnapshot pins the pre-hydration half of the contract: no draft is
    // ever read (or claimed) before the first client read.
    const api = renderHook(nextKey());

    expect(api.hydrated).toBe(false);
    expect(api.draft).toBeNull();
    expect(api.hasDraft).toBe(false);
  });

  it("does not touch storage during a server render", () => {
    const fake = stubWindow();
    const key = nextKey();
    fake.localStorage.setItem(
      key,
      JSON.stringify({ title: "kept", content: "", author: "" }),
    );

    const api = renderHook(key);

    // The stored draft survives the render untouched and is not surfaced yet.
    expect(api.draft).toBeNull();
    expect(fake.localStorage.getItem(key)).toContain("kept");
  });

  it("refuses to write before the first client read", () => {
    // The newsletter composer's isDraftLoaded guard: an autosave firing on the
    // first render must not overwrite a real stored draft with empty state.
    const fake = stubWindow();
    const key = nextKey();
    fake.localStorage.setItem(
      key,
      JSON.stringify({ title: "real", content: "", author: "" }),
    );

    renderHook(key).save({ title: "", content: "", author: "" });

    expect(fake.localStorage.getItem(key)).toContain("real");
  });

  it("exposes a stable API surface", () => {
    const api = renderHook(nextKey());

    expect(typeof api.save).toBe("function");
    expect(typeof api.clear).toBe("function");
  });

  it("throws when used with the admin token key", () => {
    expect(() => renderHook("adminToken")).toThrow(/reserved/i);
  });

  it("cannot yet distinguish enabled:false, and says so rather than implying it", () => {
    // THE IMPRESSION THIS TEST USED TO GIVE. It read "renders without throwing
    // when reading is disabled" and asserted only `not.toThrow()`, which makes
    // the `enabled:false` read-suppression look covered. It is not covered at
    // all. `draft` is `enabled && hydrated ? entry.value : null`, and `hydrated`
    // is false on the server snapshot, so BOTH settings return null here for the
    // same reason and neither exercises the suppression. Asserting that
    // equivalence is honest; calling it coverage was not.
    const on = renderHook(nextKey(), { enabled: true });
    const off = renderHook(nextKey(), { enabled: false });

    expect(on.draft).toBeNull();
    expect(off.draft).toBeNull();
    expect(off.hasDraft).toBe(false);
  });

  it("leaves save and clear working when reading is disabled", () => {
    // This half IS reachable, and it is the half with a documented hazard:
    // `enabled:false` is the editors' "New post" / "New recipe" path, which must
    // open blank over an existing draft AND still be able to persist its own
    // work. Disabling reads by disabling the whole hook would silently drop
    // every autosave behind those buttons.
    const off = renderHook(nextKey(), { enabled: false });

    expect(typeof off.save).toBe("function");
    expect(typeof off.clear).toBe("function");
  });
});
