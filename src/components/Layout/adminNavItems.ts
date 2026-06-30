export interface AdminNavItem {
  href: string;
  label: string;
  hint: string;
}

// Single shared source of admin routes, consumed by the admin landing grid and the admin navbar.
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin/blogs", label: "Manage Blogs", hint: "Create and edit blog posts" },
  { href: "/admin/recipes", label: "Manage Recipes", hint: "Curate cocktail recipes" },
  { href: "/admin/classes", label: "Manage Classes", hint: "Schedule and update classes" },
  { href: "/admin/newsletter", label: "Send Newsletter", hint: "Compose and broadcast updates" },
] as const;

export const ADMIN_HOME = { href: "/admin", label: "Admin Portal" } as const;
