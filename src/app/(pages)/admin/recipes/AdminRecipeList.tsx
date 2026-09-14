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
import AdminRecipeEditor, {
  RECIPE_DRAFT_KEY,
  type AdminRecipeInput,
  type RecipeDraft,
} from "./AdminRecipeEditor";
import styles from "./AdminRecipeList.module.css";

/** The collection this screen reads and writes. One constant, because the list
 *  and the delete below must never address different routes. */
const ENDPOINT = "/api/recipes";

/** Matches `/api/recipes`'s own default. This list previously sent no paging
 *  parameters at all and rendered every recipe in the database on one screen. */
const PAGE_SIZE = 10;

/** A row in the list: the editor's input shape plus the two fields only a list
 *  needs. */
type RecipeRecord = AdminRecipeInput & { id: number; createdAt: string };

/** Module scope, so the selector identity is stable for the life of the app. */
const selectRecipes = rowsAtKey<RecipeRecord>("recipes");

/**
 * The row's Edit control, named ONCE.
 *
 * Written by the card's actions and read back by the focus restore below, which
 * has to find that control again after the row has been unmounted and rebuilt.
 * Two spellings of it would be a restore that silently stops working the first
 * time the label is reworded - and silently is the operative word, because
 * nothing on screen looks broken when focus is merely dropped.
 */
function editLabel(recipe: RecipeRecord): string {
  return `Edit recipe: ${recipe.title}`;
}

/** The toolbar's primary action, spelled once for the same reason: it is both
 *  the button's accessible name and what the restore looks it up by. */
const NEW_RECIPE_LABEL = "New recipe";

/**
 * Where focus should go after a delete, decided when the delete was confirmed
 * and consumed once the list has settled.
 */
type DeleteFocusIntent = {
  /** The deleted record's row index on the page it was deleted from. */
  index: number;
};

const LOAD_FAILED =
  "These recipes could not be loaded. Refresh the page to try again.";
const DELETE_FAILED = "That recipe could not be deleted. Please try again.";

