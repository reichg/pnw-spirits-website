"use client";
import { useState } from "react";
import styles from "./SubscribeForm.module.css";

const SubscribeForm = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email }),
      });
      if (!res.ok) throw new Error("Failed to subscribe");
      setStatus("success");
      setMessage("Thank you for subscribing!");
      setFirstName("");
      setLastName("");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Subscription failed. Please try again.");
    }
  };

  return (
    // aria-labelledby, because a <form> only becomes a landmark once it has an
    // accessible name - and the pitch below is the name it already had lying
    // around. This section of the landing page has no heading of its own, so
    // without this the page's only form is unreachable by landmark.
    <form
      className={styles.subscribeForm}
      onSubmit={handleSubmit}
      aria-labelledby="subscribe-heading"
    >
      {/* This was a <label htmlFor="subscribe-firstname">, which made it the
          first field's accessible NAME: a screen reader announced the
          first-name box as "Get the latest recipes & stories:". It is a pitch,
          not a field name, so it names the form and nothing else now. */}
      <p className={styles.subscribeHeading} id="subscribe-heading">
        Get the latest recipes &amp; stories:
      </p>
      <label
        className={styles.subscribeFieldLabel}
        htmlFor="subscribe-firstname"
      >
        First name
      </label>
      <input
        className={styles.subscribeInput}
        id="subscribe-firstname"
        type="text"
        placeholder="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        required
        disabled={status === "loading"}
        autoComplete="given-name"
      />
      <label
        className={styles.subscribeFieldLabel}
        htmlFor="subscribe-lastname"
      >
        Last name
      </label>
      <input
        className={styles.subscribeInput}
        id="subscribe-lastname"
        type="text"
        placeholder="Last name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        required
        disabled={status === "loading"}
        autoComplete="family-name"
      />
      <label className={styles.subscribeFieldLabel} htmlFor="subscribe-email">
        Email address
      </label>
      <input
        className={styles.subscribeInput}
        id="subscribe-email"
        type="email"
        placeholder="Your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={status === "loading"}
        autoComplete="email"
      />
      <button
        className={styles.subscribeBtn}
        type="submit"
        disabled={status === "loading" || !email || !firstName || !lastName}
      >
        {status === "loading" ? "Subscribing..." : "Subscribe"}
      </button>
      {/* Rendered unconditionally and empty when idle, so the live region is
          already in the accessibility tree before its text changes rather than
          being inserted along with it. It used to be `{message && <div>}` with
          no role and no aria-live at all, so NEITHER outcome was announced -
          the visitor heard nothing back from a subscribe that had failed. The
          CSS keeps an empty one at zero cost, gap included.

          role and aria-live follow AdminStatus.tsx, which settled both for this
          codebase and which ContactForm.tsx also follows: a failed write is an
          `alert` (implicitly assertive) because what the visitor does next
          depends on knowing it did not land, everything else is a polite
          `status`, and the politeness is stated alongside the role because
          screen readers honour the implication inconsistently. */}
      <p
        className={styles.subscribeMsg}
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
      >
        {message}
      </p>
    </form>
  );
};

export default SubscribeForm;
