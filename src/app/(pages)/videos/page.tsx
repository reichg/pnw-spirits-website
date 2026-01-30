import VideoList from "@/components/Video/VideoList";
import styles from "./VideosPage.module.css";

export default function VideosPage() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.heading}>All Videos</h1>
        <VideoList />
      </main>
    </div>
  );
}
