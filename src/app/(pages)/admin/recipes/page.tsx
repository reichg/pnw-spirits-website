import { AdminTokenProvider } from "../AdminTokenContext";
import AdminRecipeList from "./AdminRecipeList";

export default function AdminRecipesPage() {
  return (
    <AdminTokenProvider>
      <AdminRecipeList />
    </AdminTokenProvider>
  );
}
