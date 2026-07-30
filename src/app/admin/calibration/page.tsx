import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  GitBranch,
  Scale,
} from "lucide-react";

import { CopyPromptButton } from "../CopyPromptButton";
import styles from "../admin.module.css";
import {
  readCalibrationRows,
  readCalibrationSessions,
  type CalibrationSession,
} from "../adminData";

export const dynamic = "force-dynamic";

const VOLUME_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const numberFormat = new Intl.NumberFormat("en-US");

function volumeLabel(editorialId: string): string {
  const index = Number.parseInt(editorialId.replace("volume-", ""), 10) - 1;
  return `Volume ${VOLUME_NUMERALS[index] ?? numberFormat.format(index + 1)}`;
}

function revisionPrompt(sectionId: string): string {
  return [
    `/coherence-editorial-calibration Open a revision session for ${sectionId}.`,
    " Read editorial/method/standard.md and the volume's voice card, then derive variants",
    " from the immutable baseline rather than from the shipped text, and render the bench",
    ` with npm run editorial:compare -- --section ${sectionId}.`,
    " Then present the variants with what each one changes and why, and stop.",
    " Do not record a ruling: the ruling is mine to make.",
    " Once I have chosen, record it with by set to author, its scope, and the occasion,",
    " and promote any corpus scoped ruling into a named obligation in the standard.",
  ].join("");
}

function SessionCard({
  session,
  authority,
}: {
  session: CalibrationSession;
  authority: "author" | "agent";
}) {
  const content = (
    <>
      <div className={styles.revisionSessionHeader}>
        <span className={styles.revisionSessionVolume}>
          {volumeLabel(session.editorialId)}
        </span>
        <h3>{session.currentHeading}</h3>
      </div>

      <div className={styles.sessionSummary}>
        <span>
          {numberFormat.format(session.rulings.length)}{" "}
          {session.rulings.length === 1 ? "ruling" : "rulings"}
        </span>
        <span>
          {numberFormat.format(session.generations)}{" "}
          {session.generations === 1 ? "variant" : "variants"}
        </span>
        {session.openQuestions ? (
          <strong>
            {numberFormat.format(session.openQuestions)} open
          </strong>
        ) : null}
        <span className={styles.sessionAction}>
          {session.benchable ? (
            <>
              Compare
              <ArrowRight aria-hidden="true" size={15} />
            </>
          ) : (
            "Record only"
          )}
        </span>
      </div>
    </>
  );

  return (
    <article
      className={`${styles.revisionSessionCard} ${
        authority === "author"
          ? styles.revisionSessionAuthor
          : styles.revisionSessionAgent
      }`}
    >
      {session.benchable ? (
        <Link
          className={styles.revisionSessionLink}
          href={`/admin/bench/${session.sectionId}`}
          aria-label={`Open comparison bench for ${session.currentHeading}`}
        >
          {content}
        </Link>
      ) : (
        <div className={styles.revisionSessionRecord}>{content}</div>
      )}
    </article>
  );
}

