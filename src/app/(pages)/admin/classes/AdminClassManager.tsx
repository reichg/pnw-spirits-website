"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import {
  ADMIN_EYEBROW,
  type AdminCardAction,
} from "@/components/admin/admin.types";
import {
  findByAccessibleName,
  focusIfOrphaned,
} from "@/components/admin/adminFocus";
import { useAdminToken } from "@/components/admin/AdminTokenContext";
import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import AdminCardGrid from "@/components/admin/AdminCardGrid";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminField from "@/components/admin/AdminField";
import { AdminInput, AdminTextarea } from "@/components/admin/AdminInput";
import AdminPageLayout from "@/components/admin/AdminPageLayout";
import AdminPanel from "@/components/admin/AdminPanel";
import AdminStatus from "@/components/admin/AdminStatus";
import { MAX_ALBUM_PHOTOS } from "@/config/album";
import { readAdminError, useAdminFetch } from "@/hooks/useAdminFetch";
import SortablePhotoCard, { photoGripLabel } from "./SortablePhotoCard";
import styles from "./AdminClassManager.module.css";

/**
 * The /classes manager: the public page's content, its schedule, and its photo
 * album, on one screen under one heading.
 *
 * THIS SCREEN IS THREE SURFACES AND THEY TAKE THREE DIFFERENT ANSWERS. The
 * shared admin design layer's record line is right for exactly one of them, and
 * rolling it out across all three would have broken the album:
 *
 *   Page Content         a form - AdminField + AdminInput/AdminTextarea.
 *   Class Dates & Times  a row list - AdminCardGrid density="rows". The inline
 *                        edit is the SAME card: same title, the three fields in
 *                        the body slot, Save/Cancel as its actions.
 *   Photo Album          a grid, and it must stay one. Spatial order is the
 *                        information being edited; rows cannot express it.
 *
 * NETWORKING IS `useAdminFetch`, not a local copy. What that replaced: a
 * hand-rolled `authFetch`, a `requireAuth` that pushed to /admin/login on 401
 * only - so a 403 (a valid token without the admin role) was reported as an
 * ordinary failure and the session was left in place - and a `readError` with
 * no cap on what it would put on screen. The shared hook signs out on BOTH
 * statuses and navigates on neither; `AdminAuthGate` owns the single redirect.
 * It also returns the response rather than short-circuiting, so every former
 * `if (!requireAuth(res.status)) return;` is now a plain `!res.ok` branch - and
 * that is a fix as well as a simplification, because the drag-reorder handler
 * used to take the auth branch BEFORE its revert and leave the album showing an
 * order the server had rejected.
 */

// S3 key prefix for cocktail-class photo-album uploads.
const ALBUM_KEY_PREFIX = "class-media/album";
const CLASSES_ENDPOINT = "/api/classes";
const SESSIONS_ENDPOINT = `${CLASSES_ENDPOINT}/sessions`;
const PHOTOS_ENDPOINT = `${CLASSES_ENDPOINT}/photos`;
const PHOTOS_REORDER_ENDPOINT = `${PHOTOS_ENDPOINT}/reorder`;
const SIGNED_URL_ENDPOINT = "/api/s3-signed-url";

/** Which session mutation is in flight; see the state it drives. */
type SessionOperation = "add" | "row";

interface ClassContent {
  id: number;
  title: string;
  description: string;
}

interface ClassSession {
  id: number;
  startTime: string;
  endTime: string | null;
  location: string | null;
}

/**
 * Exported for `SortablePhotoCard`, which imports it with `import type` and is
 * therefore not a runtime edge back into this module - the declaration is
 * erased at compile time. One declaration site rather than the structurally
 * identical `SortablePhoto` the tile used to keep beside this one, where a
 * field added here would silently not reach there.
 */
export interface ClassPhoto {
  id: number;
  s3Key: string;
  caption: string | null;
  sortOrder: number;
}

interface ClassesResponse {
  class: ClassContent | null;
  sessions: ClassSession[];
  photos: ClassPhoto[];
}

/**
 * A photo awaiting delete confirmation, captured as a SNAPSHOT rather than held
 * by id and looked up on render.
 *
 * A photograph has no name. The only thing that identifies it to the admin is
 * its ordinal - "Photo 3" - which is a function of its position in an array
 * that a reorder or a `reload()` can renumber. Resolving the ordinal once, at
 * the moment Delete was pressed, is what guarantees the dialog keeps naming the
 * tile the admin actually pressed Delete on, rather than whichever photo has
 * since slid into third place.
 */
type PendingPhotoDelete = {
  id: number;
  /** 1-based album position at the moment Delete was pressed. */
  position: number;
  caption: string | null;
};

/**
 * Where focus is owed once the screen settles again.
 *
 * THREE TRANSITIONS ON THIS SCREEN END WITH NOBODY FOCUSED, and they are one
 * problem with one shape: a control is unmounted while it holds focus, the
 * browser drops focus to <body>, and the admin is returned to the top of a
 * 2273px document. Two of them are the inline session edit opening and closing;
 * the third is a confirmed delete, where the dialog's own restore has nothing
 * to return to because the control that opened it was the thing deleted.
 *
 * `useModalDismiss` now declines to guess in that last case rather than walking
 * the dead trigger's ancestor path - a walk that, measured on this page, landed
 * in the album's upload caption field, where the admin's next keystrokes
 * silently became the next upload's caption. Declining is correct: the hook
 * cannot know when this screen's reload has settled or what survived it. This
 * screen can, so the answer is here.
 *
 * SUCCESSOR BY INDEX, NOT BY ID: the record whose id we had is gone, and what
 * the admin wants is the thing that took its place. The index is captured
 * before the request goes out and clamped to the list that comes back, so
 * deleting the last entry lands on the new last entry rather than off the end.
 */
