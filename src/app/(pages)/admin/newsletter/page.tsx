import { AdminTokenProvider } from "../AdminTokenContext";
import AdminNewsletterComposer from "./AdminNewsletterComposer";

export default function AdminNewsletterPage() {
  return (
    <AdminTokenProvider>
      <AdminNewsletterComposer />
    </AdminTokenProvider>
  );
}
