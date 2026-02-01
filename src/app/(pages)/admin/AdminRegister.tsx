"use client";
import { useState } from "react";
import styles from "./AdminRegister.module.css";

export default function AdminRegister({
  onRegister,
}: {
  onRegister?: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setUsername("");
        setEmail("");
        setPassword("");
        if (onRegister) onRegister();
      } else {
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Registration failed");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <h2 className={styles.heading}>Create Admin Account</h2>
      <div className={styles.field}>
        <label className={styles.label}>
          Username
          <br />
          <input
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>
          Email
          <br />
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>
          Password
          <br />
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>Admin account created!</div>}
      <button type="submit" disabled={loading} className={styles.button}>
        {loading ? "Creating..." : "Create Admin"}
      </button>
    </form>
  );
}
