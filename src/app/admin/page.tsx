import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CircleDot,
  Clock3,
  ListChecks,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import styles from "./admin.module.css";
import {
  readAllProgress,
  readCalibrationRows,
  readGlyphViolations,
  readProtectedLineViolations,
  readRepositoryState,
  readTasks,
  type Task,
} from "./adminData";

export const dynamic = "force-dynamic";

const TIER_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };
const VOLUME_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const numberFormat = new Intl.NumberFormat("en-US");

type AttentionTone = "critical" | "decision" | "blocked";

interface AttentionItem {
  label: string;
  title: string;
  context: string;
  next: string;
  tone: AttentionTone;
  href?: string;
}

function volumeLabel(editorialId: string): string {
  const index = Number.parseInt(editorialId.replace("volume-", ""), 10) - 1;
  return `Volume ${VOLUME_NUMERALS[index] ?? numberFormat.format(index + 1)}`;
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function tierClass(tier: string): string {
  if (tier === "green") return styles.green ?? "";
  if (tier === "amber") return styles.amber ?? "";
  return styles.red ?? "";
}

function tierMeaning(tier: string): string {
  if (tier === "green") return "Mechanical";
  if (tier === "amber") return "Editorial change";
  return "Author decision";
}

function TaskCard({ task, compact = false }: { task: Task; compact?: boolean }) {
  return (
    <article className={`${styles.taskCard} ${compact ? styles.taskCardCompact : ""}`}>
      <div className={styles.taskMeta}>
        <span className={styles.taskId}>{task.id}</span>
        <span className={`${styles.tier} ${tierClass(task.tier)}`}>
          {tierMeaning(task.tier)}
        </span>
        <span className={styles.taskArea}>{task.area}</span>
      </div>
      <h3>{task.title}</h3>
      {!compact && task.detail ? <p>{task.detail}</p> : null}
      {task.blockedBy?.length ? (
        <span className={styles.dependency}>
          Waiting on {task.blockedBy.join(", ")}
        </span>
      ) : null}
    </article>
  );
}

/**
 * This page ranks repository state by executive consequence. The summary says
 * what is true, the decision queue says what requires judgment, and the work
 * queue separates active work from authority-bound and mechanical backlog.
 */
export default function StatusPage() {
  const register = readTasks();
  const progress = readAllProgress();
  const lines = readProtectedLineViolations();
  const glyphs = readGlyphViolations();
  const records = readCalibrationRows();
  const repository = readRepositoryState();

  const started = progress.filter((volume) => volume.rendered > 0);
  const openSections = started.flatMap((volume) =>
    volume.sections
      .filter((section) => section.status === "open")
      .map((section) => ({
        volume: volume.editorialId,
        heading: section.heading,
      })),
  );
  const openQuestions = records.reduce(
    (total, record) => total + record.openQuestions,
    0,
  );
  const blocked = register.tasks.filter((task) => task.status === "blocked");
  const inFlight = register.tasks.filter((task) => task.status === "in-progress");
  const pending = register.tasks.filter((task) => task.status === "pending");
  const openTasks = [...inFlight, ...blocked, ...pending].sort(
    (a, b) =>
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      a.id.localeCompare(b.id),
  );
  const currentVolume =
    started.find((volume) => volume.open > 0 || volume.notStarted > 0) ??
    started.at(-1);

  const attention: AttentionItem[] = [];
  if (lines.violations.length) {
    attention.push({
      label: "Integrity",
      title: `${numberFormat.format(lines.violations.length)} protected lines missing`,
      context: [
        ...new Set(
          lines.violations.map((violation) =>
            volumeLabel(violation.editorialId),
          ),
        ),
      ].join(", "),
      next: "Restore the source lines before enabling the validation gate.",
      tone: "critical",
    });
  }
  if (glyphs.violations.length) {
    attention.push({
      label: "Quality gate",
      title: `${numberFormat.format(glyphs.violations.length)} prohibited glyphs`,
      context: [
        ...new Set(
          glyphs.violations.map((violation) =>
            volumeLabel(violation.editorialId),
          ),
        ),
      ].join(", "),
      next: "Run npm run editorial:lint, then repair the canonical manuscripts.",
      tone: "critical",
    });
  }
  for (const section of openSections) {
    attention.push({
      label: "Open record",
      title: section.heading,
      context: `${volumeLabel(section.volume)} has not closed its calibration record`,
      next: "Review the record and resolve its remaining gate.",
      tone: "decision",
      href: "/admin/calibration/",
    });
  }
  if (openQuestions) {
    attention.push({
      label: "Author queue",
      title: `${numberFormat.format(openQuestions)} recorded questions need rulings`,
      context: "Calibration records",
      next: "Batch the rulings so settled sections can close together.",
      tone: "decision",
      href: "/admin/calibration/",
    });
  }
  for (const task of blocked) {
    attention.push({
      label: "Blocked work",
      title: task.title,
      context: task.id,
      next: task.blockedBy?.length
        ? `Complete ${task.blockedBy.join(", ")} first.`
        : "Resolve the blocking condition.",
      tone: "blocked",
    });
  }

  const decisionTasks = pending.filter((task) => task.tier === "red");
  const backlogTasks = openTasks.filter(
    (task) =>
      task.status === "pending" &&
      !decisionTasks.some((decision) => decision.id === task.id),
  );
  const currentLabel = currentVolume
    ? volumeLabel(currentVolume.editorialId)
    : "No volume";
  let heroTitle = `${currentLabel} is the active editorial workstream.`;
  if (currentVolume && currentVolume.rendered === currentVolume.total) {
    if (openQuestions === 1) {
      heroTitle = `${currentLabel} is fully rendered. One author decision remains.`;
    } else if (openQuestions > 1) {
      heroTitle = `${currentLabel} is fully rendered. ${numberFormat.format(openQuestions)} author decisions remain.`;
    } else if (currentVolume.open > 0) {
      heroTitle = `${currentLabel} is fully rendered. ${numberFormat.format(currentVolume.open)} calibration ${currentVolume.open === 1 ? "record remains" : "records remain"} open.`;
    } else {
      heroTitle = `${currentLabel} is rendered and settled.`;
    }
  } else if (currentVolume) {
    heroTitle = `${currentLabel} is ${numberFormat.format(currentVolume.rendered)} of ${numberFormat.format(currentVolume.total)} sections rendered.`;
  }
  const repositorySync =
    repository.ahead || repository.behind
      ? `${numberFormat.format(repository.ahead)} ahead, ${numberFormat.format(repository.behind)} behind`
      : "Synced with origin";

  return (
    <div className={styles.dashboard}>
      <section className={styles.dashboardHero} aria-labelledby="status-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Editorial command center</span>
          <h1 id="status-title">{heroTitle}</h1>
          <p>
            The page reads canonical records and live gates. Integrity checks
            report {numberFormat.format(lines.violations.length)} protected-line{" "}
            {lines.violations.length === 1 ? "failure" : "failures"} and{" "}
            {numberFormat.format(glyphs.violations.length)} prohibited{" "}
            {glyphs.violations.length === 1 ? "glyph" : "glyphs"}.
          </p>
        </div>
        <div className={styles.snapshot}>
          <span>Live repository</span>
          <strong>
            {repository.branch} · {repository.commit}
          </strong>
          <small>
            {numberFormat.format(repository.changedFiles)} working{" "}
            {repository.changedFiles === 1 ? "change" : "changes"} ·{" "}
            {repositorySync}
          </small>
          <small>Checked {formatCheckedAt(repository.checkedAt)}</small>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Executive summary">
        <article className={`${styles.metricCard} ${styles.metricCardAlert}`}>
          <TriangleAlert aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(attention.length)}
          </span>
          <strong>Need action</strong>
          <small>Decisions, integrity failures, and blockers</small>
        </article>
        <article className={styles.metricCard}>
          <BookOpenCheck aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {currentVolume ? `${currentVolume.renderedPercent}%` : "0%"}
          </span>
          <strong>{currentLabel}</strong>
          <small>
            {currentVolume
              ? `${numberFormat.format(currentVolume.rendered)} of ${numberFormat.format(currentVolume.total)} rendered · ${numberFormat.format(currentVolume.settled)} records settled`
              : "No active calibration pass"}
          </small>
        </article>
        <article className={styles.metricCard}>
          <CircleDot aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(openQuestions)}
          </span>
          <strong>Author rulings</strong>
          <small>Recorded questions awaiting judgment</small>
        </article>
        <article className={styles.metricCard}>
          <ListChecks aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(openTasks.length)}
          </span>
          <strong>Open tasks</strong>
          <small>
            {numberFormat.format(inFlight.length)} active,{" "}
            {numberFormat.format(blocked.length)} blocked
          </small>
        </article>
      </section>

      <div className={styles.commandGrid}>
        <section className={styles.panel} aria-labelledby="attention-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Resolve now</span>
              <h2 id="attention-title">Decisions and blockers</h2>
            </div>
            <span className={styles.countBadge}>
              {numberFormat.format(attention.length)} unresolved
            </span>
          </div>
          {attention.length ? (
            <div className={styles.attentionList}>
              {attention.map((item) => (
                <article
                  className={`${styles.attentionCard} ${styles[item.tone]}`}
                  key={`${item.label}-${item.title}`}
                >
                  <div className={styles.attentionMarker} aria-hidden="true" />
                  <div className={styles.attentionCopy}>
                    <span>{item.label}</span>
                    <h3>{item.title}</h3>
                    <p>{item.context}</p>
                  </div>
                  <div className={styles.nextMove}>
                    <span>Next move</span>
                    {item.href ? (
                      <Link href={item.href}>
                        {item.next}
                        <ArrowRight aria-hidden="true" size={15} />
                      </Link>
                    ) : (
                      <strong>{item.next}</strong>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.clearState}>
              <ShieldCheck aria-hidden="true" size={22} />
              <span>Nothing requires intervention.</span>
            </div>
          )}
        </section>

        <aside className={`${styles.panel} ${styles.currentPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Current workstream</span>
              <h2>{currentLabel}</h2>
            </div>
          </div>
          {currentVolume ? (
            <>
              <div className={styles.currentProgress}>
                <span>{currentVolume.renderedPercent}%</span>
                <div>
                  <strong>
                    {numberFormat.format(currentVolume.rendered)} rendered
                  </strong>
                  <small>
                    {numberFormat.format(currentVolume.settled)} records settled ·{" "}
                    {numberFormat.format(currentVolume.open)} pass open
                  </small>
                </div>
              </div>
              <div
                className={styles.primaryProgress}
                role="progressbar"
                aria-label={`${currentLabel} sections rendered`}
                aria-valuemin={0}
                aria-valuemax={currentVolume.total}
                aria-valuenow={currentVolume.rendered}
              >
                <span
                  style={{ width: `${currentVolume.renderedPercent}%` }}
                />
              </div>
              <div className={styles.currentFacts}>
                <div>
                  <span>Open section</span>
                  <strong>{openSections[0]?.heading ?? "None"}</strong>
                </div>
                <div>
                  <span>Work in motion</span>
                  <strong>{inFlight[0]?.title ?? "No active task"}</strong>
                </div>
              </div>
              <Link className={styles.panelAction} href="/admin/calibration/">
                Open editorial revisions
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </>
          ) : (
            <p className={styles.emptyCopy}>No editorial volume has started.</p>
          )}
        </aside>
      </div>

      <section className={styles.portfolioSection} aria-labelledby="portfolio-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Nine-volume program</span>
            <h2 id="portfolio-title">Portfolio progress</h2>
          </div>
          <p>Calibration progress by canonical volume.</p>
        </div>
        <div className={styles.volumeGrid}>
          {progress.map((volume) => (
            <article
              className={`${styles.volumeCard} ${
                volume.rendered > 0 ? styles.volumeActive : ""
              }`}
              key={volume.editorialId}
            >
              <div className={styles.volumeCardHeading}>
                <span>{volumeLabel(volume.editorialId)}</span>
                <strong>
                  {volume.total
                    ? `${volume.renderedPercent}%`
                    : "Not scoped"}
                </strong>
              </div>
              <div className={styles.volumeBar} aria-hidden="true">
                <span style={{ width: `${volume.renderedPercent}%` }} />
              </div>
              <small>
                {volume.total
                  ? `${numberFormat.format(volume.rendered)} rendered · ${numberFormat.format(volume.settled)} records settled`
                  : "No baseline sections"}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workSection} aria-labelledby="work-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Execution</span>
            <h2 id="work-title">Work queue</h2>
          </div>
          <p>Authority-bound decisions first, then reversible execution.</p>
        </div>

        <div className={styles.workGrid}>
          <div className={styles.workLane}>
            <div className={styles.laneHeading}>
              <Clock3 aria-hidden="true" size={17} />
              <h3>In motion</h3>
              <span>{inFlight.length}</span>
            </div>
            {inFlight.length ? (
              inFlight.map((task) => <TaskCard task={task} key={task.id} />)
            ) : (
              <p className={styles.emptyCopy}>No task is active.</p>
            )}
            {blocked.map((task) => (
              <TaskCard task={task} key={task.id} />
            ))}
          </div>

          <div className={styles.workLane}>
            <div className={styles.laneHeading}>
              <TriangleAlert aria-hidden="true" size={17} />
              <h3>Author decisions</h3>
              <span>{decisionTasks.length}</span>
            </div>
            {decisionTasks.map((task) => (
              <TaskCard task={task} key={task.id} />
            ))}
          </div>

          <div className={`${styles.workLane} ${styles.backlogLane}`}>
            <div className={styles.laneHeading}>
              <ListChecks aria-hidden="true" size={17} />
              <h3>Operational backlog</h3>
              <span>{backlogTasks.length}</span>
            </div>
            <div className={styles.backlogList}>
              {backlogTasks.map((task) => (
                <TaskCard compact task={task} key={task.id} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
