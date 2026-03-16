"use client";

import jwt from "jsonwebtoken";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./AdminLanding.module.css";
import { useAdminToken } from "./AdminTokenContext";

type DecodedJWT = { exp: number; [key: string]: unknown };

function isDecodedJWT(obj: unknown): obj is DecodedJWT {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "exp" in obj &&
    typeof (obj as { exp: unknown }).exp === "number"
  );
}

function AdminLanding() {
  const router = useRouter();
  const { token } = useAdminToken();

  useEffect(() => {
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    try {
      const decoded = jwt.decode(token);
      if (!isDecodedJWT(decoded)) {
        router.replace("/admin/login");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        router.replace("/admin/login");
        return;
      }
    } catch {
      router.replace("/admin/login");
    }
  }, [token, router]);

  return (
    <div className={styles.adminLandingBg}>
      <div className={styles.container}>
        <h1 className={styles.heading}>Admin Portal</h1>
        <div className={styles.adminNavLinks}>
          <Link href="/admin/blogs" className={styles.adminNavBtn}>
            <button>Manage Blogs</button>
          </Link>
          <Link href="/admin/recipes" className={styles.adminNavBtn}>
            <button>Manage Recipes</button>
          </Link>
          <Link href="/admin/newsletter" className={styles.adminNavBtn}>
            <button>Send Newsletter</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AdminLanding;
