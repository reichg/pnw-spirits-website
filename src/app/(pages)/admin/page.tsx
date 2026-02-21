"use client";
import jwt from "jsonwebtoken";
import { useEffect, useState } from "react";
import AdminBlogList from "./AdminBlogList";
import styles from "./AdminPage.module.css";
import { AdminTokenProvider } from "./AdminTokenContext";
import stylesExpiry from "./TokenExpiry.module.css";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  // Helper to decode JWT expiry
  function getTokenExpiry(token: string | null): string | null {
    if (!token) return null;
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      if (decoded && decoded.exp) {
        const date = new Date(decoded.exp * 1000);
        return date.toLocaleString();
      }
    } catch {}
    return null;
  }

  const expiryDisplay = getTokenExpiry(token);

  // Load token from localStorage on mount (client only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkToken = () => {
        const t = localStorage.getItem("adminToken");
        if (!t) {
          window.location.href = "/admin/login";
          return;
        }
        // Check expiry
        try {
          const decoded = jwt.decode(t) as jwt.JwtPayload;
          if (decoded && decoded.exp && Date.now() >= decoded.exp * 1000) {
            localStorage.removeItem("adminToken");
            window.location.href = "/admin/login";
            return;
          }
        } catch {}
        setToken(t);
      };
      queueMicrotask(checkToken);
      // Listen for token changes in other tabs
      const syncToken = () => checkToken();
      window.addEventListener("storage", syncToken);
      return () => window.removeEventListener("storage", syncToken);
    }
  }, []);

  return (
    <AdminTokenProvider>
      <div className={styles.adminPage}>
        <div className={stylesExpiry.tokenExpiry}>
          {expiryDisplay ? (
            <>
              Token expires: <b>{expiryDisplay}</b>
            </>
          ) : (
            <>Token expiry unknown</>
          )}
        </div>
        <div className={styles.adminCard}>
          <div className={styles.adminCardContent}>
            <div className={styles.adminTitle}>Admin: Manage Blogs</div>
            <AdminBlogList />
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("adminToken");
                    setToken(null);
                    window.location.href = "/admin/login";
                  }
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminTokenProvider>
  );
}
