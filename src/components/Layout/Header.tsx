"use client";
import { useEffect, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";

type NavLink = { href: string; label: string };
type NavItem =
  | { type: "link"; href: string; label: string }
  | { type: "group"; label: string; children: NavLink[] };

const navItems: NavItem[] = [
  { type: "link", href: "/", label: "Home" },
  {
    type: "group",
    label: "Concoctions",
    children: [
      { href: "/blogs-landing", label: "Blogs" },
      { href: "/recipes-landing", label: "Recipes" },
      { href: "/classes", label: "Classes" },
      { href: "/videos-landing", label: "Videos" },
    ],
  },
  {
    type: "group",
    label: "Resources",
    children: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

function useIsLinkActive(pathname: string) {
  return (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const Header = () => {
  const pathname = usePathname();
  const isLinkActive = useIsLinkActive(pathname);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Which desktop dropdown is currently open (by group label), or null.
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLDivElement>(null);
  // Short delay before a hover-driven close so diagonal cursor moves between
  // the trigger and its panel are forgiven.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openGroup = (label: string) => {
    cancelClose();
    setOpenMenu(label);
  };

  const scheduleClose = (label: string) => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpenMenu((cur) => (cur === label ? null : cur));
      closeTimer.current = null;
    }, 120);
  };

  // Clear any pending close timer on unmount to avoid leaks.
  useEffect(() => cancelClose, []);

  useEffect(() => {
    const updateMobile = () => {
      const mobile = window.innerWidth <= 750;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
      if (!mobile) {
        setMobileOpen(false);
      } else {
        setOpenMenu(null);
      }
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

  // Click-away closes an open desktop dropdown.
  useEffect(() => {
    if (!openMenu) return;
    function handleClickAway(e: MouseEvent) {
      if (
        desktopNavRef.current &&
        !desktopNavRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [openMenu]);

  // Escape closes whichever surface is open.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const renderDesktopGroup = (
    label: string,
    children: NavLink[],
  ) => {
    const groupActive = children.some((c) => isLinkActive(c.href));
    const isOpen = openMenu === label;
    return (
      <div
        key={label}
        className={styles.dropdown}
        onMouseEnter={() => openGroup(label)}
        onMouseLeave={() => scheduleClose(label)}
        onBlur={(e) => {
          // Close only when focus leaves the whole group (trigger + panel),
          // not when moving between elements inside it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setOpenMenu((cur) => (cur === label ? null : cur));
          }
        }}
      >
        <button
          type="button"
          className={
            groupActive
              ? `${styles.trigger} ${styles.active}`
              : styles.trigger
          }
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={() => {
            cancelClose();
            setOpenMenu((cur) => (cur === label ? null : label));
          }}
          onFocus={() => openGroup(label)}
        >
          {label}
          <span className={styles.caret} aria-hidden="true" />
        </button>
        <div
          className={
            isOpen
              ? `${styles.dropdownPanel} ${styles.dropdownPanelOpen}`
              : styles.dropdownPanel
          }
          role="menu"
          aria-label={label}
        >
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              role="menuitem"
              className={
                isLinkActive(child.href)
                  ? `${styles.menuLink} ${styles.menuLinkActive}`
                  : styles.menuLink
              }
              onClick={() => {
                cancelClose();
                setOpenMenu(null);
              }}
            >
              {child.label}
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <Image
            src="/images/logo.png"
            alt="PNW Spirits Logo"
            width={36}
            height={36}
            style={{
              marginRight: 12,
              verticalAlign: "middle",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(35,66,54,0.10)",
            }}
            priority
          />
          The PNW Spirits
        </Link>

        {typeof window === "undefined" || !isMobile ? (
          <div className={styles.links} ref={desktopNavRef}>
            {navItems.map((item) =>
              item.type === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isLinkActive(item.href)
                      ? `${styles.link} ${styles.active}`
                      : styles.link
                  }
                >
                  {item.label}
                </Link>
              ) : (
                renderDesktopGroup(item.label, item.children)
              ),
            )}
          </div>
        ) : (
          <div className={styles.mobileMenu} ref={mobileRef}>
            <button
              type="button"
              className={styles.mobileToggle}
              aria-label="Open navigation menu"
              aria-haspopup="true"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              ☰
            </button>
            {mobileOpen && (
              <div className={styles.mobilePanel} role="menu">
                {navItems.map((item) =>
                  item.type === "link" ? (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={
                        isLinkActive(item.href)
                          ? `${styles.mobileLink} ${styles.mobileLinkActive}`
                          : styles.mobileLink
                      }
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <div key={item.label} className={styles.mobileGroup}>
                      <span className={styles.mobileGroupLabel}>
                        {item.label}
                      </span>
                      <div className={styles.mobileGroupLinks}>
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            role="menuitem"
                            className={
                              isLinkActive(child.href)
                                ? `${styles.mobileLink} ${styles.mobileLinkActive}`
                                : styles.mobileLink
                            }
                            onClick={() => setMobileOpen(false)}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
