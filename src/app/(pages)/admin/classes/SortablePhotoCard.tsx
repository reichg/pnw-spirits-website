"use client";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaGripVertical } from "react-icons/fa";

import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import AdminField from "@/components/admin/AdminField";
import { AdminInput } from "@/components/admin/AdminInput";
import type { ClassPhoto } from "./AdminClassManager";
import styles from "./AdminClassManager.module.css";

/**
 * One album photograph, as a drag-reorderable tile.
 *
 * THE ALBUM STAYS A GRID. Every other list in this admin became an 80px ruled
 * line, and this one deliberately did not: the album's spatial order IS the
 * information the admin opened the page to change, and a single column of rows
 * cannot express "this one is third from the left on the public page". The row
 * anatomy would have destroyed the thing being edited.
 *
 * WHY THE CARD IS WRAPPED RATHER THAN CONFIGURED. `AdminCard` has no root
 * passthrough - no className, no style, no ref, no ...rest - and that is the
 * design layer's central guarantee, not an omission: a passthrough is how a
 * consumer would spread an `onClick` or a `role="button"` back onto the card
 * root and silently re-create the nested-interactive bug the overhaul exists to
 * remove. So dnd-kit's sortable node ref and its positional transform go on a
 * wrapper this file owns, and only the activator goes into the card.
 *
 * WHAT CHANGED FOR ACCESSIBILITY, and it is the reason this file was rewritten
 * rather than restyled. The whole tile used to be the drag source: dnd-kit's
 * `role="button"` and `tabIndex` sat on a div that contained a text input and
 * two buttons, so the tile was one ambiguous tab stop announced as a button
 * whose content was three more controls, every inner control had to
 * `stopPropagation` to keep the outer activator from firing, and the outer
 * `onKeyDown` swallowed Space inside the caption field. The grip was an
 * `aria-hidden` span - a picture of a control. Now the grip is the control: a
 * real, permanently visible, 40x40 <button> carrying `setActivatorNodeRef`,
 * dnd-kit's attributes and its listeners, and nothing else in the tile is a
 * drag source. Not one `stopPropagation` remains.
 */
interface SortablePhotoCardProps {
  photo: ClassPhoto;
  /**
   * 1-based position in album order. It is the tile's identity - a photograph
   * has no name, and its caption is the field being edited two lines below it,
   * so the ordinal is the only thing that can head the card and the only thing
   * that can name the reorder control. It is also what makes the keyboard path
   * legible: dnd-kit announces the move, and the visible number confirms it.
   */
  position: number;
  /** Album length, so the grip's accessible name reads "3 of 12". */
  total: number;
  disabled: boolean;
  /**
   * True when this photo's position is past the public album cap, so it will
   * not appear on the public /classes page. Defaults to false.
   */
  beyondPublicLimit?: boolean;
  onSaveCaption: (photo: ClassPhoto, caption: string) => void;
  onDelete: (id: number) => void;
}

/**
 * The tile's identity, and the stem of all three of its control names.
 *
 * A photograph has no name; its 1-based album position is the only thing that
 * identifies it on screen, in the confirmation dialog, and in dnd-kit's
 * announcements.
 *
 * Module-private, unlike `photoGripLabel` below: nothing outside this file
 * reads it, and the manager composes the dialog's "Photo 3" itself from the
 * ordinal it already snapshotted.
 */
function photoLabel(position: number): string {
  return `Photo ${position}`;
}

/**
 * The grip's accessible name, spelled ONCE.
 *
 * Exported because `AdminClassManager` reads it back: after a confirmed delete
 * renumbers the album, it returns focus to the successor tile's grip and has to
 * find that button by the name announced for it. The total is part of the name
 * because the count is exactly what a delete just changed - "Reorder Photo 3 of
 * 11" reports both halves of the renumbering in one string.
 *
 * No cycle: this module already takes `ClassPhoto` from the manager as a
 * type-only import, which is erased, so the one runtime edge between these two
 * files still runs manager -> tile.
 */
export function photoGripLabel(position: number, total: number): string {
  return `Reorder ${photoLabel(position)} of ${total}`;
}

