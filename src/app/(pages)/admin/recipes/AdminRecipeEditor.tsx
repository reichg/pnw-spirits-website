"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import AdminButton from "@/components/admin/AdminButton";
import AdminDialog from "@/components/admin/AdminDialog";
import AdminField from "@/components/admin/AdminField";
import { AdminInput, AdminTextarea } from "@/components/admin/AdminInput";
import AdminStatus from "@/components/admin/AdminStatus";
import { draftText } from "@/components/admin/adminRecords";
import { uploadToS3 } from "@/components/admin/adminUpload";
import { useAdminDraft } from "@/hooks/useAdminDraft";
import { readAdminError, useAdminFetch } from "@/hooks/useAdminFetch";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import styles from "./AdminRecipeEditor.module.css";

/** Unchanged from the key the previous editor wrote by hand: renaming it would
 *  silently discard any draft an admin already has in flight. Exported so the
 *  list can ask whether one exists without re-spelling the string. */
export const RECIPE_DRAFT_KEY = "recipeDraft";

/** The record this editor reads and writes. `coverPhoto` is an S3 key. */
export type AdminRecipeInput = {
  id?: number;
  title: string;
  description: string;
  author: string;
  ingredients: string;
  instructions: string;
  coverPhoto?: string | null;
};

/** The shape written to localStorage - a compile-time shape only, which is why
 *  every read below goes through `draftText`. */
export type RecipeDraft = {
  title: string;
  description: string;
  author: string;
  ingredients: string;
  instructions: string;
  coverPhoto: string;
};

type AdminRecipeEditorProps = {
  /** null to compose a new recipe. */
  recipe: AdminRecipeInput | null;
  onClose: (refresh?: boolean) => void;
  /** "New recipe" pressed while a draft exists: open blank rather than resuming. */
  forceEmpty?: boolean;
};

const SAVE_FAILED = "Could not save this recipe. Please try again.";

