import { notFound } from "next/navigation";

import styles from "../../admin.module.css";
import { readCalibrationSessions } from "../../adminData";
import { BenchFrame } from "./BenchFrame";

export const dynamic = "force-dynamic";

/**
 * The bench inside the admin shell. The renderer emits a complete document with its own
 * papyrus theme and its own scripts, so it is embedded in a frame rather than inlined:
 * inlining would put two stylesheets in one document and let each rewrite the other.
 * The frame's source is the sibling raw route, which gates itself independently.
 */
export default async function BenchPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!/^[a-z0-9-]+$/.test(section)) notFound();

  const session = readCalibrationSessions().find((s) => s.sectionId === section);

  return (
    <>
      <BenchFrame
        src={`/admin/bench/${section}/raw`}
        title={`Comparison bench for ${session?.currentHeading ?? section}`}
        className={styles.benchFrame}
      />

      {session?.rulings.length ? (
        <section className={styles.benchRulings} aria-labelledby="bench-rulings-heading">
          <header className={styles.benchRulingsHeader}>
            <div>
              <p className={styles.eyebrow}>Decision record</p>
              <h2 id="bench-rulings-heading">Author rulings</h2>
              <p>
                These decisions explain why the approved branch won and which
                obligations now govern later revisions.
              </p>
            </div>
            <dl className={styles.benchRulingStats}>
              <div>
                <dt>Rulings</dt>
                <dd>{session.rulings.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Generations</dt>
                <dd>{session.generations.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Findings</dt>
                <dd>{session.findings.length.toLocaleString()}</dd>
              </div>
            </dl>
          </header>

          {session.rulesDerived.length ? (
            <div className={styles.benchDerivedRules}>
              <span>Rules derived</span>
              <div>
                {session.rulesDerived.map((rule) => (
                  <code key={rule}>{rule}</code>
                ))}
              </div>
            </div>
          ) : null}

          <ol className={styles.benchRulingList}>
            {session.rulings.map((ruling, index) => (
              <li key={ruling.question ?? index}>
                <span className={styles.benchRulingNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className={styles.benchRulingBody}>
                  <div className={styles.benchRulingMeta}>
                    {ruling.scope ? <span>{ruling.scope} scope</span> : null}
                    {ruling.by ? <span>Decided by {ruling.by}</span> : null}
                  </div>
                  {ruling.question ? <h3>{ruling.question}</h3> : null}
                  {ruling.decision ?? ruling.ruling ? (
                    <p className={styles.benchDecision}>
                      {ruling.decision ?? ruling.ruling}
                    </p>
                  ) : null}
                  {ruling.rationale ?? ruling.occasion ? (
                    <p className={styles.benchRationale}>
                      {ruling.rationale ?? ruling.occasion}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
