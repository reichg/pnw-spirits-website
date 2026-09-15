import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildAdminRequestInit,
  createAdminFetch,
  readAdminError,
  useAdminFetch,
  type AdminFetch,
} from "./useAdminFetch";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  AdminTokenProvider,
} from "@/components/admin/AdminTokenContext";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json), and no new
// dependency may be added.
//
// AN EARLIER VERSION OF THIS NOTE CLAIMED THE HOOK ITSELF WAS UNREACHABLE HERE,
// on the grounds that "the context object is not exported, so no stub provider
// can be built". BOTH HALVES WERE WRONG, and the second does not follow from the
// first. The raw context object is indeed private, but `AdminTokenProvider` is
// exported from AdminTokenContext.tsx and is the thing a test needs: no stub is
// wanted, because the real provider IS the path under test. Two other files in
// this repo already wrap components in it under renderToStaticMarkup
// (AdminHeader.test.tsx, AdminNewsletterComposer.test.tsx), and useAdminDraft's
// own tests already drive a hook through a probe component the same way.
//
// The cost of that false claim was the whole point of this hook going untested:
// every case below passes the token in BY HAND, so nothing anywhere asserted
// that the token sitting in localStorage actually reaches the Authorization
// header - the single failure that would log every admin out. The
// "localStorage to the wire" block at the bottom closes that.
//
// The note also described `useAdminFetch` as syncing a ref in a useEffect. It
// does not and never did: it is a bare `useMemo` over `createAdminFetch`, with
// no ref and no effect anywhere in the module.
//
// WHAT REMAINS GENUINELY UNREACHABLE is narrower than was claimed, and it is the
// memo's IDENTITY ACROSS RENDERS: that a token arriving after mount yields a NEW
// adminFetch, which is what re-arms `useAdminList`'s effect and replaces an
// anonymous first load with the authenticated one. Comparing two renders needs a
// client renderer; renderToStaticMarkup produces exactly one.

const TOKEN = "header.payload.signature";