export default function SortablePhotoCard({
  photo,
  position,
  total,
  disabled,
  beyondPublicLimit = false,
  onSaveCaption,
  onDelete,
}: SortablePhotoCardProps) {
  const [caption, setCaption] = useState(photo.caption ?? "");

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id, disabled });

  // dnd-kit drives position through an inline transform; the dragging class only
  // layers the lift and the translucency on top of it.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const label = photoLabel(position);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[styles.sortable, isDragging ? styles.dragging : null]
        .filter(Boolean)
        .join(" ")}
    >
      <AdminCard
        title={label}
        media={{ s3Key: photo.s3Key }}
        // NOT --danger. A photo past the cap reports a fact the admin needs in
        // order to decide what to reorder; nothing failed and nothing is being
        // destroyed. The card renders this at --ink-2 with a neutral tick, and
        // spending the alarm colour here is exactly what would stop it meaning
        // one thing. It also needs no aria-describedby wiring any more: that
        // existed only because the card root was a button and collapsed its
        // content into one accessible name.
        badge={
          beyondPublicLimit ? { label: "Not shown publicly" } : undefined
        }
        dragHandle={
          <button
            // attributes carry role, tabIndex, aria-roledescription="sortable"
            // and the aria-describedby pointing at dnd-kit's keyboard
            // instructions; listeners carry the pointer and keyboard
            // activators. Spread first so the explicit props below win.
            {...attributes}
            {...listeners}
            ref={setActivatorNodeRef}
            type="button"
            className={styles.grip}
            // The visible content is an icon, so the accessible name is the
            // whole name. It states the position because a keyboard user
            // arriving here has no other way to know which tile they are on -
            // which is also why it is where focus lands after a confirmed
            // delete renumbers the album.
            aria-label={photoGripLabel(position, total)}
            disabled={disabled}
          >
            <FaGripVertical aria-hidden="true" />
          </button>
        }
      >
        {/* The caption field and its controls go in the card's body slot, with
            no `actions` passed. Both render; this order reads better, because
            `actions` would put Delete ABOVE the caption it belongs to. */}
        <div className={styles.tileForm}>
          <AdminField label="Caption">
            {(control) => (
              <AdminInput
                {...control}
                value={caption}
                placeholder="Caption"
                onChange={(e) => setCaption(e.target.value)}
                disabled={disabled}
              />
            )}
          </AdminField>
          <div className={styles.tileActions}>
            {/* Both names contain their visible label verbatim (WCAG 2.5.3) and
                name the tile, because a keyboard user tabbing an album of
                twelve otherwise hears "Save, Delete" twelve times over. */}
            {/* PRIMARY, AND IT IS A CORRECTION RATHER THAN A PROMOTION. This
                control took the `secondary` default, and measured against its
                neighbour that made the tile the one place in the portal where a
                constructive control and a destructive one are the same object:
                both painted ink 0.66 / rule 0.38 at 180x40, 48px apart at 1440
                and 8px apart SIDE BY SIDE under a thumb at 390. The rank had
                nothing to work with, because AdminCardGrid neutralises a
                repeated `danger` to --ink-2 (correctly - twelve tiles must not
                show twelve alarms) and `secondary` is already --ink-2.

                admin.types.ts defines `primary` as "the card's main action
                (Edit on a list card, Save on the session card's inline edit
                form)". A tile's Save is exactly that and was simply never
                given it; every other card on this screen already ranks its
                constructive action one ink tier above its destructive one.
                Measured after: ink 0.92 (13.57:1) over 0.66 (7.35:1), the same
                gap the session rows above use, plus a copper edge the neighbour
                does not have.

                REJECTED - re-reddening Delete here. The neutral-at-rest rule is
                deliberate and measured; the defect is the neighbour, not the
                Delete. REJECTED - ranking by mass instead (Delete at
                `inline-size: auto` against a full-width Save), which leaves both
                at one ink tier and reads as a layout accident on the 390 line
                where the two controls share it. REJECTED - moving the pair into
                AdminCard's `actions` slot, which renders above `children` and
                would separate Save from the caption it saves. */}
            <AdminButton
              tone="primary"
              ariaLabel={`Save caption for ${label}`}
              onClick={() => onSaveCaption(photo, caption)}
              disabled={disabled}
            >
              Save
            </AdminButton>
            <AdminButton
              tone="danger"
              ariaLabel={`Delete ${label}`}
              onClick={() => onDelete(photo.id)}
              disabled={disabled}
            >
              Delete
            </AdminButton>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
