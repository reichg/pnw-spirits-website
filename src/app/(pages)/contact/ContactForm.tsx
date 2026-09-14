"use client";

import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
} from "@/services/contact/contactSchemas";
import { useState } from "react";
import styles from "./ContactForm.module.css";
import { useContactForm } from "./useContactForm";

type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

const ContactForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<ContactCategory>(
    CONTACT_CATEGORIES[0],
  );
  const [message, setMessage] = useState("");

  const { status, message: statusMessage, submit } = useContactForm();
  const isLoading = status === "loading";

  // Clear fields once, only on the edge where the send first succeeds, so a
  // follow-up message the visitor starts typing afterwards is not wiped.
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "success") {
      setName("");
      setEmail("");
      setPhone("");
      setCategory(CONTACT_CATEGORIES[0]);
      setMessage("");
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submit({ name, email, phone, category, message });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="contact-name">
          Name
        </label>
        <input
          className={styles.input}
          id="contact-name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          disabled={isLoading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="contact-email">
          Email
        </label>
        <input
          className={styles.input}
          id="contact-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isLoading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="contact-phone">
          Phone (optional)
        </label>
        <input
          className={styles.input}
          id="contact-phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          disabled={isLoading}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="contact-category">
          Reason for reaching out
        </label>
        <select
          className={styles.select}
          id="contact-category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ContactCategory)}
          required
          disabled={isLoading}
        >
          {CONTACT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CONTACT_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className={`${styles.field} ${styles.fieldWide}`}>
        <label className={styles.label} htmlFor="contact-message">
          Message
        </label>
        <textarea
          className={styles.textarea}
          id="contact-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          disabled={isLoading}
        />
      </div>

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send message"}
        </button>

        {/* Always rendered, and empty until there is something to say: a live
            region has to be in the accessibility tree BEFORE its text changes,
            or the change is an insertion the screen reader may not announce.
            The CSS keeps an empty one at zero height, so it costs no layout.

            role and aria-live follow AdminStatus.tsx, which settled both for
            this codebase: a failed write is an `alert` (implicitly assertive)
            because the visitor's message was not delivered and what they do
            next depends on knowing, everything else is a polite `status`, and
            the politeness is stated alongside the role rather than left
            implicit because screen readers honour the implication
            inconsistently. This form previously announced its FAILURES
            politely, under role="status". */}
        <p
          className={`${styles.status} ${
            status === "error" ? styles.statusError : styles.statusSuccess
          }`}
          role={status === "error" ? "alert" : "status"}
          aria-live={status === "error" ? "assertive" : "polite"}
        >
          {statusMessage}
        </p>
      </div>
    </form>
  );
};

export default ContactForm;
