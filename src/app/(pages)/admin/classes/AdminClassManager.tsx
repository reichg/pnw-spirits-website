"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminToken } from "../AdminTokenContext";
import { useS3ImageUrl } from "@/utils/useS3ImageUrl";
import styles from "./AdminClassManager.module.css";

// S3 key prefix for cocktail-class photo-album uploads.
const ALBUM_KEY_PREFIX = "class-media/album";
const LOGIN_PATH = "/admin/login";
const CLASSES_ENDPOINT = "/api/classes";
const SESSIONS_ENDPOINT = `${CLASSES_ENDPOINT}/sessions`;
const PHOTOS_ENDPOINT = `${CLASSES_ENDPOINT}/photos`;
const SIGNED_URL_ENDPOINT = "/api/s3-signed-url";

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

interface ClassPhoto {
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

// Build a unique, sanitized S3 key under the album prefix (mirrors existing editors).
function buildAlbumKey(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ALBUM_KEY_PREFIX}/${Date.now()}-${safeName}`;
}

// Convert an API ISO datetime string into the value expected by <input type="datetime-local">.
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Convert a datetime-local input value back into an ISO string for the API.
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

function formatSession(session: ClassSession): string {
  const start = new Date(session.startTime);
  const startLabel = Number.isNaN(start.getTime())
    ? session.startTime
    : start.toLocaleString();
  const end = session.endTime ? new Date(session.endTime) : null;
  const endLabel =
    end && !Number.isNaN(end.getTime()) ? ` – ${end.toLocaleString()}` : "";
  const location = session.location ? ` @ ${session.location}` : "";
  return `${startLabel}${endLabel}${location}`;
}

export default function AdminClassManager() {
  const { token } = useAdminToken();
  const router = useRouter();

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
  const [sessionError, setSessionError] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);

  const [photoCaption, setPhotoCaption] = useState("");
  const [photoSortOrder, setPhotoSortOrder] = useState("0");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = content !== null;
  const isDisabled = !token;

  // On 401 from any admin call, mirror the existing editors and redirect to login.
  const requireAuth = useCallback(
    (status: number): boolean => {
      if (status === 401) {
        router.push(LOGIN_PATH);
        return false;
      }
      return true;
    },
    [router],
  );

  // Bearer-authenticated JSON fetch helper shared by every admin mutation.
  const authFetch = useCallback(
    (input: string, init: RequestInit & { json?: unknown } = {}) => {
      const { json, headers, ...rest } = init;
      return fetch(input, {
        ...rest,
        headers: {
          ...(json !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      });
    },
    [token],
  );

  // Single source of truth for (re)loading the class page state.
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(CLASSES_ENDPOINT);
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
  }, []);

  useEffect(() => {
    // Mount-time fetch: reload() sets loading state synchronously, which the
    // set-state-in-effect rule flags; this initial load is the intended sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const readError = async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      return (data?.error as string) || fallback;
    } catch {
      return fallback;
    }
  };

  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setContentSaving(true);
    setContentError("");
    setContentSuccess("");
    try {
      const res = await authFetch(CLASSES_ENDPOINT, {
        method: "PUT",
        json: { title, description },
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setContentError(await readError(res, "Failed to save page content."));
        return;
      }
      setContentSuccess("Page content saved.");
      await reload();
    } catch {
      setContentError("Failed to save page content.");
    } finally {
      setContentSaving(false);
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStart) {
      setSessionError("Start time is required.");
      return;
    }
    setSessionBusy(true);
    setSessionError("");
    try {
      const res = await authFetch(SESSIONS_ENDPOINT, {
        method: "POST",
        json: {
          startTime: localInputToIso(newStart),
          endTime: newEnd ? localInputToIso(newEnd) : undefined,
          location: newLocation || undefined,
        },
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setSessionError(
          await readError(
            res,
            "Failed to add session. Save the page content first.",
          ),
        );
        return;
      }
      setNewStart("");
      setNewEnd("");
      setNewLocation("");
      await reload();
    } catch {
      setSessionError("Failed to add session.");
    } finally {
      setSessionBusy(false);
    }
  };

  const beginEditSession = (session: ClassSession) => {
    setEditingSessionId(session.id);
    setEditStart(isoToLocalInput(session.startTime));
    setEditEnd(isoToLocalInput(session.endTime));
    setEditLocation(session.location ?? "");
    setSessionError("");
  };

  const handleUpdateSession = async (id: number) => {
    if (!editStart) {
      setSessionError("Start time is required.");
      return;
    }
    setSessionBusy(true);
    setSessionError("");
    try {
      const res = await authFetch(`${SESSIONS_ENDPOINT}/${id}`, {
        method: "PUT",
        json: {
          startTime: localInputToIso(editStart),
          endTime: editEnd ? localInputToIso(editEnd) : undefined,
          location: editLocation || undefined,
        },
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setSessionError(await readError(res, "Failed to update session."));
        return;
      }
      setEditingSessionId(null);
      await reload();
    } catch {
      setSessionError("Failed to update session.");
    } finally {
      setSessionBusy(false);
    }
  };

  const handleDeleteSession = async (id: number) => {
    setSessionBusy(true);
    setSessionError("");
    try {
      const res = await authFetch(`${SESSIONS_ENDPOINT}/${id}`, {
        method: "DELETE",
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setSessionError(await readError(res, "Failed to delete session."));
        return;
      }
      await reload();
    } catch {
      setSessionError("Failed to delete session.");
    } finally {
      setSessionBusy(false);
    }
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError("");
    try {
      // 1. Request a signed upload URL.
      const key = buildAlbumKey(file.name);
      const signedRes = await authFetch(SIGNED_URL_ENDPOINT, {
        method: "POST",
        json: { key, contentType: file.type },
      });
      if (!requireAuth(signedRes.status)) return;
      const signed = await signedRes.json();
      if (!signedRes.ok || !signed.url) {
        setPhotoError(signed.error || "Upload failed.");
        return;
      }
      // 2. PUT the file directly to S3.
      const uploadRes = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        setPhotoError("Upload failed (S3 error).");
        return;
      }
      // 3. Persist the S3 key via the feature API.
      const sortOrder = Number.parseInt(photoSortOrder, 10);
      const createRes = await authFetch(PHOTOS_ENDPOINT, {
        method: "POST",
        json: {
          s3Key: key,
          caption: photoCaption || undefined,
          sortOrder: Number.isNaN(sortOrder) ? undefined : sortOrder,
        },
      });
      if (!requireAuth(createRes.status)) return;
      if (!createRes.ok) {
        setPhotoError(
          await readError(
            createRes,
            "Failed to save photo. Save the page content first.",
          ),
        );
        return;
      }
      setPhotoCaption("");
      setPhotoSortOrder("0");
      await reload();
    } catch {
      setPhotoError("Upload failed.");
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpdatePhotoCaption = async (
    photo: ClassPhoto,
    caption: string,
    sortOrder: number,
  ) => {
    setPhotoError("");
    try {
      const res = await authFetch(`${PHOTOS_ENDPOINT}/${photo.id}`, {
        method: "PUT",
        json: { s3Key: photo.s3Key, caption: caption || undefined, sortOrder },
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setPhotoError(await readError(res, "Failed to update photo."));
        return;
      }
      await reload();
    } catch {
      setPhotoError("Failed to update photo.");
    }
  };

  const handleDeletePhoto = async (id: number) => {
    setPhotoError("");
    try {
      const res = await authFetch(`${PHOTOS_ENDPOINT}/${id}`, {
        method: "DELETE",
      });
      if (!requireAuth(res.status)) return;
      if (!res.ok) {
        setPhotoError(await readError(res, "Failed to delete photo."));
        return;
      }
      await reload();
    } catch {
      setPhotoError("Failed to delete photo.");
    }
  };

  if (loading) {
    return (
      <div className={styles.manager}>
        <p className={styles.emptyState}>Loading cocktail classes…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.manager}>
        <p className={styles.error}>{loadError}</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => void reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.manager}>
      {/* Page content */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Page Content</h2>
        <form onSubmit={handleSaveContent}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="class-title">
              Title
            </label>
            <input
              id="class-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isDisabled || contentSaving}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="class-description">
              General statement
            </label>
            <textarea
              id="class-description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              disabled={isDisabled || contentSaving}
            />
          </div>
          {!hasContent && (
            <p className={styles.emptyState}>
              Save the page content first to enable adding sessions and photos.
            </p>
          )}
          {contentError && <p className={styles.error}>{contentError}</p>}
          {contentSuccess && <p className={styles.success}>{contentSuccess}</p>}
          <button
            type="submit"
            className={styles.button}
            disabled={isDisabled || contentSaving}
          >
            {contentSaving ? "Saving…" : "Save Content"}
          </button>
        </form>
      </section>

      {/* Sessions */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Class Dates &amp; Times</h2>
        {sessions.length === 0 ? (
          <p className={styles.emptyState}>No sessions scheduled yet.</p>
        ) : (
          <ul className={styles.list}>
            {sessions.map((session) =>
              editingSessionId === session.id ? (
                <li key={session.id} className={styles.listItem}>
                  <div className={styles.sessionRow}>
                    <div className={styles.field}>
                      <label className={styles.label}>Start</label>
                      <input
                        type="datetime-local"
                        className={styles.input}
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        disabled={sessionBusy}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>End</label>
                      <input
                        type="datetime-local"
                        className={styles.input}
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        disabled={sessionBusy}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>Location</label>
                      <input
                        className={styles.input}
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        disabled={sessionBusy}
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => void handleUpdateSession(session.id)}
                      disabled={sessionBusy}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => setEditingSessionId(null)}
                      disabled={sessionBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={session.id} className={styles.listItem}>
                  <span>{formatSession(session)}</span>
                  <span>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      onClick={() => beginEditSession(session)}
                      disabled={isDisabled || sessionBusy}
                    >
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void handleDeleteSession(session.id)}
                      disabled={isDisabled || sessionBusy}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}

        <form onSubmit={handleAddSession}>
          <div className={styles.sessionRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-session-start">
                Start time
              </label>
              <input
                id="new-session-start"
                type="datetime-local"
                className={styles.input}
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                required
                disabled={isDisabled || sessionBusy || !hasContent}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-session-end">
                End time
              </label>
              <input
                id="new-session-end"
                type="datetime-local"
                className={styles.input}
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                disabled={isDisabled || sessionBusy || !hasContent}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-session-location">
                Location
              </label>
              <input
                id="new-session-location"
                className={styles.input}
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                disabled={isDisabled || sessionBusy || !hasContent}
              />
            </div>
            <button
              type="submit"
              className={styles.button}
              disabled={isDisabled || sessionBusy || !hasContent}
            >
              {sessionBusy ? "Working…" : "Add Session"}
            </button>
          </div>
          {sessionError && <p className={styles.error}>{sessionError}</p>}
        </form>
      </section>

      {/* Photo album */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Photo Album</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="photo-caption">
            Caption (optional)
          </label>
          <input
            id="photo-caption"
            className={styles.input}
            value={photoCaption}
            onChange={(e) => setPhotoCaption(e.target.value)}
            disabled={isDisabled || photoUploading || !hasContent}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="photo-sort-order">
            Order
          </label>
          <input
            id="photo-sort-order"
            type="number"
            className={styles.input}
            value={photoSortOrder}
            onChange={(e) => setPhotoSortOrder(e.target.value)}
            disabled={isDisabled || photoUploading || !hasContent}
          />
        </div>
        <label className={styles.uploadArea} htmlFor="photo-upload">
          {photoUploading
            ? "Uploading…"
            : hasContent
              ? "Click to upload a photo"
              : "Save the page content first"}
        </label>
        <input
          id="photo-upload"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoUpload}
          disabled={isDisabled || photoUploading || !hasContent}
        />
        {photoError && <p className={styles.error}>{photoError}</p>}
        {photos.length === 0 ? (
          <p className={styles.emptyState}>No photos uploaded yet.</p>
        ) : (
          <div className={styles.photoGrid}>
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                disabled={isDisabled}
                onSave={handleUpdatePhotoCaption}
                onDelete={handleDeletePhoto}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface PhotoCardProps {
  photo: ClassPhoto;
  disabled: boolean;
  onSave: (photo: ClassPhoto, caption: string, sortOrder: number) => void;
  onDelete: (id: number) => void;
}

function PhotoCard({ photo, disabled, onSave, onDelete }: PhotoCardProps) {
  const { url } = useS3ImageUrl(photo.s3Key);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [sortOrder, setSortOrder] = useState(String(photo.sortOrder));

  const parsedOrder = Number.parseInt(sortOrder, 10);

  return (
    <div className={styles.photoItem}>
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
        disabled={disabled}
      />
      <input
        className={styles.input}
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        disabled={disabled}
      />
      <button
        type="button"
        className={styles.buttonSecondary}
        onClick={() =>
          onSave(photo, caption, Number.isNaN(parsedOrder) ? 0 : parsedOrder)
        }
        disabled={disabled}
      >
        Save
      </button>
      <button
        type="button"
        className={styles.dangerButton}
        onClick={() => onDelete(photo.id)}
        disabled={disabled}
      >
        Delete
      </button>
    </div>
  );
}
