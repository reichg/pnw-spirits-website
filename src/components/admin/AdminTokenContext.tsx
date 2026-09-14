'use client';
import jwt from "jsonwebtoken";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
 * WHY THIS LIVES UNDER `src/components/admin/` AND NOT IN THE ADMIN ROUTE
 * SEGMENT, where it started. It is not route-local: besides the admin layout
 * and six page components, it is read by `src/hooks/useAdminFetch.ts` (the
 * bearer-authenticated fetch) and `src/hooks/useAdminDraft.ts` (which imports
 * ADMIN_TOKEN_STORAGE_KEY for its reserved-key guard), and the admin header is
 * next. Those are shared library modules, and while this file sat in
 * `src/app/(pages)/admin/` they were the only two imports in the repo pointing
 * from shared code up into route space - a route segment being used as a
 * library. Moving the file removes both edges at once rather than declining to
 * add a third.
 *
 * Not `src/hooks/`, despite `useAdminToken` being a hook and its two closest
 * consumers living there: this module also exports a provider that renders, and
 * `src/hooks/` holds no `.tsx` at all. Not a new `src/contexts/`, because this
 * is the only React context in the app and a directory for one module is a rung
 * nothing else reads.
 */

// Define the shape of the admin token context
export type AdminTokenContextType = {
  token: string | null;
  setToken: (token: string | null) => void;
  /** True when a token is present, decodable, and unexpired. */
  isAuthenticated: boolean;
  /** Clears localStorage + context. The caller navigates; this does not. */
  signOut: () => void;
};

/** localStorage key holding the admin bearer token. */
export const ADMIN_TOKEN_STORAGE_KEY = "adminToken";

// setTimeout keeps its delay in a 32-bit signed integer (~24.8 days). A larger
// delay overflows and fires immediately, so long waits are taken in hops of
// this size rather than in one oversized timer.
const MAX_TIMEOUT_MS = 2_147_483_647;

type DecodedJWT = { exp: number; [key: string]: unknown };

function isDecodedJWT(obj: unknown): obj is DecodedJWT {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "exp" in obj &&
    typeof (obj as { exp: unknown }).exp === "number"
  );
}

// `exp` in seconds, or null when the token is absent, undecodable, or carries
// no numeric `exp`. Shared by the validity check and the expiry timer so both
// read expiry the same way.
function decodeExpSeconds(token: string | null): number | null {
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.decode(token);
    return isDecodedJWT(decoded) ? decoded.exp : null;
  } catch {
    return null;
  }
}

// Single source of truth for admin token validity: present, decodable to an
// object with a numeric `exp`, and not expired.
export function isTokenValid(token: string | null): boolean {
  const exp = decodeExpSeconds(token);
  if (exp === null) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return exp >= now;
}

/**
 * Milliseconds until `token` stops satisfying `isTokenValid`, or null when
 * there is nothing to wait for (no token, no numeric `exp`, already expired).
 */
export function msUntilTokenExpiry(
  token: string | null,
  now: number = Date.now(),
): number | null {
  const exp = decodeExpSeconds(token);
  if (exp === null) {
    return null;
  }
  // `exp` is seconds, not milliseconds, and `isTokenValid` compares it against
  // a floored second — so the token still reads as valid *at* exp * 1000 and
  // only turns invalid once the clock reaches the next whole second. Waiting
  // until exp * 1000 would fire up to a second early and leave the session
  // looking valid with no timer left to correct it.
  const remaining = (exp + 1) * 1000 - now;
  return remaining > 0 ? remaining : null;
}

/**
 * Arms a one-shot timer that calls `onExpire` at the moment `token` stops being
 * valid, and returns a cancel function. Expiry is an event driven by the
 * token's own `exp`; nothing here polls.
 */
export function scheduleTokenExpiry(
  token: string | null,
  onExpire: () => void,
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const arm = () => {
    const remaining = msUntilTokenExpiry(token);
    if (remaining === null) {
      // Nothing to arm: an absent or already-expired token is reported as
      // unauthenticated by `isTokenValid` without any help from a timer.
      return;
    }
    // Each hop recomputes the remainder from the clock, so a delay past the
    // 32-bit limit is chased without drift instead of overflowing to 0.
    timeoutId =
      remaining > MAX_TIMEOUT_MS
        ? setTimeout(arm, MAX_TIMEOUT_MS)
        : setTimeout(onExpire, remaining);
  };

  arm();

  return () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };
}

/** Removes the stored admin token. No-op during SSR. */
export function clearAdminTokenStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

const AdminTokenContext = createContext<AdminTokenContextType | undefined>(
  undefined,
);

export const useAdminToken = () => {
  const context = useContext(AdminTokenContext);
  if (!context) {
    throw new Error("useAdminToken must be used within an AdminTokenProvider");
  }
  return context;
};

export const AdminTokenProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    }
    return null;
  });

  // Latches the token the expiry timer fired for. Its job is to force the
  // re-render that recomputes `isAuthenticated`; holding the token itself
  // (rather than a bare counter) also makes expiry sticky per token, so a
  // backwards clock adjustment cannot resurrect a session already ended.
  const [expiredToken, setExpiredToken] = useState<string | null>(null);

  const isAuthenticated = useMemo(
    () => token !== expiredToken && isTokenValid(token),
    [token, expiredToken],
  );

  // Cross-tab sync. This is the only `storage` listener for the admin token;
  // per-page copies are redundant with it.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_TOKEN_STORAGE_KEY) {
        setToken(event.newValue);
      } else if (event.key === null) {
        // A null key means the whole store was cleared, which drops the token.
        setToken(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Re-armed whenever the token changes, cleared on unmount.
  useEffect(
    () => scheduleTokenExpiry(token, () => setExpiredToken(token)),
    [token],
  );

  // Ends the session locally and deliberately does not navigate: AdminAuthGate
  // already redirects whenever the token stops being valid, so redirecting here
  // as well would race it and give the app two answers to "where does a
  // signed-out admin land".
  const signOut = useCallback(() => {
    clearAdminTokenStorage();
    setToken(null);
  }, []);

  const value = useMemo<AdminTokenContextType>(
    () => ({ token, setToken, isAuthenticated, signOut }),
    [token, isAuthenticated, signOut],
  );

  return (
    <AdminTokenContext.Provider value={value}>
      {children}
    </AdminTokenContext.Provider>
  );
};
