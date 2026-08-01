"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  editorialDebtKinds,
  editorialDebtLaneLabel,
  editorialDebtLanes,
  editorialDebtScopeLabel,
  editorialDebtSeverities,
  type EditorialDebtLane,
} from "@/lib/editorial-debt";

import styles from "../admin.module.css";

export interface DebtFacet {
  id: string;
  lane: EditorialDebtLane;
  severity: string;
  kind: string;
  scopes: string[];
  search: string;
}

const numberFormat = new Intl.NumberFormat("en-US");

/** Only characters that can appear in an attribute selector string survive. */
function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 .:/-]/g, "");
}

/**
 * Filters a server rendered list without re-rendering it, by emitting the rules
 * that hide the rows the current selection excludes. The list is complete and
 * readable in the HTML, so a reader without JavaScript sees all 112 tickets
 * rather than an empty shell, and nothing here can desync from the markup the
 * way an imperative pass over the DOM would.
 */
export function DebtFilters({
  facets,
  scopes,
}: {
  facets: DebtFacet[];
  scopes: string[];
}) {
  const [lane, setLane] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [scope, setScope] = useState<string>("all");
  const [query, setQuery] = useState("");

  const search = sanitize(query.trim());
  const active =
    lane !== "all" ||
    severity !== "all" ||
    kind !== "all" ||
    scope !== "all" ||
    search !== "";

  const rules = useMemo(() => {
    const selectors: string[] = [];
    if (lane !== "all") selectors.push(`:not([data-lane="${lane}"])`);
    if (severity !== "all") {
      selectors.push(`:not([data-severity="${severity}"])`);
    }
    if (kind !== "all") selectors.push(`:not([data-kind="${kind}"])`);
    if (scope !== "all") selectors.push(`:not([data-scopes~="${scope}"])`);
    if (search) selectors.push(`:not([data-search*="${search}"])`);
    return selectors.length
      ? `[data-debt-row]${selectors.join("")}{display:none}`
      : "";
  }, [kind, lane, scope, search, severity]);

  const visible = useMemo(
    () =>
      facets.filter(
        (facet) =>
          (lane === "all" || facet.lane === lane) &&
          (severity === "all" || facet.severity === severity) &&
          (kind === "all" || facet.kind === kind) &&
          (scope === "all" || facet.scopes.includes(scope)) &&
          (!search || facet.search.includes(search)),
      ).length,
    [facets, kind, lane, scope, search, severity],
  );

  const clear = () => {
    setLane("all");
    setSeverity("all");
    setKind("all");
    setScope("all");
    setQuery("");
  };

  return (
    <div className={styles.debtFilters}>
      {rules ? <style>{rules}</style> : null}

      <fieldset className={styles.debtSegmented}>
        <legend>Lane</legend>
        {[{ value: "all", label: "All" }].concat(
          editorialDebtLanes.map((value) => ({
            value,
            label: editorialDebtLaneLabel(value),
          })),
        ).map((option) => (
          <label key={option.value}>
            <input
              checked={lane === option.value}
              name="debt-lane"
              onChange={() => setLane(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.debtSegmented} data-capitalize="true">
        <legend>Severity</legend>
        {["all", ...editorialDebtSeverities].map((option) => (
          <label key={option}>
            <input
              checked={severity === option}
              name="debt-severity"
              onChange={() => setSeverity(option)}
              type="radio"
              value={option}
            />
            <span>{option === "all" ? "All" : option}</span>
          </label>
        ))}
      </fieldset>

      <div className={styles.debtSelects}>
        <label>
          <span>Kind</span>
          <select onChange={(event) => setKind(event.target.value)} value={kind}>
            <option value="all">All kinds</option>
            {editorialDebtKinds.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Scope</span>
          <select
            onChange={(event) => setScope(event.target.value)}
            value={scope}
          >
            <option value="all">All scopes</option>
            {scopes.map((option) => (
              <option key={option} value={option}>
                {editorialDebtScopeLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.debtSearch}>
          <span>Find</span>
          <Search aria-hidden="true" size={15} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ticket id or words in the title"
            type="search"
            value={query}
          />
        </label>
      </div>

      <p aria-live="polite" className={styles.debtFilterCount}>
        <strong>{numberFormat.format(visible)}</strong> of{" "}
        {numberFormat.format(facets.length)} shown
        {active ? (
          <button className={styles.debtClear} onClick={clear} type="button">
            <X aria-hidden="true" size={13} />
            Clear filters
          </button>
        ) : null}
      </p>
    </div>
  );
}
