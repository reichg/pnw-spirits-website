"use client";
import Footer from "@/components/Layout/Footer";
import Header from "@/components/Layout/Header";
import ScrollUpButton from "@/components/Layout/ScrollUpButton";
import { Geist, Geist_Mono } from "next/font/google";
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
      <Header />
      <div id="main-content-wrapper" className="main">
        {children}
      </div>
      <ScrollUpButton />
      <Footer />
    </body>
  );
}
