import styles from "../admin.module.css";
import { readProtectedLineViolations, readRules } from "../adminData";

export const dynamic = "force-dynamic";

export default function GatesPage() {
  const { checked, violations } = readProtectedLineViolations();
  const rules = readRules();

  return (
    <>
      <h1 className={styles.h1}>Gates</h1>
      <p className={styles.sub}>
        Editorial obligations that a machine can check. Anything red here is a claim the repository
        makes about itself that is currently false.
      </p>

      <p className={styles.micro}>Protected lines</p>
      <div className={styles.card} style={{ marginBottom: 24 }}>
        <p>
          A voice card names its protected passages in exact quotation, which makes the strongest
          section of the card mechanically checkable.{" "}
          <span className={violations.length ? styles.bad : styles.ok}>
            {checked - violations.length} of {checked} present.
          </span>
        </p>
        {violations.length ? (
          <div className={styles.sections}>
            {violations.map((v) => (
              <div className={styles.section} key={`${v.editorialId}-${v.line}`}>
                <span className={styles.id}>{v.editorialId.replace("volume-", "")}</span>
                <span className={styles.bad}>✗</span>
                <span>&ldquo;{v.line}&rdquo;</span>
                <span />
              </div>
            ))}
          </div>
        ) : null}
        <p className={styles.detail}>
          Run locally with <span className={styles.cmd}>npm run editorial:protected-lines</span>.
          Not yet wired into <span className={styles.cmd}>npm run validate</span>, because it would
          block every run while these remain missing.
        </p>
      </div>

      <p className={styles.micro}>Rules in force</p>
      <div className={styles.rows}>
        {rules.map((r) => (
          <div className={styles.row} key={r.id} style={{ gridTemplateColumns: "180px 1fr" }}>
            <span className={styles.id}>{r.id}</span>
            <span>{r.obligation}</span>
          </div>
        ))}
      </div>
    </>
  );
}
