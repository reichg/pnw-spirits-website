import { AdminTokenProvider } from "../AdminTokenContext";
import AdminBlogList from "./AdminBlogList";

export default function AdminBlogsPage() {
  return (
    <AdminTokenProvider>
      <AdminBlogList />
    </AdminTokenProvider>
  );
}
