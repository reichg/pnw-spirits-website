"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blogs-landing", label: "Blogs" },
  { href: "/videos-landing", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

const Header = () => {
  const pathname = usePathname();
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
