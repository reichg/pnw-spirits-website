"use client";
import { useEffect, useState } from "react";
import { FaArrowUp } from "react-icons/fa";
import styles from "./ScrollUpButton.module.css";

const ScrollUpButton = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShow(window.scrollY > 80);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      className={styles.scrollUpButton + (show ? " " + styles.visible : "")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      tabIndex={show ? 0 : -1}
      // ...existing code...
    >
      <FaArrowUp />
    </button>
  );
};

export default ScrollUpButton;
