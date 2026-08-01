import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  FileWarning,
  Gavel,
  Hammer,
  PauseCircle,
  ShieldCheck,
} from "lucide-react";

import {
  editorialDebtHref,
  editorialDebtLaneLabel,
  editorialDebtPrompt,
  editorialDebtScopeLabel,
  editorialDebtSeverityOrder,
} from "@/lib/editorial-debt";

import { CopyPromptButton } from "../CopyPromptButton";
import styles from "../admin.module.css";
import { DebtFilters, type DebtFacet } from "./DebtFilters";
import { readDebtRegister, type DebtRow } from "./debtData";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en-US");

function dayCount(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${numberFormat.format(days)} days ago`;
}

function DebtBadges({ row }: { row: DebtRow }) {
  return (
    <span className={styles.debtBadges}>
      <span className={styles.debtSeverity} data-severity={row.item.severity}>
        {row.item.severity}
      </span>
      <span className={styles.debtLane} data-lane={row.lane}>
        {editorialDebtLaneLabel(row.lane)}
      </span>
      <span className={styles.debtKind}>{row.item.kind}</span>
    </span>
  );
}

function DebtListRow({ row }: { row: DebtRow }) {
  return (
    <article
      className={styles.debtRow}
      data-debt-row=""
      data-kind={row.item.kind}
      data-lane={row.lane}
      data-scopes={row.item.scopes.join(" ")}
      data-search={`${row.item.id} ${row.item.title} ${row.item.scopes.join(" ")} ${row.item.kind}`.toLowerCase()}
      data-severity={row.item.severity}
      id={`debt-${row.item.id.toLowerCase()}`}
    >
      <Link className={styles.debtRowMain} href={editorialDebtHref(row.item.id)}>
        <span className={styles.debtRowId}>{row.item.id}</span>
        <h3>{row.item.title}</h3>
        <DebtBadges row={row} />
        <span className={styles.debtRowFacts}>
          <span>{row.item.scopes.map(editorialDebtScopeLabel).join(", ")}</span>
          <span>Updated {dayCount(row.daysSinceUpdated)}</span>
          <span>{row.route.authority}</span>
        </span>
      </Link>
      <CopyPromptButton
        label="Copy triage prompt"
        prompt={editorialDebtPrompt({
          item: row.item,
          file: row.file,
          lane: "triage",
        })}
        secondary
      />
    </article>
  );
}

/**
 * The debt register as a work surface. Every count here is derived from the item
 * files at request time, so the page cannot claim progress the register does not
 * have, and it cannot change the register either: the only action it offers is a
 * prompt on the clipboard.
 */
export default function EditorialDebtPage() {
  const register = readDebtRegister();
  const active = register.rows.filter((row) => row.item.status !== "resolved");
  const decide = active.filter((row) => row.lane === "decide");
  const execute = active.filter((row) => row.lane === "execute");
  const blocked = active.filter((row) => row.lane === "blocked");
  const critical = active
    .filter((row) => row.item.severity === "critical")
    .sort((left, right) => left.item.id.localeCompare(right.item.id));
  const bounded = active.filter((row) => row.boundedness.candidate);

  const byUpdated = [...active].sort(
    (left, right) =>
      right.item.updated.localeCompare(left.item.updated) ||
      left.item.id.localeCompare(right.item.id),
  );
  const recent = byUpdated.slice(0, 5);
  const untouched = byUpdated.slice(-5).reverse();
  const oldest = untouched[0];

  const ordered = [...register.rows].sort(
    (left, right) =>
      editorialDebtSeverityOrder.get(left.item.severity)! -
        editorialDebtSeverityOrder.get(right.item.severity)! ||
      left.item.id.localeCompare(right.item.id),
  );
  const facets: DebtFacet[] = ordered.map((row) => ({
    id: row.item.id,
    lane: row.lane,
    severity: row.item.severity,
    kind: row.item.kind,
    scopes: row.item.scopes,
    search:
      `${row.item.id} ${row.item.title} ${row.item.scopes.join(" ")} ${row.item.kind}`.toLowerCase(),
  }));
  const scopes = [
    ...new Set(register.rows.flatMap((row) => row.item.scopes)),
  ].sort();

  const indexStale =
    register.indexCounts !== null &&
    (["open", "query", "deferred", "resolved"] as const).some(
      (status) => register.indexCounts![status] !== register.counts[status],
    );

  const headline = decide.length
    ? `${numberFormat.format(decide.length)} of ${numberFormat.format(active.length)} open obligations are waiting on a decision, not on work.`
    : `${numberFormat.format(active.length)} open obligations, all of them workable now.`;

  return (
    <div className={styles.dashboard}>
      <section
        className={`${styles.dashboardHero} ${styles.debtHero}`}
        aria-labelledby="debt-title"
      >
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Editorial debt register</span>
          <h1 id="debt-title">{headline}</h1>
        </div>
        <div className={styles.snapshot}>
          <span>Register</span>
          <strong>{numberFormat.format(register.rows.length)} tickets</strong>
          <small>
            {numberFormat.format(register.counts.resolved)} resolved ·{" "}
            {numberFormat.format(bounded.length)} bounded
          </small>
          <small>Read {register.readAt}</small>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Register summary">
        <article className={`${styles.metricCard} ${styles.metricCardAlert}`}>
          <CircleAlert aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(critical.length)}
          </span>
          <strong>Critical and active</strong>
          <small>Severity critical, not yet resolved</small>
        </article>
        <article className={styles.metricCard}>
          <Gavel aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(decide.length)}
          </span>
          <strong>Need a decision</strong>
          <small>Author queries and decision-bound kinds</small>
        </article>
        <article className={styles.metricCard}>
          <Hammer aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(execute.length)}
          </span>
          <strong>Ready to work</strong>
          <small>
            {numberFormat.format(bounded.length)} pass the boundedness signal
          </small>
        </article>
        <article className={styles.metricCard}>
          <PauseCircle aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {numberFormat.format(blocked.length)}
          </span>
          <strong>Blocked</strong>
          <small>Deferred behind a named external condition</small>
        </article>
        <article className={styles.metricCard}>
          <Clock3 aria-hidden="true" size={19} />
          <span className={styles.metricValue}>
            {oldest ? numberFormat.format(oldest.daysSinceUpdated) : "0"}
          </span>
          <strong>Days since the quietest moved</strong>
          <small>{oldest ? oldest.item.id : "Nothing active"}</small>
        </article>
      </section>

      <div className={styles.commandGrid}>
        <section className={styles.panel} aria-labelledby="debt-critical-title">
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Resolve first</span>
              <h2 id="debt-critical-title">Critical obligations</h2>
            </div>
            <span className={styles.countBadge}>
              {numberFormat.format(critical.length)} active
            </span>
          </div>
          {critical.length ? (
            <div className={styles.debtCriticalList}>
              {critical.map((row) => (
                <article className={styles.debtCriticalCard} key={row.item.id}>
                  <div className={styles.debtCriticalCopy}>
                    <span>
                      {row.item.id} · {editorialDebtLaneLabel(row.lane)}
                    </span>
                    <Link href={editorialDebtHref(row.item.id)}>
                      {row.item.title}
                    </Link>
                    <p>{row.route.authority}</p>
                  </div>
                  <CopyPromptButton
                    label="Copy investigation prompt"
                    prompt={editorialDebtPrompt({
                      item: row.item,
                      file: row.file,
                      lane: "investigate",
                    })}
                    secondary
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.clearState}>
              <ShieldCheck aria-hidden="true" size={22} />
              <span>No critical obligation is open.</span>
            </div>
          )}
        </section>

        <aside className={`${styles.panel} ${styles.debtMovementPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Movement</span>
              <h2>What changed, what did not</h2>
            </div>
          </div>
          <div className={styles.debtMovementGroup}>
            <h3>Moved most recently</h3>
            <ul>
              {recent.map((row) => (
                <li key={row.item.id}>
                  <Link href={editorialDebtHref(row.item.id)}>
                    {row.item.id}
                  </Link>
                  <span>{row.item.title}</span>
                  <small>{dayCount(row.daysSinceUpdated)}</small>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.debtMovementGroup}>
            <h3>Longest untouched</h3>
            <ul>
              {untouched.map((row) => (
                <li key={row.item.id}>
                  <Link href={editorialDebtHref(row.item.id)}>
                    {row.item.id}
                  </Link>
                  <span>{row.item.title}</span>
                  <small>{dayCount(row.daysSinceUpdated)}</small>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <section
        className={styles.workSection}
        aria-labelledby="debt-register-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>The whole register</span>
            <h2 id="debt-register-title">Every ticket</h2>
          </div>
          <p>Sorted by severity, then by identifier, the way the index is.</p>
        </div>
        <DebtFilters facets={facets} scopes={scopes} />
        <div className={styles.debtList} id="debt-list">
          {ordered.map((row) => (
            <DebtListRow key={row.item.id} row={row} />
          ))}
        </div>
      </section>

      <section className={styles.workSection} aria-labelledby="debt-health-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Register health</span>
            <h2 id="debt-health-title">Is the record true</h2>
          </div>
          <p>Derived from the item files, checked against the generated index.</p>
        </div>
        <div className={styles.debtHealth}>
          <article
            className={styles.debtHealthCard}
            data-state={indexStale ? "bad" : "ok"}
          >
            <FileWarning aria-hidden="true" size={18} />
            <div>
              <strong>
                {indexStale
                  ? "index.md disagrees with the item files"
                  : "index.md matches the item files"}
              </strong>
              <p>
                Derived: {numberFormat.format(register.counts.open)} open,{" "}
                {numberFormat.format(register.counts.query)} queries,{" "}
                {numberFormat.format(register.counts.deferred)} deferred,{" "}
                {numberFormat.format(register.counts.resolved)} resolved.
                {register.indexCounts
                  ? ` Index claims ${numberFormat.format(register.indexCounts.open)}, ${numberFormat.format(register.indexCounts.query)}, ${numberFormat.format(register.indexCounts.deferred)}, ${numberFormat.format(register.indexCounts.resolved)}.`
                  : " The index has no readable status line."}
              </p>
              {indexStale ? <code>npm run editorial:debt:update</code> : null}
            </div>
          </article>
          <article
            className={styles.debtHealthCard}
            data-state={register.malformed.length ? "bad" : "ok"}
          >
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              <strong>
                {numberFormat.format(register.malformed.length)}{" "}
                {register.malformed.length === 1 ? "item fails" : "items fail"}{" "}
                the field contract
              </strong>
              {register.malformed.length ? (
                <ul>
                  {register.malformed.map((entry) => (
                    <li key={entry.file}>{entry.message}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  All {numberFormat.format(register.rows.length)} files parse
                  under the contract in scripts/editorial/debt.ts.
                </p>
              )}
            </div>
          </article>
        </div>
      </section>

      <section
        className={styles.revisionPrinciple}
        aria-label="Register principle"
      >
        <ArrowRight aria-hidden="true" size={19} />
        <p>
          This page reads the register. It cannot move a ticket, and the prompt it
          hands you still needs your approval before anything durable changes.
        </p>
      </section>
    </div>
  );
}
