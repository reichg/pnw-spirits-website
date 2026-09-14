"use client";

import { useEffect, useRef, useState } from "react";
import AdminButton from "@/components/admin/AdminButton";
import AdminCard from "@/components/admin/AdminCard";
import AdminCardGrid from "@/components/admin/AdminCardGrid";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminPageLayout from "@/components/admin/AdminPageLayout";
import AdminSearchField from "@/components/admin/AdminSearchField";
import AdminStatus from "@/components/admin/AdminStatus";
import { ADMIN_EYEBROW } from "@/components/admin/admin.types";
import {
  findByAccessibleName,
  focusIfOrphaned,
} from "@/components/admin/adminFocus";
import {
  formatRecordCount,
  formatRecordDate,
} from "@/components/admin/adminRecords";
import Pagination from "@/components/ui/Pagination";
import { useAdminDraft } from "@/hooks/useAdminDraft";
import { readAdminError, useAdminFetch } from "@/hooks/useAdminFetch";
import { rowsAtKey, useAdminList } from "@/hooks/useAdminList";
import AdminBlogEditor, {
  BLOG_DRAFT_KEY,
  type AdminBlogInput,
  type BlogDraft,
} from "./AdminBlogEditor";
import styles from "./AdminBlogList.module.css";

/** The collection this screen reads and writes. One constant, because the list
 *  and the delete below must never address different routes. */
const ENDPOINT = "/api/blogs";

/** Matches `/api/blogs`'s own default. Sent explicitly so the two cannot drift
 *  apart silently: the count line and the pager are both derived from it. */
const PAGE_SIZE = 10;

/** A row in the list: the editor's input shape plus the two fields only a list
 *  needs. Extended rather than re-declared - the previous copy omitted
 *  `coverPhoto` although the API has always returned it, which is why the old
 *  cards had no image to show. */
type BlogRecord = AdminBlogInput & { id: number; createdAt: string };

/** Module scope, so the selector identity is stable for the life of the app. */
const selectBlogs = rowsAtKey<BlogRecord>("blogs");

/**
 * The row's Edit control, named ONCE.
 *
 * Written by the card's actions and read back by the focus restore below, which
 * has to find that control again after the row has been unmounted and rebuilt.
 * Two spellings of it would be a restore that silently stops working the first
 * time the label is reworded - and silently is the operative word, because
 * nothing on screen looks broken when focus is merely dropped.
 */
function editLabel(blog: BlogRecord): string {
  return `Edit post: ${blog.title}`;
}

/** The toolbar's primary action, spelled once for the same reason: it is both
 *  the button's accessible name and what the restore looks it up by. */
const NEW_POST_LABEL = "New post";

/**
 * Where focus should go after a delete, decided when the delete was confirmed
 * and consumed once the list has settled.
 */
type DeleteFocusIntent = {
  /** The deleted record's row index on the page it was deleted from. */
  index: number;
};

const LOAD_FAILED =
  "These posts could not be loaded. Refresh the page to try again.";
const DELETE_FAILED = "That post could not be deleted. Please try again.";

