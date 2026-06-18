"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTokenValid, useAdminToken } from "./AdminTokenContext";
import styles from "./AdminAuthGate.module.css";

const LOGIN_PATH = "/admin/login";

function CheckingState() {
  return (
    <div className={styles.gate} role="status" aria-live="polite">
      <div className={styles.panel}>
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.label}>Checking access…</p>
      </div>
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
  const { token } = useAdminToken();
  // Defer auth evaluation to the client so the first render matches SSR
  // and no protected content (or redirect) flashes during hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isLoginPage = pathname === LOGIN_PATH;
  const authorized = mounted && isTokenValid(token);

  useEffect(() => {
    if (mounted && !isLoginPage && !isTokenValid(token)) {
      router.replace(LOGIN_PATH);
    }
  }, [mounted, isLoginPage, token, router]);

  // The login page must always be reachable without authentication.
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authorized) {
    return <CheckingState />;
  }

  return <>{children}</>;
}
