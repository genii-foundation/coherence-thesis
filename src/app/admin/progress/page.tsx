import styles from "../admin.module.css";
import { readAllProgress } from "../adminData";

export const dynamic = "force-dynamic";

export default function ProgressPage() {
  const volumes = readAllProgress();

  return (
    <>
      <h1 className={styles.h1}>Re-render progress</h1>
      <p className={styles.sub}>
        A section counts as settled when a calibration record exists for it with status settled.
        Derived on every request, so this cannot drift from the repository the way a hand
        maintained checklist does.
      </p>

      {volumes.map((v) => (
        <section key={v.editorialId} style={{ marginBottom: 30 }}>
          <p className={styles.micro}>
            {v.editorialId} &middot; {v.settled} of {v.total} settled &middot; {v.percent}% &middot;{" "}
            {v.settledWords.toLocaleString()} of {v.totalWords.toLocaleString()} baseline words
          </p>
          <div className={styles.bar2}>
            <div className={styles.fill} style={{ width: `${v.percent}%` }} />
          </div>
          {v.editorialId === "volume-01" ? (
            <div className={styles.sections}>
              {v.sections.map((s) => (
                <div className={styles.section} key={s.sectionId}>
                  <span className={styles.id}>{s.index}</span>
                  <span className={s.settled ? styles.done : styles.todo}>
                    {s.settled ? "✓" : "·"}
                  </span>
                  <span className={s.settled ? undefined : styles.todo}>{s.heading}</span>
                  <span className={styles.words}>{s.words ? `${s.words} w` : ""}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
