import type { Metadata } from "next";
import LayoutClient from "./LayoutClient";

export const metadata: Metadata = {
  title: "PNW Spirits",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <LayoutClient>{children}</LayoutClient>
    </html>
  );
}
