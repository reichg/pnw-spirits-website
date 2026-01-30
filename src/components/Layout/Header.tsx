"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blogs", label: "Blogs" },
  { href: "/videos", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const Header = () => {
  const [show, setShow] = useState(true);
  const lastScroll = useRef(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const curr = window.scrollY;
          if (curr <= 0) {
            setShow(true); // always show at top
          } else if (curr < lastScroll.current) {
            setShow(true); // scrolling up, show
          } else if (curr > lastScroll.current && curr > 60) {
            setShow(false); // scrolling down, hide
          }
          lastScroll.current = curr;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const pathname = usePathname();
  return (
    <header className={show ? styles.header : styles.headerHidden}>
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
      </nav>
    </header>
  );
};

export default Header;
