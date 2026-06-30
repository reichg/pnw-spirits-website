"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
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
  // A single Modal instance is driven by the selected session; clicking a card
  // sets it, closing clears it. Dates arrive serialized across the RSC boundary,
  // so toDate normalizes them before formatting.
  const [selected, setSelected] = useState<ClassSessionView | null>(null);

  if (sessions.length === 0) {
    return (
      <p className={styles.empty}>
        No sessions are scheduled right now. Check back soon for new dates.
      </p>
    );
  }

  const selectedStart = selected ? toDate(selected.startTime) : null;
  const selectedEnd = selected?.endTime ? toDate(selected.endTime) : null;

  return (
    <>
      <ul className={styles.list}>
        {sessions.map((session) => {
          const start = toDate(session.startTime);
          const end = session.endTime ? toDate(session.endTime) : null;
          return (
            <li key={session.id} className={styles.card}>
              <button
                type="button"
                className={styles.trigger}
                onClick={() => setSelected(session)}
              >
                <span className={styles.dateBlock}>
                  <span className={styles.date}>
                    {dateFormatter.format(start)}
                  </span>
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
                </span>
                {session.location && (
                  <span className={styles.location}>{session.location}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        label="Session details"
      >
        {selected && selectedStart && (
          <div className={styles.modalBody}>
            <p className={styles.modalDate}>
              {dateFormatter.format(selectedStart)}
            </p>
            <p className={styles.modalTime}>
              <time dateTime={selectedStart.toISOString()}>
                {timeFormatter.format(selectedStart)}
              </time>
              {selectedEnd && (
                <>
                  {" – "}
                  <time dateTime={selectedEnd.toISOString()}>
                    {timeFormatter.format(selectedEnd)}
                  </time>
                </>
              )}
            </p>
            {selected.location && (
              <p className={styles.modalLocation}>{selected.location}</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
