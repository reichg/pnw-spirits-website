import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import SubscribeForm from "./SubscribeForm";

// NOTE ON COVERAGE SCOPE
// ----------------------
// This repo runs Vitest in the "node" environment with no jsdom/happy-dom and
// no @testing-library/react (see vitest.config.ts); adding one is a dependency
// change and out of scope. SubscribeForm is a client component, but "use
// client" is an inert string under Vitest and the form emits its full idle-state
// markup on the first (server) render - which is where this file's entire
// subject lives. `role`, `aria-live`, `<label for>`, `id` and `aria-labelledby`
// are all server-rendered attributes, so the accessible-name and live-region
// contract is observable in full at idle.
//
// THE ONE THING STATIC RENDER CANNOT REACH is the error branch of the status
// region. `status` starts at "idle" and only a real submit moves it, which needs
// a DOM event dispatch (a forbidden new dependency). So the assertions below pin
// the polite branch - the one that actually ships on every page load - and the
// assertive `role="alert"` branch is an environment-imposed gap, recorded in the
// specialist report. It is partially compensated: the two branches are one
// ternary on one element, so the element's existence, its emptiness and its
// presence in the idle tree (the property that makes ANY later announcement
// audible) are all verified here, and only the attribute VALUES on the failure
// path are unobserved.
//
// No assertion keys off a CSS-module class name. Under Vitest the import is a
// Proxy that echoes ANY key back as `_<key>_<hash>`, so a class assertion could
// never prove a rule exists - see the canonical note in Pagination.test.tsx.
// Controls are located by id and by attribute instead.

const FIELD_IDS = [
  "subscribe-firstname",
  "subscribe-lastname",
  "subscribe-email",
] as const;

function render(): string {
  return renderToStaticMarkup(<SubscribeForm />);
}

/**
 * Reads one attribute off a serialized start tag, order-independently.
 *
 * Case-insensitive because React's SSR does not normalise every attribute to
 * lowercase: it emits `autoComplete="given-name"` with the JSX spelling intact.
 * HTML attribute names are case-insensitive so the browser is unaffected, but a
 * case-sensitive reader here would report the attribute as simply absent.
 */
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
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

/** Every `<input>` start tag in the markup. */
function inputTags(html: string): string[] {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
}

describe("SubscribeForm accessible names", () => {
  it("gives every field a real label, not a placeholder", () => {
    // The defect this file exists to hold shut. Two of the three fields were
    // labelled by `placeholder` alone, and a placeholder is not an accessible
    // name: it is erased the moment the field has a value, which is exactly when
    // a screen-reader user re-reads the control.
    const html = render();
    const labels = labelsByTarget(html);

    for (const id of FIELD_IDS) {
      expect(labels[id], `no <label for="${id}">`).toBeTruthy();
    }
    // Every input in the form is one of the three, so the loop above cannot pass
    // by covering fewer fields than exist.
    expect(inputTags(html)).toHaveLength(FIELD_IDS.length);
    for (const tag of inputTags(html)) {
      expect(FIELD_IDS).toContain(attr(tag, "id"));
    }
  });

  it("names each field for itself rather than for the form's pitch", () => {
    // The other half of the defect, and the worse half: the pitch line was
    // wired as <label htmlFor="subscribe-firstname">, so the first-name box
    // announced as "Get the latest recipes & stories:". A field whose name is
    // the marketing copy is mislabelled, not unlabelled.
    const labels = labelsByTarget(render());

    expect(labels["subscribe-firstname"]).toBe("First name");
    expect(labels["subscribe-lastname"]).toBe("Last name");
    expect(labels["subscribe-email"]).toBe("Email address");
    // Three distinct names: a label copied from its neighbour would otherwise
    // look plausible above.
    expect(new Set(Object.values(labels)).size).toBe(FIELD_IDS.length);
  });

  it("makes the pitch the form's name instead of a field's", () => {
    const html = render();

    // The pitch is still on the page, still as text, and now carries the id the
    // form points at - which is also what makes the form a named landmark.
    expect(html).toContain('id="subscribe-heading"');
    expect(html).toContain('aria-labelledby="subscribe-heading"');
    expect(html).toContain("Get the latest recipes &amp; stories:");
    // And it is no longer a <label> at all, which is the regression marker:
    // re-pointing it at a field would restore the original bug silently.
    expect(labelsByTarget(html)).not.toHaveProperty("subscribe-heading");
    expect(html).not.toMatch(/<label[^>]*>[^<]*Get the latest/);
  });

  it("keeps each field's autofill hint", () => {
    // A label and an autocomplete token answer different questions (WCAG 1.3.5
    // is the second one), and the labels were added around these - so this
    // guards the pre-existing half from being lost in the edit.
    const byId = new Map(inputTags(render()).map((t) => [attr(t, "id"), t]));

    expect(attr(byId.get("subscribe-firstname")!, "autocomplete")).toBe(
      "given-name",
    );
    expect(attr(byId.get("subscribe-lastname")!, "autocomplete")).toBe(
      "family-name",
    );
    expect(attr(byId.get("subscribe-email")!, "autocomplete")).toBe("email");
  });
});