export default function AdminRecipeEditor({
  recipe,
  onClose,
  forceEmpty = false,
}: AdminRecipeEditorProps): React.ReactNode {
  const adminFetch = useAdminFetch();
  const { draft, save, clear } = useAdminDraft<RecipeDraft>(RECIPE_DRAFT_KEY, {
    enabled: !forceEmpty,
  });

  /**
   * One rule for every field: an existing record is the source of truth and the
   * stored draft is never consulted for it; a new recipe reads the draft,
   * unless `forceEmpty` disabled reading above.
   *
   * `recipe ? ... : ...` rather than `recipe?.field ?? draftText(...)`, because
   * the nullish form falls through to the draft whenever a stored value is null
   * - exactly the case for an existing recipe with no cover photo, and how a
   * half-written draft's cover key would attach itself to an unrelated record.
   */
  const initialField = (
    recordValue: string | null | undefined,
    draftValue: unknown,
  ) => (recipe ? (recordValue ?? "") : draftText(draftValue));

  const [title, setTitle] = useState(() =>
    initialField(recipe?.title, draft?.title),
  );
  const [description, setDescription] = useState(() =>
    initialField(recipe?.description, draft?.description),
  );
  const [author, setAuthor] = useState(() =>
    initialField(recipe?.author, draft?.author),
  );
  const [ingredients, setIngredients] = useState(() =>
    initialField(recipe?.ingredients, draft?.ingredients),
  );
  const [instructions, setInstructions] = useState(() =>
    initialField(recipe?.instructions, draft?.instructions),
  );
  // Previously initialised from `recipe?.coverPhoto` alone, so a cover key the
  // draft had faithfully recorded was written on every save and read back on
  // none of them.
  const [coverImageKey, setCoverImageKey] = useState(() =>
    initialField(recipe?.coverPhoto, draft?.coverPhoto),
  );
  const [coverMarkedForRemoval, setCoverMarkedForRemoval] = useState(false);

  const [coverUploading, setCoverUploading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /** The instructions textarea, reached by ref now that `AdminTextarea`
   *  forwards one: a component holding the element it rendered, rather than
   *  querying the document for it by an id it had to mint for the purpose. The
   *  `id={useId()}` that fed that lookup is gone with it - AdminField mints its
   *  own when the form does not name the field, and nothing outside the field
   *  needs the name any more. */
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const busy = coverUploading || mediaUploading || saving;
  const hasCover = Boolean(coverImageKey) && !coverMarkedForRemoval;

  /** The cover preview, via the shared signed-URL hook rather than the
   *  admin-only copy that used to live one directory up: this one caches by key
   *  across the client and re-signs before expiry, so a long edit no longer
   *  ends with a broken preview. */
  const { url: coverUrl } = useS3ImageUrl(
    coverMarkedForRemoval ? null : coverImageKey || null,
  );

  /**
   * Inserts uploaded media at the cursor, reading the textarea's LIVE value
   * rather than the `instructions` captured when this handler was created: an
   * upload takes seconds, and anything typed while it was in flight would
   * otherwise be silently reverted by the insert.
   */
  const insertAtCursor = (snippet: string) => {
    const textarea = instructionsRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    setInstructions(value.slice(0, start) + snippet + value.slice(end));
    // After React has written the new value back; setting the caret
    // synchronously would be undone by the controlled re-render.
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
      textarea.focus();
    }, 0);
  };

  const handleCoverChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setError("");
    const result = await uploadToS3(
      adminFetch,
      `recipe-media/recipe-cover-photos/${file.name}`,
      file,
    );
    if (result.ok) {
      setCoverMarkedForRemoval(false);
      setCoverImageKey(result.key);
    } else {
      setError(result.message);
    }
    setCoverUploading(false);
    // Cleared so re-picking the same file fires `change` again.
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  /** Shared by the Add media button and by a drop onto the instructions box.
   *  The two used different key prefixes before - `recipe-media/...` for one
   *  and `recipe-media/recipe-content-media/...` for the other - for the same
   *  operation on the same field. */
  const uploadContentMedia = async (file: File) => {
    setMediaUploading(true);
    setError("");
    const result = await uploadToS3(
      adminFetch,
      `recipe-media/recipe-content-media/${file.name}`,
      file,
    );
    if (result.ok) {
      insertAtCursor(
        file.type.startsWith("image/") ? `![image](${result.key})` : result.key,
      );
    } else {
      setError(result.message);
    }
    setMediaUploading(false);
  };

  const handleMediaChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadContentMedia(file);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const handleDrop = async (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadContentMedia(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Re-entrancy guard, for the reason AdminBlogEditor's handleSubmit records
    // at length: `busy` on an AdminButton is now `aria-disabled` rather than
    // `disabled`, so the control is inert by AdminButton's own handling rather
    // than by the browser's refusal, and the invariant "one save per save" is
    // restated here where the PUT is actually issued.
    if (saving) return;
    setSaving(true);
    setError("");

    const coverPhoto = coverMarkedForRemoval
      ? null
      : coverImageKey || undefined;
    const fields = {
      title,
      description,
      author,
      ingredients,
      instructions,
      coverPhoto,
    };

    /**
     * BEFORE the request, not after it, and this is the ordering the previous
     * version got wrong. `adminFetch` calls `signOut()` the moment a 401 or 403
     * comes back - before the `await` below resumes - and AdminAuthGate can
     * unmount this whole subtree in that same commit, so a draft written after
     * the await may never be written at all.
     *
     * ONLY WHEN COMPOSING A NEW RECIPE. For an existing record the draft is not
     * the only copy, while writing one would leave a new-recipe draft holding
     * an existing recipe's text - which the list then offers as "Continue
     * draft" and which saves as a duplicate.
     */
    if (!recipe) save({ ...fields, coverPhoto: coverPhoto ?? "" });

    try {
      // One endpoint, two methods: PATCH carries the id in the body, POST has
      // none to carry.
      const res = await adminFetch("/api/recipes", {
        method: recipe ? "PATCH" : "POST",
        json: recipe ? { id: recipe.id, ...fields } : fields,
      });
      if (!res.ok) {
        // Covers the expired session too: adminFetch has already signed out and
        // AdminAuthGate owns the redirect, so there is no second navigation to
        // schedule here.
        setError(await readAdminError(res, SAVE_FAILED));
        return;
      }
      // Symmetric with the save above: clearing on an EDIT would discard an
      // unrelated new-recipe draft the admin still had in progress.
      if (!recipe) clear();
      onClose(true);
    } catch {
      setError("Could not reach the server. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      // The list mounts this component only while the editor is open, which is
      // what re-runs every useState initialiser above on each open.
      isOpen
      onClose={() => onClose(false)}
      heading={recipe ? "Edit recipe" : "New recipe"}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.fields}>
          {/* A fieldset, because this is a labelled GROUP of controls: the
              visible affordances are two buttons and a preview, and the file
              input behind them is display:none and so is not in the
              accessibility tree for AdminField to label. */}
          <fieldset className={`${styles.group} ${styles.wide}`}>
            <legend className={styles.groupLabel}>Cover photo</legend>
            <p className={styles.groupHint}>
              Optional. Shown beside this recipe in the list, and as its card
              image on the site.
            </p>
            <div className={styles.coverRow}>
              <AdminButton
                onClick={() => coverInputRef.current?.click()}
                disabled={busy}
                busy={coverUploading}
              >
                {coverUploading
                  ? "Uploading…"
                  : hasCover
                    ? "Change cover"
                    : "Add cover"}
              </AdminButton>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={handleCoverChange}
              />
              {/* The absolute-URL test is a guard, not a formality: `url` comes
                  back from the signing route and is handed to next/image, which
                  throws on anything that is not a valid src. */}
              {hasCover && coverUrl && /^https?:\/\//.test(coverUrl) ? (
                <Image
                  src={coverUrl}
                  alt="Current cover photo"
                  className={styles.coverPreview}
                  width={112}
                  height={72}
                />
              ) : null}
              {hasCover ? (
                <AdminButton
                  onClick={() => setCoverMarkedForRemoval(true)}
                  disabled={busy}
                >
                  Remove cover
                </AdminButton>
              ) : null}
              {coverMarkedForRemoval ? (
                <p className={styles.coverNote} aria-live="polite">
                  Cover photo will be removed when you save.
                </p>
              ) : null}
            </div>
          </fieldset>

          <AdminField label="Title" required>
            {(control) => (
              <AdminInput
                {...control}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={saving}
              />
            )}
          </AdminField>

          <AdminField label="Author" required>
            {(control) => (
              <AdminInput
                {...control}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                required
                disabled={saving}
              />
            )}
          </AdminField>

          <div className={styles.wide}>
            <AdminField
              label="Description"
              hint="One or two lines. This is what the recipe card shows."
              required
            >
              {(control) => (
                <AdminTextarea
                  {...control}
                  className={styles.shortInput}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  rows={3}
                  disabled={saving}
                />
              )}
            </AdminField>
          </div>

          <div className={styles.wide}>
            <AdminField
              label="Ingredients"
              hint="New line per ingredient"
              required
            >
              {(control) => (
                <AdminTextarea
                  {...control}
                  className={styles.shortInput}
                  value={ingredients}
                  onChange={(event) => setIngredients(event.target.value)}
                  required
                  rows={4}
                  disabled={saving}
                />
              )}
            </AdminField>
          </div>

          <div className={styles.wide}>
            <AdminField
              label="Instructions"
              hint="Markdown. Drop a file onto the box, or use Add media."
              required
            >
              {(control) => (
                <AdminTextarea
                  {...control}
                  ref={instructionsRef}
                  className={styles.instructionsInput}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  required
                  rows={10}
                  disabled={saving}
                  onDrop={handleDrop}
                  onDragOver={(event) => event.preventDefault()}
                />
              )}
            </AdminField>
            <div className={styles.mediaRow}>
              <AdminButton
                onClick={() => mediaInputRef.current?.click()}
                disabled={busy}
                busy={mediaUploading}
              >
                {mediaUploading ? "Uploading…" : "Add media"}
              </AdminButton>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                className={styles.fileInput}
                onChange={handleMediaChange}
              />
            </div>
          </div>
        </div>

        {/* A failed WRITE: assertive, anchored to the form that failed, and not
            cleared by the next render. */}
        {error ? <AdminStatus tone="error">{error}</AdminStatus> : null}

        <div className={styles.actions}>
          <AdminButton onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton tone="primary" type="submit" busy={saving}>
            {saving ? "Saving…" : "Save recipe"}
          </AdminButton>
        </div>
      </form>
    </AdminDialog>
  );
}
