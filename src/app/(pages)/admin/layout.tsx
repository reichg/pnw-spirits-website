import type { ReactNode } from "react";
import AdminHeader from "@/components/Layout/AdminHeader";
import AdminAuthGate from "./AdminAuthGate";
import { AdminTokenProvider } from "@/components/admin/AdminTokenContext";

/**
 * The admin subtree's session provider, its gate, and the render site of the
 * admin chrome.
 *
 * WHY AdminHeader MOUNTS HERE AND NOT IN `LayoutClient`. A Sign out control
 * belongs in the header - it is the only surface present on every admin screen -
 * and signing out needs `useAdminToken()`. `LayoutClient` renders the header as
 * a *sibling* of `{children}`, and `{children}` is where this provider lives, so
 * a header mounted there sits outside the provider and the hook throws. Moving
 * the render site is the smallest change that puts the two in one subtree; the
 * header is still the first thing in it, so the rendered order (chrome, then
 * page) is unchanged.
 *
 * WHY NOT HOIST `AdminTokenProvider` UP INTO `LayoutClient` instead. It would
 * put an admin-credential context on every public page to serve one admin-only
 * control, and it would move `isAuthenticated` outside the gate below: the
 * provider seeds its state from `localStorage`, which is null during SSR and
 * populated on the client, so every consumer above the gate would have to repeat
 * the gate's `useSyncExternalStore` mount deferral or hydrate mismatched. That
 * is a trap paid for on every page, to avoid moving one import.
 *
 * WHY NOT PUT SIGN OUT ON A PAGE INSIDE THE SUBTREE. The portal is four screens;
 * an admin part-way through editing a class would have to navigate home to end
 * the session, and the control would be absent from every screen but one.
 *
 * WHY INSIDE `AdminAuthGate` RATHER THAN BETWEEN IT AND THE PROVIDER. The gate
 * renders its children only once the session is known good, so "the header is on
 * screen" and "the admin is authenticated" become the same condition. That is
 * what lets the header read `isAuthenticated`/`signOut` with no mount deferral
 * of its own - inside the gate the server pass renders no header at all, so
 * there is no server/client disagreement left to reconcile - and it is why the
 * admin nav, and the Sign out button in it, do not linger over the "Checking
 * access" panel after a token expires or a sign-out clears it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminTokenProvider>
      <AdminAuthGate>
        <AdminHeader />
        {children}
      </AdminAuthGate>
    </AdminTokenProvider>
  );
}
