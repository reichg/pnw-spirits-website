"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminToken } from "../AdminTokenContext";
import styles from "./AdminNewsletterComposer.module.css";

type NewsletterResponse = {
  status?: string;
  message?: string;
  testRecipient?: string;
  totalSubscribers?: number;
  attempted?: number;
  sent?: number;
  failed?: number;
  failures?: Array<{ subscriberId: number; email: string; error: string }>;
  error?: string;
  details?: Array<{ message?: string }>;
};

const NEWSLETTER_DRAFT_STORAGE_KEY = "admin-newsletter-composer-draft";

type NewsletterDraft = {
  subject: string;
  html: string;
  replyTo: string;
};

export default function AdminNewsletterComposer() {
  const { token: adminToken } = useAdminToken();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [sendingAction, setSendingAction] = useState<"all" | "test" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<NewsletterResponse | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  useEffect(() => {
    // SSR-safe: localStorage is only available on the client, so the draft must
    // be hydrated into state from an effect to avoid a hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const rawDraft = window.localStorage.getItem(
        NEWSLETTER_DRAFT_STORAGE_KEY,
      );
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft) as Partial<NewsletterDraft>;
        if (typeof parsedDraft.subject === "string") {
          setSubject(parsedDraft.subject);
        }
        if (typeof parsedDraft.html === "string") {
          setHtml(parsedDraft.html);
        }
        if (typeof parsedDraft.replyTo === "string") {
          setReplyTo(parsedDraft.replyTo);
        }
      }
    } catch {
      // Ignore invalid local draft payloads.
    } finally {
      setIsDraftLoaded(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;
    const draft: NewsletterDraft = { subject, html, replyTo };
    window.localStorage.setItem(
      NEWSLETTER_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  }, [subject, html, replyTo, isDraftLoaded]);

  useEffect(() => {
    if (!adminToken) {
      window.location.href = "/admin/login";
    }
  }, [adminToken]);

  useEffect(() => {
    if (!success) return;
    const timeoutId = window.setTimeout(() => {
      setSuccess("");
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timeoutId = window.setTimeout(() => {
      setError("");
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  const canSubmit = useMemo(() => {
    return (
      subject.trim().length > 0 && html.trim().length > 0 && !sendingAction
    );
  }, [subject, html, sendingAction]);

  const htmlPreview = useMemo(() => {
    const trimmedHtml = html.trim();
    if (!trimmedHtml) {
      return '<p style="font-family: sans-serif; color: #777;">Newsletter preview appears here as you type HTML.</p>';
    }
    return trimmedHtml;
  }, [html]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await sendNewsletter("all");
  }

  async function handleSendTest() {
    await sendNewsletter("test");
  }

  async function sendNewsletter(mode: "all" | "test") {
    if (!adminToken) return;
    if (
      mode === "all" &&
      !window.confirm("Send this newsletter to all subscribers?")
    ) {
      return;
    }

    setSendingAction(mode);
    setError("");
    setSuccess("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          mode,
          subject: subject.trim(),
          html,
          replyTo: replyTo.trim() || undefined,
        }),
      });

      const data = (await response.json()) as NewsletterResponse;

      if (response.status === 401 || response.status === 403) {
        setError("Your admin session is not valid. Please log in again.");
        setTimeout(() => {
          window.location.href = "/admin/login";
        }, 800);
        return;
      }

      if (!response.ok) {
        const detailMessage = Array.isArray(data.details)
          ? data.details
              .map((detail) => detail.message)
              .filter(Boolean)
              .join(", ")
          : "";
        setError(detailMessage || data.error || "Failed to send newsletter");
        return;
      }

      setResult(data);
      if (mode === "test") {
        setSuccess(
          `Test email sent to ${
            data.testRecipient || "the configured test recipient"
          }.`,
        );
      } else {
        setSuccess("Newsletter send completed.");
      }
    } catch {
      setError(
        mode === "test"
          ? "Failed to send test email"
          : "Failed to send newsletter",
      );
    } finally {
      setSendingAction(null);
    }
  }

  return (
    <div className={styles.adminPageBg}>
      <div className={styles.container}>
        <h2 className={styles.heading}>Send Newsletter</h2>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="newsletter-subject">
            Subject
          </label>
          <input
            id="newsletter-subject"
            className={styles.input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            required
          />

          <label className={styles.label} htmlFor="newsletter-reply-to">
            Reply-To (optional)
          </label>
          <input
            id="newsletter-reply-to"
            className={styles.input}
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="optional@example.com"
          />

          <label className={styles.label} htmlFor="newsletter-html">
            HTML Content
          </label>
          <textarea
            id="newsletter-html"
            className={styles.textarea}
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={10}
            placeholder="Enter newsletter HTML"
            required
          />

          <label className={styles.label} htmlFor="newsletter-preview">
            HTML Preview
          </label>
          <iframe
            id="newsletter-preview"
            title="Newsletter HTML Preview"
            className={styles.previewFrame}
            srcDoc={htmlPreview}
          />

          {error && <div className={styles.error}>{error}</div>}

          {success && (
            <div className={styles.success} role="status" aria-live="polite">
              {success}
            </div>
          )}

          {result && result.status !== "test_sent" && (
            <div className={styles.result} role="status" aria-live="polite">
              <p>Status: {result.status || "success"}</p>
              <p>Total Subscribers: {result.totalSubscribers ?? 0}</p>
              <p>Attempted: {result.attempted ?? 0}</p>
              <p>Sent: {result.sent ?? 0}</p>
              <p>Failed: {result.failed ?? 0}</p>
              {Array.isArray(result.failures) && result.failures.length > 0 && (
                <p>
                  Example failure: {result.failures[0].email} (
                  {result.failures[0].error})
                </p>
              )}
            </div>
          )}

          <div className={styles.buttonRow}>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSendTest}
            >
              {sendingAction === "test" ? "Sending Test..." : "Send Test Email"}
            </button>
            <button type="submit" disabled={!canSubmit}>
              {sendingAction === "all"
                ? "Sending..."
                : "Send To All Subscribers"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
