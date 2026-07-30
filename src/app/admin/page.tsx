import styles from "./admin.module.css";
import {
  readAllProgress,
  readGlyphViolations,
  readProtectedLineViolations,
  readTasks,
  readVolumeProgress,
} from "./adminData";

export const dynamic = "force-dynamic";

const ORDER: Record<string, number> = { "in-progress": 0, pending: 1, blocked: 2, done: 3 };
const TIER_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };

function tierClass(tier: string): string {
  if (tier === "green") return styles.green ?? "";
  if (tier === "amber") return styles.amber ?? "";
  return styles.red ?? "";
}

/**
 * One page. Overview, queue, and progress were three routes over the same three numbers:
 * the overview existed only to summarise the two pages behind it, which is a page whose
 * whole job is that the other pages are elsewhere.
 *
 * Gates is folded in as two lines rather than a section. It was never more than two
 * mechanical checks, and a heading over two checks made it look like a subsystem.
 */
export default function AdminWorkbench() {
  const register = readTasks();
  const progress = readAllProgress();
  const lines = readProtectedLineViolations();
  const glyphs = readGlyphViolations();

  const open = register.tasks.filter((t) => t.status !== "done");
  const tasks = [...register.tasks].sort(
    (a, b) =>
      (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) ||
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      a.id.localeCompare(b.id),
  );

  return (
    <>
      <h1 className={styles.h1}>Editorial workbench</h1>
      <p className={styles.sub}>
        Derived from repository state on every request, so it cannot show progress the
        repository does not have. Read only: durable editorial state changes through an
        explicit command and a reviewed diff, never from here.
      </p>

      <p className={styles.micro}>Checks</p>
      <div className={styles.card} style={{ marginBottom: 26 }}>
        <p>
          Protected lines{" "}
          <span className={lines.violations.length ? styles.bad : styles.ok}>
            {lines.checked - lines.violations.length} of {lines.checked} present
          </span>
          {lines.violations.length ? (
            <span className={styles.detail}>
              {" "}
              missing from {[...new Set(lines.violations.map((v) => v.editorialId))].join(", ")}.
              Not wired into <span className={styles.cmd}>npm run validate</span>, because it
              would block every run until they are restored.
            </span>
          ) : null}
        </p>
        <p>
          Prohibited glyphs{" "}
          <span className={glyphs.violations.length ? styles.bad : styles.ok}>
            {glyphs.violations.length
              ? `${glyphs.violations.length} in ${glyphs.checked} manuscripts`
              : `clean across ${glyphs.checked} manuscripts`}
          </span>
          {glyphs.violations.length ? (
            <span className={styles.detail}>
              {" "}
              {glyphs.violations
                .slice(0, 4)
                .map((v) => `${v.editorialId.replace("volume-", "")}:${v.line} ${v.glyph}`)
                .join(", ")}
            </span>
          ) : null}
        </p>
      </div>

      <p className={styles.micro}>
        Re-render progress &middot; a section is settled when its calibration record says so
      </p>
      <div style={{ marginBottom: 26 }}>
        {progress.map((v) => (
          <section key={v.editorialId} style={{ marginBottom: 18 }}>
            <p className={styles.detail}>
              {v.editorialId.replace("volume-", "volume ")} &middot; {v.settled} of {v.total}{" "}
              settled &middot; {v.percent}% &middot; {v.settledWords.toLocaleString()} of{" "}
              {v.totalWords.toLocaleString()} baseline words
            </p>
            <div className={styles.bar2}>
              <div className={styles.fill} style={{ width: `${v.percent}%` }} />
            </div>
            {v.editorialId === "volume-01" ? (
              <div className={styles.sections}>
                {v.sections.map((s) => (
                  <div className={styles.section} key={s.sectionId}>
                    <span className={styles.id}>{s.index}</span>
                    <span className={s.settled ? styles.done : styles.todo}>
                      {s.settled ? "✓" : "·"}
                    </span>
                    <span className={s.settled ? undefined : styles.todo}>{s.heading}</span>
                    <span className={styles.words}>{s.words ? `${s.words} w` : ""}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <p className={styles.micro}>
        Queue &middot; {open.length} open &middot; agent work, not the authorial obligations in
        the debt register &middot; tier governs what may run unattended
      </p>
      <div className={styles.rows}>
        {tasks.map((task) => {
          const p = task.progress ? readVolumeProgress(task.progress.editorialId) : null;
          return (
            <div className={styles.row} key={task.id}>
              <span className={styles.id}>{task.id}</span>
              <span className={`${styles.tier} ${tierClass(task.tier)}`}>{task.tier}</span>
              <span>
                {task.title}
                {task.detail ? <p className={styles.detail}>{task.detail}</p> : null}
                {task.blockedBy?.length ? (
                  <p className={styles.detail}>Blocked by {task.blockedBy.join(", ")}.</p>
                ) : null}
                {p ? (
                  <p className={styles.detail}>
                    {p.settled} of {p.total} sections settled, {p.percent}%
                  </p>
                ) : null}
              </span>
              <span className={styles.state}>{task.status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
