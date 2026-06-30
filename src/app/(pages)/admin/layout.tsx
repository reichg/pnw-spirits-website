import type { ReactNode } from "react";
import AdminAuthGate from "./AdminAuthGate";
import { AdminTokenProvider } from "./AdminTokenContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminTokenProvider>
      <AdminAuthGate>{children}</AdminAuthGate>
    </AdminTokenProvider>
  );
}
