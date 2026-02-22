"use client";
import { useEffect, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blogs-landing", label: "Blogs" },
  { href: "/recipes-landing", label: "Recipes" },
  { href: "/videos-landing", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const Header = () => {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Set initial value before paint to avoid cascading renders
  // No need for useLayoutEffect: isMobile is initialized in useState

  useEffect(() => {
    const updateMobile = () => {
      const mobile = window.innerWidth <= 750;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
      if (window.innerWidth > 750) setDropdownOpen(false);
    };
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickAway(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [dropdownOpen]);

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
          PNW Spirits
        </Link>
        {typeof window === "undefined" || !isMobile ? (
          <div className={styles.links}>
            {navLinks.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    isActive ? `${styles.link} ${styles.active}` : styles.link
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={styles.dropdownMenu} ref={dropdownRef}>
            <button
              className={styles.dropdownToggle}
              aria-label="Open navigation menu"
              onClick={() => setDropdownOpen((open) => !open)}
            >
              ☰
            </button>
            {dropdownOpen && (
              <div className={styles.dropdownContent}>
                {navLinks.map((link) => {
                  const isActive =
                    link.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={
                        isActive
                          ? `${styles.link} ${styles.active}`
                          : styles.link
                      }
                      onClick={() => setDropdownOpen(false)}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
