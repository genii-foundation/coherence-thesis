import { CopyPromptButton } from "../CopyPromptButton";
import styles from "../admin.module.css";
import { readCalibrationSessions } from "../adminData";

export const dynamic = "force-dynamic";

// The prompt stops at presenting the variants. An agent that derives options and then
// records its own decision has held a session with itself, which is how six records in
// this repository came to carry rulings nobody made.
const NEW_SESSION_PROMPT = [
  "/coherence-editorial-calibration Open a revision session for <section-id>.",
  " Read editorial/method/standard.md and the volume's voice card, then derive variants",
  " from the immutable baseline rather than from the shipped text, and render the bench",
  " with npm run editorial:compare -- --section <section-id>.",
  " Then present the variants with what each one changes and why, and stop.",
  " Do not record a ruling: the ruling is mine to make.",
  " Once I have chosen, record it with by set to author, its scope, and the occasion,",
  " and promote any corpus scoped ruling into a named obligation in the standard.",
].join("");

export default function EditorialRevisionsPage() {
  const all = readCalibrationSessions();
  const sessions = all.filter((session) => session.authored);
  const agentOnly = all.length - sessions.length;

  return (
    <>
      <h1 className={styles.h1}>Editorial revisions</h1>

      <div className={styles.startRow}>
        <CopyPromptButton label="Start a revision" prompt={NEW_SESSION_PROMPT} />
        <span className={styles.detail}>
          Or select any passage while reading. Both copy a prompt for an agent session.
        </span>
      </div>

      <p className={styles.micro}>
        {sessions.length} ruled by the author &middot; {agentOnly} unattended, held in the
        records
      </p>
      <div className={styles.tiles}>
        {sessions.map((session) => (
          <a className={styles.tile} href={`/admin/bench/${session.sectionId}`} key={session.sectionId}>
            <span className={styles.tileName}>{session.currentHeading}</span>
            <span className={styles.tileMeta}>
              {session.settled} &middot; {session.rulings.length} rulings &middot;{" "}
              {session.generations} variants &middot; {session.rulesDerived.length} obligations
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
