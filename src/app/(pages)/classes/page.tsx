import ClassSessions from "@/components/Class/ClassSessions";
import PhotoAlbum from "@/components/Class/PhotoAlbum";
import { getClassPage } from "@/services/classes/classService";
import type { Metadata } from "next";
import styles from "./ClassesPage.module.css";
import {
  placeholderClass,
  placeholderSessions,
  placeholderPhotos,
} from "./placeholderClassData";

export const metadata: Metadata = {
  title: "Cocktail Classes | PNW Spirits",
  description:
    "Join a PNW Spirits cocktail class. See upcoming dates and browse photos from past sessions.",
};

// Serves live, admin-editable singleton content read from the database, so it
// must render per-request rather than being statically prerendered at build
// time (build environments have no database connection).
export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const { class: cocktailClass, sessions, photos } = await getClassPage();

  if (!cocktailClass) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <p className={styles.previewNote}>
            Preview — sample content shown until classes are published.
          </p>
          <h1 className={styles.heading}>{placeholderClass.title}</h1>
          <p className={styles.intro}>{placeholderClass.description}</p>

          <section
            className={styles.section}
            aria-labelledby="upcoming-heading"
          >
            <h2 id="upcoming-heading" className={styles.sectionHeading}>
              Upcoming Sessions
            </h2>
            <ClassSessions sessions={placeholderSessions} />
          </section>

          <section className={styles.section} aria-labelledby="album-heading">
            <h2 id="album-heading" className={styles.sectionHeading}>
              From Past Classes
            </h2>
            <PhotoAlbum photos={placeholderPhotos} preview />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.heading}>{cocktailClass.title}</h1>
        <p className={styles.intro}>{cocktailClass.description}</p>

        <section className={styles.section} aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className={styles.sectionHeading}>
            Upcoming Sessions
          </h2>
          <ClassSessions sessions={sessions} />
        </section>

        <section className={styles.section} aria-labelledby="album-heading">
          <h2 id="album-heading" className={styles.sectionHeading}>
            From Past Classes
          </h2>
          <PhotoAlbum photos={photos} />
        </section>
      </main>
    </div>
  );
}
