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
    <form className={styles.subscribeForm} onSubmit={handleSubmit}>
      <label className={styles.subscribeLabel} htmlFor="subscribe-firstname">
        Get the latest recipes & stories:
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
      {message && <div className={styles.subscribeMsg}>{message}</div>}
    </form>
  );
};

export default SubscribeForm;
