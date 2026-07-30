import styles from "../admin.module.css";
import { readTasks, readVolumeProgress, type Task } from "../adminData";

export const dynamic = "force-dynamic";

const ORDER: Record<string, number> = { "in-progress": 0, pending: 1, blocked: 2, done: 3 };
const TIER_ORDER: Record<string, number> = { green: 0, amber: 1, red: 2 };

function tierClass(tier: Task["tier"]): string {
  if (tier === "green") return styles.green ?? "";
  if (tier === "amber") return styles.amber ?? "";
  return styles.red ?? "";
}

export default function QueuePage() {
  const register = readTasks();

  const tasks = [...register.tasks].sort(
    (a, b) =>
      (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) ||
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      a.id.localeCompare(b.id),
  );

  return (
    <>
      <h1 className={styles.h1}>Task queue</h1>
      <p className={styles.sub}>
        Agent executable work, distinct from the debt register which holds authorial obligations.
        Tier governs what may run without supervision. The loop takes the top green item on each
        wake and stops on the first amber rather than guessing.
      </p>

      <div className={styles.grid} style={{ marginBottom: 20 }}>
        {(["green", "amber", "red"] as const).map((tier) => (
          <div className={styles.card} key={tier}>
            <p className={styles.micro}>
              <span className={`${styles.tier} ${tierClass(tier)}`}>{tier}</span>
            </p>
            <p>{register.tiers?.[tier]}</p>
          </div>
        ))}
      </div>

      <div className={styles.rows}>
        <div className={`${styles.row} ${styles.rowHead}`}>
          <span>id</span>
          <span>tier</span>
          <span>task</span>
          <span style={{ justifySelf: "end" }}>state</span>
        </div>
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
                  <>
                    <div className={styles.bar2} style={{ maxWidth: 320 }}>
                      <div className={styles.fill} style={{ width: `${p.percent}%` }} />
                    </div>
                    <p className={styles.detail}>
                      {p.settled} of {p.total} sections settled, {p.percent}%
                    </p>
                  </>
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
