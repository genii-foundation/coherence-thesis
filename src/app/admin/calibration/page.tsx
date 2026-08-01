import Link from "next/link";
import { ArrowRight, CircleAlert, PenLine } from "lucide-react";

import { CopyPromptButton } from "../CopyPromptButton";
import {
  revisionPrompt,
  workingRevisionHref,
  type WorkingRevisionStatus,
} from "@/lib/editorial-revision-session";
import styles from "../admin.module.css";
import {
  readCalibrationRows,
  readCalibrationSessions,
  readWorkingRevisionSessions,
  type CalibrationSession,
} from "../adminData";

export const dynamic = "force-dynamic";

const VOLUME_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
];
const numberFormat = new Intl.NumberFormat("en-US");

function volumeLabel(editorialId: string): string {
  const index = Number.parseInt(editorialId.replace("volume-", ""), 10) - 1;
  return `Volume ${VOLUME_NUMERALS[index] ?? numberFormat.format(index + 1)}`;
}

function workingStatusLabel(status: WorkingRevisionStatus): string {
  if (status === "awaiting-intent") return "Waiting for direction";
  if (status === "drafting") return "Preparing variants";
  if (status === "review") return "Ready for review";
  if (status === "approved") return "Approved";
  return "Recorded";
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
          <strong>{numberFormat.format(session.openQuestions)} open</strong>
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
  const workingSessions = readWorkingRevisionSessions().filter(
    (session) => session.status !== "recorded",
  );
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
      <section
        className={styles.revisionsHero}
        aria-labelledby="revisions-title"
      >
        <div>
          <h1 id="revisions-title">Editorial Revisions</h1>
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

      {workingSessions.length ? (
        <section
          className={styles.workingRevisionSection}
          aria-labelledby="working-revisions-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="working-revisions-title">Working revisions</h2>
            </div>
          </div>
          <div className={styles.workingRevisionGrid}>
            {workingSessions.map((session) => (
              <article key={session.sectionId}>
                <Link
                  href={workingRevisionHref(session.sectionId)}
                  aria-label={`Open working revision for ${session.currentHeading}`}
                >
                  <PenLine aria-hidden="true" size={18} />
                  <div>
                    <span>
                      {volumeLabel(session.editorialId)} ·{" "}
                      {workingStatusLabel(session.status)}
                    </span>
                    <h3>{session.currentHeading}</h3>
                    <p>
                      {session.variants.length
                        ? `${numberFormat.format(session.variants.length)} variants`
                        : session.directions.length
                          ? "Direction received"
                          : "Waiting for the editor"}
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className={styles.startSessionPanel}
        aria-labelledby="start-session-title"
      >
        <div className={styles.startSessionCopy}>
          <h2 id="start-session-title">Start a revision</h2>
          <CopyPromptButton
            label="Copy blank session prompt"
            prompt={revisionPrompt({ sectionId: "<section-id>" })}
          />
        </div>
      </section>

      <section
        className={styles.questionSection}
        aria-labelledby="questions-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="questions-title">Open questions</h2>
          </div>
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
                prompt={revisionPrompt({
                  sectionId: row.sectionId,
                  editorialId: row.editorialId,
                })}
                secondary
              />
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.sessionSection}
        aria-labelledby="author-sessions-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="author-sessions-title">Author-governed sessions</h2>
          </div>
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

      <section
        className={styles.sessionSection}
        aria-labelledby="agent-sessions-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="agent-sessions-title">Agent-only records</h2>
          </div>
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
    </div>
  );
}
