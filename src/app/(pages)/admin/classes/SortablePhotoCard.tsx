"use client";
import Image from "next/image";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaGripVertical } from "react-icons/fa";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import styles from "./AdminClassManager.module.css";

interface SortablePhoto {
  id: number;
  s3Key: string;
  caption: string | null;
  sortOrder: number;
}

interface SortablePhotoCardProps {
  photo: SortablePhoto;
  disabled: boolean;
  /* True when this photo's order position is beyond the public album cap, so it
     will not appear on the public /classes page. Defaults to false. */
  beyondPublicLimit?: boolean;
  onSaveCaption: (photo: SortablePhoto, caption: string) => void;
  onDelete: (id: number) => void;
}

export default function SortablePhotoCard({
  photo,
  disabled,
  beyondPublicLimit = false,
  onSaveCaption,
  onDelete,
}: SortablePhotoCardProps) {
  const { url } = useS3ImageUrl(photo.s3Key);
  const [caption, setCaption] = useState(photo.caption ?? "");
  // Ties the tile to its status badge so assistive tech reads the "not shown
  // publicly" state as part of the card's accessible description.
  const limitNoteId = `photo-${photo.id}-limit-note`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  // dnd-kit drives position via inline transform/transition; the dragging class
  // only layers the visual lift/translucency on top.
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Merge dnd-kit's keyboard-instructions description with the limit-note id so
  // neither clobbers the other (a single explicit prop after the spread also
  // resolves the duplicate aria-describedby TS error).
  const describedBy =
    [attributes["aria-describedby"], beyondPublicLimit ? limitNoteId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    // The whole card is the drag source: dnd-kit's attributes (role=button,
    // tabindex, aria-roledescription) + pointer/keyboard listeners live here.
    // Nested controls call stopPropagation so interacting with them never
    // starts a drag (paired with the PointerSensor distance constraint).
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.photoItem} ${isDragging ? styles.dragging : ""} ${
        beyondPublicLimit ? styles.beyondLimit : ""
      }`}
      {...attributes}
      {...listeners}
      aria-describedby={describedBy}
    >
      {beyondPublicLimit && (
        <span id={limitNoteId} className={styles.limitBadge}>
          Not shown publicly
        </span>
      )}
      {/* Decorative grip cue only — the entire card carries the drag listeners,
          so this icon is aria-hidden and is not a focusable tab stop. */}
      <span className={styles.dragHandle} aria-hidden="true">
        <FaGripVertical />
      </span>
      {url ? (
        <Image
          src={url}
          alt={photo.caption ?? "Class photo"}
          className={styles.photoThumb}
          width={200}
          height={150}
        />
      ) : (
        <div className={styles.photoThumb} aria-hidden="true" />
      )}
      <input
        className={styles.input}
        value={caption}
        placeholder="Caption"
        onChange={(e) => setCaption(e.target.value)}
        // Stop drag/keyboard activators on the card root from firing while the
        // admin clicks into, selects text in, or types in the caption field.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        disabled={disabled}
      />
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.buttonSecondary}
          onClick={() => onSaveCaption(photo, caption)}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={disabled}
        >
          Save
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={() => onDelete(photo.id)}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={disabled}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
