import type { AdminStatusProps, AdminStatusTone } from "./admin.types";
import styles from "./AdminStatus.module.css";

/**
 * Reports the outcome of something the admin just did.
 *
 * The announcement is DERIVED from the tone rather than passed in, which is the
 * whole reason this is a component and not a class. What that replaced: the
 * newsletter composer hand-wrote role="status" aria-live="polite" and got it
 * right, while every list's error path rendered a bare paragraph and announced
 * nothing at all - two screens, two answers, one of them silent. Here there is
 * one answer and no screen restates it.
 *
 * role="alert" carries an implicit aria-live="assertive", so an error interrupts
 * whatever the screen reader was saying. That is correct for a failed save and
 * wrong for anything else, which is why only `error` gets it.
 */
export default function AdminStatus({
  tone,
  children,
}: AdminStatusProps): React.ReactNode {
  return (
    <p
      className={`${styles.status} ${TONE_CLASS[tone]}`}
      role={tone === "error" ? "alert" : "status"}
      // Stated alongside the role rather than left implicit: the politeness a
      // role implies is honoured inconsistently across screen readers, and this
      // is a region the admin only ever hears once.
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      {children}
    </p>
  );
}

const TONE_CLASS: Record<AdminStatusTone, string> = {
  error: styles.error,
  success: styles.success,
  info: styles.info,
};
