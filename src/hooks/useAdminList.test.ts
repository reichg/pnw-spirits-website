import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  adminListQuery,
  clampedPage,
  fetchAdminListPage,
  rowsAtKey,
  useAdminList,
  type AdminList,
  type AdminListRequest,
} from "./useAdminList";
import type { AdminFetch } from "./useAdminFetch";
import { AdminTokenProvider } from "@/components/admin/AdminTokenContext";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and no
// @testing-library/react (see vitest.config.ts / package.json), and no new
// dependency may be added.
//
// AN EARLIER VERSION OF THIS NOTE CLAIMED THE HOOK COULD NOT BE RENDERED AT ALL,
// because `useAdminFetch` "reads a React context whose context object is not
// exported, so no stub provider can be built". That was wrong, in the same way
// and for the same reason as the copy of it in useAdminFetch.test.ts:
// `AdminTokenProvider` is exported, no stub is wanted, and rendering a probe
// component inside the real provider under renderToStaticMarkup works. The hook
// IS mounted below, and its first-render state is asserted rather than assumed.
//
// What a single static render genuinely cannot show is everything that happens
// AFTER it, because the effect never runs and there is no second render to
// compare against. Stated as a list rather than left implicit:
//   - the effect re-running when `adminFetch` identity changes (the
//     token-after-mount case that replaces an anonymous first load);
//   - `setSearch` resetting the page to 1 in the same commit as the term;
//   - `loading` going back to false when a read settles (its true half IS
//     asserted below, on first render);
//   - the clamp's `setPage` re-arming the effect rather than merely
//     relabelling the pager;
//   - THE SUPERSEDE/UNMOUNT GUARD. The effect's `active` flag discards a
//     settled result whose read has been superseded by a new page or term, or
//     whose screen has unmounted. It is the one item on this list that is a
//     correctness guard rather than a convenience, and it was missing from this
//     list entirely until the review gate caught the omission: without it a slow
//     page-1 read landing after a fast page-2 read repaints page 1's rows under
//     page 2's pager. It lives inside the effect closure, so no seam exposes it.
// The live drive on /admin/blogs and /admin/recipes is what currently covers
// those.
//
// Everything WITH behaviour otherwise lives in non-React seams, and all three
// are fully covered below:
//   - `adminListQuery`  - the query-string contract, including the encoding of a
//                         user-supplied search term;
//   - `clampedPage`     - the delete-the-last-record-on-the-last-page clamp;
//   - `fetchAdminListPage` - the whole read against a stubbed adminFetch: the
//                         success envelope, every failure path, and the promise
//                         that it never throws.
// Plus `rowsAtKey`, the one place an `unknown` body is asserted into `T[]`.

type Row = { id: number; title: string };

const REQUEST: AdminListRequest<Row> = {
  endpoint: "/api/blogs",
  page: 1,
  pageSize: 10,
  search: "",
  select: rowsAtKey<Row>("blogs"),
  loadFailedMessage: "These posts could not be loaded.",
};

/**
 * An adminFetch that answers with `respond()` and records the URL it was given.
 * A factory rather than a `Response` so a test can make the request itself
 * reject, which is the dead-network path.
 */
