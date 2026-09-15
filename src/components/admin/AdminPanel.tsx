import type { AdminPanelProps } from "./admin.types";
import styles from "./AdminPanel.module.css";

/**
 * A titled section within an admin screen.
 *
 * The heading level is fixed at <h2> and is not a prop, because the layout owns
 * the single <h1> above it. That is what makes the classes screen - three
 * panels under one title - read as one page's outline rather than as three
 * pages stacked, and it is the kind of decision that stops being true the
 * moment it becomes configurable.
 */
export default function AdminPanel({
  heading,
  description,
  children,
}: AdminPanelProps): React.ReactNode {
  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>{heading}</h2>
      {description ? (
        <p className={styles.description}>{description}</p>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
