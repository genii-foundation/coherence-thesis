import { CopyPromptButton } from "../CopyPromptButton";
import styles from "../admin.module.css";
import { readCalibrationSessions } from "../adminData";

export const dynamic = "force-dynamic";

const NEW_SESSION_PROMPT = [
  "/coherence-editorial-calibration Open a calibration session for <section-id>.",
  " Read editorial/method/standard.md and the volume's voice card, then derive variants",
  " from the immutable baseline rather than from the shipped text.",
  " Render the bench with npm run editorial:compare -- --section <section-id>,",
  " record each ruling with its scope and who decided it, and promote any corpus scoped",
  " ruling into a named obligation in the standard.",
].join("");

export default function EditorialRevisionsPage() {
  const all = readCalibrationSessions();
  const sessions = all.filter((session) => session.authored);
  const agentOnly = all.length - sessions.length;

  return (
    <>
      <h1 className={styles.h1}>Editorial revisions</h1>
      <p className={styles.sub}>
        A revision session compares a passage against its immutable baseline, records what
        was decided, and promotes anything corpus wide into a named obligation. Sessions
        the author ruled on are listed here. {agentOnly} further rulings were made by the
        agent alone and stay in the records, because an unattended ruling is a working note.
      </p>

      <div className={styles.startBlock}>
        <p>
          <strong>Select any passage in the manuscripts</strong> to start a revision on it.
          The selection bubble offers it beside Bookmark, and copies a prompt naming the
          section, the passage, and its paragraph anchor, which survives a re-render.
        </p>
        <p className={styles.detail}>Or start one without a passage in mind:</p>
        <CopyPromptButton label="Copy a new session prompt" prompt={NEW_SESSION_PROMPT} />
      </div>

      <p className={styles.micro}>
        {sessions.length} session{sessions.length === 1 ? "" : "s"} the author ruled on
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
