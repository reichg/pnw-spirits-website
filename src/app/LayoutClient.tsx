"use client";
import AdminHeader from "@/components/Layout/AdminHeader";
import Footer from "@/components/Layout/Footer";
import Header from "@/components/Layout/Header";
import ScrollUpButton from "@/components/Layout/ScrollUpButton";
import { Geist, Geist_Mono } from "next/font/google";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  useEffect(() => {
    function setVh() {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`,
      );
    }
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);
  return (
    <body className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* Admin routes are full-bleed and use their own chrome (no public Footer/ScrollUpButton). */}
      {isAdmin ? <AdminHeader /> : <Header />}
      {children}
      {!isAdmin && (
        <>
          <ScrollUpButton />
          <Footer />
        </>
      )}
    </body>
  );
}
