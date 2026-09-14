import type { ComponentPropsWithRef } from "react";
import styles from "./AdminInput.module.css";

/**
 * The admin's text controls.
 *
 * TWO EXPORTS IN ONE FILE, deliberately, and one stylesheet behind them: an
 * input and a textarea are the same control at two tag names, and the only
 * difference between them in this system is a minimum height and a resize
 * handle. Splitting them into two files would mean one importing the other's
 * module, which is a cross-file dependency carrying no information.
 *
 * Both are thin passthroughs over the native element, and that is the design:
 * `type`, `value`, `onChange`, `required`, `maxLength`, `rows`, `autoComplete`
 * and every other attribute a form reaches for stay native, so the four screens
 * that use these do not have to discover which of them this layer chose to
 * re-export. `className` is merged rather than replaced for the same reason -
 * the date-time inputs on the sessions form need a width these controls should
 * not be guessing at.
 *
 * `ref` IS FORWARDED, and it is forwarded by the passthrough rather than by
 * any code here: React 19 passes `ref` as an ordinary prop, so switching the
 * prop types from `InputHTMLAttributes` to `ComponentPropsWithRef` is the
 * whole change and `{...rest}` carries it. Two screens now reach a textarea's
 * caret through `document.getElementById` to insert at the cursor, which is a
 * component querying the document for an element it rendered itself - the
 * lookup can miss, it is not typed, and it breaks the moment two of these are
 * on one screen. A ref is the supported way to ask.
 */
export function AdminInput({
  className,
  ...rest
}: ComponentPropsWithRef<"input">): React.ReactNode {
  return (
    <input
      className={[styles.control, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function AdminTextarea({
  className,
  ...rest
}: ComponentPropsWithRef<"textarea">): React.ReactNode {
  return (
    <textarea
      className={[styles.control, styles.textarea, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