export default function EditorialRevisionsPage() {
  const sessions = readCalibrationSessions();
  const rows = readCalibrationRows();
  const authored = sessions.filter((session) => session.authored);
  const agentOnly = sessions.filter((session) => !session.authored);
  const questions = rows.filter((row) => row.openQuestions > 0);
  const openQuestionCount = questions.reduce(
    (total, row) => total + row.openQuestions,
    0,
  );

  return (
    <div className={styles.revisionsPage}>
      <section className={styles.revisionsHero} aria-labelledby="revisions-title">
        <div>
          <span className={styles.eyebrow}>Editorial decision ledger</span>
          <h1 id="revisions-title">Editorial revisions</h1>
          <p>
            Compare variants, preserve authority, and keep every agent-made
            judgment visibly provisional until the author rules.
          </p>
        </div>
        <div
          className={styles.revisionMetrics}
          role="region"
          aria-label="Revision summary"
        >
          <div>
            <strong>{numberFormat.format(sessions.length)}</strong>
            <span>Recorded sessions</span>
          </div>
          <div>
            <strong>{numberFormat.format(authored.length)}</strong>
            <span>Author governed</span>
          </div>
          <div>
            <strong>{numberFormat.format(agentOnly.length)}</strong>
            <span>Agent only</span>
          </div>
          <div>
            <strong>{numberFormat.format(openQuestionCount)}</strong>
            <span>Open questions</span>
          </div>
        </div>
      </section>

      <section className={styles.startSessionPanel} aria-labelledby="start-session-title">
        <div className={styles.startSessionCopy}>
          <span className={styles.eyebrow}>Start a session</span>
          <h2 id="start-session-title">Open a bounded revision session.</h2>
          <p>
            Copy the prompt, replace the section placeholder, and take it to your
            agent conversation. The session must stop after presenting variants.
            Only your answer becomes a ruling.
          </p>
          <CopyPromptButton
            label="Copy blank session prompt"
            prompt={revisionPrompt("<section-id>")}
          />
        </div>
        <ol className={styles.sessionFlow}>
          <li>
            <span>1</span>
            <div>
              <strong>Choose the section</strong>
              <p>Start from a canonical section ID, not loose prose.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Compare variants</strong>
              <p>Read each change against the immutable baseline.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Make the ruling</strong>
              <p>Record authority, scope, occasion, and derived obligations.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.questionSection} aria-labelledby="questions-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Needs author judgment</span>
            <h2 id="questions-title">Open questions</h2>
          </div>
          <p>
            {numberFormat.format(openQuestionCount)} questions across{" "}
            {numberFormat.format(questions.length)} sections.
          </p>
        </div>
        <div className={styles.questionList}>
          {questions.map((row) => (
            <article className={styles.questionCard} key={row.sectionId}>
              <CircleAlert aria-hidden="true" size={18} />
              <div>
                <span>
                  {volumeLabel(row.editorialId)} · {row.sectionId}
                </span>
                <h3>{row.currentHeading}</h3>
                <ol className={styles.questionTextList}>
                  {row.openQuestionItems.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ol>
              </div>
              <CopyPromptButton
                label="Copy session prompt"
                prompt={revisionPrompt(row.sectionId)}
                secondary
              />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.sessionSection} aria-labelledby="author-sessions-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Binding authority</span>
            <h2 id="author-sessions-title">Author-governed sessions</h2>
          </div>
          <p>These sessions contain at least one ruling made by the author.</p>
        </div>
        <div className={styles.authorSessionGrid}>
          {authored.map((session) => (
            <SessionCard
              authority="author"
              session={session}
              key={session.sectionId}
            />
          ))}
        </div>
      </section>

      <section className={styles.sessionSection} aria-labelledby="agent-sessions-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Review required</span>
            <h2 id="agent-sessions-title">Agent-only records</h2>
          </div>
          <p>
            Recorded reasoning is evidence, not author authority. Review before
            treating any decision as binding.
          </p>
        </div>
        <div className={styles.agentSessionNotice}>
          <Scale aria-hidden="true" size={18} />
          <p>
            The repository currently holds {numberFormat.format(agentOnly.length)}{" "}
            sessions with no author ruling. Their findings remain useful, but their
            authority must stay explicit.
          </p>
        </div>
        <div className={styles.agentSessionGrid}>
          {agentOnly.map((session) => (
            <SessionCard
              authority="agent"
              session={session}
              key={session.sectionId}
            />
          ))}
        </div>
      </section>

      <section className={styles.revisionPrinciple} aria-label="Revision principle">
        <GitBranch aria-hidden="true" size={19} />
        <p>
          A comparison bench explains the alternatives. It does not grant itself
          permission to choose among them.
        </p>
      </section>
    </div>
  );
}
