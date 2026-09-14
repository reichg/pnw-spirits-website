import Link from "next/link";
import type { AdminNavCardProps } from "./admin.types";
import styles from "./AdminNavCard.module.css";

/**
 * One destination on the /admin landing.
 *
 * Takes the roster entry whole rather than restating href/label/hint as three
 * props: ADMIN_NAV_ITEMS is already the single source of admin routes and the
 * landing maps it straight through, so a second declaration of its shape could
 * only drift from it.
 *
 * The hint is inside the link and is therefore part of its accessible name -
 * "Manage Blogs Create and edit blog posts" - which is correct here and is why
 * there is no aria-label overriding it. The two lines are one destination
 * described at two lengths, not a name plus a decoration, so suppressing the
 * hint would make the link announce less than it shows.
 */
export default function AdminNavCard({
  item,
}: AdminNavCardProps): React.ReactNode {
  return (
    <Link className={styles.card} href={item.href}>
      <span className={styles.label}>
        {/* The inner span is the underline's painted box: a block element
            cannot animate a background that tracks the text's own width, and
            text-decoration-color cannot be transitioned by width at all. Same
            mechanism as the public card and row. */}
        <span className={styles.labelText}>{item.label}</span>
      </span>
      <span className={styles.hint}>{item.hint}</span>
    </Link>
  );
}