describe("SubscribeForm status region", () => {
  it("renders the live region at idle, empty", () => {
    // THE ASSERTION THAT CARRIES THIS FILE. A live region has to be in the
    // accessibility tree BEFORE its text changes, or the change is an insertion
    // the screen reader may never announce. This region used to be mounted
    // together with its text (`{message && <div>}`), so both outcomes arrived as
    // insertions - and it carried no role and no aria-live either way, so
    // neither one was announced at all.
    const html = render();

    const region = html.match(/<p\b[^>]*\srole="status"[^>]*>([\s\S]*?)<\/p>/);
    expect(region, "no polite status region in the idle markup").not.toBeNull();
    // Empty: the region is present but silent until a submit resolves.
    expect(region![1]).toBe("");
  });

  it("announces politely at idle and success, and says so explicitly", () => {
    const html = render();

    expect(html).toContain('role="status"');
    // Stated alongside the role rather than left to role="status"'s implicit
    // politeness, which screen readers honour inconsistently. Same derivation as
    // AdminStatus.tsx and ContactForm.tsx.
    expect(html).toContain('aria-live="polite"');
    // The idle render must NOT be assertive: an empty region that interrupts is
    // the failure mode on the other side of this change.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-live="assertive"');
  });

  it("emits exactly one live region", () => {
    // Two regions announcing one outcome is a double-read, and it is how this
    // would regress if the old conditional <div> were ever restored alongside
    // the new <p>.
    const html = render();

    expect((html.match(/\saria-live="/g) ?? []).length).toBe(1);
  });
});

describe("SubscribeForm submit path", () => {
  it("leaves the fields controlled, with no native form wiring", () => {
    // The request body is built from React state (`{ firstName, lastName,
    // email }`), not from FormData, and the form has no action or method. The
    // absence of `name` attributes is what records that: adding one would imply
    // a native submit path this component does not have, and is the observable
    // edge of "the submit path is unchanged".
    const html = render();

    for (const tag of inputTags(html)) {
      expect(tag).not.toMatch(/\sname="/);
    }
    expect(html).not.toMatch(/<form[^>]*\saction="/);
    expect(html).not.toMatch(/<form[^>]*\smethod="/);
  });

  it("renders one enabled-on-completion submit control", () => {
    const html = render();

    const button = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/);
    expect(button).not.toBeNull();
    expect(attr(button![0], "type")).toBe("submit");
    expect(button![1]).toBe("Subscribe");
    // Disabled at idle because the three required fields are empty - the
    // pre-existing guard, preserved.
    expect(button![0]).toMatch(/\sdisabled=""/);
  });
});
