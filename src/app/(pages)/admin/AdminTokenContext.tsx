'use client';
import jwt from "jsonwebtoken";
import React, { createContext, useContext, useEffect, useState } from "react";

// Define the shape of the admin token context
type AdminTokenContextType = {
  token: string | null;
  setToken: (token: string | null) => void;
};

type DecodedJWT = { exp: number; [key: string]: unknown };

function isDecodedJWT(obj: unknown): obj is DecodedJWT {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "exp" in obj &&
    typeof (obj as { exp: unknown }).exp === "number"
  );
}

// Single source of truth for admin token validity: present, decodable to an
// object with a numeric `exp`, and not expired.
export function isTokenValid(token: string | null): boolean {
  if (!token) {
    return false;
  }
  try {
    const decoded = jwt.decode(token);
    if (!isDecodedJWT(decoded)) {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp >= now;
  } catch {
    return false;
  }
}

const AdminTokenContext = createContext<AdminTokenContextType | undefined>(
  undefined,
);

export const useAdminToken = () => {
  const context = useContext(AdminTokenContext);
  if (!context) {
    throw new Error("useAdminToken must be used within an AdminTokenProvider");
  }
  return context;
};

export const AdminTokenProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("adminToken");
    }
    return null;
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "adminToken") {
        setToken(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (token === null) {
      // Optionally trigger logout or redirect here
    }
  }, [token]);

  return (
    <AdminTokenContext.Provider value={{ token, setToken }}>
      {children}
    </AdminTokenContext.Provider>
  );
};
