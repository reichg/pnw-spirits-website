"use client";

import { useCallback, useState } from "react";

export type ContactFormStatus = "idle" | "loading" | "success" | "error";

/** Values collected by the contact form; sent to the server as-is. */
type ContactFormValues = {
  name: string;
  email: string;
  phone: string;
  category: string;
  message: string;
};

const SUCCESS_MESSAGE = "Thanks for reaching out! We'll get back to you soon.";
const ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Owns only the network call and status/message state for the contact form.
 * The server is the source of truth for validation, so no field rules are
 * duplicated here and raw server errors are never surfaced to the user.
 */
export function useContactForm(): {
  status: ContactFormStatus;
  message: string;
  submit: (values: ContactFormValues) => Promise<void>;
  reset: () => void;
} {
  const [status, setStatus] = useState<ContactFormStatus>("idle");
  const [message, setMessage] = useState("");

  const submit = useCallback(async (values: ContactFormValues) => {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      setMessage(SUCCESS_MESSAGE);
    } catch {
      setStatus("error");
      setMessage(ERROR_MESSAGE);
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setMessage("");
  }, []);

  return { status, message, submit, reset };
}
