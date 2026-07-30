import { notFound } from "next/navigation";

import styles from "../../admin.module.css";
import { readCalibrationSessions } from "../../adminData";

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
      <p className={styles.micro}>
        <a href="/admin/calibration/">Calibration sessions</a>
      </p>
      <h1 className={styles.h1}>{session?.currentHeading ?? section}</h1>
      {session ? (
        <p className={styles.sub}>
          {session.settled || "open"} &middot;{" "}
          {session.editorialId.replace("volume-", "volume ")} &middot; {session.generations}{" "}
          generation{session.generations === 1 ? "" : "s"} &middot; {session.findings.length}{" "}
          finding{session.findings.length === 1 ? "" : "s"}
          {session.rulesDerived.length ? (
            <>
              {" "}
              &middot; derived{" "}
              {session.rulesDerived.map((rule) => (
                <span className={styles.id} key={rule} style={{ marginRight: 4 }}>
                  {rule}
                </span>
              ))}
            </>
          ) : null}
        </p>
      ) : null}

      {session?.rulings.map((ruling, index) => (
        <div className={styles.card} style={{ marginBottom: 12 }} key={ruling.question ?? index}>
          {ruling.question ? <h2>{ruling.question}</h2> : null}
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

      <iframe
        src={`/admin/bench/${section}/raw`}
        title={`Comparison bench for ${session?.currentHeading ?? section}`}
        className={styles.benchFrame}
      />
    </>
  );
}
