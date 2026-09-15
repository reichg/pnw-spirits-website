import ClassSessions from "@/components/Class/ClassSessions";
import PhotoAlbum from "@/components/Class/PhotoAlbum";
import { getClassPageView } from "@/services/classes/classService";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./ClassesPage.module.css";

export const metadata: Metadata = {
  title: "Cocktail Classes | The PNW Spirits",
  description:
    "Join a PNW Spirits cocktail class. See upcoming dates and browse photos from past sessions.",
};

// Serves live, admin-editable singleton content read from the database, so it
// must render per-request rather than being statically prerendered at build
// time (build environments have no database connection).
export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const { class: cocktailClass, sessions, photos } = await getClassPageView();

  const title = cocktailClass?.title ?? "Cocktail Classes";

  // <main> IS the editorial shell, so every block below is a direct child of it
  // and lands on the shared 1200px spine. An element between <main> and these
  // blocks would cancel that spine for everything under it.
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {/* Static: the singleton carries a title and a description and no
            kicker, so the eyebrow is authored here as it is on all three
            landing pages. It names the register rather than repeating the
            admin-editable title beneath it. */}
        <p className={styles.eyebrow}>Behind the Bar</p>
        <h1 className={styles.title}>{title}</h1>
        {cocktailClass?.description && (
          <p className={styles.intro}>{cocktailClass.description}</p>
        )}
      </header>

      <section className={styles.section} aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className={styles.sectionHeading}>
          Upcoming Sessions
        </h2>
        <ClassSessions sessions={sessions} />
      </section>

      {/* Omitted entirely when the album is empty - no heading, no rule, no
          empty message. The asymmetry with the schedule above is deliberate: a
          missing schedule is the answer the reader came for and has to be
          stated, while a missing gallery is a non-event, and the old copy
          ("Photos from past classes will appear here after our next session")
          spent a whole section of vertical space promising a future. The guard
          is here rather than in PhotoAlbum because the heading and the section
          bracket belong to the page; PhotoAlbum keeps its own internal empty
          guard as a defensive fallback. */}
      {photos.length > 0 && (
        <section className={styles.section} aria-labelledby="album-heading">
          <h2 id="album-heading" className={styles.sectionHeading}>
            From Past Classes
          </h2>
          <PhotoAlbum photos={photos} />
        </section>
      )}

      <div className={styles.closeRow}>
        <Link className={styles.closeButton} href="/contact">
          Hire The PNW Spirits
        </Link>
      </div>
    </main>
  );
}
