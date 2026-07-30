import styles from "../admin.module.css";
import { readCalibrationRows, readCalibrationSessions, readRuleUsage } from "../adminData";

export const dynamic = "force-dynamic";

export default function CalibrationPage() {
  const all = readCalibrationSessions();
  // Only sessions the author ruled on. A ruling the agent made alone is a working note,
  // not a decision, and mixing the two made six working notes look like six decisions.
  const sessions = all.filter((session) => session.authored);
  const usage = readRuleUsage().slice().sort((a, b) => b.citations - a.citations);
  const records = readCalibrationRows();

  return (
    <>
      <h1 className={styles.h1}>Calibration</h1>
      <p className={styles.sub}>
        Where the editorial standard comes from. {sessions.length} session
        {sessions.length === 1 ? "" : "s"} the author ruled on, and the obligations they
        produced. A further {all.length - sessions.length} rulings were made by the agent
        alone and stay in the records, because an unattended ruling is a working note.
      </p>

      <div className={styles.tiles}>
        {sessions.map((session) => (
          <a className={styles.tile} href={`/admin/bench/${session.sectionId}`} key={session.sectionId}>
            <span className={styles.tileName}>{session.currentHeading}</span>
            <span className={styles.tileMeta}>
              {session.settled} &middot; {session.rulings.length} rulings &middot;{" "}
              {session.generations} variants &middot; {session.rulesDerived.length} rules
            </span>
          </a>
        ))}
      </div>

      <p className={styles.micro}>
        {usage.length} obligations &middot; cited across {records.length} records
      </p>
      <div className={styles.rows}>
        {usage.map((rule) => (
          <div className={styles.row} key={rule.id} style={{ gridTemplateColumns: "180px 50px 1fr" }}>
            <span className={styles.id}>{rule.id}</span>
            <span className={rule.citations ? styles.ok : styles.bad}>{rule.citations}</span>
            <span className={styles.detail}>{rule.obligation}</span>
          </div>
        ))}
      </div>
    </>
  );
}
