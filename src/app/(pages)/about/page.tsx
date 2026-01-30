import styles from "./AboutPage.module.css";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.heading}>About PNW Spirits</h1>
        <p className={styles.text}>
          PNW Spirits is dedicated to sharing the best cocktails, stories, and
          videos from the Pacific Northwest. Our mission is to create a cozy,
          professional, and speakeasy-inspired online lounge for cocktail
          enthusiasts.
        </p>
      </main>
    </div>
  );
}
