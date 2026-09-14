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
import styles from "./AdminBlogEditor.module.css";

/**
 * Unchanged from the key the previous editor wrote by hand. Renaming it would
 * silently discard any draft an admin already has in flight - the old key would
 * simply never be read again - which is a data loss with no error attached to
 * it. Exported so the list can ask whether a draft exists without re-spelling
 * the string.
 */
export const BLOG_DRAFT_KEY = "blogDraft";

/** The record this editor reads and writes. `coverPhoto` is an S3 key, never a
 *  URL: the API stores keys and the client signs them on demand. */
export type AdminBlogInput = {
  id?: number;
  title: string;
  content: string;
  author: string;
  coverPhoto?: string | null;
};

/** The shape written to localStorage. A compile-time shape only - whatever is
 *  actually stored was written by some earlier version of this app, which is
 *  why every read below goes through `draftText`. */
export type BlogDraft = {
  title: string;
  content: string;
  author: string;
  coverPhoto: string;
};

type AdminBlogEditorProps = {
  /** null to compose a new post. */
  blog: AdminBlogInput | null;
  onClose: (refresh?: boolean) => void;
  /** "New post" pressed while a draft exists: open blank rather than resuming. */
  forceEmpty?: boolean;
};

const SAVE_FAILED = "Could not save this post. Please try again.";

/** The drop handler's three failure exits all say this, and they said it as
 *  three separate literals. Deliberately NOT imported from `adminUpload`, which
 *  owns the same sentence for the presigned-PUT path: the two upload routes are
 *  documented below as separate on purpose, and sharing the string would be the
 *  first thread tying them back together. */
const DROP_UPLOAD_FAILED = "Upload failed. Please try again.";

