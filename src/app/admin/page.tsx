import styles from "./admin.module.css";
import {
  readAllProgress,
  readProtectedLineViolations,
  readRules,
  readTasks,
} from "./adminData";

export const dynamic = "force-dynamic";

export default function AdminOverview() {
  const register = readTasks();
  const progress = readAllProgress();
  const gates = readProtectedLineViolations();
  const rules = readRules();

  const volumeOne = progress.find((p) => p.editorialId === "volume-01");
  const open = register.tasks.filter((t) => t.status !== "done");
  const green = open.filter((t) => t.tier === "green" && t.status !== "blocked");
  const blocked = open.filter((t) => t.status === "blocked");

  return (
    <>
      <h1 className={styles.h1}>Editorial admin</h1>
      <p className={styles.sub}>
        Everything here is derived from repository state at request time, so it cannot show progress
        the repository does not have. Read only: durable editorial state changes through an explicit
        command and a reviewed diff, never from this surface.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <p className={styles.micro}>Volume I re-render</p>
          <div className={styles.bignum}>
            {volumeOne ? `${volumeOne.settled}/${volumeOne.total}` : "n/a"}
          </div>
          {volumeOne ? (
            <>
              <div className={styles.bar2}>
                <div className={styles.fill} style={{ width: `${volumeOne.percent}%` }} />
              </div>
              <p>
                {volumeOne.percent}% of sections settled,{" "}
                {volumeOne.settledWords.toLocaleString()} of{" "}
                {volumeOne.totalWords.toLocaleString()} baseline words
              </p>
            </>
          ) : (
            <p>No baseline found.</p>
          )}
        </div>

        <div className={styles.card}>
          <p className={styles.micro}>Task queue</p>
          <div className={styles.bignum}>{green.length}</div>
          <p>
            green items ready to run unattended. {open.length} open in total,{" "}
            {blocked.length} blocked.
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.micro}>Protected lines</p>
          <div className={`${styles.bignum} ${gates.violations.length ? styles.bad : styles.ok}`}>
            {gates.checked - gates.violations.length}/{gates.checked}
          </div>
          <p>
            {gates.violations.length
              ? `${gates.violations.length} declared lines missing from their manuscripts.`
              : "Every declared line is present."}
          </p>
        </div>

        <div className={styles.card}>
          <p className={styles.micro}>Rules in force</p>
          <div className={styles.bignum}>{rules.length}</div>
          <p>Named obligations in the standard, each traceable to the passage that produced it.</p>
        </div>
      </div>
    </>
  );
}
