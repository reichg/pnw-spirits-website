"use client";
import AdminLogin from "../AdminLogin";
import styles from "./AdminLoginPage.module.css";

export default function AdminLoginPage() {
  const handleLogin = (newToken: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("adminToken", newToken);
      window.location.href = "/admin";
    }
  };
  return (
    <div className={styles.loginPageContainer}>
      <div className={styles.loginPageContent}>
        <AdminLogin onLogin={handleLogin} />
      </div>
    </div>
  );
}
