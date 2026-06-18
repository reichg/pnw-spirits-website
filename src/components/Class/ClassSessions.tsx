import styles from "./ClassSessions.module.css";

export type ClassSessionView = {
  id: number;
  startTime: Date | string;
  endTime: Date | string | null;
  location: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export default function ClassSessions({
  sessions,
}: {
  sessions: ClassSessionView[];
}) {
  if (sessions.length === 0) {
    return (
      <p className={styles.empty}>
        No sessions are scheduled right now. Check back soon for new dates.
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {sessions.map((session) => {
        const start = toDate(session.startTime);
        const end = session.endTime ? toDate(session.endTime) : null;
        return (
          <li key={session.id} className={styles.card}>
            <div className={styles.dateBlock}>
              <span className={styles.date}>{dateFormatter.format(start)}</span>
              <span className={styles.time}>
                <time dateTime={start.toISOString()}>
                  {timeFormatter.format(start)}
                </time>
                {end && (
                  <>
                    {" – "}
                    <time dateTime={end.toISOString()}>
                      {timeFormatter.format(end)}
                    </time>
                  </>
                )}
              </span>
            </div>
            {session.location && (
              <span className={styles.location}>{session.location}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
