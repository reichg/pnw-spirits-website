import { afterEach, describe, expect, it, vi } from "vitest";

// Pinned before the static import below, because SITE_ORIGIN is read from the
// environment at module scope. Without this the origin under test would be
// whatever the host machine happens to export, which is not a test.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://spirits.example";
});

import {
  SITE_NAME,
  SITE_ORIGIN,
  absoluteUrl,
  formatDate,
  jsonLdHtml,
  pageTitle,
  stableMediaUrl,
} from "./contentDetail";

// NOTE ON COVERAGE SCOPE
// ----------------------
// Pure helpers shared by /blogs/[id] and /recipes/[id]. Two of them are read at
// module scope (SITE_ORIGIN from the environment, the date formatter from the
// host timezone), so the cases that exercise a *different* module-scope input
// reload the module with vi.resetModules() and a dynamic import rather than
// trying to mutate a frozen binding.

/** Load a fresh copy of the module with the environment temporarily replaced. */
async function loadWithEnv(
  overrides: Record<string, string | undefined>,
): Promise<typeof import("./contentDetail")> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
  try {
    // Imported inside the window where the overrides are live: everything this
    // module derives from the environment is derived now, at import time.
    return await import("./contentDetail");
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

afterEach(() => {
  vi.resetModules();
});

describe("SITE_ORIGIN", () => {
  it("uses the configured public site URL", () => {
    expect(SITE_ORIGIN).toBe("https://spirits.example");
  });

  it("falls back to localhost when the variable is unset", async () => {
    const mod = await loadWithEnv({ NEXT_PUBLIC_SITE_URL: undefined });

    expect(mod.SITE_ORIGIN).toBe("http://localhost:3000");
  });

  it("falls back to localhost when the variable is set but empty", async () => {
    // Guards the `||` specifically. A build that exports the variable with no
    // value is the common misconfiguration, and `??` — the modern-looking
    // substitution — would accept "" and emit protocol-relative Open Graph and
    // JSON-LD URLs like "/api/media?key=...". Crawlers reject those: an og:image
    // must be absolute.
    const mod = await loadWithEnv({ NEXT_PUBLIC_SITE_URL: "" });

    expect(mod.SITE_ORIGIN).toBe("http://localhost:3000");
    expect(mod.stableMediaUrl("blogs/1.jpg")).toMatch(/^https?:\/\//);
  });
});

describe("stableMediaUrl", () => {
  it("builds an absolute /api/media URL on the configured origin", () => {
    expect(stableMediaUrl("recipes/7.jpg")).toBe(
      "https://spirits.example/api/media?key=recipes%2F7.jpg",
    );
  });

  it("never returns a signed S3 URL", () => {
    // The whole reason this helper exists. A presigned URL expires in an hour;
    // crawlers refetch an og:image and a JSON-LD image days later, at which
    // point the signature is dead and the card renders blank with no error
    // anywhere. /api/media is unauthenticated and re-signs per request.
    const url = stableMediaUrl("recipes/7.jpg");

    expect(url).not.toContain("X-Amz-");
    expect(url).not.toContain("amazonaws.com");
    expect(url).toContain("/api/media?key=");
  });

  it("encodes a key so it survives the round trip through the query string", () => {
    // Not a cosmetic concern: the slash in every stored key, and the &, ? and +
    // that an uploaded filename can carry, would otherwise be read by
    // /api/media as query-string syntax and truncate the key it looks up.
    const key = "blog-media/Old Fashioned & Rye?v=1+2.jpg";

    const parsed = new URL(stableMediaUrl(key));

    expect(parsed.searchParams.get("key")).toBe(key);
    expect(parsed.pathname).toBe("/api/media");
  });
});

describe("formatDate", () => {
  it("formats a stored timestamp as its UTC calendar date", () => {
    expect(formatDate(new Date("2026-07-06T05:36:00.000Z"))).toBe(
      "July 6, 2026",
    );
  });

  it("does not roll the last instant of a UTC day into the next", () => {
    expect(formatDate(new Date("2026-12-31T23:59:59.000Z"))).toBe(
      "December 31, 2026",
    );
  });

  it("formats identically on a host behind UTC", async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. /blogs/[id] shipped without
    // `timeZone: "UTC"` while /recipes/[id] had it, so on a UTC-7 host a post
    // stored at 2026-07-06T05:36Z rendered <time dateTime="...T05:36Z">July 5,
    // 2026</time> — the machine-readable attribute and the human text
    // disagreeing by a day on the same element. The control formatter below is
    // built under the same timezone and shows what an unpinned one does with
    // this instant, so this fails the moment the pin is removed rather than
    // passing incidentally on a UTC CI box.
    const previousTz = process.env.TZ;
    try {
      const mod = await loadWithEnv({ TZ: "America/Los_Angeles" });
      process.env.TZ = "America/Los_Angeles";
      const instant = new Date("2026-07-06T05:36:00.000Z");
      const unpinned = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(instant);

      expect(unpinned).toBe("July 5, 2026");
      expect(mod.formatDate(instant)).toBe("July 6, 2026");
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it("formats identically on a host ahead of UTC", async () => {
    const previousTz = process.env.TZ;
    try {
      const mod = await loadWithEnv({ TZ: "Pacific/Kiritimati" });
      process.env.TZ = "Pacific/Kiritimati";
      const instant = new Date("2026-12-31T23:59:59.000Z");
      const unpinned = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(instant);

      expect(unpinned).toBe("January 1, 2027");
      expect(mod.formatDate(instant)).toBe("December 31, 2026");
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it("uses the en-US long form rather than the host locale's", () => {
    // Pinned alongside the timezone for the same reason: the two pages print
    // this string into prose, so it must not change shape with the server's
    // LANG. A bare toLocaleDateString() is what this replaced.
    expect(formatDate(new Date("2026-03-14T12:00:00.000Z"))).toBe(
      "March 14, 2026",
    );
  });
});

describe("absoluteUrl", () => {
  it("resolves a root-relative path against the configured origin", () => {
    expect(absoluteUrl("/blogs/4")).toBe("https://spirits.example/blogs/4");
  });

  it("follows the origin when it is reconfigured", async () => {
    const mod = await loadWithEnv({
      NEXT_PUBLIC_SITE_URL: "https://staging.example",
    });

    expect(mod.absoluteUrl("/recipes/7")).toBe(
      "https://staging.example/recipes/7",
    );
  });

  it("is the one builder behind every self-referential URL a detail page emits", () => {
    // The canonical link, og:url and the JSON-LD mainEntityOfPage all name the
    // page they sit on. A crawler that sees three spellings of one page treats
    // at least two of them as other pages, so they are built once, here.
    const url = absoluteUrl("/blogs/4");

    expect(url).toBe(absoluteUrl("/blogs/4"));
    expect(new URL(url).pathname).toBe("/blogs/4");
  });
});

describe("pageTitle", () => {
  it("appends the site name to the page's own subject", () => {
    expect(pageTitle("The Rise of Northwest Amaro")).toBe(
      "The Rise of Northwest Amaro | The PNW Spirits",
    );
  });

  it("produces the same suffix for a not-found title", () => {
    // The suffix was written out at four sites across the two pages, two of
    // them the not-found variants nobody looks at — which is exactly where a
    // rename would have been left half-applied.
    expect(pageTitle("Article not found")).toBe(
      "Article not found | The PNW Spirits",
    );
    expect(pageTitle("Recipe not found")).toBe(
      "Recipe not found | The PNW Spirits",
    );
  });

  it("spells the site name exactly once, from the exported constant", () => {
    expect(SITE_NAME).toBe("The PNW Spirits");
    expect(pageTitle("x").endsWith(`| ${SITE_NAME}`)).toBe(true);
  });
});

describe("jsonLdHtml", () => {
  it("escapes every < so a stored value cannot terminate the script block", () => {
    // The contents of a <script> are not parsed as markup but ARE terminated
    // by the literal text "</script>": a title carrying one would close the
    // block early and hand the rest of the row to the HTML parser as markup.
    // That is stored XSS, not a broken block.
    const html = jsonLdHtml({
      headline: "Break</script><script>alert(1)</script> Out",
    });

    expect(html).not.toContain("<");
    expect(html).not.toContain("</script>");
  });

  it("emits the escape sequence itself, not a literal <", () => {
    // THE PIN, and it is the assertion the other two cannot make. The
    // replacement is written with TWO backslashes in the source, which is the
    // six characters backslash-u-0-0-3-c at runtime. Written with one it is
    // the single character "<", the pass becomes a no-op, and the diff reads
    // identically. ESCAPED is built from a char code for the same reason:
    // a literal here could be halved by a tool between the author and the
    // file and the pin would quietly weaken with it.
    const ESCAPED = String.fromCharCode(92) + "u003c";

    const html = jsonLdHtml({ headline: "<b>" });

    expect(html).toContain(ESCAPED);
    expect(html).toBe(`{"headline":"${ESCAPED}b>"}`);
    expect(html).not.toContain("<");
  });

  it("round-trips a hostile value through JSON.parse unchanged", () => {
    // The escape is valid inside a JSON string and parses back to "<", so the
    // structured data a crawler reads is not altered by the defence.
    const headline = "Break</script><script>alert(1)</script> Out";

    const parsed = JSON.parse(jsonLdHtml({ headline, nested: { headline } }));

    expect(parsed.headline).toBe(headline);
    expect(parsed.nested.headline).toBe(headline);
  });

  it("escapes < wherever it appears, including in a key and in an array", () => {
    const html = jsonLdHtml({
      "<key>": ["<a>", { "@id": "https://x.example/<b>" }],
    });

    expect(html).not.toContain("<");
    expect(JSON.parse(html)["<key>"][1]["@id"]).toBe("https://x.example/<b>");
  });
});