type PendingFocus =
  /** Leaving the inline edit, by Save or by Cancel: back to that row's Edit. */
  | { kind: "sessionEdit"; sessionId: number }
  /** After a confirmed session delete: the row now at this index. */
  | { kind: "sessionRow"; index: number }
  /** After a confirmed photo delete: the tile now at this index. */
  | { kind: "photoTile"; index: number }
  /**
   * After a form submit that succeeded: back to the submit control itself.
   *
   * WHY THESE TWO WERE MISSING UNTIL THE BUSY FIX MADE THEM VISIBLE. A busy
   * control used to be `disabled`, so focus had already been dropped to <body>
   * by the browser one millisecond after the press; there was no focus left for
   * the reload() to lose, and nothing to notice. Now the control keeps focus
   * for the whole request - and then reload() flips `loading`, tears all three
   * panels down behind the loading state, and unmounts it. Measured on
   * /admin/classes: activeElement settled at BODY after both Save content and
   * Add session, on a 2273px page.
   *
   * Back to the control they pressed, for the reason the inline edit's exits
   * already give: it is where focus was before the screen moved it. Not the
   * next field - the admin finished a task here, they did not start one.
   */
  | { kind: "formSubmit"; form: "content" | "addSession" };

// Build a unique, sanitized S3 key under the album prefix.
//
// It does NOT mirror the record editors, although it used to claim to. They
// hand `uploadToS3` a raw `${prefix}/${file.name}`, so two uploads of
// "IMG_0001.jpg" address the same object and the second overwrites the first,
// and a filename with a space or a quote in it reaches S3 verbatim. This
// timestamp-plus-sanitize is the stricter of the two spellings and is left as
// the one that is right; the editors are the ones that diverge. Unifying them
// is a change to what gets written into stored content and is reported rather
// than made here.
function buildAlbumKey(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ALBUM_KEY_PREFIX}/${Date.now()}-${safeName}`;
}

// Convert an API ISO datetime string into the value expected by <input type="datetime-local">.
//
// EXPORTED FOR ITS TEST, WHICH IS A READER. See the note on sessionEditLabel
// below for the rule this file follows. This one is half of a round trip with
// localInputToIso, and a round trip is the kind of thing that is only ever
// wrong by an hour or a day: a drift here silently reschedules a class rather
// than failing, and the local/UTC boundary is exactly where that happens.
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Convert a datetime-local input value back into an ISO string for the API.
//
// EXPORTED FOR ITS TEST, WHICH IS A READER, and this is the one with teeth:
// `new Date("").toISOString()` THROWS a RangeError, straight out of a submit
// handler, for a field the admin may simply have cleared. Nothing in this file
// catches it. The test records that behaviour so a future change either keeps
// it or changes it deliberately; today it is the only thing that states it.
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/**
 * The session's date-time, and ONLY its date-time.
 *
 * Split out of the old `formatSession`, which folded the location into the same
 * string as "... @ Barrel Room". Under the card contract a session's title is
 * what identifies it and the location is a labelled metadata pair, so a screen
 * reader hears "Location: Barrel Room" instead of a bare "@" fragment, and the
 * locations form a column the eye can run down the list.
 *
 * `dateStyle`/`timeStyle` rather than `toLocaleString()`'s default, which
 * produced "1/2/2026, 6:00:00 PM - 1/2/2026, 8:00:00 PM" - seconds nobody set,
 * a date repeated, and a string long enough to be ellipsed out of a one-line
 * card title on a phone. An end time on the same day drops its date.
 *
 * EXPORTED FOR ITS TEST, WHICH IS A READER. See sessionEditLabel below for the
 * rule. This is the card contract's title half - the string that identifies a
 * session on screen - and it is also the stem of sessionEditLabel, so a drift
 * here propagates into the focus restore without touching that function.
 */
export function formatSessionTime(session: ClassSession): string {
  const start = new Date(session.startTime);
  if (Number.isNaN(start.getTime())) return session.startTime;
  const startLabel = start.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const end = session.endTime ? new Date(session.endTime) : null;
  if (!end || Number.isNaN(end.getTime())) return startLabel;

  const endLabel =
    start.toDateString() === end.toDateString()
      ? end.toLocaleTimeString(undefined, { timeStyle: "short" })
      : end.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `${startLabel} – ${endLabel}`;
}

// "Not set" rather than an omitted row: a session with no location is something
// the admin needs to see, and a metadata column with gaps in it stops being a
// column the eye can run down.
//
// EXPORTED FOR ITS TEST, WHICH IS A READER. See sessionEditLabel below for the
// rule. This is the card contract's metadata half, and its whole substance is
// the placeholder branch - the one an "omit empty values" tidy-up removes
// without noticing that the gap it leaves is the defect.
export function formatSessionLocation(session: ClassSession): string {
  return session.location?.trim() || "Not set";
}

/**
 * The accessible name of a session row's Edit control, spelled ONCE.
 *
 * It is written by `sessionActions` and read back by the focus restore below,
 * which has to find that control again after the row has been unmounted and
 * rebuilt. Two spellings of it would be a focus restore that silently stops
 * working the first time the label is reworded - and silently is the operative
 * word, because nothing on screen looks broken when focus is merely dropped.
 *
 * EXPORTED FOR ITS TEST, WHICH IS A READER - AND THE RULE THE OTHER EXPORTS IN
 * THIS FILE POINT AT.
 *
 * Read this next to `photoLabel` in SortablePhotoCard.tsx, which was
 * deliberately un-exported in the same pass and must not be read as
 * contradicting it. The distinction is not "a test wants it". `photoLabel` had
 * NO reader at all, so its export was surface with nothing behind it; its
 * sibling `photoGripLabel` stays exported for exactly the reason this function
 * now is - it carries a contract across a module boundary that a test pins.
 *
 * The contract here: the post-delete restore looks the successor row's Edit
 * control up BY ITS ACCESSIBLE NAME, built from this function and compared
 * exactly against the rendered `aria-label`. AdminCard exposes no id and no
 * ref by design, so there is no other handle. If the two spellings drift, the
 * restore finds nothing, focus stays on <body>, and a keyboard admin is
 * dropped on the floor - with no error, no warning and no failing test unless
 * this one exists. That failure is the export's justification, and it is why
 * removing the export as "unused" would be removing the check, not the cruft.
 */
export function sessionEditLabel(session: ClassSession): string {
  return `Edit session: ${formatSessionTime(session)}`;
}

/**
 * Start, End and Location - the three fields a session is, spelled once.
 *
 * The add form and a row's inline edit render exactly the same three controls
 * against different state, and they used to be two copies: relabelling "End
 * time" or changing a control's type reached one of them and silently not the
 * other. The duplication was structural, so the fix is too.
 *
 * `nativeRequired` is the ONE honest difference between the two call sites, and
 * it is not cosmetic. The add form is a real <form>, so `required` on the start
 * control makes the browser block the submit. The inline edit has no form around
 * it - its Save is a card action, a sibling of these fields - so `required`
 * there would be an attribute that never fires, and the field carries
 * `startError` plus aria-invalid instead. Both spellings show the same asterisk,
 * because both fields ARE required; only the enforcement differs.
 *
 * `startRef` is the second, and it is passed only by the inline edit: that form
 * appears in place of the control that had focus, so something has to be able
 * to put focus into it. The add form is always on screen and is reached by
 * tabbing, so it needs no handle. `AdminInput` forwards `ref` through its own
 * passthrough, so nothing here has to adapt it.
 */
function SessionFields({
  start,
  onStartChange,
  startError,
  startRef,
  end,
  onEndChange,
  location,
  onLocationChange,
  disabled,
  nativeRequired = false,
}: {
  start: string;
  onStartChange: (value: string) => void;
  startError?: string;
  startRef?: React.Ref<HTMLInputElement>;
  end: string;
  onEndChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  disabled: boolean;
  nativeRequired?: boolean;
}) {
  return (
    <div className={styles.sessionFields}>
      <AdminField label="Start time" required error={startError || undefined}>
        {(control) => (
          <AdminInput
            {...control}
            ref={startRef}
            type="datetime-local"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            required={nativeRequired}
            disabled={disabled}
          />
        )}
      </AdminField>
      <AdminField label="End time">
        {(control) => (
          <AdminInput
            {...control}
            type="datetime-local"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
            disabled={disabled}
          />
        )}
      </AdminField>
      <AdminField label="Location">
        {(control) => (
          <AdminInput
            {...control}
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            disabled={disabled}
          />
        )}
      </AdminField>
    </div>
  );
}

export default function AdminClassManager() {
  const { token } = useAdminToken();
  const adminFetch = useAdminFetch();

  const [content, setContent] = useState<ClassContent | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [photos, setPhotos] = useState<ClassPhoto[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentSaving, setContentSaving] = useState(false);
  const [contentError, setContentError] = useState("");
  const [contentSuccess, setContentSuccess] = useState("");

  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editLocation, setEditLocation] = useState("");
  // Two error slots, because they are anchored to two different controls: a
  // failed Edit or Delete belongs under the list it happened in, and a failed
  // Add belongs inside the form that was submitted. One slot put an add failure
  // under the row list and a delete failure under the add form.
  const [sessionError, setSessionError] = useState("");
  const [addSessionError, setAddSessionError] = useState("");
  // Validation, not a failed write: the inline edit has no <form> around it (its
  // Save is a card action, a sibling of the fields), so `required` cannot fire
  // and the field carries the message plus aria-invalid itself.
  const [editStartError, setEditStartError] = useState("");
  // WHICH session operation is in flight, not merely THAT one is. A single
  // boolean shared by Add, Edit and Delete made the Add button relabel itself
  // "Adding..." while a row was being deleted - it reported the wrong operation
  // to the one place the admin was looking. null is the resting state, so "is
  // anything in flight" stays one comparison.
  const [sessionBusy, setSessionBusy] = useState<SessionOperation | null>(null);
  /** The session awaiting delete confirmation. Held whole, not by id: the
   *  dialog names it by its date-time and there is nothing to look up. */
  const [pendingSessionDelete, setPendingSessionDelete] =
    useState<ClassSession | null>(null);

  const [photoCaption, setPhotoCaption] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [pendingPhotoDelete, setPendingPhotoDelete] =
    useState<PendingPhotoDelete | null>(null);
  // Separate from `photoUploading`, and deliberately NOT folded into
  // `albumLocked`. It exists for one job: disabling the dialog's own confirm
  // button while the DELETE is in flight. Under window.confirm the request
  // could not start until the admin answered and the prompt was gone by then,
  // so a second click was unreachable; the dialog stays on screen across the
  // request, which is what makes a double-fire reachable and this flag owed.
  const [photoDeleting, setPhotoDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* --- Focus, across the inline session edit ------------------------------
     THE INLINE EDIT IS A CONDITIONAL RE-RENDER, AND THAT IS WHY IT DROPS
     FOCUS. Pressing "Edit session" swaps the row's card for a card carrying the
     form; pressing Save or Cancel swaps it back. Each swap unmounts the control
     that had focus, and the browser answers an unmounted active element by
     dropping focus to <body> - measured: `document.activeElement` was BODY
     after all three transitions. On a 2273px page that returns a keyboard user
     to the top of the document in the middle of correcting a typo, which is
     WCAG 2.4.3 Focus Order.

     Nothing here is a dialog and none of it touches `useModalDismiss`: the
     confirmation dialogs on this screen already trap focus and return it, and
     that is a separate path.

     WHERE FOCUS GOES, and why each target rather than the alternatives:

       entering  the Start field. It is the first control of the form that just
                 replaced the button, and it is the field the admin is most
                 likely to have opened the row to change. Focusing the card
                 itself was rejected - it is a non-interactive container by
                 contract - and focusing Save would put the admin on the control
                 that ENDS the task they just started.
       leaving   that row's own Edit button, by both exits. It is the control
                 they pressed to get here, it is where focus was before the
                 screen moved it, and it is the only element of the restored row
                 that can take focus at all. Its existence is verified before
                 focus is moved rather than assumed.

     A CONFIRMED DELETE is the third transition and is handled the same way -
     see PendingFocus for where it goes and why the dialog's own restore cannot
     answer it.

     A REF, NOT STATE, for the pending restore. It is a one-shot imperative
     request that must survive a full unmount/remount - every mutation here ends
     in reload(), which flips `loading` and tears all three panels down behind
     the loading state - and it is read only from an effect. As state it would
     be a third render of the same screen and a setState inside an effect. */
  const sessionListRef = useRef<HTMLDivElement>(null);
  const albumRef = useRef<HTMLDivElement>(null);
  const editStartRef = useRef<HTMLInputElement>(null);
  const addSessionHeadingRef = useRef<HTMLHeadingElement>(null);
  // The two forms whose submit control survives its own request and is then
  // unmounted by reload(). Refs on the <form>, not on the button: AdminButton
  // takes no ref by contract, and the form is the narrowest node this file
  // already owns that contains exactly one submit.
  const contentFormRef = useRef<HTMLFormElement>(null);
  const addSessionFormRef = useRef<HTMLFormElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  // Saving the page content is what creates the row every session and photo
  // hangs off, so both are genuinely unavailable until it exists. That is
  // domain behaviour and it is preserved; what changed is that it is now stated
  // in the two panels it gates rather than once, in passing, inside the form
  // that lifts it.
  const hasContent = content !== null;
  const isDisabled = !token;
  const contentLocked = isDisabled || contentSaving;
  const sessionsLocked = isDisabled || sessionBusy !== null;
  const addSessionLocked = sessionsLocked || !hasContent;
  const albumLocked = isDisabled || photoUploading || !hasContent;

  // Drag-and-drop sensors for reordering the photo album. Declared
  // unconditionally before the loading/error early returns to respect the rules
  // of hooks. Pointer covers mouse and touch; keyboard is the reason this album
  // is reachable at all without a pointer, and it is the one affordance on this
  // screen with no alternative route to the same result.
  //
  // The 8px activation distance is kept even though the drag source is now a
  // dedicated grip rather than the whole tile: it is what separates a click on
  // the grip (which does nothing) from a drag, on a control small enough that a
  // pointer wobbles over it.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // dnd-kit's defaults announce the raw sortable id, which here is a database
  // primary key - a number that means nothing to the admin and matches nothing
  // on screen. These announce the 1-based position instead, which is both the
  // tile's visible title and the thing actually being changed.
  const announcements = useMemo<Announcements>(() => {
    const positionOf = (id: UniqueIdentifier) =>
      photos.findIndex((photo) => photo.id === id) + 1;
    return {
      onDragStart: ({ active }) =>
        `Picked up photo ${positionOf(active.id)} of ${photos.length}.`,
      onDragOver: ({ active, over }) =>
        over
          ? `Photo ${positionOf(active.id)} is over position ${positionOf(over.id)} of ${photos.length}.`
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? `Photo ${positionOf(active.id)} dropped at position ${positionOf(over.id)} of ${photos.length}.`
          : `Photo ${positionOf(active.id)} returned to its original position.`,
      onDragCancel: ({ active }) =>
        `Reordering cancelled. Photo ${positionOf(active.id)} returned to its original position.`,
    };
  }, [photos]);

  // Single source of truth for (re)loading the class page state. Reads through
  // adminFetch so an authenticated admin receives the uncapped photo list; the
  // public GET has no auth requirement, so an absent token simply yields the
  // capped/anonymous set. Keyed on adminFetch, which useAdminFetch memoises on
  // the token, so a token arriving after mount re-runs the load and replaces
  // that capped result.
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await adminFetch(CLASSES_ENDPOINT);
      if (!res.ok) {
        setLoadError("Failed to load cocktail classes.");
        return;
      }
      const data = (await res.json()) as ClassesResponse;
      setContent(data.class);
      setSessions(data.sessions ?? []);
      setPhotos(data.photos ?? []);
      setTitle(data.class?.title ?? "");
      setDescription(data.class?.description ?? "");
    } catch {
      setLoadError("Failed to load cocktail classes.");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    // Mount-time fetch: reload() sets loading state synchronously, which the
    // set-state-in-effect rule flags; this initial load is the intended sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  // ENTERING the inline edit. Keyed on the id rather than on a boolean, so
  // opening a second row while a first is open moves focus to the second row's
  // field instead of leaving it on a control that no longer exists. Keyed on
  // `loading` as well, because an open edit is torn down and rebuilt by any
  // reload the rest of the screen runs - saving the page content, deleting
  // another session - which orphans focus again without the id ever changing.
  useEffect(() => {
    if (editingSessionId === null) return;
    focusIfOrphaned(editStartRef.current);
  }, [editingSessionId, loading]);

  // RETURNING focus after a transition that took it away - leaving the inline
  // edit, or completing a confirmed delete.
  //
  // Three conditions gate it and each is a real case. `pending`, because a
  // transition that owes nothing queues nothing. `loading`, because every one
  // of these paths ends in reload() and on the render that closed the form the
  // list being returned to has not been rebuilt yet - this is the deferral the
  // dialog's own restore could not make, since only this screen knows when its
  // reload settled. `editingSessionId`, because an inline form that is open
  // owns focus: the effect above is putting it there, and a restore queued
  // before that form opened is stale.
  //
  // The request is consumed on the first settled render whether or not a target
  // is found, so a failed reload cannot leave it armed to fire at some
  // unrelated moment later. A delete that FAILED needs no special case: nothing
  // was removed, so the index still resolves to the record the admin pressed
  // Delete on, which is exactly where they should be.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null || loading || editingSessionId !== null) return;
    pendingFocusRef.current = null;

    switch (pending.kind) {
      case "sessionEdit": {
        const session = sessions.find((item) => item.id === pending.sessionId);
        if (!session) return;
        focusIfOrphaned(
          findByAccessibleName(
            sessionListRef.current,
            sessionEditLabel(session),
          ),
        );
        return;
      }
      case "sessionRow": {
        // Nothing left to return to: the heading of the form that is now the
        // only thing the admin can do here. Focusable only programmatically,
        // and NOT a control - Tab from it reaches the first field, which is
        // what a keyboard user wants next. Landing them IN that field instead
        // would be the "focus dropped into a text input they did not open"
        // shape that made the album's caption leak dangerous.
        if (sessions.length === 0) {
          focusIfOrphaned(addSessionHeadingRef.current);
          return;
        }
        const successor = sessions[Math.min(pending.index, sessions.length - 1)];
        focusIfOrphaned(
          findByAccessibleName(
            sessionListRef.current,
            sessionEditLabel(successor),
          ),
        );
        return;
      }
      case "photoTile": {
        // The upload control, which is the only thing an empty album offers.
        // The caption field beside it is deliberately NOT the target: it is the
        // field the dismissed hook walk used to land in, where a keyboard
        // user's next keystrokes became the next upload's caption.
        if (photos.length === 0) {
          focusIfOrphaned(fileInputRef.current);
          return;
        }
        // THE GRIP, not Save and emphatically not Delete. It is the tile's
        // first control, so the tab order continues through the tile rather
        // than skipping its start; it is not destructive, so a reflexive Enter
        // after a delete cannot delete again; and its accessible name -
        // "Reorder Photo 3 of 11" - is the renumbering the delete just caused,
        // which is the one fact the admin has lost.
        const position = Math.min(pending.index, photos.length - 1) + 1;
        focusIfOrphaned(
          findByAccessibleName(
            albumRef.current,
            photoGripLabel(position, photos.length),
          ),
        );
        return;
      }
      case "formSubmit": {
        // By type rather than by accessible name: findByAccessibleName matches
        // aria-label, and neither submit has one - their name is their visible
        // text, which is exactly what a busy control changes ("Saving…").
        // Scoped to the form, so there is only ever one match.
        const form =
          pending.form === "content"
            ? contentFormRef.current
            : addSessionFormRef.current;
        focusIfOrphaned(
          form?.querySelector<HTMLButtonElement>('button[type="submit"]') ??
            null,
        );
        return;
      }
    }
  }, [editingSessionId, loading, photos, sessions]);

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    /**
     * RE-ENTRANCY GUARDS ON ALL FOUR MUTATIONS BELOW, and they are owed now
     * that a busy control is inert by AdminButton's own handling rather than by
     * the browser's.
     *
     * Every one of these was previously unreachable a second time because its
     * control carried `busy`, which meant `disabled`, which the browser refuses
     * to activate. A busy AdminButton is now `aria-disabled` - focusable, so it
     * keeps the focus the admin's own press would otherwise have dropped to
     * <body>, and inert only because AdminButton cancels the activation (see
     * its swallowActivation). That guard is measured, but it lives in a
     * presentational component, and what it stands between here is a duplicate
     * PUT, a duplicate session, and a DELETE against a row already being
     * deleted. The invariant belongs next to the request too.
     *
     * State rather than a ref in all four: React flushes a discrete event's
     * updates before dispatching the next event, so a second press cannot read
     * a stale false.
     */
    if (contentSaving) return;
    setContentSaving(true);
    setContentError("");
    setContentSuccess("");
    try {
      const res = await adminFetch(CLASSES_ENDPOINT, {
        method: "PUT",
        json: { title, description },
      });
      if (!res.ok) {
        setContentError(
          await readAdminError(res, "Failed to save page content."),
        );
        return;
      }
      setContentSuccess("Page content saved.");
      // Queued BEFORE reload(), which is the teardown that will unmount the
      // control currently holding focus. See PendingFocus.formSubmit.
      pendingFocusRef.current = { kind: "formSubmit", form: "content" };
      await reload();
    } catch {
      setContentError("Failed to save page content.");
    } finally {
      setContentSaving(false);
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    // See handleSaveContent. Guarded on the whole flag rather than on
    // `sessionBusy === "add"`: a row edit or a row delete in flight is equally
    // a reason not to POST a new session, and `addSessionLocked` already says
    // so on the control.
    if (sessionBusy) return;
    // Defence in depth only: the start field carries `required` inside a real
    // <form>, so the browser blocks the submit first.
    if (!newStart) {
      setAddSessionError("Start time is required.");
      return;
    }
    setSessionBusy("add");
    setAddSessionError("");
    try {
      const res = await adminFetch(SESSIONS_ENDPOINT, {
        method: "POST",
        json: {
          startTime: localInputToIso(newStart),
          endTime: newEnd ? localInputToIso(newEnd) : undefined,
          location: newLocation || undefined,
        },
      });
      if (!res.ok) {
        setAddSessionError(
          await readAdminError(
            res,
            "Failed to add session. Save the page content first.",
          ),
        );
        return;
      }
      setNewStart("");
      setNewEnd("");
      setNewLocation("");
      // Queued BEFORE reload(), which unmounts the control holding focus.
      // See PendingFocus.formSubmit.
      pendingFocusRef.current = { kind: "formSubmit", form: "addSession" };
      await reload();
    } catch {
      setAddSessionError("Failed to add session.");
    } finally {
      setSessionBusy(null);
    }
  };

  const beginEditSession = (session: ClassSession) => {
    setEditingSessionId(session.id);
    setEditStart(isoToLocalInput(session.startTime));
    setEditEnd(isoToLocalInput(session.endTime));
    setEditLocation(session.location ?? "");
    setSessionError("");
    setEditStartError("");
  };

  const cancelEditSession = () => {
    // Named BEFORE the id that identifies the row is cleared - the row is about
    // to unmount and take the focused control with it.
    if (editingSessionId !== null) {
      pendingFocusRef.current = {
        kind: "sessionEdit",
        sessionId: editingSessionId,
      };
    }
    setEditingSessionId(null);
    setEditStartError("");
  };

  const handleUpdateSession = async (id: number) => {
    if (!editStart) {
      setEditStartError("Start time is required.");
      return;
    }
    setSessionBusy("row");
    setSessionError("");
    setEditStartError("");
    try {
      const res = await adminFetch(`${SESSIONS_ENDPOINT}/${id}`, {
        method: "PUT",
        json: {
          startTime: localInputToIso(editStart),
          endTime: editEnd ? localInputToIso(editEnd) : undefined,
          location: editLocation || undefined,
        },
      });
      if (!res.ok) {
        setSessionError(await readAdminError(res, "Failed to update session."));
        return;
      }
      // Only on success. A rejected write leaves the form open with the values
      // still in it, so the control that has focus is still on screen and there
      // is nothing to restore.
      pendingFocusRef.current = { kind: "sessionEdit", sessionId: id };
      setEditingSessionId(null);
      await reload();
    } catch {
      setSessionError("Failed to update session.");
    } finally {
      setSessionBusy(null);
    }
  };

  const handleDeleteSession = async (id: number) => {
    // See handleSaveContent. The confirming control carries
    // `busy={sessionBusy === "row"}` and the dialog stays on screen across the
    // request, which is what makes a second confirm reachable at all.
    if (sessionBusy) return;
    setSessionBusy("row");
    setSessionError("");
    try {
      const res = await adminFetch(`${SESSIONS_ENDPOINT}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setSessionError(await readAdminError(res, "Failed to delete session."));
        return;
      }
      await reload();
    } catch {
      setSessionError("Failed to delete session.");
    } finally {
      setSessionBusy(null);
    }
  };

  // The delete itself is unchanged above; this is only the confirmation gate in
  // front of it. The request fires on confirm and on nothing else - never when
  // the dialog merely opens - which is what keeps the guarantee window.confirm
  // gave for free by blocking the thread.
  const confirmDeleteSession = async () => {
    const target = pendingSessionDelete;
    if (!target) return;
    // Read here rather than snapshotted when the dialog opened: the dialog is
    // modal and traps focus, so no control that could reorder or reload the
    // list is reachable between those two moments. Falls back to the head of
    // the list if the row has somehow already gone.
    const index = Math.max(
      sessions.findIndex((item) => item.id === target.id),
      0,
    );
    pendingFocusRef.current = { kind: "sessionRow", index };
    try {
      await handleDeleteSession(target.id);
    } finally {
      // Closed either way: a failure message renders in the session list's own
      // error slot, and a dialog left open would be covering it.
      setPendingSessionDelete(null);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError("");
    try {
      // 1. Request a signed upload URL.
      const key = buildAlbumKey(file.name);
      const signedRes = await adminFetch(SIGNED_URL_ENDPOINT, {
        method: "POST",
        json: { key, contentType: file.type },
      });
      if (!signedRes.ok) {
        setPhotoError(await readAdminError(signedRes, "Upload failed."));
        return;
      }
      const signed = (await signedRes.json()) as { url?: string };
      if (!signed.url) {
        setPhotoError("Upload failed.");
        return;
      }
      // 2. PUT the file directly to S3, with a PLAIN fetch and deliberately not
      // through adminFetch: the presigned URL is already authenticated by its
      // SigV4 query signature, and an Authorization header alongside it makes
      // S3 reject the upload outright.
      const uploadRes = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setPhotoError("Upload failed (S3 error).");
        return;
      }
      // 3. Persist the S3 key via the feature API. New uploads append to the end
      // of the album; users reorder afterward via drag-and-drop.
      const createRes = await adminFetch(PHOTOS_ENDPOINT, {
        method: "POST",
        json: {
          s3Key: key,
          caption: photoCaption || undefined,
          sortOrder: photos.length,
        },
      });
      if (!createRes.ok) {
        setPhotoError(
          await readAdminError(
            createRes,
            "Failed to save photo. Save the page content first.",
          ),
        );
        return;
      }
      setPhotoCaption("");
      // The same unmount, and therefore the same owed focus: reload() tears the
      // control band down with everything else, and the file input that has
      // focus goes with it. The new photo is APPENDED (sortOrder: photos.length
      // above), so the index that names the successor after a delete names the
      // new tile here - and landing on its grip announces "Reorder Photo 4 of
      // 4", which is both a confirmation that the upload landed and a statement
      // of where it landed. Set only on success, like the session save: a
      // failed upload never reloads, so nothing is unmounted and the input the
      // admin is standing on still has focus.
      pendingFocusRef.current = { kind: "photoTile", index: photos.length };
      await reload();
    } catch {
      setPhotoError("Upload failed.");
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Caption-only edit. The tile no longer exposes sortOrder, so we preserve the
  // photo's current sortOrder to keep the PUT contract intact (backward
  // compatible). Reordering is handled separately via drag-and-drop.
  const handleUpdatePhotoCaption = async (
    photo: ClassPhoto,
    caption: string,
  ) => {
    setPhotoError("");
    try {
      const res = await adminFetch(`${PHOTOS_ENDPOINT}/${photo.id}`, {
        method: "PUT",
        json: {
          s3Key: photo.s3Key,
          caption: caption || undefined,
          sortOrder: photo.sortOrder,
        },
      });
      if (!res.ok) {
        setPhotoError(await readAdminError(res, "Failed to update photo."));
        return;
      }
      await reload();
    } catch {
      setPhotoError("Failed to update photo.");
    }
  };

  // Optimistically reorder the album on drop, then persist the new order. On
  // ANY failure - including an expired session - revert to the pre-drag order,
  // so the album never shows an order the server did not accept.
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = photos;
    const newPhotos = arrayMove(photos, oldIndex, newIndex);
    setPhotos(newPhotos);
    setPhotoError("");

    try {
      const res = await adminFetch(PHOTOS_REORDER_ENDPOINT, {
        method: "POST",
        json: { ids: newPhotos.map((p) => p.id) },
      });
      if (!res.ok) {
        setPhotos(previous);
        setPhotoError(await readAdminError(res, "Failed to reorder photos."));
        return;
      }
    } catch {
      setPhotos(previous);
      setPhotoError("Failed to reorder photos.");
    }
  };

  const handleDeletePhoto = async (id: number) => {
    // See handleSaveContent. `photoDeleting` exists precisely because this
    // dialog outlives its own request - the comment on the useState says so -
    // and it is now the flag that makes the confirm inert rather than disabled.
    if (photoDeleting) return;
    setPhotoError("");
    setPhotoDeleting(true);
    try {
      const res = await adminFetch(`${PHOTOS_ENDPOINT}/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setPhotoError(await readAdminError(res, "Failed to delete photo."));
        return;
      }
      await reload();
    } catch {
      setPhotoError("Failed to delete photo.");
    } finally {
      setPhotoDeleting(false);
    }
  };

  // Resolved to a snapshot HERE, while `photos` still holds the array the admin
  // was looking at when they pressed Delete - see PendingPhotoDelete on why the
  // ordinal cannot be looked up later.
  const requestDeletePhoto = (id: number) => {
    const index = photos.findIndex((photo) => photo.id === id);
    if (index === -1) return;
    setPendingPhotoDelete({
      id,
      position: index + 1,
      caption: photos[index].caption,
    });
  };

  const confirmDeletePhoto = async () => {
    const target = pendingPhotoDelete;
    if (!target) return;
    // The ordinal was already resolved to a snapshot when Delete was pressed,
    // for the reason PendingPhotoDelete records; it is the successor index too.
    pendingFocusRef.current = {
      kind: "photoTile",
      index: target.position - 1,
    };
    try {
      await handleDeletePhoto(target.id);
    } finally {
      setPendingPhotoDelete(null);
    }
  };

  const sessionActions = (session: ClassSession): AdminCardAction[] => {
    const label = formatSessionTime(session);
    return [
      {
        label: "Edit",
        // Through the helper, because the focus restore finds this control by
        // exactly this string once the row has been rebuilt.
        ariaLabel: sessionEditLabel(session),
        tone: "primary",
        onClick: () => beginEditSession(session),
        disabled: sessionsLocked,
      },
      {
        label: "Delete",
        ariaLabel: `Delete session: ${label}`,
        tone: "danger",
        // Opens the confirmation. Nothing is requested until it is confirmed.
        onClick: () => setPendingSessionDelete(session),
        disabled: sessionsLocked,
      },
    ];
  };

  // Both confirmations render unconditionally - Modal returns null when closed
  // - so their `message` expressions are evaluated on every render of this
  // screen, including the ones where nothing is pending. Resolving the parts
  // here keeps that null case in one place instead of spreading optional
  // chaining through the copy, where a missed `?.` is a crash on an idle page.
  const pendingSessionLabel = pendingSessionDelete
    ? formatSessionTime(pendingSessionDelete)
    : "";
  // The raw location, NOT formatSessionLocation: that helper answers "Not set"
  // so the card's metadata column has no gaps in it, which is right in a column
  // and unreadable in a sentence ("the session at Not set").
  const pendingSessionLocation = pendingSessionDelete?.location?.trim() ?? "";
  const pendingPhotoLabel = pendingPhotoDelete
    ? `Photo ${pendingPhotoDelete.position}`
    : "";
  const pendingPhotoCaption = pendingPhotoDelete?.caption?.trim() ?? "";

  const editActions = (session: ClassSession): AdminCardAction[] => {
    const label = formatSessionTime(session);
    return [
      {
        label: "Save",
        ariaLabel: `Save session: ${label}`,
        tone: "primary",
        onClick: () => void handleUpdateSession(session.id),
        disabled: sessionBusy !== null,
      },
      {
        label: "Cancel",
        ariaLabel: `Cancel editing session: ${label}`,
        tone: "secondary",
        onClick: cancelEditSession,
        disabled: sessionBusy !== null,
      },
    ];
  };

  return (
    <AdminPageLayout
      eyebrow={ADMIN_EYEBROW}
      heading="Classes"
      intro="Everything the public classes page shows: its opening statement, its schedule, and its photo album."
    >
      {loading ? (
        // No skeleton. This is one JSON read from a cached route, inside the
        // band where no special feedback is required at all, and eight grey
        // rectangles over it would be theatre on a page whose thesis is that
        // there are no rectangles.
        <AdminEmptyState message="Loading cocktail classes…" />
      ) : loadError ? (
        <div className={styles.loadFailure}>
          <AdminEmptyState message={loadError} />
          <AdminButton tone="primary" onClick={() => void reload()}>
            Retry
          </AdminButton>
        </div>
      ) : (
        <>
          <AdminPanel
            heading="Page Content"
            description="The title and opening statement at the top of the public classes page. Saving it for the first time is what unlocks the schedule and the album below."
          >
            <form
              ref={contentFormRef}
              className={`${styles.stack} ${styles.contentForm}`}
              onSubmit={handleSaveContent}
            >
              <AdminField label="Title" required>
                {(control) => (
                  <AdminInput
                    {...control}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={contentLocked}
                  />
                )}
              </AdminField>
              <AdminField label="General statement" required>
                {(control) => (
                  <AdminTextarea
                    {...control}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    disabled={contentLocked}
                  />
                )}
              </AdminField>
              {contentError ? (
                <AdminStatus tone="error">{contentError}</AdminStatus>
              ) : null}
              {contentSuccess ? (
                <AdminStatus tone="success">{contentSuccess}</AdminStatus>
              ) : null}
              <div className={styles.formActions}>
                <AdminButton
                  type="submit"
                  tone="primary"
                  busy={contentSaving}
                  disabled={isDisabled}
                >
                  {contentSaving ? "Saving…" : "Save content"}
                </AdminButton>
              </div>
            </form>
          </AdminPanel>

          <AdminPanel
            heading="Class Dates & Times"
            description="Every session listed on the public classes page, in the order it is scheduled."
          >
            {/* The ref scopes the focus restore's lookup to this panel. It sits
                here rather than on the list because AdminCardGrid renders the
                <ul> itself and takes no ref; this element is the nearest one
                this screen owns, and the only buttons inside it named "Edit
                session: ..." are the rows' own. */}
            <div className={styles.stack} ref={sessionListRef}>
              {!hasContent ? (
                <AdminStatus tone="info">
                  Save the page content first. Sessions can be scheduled once
                  this page has a title and a general statement.
                </AdminStatus>
              ) : null}

              {sessions.length === 0 ? (
                <AdminEmptyState message="No sessions scheduled yet." />
              ) : (
                <AdminCardGrid density="rows">
                  {sessions.map((session) =>
                    editingSessionId === session.id ? (
                      <AdminCard
                        key={session.id}
                        title={formatSessionTime(session)}
                        actions={editActions(session)}
                      >
                        <SessionFields
                          start={editStart}
                          onStartChange={setEditStart}
                          startError={editStartError}
                          startRef={editStartRef}
                          end={editEnd}
                          onEndChange={setEditEnd}
                          location={editLocation}
                          onLocationChange={setEditLocation}
                          disabled={sessionBusy !== null}
                        />
                      </AdminCard>
                    ) : (
                      <AdminCard
                        key={session.id}
                        title={formatSessionTime(session)}
                        meta={[
                          {
                            label: "Location",
                            value: formatSessionLocation(session),
                          },
                        ]}
                        actions={sessionActions(session)}
                      />
                    ),
                  )}
                </AdminCardGrid>
              )}

              {sessionError ? (
                <AdminStatus tone="error">{sessionError}</AdminStatus>
              ) : null}

              <form
                ref={addSessionFormRef}
                className={styles.sessionForm}
                onSubmit={handleAddSession}
              >
                {/* tabIndex -1 makes this heading a programmatic focus target
                    without putting it in the tab order: it is where focus goes
                    when a confirmed delete empties the list and there is no
                    successor row to return to. An existing heading rather than
                    an element invented to receive focus, and a heading rather
                    than the field below it, so a screen reader announces the
                    region the admin has landed in instead of silently placing
                    them inside a text control. */}
                <h3
                  className={styles.subheading}
                  ref={addSessionHeadingRef}
                  tabIndex={-1}
                >
                  Add a session
                </h3>
                <SessionFields
                  start={newStart}
                  onStartChange={setNewStart}
                  end={newEnd}
                  onEndChange={setNewEnd}
                  location={newLocation}
                  onLocationChange={setNewLocation}
                  disabled={addSessionLocked}
                  nativeRequired
                />
                {addSessionError ? (
                  <AdminStatus tone="error">{addSessionError}</AdminStatus>
                ) : null}
                <div className={styles.formActions}>
                  <AdminButton
                    type="submit"
                    tone="primary"
                    busy={sessionBusy === "add"}
                    disabled={addSessionLocked}
                  >
                    {sessionBusy === "add" ? "Adding…" : "Add session"}
                  </AdminButton>
                </div>
              </form>
            </div>
          </AdminPanel>

          <AdminPanel
            heading="Photo Album"
            description={`The public album shows the first ${MAX_ALBUM_PHOTOS} photos in album order. Drag a photo by its grip — or focus the grip and use the arrow keys — to change that order.`}
          >
            {/* Scopes the post-delete focus lookup to this panel, the same way
                the sessions panel's ref does - the grips are inside the grid,
                which AdminCardGrid renders and which takes no ref. */}
            <div className={styles.stack} ref={albumRef}>
              {!hasContent ? (
                <AdminStatus tone="info">
                  Save the page content first. Photos can be uploaded once this
                  page has a title and a general statement.
                </AdminStatus>
              ) : null}

              {/* The control band, and it NEVER unmounts - not over an empty
                  album and not over a failed upload. It is the only way to put
                  the first photograph in, and an empty state whose controls
                  disappeared with it is a state with no exit. */}
              <div className={styles.albumControls}>
                <div className={styles.captionField}>
                  <AdminField
                    label="Caption"
                    hint="Optional. Saved with the next photo you upload."
                  >
                    {(control) => (
                      <AdminInput
                        {...control}
                        value={photoCaption}
                        onChange={(e) => setPhotoCaption(e.target.value)}
                        disabled={albumLocked}
                      />
                    )}
                  </AdminField>
                </div>
                {/* The input is rendered BEFORE its label so the label can take
                    the focus ring through `+`. It is clipped rather than
                    display:none, which is what keeps uploading reachable from
                    the keyboard at all. */}
                <input
                  id="photo-upload"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.uploadInput}
                  onChange={handlePhotoUpload}
                  disabled={albumLocked}
                />
                <label className={styles.uploadArea} htmlFor="photo-upload">
                  {photoUploading
                    ? "Uploading…"
                    : hasContent
                      ? "Choose a photo to upload"
                      : "Save the page content first"}
                </label>
              </div>

              {photos.length > 0 ? (
                <p className={styles.albumCount}>
                  {photos.length > MAX_ALBUM_PHOTOS ? (
                    <>
                      {photos.length} photos.{" "}
                      <span className={styles.albumCountNote}>
                        The last {photos.length - MAX_ALBUM_PHOTOS} will not
                        appear on the public page.
                      </span>
                    </>
                  ) : (
                    `${photos.length} of ${MAX_ALBUM_PHOTOS} photos.`
                  )}
                </p>
              ) : null}

              {photoError ? (
                <AdminStatus tone="error">{photoError}</AdminStatus>
              ) : null}

              {photos.length === 0 ? (
                <AdminEmptyState message="No photos uploaded yet." />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  accessibility={{ announcements }}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={photos.map((p) => p.id)}
                    strategy={rectSortingStrategy}
                  >
                    <AdminCardGrid density="tiles">
                      {photos.map((photo, index) => (
                        <SortablePhotoCard
                          key={photo.id}
                          photo={photo}
                          position={index + 1}
                          total={photos.length}
                          disabled={isDisabled}
                          beyondPublicLimit={index >= MAX_ALBUM_PHOTOS}
                          onSaveCaption={handleUpdatePhotoCaption}
                          // The tile's `onDelete` contract is unchanged - it
                          // still reports an id and knows nothing about
                          // dialogs. What that id now reaches is the
                          // confirmation rather than the request.
                          onDelete={requestDeletePhoto}
                        />
                      ))}
                    </AdminCardGrid>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </AdminPanel>
        </>
      )}

      {/* OUTSIDE the loading/error branch, and that placement is load-bearing.
          Every mutation on this screen ends in `reload()`, which sets `loading`
          true - so a dialog mounted inside the success branch would unmount
          itself the moment its own confirmed request succeeded, tearing down
          its focus trap mid-flight and taking the "Deleting…" state with it.
          Out here the only thing that governs a dialog's lifetime is whether
          something is pending. */}
      <AdminConfirmDialog
        isOpen={pendingSessionDelete !== null}
        heading="Delete session"
        message={
          <>
            The session on <strong>{pendingSessionLabel}</strong>
            {pendingSessionLocation ? ` at ${pendingSessionLocation}` : ""} will
            be removed from the schedule on the public classes page. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete session"
        confirmBusyLabel="Deleting…"
        cancelLabel="Keep session"
        busy={sessionBusy === "row"}
        onConfirm={() => void confirmDeleteSession()}
        onCancel={() => setPendingSessionDelete(null)}
      />

      <AdminConfirmDialog
        isOpen={pendingPhotoDelete !== null}
        heading="Delete photo"
        message={
          <>
            {/* The ordinal is the photograph's whole identity; the caption is
                added when it has one because "Photo 3" alone is a weak thing
                to be sure about, and the album's tiles are small. */}
            <strong>{pendingPhotoLabel}</strong>
            {pendingPhotoCaption ? ` (“${pendingPhotoCaption}”)` : ""} will be
            removed from the album, and its image file will be permanently
            deleted from storage. This cannot be undone.
          </>
        }
        confirmLabel="Delete photo"
        confirmBusyLabel="Deleting…"
        cancelLabel="Keep photo"
        busy={photoDeleting}
        onConfirm={() => void confirmDeletePhoto()}
        onCancel={() => setPendingPhotoDelete(null)}
      />
    </AdminPageLayout>
  );
}
