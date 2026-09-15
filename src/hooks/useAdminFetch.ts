import { useMemo } from "react";

import { useAdminToken } from "@/components/admin/AdminTokenContext";

// `headers` is narrowed from `HeadersInit` to a plain record because this helper
// merges header objects by spreading them. Spreading a `Headers` instance or a
// `[name, value][]` array silently yields `{}`, so the four hand-rolled copies
// this replaces were one `new Headers(...)` away from dropping the bearer token.
// Narrowing turns that into a compile error instead of a runtime 401.
export type AdminFetchInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  /**
   * Request body as a value to be JSON-serialized. Passing it also sets
   * `Content-Type: application/json`; omit it for GET/DELETE.
   */
  json?: unknown;
};

export type AdminFetch = (
  input: string,
  init?: AdminFetchInit,
) => Promise<Response>;

// Statuses that mean the bearer credential is no longer good enough: 401 is an
// absent/expired token, 403 a rejected one. Neither is recoverable without a new
// login, so both end the session.
const SESSION_ENDING_STATUSES: ReadonlySet<number> = new Set([401, 403]);

// A server `{ error }` string is only shown to the user when it looks like one of
// our own curated API messages: single-line and under this cap. A proxy's HTML
// error page, a driver dump or a stack trace fails that shape and is replaced by
// the caller's fallback, so an unexpected upstream body can never become UI text.
const MAX_SURFACED_ERROR_LENGTH = 200;

// Merge the admin defaults into a `RequestInit`. Explicitly-passed `headers` win
// over the defaults (the `AdminClassManager` behaviour this generalizes), so a
// caller can still override `Content-Type` for a non-JSON payload.
//
// The Authorization header is omitted entirely when there is no token rather
// than sent empty: an empty bearer is a malformed credential, and some proxies
// treat it differently from an absent one.
export function buildAdminRequestInit(
  init: AdminFetchInit,
  token: string | null,
): RequestInit {
  const { json, headers, ...rest } = init;
  return {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  };
}

// The non-React seam `useAdminFetch` is built from, kept separate so the request
// shaping and the session-ending branch are testable without a renderer.
//
// NO-TOKEN POLICY: a tokenless call is still sent, unauthenticated. The four
// copies each answered this differently; sending is correct here because
//   1. the server is the authorization boundary, so a client-side rejection adds
//      a second, client-only failure mode with a different shape than the 401 it
//      is imitating - the exact duplication this hook exists to remove;
//   2. the admin GETs are legitimately anonymous and return a capped public
//      result, which `AdminClassManager.reload` actively depends on to paint
//      before a token is available; and
//   3. `AdminAuthGate` already blocks the entire admin subtree until the session
//      is valid, so a tokenless call is a deliberate anonymous read, not a leak.
// Callers that must not run anonymously should gate on `isAuthenticated` from
// `useAdminToken` rather than expect this to throw.
export function createAdminFetch(
  token: string | null,
  onSessionEnded: () => void,
): AdminFetch {
  return async (input, init = {}) => {
    const res = await fetch(input, buildAdminRequestInit(init, token));
    if (SESSION_ENDING_STATUSES.has(res.status)) {
      onSessionEnded();
    }
    return res;
  };
}

// Single authenticated fetch for every admin surface.
//
// DOES NOT NAVIGATE. `AdminAuthGate` already watches session validity and owns
// the redirect to /admin/login; clearing the token here is enough to trigger it.
// Two independent redirect mechanisms is what produced the four different
// behaviours this replaces (a hard `window.location.href`, a `router.push`, and
// an 800ms-delayed hard navigation that raced the gate).
//
// The returned function is memoised on the token so that a token arriving after
// mount produces a NEW `adminFetch` identity, re-arming callers' `useCallback`/
// `useEffect` dependency chains - `AdminClassManager.reload` relies on exactly
// that to replace an anonymous, capped first load with the authenticated one.
export function useAdminFetch(): AdminFetch {
  const { token, signOut } = useAdminToken();

  // `signOut` is a `useCallback(..., [])` in AdminTokenProvider, so it is stable
  // for the life of the provider and the effective memo key is the token alone.
  // Listing it is what keeps that assumption honest: if it ever stops being
  // stable, callers get a new `adminFetch` and reload rather than a stale
  // closure that signs out through a dead setState.
  return useMemo(() => createAdminFetch(token, signOut), [token, signOut]);
}

// Shared replacement for the "try to read `{ error }`, else use a generic
// string" block each of the four copies hand-rolled. Centralising it is what
// makes the safe-message rule enforceable in one place instead of four.
//
// Reads a CLONE, so the caller can still consume `res.json()` itself (the
// newsletter composer needs `details[]` off the same body). Never throws, and
// never returns a token or any part of the request.
export async function readAdminError(
  res: Response,
  fallback: string,
): Promise<string> {
  if (res.bodyUsed) return fallback;
  try {
    const data: unknown = await res.clone().json();
    if (typeof data !== "object" || data === null || !("error" in data)) {
      return fallback;
    }
    const message = (data as { error: unknown }).error;
    if (typeof message !== "string") return fallback;
    const trimmed = message.trim();
    if (
      trimmed.length === 0 ||
      trimmed.length > MAX_SURFACED_ERROR_LENGTH ||
      /[\r\n]/.test(trimmed)
    ) {
      return fallback;
    }
    return trimmed;
  } catch {
    return fallback;
  }
}
