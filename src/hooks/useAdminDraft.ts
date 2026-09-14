import { useCallback, useSyncExternalStore } from "react";

import { ADMIN_TOKEN_STORAGE_KEY } from "@/components/admin/AdminTokenContext";

export type AdminDraft<T> = {
  /** The stored draft, or null when nothing is stored, stored data is corrupt, or reading is disabled. */
  draft: T | null;
  /** False during SSR and on the hydration render; true once the first client read has happened. */
  hydrated: boolean;
  /** Persist `value`. No-op before hydration - see the read-before-write note below. */
  save: (value: T) => void;
  /** Remove the stored draft. */
  clear: () => void;
  /** `draft !== null`, kept in sync with other tabs and with `save`/`clear` in this one. */
  hasDraft: boolean;
};

// localStorage keys that must never be used as a draft key. The admin token key
// holds a bearer credential; a draft hook writing there would clobber the
// session, and a draft hook reading there would pull the token into component
// state, where it can reach a render, an error message or a log. Imported rather
// than re-spelled so the guard cannot drift from the key it guards.
const RESERVED_STORAGE_KEYS: ReadonlySet<string> = new Set([
  ADMIN_TOKEN_STORAGE_KEY,
]);

// A cached read of one key. `raw` is the exact string last seen in storage, so a
// re-read can return the SAME object when nothing changed - which is what
// useSyncExternalStore requires of getSnapshot to avoid an infinite re-render.
type DraftEntry = { raw: string | null; value: unknown };

// The server snapshot. A single shared instance, because getServerSnapshot must
// also be referentially stable across calls.
const SERVER_ENTRY: DraftEntry = { raw: null, value: null };

const entryCache = new Map<string, DraftEntry>();
const keyListeners = new Map<string, Set<() => void>>();

// Client-detection store, mirroring Modal/AdminAuthGate: the snapshot is true on
// the client and false on the server, so `hydrated` flips exactly once after
// hydration without a setState-in-effect and without a hydration mismatch.
const subscribeNever = () => () => {};
const snapshotTrue = () => true;
const snapshotFalse = () => false;

function assertUsableDraftKey(key: string): void {
  if (RESERVED_STORAGE_KEYS.has(key)) {
    throw new Error(
      `useAdminDraft: "${key}" is reserved for credential storage and cannot be used as a draft key.`,
    );
  }
}

// Reading `window.localStorage` can itself throw when site data is blocked
// (Safari private mode, hardened browser settings), which is why the access is
// inside the try and not just the getItem call.
function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

// A corrupt or half-written draft yields null rather than throwing: a draft is
// best-effort convenience data, and an editor that refuses to open because of one
// bad localStorage byte is worse than an editor that opens blank.
function parseDraft(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

function readEntry(key: string): DraftEntry {
  const raw = readRaw(key);
  const cached = entryCache.get(key);
  if (cached && cached.raw === raw) return cached;
  const entry: DraftEntry = { raw, value: parseDraft(raw) };
  entryCache.set(key, entry);
  return entry;
}

function notify(key: string): void {
  const listeners = keyListeners.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

// The `storage` event fires only in OTHER tabs, so same-tab writes notify the
// local listener set directly. Without that, a list's "Continue draft" button
// would keep showing after the editor in the same tab cleared the draft on save -
// which is why all three copies re-read localStorage by hand on editor close.
export function subscribeToDraft(
  key: string,
  onStoreChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  let listeners = keyListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    keyListeners.set(key, listeners);
  }
  listeners.add(onStoreChange);

  // `event.key === null` means the whole store was cleared (e.g. on logout).
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("storage", handleStorage);
    listeners.delete(onStoreChange);
    if (listeners.size === 0) keyListeners.delete(key);
  };
}

/**
 * Imperative read, for non-component callers and tests.
 *
 * Unlike `writeDraft`/`clearDraft`, which the hook's own `save`/`clear` call,
 * nothing in this module routes through this: `getSnapshot` uses `readEntry`
 * directly. It is the non-React way onto that same cache, and so the only way
 * to assert the identity-stability `useSyncExternalStore` requires of
 * `getSnapshot` - two reads with storage unchanged must return the SAME object
 * - without a renderer. Vitest runs in `node` here with no jsdom, which is why
 * that assertion needs a seam at all.
 */
export function readDraft<T>(key: string): T | null {
  assertUsableDraftKey(key);
  return readEntry(key).value as T | null;
}

/** Imperative seam behind `useAdminDraft.save`. Silently no-ops if storage is unavailable. */
export function writeDraft(key: string, value: unknown): void {
  assertUsableDraftKey(key);
  const storage = getStorage();
  if (!storage) return;
  try {
    const serialized = JSON.stringify(value);
    // `JSON.stringify(undefined)` is undefined; storing it would write the
    // literal string "undefined" and produce a permanently corrupt draft.
    if (serialized === undefined) return;
    storage.setItem(key, serialized);
  } catch {
    // Quota exceeded, blocked site data, or an unserializable value. A lost
    // draft is recoverable by retyping; a thrown error mid-keystroke is not.
  }
  notify(key);
}

/** Imperative seam behind `useAdminDraft.clear`. */
export function clearDraft(key: string): void {
  assertUsableDraftKey(key);
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // See writeDraft.
  }
  notify(key);
}

// One typed localStorage draft, replacing the three hand-rolled copies in the
// blog, recipe and newsletter surfaces.
//
// `T` is a compile-time shape only: whatever is in storage was written by an
// earlier (possibly older) version of the app, so a caller that cares must still
// validate the fields it reads, exactly as the newsletter composer does today.
//
// `options.enabled: false` suppresses READING a stored draft - the editors'
// `forceEmpty` path, behind "New post" / "New recipe", which must open blank
// even when a draft exists. It deliberately does not disable `save`/`clear`,
// because a blank-start editor must still be able to persist its own work and
// to clear on save.
export function useAdminDraft<T>(
  key: string,
  options?: { enabled?: boolean },
): AdminDraft<T> {
  assertUsableDraftKey(key);
  const enabled = options?.enabled ?? true;

  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToDraft(key, onStoreChange),
    [key],
  );
  const getSnapshot = useCallback(() => readEntry(key), [key]);

  const entry = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_ENTRY,
  );
  const hydrated = useSyncExternalStore(
    subscribeNever,
    snapshotTrue,
    snapshotFalse,
  );

  const save = useCallback(
    (value: T) => {
      // The newsletter composer's `isDraftLoaded` guard, made structural. An
      // autosave wired to a form's state fires on the first render too, and
      // before the first client read that state is still the component's empty
      // initial value - writing it would overwrite the real stored draft with
      // blanks. This is the bug the blog and recipe copies both have.
      if (!hydrated) return;
      writeDraft(key, value);
    },
    [key, hydrated],
  );

  // Not hydration-gated: clearing is an explicit discard, never a read-then-write
  // round trip, so it has none of `save`'s overwrite hazard.
  const clear = useCallback(() => {
    clearDraft(key);
  }, [key]);

  const value = enabled && hydrated ? (entry.value as T | null) : null;

  return {
    draft: value,
    hydrated,
    save,
    clear,
    // Corrupt stored data reports false, unlike the raw `!!getItem(key)` the
    // lists used to do: offering "Continue draft" for a draft that cannot be
    // parsed just opens an empty editor. Both lists read this flag now.
    hasDraft: value !== null,
  };
}
