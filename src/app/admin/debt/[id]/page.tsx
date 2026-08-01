import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Route, Scale } from "lucide-react";

import {
  editorialDebtHref,
  editorialDebtLaneLabel,
  editorialDebtPrompt,
  editorialDebtResolutionSections,
  editorialDebtScopeLabel,
} from "@/lib/editorial-debt";

import { CopyPromptButton } from "../../CopyPromptButton";
import styles from "../../admin.module.css";
import { DebtMarkdown } from "../DebtMarkdown";
import { findDebtRow, readDebtRegister } from "../debtData";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en-US");

function sourceHref(source: string): string {
  return `/admin/debt/source/?path=${encodeURIComponent(source.split("#", 1)[0] ?? source)}`;
}

function dayCount(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${numberFormat.format(days)} days ago`;
}

/**
 * One ticket, whole. The body sections render in file order rather than in a
 * fixed order, because several items carry sections the contract does not
 * require, and dropping them would hide the evidence the ticket was written to
 * preserve.
 */
export default async function EditorialDebtItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^ctd-\d{4}$/i.test(id)) notFound();

  const register = readDebtRegister();
  const row = findDebtRow(register, id);
  if (!row) notFound();

  const { item } = row;
  const known = new Set(register.rows.map((entry) => entry.item.id));
  const bodySections = [...item.sections].filter(
    ([heading]) => heading !== "Resolution",
  );

  return (
    <div className={styles.debtItemPage}>
      <section className={styles.debtItemHero} aria-labelledby="debt-item-title">
        <div>
          <span className={styles.eyebrow}>
            {item.id} · {editorialDebtLaneLabel(row.lane)}
          </span>
          <h1 id="debt-item-title">{item.title}</h1>
          <span className={styles.debtBadges}>
            <span className={styles.debtSeverity} data-severity={item.severity}>
              {item.severity}
            </span>
            <span className={styles.debtLane} data-lane={row.lane}>
              {item.status}
            </span>
            <span className={styles.debtKind}>{item.kind}</span>
          </span>
        </div>
        <Link className={styles.debtBackLink} href="/admin/debt/">
          <ArrowLeft aria-hidden="true" size={15} />
          All debt
        </Link>
      </section>

      <dl className={styles.debtFacts}>
        <div>
          <dt>Scope</dt>
          <dd>{item.scopes.map(editorialDebtScopeLabel).join(", ")}</dd>
        </div>
        <div>
          <dt>Discovered</dt>
          <dd>
            {item.discovered} · {dayCount(row.daysSinceDiscovered)}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            {item.updated} · {dayCount(row.daysSinceUpdated)}
          </dd>
        </div>
        <div>
          <dt>Resolved</dt>
          <dd>{item.resolved || "Not resolved"}</dd>
        </div>
        <div>
          <dt>Discovered in</dt>
          <dd>{item.discoveredIn}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>
            <code>{row.file}</code>
          </dd>
        </div>
      </dl>

      <div className={styles.debtItemGrid}>
        <section
          className={styles.debtRoutingPanel}
          aria-labelledby="debt-routing-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Routing</span>
              <h2 id="debt-routing-title">Who decides, and what does the work</h2>
            </div>
          </div>
          <div className={styles.debtRoutingRow}>
            <Scale aria-hidden="true" size={17} />
            <div>
              <span>Authority</span>
              <strong>{row.route.authority}</strong>
            </div>
          </div>
          <div className={styles.debtRoutingRow}>
            <Route aria-hidden="true" size={17} />
            <div>
              <span>Specialist route</span>
              <strong>{row.route.specialistRoute}</strong>
            </div>
          </div>
          <p className={styles.debtRoutingNote}>
            Queue routing is a default. A named decision authority inside the
            ticket takes precedence over it.
          </p>
          <div
            className={styles.debtBoundedness}
            data-candidate={row.boundedness.candidate ? "true" : "false"}
          >
            <strong>
              {row.boundedness.candidate
                ? "Boundedness candidate"
                : "Not a boundedness candidate"}
            </strong>
            <p>{row.boundedness.basis}</p>
          </div>
        </section>

        <section
          className={styles.debtActionPanel}
          aria-labelledby="debt-action-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Act on it</span>
              <h2 id="debt-action-title">Pick a lane</h2>
            </div>
          </div>
          <p>
            Copy one prompt and paste it into a chat. The workbench is read only,
            so nothing moves until you approve it in that session.
          </p>
          <div className={styles.debtActionButtons}>
            <CopyPromptButton
              label="Quick triage"
              prompt={editorialDebtPrompt({
                item,
                file: row.file,
                lane: "triage",
              })}
            />
            <CopyPromptButton
              label="Investigate"
              prompt={editorialDebtPrompt({
                item,
                file: row.file,
                lane: "investigate",
              })}
              secondary
            />
            <CopyPromptButton
              label="Full resolution"
              prompt={editorialDebtPrompt({
                item,
                file: row.file,
                lane: "resolve",
              })}
              secondary
            />
          </div>
          <p className={styles.debtActionCommand}>
            Read only inspection from a terminal:
            <code>npm run editorial:debt:queue -- --id {item.id}</code>
          </p>
        </section>
      </div>

      <section className={styles.debtSourcesPanel} aria-labelledby="debt-sources-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Cited evidence</span>
            <h2 id="debt-sources-title">Sources</h2>
          </div>
          <p>
            {numberFormat.format(item.sources.length)}{" "}
            {item.sources.length === 1 ? "path" : "paths"} named by this ticket.
          </p>
        </div>
        <ul className={styles.debtSourceList}>
          {item.sources.map((source) => (
            <li key={source}>
              <FileText aria-hidden="true" size={15} />
              {/^https?:\/\//.test(source) ? (
                <a href={source} rel="noreferrer" target="_blank">
                  {source}
                </a>
              ) : (
                <a href={sourceHref(source)} rel="noreferrer" target="_blank">
                  {source}
                </a>
              )}
            </li>
          ))}
        </ul>
        {row.crossReferences.length ? (
          <div className={styles.debtCrossReferences}>
            <span>Names other tickets</span>
            <ul>
              {row.crossReferences.map((reference) => (
                <li key={reference}>
                  {known.has(reference) ? (
                    <Link href={editorialDebtHref(reference)}>{reference}</Link>
                  ) : (
                    <span>{reference}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {bodySections.map(([heading, body]) => (
        <section className={styles.debtSection} key={heading}>
          <h2>{heading}</h2>
          <DebtMarkdown markdown={body} />
        </section>
      ))}

      {item.resolution ? (
        <section className={styles.debtSection}>
          <h2>Resolution</h2>
          {editorialDebtResolutionSections.map(([heading, key]) => (
            <div className={styles.debtResolutionPart} key={heading}>
              <h3>{heading}</h3>
              <DebtMarkdown markdown={item.resolution![key]} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
