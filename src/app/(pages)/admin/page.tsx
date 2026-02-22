"use client";

import AdminLanding from "@/app/(pages)/admin/AdminLanding";
import { AdminTokenProvider } from "./AdminTokenContext";

export default function AdminPage() {
  return (
    <AdminTokenProvider>
      <AdminLanding />
    </AdminTokenProvider>
  );
}