export default function AdminBlogList(): React.ReactNode {
  const adminFetch = useAdminFetch();
  // Read-only here: the editor owns writing and clearing. `hasDraft` reports
  // false for a corrupt stored value, unlike the `!!getItem(key)` this
  // replaces, which offered "Continue draft" for a draft that opened blank.
  const { hasDraft } = useAdminDraft<BlogDraft>(BLOG_DRAFT_KEY);

  // Every piece of the paged read - the query, the debounced term's page reset,
  // the last-page clamp after a delete, and the loading/error states - lives in
  // the hook. It reads through its own `useAdminFetch`, so a token arriving
  // after mount replaces an anonymous first load with the authenticated one.
  const {
    items: blogs,
    total,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    loading,
    loadError,
    reload,
  } = useAdminList<BlogRecord>({
    endpoint: ENDPOINT,
    pageSize: PAGE_SIZE,
    select: selectBlogs,
    loadFailedMessage: LOAD_FAILED,
  });

  /** A failed WRITE. Work was at risk, so it is assertive and anchored above
   *  the list it failed to change - unlike the hook's `loadError`, which is
   *  prose in the empty slot. */
  const [actionError, setActionError] = useState("");

  const [editing, setEditing] = useState<BlogRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [forceEmpty, setForceEmpty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BlogRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleEdit = (blog: BlogRecord) => {
    setEditing(blog);
    setForceEmpty(false);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditing(null);
    setForceEmpty(true);
    setEditorOpen(true);
  };

  const handleContinueDraft = () => {
    setEditing(null);
    setForceEmpty(false);
    setEditorOpen(true);
  };

  const handleEditorClose = (refresh?: boolean) => {
    setEditorOpen(false);
    setEditing(null);
    setForceEmpty(false);
    // No manual localStorage re-read on close: useAdminDraft notifies its own
    // subscribers on every save and clear, in this tab as well as others.
    if (refresh) reload();
  };

  /** Armed once a delete has succeeded and its refetch is on its way; consumed
   *  by the effect below. A ref, not state: nothing renders from it, and the
   *  `finally` has to read it on the same turn it is written. */
  const closeOnReload = useRef(false);

  /** The same, one step later: consumed after the dialog has gone. Separate
   *  one-shots rather than one, so opening a second dialog while a restore is
   *  still pending cannot be mistaken for the first one closing. */
  const focusAfterDelete = useRef<DeleteFocusIntent | null>(null);

  /** Scopes the row lookup to the rows, so a title that happens to match a
   *  control elsewhere on the page cannot be focused instead. */
  const listRef = useRef<HTMLDivElement>(null);

  /** Dismiss the dialog and release the busy lock together - they are one
   *  state, "nothing is being deleted", wearing two flags. */
  const closeConfirm = () => {
    setDeleting(false);
    setPendingDelete(null);
  };

  /**
   * THE DIALOG OUTLIVES ITS OWN REFETCH, and this is where it finally closes.
   *
   * Closing it at the end of `confirmDelete` - which is what this file used to
   * do - closes it while the deleted row is STILL MOUNTED, because `reload()`
   * only bumps a token and the new rows land a commit or two later.
   * `useModalDismiss` restores focus in its unmount cleanup, finds the trigger
   * still connected, and hands focus back to a button React detaches ~14ms
   * afterwards; focus then falls to <body>, and a keyboard admin pays eight Tab
   * stops to get back to the list - per deletion. Waiting for the rows means
   * the trigger is already gone when focus is restored, so the hook's ancestor
   * walk runs and lands on the record that took the deleted one's place.
   * /admin/classes has always behaved this way because its `reload` is
   * awaitable; `useAdminList`'s is not, so the wait is expressed here instead.
   *
   * `items` identity is the signal because it is replaced on EVERY settled
   * read, success or failure (a failed read assigns a fresh `[]`), so there is
   * no outcome of the refetch that leaves the dialog up.
   */
  useEffect(() => {
    if (!closeOnReload.current) return;
    closeOnReload.current = false;
    closeConfirm();
    // Deliberately keyed on the rows alone: this must fire when the list
    // re-renders, not when the callbacks above are re-created.
  }, [blogs]);

  /**
   * WHERE THE DELETE LEAVES FOCUS. Three cases, one rule.
   *
   * Fixing the ordering above is what lets `useModalDismiss` work at all - its
   * ancestor walk now runs against a list that has already dropped the row, and
   * for the ordinary delete it lands on the record that took the deleted one's
   * place. But the walk DECLINES rather than guesses when the branch it was
   * walking is gone, and it is gone in exactly the two cases that hurt most: a
   * page clamp rebuilds the grid, and an emptied list unmounts it outright.
   * Both drop a keyboard admin on <body>. So the screen, which is the only
   * thing that knows what it just did, names the target itself:
   *
   *   successor exists -> the record now at the deleted row's index.
   *   last on the page -> the same rule, clamped to the end: the record that
   *                       slid up into the deleted one's slot from the next
   *                       page, or the new last row if nothing did.
   *   page clamped     -> ALSO the same rule, and that is a decision rather
   *                       than an omission. A clamp can only happen when the
   *                       last page held exactly one record, so the deleted
   *                       index is always 0 and the rule resolves to the first
   *                       row of the page the clamp landed on - which is the
   *                       top of the pageful the admin is now looking at. The
   *                       new last record would be the nearer neighbour of the
   *                       one deleted, but it is also the bottom of a page the
   *                       admin has not seen yet. It is worth noting that this
   *                       is the same element `useModalDismiss` arrives at from
   *                       the other direction, so the two never disagree.
   *   list now empty   -> the control that undoes the emptiness. A search that
   *                       matched nothing and a collection with nothing in it
   *                       are different situations with different next actions,
   *                       so they get different targets: Clear, which
   *                       AdminSearchField renders only while there is a term
   *                       to clear, and which its own comment says exists to
   *                       rescue this exact state; otherwise New post, which is
   *                       what the empty copy tells the admin to press.
   *
   * Both empty-case targets are BUTTONS. Not the search input, and not a
   * heading made focusable to stand in for one: focus must never be parked in a
   * text field the admin did not choose, which is how keystrokes after a delete
   * silently became the next upload's caption on the classes album.
   */
  useEffect(() => {
    const intent = focusAfterDelete.current;
    if (!intent) return;
    // The dialog still holds focus until it unmounts, and the hook restores
    // from its cleanup. Moving now would be overwritten a commit later.
    if (pendingDelete !== null) return;
    // A clamp arrives as TWO reads - the page that turned out to be empty, then
    // the page it clamped to. Waiting for rows, or for an honestly empty
    // collection, is what stops the restore firing into the gap between them.
    if (blogs.length === 0 && total > 0) return;

    focusAfterDelete.current = null;

    if (blogs.length === 0) {
      focusIfOrphaned(
        search
          ? // The only button inside the search form is its Clear. Structural
            // rather than name-matched because the control belongs to a
            // component this screen composes but does not own.
            document.querySelector<HTMLButtonElement>(
              'form[role="search"] button',
            )
          : findByAccessibleName(document, NEW_POST_LABEL),
      );
      return;
    }

    const landed = blogs[Math.min(intent.index, blogs.length - 1)];
    focusIfOrphaned(findByAccessibleName(listRef.current, editLabel(landed)));
  }, [blogs, pendingDelete, search, total]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    /**
     * RE-ENTRANCY GUARD, and the rule that decides where one is owed - stated
     * here so the next site can be checked by eye rather than by memory:
     *
     *   a guard is owed exactly where the control's inertness is
     *   `aria-disabled`, and not where it is native `disabled`.
     *
     * This dialog's confirm is an AdminButton carrying `busy`, which is the
     * former: focusable, clickable, and inert only because AdminButton cancels
     * the activation (see its swallowActivation). The browser is no longer
     * refusing anything. The row's own Edit and Delete are AdminCardActions,
     * which render a native `disabled`, and are correctly unguarded for the
     * same rule read the other way.
     *
     * It matters more here than at a Save, because this dialog deliberately
     * OUTLIVES its own request - it closes on the refetch, not on the response
     * (see the effect above) - so the confirming control is on screen, focused
     * and activatable for the whole round trip.
     *
     * Defence in depth rather than a live bug: React flushes a discrete event's
     * updates before dispatching the next, and AdminConfirmDialog's own
     * docblock records four activations while busy producing one request. What
     * it stands between is a second DELETE of a post and the S3 media that goes
     * with it. State rather than a ref, for the flush reason above.
     */
    if (deleting) return;
    setDeleting(true);
    setActionError("");
    try {
      const res = await adminFetch(`${ENDPOINT}/${target.id}`, {
        method: "DELETE",
      });
      // The previous version checked `res.ok` and did nothing when it was
      // false, so a failed delete looked exactly like a successful one that had
      // not refreshed yet.
      if (!res.ok) {
        setActionError(await readAdminError(res, DELETE_FAILED));
        return;
      }
      reload();
      // Armed AFTER the call, so a `reload()` that somehow threw leaves the
      // `finally` free to close rather than waiting on a refetch never started.
      closeOnReload.current = true;
      // Resolved against the list as it stood when Delete was confirmed - the
      // dialog was blocking the page throughout, so this is the row order the
      // admin was actually looking at. `max(0, ...)` because a findIndex miss
      // must degrade to the top of the list, not to `blogs[-1]`.
      focusAfterDelete.current = {
        index: Math.max(
          0,
          blogs.findIndex((blog) => blog.id === target.id),
        ),
      };
    } catch {
      setActionError(DELETE_FAILED);
    } finally {
      // The `finally` still guarantees the dialog cannot be stranded by a
      // failure - it just no longer fires on the one path where a re-render IS
      // coming. A failure closes here, over the message it just wrote to the
      // list; a success closes above, once the row is actually gone.
      if (!closeOnReload.current) closeConfirm();
    }
  };

  const emptyMessage = loadError
    ? loadError
    : search
      ? `No posts match “${search}”. Clear the search to see all of them.`
      : "No posts yet. New Post writes the first one.";

  return (
    <AdminPageLayout
      eyebrow={ADMIN_EYEBROW}
      heading="Blog posts"
      toolbar={
        <>
          {/* The name is set explicitly, and from the same constant as the
              label, because the focus restore looks this control up by it. */}
          <AdminButton
            tone="primary"
            ariaLabel={NEW_POST_LABEL}
            onClick={handleCreate}
          >
            {NEW_POST_LABEL}
          </AdminButton>
          {/* Appended after the primary rather than before it, so a control
              that comes and goes with the draft never moves the one control
              that is always there. */}
          {hasDraft ? (
            <AdminButton onClick={handleContinueDraft}>
              Continue draft
            </AdminButton>
          ) : null}
        </>
      }
      count={formatRecordCount(page, PAGE_SIZE, total, "posts")}
      controls={
        <AdminSearchField
          label="Search posts"
          placeholder="Search posts"
          value={search}
          onSearch={setSearch}
        />
      }
      footer={
        totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        ) : undefined
      }
    >
      <div className={styles.listRegion} ref={listRef}>
        {actionError ? (
          <AdminStatus tone="error">{actionError}</AdminStatus>
        ) : null}

        {/* No skeleton, and nothing at all while the first fetch is in flight:
            these are sub-second reads off a cached route, and eight grey
            rectangles would be feedback for a wait that is not happening. What
            must not happen is an empty state claiming there are no posts before
            anyone has looked. */}
        {blogs.length > 0 ? (
          <AdminCardGrid density="rows">
            {blogs.map((blog) => (
              <AdminCard
                key={blog.id}
                title={blog.title}
                // `{ s3Key: null }` rather than an omitted slot: a list of
                // mostly-illustrated posts stays even, and an empty plate says
                // "no cover" where a missing one would say nothing.
                media={{ s3Key: blog.coverPhoto ?? null }}
                meta={[
                  { label: "By", value: blog.author },
                  // "On" rather than "Posted", and the four characters are
                  // load-bearing: .meta lays its two items out with
                  // flex-shrink on both, so at 390px - where the content
                  // column resolves to 278px beside the 56px plate - a
                  // six-character label pushed the pair over the line and
                  // ellipsised BOTH values. A truncated name still
                  // identifies; a date reading "Jul 5, 20..." does not.
                  { label: "On", value: formatRecordDate(blog.createdAt) },
                ]}
                // Real sibling buttons. The row is no longer a
                // div[role=button] with two buttons inside it - one ambiguous
                // tab stop announced as "button, Old Fashioned" containing two
                // more buttons, held together by a closest("button") check that
                // had to be right on every click.
                actions={[
                  {
                    label: "Edit",
                    ariaLabel: editLabel(blog),
                    tone: "primary",
                    onClick: () => handleEdit(blog),
                  },
                  {
                    label: "Delete",
                    ariaLabel: `Delete post: ${blog.title}`,
                    tone: "danger",
                    onClick: () => setPendingDelete(blog),
                  },
                ]}
              />
            ))}
          </AdminCardGrid>
        ) : loading ? null : (
          <AdminEmptyState message={emptyMessage} />
        )}
      </div>

      {/* Mounted only while open, which is what makes the editor read its
          initial field values afresh on every open. */}
      {editorOpen ? (
        <AdminBlogEditor
          blog={editing}
          onClose={handleEditorClose}
          forceEmpty={forceEmpty}
        />
      ) : null}

      <AdminConfirmDialog
        isOpen={pendingDelete !== null}
        heading="Delete post"
        message={
          <>
            <strong>{pendingDelete?.title}</strong> will be permanently deleted,
            along with the images uploaded with it. This cannot be undone.
          </>
        }
        confirmLabel="Delete post"
        confirmBusyLabel="Deleting…"
        cancelLabel="Keep post"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminPageLayout>
  );
}
