import { Children } from "react";
import type { AdminCardGridDensity, AdminCardGridProps } from "./admin.types";
import styles from "./AdminCardGrid.module.css";

/**
 * A list of cards, at one of three densities.
 *
 * It is a real <ul> and it wraps every child in its own <li>, so assistive
 * technology announces how many records there are before the reader starts
 * through them - which is the one thing a screen reader can offer that a
 * sighted admin gets for free from the page's shape. That is also why this
 * takes a list of cards rather than arbitrary nodes.
 *
 * Children.map rather than asking each screen to supply its own <li>: the
 * wrapper carries `min-width: 0`, without which neither a grid track nor a flex
 * item shrinks below its content and the card title's ellipsis never engages.
 * Leaving that to the call site means one of five screens forgets it and one
 * list quietly loses its right-hand action column.
 *
 * Children.map also preserves each child's own key, so a screen keeps control of
 * React's reconciliation for its own records.
 */
export default function AdminCardGrid({
  density = "cards",
  children,
}: AdminCardGridProps): React.ReactNode {
  return (
    // role="list" is not redundant on a <ul>. `list-style: none` removes list
    // semantics in Safari/VoiceOver, and this component's stated purpose is
    // that a screen reader announces how many records there are before the
    // admin starts through them - so the one browser that would have dropped
    // the count is exactly the one this restores it for.
    <ul role="list" className={`${styles.grid} ${DENSITY_CLASS[density]}`}>
      {Children.map(children, (child) => (
        <li className={styles.item}>{child}</li>
      ))}
    </ul>
  );
}

const DENSITY_CLASS: Record<AdminCardGridDensity, string> = {
  rows: styles.rows,
  cards: styles.cards,
  tiles: styles.tiles,
};