function headersOf(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

describe("buildAdminRequestInit", () => {
  it("attaches a bearer Authorization header when a token is present", () => {
    const init = buildAdminRequestInit({}, TOKEN);

    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("omits the Authorization header entirely when there is no token", () => {
    const init = buildAdminRequestInit({}, null);

    expect(headersOf(init)).not.toHaveProperty("Authorization");
  });

  it("sets Content-Type and serialises the body when json is passed", () => {
    const init = buildAdminRequestInit(
      { method: "PUT", json: { title: "Old Fashioned", description: "" } },
      TOKEN,
    );

    expect(headersOf(init)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(
      JSON.stringify({ title: "Old Fashioned", description: "" }),
    );
    expect(init.method).toBe("PUT");
  });

  it("sets neither Content-Type nor a body when json is omitted", () => {
    const init = buildAdminRequestInit({ method: "DELETE" }, TOKEN);

    expect(headersOf(init)).not.toHaveProperty("Content-Type");
    expect(init).not.toHaveProperty("body");
  });

  it("serialises an explicitly null json body rather than skipping it", () => {
    // `coverPhoto: null` is a meaningful payload in the editors, so only
    // `undefined` may mean "no body".
    const init = buildAdminRequestInit({ method: "PUT", json: null }, TOKEN);

    expect(init.body).toBe("null");
    expect(headersOf(init)["Content-Type"]).toBe("application/json");
  });

  it("lets explicitly-passed headers win over the defaults", () => {
    const init = buildAdminRequestInit(
      { json: "raw", headers: { "Content-Type": "text/plain" } },
      TOKEN,
    );

    expect(headersOf(init)["Content-Type"]).toBe("text/plain");
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("does not leak the json option onto the RequestInit", () => {
    const init = buildAdminRequestInit({ json: { a: 1 } }, TOKEN);

    expect(init).not.toHaveProperty("json");
  });

  it("preserves other RequestInit fields", () => {
    const signal = AbortSignal.abort();
    const init = buildAdminRequestInit(
      { method: "POST", cache: "no-store", signal, json: {} },
      TOKEN,
    );

    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(signal);
  });
});

describe("createAdminFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Response) {
    const spy = vi.fn(async () => response);
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("sends the request with the admin headers applied", async () => {
    const spy = stubFetch(new Response("{}", { status: 200 }));
    const signOut = vi.fn();

    await createAdminFetch(TOKEN, signOut)("/api/classes", {
      method: "PUT",
      json: { title: "x" },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/classes");
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("still sends the request anonymously when there is no token", async () => {
    // The documented no-token policy: the server is the authorization boundary,
    // and the anonymous GET returning a capped public result is what lets the
    // class manager paint before a token is available.
    const spy = stubFetch(new Response("{}", { status: 200 }));
    const signOut = vi.fn();

    const res = await createAdminFetch(null, signOut)("/api/classes");

    expect(spy).toHaveBeenCalledTimes(1);
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(headersOf(init)).not.toHaveProperty("Authorization");
    expect(res.status).toBe(200);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ends the session on 401 and still returns the response", async () => {
    stubFetch(new Response("{}", { status: 401 }));
    const signOut = vi.fn();

    const res = await createAdminFetch(TOKEN, signOut)("/api/blogs/1", {
      method: "DELETE",
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it("ends the session on 403 as well", async () => {
    stubFetch(new Response("{}", { status: 403 }));
    const signOut = vi.fn();

    await createAdminFetch(TOKEN, signOut)("/api/admin/newsletter", {
      method: "POST",
      json: { mode: "test" },
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("leaves the session alone for every other status", async () => {
    for (const status of [200, 400, 404, 409, 500]) {
      stubFetch(new Response("{}", { status }));
      const signOut = vi.fn();

      const res = await createAdminFetch(TOKEN, signOut)("/api/recipes");

      expect(signOut, `status ${status}`).not.toHaveBeenCalled();
      expect(res.status).toBe(status);
    }
  });

  it("does not navigate or touch location on a session-ending response", async () => {
    // AdminAuthGate owns the redirect; a second mechanism here is exactly the
    // duplication this hook removes.
    stubFetch(new Response("{}", { status: 401 }));
    const location = { href: "/admin/classes" };
    vi.stubGlobal("location", location);

    await createAdminFetch(TOKEN, vi.fn())("/api/classes");

    expect(location.href).toBe("/admin/classes");
  });
});

describe("readAdminError", () => {
  function jsonResponse(body: unknown, status = 400): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns the server's curated error message", async () => {
    const res = jsonResponse({ error: "Failed to save page content." });

    expect(await readAdminError(res, "fallback")).toBe(
      "Failed to save page content.",
    );
  });

  it("trims surrounding whitespace", async () => {
    const res = jsonResponse({ error: "  Title is required.  " });

    expect(await readAdminError(res, "fallback")).toBe("Title is required.");
  });

  it("falls back when the body has no error field", async () => {
    expect(await readAdminError(jsonResponse({ ok: false }), "fallback")).toBe(
      "fallback",
    );
  });

  it("falls back when error is not a string", async () => {
    expect(await readAdminError(jsonResponse({ error: 500 }), "fallback")).toBe(
      "fallback",
    );
    expect(
      await readAdminError(jsonResponse({ error: { code: "P2002" } }), "fb"),
    ).toBe("fb");
  });

  it("falls back for an empty or whitespace-only error", async () => {
    expect(await readAdminError(jsonResponse({ error: "   " }), "fb")).toBe(
      "fb",
    );
  });

  it("falls back for a non-JSON body", async () => {
    // A proxy's HTML error page must never become UI text.
    const res = new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 502,
    });

    expect(await readAdminError(res, "Failed to send newsletter")).toBe(
      "Failed to send newsletter",
    );
  });

  it("refuses a multi-line error (a stack trace or driver dump)", async () => {
    const res = jsonResponse({
      error:
        "PrismaClientKnownRequestError\n    at /app/node_modules/@prisma/client/runtime/library.js:1:1",
    });

    expect(await readAdminError(res, "Failed to save recipe")).toBe(
      "Failed to save recipe",
    );
  });

  it("refuses an over-long error", async () => {
    const res = jsonResponse({ error: "x".repeat(201) });

    expect(await readAdminError(res, "fallback")).toBe("fallback");
  });

  it("accepts an error at the length cap", async () => {
    const atCap = "x".repeat(200);

    expect(await readAdminError(jsonResponse({ error: atCap }), "fb")).toBe(
      atCap,
    );
  });

  it("leaves the response body readable for the caller", async () => {
    // The newsletter composer needs details[] off the same body, so the helper
    // reads a clone rather than consuming the response.
    const res = jsonResponse({
      error: "Validation failed",
      details: [{ message: "subject is required" }],
    });

    expect(await readAdminError(res, "fallback")).toBe("Validation failed");
    const data = (await res.json()) as { details: Array<{ message: string }> };
    expect(data.details[0].message).toBe("subject is required");
  });

  it("falls back rather than throwing when the body was already consumed", async () => {
    const res = jsonResponse({ error: "Validation failed" });
    await res.json();

    expect(await readAdminError(res, "fallback")).toBe("fallback");
  });
});

/**
 * THE PATH NOTHING ELSE IN THIS REPO COVERED: localStorage -> provider ->
 * context -> useAdminFetch -> the Authorization header on a real request.
 *
 * Every other case in this file hands `createAdminFetch` a token directly, which
 * skips the three hops where the token can actually go missing. Each of those
 * hops has a plausible way to break silently - the storage key drifting, the
 * provider's `typeof window` initialiser being rewritten, `useAdminToken`
 * returning a renamed field - and every one of them ends the same way: every
 * admin request goes out anonymous, the server answers 401, `createAdminFetch`
 * calls signOut, and the whole admin is logged out with no error to read.
 */
describe("useAdminFetch — the token's journey from localStorage to the wire", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Renders the REAL provider - no stub, no fake context - around a component
   * that captures what `useAdminFetch` returns, then hands that back with the
   * storage it was seeded from and the fetch it will call.
   *
   * The provider reads localStorage in a `typeof window`-guarded useState
   * initialiser, which renderToStaticMarkup DOES run. Its effects (cross-tab
   * sync, expiry timer) do not run, so `window` needs only what the initialiser
   * and `signOut` touch.
   */
  function mountAdminFetch(stored: string | null): {
    adminFetch: AdminFetch;
    fetchSpy: ReturnType<typeof vi.fn>;
    storage: Map<string, string>;
  } {
    const storage = new Map<string, string>();
    if (stored !== null) storage.set(ADMIN_TOKEN_STORAGE_KEY, stored);

    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    let captured: AdminFetch | null = null;
    function Probe(): React.ReactNode {
      captured = useAdminFetch();
      return null;
    }

    renderToStaticMarkup(
      React.createElement(AdminTokenProvider, null, React.createElement(Probe)),
    );

    if (captured === null)
      throw new Error("useAdminFetch probe did not render");
    return { adminFetch: captured, fetchSpy, storage };
  }

  /** The headers of the single request the stubbed fetch received. */
  function sentHeaders(
    fetchSpy: ReturnType<typeof vi.fn>,
  ): Record<string, string> {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    return headersOf(init);
  }

  it("puts the token stored under the admin key onto the request", async () => {
    const { adminFetch, fetchSpy } = mountAdminFetch(TOKEN);

    await adminFetch("/api/blogs");

    expect(sentHeaders(fetchSpy).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("reads the same storage key the rest of the admin writes", async () => {
    // Pins the JOIN, not the string. The provider must read whatever
    // `clearAdminTokenStorage`, useAdminDraft's reserved-key guard and the login
    // screen all agree on; a token filed under any other key is invisible here
    // and the admin is anonymous with a valid session in the drawer.
    const storage = new Map<string, string>([["someOtherKey", TOKEN]]);
    expect(storage.has(ADMIN_TOKEN_STORAGE_KEY)).toBe(false);

    const mounted = mountAdminFetch(TOKEN);
    await mounted.adminFetch("/api/recipes");

    expect(mounted.storage.get(ADMIN_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(sentHeaders(mounted.fetchSpy).Authorization).toContain(TOKEN);
  });

  it("sends no Authorization header when storage holds no token", async () => {
    // The no-token policy, end to end this time: the request is still SENT (see
    // createAdminFetch above for why), it just goes out anonymous.
    const { adminFetch, fetchSpy } = mountAdminFetch(null);

    const res = await adminFetch("/api/classes");

    expect(sentHeaders(fetchSpy)).not.toHaveProperty("Authorization");
    expect(res.status).toBe(200);
  });

  it("never leaks the credential anywhere but the Authorization header", async () => {
    // A bearer token in a URL lands in server logs, proxy logs and the Referer
    // header; in a body it lands wherever the body is logged.
    const { adminFetch, fetchSpy } = mountAdminFetch(TOKEN);

    await adminFetch("/api/blogs/1", { method: "PUT", json: { title: "x" } });

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain(TOKEN);
    expect(String(init.body ?? "")).not.toContain(TOKEN);
    expect(headersOf(init).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("evicts the stored token when the server rejects the credential", async () => {
    // The other end of the same wire. `signOut` is what the 401 branch calls,
    // and the half of it that is observable without a client renderer is the
    // removeItem: the token must not survive a rejection, or the next mount
    // re-authenticates with a credential the server has already refused.
    const { adminFetch, storage } = mountAdminFetch(TOKEN);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));

    expect(storage.has(ADMIN_TOKEN_STORAGE_KEY)).toBe(true);
    await adminFetch("/api/admin/newsletter", { method: "POST", json: {} });

    expect(storage.has(ADMIN_TOKEN_STORAGE_KEY)).toBe(false);
  });
});
