import Link from "next/link";
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

// Dates arrive serialized across the RSC boundary, so they are normalized
// before formatting.
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * The class schedule, as a dated index list.
 *
 * NO CLIENT STATE, AND THAT IS THE POINT OF THE CURRENT SHAPE. Each row used to
 * be a <button> that opened a Modal, and the Modal rendered the same three
 * values - date, time, location - the row already showed. Removing it deletes a
 * dialog, a focus trap, a piece of state and a click, and turns this component
 * back into plain server markup. A session dialog only earns its place if a
 * session gains content of its own (a price, a capacity, a booking link), which
 * is a schema change rather than a design one.
 *
 * The props contract is unchanged: this still takes `sessions` and nothing else,
 * and ClassSessionView is still the type the page reads.
 */
export default function ClassSessions({
  sessions,
}: {
  sessions: ClassSessionView[];
}) {
  // Absence of dates is information the reader came for, so the section
  // delivers it and hands over the alternative path in the same sentence. An
  // inline link rather than a second button: the page has exactly one filled
  // CTA and it closes the page.
  if (sessions.length === 0) {
    return (
      <p className={styles.empty}>
        <span>
          No dates are on the calendar right now &mdash;{" "}
          <Link className={styles.emptyLink} href="/contact">
            tell us what you have in mind
          </Link>{" "}
          and we&rsquo;ll build one around it.
        </span>
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {sessions.map((session) => {
        const start = toDate(session.startTime);
        const end = session.endTime ? toDate(session.endTime) : null;
        return (
          <li key={session.id} className={styles.row}>
            <p className={styles.date}>{dateFormatter.format(start)}</p>
            {/* The wrapper is load-bearing at two widths in opposite ways: it
                dissolves (display: contents) on the two-up so the time and the
                location can take different tracks, and it comes back below
                900px to carry them as one separated strip. */}
            <div className={styles.meta}>
              <p className={styles.time}>
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
              </p>
              {session.location && (
                <p className={styles.location}>{session.location}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
