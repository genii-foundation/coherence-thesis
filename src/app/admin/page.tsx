import styles from "./admin.module.css";
import {
  readAllProgress,
  readCalibrationRows,
  readGlyphViolations,
  readProtectedLineViolations,
  readTasks,
} from "./adminData";

export const dynamic = "force-dynamic";

const TIER_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };

function tierClass(tier: string): string {
  if (tier === "green") return styles.green ?? "";
  if (tier === "amber") return styles.amber ?? "";
  return styles.red ?? "";
}

interface Item {
  what: string;
  where: string;
  next: string;
  href?: string;
}

/**
 * A dashboard is read in seconds, standing up. Numbers first, then the short list of
 * things that are actually wrong, then the work in flight. No paragraph on this page
 * explains the page: anything that needs a paragraph is not a dashboard row.
 */
export default function StatusPage() {
  const register = readTasks();
  const progress = readAllProgress();
  const lines = readProtectedLineViolations();
  const glyphs = readGlyphViolations();
  const records = readCalibrationRows();

  const started = progress.filter((v) => v.settled > 0);
  const openSections = started.flatMap((v) =>
    v.sections.filter((s) => !s.settled).map((s) => ({ volume: v.editorialId, heading: s.heading })),
  );
  const openQuestions = records.reduce((total, r) => total + r.openQuestions, 0);
  const blocked = register.tasks.filter((t) => t.status === "blocked");
  const inFlight = register.tasks.filter((t) => t.status === "in-progress");
  const pending = register.tasks.filter((t) => t.status === "pending");
  const openTasks = [...inFlight, ...blocked, ...pending];
  const settled = started.reduce((t, v) => t + v.settled, 0);
  const total = started.reduce((t, v) => t + v.total, 0);

  const items: Item[] = [];
  if (lines.violations.length) {
    items.push({
      what: `${lines.violations.length} protected lines missing`,
      where: [...new Set(lines.violations.map((v) => v.editorialId.replace("volume-", "vol ")))].join(", "),
      next: "Restore, then wire the gate into validate",
    });
  }
  if (glyphs.violations.length) {
    items.push({
      what: `${glyphs.violations.length} prohibited glyphs`,
      where: [...new Set(glyphs.violations.map((v) => v.editorialId.replace("volume-", "vol ")))].join(", "),
      next: "npm run editorial:lint",
    });
  }
  for (const section of openSections) {
    items.push({
      what: "Section unsettled",
      where: section.heading,
      next: "Decide the open question",
      href: "/admin/calibration/",
    });
  }
  if (openQuestions) {
    items.push({
      what: `${openQuestions} questions for the author`,
      where: "Calibration records",
      next: "Rule, then the sections settle",
      href: "/admin/calibration/",
    });
  }
  for (const task of blocked) {
    items.push({
      what: `${task.id} blocked`,
      where: task.title,
      next: task.blockedBy?.length ? `Waiting on ${task.blockedBy.join(", ")}` : "Unblock",
    });
  }

  const metrics = [
    { value: String(items.length), label: "need attention", bad: items.length > 0 },
    { value: `${settled}/${total}`, label: "sections settled" },
    { value: `${started.length}/${progress.length}`, label: "volumes started" },
    { value: String(openTasks.length), label: "tasks open" },
  ];

  return (
    <>
      <h1 className={styles.h1}>Status</h1>

      <div className={styles.metrics}>
        {metrics.map((m) => (
          <div className={styles.metric} key={m.label}>
            <span className={`${styles.metricValue} ${m.bad ? styles.bad : ""}`}>{m.value}</span>
            <span className={styles.metricLabel}>{m.label}</span>
          </div>
        ))}
      </div>

      {items.length ? (
        <>
          <p className={styles.micro}>Needs attention</p>
          <div className={styles.rows} style={{ marginBottom: 26 }}>
            {items.map((item, i) => (
              <div
                className={styles.row}
                key={`${item.what}-${i}`}
                style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
              >
                <span>{item.what}</span>
                <span className={styles.detail}>{item.where}</span>
                <span className={styles.detail}>
                  {item.href ? <a href={item.href}>{item.next}</a> : item.next}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className={styles.ok} style={{ marginBottom: 26 }}>
          Nothing needs attention.
        </p>
      )}

      <p className={styles.micro}>Progress</p>
      <div className={styles.progressList} style={{ marginBottom: 26 }}>
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
        {progress
          .filter((v) => v.settled === 0)
          .map((v) => (
            <div className={styles.progressRow} key={v.editorialId}>
              <span className={styles.id}>{v.editorialId.replace("volume-", "vol ")}</span>
              <div className={styles.bar2}>
                <div className={styles.fill} style={{ width: "0%" }} />
              </div>
              <span className={styles.words}>0/{v.total}</span>
              <span className={styles.words}>&mdash;</span>
            </div>
          ))}
      </div>

      <p className={styles.micro}>Queue &middot; {openTasks.length} open</p>
      <div className={styles.rows}>
        {openTasks
          .sort(
            (a, b) =>
              (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || a.id.localeCompare(b.id),
          )
          .map((task) => (
            <div className={styles.row} key={task.id} style={{ gridTemplateColumns: "62px 58px 1fr 78px" }}>
              <span className={styles.id}>{task.id}</span>
              <span className={`${styles.tier} ${tierClass(task.tier)}`}>{task.tier}</span>
              <span>{task.title}</span>
              <span className={styles.state}>{task.status}</span>
            </div>
          ))}
      </div>
    </>
  );
}
