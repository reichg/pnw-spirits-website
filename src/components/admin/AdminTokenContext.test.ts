import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ADMIN_TOKEN_STORAGE_KEY,
  AdminTokenProvider,
  clearAdminTokenStorage,
  isTokenValid,
  msUntilTokenExpiry,
  scheduleTokenExpiry,
  useAdminToken,
  type AdminTokenContextType,
} from "./AdminTokenContext";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and
// no @testing-library/react (see vitest.config.ts), so there is no way to mount
// the provider and let its effects run. The session policy is therefore kept in
// pure, exported helpers (isTokenValid, msUntilTokenExpiry,
// scheduleTokenExpiry, clearAdminTokenStorage) that are tested directly, and
// the provider is exercised through renderToStaticMarkup, which performs the
// initial render only. That covers the mount-time value of isAuthenticated but
// not post-mount transitions (the expiry timer's re-render and the cross-tab
// storage listener), which are covered at the helper level instead. A token is
// a bearer credential, so no test renders, logs, or asserts its value - only
// whether one is present.

const SECRET = "secret";

// A fixed wall clock so every expiry calculation here is exact; chosen on a
// whole second so exp (seconds) and Date.now() (ms) line up.
const BASE_MS = 1_700_000_000_000;
const BASE_SECONDS = BASE_MS / 1000;

// setTimeout's 32-bit signed millisecond ceiling (~24.8 days). Mirrored from
// the module so the overflow guard has a regression test.
const THIRTY_TWO_BIT_MAX_MS = 2_147_483_647;

const tokenExpiringAt = (expSeconds: number): string =>
  jwt.sign({ exp: expSeconds }, SECRET);

describe("isTokenValid", () => {
  it("returns false for a null token", () => {
    expect(isTokenValid(null)).toBe(false);
  });

  it("returns false for a malformed / non-JWT string", () => {
    expect(isTokenValid("not-a-jwt")).toBe(false);
  });

  it("returns false for a payload without a numeric exp", () => {
    // Signed without expiresIn -> decoded object has no `exp`.
    const token = jwt.sign({ id: 1 }, "secret");
    expect(isTokenValid(token)).toBe(false);
  });

  it("returns false for an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = jwt.sign({ exp: past }, "secret");
    expect(isTokenValid(token)).toBe(false);
  });

  it("returns true for a token whose exp is in the future", () => {
    const token = jwt.sign({}, "secret", { expiresIn: "30m" });
    expect(isTokenValid(token)).toBe(true);
  });
});

