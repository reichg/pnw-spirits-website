"use client";
import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS, ADMIN_HOME } from "@/components/Layout/adminNavItems";
import { useAdminToken } from "@/components/admin/AdminTokenContext";
import styles from "./AdminHeader.module.css";

const ADMIN_LOGIN_PATH = "/admin/login";

// Active-link rule mirrors the public Header: exact match for the portal home,
// prefix match for every sub-section.
function isAdminLinkActive(pathname: string, href: string): boolean {
  return href === ADMIN_HOME.href
    ? pathname === ADMIN_HOME.href
    : pathname.startsWith(href);
}

const AdminHeader = () => {
  const pathname = usePathname();
  // No isAuthenticated guard and no useSyncExternalStore mount deferral here,
  // both deliberately. This header renders inside AdminAuthGate, which emits
  // its children only once the session is known good - so "this header is on
  // screen" and "the session is valid" are the same condition, and the server
  // pass renders no header at all. Adding a deferral would be a second answer
  // to a question the gate already settled, and would suggest the invariant is
  // not trusted.
  const { signOut } = useAdminToken();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateMobile = () => {
      const mobile = window.innerWidth <= 750;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
      if (!mobile) setMobileOpen(false);
    };
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  // Click-away closes the open mobile menu.
  useEffect(() => {
    if (!mobileOpen) return;
    function handleClickAway(e: MouseEvent) {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [mobileOpen]);

  // Escape closes the mobile menu.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Hide the admin navbar on the unauthenticated login page.
  if (pathname === ADMIN_LOGIN_PATH) return null;

  const renderLink = (
    href: string,
    label: string,
    className: string,
    activeClassName: string,
    onClick?: () => void,
    role?: string,
  ) => {
    const active = isAdminLinkActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        role={role}
        aria-current={active ? "page" : undefined}
        className={active ? `${className} ${activeClassName}` : className}
        onClick={onClick}
      >
        {label}
      </Link>
    );
  };

  // Rendered at BOTH breakpoints. A control in only one is invisible at the
  // other, and this is the single control in the application that ends a
  // session - an admin on a phone needs it at least as much as one on a laptop.
  //
  // It deliberately does not navigate. signOut() clears the token and nothing
  // else; AdminAuthGate observes isAuthenticated flip and issues the one
  // router.replace. A redirect here as well would race it and give the app two
  // answers to "where does a signed-out admin land".
  const signOutButton = (className: string) => (
    <button type="button" className={className} onClick={signOut}>
      Sign out
    </button>
  );

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Admin">
        <Link
          href={ADMIN_HOME.href}
          aria-current={pathname === ADMIN_HOME.href ? "page" : undefined}
          className={styles.brand}
        >
          <span className={styles.brandBadge} aria-hidden="true">
            Admin
          </span>
          <span className={styles.brandLabel}>{ADMIN_HOME.label}</span>
        </Link>

        {typeof window === "undefined" || !isMobile ? (
          <div className={styles.links}>
            {ADMIN_NAV_ITEMS.map((item) =>
              renderLink(
                item.href,
                item.label,
                styles.link,
                styles.linkActive,
              ),
            )}
            {signOutButton(styles.signOut)}
          </div>
        ) : (
          <div className={styles.mobileMenu} ref={mobileRef}>
            <button
              type="button"
              className={styles.mobileToggle}
              aria-label="Open admin navigation menu"
              aria-haspopup="true"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              ☰
            </button>
            {mobileOpen && (
              <div className={styles.mobilePanel} role="menu">
                {ADMIN_NAV_ITEMS.map((item) =>
                  renderLink(
                    item.href,
                    item.label,
                    styles.mobileLink,
                    styles.mobileLinkActive,
                    () => setMobileOpen(false),
                    // role="menuitem" on the children, because the panel
                    // already declares role="menu" and a menu whose children
                    // are not menuitems is a contract it does not keep. Adding
                    // a button into that container without fixing it would have
                    // made the existing defect worse rather than leaving it
                    // where it was.
                    "menuitem",
                  ),
                )}
                {/* The separation is a wrapper rather than a border on the
                    button; see .mobileSignOutRow for why. */}
                <div className={styles.mobileSignOutRow}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.signOutMobile}
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
};

export default AdminHeader;
