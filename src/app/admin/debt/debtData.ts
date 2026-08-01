// Server side reader for the editorial debt register. Every value on /admin/debt
// comes from editorial/evidence/debt/items at request time through the same
// parser and the same routing the CLI queue uses. Read only: nothing here writes.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  countEditorialDebtByStatus,
  editorialDebtAgeInDays,
  editorialDebtBoundedness,
  editorialDebtCrossReferences,
  editorialDebtLane,
  editorialDebtRoute,
  parseEditorialDebtItem,
  type EditorialDebtBoundedness,
  type EditorialDebtItem,
  type EditorialDebtLane,
  type EditorialDebtRoute,
  type EditorialDebtStatus,
} from "@/lib/editorial-debt";

// Same reasoning as adminData: the admin surface runs only under the dev server,
// where the working directory is the repository root, and scripts/repository/paths
// cannot be imported into a Next server bundle.
const repoRoot = process.cwd();
const debtRoot = path.join(repoRoot, "editorial", "evidence", "debt");
const debtItemsRoot = path.join(debtRoot, "items");
const debtIndexPath = path.join(debtRoot, "index.md");

export interface DebtRow {
  item: EditorialDebtItem;
  /** Repository relative, forward slashed, for display and for the source link. */
  file: string;
  route: EditorialDebtRoute;
  boundedness: EditorialDebtBoundedness;
  lane: EditorialDebtLane;
  daysSinceUpdated: number;
  daysSinceDiscovered: number;
  crossReferences: string[];
}

export interface DebtRegister {
  rows: DebtRow[];
  /** Items that do not satisfy the field contract, named rather than hidden. */
  malformed: { file: string; message: string }[];
  counts: Record<EditorialDebtStatus, number>;
  /** The status line the generated index currently claims, for staleness checks. */
  indexCounts: Record<EditorialDebtStatus, number> | null;
  /** ISO date the register was read, which is what every age is measured against. */
  readAt: string;
}

function relativeFile(file: string): string {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith("..") ? file : relative.split(path.sep).join("/");
}

function parseIndexCounts(): Record<EditorialDebtStatus, number> | null {
  if (!existsSync(debtIndexPath)) return null;
  const match =
    /^Open: (\d+)\. Queries: (\d+)\. Deferred: (\d+)\. Resolved: (\d+)\.$/m.exec(
      readFileSync(debtIndexPath, "utf8"),
    );
  if (!match) return null;
  return {
    open: Number(match[1]),
    query: Number(match[2]),
    deferred: Number(match[3]),
    resolved: Number(match[4]),
  };
}

export function readDebtRegister(): DebtRegister {
  // Local calendar day, not the UTC one. Ticket dates are written by hand in the
  // author's own timezone, so an evening edit would otherwise read as a day old
  // the moment it was recorded.
  const now = new Date();
  const readAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rows: DebtRow[] = [];
  const malformed: DebtRegister["malformed"] = [];

  if (existsSync(debtItemsRoot)) {
    for (const entry of readdirSync(debtItemsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = path.join(debtItemsRoot, entry.name);
      try {
        const item = parseEditorialDebtItem(file, readFileSync(file, "utf8"));
        rows.push({
          item,
          file: relativeFile(file),
          route: editorialDebtRoute(item),
          boundedness: editorialDebtBoundedness(item),
          lane: editorialDebtLane(item),
          daysSinceUpdated: editorialDebtAgeInDays(item.updated, readAt),
          daysSinceDiscovered: editorialDebtAgeInDays(item.discovered, readAt),
          crossReferences: editorialDebtCrossReferences(item),
        });
      } catch (error) {
        // One malformed file must not blank the page. The register is the
        // author's working record, and a contract failure is itself something
        // the workbench should say out loud rather than swallow.
        malformed.push({
          file: relativeFile(file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  rows.sort((left, right) => left.item.id.localeCompare(right.item.id));
  return {
    rows,
    malformed: malformed.sort((left, right) =>
      left.file.localeCompare(right.file),
    ),
    counts: countEditorialDebtByStatus(rows.map((row) => row.item)),
    indexCounts: parseIndexCounts(),
    readAt,
  };
}

export function findDebtRow(
  register: DebtRegister,
  id: string,
): DebtRow | null {
  const wanted = id.toUpperCase();
  return register.rows.find((row) => row.item.id === wanted) ?? null;
}

/**
 * Every path any ticket cites, as an allowlist. The source viewer resolves only
 * against this set, so a request cannot reach a file the register never named.
 */
export function citedSourcePaths(register: DebtRegister): Set<string> {
  const paths = new Set<string>();
  for (const row of register.rows) {
    for (const source of row.item.sources) {
      const cited = source.split("#", 1)[0]!;
      if (!/^https?:\/\//.test(cited)) paths.add(cited);
    }
  }
  return paths;
}
