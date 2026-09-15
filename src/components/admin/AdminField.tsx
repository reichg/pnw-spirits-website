"use client";

import { useId } from "react";
import type { AdminFieldProps } from "./admin.types";
import styles from "./AdminField.module.css";

/**
 * A labelled form field: the label, the hint, the error, and the wiring that
 * ties all three to the control.
 *
 * WHY A RENDER PROP, which is the one unusual shape in this design layer. The
 * field owns three ids and three attributes that have to land on a control it
 * does not create - `id`, `aria-describedby` and `aria-invalid` - and there are
 * only four ways to deliver them:
 *
 *   - make the caller repeat them. Roughly twenty-five field call sites across
 *     four screens, each hand-spelling two derived id strings. One of them will
 *     be wrong, and a wrong aria-describedby fails silently: nothing looks
 *     broken and a screen reader simply never reads the hint.
 *   - cloneElement the child. Works until a caller wraps the control in a
 *     fragment or a div, and then it silently stops working.
 *   - a React context the controls read. No repetition, but the coupling is
 *     invisible: a control rendered outside a field is valid TypeScript that
 *     quietly loses its label association.
 *   - hand the caller exactly what it must spread, and make the type require it.
 *
 * The last is the only one where a miswiring is a compile error. It costs one
 * arrow function per field and it cannot be got wrong.
 *
 * `id` is optional and falls back to useId(), so a form only names a field when
 * something outside the field needs to reference it - a submit handler focusing
 * the first invalid control, say. useId is stable across the server and client
 * renders, which a counter or a random string would not be.
 */
export default function AdminField({
  label,
  id,
  hint,
  error,
  required,
  children,
}: AdminFieldProps): React.ReactNode {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  // Both, in reading order, when both are present: a screen reader should hear
  // what the field wants before it hears what went wrong with it.
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}

      {children({
        id: fieldId,
        "aria-describedby": describedBy,
        // Undefined rather than false: aria-invalid="false" is a valid but
        // noisier thing to put in the DOM on every healthy field in the form.
        "aria-invalid": error ? true : undefined,
      })}

      {error ? (
        // role="alert" rather than reusing AdminStatus. The treatments differ
        // by scope, not by severity: AdminStatus is the screen's message and
        // carries a 3px rule and body-size type, while this is a caption on one
        // control and has to stay inside the field's own rhythm. Both are
        // assertive, because both mean the admin has lost work.
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
