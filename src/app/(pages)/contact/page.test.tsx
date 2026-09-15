import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
} from "@/services/contact/contactSchemas";
import ContactPage from "./page";

// NOTE ON COVERAGE SCOPE
// ----------------------
// `ContactPage` is a synchronous server component with no props and no data
// access, so it renders straight through renderToStaticMarkup with nothing to
// await and nothing to stub. No production code was changed or exported to make
// this testable.
//
// It embeds ContactForm, a client component, and that costs nothing here:
// under Vitest the "use client" directive is an inert string, the module
// imports like any other, and the form emits its full idle-state markup on the
// server render (same as SubscribeForm inside app/page.test.tsx). So the real
// form renders below rather than a vi.mock stand-in, and this one file covers
// both the page shell and the form's server-rendered contract - they are one
// tree, and splitting them would mean two files asserting the same markup.
//
// THE ONE THING STATIC RENDER CANNOT REACH is the error branch of the status
// region. `status` starts at "idle" and only a real submit moves it, which
// needs a DOM event dispatch - this repo runs Vitest in the "node" environment
// with no jsdom/happy-dom and no @testing-library/react (see vitest.config.ts),
// and adding one is a dependency change and out of scope. So the assertions
// below pin the polite branch, the one that ships on every page load, and the
// assertive `role="alert"` branch is an environment-imposed gap recorded in the
// specialist report.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists - see the canonical note in Pagination.test.tsx.
// Controls are located by id, by label association and by attribute instead.

function render(): string {
  return renderToStaticMarkup(<ContactPage />);
}

function countTags(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/**
 * Reads one attribute off a serialized start tag, order-independently.
 *
 * Case-insensitive because React's SSR does not normalise every attribute to
 * lowercase: it emits `autoComplete="name"` with the JSX spelling intact. HTML
 * attribute names are case-insensitive so the browser is unaffected, but a
 * case-sensitive reader here would report the attribute as simply absent.
 */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
}

/** Every `<a>` start tag in the markup. */
function anchorTags(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
}

/** Every form control start tag, whatever element implements it. */
function controlTags(html: string): string[] {
  return [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(
    (match) => match[0],
  );
}

/** Every `<label for="...">` in the markup, as id -> visible text. */
function labelsByTarget(html: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const match of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)) {
    const target = attr(`<label${match[1]}>`, "for");
    if (target) labels[target] = match[2].trim();
  }
  return labels;
}

/** The element carrying `id`, as its tag name plus its text content. */
function elementWithId(
  html: string,
  id: string,
): { tag: string; text: string } | null {
  const match = html.match(
    new RegExp(
      `<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`,
      "i",
    ),
  );
  return match ? { tag: match[1].toLowerCase(), text: match[2].trim() } : null;
}

describe("ContactPage shell", () => {
  it("is a single <main> that opens and closes the document", () => {
    // <main> IS the editorial shell and carries the shared 1200px spine, so an
    // element between it and the blocks cancels that spine for everything
    // underneath. Nothing on this page preloads, so there is no hoisted <link>
    // ahead of the tree to account for.
    const html = render();

    expect(html.startsWith("<main")).toBe(true);
    expect(html.endsWith("</main>")).toBe(true);
    expect(countTags(html, "main")).toBe(1);
  });

  it("carries one <h1> under a static eyebrow, and no second-level heading", () => {
    // The page used to carry two <h2>s - "Follow along" over the channels and
    // "Send a message" over the form, the latter sitting directly above a
    // button reading the same words. Both were deleted in favour of accessible
    // names on the blocks themselves, so a returning <h2> is the regression.
    const html = render();

    expect(countTags(html, "h1")).toBe(1);
    expect(html).toContain(">Contact<");
    expect(html).toContain(">Get in touch<");
    expect(countTags(html, "h2")).toBe(0);
    expect(countTags(html, "h3")).toBe(0);
  });

  it("names the form landmark without a heading", () => {
    const html = render();

    expect(html).toMatch(/<form\b[^>]*\saria-label="Send a message"/i);
    // The name is on the form, not restored as a heading above it.
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*Send a message/i);
  });

  it("gives the channels block an accessible name from a <p>, not a heading", () => {
    const html = render();

    const section = html.match(/<section\b[^>]*>/);
    expect(section).not.toBeNull();
    const labelledBy = attr(section![0], "aria-labelledby");
    expect(labelledBy).toBe("contact-channels-label");

    // Resolve the reference rather than just asserting the attribute: a
    // dangling aria-labelledby leaves the section with no name at all.
    const label = elementWithId(html, labelledBy!);
    expect(label, `nothing carries id="${labelledBy}"`).not.toBeNull();
    expect(label!.text).toBe("Follow along");
    expect(label!.tag).toBe("p");
  });
});