function stubAdminFetch(respond: Response | (() => Response)): {
  fetch: AdminFetch;
  urls: string[];
} {
  const urls: string[] = [];
  const fetch: AdminFetch = vi.fn(async (input: string) => {
    urls.push(input);
    return typeof respond === "function" ? respond() : respond;
  });
  return { fetch, urls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("adminListQuery", () => {
  it("always sends page and pageSize", () => {
    expect(adminListQuery(3, 10, "")).toBe("page=3&pageSize=10");
  });

  it("omits an empty search rather than sending search=", () => {
    // Equivalent to the route either way, but it keeps the unfiltered request
    // byte-identical to the one the public archives send, and so on the same
    // Redis cache key.
    expect(adminListQuery(1, 10, "")).not.toContain("search");
  });

  it("includes a search term when there is one", () => {
    expect(adminListQuery(1, 10, "old fashioned")).toBe(
      "page=1&pageSize=10&search=old+fashioned",
    );
  });

  it("encodes a term that would otherwise be read as more parameters", () => {
    // The search box is user input. Concatenated raw, this term would reach the
    // route as `search=a` plus a bogus `pageSize=99` and a fragment.
    const query = adminListQuery(1, 10, "a&pageSize=99#b");

    expect(query).toBe("page=1&pageSize=10&search=a%26pageSize%3D99%23b");
    expect(new URLSearchParams(query).get("pageSize")).toBe("10");
    expect(new URLSearchParams(query).get("search")).toBe("a&pageSize=99#b");
  });

  it("encodes a term with characters that are meaningful in a URL path", () => {
    const query = adminListQuery(1, 10, "100% rye / no. 2 + a ?");

    expect(new URLSearchParams(query).get("search")).toBe(
      "100% rye / no. 2 + a ?",
    );
    expect(query).not.toContain(" ");
  });
});

describe("clampedPage", () => {
  it("leaves a page that still exists alone", () => {
    expect(clampedPage(2, 40, 10)).toBe(2);
    expect(clampedPage(4, 40, 10)).toBe(4);
  });

  it("pulls back to the last page that exists", () => {
    // The regression this hook exists to hold: 31 records over 4 pages, the
    // 31st is deleted, and page 4 no longer exists.
    expect(clampedPage(4, 30, 10)).toBe(3);
  });

  it("lands an emptied collection on page 1, never on page 0", () => {
    expect(clampedPage(3, 0, 10)).toBe(1);
    expect(clampedPage(1, 0, 10)).toBe(1);
  });

  it("never clamps upward when the collection grew", () => {
    // A record added while the admin sits on page 1 must not move them.
    expect(clampedPage(1, 400, 10)).toBe(1);
  });

  it("degrades to page 1 for a total the server did not send", () => {
    // `totalPagesFor` floors a NaN/negative total at one page, so the clamp
    // cannot produce a page number no pager can render.
    expect(clampedPage(7, Number.NaN, 10)).toBe(1);
    expect(clampedPage(7, -5, 10)).toBe(1);
  });

  it("clamps exactly at a full last page", () => {
    // 30 records at 10 a page is 3 pages, not 4: the off-by-one that would
    // strand the admin on an empty page 4.
    expect(clampedPage(4, 30, 10)).toBe(3);
    expect(clampedPage(3, 30, 10)).toBe(3);
  });
});

describe("rowsAtKey", () => {
  const select = rowsAtKey<Row>("blogs");

  it("returns the rows under its key", () => {
    expect(select({ blogs: [{ id: 1, title: "a" }], total: 1 })).toEqual([
      { id: 1, title: "a" },
    ]);
  });

  it("returns an empty list for a missing key, a non-array, or a non-object", () => {
    // A route that answered 200 with an unexpected shape must not reach `.map()`
    // in a render.
    for (const payload of [
      { total: 0 },
      { blogs: null },
      { blogs: "none" },
      { blogs: { 0: { id: 1 } } },
      null,
      "not json",
      42,
    ]) {
      expect(select(payload), JSON.stringify(payload) ?? "undefined").toEqual(
        [],
      );
    }
  });

  it("reads only its own key", () => {
    expect(
      rowsAtKey<Row>("recipes")({ blogs: [{ id: 1, title: "a" }] }),
    ).toEqual([]);
  });
});

describe("fetchAdminListPage", () => {
  it("requests the endpoint with the paging query appended", async () => {
    const { fetch, urls } = stubAdminFetch(
      jsonResponse({ blogs: [], total: 0 }),
    );

    await fetchAdminListPage(fetch, { ...REQUEST, page: 3, search: "rye" });

    expect(urls).toEqual(["/api/blogs?page=3&pageSize=10&search=rye"]);
  });

  it("never puts a credential in the URL", async () => {
    // The bearer token belongs in a header, which `adminFetch` owns. This
    // asserts the query this module builds carries nothing but the three params.
    const { fetch, urls } = stubAdminFetch(
      jsonResponse({ blogs: [], total: 0 }),
    );

    await fetchAdminListPage(fetch, { ...REQUEST, search: "x" });

    const params = new URLSearchParams(urls[0].split("?")[1]);
    expect([...params.keys()].sort()).toEqual(["page", "pageSize", "search"]);
  });

  it("returns the selected rows and the total on success", async () => {
    const { fetch } = stubAdminFetch(
      jsonResponse({
        blogs: [
          { id: 1, title: "a" },
          { id: 2, title: "b" },
        ],
        total: 43,
        page: 1,
        pageSize: 10,
      }),
    );

    const result = await fetchAdminListPage(fetch, REQUEST);

    expect(result).toEqual({
      ok: true,
      items: [
        { id: 1, title: "a" },
        { id: 2, title: "b" },
      ],
      total: 43,
    });
  });

  it("reports a total of 0 when the envelope omits it or sends a non-number", async () => {
    for (const body of [
      { blogs: [] },
      { blogs: [], total: "43" },
      { blogs: [], total: null },
    ]) {
      const { fetch } = stubAdminFetch(jsonResponse(body));

      const result = await fetchAdminListPage(fetch, REQUEST);

      expect(result).toEqual({ ok: true, items: [], total: 0 });
    }
  });

  it("surfaces the server's own message for a rejected read", async () => {
    const { fetch } = stubAdminFetch(
      jsonResponse({ error: "Search term is too long." }, 400),
    );

    const result = await fetchAdminListPage(fetch, REQUEST);

    expect(result).toEqual({ ok: false, error: "Search term is too long." });
  });

  it("substitutes the fallback for a server message that is not safe to show", async () => {
    // A stack trace, a driver dump or a proxy's HTML page must never become UI
    // text. `readAdminError` owns that rule; this pins that the read goes
    // through it rather than reading `{ error }` itself.
    const { fetch } = stubAdminFetch(
      jsonResponse(
        { error: "PrismaClientKnownRequestError\n    at library.js:1:1" },
        500,
      ),
    );

    expect(await fetchAdminListPage(fetch, REQUEST)).toEqual({
      ok: false,
      error: REQUEST.loadFailedMessage,
    });
  });

  it("falls back for a rejected read with a non-JSON body", async () => {
    const { fetch } = stubAdminFetch(
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    expect(await fetchAdminListPage(fetch, REQUEST)).toEqual({
      ok: false,
      error: REQUEST.loadFailedMessage,
    });
  });

  it("fails rather than throwing when the request itself rejects", async () => {
    const { fetch } = stubAdminFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    expect(await fetchAdminListPage(fetch, REQUEST)).toEqual({
      ok: false,
      error: REQUEST.loadFailedMessage,
    });
  });

  it("fails rather than throwing when a 200 body is not JSON", async () => {
    const { fetch } = stubAdminFetch(new Response("<html>hi</html>"));

    expect(await fetchAdminListPage(fetch, REQUEST)).toEqual({
      ok: false,
      error: REQUEST.loadFailedMessage,
    });
  });

  it("fails rather than throwing when the selector throws", async () => {
    // The hook clears `loading` on the settled result with no `finally`, so an
    // escaping throw would leave the screen rendering nothing at all, forever.
    const { fetch } = stubAdminFetch(jsonResponse({ blogs: [], total: 0 }));

    expect(
      await fetchAdminListPage(fetch, {
        ...REQUEST,
        select: () => {
          throw new Error("bad row");
        },
      }),
    ).toEqual({ ok: false, error: REQUEST.loadFailedMessage });
  });

  it("clears the rows on every failure rather than leaving a stale page", async () => {
    // The union is what enforces this: a caller cannot apply the error without
    // seeing that there are no items to apply with it.
    const { fetch } = stubAdminFetch(jsonResponse({ error: "Nope." }, 400));

    const result = await fetchAdminListPage(fetch, REQUEST);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("items");
    expect(result).not.toHaveProperty("total");
  });

  it("never reveals the request or any credential in the error it returns", async () => {
    const { fetch } = stubAdminFetch(jsonResponse({ error: "Nope." }, 401));

    const result = await fetchAdminListPage(fetch, {
      ...REQUEST,
      search: "secret-term",
    });

    expect(result).toEqual({ ok: false, error: "Nope." });
  });
});

/**
 * The hook the note above once called unrenderable, rendered.
 *
 * One static render inside the real `AdminTokenProvider`. That reaches the state
 * a screen paints on its FIRST frame, before any read has settled - which is a
 * contract with a visible failure mode of its own, not a formality. Every
 * post-effect transition remains out of reach and is listed in the note.
 */
describe("useAdminList — the frame a list paints before its first read settles", () => {
  function mountList(): AdminList<Row> {
    let snapshot: AdminList<Row> | null = null;

    function Probe(): React.ReactNode {
      snapshot = useAdminList<Row>({
        endpoint: REQUEST.endpoint,
        pageSize: REQUEST.pageSize,
        select: REQUEST.select,
        loadFailedMessage: REQUEST.loadFailedMessage,
      });
      return null;
    }

    renderToStaticMarkup(
      React.createElement(AdminTokenProvider, null, React.createElement(Probe)),
    );

    if (snapshot === null) throw new Error("useAdminList probe did not render");
    return snapshot;
  }

  it("opens on page 1 with nothing loaded and no error", () => {
    const list = mountList();

    expect(list.page).toBe(1);
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);
    expect(list.search).toBe("");
    expect(list.loadError).toBe("");
  });

  it("opens LOADING, so an empty first frame never reads as an empty collection", () => {
    // The distinction the screens render on: `items: []` alone cannot tell "no
    // records" from "not fetched yet", and a list that opened at
    // `loading: false` would flash its "no posts yet" empty state over a
    // request already in flight - on every single visit to the screen.
    expect(mountList().loading).toBe(true);
  });

  it("reports at least one page, so the pager can always render a position", () => {
    // `totalPagesFor` floors at 1. A 0 here would make the count line read
    // "Page 1 of 0" on first paint.
    expect(mountList().totalPages).toBe(1);
  });

  it("hands back the three callbacks a screen wires up on mount", () => {
    // `setSearch` and `setPage` are dependencies of AdminSearchField's debounce
    // effect and Pagination's handler; `reload` is what a screen calls after a
    // write. All three must exist from the first render, before any read lands.
    const list = mountList();

    expect(typeof list.setPage).toBe("function");
    expect(typeof list.setSearch).toBe("function");
    expect(typeof list.reload).toBe("function");
  });

  it("issues no request during render", () => {
    // The read is armed by an effect, not by the render body. A render that
    // fetched would re-fetch on every re-render of the screen.
    const spy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);

    mountList();

    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
