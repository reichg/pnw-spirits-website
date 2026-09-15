import S3CardBackgroundImage from "@/components/Media/S3CardBackgroundImage";
import type { AdminCardActionTone, AdminCardProps } from "./admin.types";
import styles from "./AdminCard.module.css";

/**
 * One manageable record, as a non-interactive container whose actions are real,
 * individually focusable buttons.
 *
 * It renders the same anatomy at three densities - the 80px list line, the
 * landing entry and the album tile - switched entirely by custom properties
 * AdminCardGrid sets on the list. Nothing in this file branches on density, and
 * that is deliberate: a density prop here would be a second place to look for a
 * decision the grid already owns, and the grid is the element that knows how
 * much horizontal space there is.
 *
 * NO ROOT PASSTHROUGH - no className, no style, no ...rest, no ref. That is the
 * contract's central guarantee, not an omission: a passthrough would let any
 * consumer spread an onClick or a role="button" back onto the root and silently
 * re-create the nested-interactive bug this component exists to remove. A
 * sortable consumer wraps this card in its own positioned element instead.
 */
export default function AdminCard({
  title,
  excerpt,
  meta,
  badge,
  media,
  actions,
  dragHandle,
  children,
}: AdminCardProps): React.ReactNode {
  return (
    <div className={styles.card}>
      {dragHandle ? (
        <div className={styles.dragHandle}>{dragHandle}</div>
      ) : null}

      <div className={styles.main}>
        {/* An omitted `media` renders no element at all, so a session card does
            not reserve 56px it will never fill. `{ s3Key: null }` is the other
            state - the slot exists and the record has no cover - and it holds
            an empty plate so a list of mostly-illustrated records stays even. */}
        {media ? (
          <div
            className={
              media.s3Key
                ? styles.media
                : `${styles.media} ${styles.mediaEmpty}`
            }
          >
            <S3CardBackgroundImage
              s3Key={media.s3Key}
              // Decorative, and that is the honest reading: the plate is a
              // recognition token sitting beside the title it belongs to, so an
              // alt of "cover photo for X" would announce the record's name
              // twice to a screen reader and add nothing to a page where the
              // title is the subject.
              alt=""
              className={styles.mediaImage}
              // One hint for both the 56px line thumbnail and the ~240px album
              // tile, because the card cannot see which density it is in. 15rem
              // is sized for the tile, which is the case that would actually
              // look wrong under-fetched; the thumbnail over-fetches to the next
              // srcSet step up, which is roughly what a 2x display asks for
              // anyway. Without this the shared component's 100vw default would
              // pull a full-width source for a 56px box, ten times per page.
              sizes="(max-width: 599px) 40vw, 15rem"
            />
          </div>
        ) : null}

        <div className={styles.content}>
          <p className={styles.title}>{title}</p>
          {excerpt ? <p className={styles.excerpt}>{excerpt}</p> : null}
          {meta && meta.length > 0 ? (
            <dl className={styles.meta}>
              {meta.map((item) => (
                <div className={styles.metaItem} key={item.label}>
                  <dt className={styles.metaLabel}>{item.label}</dt>
                  <dd className={styles.metaValue}>{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {badge ? <p className={styles.badge}>{badge.label}</p> : null}
        </div>

        {actions && actions.length > 0 ? (
          <div className={styles.actions}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={`${styles.action} ${TONE_CLASS[action.tone ?? "secondary"]}`}
                // Required by the contract, and required by the row: a keyboard
                // user tabbing ten records otherwise hears "Edit, Delete, Edit,
                // Delete" with nothing to say which one they are on. It must
                // contain the visible label verbatim ("Delete blog: Old
                // Fashioned") or the control fails WCAG 2.5.3 Label in Name for
                // anyone driving the page by voice.
                aria-label={action.ariaLabel}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {children ? <div className={styles.body}>{children}</div> : null}
    </div>
  );
}

// Defaults to `secondary` at the call site above, so an action that states no
// tone cannot accidentally read as destructive.
const TONE_CLASS: Record<AdminCardActionTone, string> = {
  primary: styles.actionPrimary,
  secondary: styles.actionSecondary,
  danger: styles.actionDanger,
};
