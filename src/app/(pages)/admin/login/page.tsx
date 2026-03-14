import AdminLogin from "./AdminLogin";
import styles from "./AdminLoginPage.module.css";

export default function AdminLoginPage() {
  return (
    <div className={styles.loginPageContainer}>
      <div className={styles.loginPageContent}>
        <AdminLogin />
      </div>
    </div>
  );
}