describe("ContactPage external links", () => {
  it("gives every new-tab link an opener-safe rel", () => {
    // Both counts are DERIVED from the rendered markup and compared, never
    // hardcoded: a fourth channel added without `rel` has to fail here, and a
    // test pinned to "3" would instead keep passing while the page drifted.
    //
    // Without noopener the opened tab gets a handle on this window through
    // `window.opener`, which is the security half of the pair.
    const html = render();

    const blankTargets = countOccurrences(html, 'target="_blank"');
    expect(blankTargets).toBeGreaterThan(0);
    expect(countOccurrences(html, 'rel="noopener noreferrer"')).toBe(
      blankTargets,
    );
  });

  it("matches rel to target on each anchor individually, not just in total", () => {
    // Equal totals can still hide a mismatch - one link with two rels and one
    // with none sums correctly. Checked per anchor so it cannot.
    const html = render();

    const external = anchorTags(html).filter(
      (tag) => attr(tag, "target") === "_blank",
    );
    expect(external.length).toBeGreaterThan(0);
    for (const tag of external) {
      expect(attr(tag, "rel")).toBe("noopener noreferrer");
      // Every off-site link says so in its accessible name, before activation.
      expect(attr(tag, "aria-label")).toMatch(/\(opens in a new tab\)$/);
      expect(attr(tag, "href")).toMatch(/^https:\/\//);
    }
  });

  it("leaves every in-page link navigating in place", () => {
    const html = render();

    const internal = anchorTags(html).filter(
      (tag) => attr(tag, "target") !== "_blank",
    );
    expect(internal.length).toBeGreaterThan(0);
    for (const tag of internal) {
      expect(tag).not.toMatch(/\srel=/);
    }
  });

  it("publishes the mailto address in the lede", () => {
    const html = render();

    const mailto = anchorTags(html).filter((tag) =>
      attr(tag, "href")?.startsWith("mailto:"),
    );
    expect(mailto).toHaveLength(1);
    expect(attr(mailto[0], "href")).toBe("mailto:info@thepnwspirits.com");
    // The address is also the link's visible text, so it can be read and typed
    // by someone whose mail client is not wired to mailto: at all.
    expect(html).toContain(">info@thepnwspirits.com</a>");
    // A mail link opens no tab, so it must carry neither target nor rel.
    expect(mailto[0]).not.toMatch(/\starget=/);
  });

  it("ranks the channels below the form in the DOM", () => {
    // Tab order. These three off-site links used to live in the masthead, so
    // they were reached BEFORE any field of the page's only conversion path, at
    // every viewport. Source order is what fixes that, and it is exactly what
    // a visual-only reordering would silently undo.
    const html = render();

    expect(html.indexOf("<form")).toBeGreaterThan(-1);
    expect(html.indexOf("<form")).toBeLessThan(html.indexOf("Follow along"));
    expect(html.indexOf("</form>")).toBeLessThan(
      html.indexOf('target="_blank"'),
    );
  });
});

describe("ContactForm labelling", () => {
  const CONTROL_IDS = [
    "contact-name",
    "contact-email",
    "contact-phone",
    "contact-category",
    "contact-message",
  ] as const;

  it("gives every control a real <label>, and every label a control", () => {
    const html = render();
    const labels = labelsByTarget(html);
    const controls = controlTags(html);

    // Every control is labelled...
    for (const tag of controls) {
      const id = attr(tag, "id");
      expect(id, `a control has no id: ${tag}`).toBeTruthy();
      expect(labels[id!], `no <label for="${id}">`).toBeTruthy();
    }
    // ...and the form holds exactly the controls we think it does, so the loop
    // above cannot pass by covering fewer fields than exist.
    expect(controls.map((tag) => attr(tag, "id")).sort()).toEqual(
      [...CONTROL_IDS].sort(),
    );
    // ...and no label points at a control that is not there (a dangling `for`
    // leaves the field it was meant for unnamed).
    expect(Object.keys(labels).sort()).toEqual([...CONTROL_IDS].sort());
  });

  it("names each control for itself, with no name reused", () => {
    const labels = labelsByTarget(render());

    expect(labels["contact-name"]).toBe("Name");
    expect(labels["contact-email"]).toBe("Email");
    expect(labels["contact-phone"]).toBe("Phone (optional)");
    expect(labels["contact-category"]).toBe("Reason for reaching out");
    expect(labels["contact-message"]).toBe("Message");
    // A label copied from its neighbour would otherwise look plausible above.
    expect(new Set(Object.values(labels)).size).toBe(CONTROL_IDS.length);
  });

  it("marks the optional field in its label rather than only in its markup", () => {
    // `required` is absent on phone and present on the other four. A visitor
    // who cannot see the asterisk convention learns which field is optional
    // from the accessible name, which is where this form says it.
    const html = render();
    const byId = new Map(
      controlTags(html).map((tag) => [attr(tag, "id"), tag]),
    );

    expect(byId.get("contact-phone")).not.toMatch(/\srequired=""/);
    expect(labelsByTarget(html)["contact-phone"]).toContain("(optional)");
    for (const id of ["contact-name", "contact-email", "contact-message"]) {
      expect(byId.get(id), id).toMatch(/\srequired=""/);
    }
  });

  it("keeps each field's autofill hint", () => {
    // A label and an autocomplete token answer different questions (WCAG 1.3.5
    // is the second one).
    const byId = new Map(
      controlTags(render()).map((tag) => [attr(tag, "id"), tag]),
    );

    expect(attr(byId.get("contact-name")!, "autocomplete")).toBe("name");
    expect(attr(byId.get("contact-email")!, "autocomplete")).toBe("email");
    expect(attr(byId.get("contact-phone")!, "autocomplete")).toBe("tel");
  });

  it("gives each field an input type matching what it collects", () => {
    const byId = new Map(
      controlTags(render()).map((tag) => [attr(tag, "id"), tag]),
    );

    // Drives the mobile keyboard as well as native validation.
    expect(attr(byId.get("contact-email")!, "type")).toBe("email");
    expect(attr(byId.get("contact-phone")!, "type")).toBe("tel");
  });
});

describe("ContactForm category options", () => {
  /** Every `<option>`, in source order, as its tag plus value and text. */
  function options(
    html: string,
  ): { tag: string; value?: string; text: string }[] {
    return [...html.matchAll(/(<option\b[^>]*>)([\s\S]*?)<\/option>/g)].map(
      (match) => ({
        tag: match[1],
        value: attr(match[1], "value"),
        text: match[2].trim(),
      }),
    );
  }

  it("offers exactly the categories the schema accepts, in order", () => {
    // Derived from the shared contract rather than retyped: the select and the
    // Zod enum are one source of truth, and a category added to the schema but
    // not the form (or the reverse) is a submit the server rejects.
    expect(options(render()).map((option) => option.value)).toEqual([
      ...CONTACT_CATEGORIES,
    ]);
  });

  it("labels each option with its shared display label", () => {
    const byValue = new Map(
      options(render()).map((option) => [option.value, option.text]),
    );

    for (const value of CONTACT_CATEGORIES) {
      expect(byValue.get(value)).toBe(CONTACT_CATEGORY_LABELS[value]);
    }
  });

  it("preselects the first category so the field is never empty", () => {
    // The select is controlled from CONTACT_CATEGORIES[0], so a visitor who
    // never touches it still submits a value the enum accepts. React expresses
    // a controlled select's value as `selected` on the matching option rather
    // than as a `value` attribute on the <select>.
    const selected = options(render()).filter((option) =>
      /\sselected=""/.test(option.tag),
    );

    expect(selected.map((option) => option.value)).toEqual([
      CONTACT_CATEGORIES[0],
    ]);
  });
});

describe("ContactForm status region", () => {
  it("renders the live region at idle, empty", () => {
    // A live region has to be in the accessibility tree BEFORE its text
    // changes, or the change is an insertion the screen reader may never
    // announce. Present-and-empty is the property that makes any later
    // announcement audible at all.
    const html = render();

    const region = html.match(/<p\b[^>]*\srole="status"[^>]*>([\s\S]*?)<\/p>/i);
    expect(region, "no polite status region in the idle markup").not.toBeNull();
    expect(region![1]).toBe("");
  });

  it("announces politely at idle, and says so explicitly", () => {
    const html = render();
    const region = html.match(/<p\b[^>]*\srole="status"[^>]*>/i)!;

    // Stated alongside the role rather than left to role="status"'s implicit
    // politeness, which screen readers honour inconsistently. Same derivation
    // as AdminStatus.tsx and SubscribeForm.tsx.
    expect(attr(region[0], "aria-live")).toBe("polite");
    // The idle render must NOT interrupt: assertive belongs to the error branch
    // only, which a static render cannot reach.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-live="assertive"');
  });

  it("emits exactly one live region", () => {
    // Two regions announcing one outcome is a double-read.
    const html = render();

    expect((html.match(/\saria-live="/gi) ?? []).length).toBe(1);
  });
});

describe("ContactForm submit path", () => {
  it("renders one enabled submit control", () => {
    const html = render();
    const button = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/);

    expect(button).not.toBeNull();
    expect(attr(button![0], "type")).toBe("submit");
    expect(button![1]).toBe("Send message");
    // Enabled at idle: this form validates on submit rather than gating the
    // button, which is the opposite of SubscribeForm and is deliberate.
    expect(button![0]).not.toMatch(/\sdisabled=""/);
  });

  it("keeps validation on the client rather than the browser", () => {
    // `noValidate` suppresses the browser's own bubbles so the form can report
    // through its live region instead. The `required` attributes stay for their
    // semantics, and the absence of a native action/method records that the
    // request body is built from React state, not from a native submit.
    const html = render();

    expect(html).toMatch(/<form\b[^>]*\snovalidate=""/i);
    expect(html).not.toMatch(/<form[^>]*\saction="/);
    expect(html).not.toMatch(/<form[^>]*\smethod="/);
  });
});