export default function AdminRecipeList(): React.ReactNode {
  const adminFetch = useAdminFetch();
  // Read-only here: the editor owns writing and clearing.
  const { hasDraft } = useAdminDraft<RecipeDraft>(RECIPE_DRAFT_KEY);

  // The paged read, the debounced term's page reset, the last-page clamp after a
  // delete and the loading/error states all live in the hook, shared with the
  // posts list. The read is sent even before a token arrives: AdminAuthGate
  // blocks this subtree until the session is valid, so in practice the token is
  // always here - and if it were not, adminFetch would sign out on the 401 and
  // the gate would redirect once, rather than two mechanisms racing.
  const {
    items: recipes,
    total,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    loading,
    loadError,
    reload,
  } = useAdminList<RecipeRecord>({
    endpoint: ENDPOINT,
    pageSize: PAGE_SIZE,
    select: selectRecipes,
    loadFailedMessage: LOAD_FAILED,
  });

  /** A failed WRITE: assertive, anchored above the list it failed to change -
   *  unlike the hook's `loadError`, which is prose in the empty slot. */
  const [actionError, setActionError] = useState("");

  const [editing, setEditing] = useState<RecipeRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [forceEmpty, setForceEmpty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RecipeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleEdit = (recipe: RecipeRecord) => {
    setEditing(recipe);
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
    // No manual localStorage re-read: useAdminDraft notifies its subscribers on
    // every save and clear, in this tab as well as others.
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
   * Closing it at the end of `confirmDelete` closes it while the deleted row is
   * STILL MOUNTED - `reload()` only bumps a token, and the new rows land a
   * commit or two later. `useModalDismiss` then restores focus to a trigger
   * that React detaches milliseconds afterwards, and focus falls to <body>.
   * Waiting for the rows means the trigger is already gone when focus is
   * restored, so the hook's ancestor walk lands on the record that took the
   * deleted one's place. The posts list carries the full measurement; this is
   * the same fix, in the same shape, because the two diverging on exactly this
   * ordering is what produced the bug.
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
  }, [recipes]);

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
   *                       rescue this exact state; otherwise New recipe, which
   *                       is what the empty copy tells the admin to press.
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
    if (recipes.length === 0 && total > 0) return;

    focusAfterDelete.current = null;

    if (recipes.length === 0) {
      focusIfOrphaned(
        search
          ? // The only button inside the search form is its Clear. Structural
            // rather than name-matched because the control belongs to a
            // component this screen composes but does not own.
            document.querySelector<HTMLButtonElement>(
              'form[role="search"] button',
            )
          : findByAccessibleName(document, NEW_RECIPE_LABEL),
      );
      return;
    }

    const landed = recipes[Math.min(intent.index, recipes.length - 1)];
    focusIfOrphaned(findByAccessibleName(listRef.current, editLabel(landed)));
  }, [recipes, pendingDelete, search, total]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    // Re-entrancy guard, for the reason AdminBlogList's confirmDelete states as
    // a rule: the confirming control carries `busy`, which is `aria-disabled`
    // rather than native `disabled`, so its inertness is AdminButton's doing
    // rather than the browser's - and this dialog outlives its own request, so
    // that control stays focused and activatable across the round trip. The
    // row's Edit and Delete are AdminCardActions, natively `disabled`, and are
    // correctly unguarded. Defence in depth rather than a live bug; what it
    // stands between is a second DELETE of a recipe and its S3 media.
    if (deleting) return;
    setDeleting(true);
    setActionError("");
    try {
      const res = await adminFetch(`${ENDPOINT}/${target.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setActionError(await readAdminError(res, DELETE_FAILED));
        return;
      }
      // A refetch rather than the local `recipes.filter(...)` this replaces: the
      // filtered version left `total`, the count line and the pager describing
      // a collection that no longer existed.
      reload();
      // Armed AFTER the call, so a `reload()` that somehow threw leaves the
      // `finally` free to close rather than waiting on a refetch never started.
      closeOnReload.current = true;
      // Resolved against the list as it stood when Delete was confirmed - the
      // dialog was blocking the page throughout, so this is the row order the
      // admin was actually looking at. `max(0, ...)` because a findIndex miss
      // must degrade to the top of the list, not to `recipes[-1]`.
      focusAfterDelete.current = {
        index: Math.max(
          0,
          recipes.findIndex((recipe) => recipe.id === target.id),
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
      ? `No recipes match “${search}”. Clear the search to see all of them.`
      : "No recipes yet. New Recipe writes the first one.";

  return (
    <AdminPageLayout
      eyebrow={ADMIN_EYEBROW}
      heading="Cocktail recipes"
      toolbar={
        <>
          {/* The name is set explicitly, and from the same constant as the
              label, because the focus restore looks this control up by it. */}
          <AdminButton
            tone="primary"
            ariaLabel={NEW_RECIPE_LABEL}
            onClick={handleCreate}
          >
            {NEW_RECIPE_LABEL}
          </AdminButton>
          {/* Appended after the primary, so a control that comes and goes with
              the draft never moves the one control that is always there. */}
          {hasDraft ? (
            <AdminButton onClick={handleContinueDraft}>
              Continue draft
            </AdminButton>
          ) : null}
        </>
      }
      count={formatRecordCount(page, PAGE_SIZE, total, "recipes")}
      controls={
        <AdminSearchField
          label="Search recipes"
          placeholder="Search recipes"
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

        {/* No skeleton: these are sub-second reads off a cached route. What must
            not happen is an empty state claiming there are no recipes before
            anyone has looked, which is what the loading branch guards. */}
        {recipes.length > 0 ? (
          <AdminCardGrid density="rows">
            {recipes.map((recipe) => (
              <AdminCard
                key={recipe.id}
                title={recipe.title}
                // `{ s3Key: null }` rather than an omitted slot, so a list of
                // mostly-illustrated recipes stays even.
                media={{ s3Key: recipe.coverPhoto ?? null }}
                meta={[
                  { label: "By", value: recipe.author },
                  // "On" rather than "Added": .meta shrinks both of its items,
                  // so at 390px a longer label ellipsised the date as well as
                  // the author. See the posts list, which pairs with this.
                  { label: "On", value: formatRecordDate(recipe.createdAt) },
                ]}
                // Real sibling buttons, replacing a div[role=button] that
                // contained two more buttons and relied on a
                // closest("button") check to tell them apart.
                actions={[
                  {
                    label: "Edit",
                    ariaLabel: editLabel(recipe),
                    tone: "primary",
                    onClick: () => handleEdit(recipe),
                  },
                  {
                    label: "Delete",
                    ariaLabel: `Delete recipe: ${recipe.title}`,
                    tone: "danger",
                    onClick: () => setPendingDelete(recipe),
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
        <AdminRecipeEditor
          recipe={editing}
          onClose={handleEditorClose}
          forceEmpty={forceEmpty}
        />
      ) : null}

      <AdminConfirmDialog
        isOpen={pendingDelete !== null}
        heading="Delete recipe"
        message={
          <>
            <strong>{pendingDelete?.title}</strong> will be permanently deleted,
            along with the images uploaded with it. This cannot be undone.
          </>
        }
        confirmLabel="Delete recipe"
        confirmBusyLabel="Deleting…"
        cancelLabel="Keep recipe"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminPageLayout>
  );
}
