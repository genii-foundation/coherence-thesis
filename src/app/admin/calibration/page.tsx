import styles from "../admin.module.css";
import { readCalibrationRows, readCalibrationSessions, readRuleUsage } from "../adminData";

export const dynamic = "force-dynamic";

export default function CalibrationPage() {
  const all = readCalibrationSessions();
  // Only sessions the author ruled on. A ruling the agent made alone is a working note,
  // not a decision, and mixing the two made six working notes look like six decisions.
  const sessions = all.filter((session) => session.authored);
  const agentOnly = all.length - sessions.length;
  const records = readCalibrationRows();
  const usage = readRuleUsage();
  const unused = usage.filter((rule) => rule.citations === 0);
  const quiet = records.length - sessions.length;

  return (
    <>
      <h1 className={styles.h1}>Calibration sessions</h1>
      <p className={styles.sub}>
        The {sessions.length} occasion{sessions.length === 1 ? "" : "s"} the author ruled.
        Everything the standard binds traces back to {sessions.length === 1 ? "this one" : "these"}.
        {agentOnly ? (
          <>
            {" "}
            A further {agentOnly} ruling{agentOnly === 1 ? " was" : "s were"} settled by the
            editorial agent alone and {agentOnly === 1 ? "is" : "are"} held in the records
            rather than shown here, because an unattended ruling is a working note and not a
            decision.
          </>
        ) : null}{" "}
        The other {quiet} records are sections re-rendered under rules that already existed,
        and they live on <a href="/admin/progress/">Progress</a>.
      </p>

      <div className={styles.tiles}>
        {sessions.map((session) => (
          <a className={styles.tile} href={`/admin/bench/${session.sectionId}`} key={session.sectionId}>
            <span className={styles.tileName}>{session.currentHeading}</span>
            <span className={styles.tileMeta}>
              {session.settled || "open"} &middot; {session.rulings.length} ruling
              {session.rulings.length === 1 ? "" : "s"}
              {session.generations > 1 ? ` · ${session.generations} variants` : ""}
            </span>
            {session.rulesDerived.length ? (
              <span className={styles.tileRules}>
                {session.rulesDerived.slice(0, 3).map((rule) => (
                  <span className={styles.id} key={rule}>
                    {rule}
                  </span>
                ))}
                {session.rulesDerived.length > 3 ? (
                  <span className={styles.tileMeta}>+{session.rulesDerived.length - 3}</span>
                ) : null}
              </span>
            ) : null}
          </a>
        ))}
      </div>

      <p className={styles.micro}>Rule usage</p>
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <p>
          Every named obligation paired with the findings that cite it, across all{" "}
          {records.length} records rather than the sessions alone. A rule at zero is either
          dead or unenforced.{" "}
          <span className={unused.length ? styles.bad : styles.ok}>
            {usage.length - unused.length} of {usage.length} cited.
          </span>
        </p>
      </div>
      <div className={styles.rows}>
        {usage
          .slice()
          .sort((a, b) => b.citations - a.citations)
          .map((rule) => (
            <div className={styles.row} key={rule.id} style={{ gridTemplateColumns: "180px 60px 1fr" }}>
              <span className={styles.id}>{rule.id}</span>
              <span className={rule.citations ? styles.ok : styles.bad}>{rule.citations}</span>
              <span className={styles.detail}>{rule.obligation}</span>
            </div>
          ))}
      </div>
    </>
  );
}
