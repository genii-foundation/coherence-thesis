import styles from "../admin.module.css";
import { readCalibrationRows, readRuleUsage } from "../adminData";

export const dynamic = "force-dynamic";

export default function CalibrationPage() {
  const rows = readCalibrationRows();
  const usage = readRuleUsage();
  const findings = rows.reduce((total, row) => total + row.findings.length, 0);
  const open = rows.filter((row) => row.status !== "settled");
  const unused = usage.filter((rule) => rule.citations === 0);

  const volumes = [...new Set(rows.map((row) => row.editorialId))].sort();

  return (
    <>
      <h1 className={styles.h1}>Calibration bench</h1>
      <p className={styles.sub}>
        Every section calibrated against its immutable baseline. {rows.length} records,{" "}
        {findings} findings, {open.length} still open. A record is the durable evidence for
        one section; the bench is the disposable side by side view of it.
      </p>

      {volumes.map((editorialId) => {
        const forVolume = rows.filter((row) => row.editorialId === editorialId);
        return (
          <div key={editorialId} style={{ marginBottom: 28 }}>
            <p className={styles.micro}>
              {editorialId.replace("volume-", "Volume ")} &middot; {forVolume.length} records
            </p>
            <div className={styles.rows}>
              {forVolume.map((row) => (
                <div
                  className={styles.row}
                  key={row.sectionId}
                  style={{ gridTemplateColumns: "18px 1fr 90px 150px" }}
                >
                  <span className={row.status === "settled" ? styles.ok : styles.bad}>
                    {row.status === "settled" ? "✓" : "○"}
                  </span>
                  <span>
                    {row.currentHeading}
                    {row.heading !== row.currentHeading ? (
                      <span className={styles.detail}> was {row.heading}</span>
                    ) : null}
                    {row.openQuestions ? (
                      <span className={styles.detail}> &middot; {row.openQuestions} open question
                        {row.openQuestions === 1 ? "" : "s"}</span>
                    ) : null}
                    {row.ledgerItems.length ? (
                      <span className={styles.detail}> &middot; {row.ledgerItems.join(", ")}</span>
                    ) : null}
                  </span>
                  <span className={styles.detail}>
                    {row.findings.length} finding{row.findings.length === 1 ? "" : "s"}
                  </span>
                  <span className={styles.detail}>
                    <a href={`/admin/bench/${row.sectionId}`}>
                      {row.benchRendered ? "open bench" : "render bench"}
                    </a>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <p className={styles.micro}>Rule usage</p>
      <div className={styles.card} style={{ marginBottom: 16 }}>
        <p>
          Each named obligation in <span className={styles.cmd}>editorial/method/standard.md</span>{" "}
          paired with the findings that cite it. A rule no record has ever invoked is either dead
          or unenforced, which is the one thing this list can tell you that reading the standard
          cannot.{" "}
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

      <p className={styles.detail} style={{ marginTop: 20 }}>
        Render one bench with{" "}
        <span className={styles.cmd}>npm run editorial:compare -- --section &lt;section-id&gt;</span>.
        Output lands in <span className={styles.cmd}>generated/calibration/</span>, which is
        disposable and never committed.
      </p>
    </>
  );
}
