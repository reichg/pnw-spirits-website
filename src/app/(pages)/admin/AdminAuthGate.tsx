"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminToken } from "@/components/admin/AdminTokenContext";
import styles from "./AdminAuthGate.module.css";

const LOGIN_PATH = "/admin/login";

// The whole screen, because AdminHeader now renders inside this gate and so
// nothing appears above this state - see admin/layout.tsx. The eyebrow is the
// only thing giving the screen an owner while it is up; the spinner and the
// bordered panel that used to be here are gone, and the reasoning is recorded
// in AdminAuthGate.module.css.
function CheckingState() {
  return (
    <div className={styles.gate} role="status" aria-live="polite">
      <p className={styles.eyebrow}>PNW Spirits</p>
      <p className={styles.label}>Checking access…</p>
    </div>
  );
}

export default function AdminAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Reads the context's derived flag rather than calling isTokenValid(token)
  // here, and the difference is not stylistic. The provider arms a timer on the
  // token's own `exp`; when it fires, the token string is unchanged and only
  // this flag flips. A gate keyed on `token` therefore stopped rendering its
  // children but never re-ran its redirect, stranding an admin whose session
  // expired with the tab open on the "Checking access" panel for good. Keying
  // both the render and the effect on one derived value is what makes expiry,
  // sign-out and a missing token land in the same place.
  const { isAuthenticated } = useAdminToken();
  // Still required, and for the render more than for the effect: the provider
  // seeds its token from localStorage, so `isAuthenticated` is false in the
  // server pass and may be true in the first client pass. useSyncExternalStore
  // hands React the server snapshot to hydrate against and re-renders after,
  // which is what keeps the two passes emitting the same markup. Kept in the
  // effect's condition as well so the gate reaches its verdict from exactly one
  // expression.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isLoginPage = pathname === LOGIN_PATH;
  const authorized = mounted && isAuthenticated;

  useEffect(() => {
    if (mounted && !isLoginPage && !isAuthenticated) {
      router.replace(LOGIN_PATH);
    }
  }, [mounted, isLoginPage, isAuthenticated, router]);

  // The login page must always be reachable without authentication.
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authorized) {
    return <CheckingState />;
  }

  return <>{children}</>;
}
