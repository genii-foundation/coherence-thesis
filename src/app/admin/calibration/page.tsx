import styles from "../admin.module.css";
import { readCalibrationRows, readCalibrationSessions, readRuleUsage } from "../adminData";

export const dynamic = "force-dynamic";

export default function CalibrationPage() {
  const sessions = readCalibrationSessions();
  const records = readCalibrationRows();
  const usage = readRuleUsage();
  const unused = usage.filter((rule) => rule.citations === 0);
  const quiet = records.length - sessions.length;

  return (
    <>
      <h1 className={styles.h1}>Calibration sessions</h1>
      <p className={styles.sub}>
        The {sessions.length} occasions a ruling was made or a rule was derived. The other{" "}
        {quiet} records are sections re-rendered under rules that already existed. They are
        evidence, not sessions, and they live on <a href="/admin/progress/">Progress</a>.
      </p>

      {sessions.map((session) => (
        <div className={styles.card} style={{ marginBottom: 16 }} key={session.sectionId}>
          <h2>
            {session.currentHeading}
            {session.heading !== session.currentHeading ? (
              <span className={styles.detail}> was {session.heading}</span>
            ) : null}
          </h2>
          <p className={styles.detail}>
            {session.settled || "open"} &middot; {session.editorialId.replace("volume-", "volume ")}{" "}
            &middot; {session.generations} generation{session.generations === 1 ? "" : "s"} &middot;{" "}
            {session.findings.length} finding{session.findings.length === 1 ? "" : "s"}
          </p>

          {session.rulesDerived.length ? (
            <p style={{ marginTop: 10 }}>
              <span className={styles.detail}>Rules derived here: </span>
              {session.rulesDerived.map((rule) => (
                <span className={styles.id} key={rule} style={{ marginRight: 6 }}>
                  {rule}
                </span>
              ))}
            </p>
          ) : null}

          {session.rulings.map((ruling, index) => (
            <div key={ruling.question ?? index} style={{ marginTop: 12 }}>
              {ruling.question ? <p style={{ fontWeight: 600 }}>{ruling.question}</p> : null}
              {ruling.decision ?? ruling.ruling ? <p>{ruling.decision ?? ruling.ruling}</p> : null}
              {ruling.rationale ?? ruling.occasion ? (
                <p className={styles.detail}>{ruling.rationale ?? ruling.occasion}</p>
              ) : null}
              {ruling.scope || ruling.by ? (
                <p className={styles.detail}>
                  {[ruling.scope && `${ruling.scope} scope`, ruling.by && `decided by ${ruling.by}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ))}

          <p className={styles.detail} style={{ marginTop: 12 }}>
            {session.benchable ? (
              <a href={`/admin/bench/${session.sectionId}`}>Open the bench</a>
            ) : (
              <span>
                No bench. This session recorded a ruling without generating variants, so there
                is nothing to compare side by side.
              </span>
            )}
          </p>
        </div>
      ))}

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