export default function AdminBlogEditor({
  blog,
  onClose,
  forceEmpty = false,
}: AdminBlogEditorProps): React.ReactNode {
  const adminFetch = useAdminFetch();
  const { draft, save, clear } = useAdminDraft<BlogDraft>(BLOG_DRAFT_KEY, {
    enabled: !forceEmpty,
  });

  /**
   * One rule for every field: an existing record is the source of truth and the
   * stored draft is never consulted for it; a new post reads the draft, unless
   * `forceEmpty` disabled reading above.
   *
   * `blog ? ... : ...` rather than `blog?.field ?? draftText(...)`, because the
   * nullish form falls through to the draft whenever a *stored* value is null -
   * which is exactly the case for an existing post with no cover photo, and is
   * how a half-written draft's cover key would attach itself to an unrelated
   * record.
   *
   * NO SEEDING EFFECT, deliberately. AdminAuthGate renders "Checking access..."
   * until it has mounted, so this subtree only ever mounts after hydration and
   * `useAdminDraft`'s `useSyncExternalStore` hands it the client snapshot on the
   * first render. An effect would be a second, later write of the same value.
   */
  const initialField = (
    recordValue: string | null | undefined,
    draftValue: unknown,
  ) => (blog ? (recordValue ?? "") : draftText(draftValue));

  const [title, setTitle] = useState(() =>
    initialField(blog?.title, draft?.title),
  );
  const [content, setContent] = useState(() =>
    initialField(blog?.content, draft?.content),
  );
  const [author, setAuthor] = useState(() =>
    initialField(blog?.author, draft?.author),
  );
  // Previously initialised from `blog?.coverPhoto` alone, so a cover key the
  // draft had faithfully recorded was written on every save and read back on
  // none of them.
  const [coverImageKey, setCoverImageKey] = useState(() =>
    initialField(blog?.coverPhoto, draft?.coverPhoto),
  );
  const [coverMarkedForRemoval, setCoverMarkedForRemoval] = useState(false);

  const [coverUploading, setCoverUploading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /**
   * The content textarea, reached by ref. It was reached by
   * `document.getElementById` for as long as `AdminTextarea` did not forward a
   * ref; it does now (its props are `ComponentPropsWithRef`), so this is a
   * component holding the element it rendered rather than querying the document
   * for it - typed, and immune to the two ways the lookup could go wrong: a
   * miss returning null, and two of these editors on one screen.
   *
   * The `id={useId()}` that fed that lookup is gone with it. AdminField falls
   * back to its own `useId` when no id is passed, and its contract says a form
   * only names a field when something OUTSIDE the field needs the name. Nothing
   * does any more.
   */
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const busy = coverUploading || mediaUploading || saving;
  const hasCover = Boolean(coverImageKey) && !coverMarkedForRemoval;

  /**
   * The cover preview, via the shared signed-URL hook rather than the
   * admin-only copy that used to live one directory up. That copy re-fetched on
   * every mount, logged the signed URL it received, and expired after nine
   * minutes with no refresh - so a long edit ended with a broken preview. This
   * one caches by key across the whole client and re-signs before expiry.
   *
   * A key marked for removal is passed as null, which is what makes the preview
   * disappear the instant "Remove cover" is pressed without a second piece of
   * state to keep in step with the first.
   */
  const { url: coverUrl } = useS3ImageUrl(
    coverMarkedForRemoval ? null : coverImageKey || null,
  );

  /**
   * Inserts uploaded media at the cursor.
   *
   * Reads the textarea's LIVE value rather than the `content` captured when
   * this handler was created: an upload takes seconds, and anything typed while
   * it was in flight would otherwise be silently reverted by the insert.
   */
  const insertAtCursor = (snippet: string) => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    setContent(value.slice(0, start) + snippet + value.slice(end));
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
      `blog-media/blog-cover-photos/${file.name}`,
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

  const handleMediaChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMediaUploading(true);
    setError("");
    const result = await uploadToS3(
      adminFetch,
      `blog-media/blog-content-media/${file.name}`,
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
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  /**
   * Drag-and-drop goes to `/api/uploads`, not to the presigned-PUT path the
   * button above uses, and the two insert different things: this one returns a
   * public URL, that one an S3 key. That split is pre-existing and is left
   * alone here because changing it changes what gets written into stored post
   * content; it is reported rather than quietly unified.
   *
   * IT ALSO NEVER WORKED. `/api/uploads` calls `requireAdmin`, and the previous
   * version of this handler sent a bare `fetch` with no Authorization header at
   * all - so every drag-and-drop upload here answered 401 and surfaced
   * "Upload failed". Routing it through `adminFetch` attaches the bearer and
   * fixes the feature; the only reason this reads as a refactor is that nothing
   * else changed.
   *
   * `body: formData` and NOT `json`, so the browser sets the multipart boundary
   * itself. Passing `json` would stamp `Content-Type: application/json` over a
   * multipart body and the route would parse nothing.
   */
  const handleDrop = async (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    const isImage = file.type.startsWith("image/");
    formData.append("type", isImage ? "blog-image" : "blog-media");

    setMediaUploading(true);
    setError("");
    try {
      const res = await adminFetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(await readAdminError(res, DROP_UPLOAD_FAILED));
        return;
      }
      const payload: unknown = await res.json().catch(() => null);
      const url = (payload as { url?: unknown } | null)?.url;
      if (typeof url !== "string" || !url) {
        setError(DROP_UPLOAD_FAILED);
        return;
      }
      insertAtCursor(isImage ? `![alt text](${url})` : url);
    } catch {
      setError(DROP_UPLOAD_FAILED);
    } finally {
      setMediaUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    /**
     * THE SECOND GUARD, and it is owed now that the first one is ours.
     *
     * Save is `busy={saving}`, which used to mean `disabled` - the browser
     * refused the second activation and this handler could not be re-entered.
     * A busy AdminButton is now `aria-disabled`: focusable, clickable, and
     * inert only because AdminButton cancels the activation (see its
     * swallowActivation). That is a correct guard and it is measured, but it is
     * a guard in a presentational component, and the thing it is protecting is
     * a second PUT that overwrites the post with whatever the fields held on
     * the second press.
     *
     * So the invariant is stated here too, where the request is made. Cheap,
     * and it does not depend on how any control renders. It reads the state
     * rather than a ref because React flushes a discrete event's updates before
     * the next event is dispatched, so a second press cannot see a stale false.
     */
    if (saving) return;
    setSaving(true);
    setError("");

    const coverPhoto = coverMarkedForRemoval
      ? null
      : coverImageKey || undefined;
    const payload = { title, content, author, coverPhoto };

    /**
     * BEFORE the request, not after it, and this is the ordering the previous
     * version got wrong. `adminFetch` calls `signOut()` the moment a 401 or 403
     * comes back - before the `await` below resumes - and AdminAuthGate can
     * unmount this whole subtree in that same commit. A draft written after the
     * await may therefore never be written at all, which is precisely the case
     * ("Session expired. Your draft is saved.") it existed to cover.
     *
     * ONLY WHEN COMPOSING A NEW POST. For an existing record the draft is not
     * the only copy - the row is still in the database with its previous
     * content - while writing one would leave a *new-post* draft holding an
     * existing post's text, which the list then offers as "Continue draft" and
     * which saves as a duplicate. That was a real hazard in the old 401 path.
     */
    if (!blog) save({ title, content, author, coverPhoto: coverPhoto ?? "" });

    try {
      const res = await adminFetch(blog ? `/api/blogs/${blog.id}` : "/api/blogs", {
        method: blog ? "PUT" : "POST",
        json: payload,
      });
      if (!res.ok) {
        // Covers the expired session too. `adminFetch` has already signed out
        // and AdminAuthGate owns the redirect, so there is no second navigation
        // to schedule here - the old 1500ms `window.location.href` raced the
        // gate for the same outcome.
        setError(await readAdminError(res, SAVE_FAILED));
        return;
      }
      // Symmetric with the save above: clearing on an EDIT would discard an
      // unrelated new-post draft the admin still had in progress, which the
      // previous unconditional `removeItem` did on every successful edit.
      if (!blog) clear();
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
      // what re-runs every useState initialiser above on each open - a
      // persistently-mounted dialog would show the previous record's text.
      isOpen
      onClose={() => onClose(false)}
      heading={blog ? "Edit post" : "New post"}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.fields}>
          {/* A fieldset, because this is a LABELLED GROUP OF CONTROLS rather
              than one labelled control: the visible affordances are two buttons
              and a preview, and the file input behind them is display:none and
              so is not in the accessibility tree at all. AdminField would have
              wired its label, hint and aria-describedby to that invisible
              input. */}
          <fieldset className={`${styles.group} ${styles.wide}`}>
            <legend className={styles.groupLabel}>Cover photo</legend>
            <p className={styles.groupHint}>
              Optional. Shown beside this post in the list, and as its card
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
              label="Content"
              hint="Markdown. Drop a file onto the box, or use Add media."
              required
            >
              {(control) => (
                <AdminTextarea
                  {...control}
                  ref={contentRef}
                  className={styles.contentInput}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  required
                  rows={12}
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

        {/* A failed WRITE: assertive, anchored to the form that failed, and
            never cleared by a re-render. A failed read elsewhere in the admin
            is prose in an empty slot; this one means work is at risk. */}
        {error ? <AdminStatus tone="error">{error}</AdminStatus> : null}

        <div className={styles.actions}>
          <AdminButton onClick={() => onClose(false)} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton tone="primary" type="submit" busy={saving}>
            {saving ? "Saving…" : "Save post"}
          </AdminButton>
        </div>
      </form>
    </AdminDialog>
  );
}
