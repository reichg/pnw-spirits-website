import type { AdminPageLayoutProps } from "./admin.types";
import styles from "./AdminPageLayout.module.css";

/**
 * The shell every admin screen renders into: a two-band header, the body, and
 * an optional footer row for the pager.
 *
 * Presentational and stateless, like ContentArchiveLayout - but NOT a server
 * component and not restricted to one. It carries no "use client" of its own so
 * it can be rendered from either side of the boundary, and that is load-bearing
 * rather than hypothetical: `AdminLanding` is a server component and renders
 * into this shell, while the four editing screens are client components and
 * render into the same one.
 *
 * It holds no domain knowledge: `count` arrives already worded ("1-10 of 43")
 * and `controls` arrives already built, so this file never learns what a recipe
 * is or how a screen spells its own search state.
 *
 * WHY THE HEADING IS ALWAYS AN <h1> AND THE LEVEL IS NOT A PROP: one screen,
 * one document title. AdminPanel's heading is the <h2> beneath it, which is what
 * makes the classes screen - three panels under one title - read as an outline
 * rather than as three unrelated pages stacked.
 */
export default function AdminPageLayout({
  eyebrow,
  heading,
  intro,
  toolbar,
  count,
  controls,
  children,
  footer,
}: AdminPageLayoutProps): React.ReactNode {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        {/* The heading and the screen's primary action share one line, with the
            action SECOND in source order and pinned to the title rather than to
            the right edge. See .titleRow for the three reasons. */}
        <div className={styles.titleRow}>
          <h1 className={styles.heading}>{heading}</h1>
          {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
        </div>
        {intro ? <p className={styles.intro}>{intro}</p> : null}
        {/* Band 2 is the list's own band: what is in the list, and how you
            narrow it. It disappears entirely on a screen that is a form rather
            than a list, which is why the whole row is conditional - an empty
            48px band above a form would read as a broken control strip. */}
        {count || controls ? (
          <div className={styles.headerFoot}>
            {count ? <p className={styles.count}>{count}</p> : null}
            {controls ? (
              <div className={styles.controls}>{controls}</div>
            ) : null}
          </div>
        ) : null}
      </header>

      {children}

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </main>
  );
}
