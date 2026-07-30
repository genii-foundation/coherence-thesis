import styles from "./admin.module.css";
import {
  readAllProgress,
  readCalibrationRows,
  readGlyphViolations,
  readProtectedLineViolations,
  readTasks,
  type Task,
} from "./adminData";

export const dynamic = "force-dynamic";

const TIER_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };

function tierClass(tier: string): string {
  if (tier === "green") return styles.green ?? "";
  if (tier === "amber") return styles.amber ?? "";
  return styles.red ?? "";
}

interface Attention {
  what: string;
  detail: string;
}

/**
 * A status page answers three questions in order: is anything wrong, how far along is the
 * work, and what is in flight. Anything that answers none of those is not status.
 *
 * The previous version led with a passing check and then printed twenty-seven settled
 * sections, which is reassurance rather than information. What needs attention comes
 * first here and everything healthy collapses to one line.
 */
export default function StatusPage() {
  const register = readTasks();
  const progress = readAllProgress();
  const lines = readProtectedLineViolations();
  const glyphs = readGlyphViolations();
  const records = readCalibrationRows();

  // Only volumes the re-render has actually started. Volumes II to IX carry no
  // calibration records at all, so counting their sections as unsettled reports 409
  // problems where there is one, and buries it under four hundred headings.
  const started = progress.filter((v) => v.settled > 0);
  const openSections = started.flatMap((v) =>
    v.sections.filter((s) => !s.settled).map((s) => ({ volume: v.editorialId, heading: s.heading })),
  );
  const notStarted = progress.filter((v) => v.settled === 0);
  const openQuestions = records.reduce((total, r) => total + r.openQuestions, 0);
  const blocked = register.tasks.filter((t) => t.status === "blocked");
  const inFlight = register.tasks.filter((t) => t.status === "in-progress");
  const pending = register.tasks.filter((t) => t.status === "pending");
  const done = register.tasks.filter((t) => t.status === "done");

  const attention: Attention[] = [];
  if (lines.violations.length) {
    attention.push({
      what: `${lines.violations.length} protected lines missing`,
      detail: `Declared in ${[...new Set(lines.violations.map((v) => v.editorialId.replace("volume-", "volume ")))].join(", ")} and absent from those manuscripts. The gate is not wired into validate, because it would fail every run until they are restored.`,
    });
  }
  if (glyphs.violations.length) {
    attention.push({
      what: `${glyphs.violations.length} prohibited glyphs`,
      detail: glyphs.violations
        .slice(0, 5)
        .map((v) => `${v.editorialId.replace("volume-", "")}:${v.line} ${v.glyph}`)
        .join(", "),
    });
  }
  if (openSections.length) {
    attention.push({
      what: `${openSections.length} section${openSections.length === 1 ? "" : "s"} unsettled`,
      detail: `${openSections
        .slice(0, 4)
        .map((s) => s.heading)
        .join(", ")}${openSections.length > 4 ? `, and ${openSections.length - 4} more` : ""}. In ${
        [...new Set(openSections.map((s) => s.volume.replace("volume-", "volume ")))].join(", ")
      }.`,
    });
  }
  if (openQuestions) {
    attention.push({
      what: `${openQuestions} question${openQuestions === 1 ? "" : "s"} for the author`,
      detail: "Recorded in calibration records. Each needs a decision before its section can settle.",
    });
  }
  if (blocked.length) {
    attention.push({
      what: `${blocked.length} task${blocked.length === 1 ? "" : "s"} blocked`,
      detail: blocked.map((t) => `${t.id} ${t.title}`).join(" · "),
    });
  }

  const passing = [
    !lines.violations.length && `protected lines, ${lines.checked} present`,
    !glyphs.violations.length && `prohibited glyphs, clean across ${glyphs.checked} manuscripts`,
    !openSections.length && started.length && "every started section settled",
  ].filter(Boolean) as string[];

  const group = (label: string, list: Task[]) =>
    list.length ? (
      <div key={label} style={{ marginBottom: 18 }}>
        <p className={styles.micro}>
          {label} &middot; {list.length}
        </p>
        <div className={styles.rows}>
          {[...list]
            .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || a.id.localeCompare(b.id))
            .map((task) => (
              <div className={styles.row} key={task.id} style={{ gridTemplateColumns: "68px 62px 1fr" }}>
                <span className={styles.id}>{task.id}</span>
                <span className={`${styles.tier} ${tierClass(task.tier)}`}>{task.tier}</span>
                <span>
                  {task.title}
                  {task.blockedBy?.length ? (
                    <p className={styles.detail}>Blocked by {task.blockedBy.join(", ")}.</p>
                  ) : null}
                </span>
              </div>
            ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <h1 className={styles.h1}>Status</h1>
      <p className={styles.sub}>
        {attention.length ? (
          <>
            <strong>{attention.length}</strong> thing{attention.length === 1 ? "" : "s"} need
            attention.
          </>
        ) : (
          <>Nothing needs attention.</>
        )}{" "}
        Derived from repository state on every request. Read only.
      </p>

      {attention.length ? (
        <div className={styles.attention}>
          {attention.map((item) => (
            <div className={styles.attentionRow} key={item.what}>
              <span className={styles.attentionWhat}>{item.what}</span>
              <span className={styles.detail}>{item.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      {passing.length ? (
        <p className={styles.detail} style={{ margin: "0 0 26px" }}>
          <span className={styles.ok}>Passing</span> &middot; {passing.join(" &middot; ")}
        </p>
      ) : null}

      <p className={styles.micro}>
        Re-render progress &middot; {started.length} of {progress.length} volumes started
      </p>
      <div className={styles.progressList}>
        {started.map((v) => (
          <div className={styles.progressRow} key={v.editorialId}>
            <span className={styles.id}>{v.editorialId.replace("volume-", "vol ")}</span>
            <div className={styles.bar2}>
              <div className={styles.fill} style={{ width: `${v.percent}%` }} />
            </div>
            <span className={styles.words}>
              {v.settled}/{v.total}
            </span>
            <span className={styles.words}>{v.percent}%</span>
          </div>
        ))}
      </div>
      {notStarted.length ? (
        <p className={styles.detail} style={{ marginTop: 8 }}>
          Not started: {notStarted.map((v) => v.editorialId.replace("volume-", "")).join(", ")}.
        </p>
      ) : null}

      <p className={styles.micro} style={{ marginTop: 26 }}>
        Queue &middot; agent work, not the authorial obligations in the debt register
      </p>
      {group("In flight", inFlight)}
      {group("Blocked", blocked)}
      {group("Pending", pending)}
      <p className={styles.detail}>{done.length} done.</p>
    </>
  );
}
