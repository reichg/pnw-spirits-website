"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminToken } from "../AdminTokenContext";
import styles from "./AdminNewsletterComposer.module.css";

type NewsletterResponse = {
  status?: string;
  totalSubscribers?: number;
  attempted?: number;
  sent?: number;
  failed?: number;
  failures?: Array<{ subscriberId: number; email: string; error: string }>;
  error?: string;
  details?: Array<{ message?: string }>;
};

export default function AdminNewsletterComposer() {
  const { token: adminToken } = useAdminToken();
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<NewsletterResponse | null>(null);

  useEffect(() => {
    if (!adminToken) {
      window.location.href = "/admin/login";
    }
  }, [adminToken]);

  const canSubmit = useMemo(() => {
    const hasBody = html.trim().length > 0 || text.trim().length > 0;
    return subject.trim().length > 0 && hasBody && !loading;
  }, [subject, html, text, loading]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adminToken) return;
    if (!window.confirm("Send this newsletter to all subscribers?")) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          html,
          text: text.trim() || undefined,
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
    } catch {
      setError("Failed to send newsletter");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.adminPageBg}>
      <div className={styles.container}>
        <div className={styles.actionRow}>
          <Link href="/admin" className={styles.adminNavBtn}>
            <button type="button">&#8592; Back to Admin Portal</button>
          </Link>
        </div>

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
            placeholder="Optional if plain text content is provided"
          />

          <label className={styles.label} htmlFor="newsletter-text">
            Plain Text Content (optional)
          </label>
          <textarea
            id="newsletter-text"
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Optional if HTML content is provided"
          />

          {error && <div className={styles.error}>{error}</div>}

          {result && (
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

          <button type="submit" disabled={!canSubmit}>
            {loading ? "Sending..." : "Send To All Subscribers"}
          </button>
        </form>
      </div>
    </div>
  );
}
