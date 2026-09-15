import AdminCardGrid from "@/components/admin/AdminCardGrid";
import AdminNavCard from "@/components/admin/AdminNavCard";
import AdminPageLayout from "@/components/admin/AdminPageLayout";
import { ADMIN_NAV_ITEMS } from "@/components/Layout/adminNavItems";

/**
 * The /admin front door: four destinations, and nothing else.
 *
 * NO "use client", AND THAT IS A CHANGE. This component reads no state and
 * binds no handler, and every piece it composes is hook-free, so it renders on
 * the server. It still sits behind the gate: `admin/layout.tsx` passes the page
 * through `AdminAuthGate` as `children`, and a server subtree handed to a
 * client component as children stays server-rendered. What it buys is the whole
 * landing leaving the client bundle - the roster, the four links and the
 * headings all arrive as markup.
 *
 * NO MODULE OF ITS OWN, AND THAT IS THE SECOND CHANGE. AdminLanding.module.css
 * is deleted rather than emptied: the shell, the spine, the two-column ruled
 * arrangement and the entry treatment are all declared once in the design layer
 * (AdminPageLayout / AdminCardGrid / AdminNavCard), and what was left here was
 * a file with no rule in it. A stylesheet that declares nothing is a file the
 * next person has to open to discover it does nothing.
 *
 * TWO COLUMNS, NOT ONE - `density="cards"`, whose whole readership is this
 * page. Four ruled rows on a 1200px spine leave ~1000px of empty measure per
 * entry, four times over; and the argument FOR a one-column ruled list is
 * SCANNING - a column the eye runs down comparing a shared field - which four
 * unlike destinations do not get, because they are read once and then
 * remembered. See AdminCardGrid.module.css for the 64px column gap and the zero
 * row gap that make the four rules land on two lines.
 *
 * NO EYEBROW. The layout offers one and this is the screen most tempted by it,
 * but the chrome bar directly above already reads "Admin | Admin Portal" and
 * the heading below reads "Admin Portal". A third statement of the same brand
 * on one screen is the repetition, not the identity.
 *
 * ADMIN_NAV_ITEMS stays the single source of the roster - the same list the
 * admin chrome renders - so a fifth section appears in both places or in
 * neither.
 */
export default function AdminLanding(): React.ReactNode {
  return (
    <AdminPageLayout heading="Admin Portal" intro="Choose a section to manage.">
      {/* The landmark is on the wrapper rather than on the grid, because
          AdminCardGrid renders the <ul> that makes the count announceable and a
          <nav> is not a list. Nested this way a screen reader gets both: a
          named navigation region, and "list, 4 items" inside it. */}
      <nav aria-label="Admin sections">
        <AdminCardGrid density="cards">
          {ADMIN_NAV_ITEMS.map((item) => (
            <AdminNavCard key={item.href} item={item} />
          ))}
        </AdminCardGrid>
      </nav>
    </AdminPageLayout>
  );
}
