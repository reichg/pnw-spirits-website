import VideoList from "@/components/Video/VideoList";
import styles from "./VideosPage.module.css";

export default function VideosPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <VideoList />
      </main>
    </div>
  );
}
