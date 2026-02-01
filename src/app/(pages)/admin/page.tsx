"use client";
import { useEffect, useState } from "react";
import AdminBlogList from "./AdminBlogList";
import AdminLogin from "./AdminLogin";
import styles from "./AdminPage.module.css";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  // Load token from localStorage on mount (client only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      queueMicrotask(() => setToken(localStorage.getItem("adminToken")));
      // Listen for token changes in other tabs
      const syncToken = () => setToken(localStorage.getItem("adminToken"));
      window.addEventListener("storage", syncToken);
      return () => window.removeEventListener("storage", syncToken);
    }
  }, []);

  const handleLogin = (newToken: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("adminToken", newToken);
      setToken(newToken);
    }
  };

  if (!token) {
    return (
      <div className={styles.adminPage}>
        <div className={styles.adminCard}>
          <div className={styles.adminCardContent}>
            {showRegister ? (
              <>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => setShowRegister(false)}
                  >
                    Back to Login
                  </button>
                </div>
              </>
            ) : (
              <>
                <AdminLogin onLogin={handleLogin} />
                <div className={styles.actionRow}>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.adminPage}>
      <div className={styles.adminCard}>
        <div className={styles.adminCardContent}>
          <div className={styles.adminTitle}>Admin: Manage Blogs</div>
          <AdminBlogList adminToken={token} />
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("adminToken");
                  setToken(null);
                }
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