describe("msUntilTokenExpiry", () => {
  it("returns null when there is nothing to wait for", () => {
    expect(msUntilTokenExpiry(null, BASE_MS)).toBeNull();
    expect(msUntilTokenExpiry("not-a-jwt", BASE_MS)).toBeNull();
    expect(msUntilTokenExpiry(jwt.sign({ id: 1 }, SECRET), BASE_MS)).toBeNull();
  });

  it("treats exp as seconds, not milliseconds", () => {
    const token = tokenExpiringAt(BASE_SECONDS + 30);
    // 30s of remaining life plus the 1s boundary allowance asserted below.
    expect(msUntilTokenExpiry(token, BASE_MS)).toBe(31_000);
  });

  it("waits past exp until the token actually reads as invalid", () => {
    const exp = BASE_SECONDS + 30;
    const token = tokenExpiringAt(exp);

    // isTokenValid floors the clock to whole seconds, so the token is still
    // valid AT exp * 1000 and only turns invalid one second later. Arming for
    // exp * 1000 would fire while the session still looked valid.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(exp * 1000);
      expect(isTokenValid(token)).toBe(true);
      expect(msUntilTokenExpiry(token)).toBe(1000);

      vi.setSystemTime((exp + 1) * 1000);
      expect(isTokenValid(token)).toBe(false);
      expect(msUntilTokenExpiry(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for an already-expired token", () => {
    const token = tokenExpiringAt(BASE_SECONDS - 60);
    expect(msUntilTokenExpiry(token, BASE_MS)).toBeNull();
  });

  it("reports the full remaining time even beyond the setTimeout ceiling", () => {
    const token = tokenExpiringAt(BASE_SECONDS + 60 * 24 * 60 * 60);
    const remaining = msUntilTokenExpiry(token, BASE_MS);

    expect(remaining).toBe(60 * 24 * 60 * 60 * 1000 + 1000);
    expect(remaining as number).toBeGreaterThan(THIRTY_TWO_BIT_MAX_MS);
  });
});

describe("scheduleTokenExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires exactly when the token stops being valid", () => {
    const token = tokenExpiringAt(BASE_SECONDS + 60);
    const onExpire = vi.fn();
    const cancel = scheduleTokenExpiry(token, onExpire);

    vi.advanceTimersByTime(60_999);
    expect(onExpire).not.toHaveBeenCalled();
    expect(isTokenValid(token)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(isTokenValid(token)).toBe(false);

    cancel();
  });

  it("arms nothing for an absent, undecodable, or already-expired token", () => {
    const onExpire = vi.fn();
    const cancels = [
      scheduleTokenExpiry(null, onExpire),
      scheduleTokenExpiry("not-a-jwt", onExpire),
      scheduleTokenExpiry(tokenExpiringAt(BASE_SECONDS - 1), onExpire),
    ];

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(THIRTY_TWO_BIT_MAX_MS);
    expect(onExpire).not.toHaveBeenCalled();

    // Cancelling a timer that was never armed must be safe.
    expect(() => cancels.forEach((cancel) => cancel())).not.toThrow();
  });

  it("does not fire after it is cancelled", () => {
    const token = tokenExpiringAt(BASE_SECONDS + 60);
    const onExpire = vi.fn();

    const cancel = scheduleTokenExpiry(token, onExpire);
    cancel();

    vi.advanceTimersByTime(120_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hops past the 32-bit setTimeout ceiling instead of firing immediately", () => {
    // 60 days out: a single setTimeout with this delay would overflow and run
    // on the next tick, ending a perfectly valid session.
    const token = tokenExpiringAt(BASE_SECONDS + 60 * 24 * 60 * 60);
    const onExpire = vi.fn();
    const cancel = scheduleTokenExpiry(token, onExpire);

    vi.advanceTimersByTime(1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(THIRTY_TWO_BIT_MAX_MS);
    expect(onExpire).not.toHaveBeenCalled();
    expect(isTokenValid(token)).toBe(true);

    vi.advanceTimersByTime(THIRTY_TWO_BIT_MAX_MS);
    expect(onExpire).not.toHaveBeenCalled();

    const remaining = msUntilTokenExpiry(token);
    expect(remaining).not.toBeNull();
    vi.advanceTimersByTime(remaining as number);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(isTokenValid(token)).toBe(false);

    cancel();
  });
});

type FakeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

// Minimal stand-in for the browser globals the provider touches during its
// initial render. Effects never run under renderToStaticMarkup, so the listener
// methods exist only to keep the shape honest.
function stubBrowserWindow(storage: FakeStorage): void {
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

describe("clearAdminTokenStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the admin token from localStorage", () => {
    const storage = createFakeStorage({
      [ADMIN_TOKEN_STORAGE_KEY]: tokenExpiringAt(BASE_SECONDS + 60),
      blogDraft: "{}",
    });
    stubBrowserWindow(storage);

    clearAdminTokenStorage();

    expect(storage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
    // Only the credential is cleared; unrelated local state survives.
    expect(storage.getItem("blogDraft")).toBe("{}");
  });

  it("is a no-op during SSR (no window)", () => {
    expect(() => clearAdminTokenStorage()).not.toThrow();
  });
});

describe("AdminTokenProvider (node / initial-render contract)", () => {
  let captured: AdminTokenContextType | null = null;

  function Probe() {
    const context = useAdminToken();
    captured = context;
    // The token value itself is never rendered - it is a bearer credential.
    return React.createElement(
      "span",
      null,
      `auth=${context.isAuthenticated} token=${
        context.token === null ? "null" : "present"
      }`,
    );
  }

  function renderProvider(): string {
    return renderToStaticMarkup(
      React.createElement(AdminTokenProvider, null, React.createElement(Probe)),
    );
  }

  beforeEach(() => {
    captured = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the full session contract to consumers", () => {
    stubBrowserWindow(createFakeStorage());

    renderProvider();

    expect(captured).not.toBeNull();
    expect(typeof captured?.setToken).toBe("function");
    expect(typeof captured?.signOut).toBe("function");
  });

  it("reports isAuthenticated true for a stored, unexpired token", () => {
    stubBrowserWindow(
      createFakeStorage({
        [ADMIN_TOKEN_STORAGE_KEY]: jwt.sign({}, SECRET, { expiresIn: "30m" }),
      }),
    );

    expect(renderProvider()).toContain("auth=true token=present");
  });

  it("reports isAuthenticated false when no token is stored", () => {
    stubBrowserWindow(createFakeStorage());

    expect(renderProvider()).toContain("auth=false token=null");
  });

  it("reports isAuthenticated false for a stored but expired token", () => {
    stubBrowserWindow(
      createFakeStorage({
        [ADMIN_TOKEN_STORAGE_KEY]: tokenExpiringAt(
          Math.floor(Date.now() / 1000) - 60,
        ),
      }),
    );

    // Still token=present: an expired credential is held but unauthenticated,
    // which is what lets a consumer tell expiry from "never logged in".
    expect(renderProvider()).toContain("auth=false token=present");
  });

  it("signOut clears the stored token without navigating", () => {
    const storage = createFakeStorage({
      [ADMIN_TOKEN_STORAGE_KEY]: jwt.sign({}, SECRET, { expiresIn: "30m" }),
    });
    stubBrowserWindow(storage);

    renderProvider();
    captured?.signOut();

    // The stubbed window exposes no location, so a redirect inside signOut
    // would have thrown here rather than passing silently.
    expect(storage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
