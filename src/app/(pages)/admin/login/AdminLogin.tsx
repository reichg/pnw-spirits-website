"use client";

import { useState } from "react";

import AdminButton from "@/components/admin/AdminButton";
import AdminField from "@/components/admin/AdminField";
import { AdminInput } from "@/components/admin/AdminInput";
import AdminStatus from "@/components/admin/AdminStatus";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/components/admin/AdminTokenContext";
import { readAdminError } from "@/hooks/useAdminFetch";
import styles from "./AdminLogin.module.css";

type LoginResponse = { token?: unknown };

const LOGIN_FALLBACK_ERROR = "Login failed. Check the username and password.";

/**
 * The sign-in panel: the brand, the heading, the two fields and the submit.
 *
 * THE WHOLE PANEL IS HERE RATHER THAN SPLIT WITH page.tsx. The eyebrow, the
 * <h1> and the form are one composed block with one internal rhythm; putting
 * the heading in the page shell and the form here would mean two files to keep
 * in step every time that rhythm moves. The page owns the SPLIT; this owns the
 * PANEL.
 *
 * THE <h1> IS NEW. This page carried an <h2> and no <h1> at all - a document
 * whose outline started at level two, on the one admin screen with no chrome
 * above it to have owned level one.
 *
 * THIS REQUEST DOES NOT GO THROUGH adminFetch, and that is the important line
 * in the file. adminFetch ends the session on 401 and 403, which is right
 * everywhere else in the admin: there a 401 means the credential expired. Here
 * a 401 means the password was wrong. Routing this through the shared hook
 * would make "you typed it wrong" and "your session ran out" the same event,
 * and the admin would be signed out of a session they were trying to start.
 *
 * `readAdminError` IS still used, because it is a separate seam: it reads a
 * server `{ error }` only when the string has the shape of one of our own
 * curated messages - single line, under a couple of hundred characters - and
 * falls back otherwise. Without it a proxy's HTML error page becomes the text
 * under the password field.
 *
 * THIS COMPONENT PERSISTS THE TOKEN ITSELF, which is not an oversight in
 * AdminTokenContext. `setToken` deliberately does not write to localStorage:
 * sign-OUT is the only direction the context owns storage for. This is the one
 * place a token is minted, so this is the one place it is stored.
 */
export default function AdminLogin(): React.ReactNode {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Re-entrancy guard, for the reason AdminBlogList's confirmDelete states as
    // a rule: `busy` on an AdminButton is `aria-disabled`, not native
    // `disabled`, so the submit below stays focusable and is inert only because
    // AdminButton cancels the activation - which it does on click, on Enter, on
    // Space and on implicit submission from either field, all four of which
    // reach this form through that one default button. Nothing else calls
    // requestSubmit, so that is the whole surface.
    //
    // Defence in depth rather than a live bug; what it stands between is a
    // second POST of the same credentials, which is a second bcrypt verify and
    // a second token minted for one sign-in. /api/admin has no rate limiting
    // for a duplicate to trip, so the cost is server work, not a lockout.
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      // Before res.json(), because readAdminError declines a response whose
      // body has already been consumed - and only on the failure branch, so a
      // successful login never parses the token-bearing body twice.
      if (!res.ok) {
        setError(await readAdminError(res, LOGIN_FALLBACK_ERROR));
        return;
      }

      const data = (await res.json().catch(() => null)) as LoginResponse | null;
      if (typeof data?.token !== "string" || !data.token) {
        // 200 with nothing usable in it. Nothing to report beyond the generic
        // line: the body is malformed, so whatever is in it is not a message.
        setError(LOGIN_FALLBACK_ERROR);
        return;
      }

      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, data.token);
      // A full document load rather than router.push, so the admin subtree
      // boots with the provider seeding its token from storage on the first
      // pass. A client navigation would leave this page's already-mounted
      // provider holding the null it read before the token existed.
      window.location.href = "/admin";
    } catch {
      setError(LOGIN_FALLBACK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.panel}>
      {/* The same brand treatment as the "Checking access" gate, which is the
          only other admin screen with no chrome: gold at eyebrow size, because
          at 11-12px copper is ~4.6:1 on this ground and gold is ~9.7:1. The two
          screens an admin sees before they see the portal should not introduce
          the same product twice, two different ways. */}
      <p className={styles.eyebrow}>PNW Spirits</p>
      <h1 className={styles.heading}>Admin sign in</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <AdminField label="Username" required>
          {(control) => (
            <AdminInput
              {...control}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          )}
        </AdminField>

        <AdminField label="Password" required>
          {(control) => (
            <AdminInput
              {...control}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          )}
        </AdminField>

        {/* tone="error", which carries role="alert": a rejected sign-in is the
            admin's action failing, and it has to interrupt whatever a screen
            reader was saying rather than wait politely behind it. Not an
            AdminField error - nothing is wrong with either FIELD, and marking
            them aria-invalid would tell a screen reader the username was
            malformed when the password was simply wrong. */}
        {error ? <AdminStatus tone="error">{error}</AdminStatus> : null}

        <AdminButton type="submit" tone="primary" fullWidth busy={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </AdminButton>
      </form>
    </div>
  );
}
