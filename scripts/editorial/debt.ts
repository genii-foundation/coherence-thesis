import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureDir, readUtf8, repoRoot, writeUtf8 } from "../manuscripts/shared";
import { editorialDebtRoot as canonicalEditorialDebtRoot } from "../repository/paths";
import {
  checkEditorialDebtIdentifiers,
  parseEditorialDebtItem,
  renderEditorialDebtIndex,
  type EditorialDebtItem,
} from "../../src/lib/editorial-debt";

// The field contract, parser, and index renderer live in src/lib/editorial-debt
// so the admin workbench derives the register the same way this CLI does. What
// stays here is everything that needs a filesystem: locating the register,
// reading item files, checking that cited sources exist, and writing the index.
export {
  editorialDebtKinds,
  editorialDebtResolutionSections,
  editorialDebtSeverities,
  editorialDebtStatuses,
  parseEditorialDebtItem,
  renderEditorialDebtIndex,
} from "../../src/lib/editorial-debt";
export type {
  EditorialDebtItem,
  EditorialDebtKind,
  EditorialDebtResolution,
  EditorialDebtSeverity,
  EditorialDebtStatus,
} from "../../src/lib/editorial-debt";

export const editorialDebtRoot = canonicalEditorialDebtRoot;
export const editorialDebtItemsRoot = path.join(editorialDebtRoot, "items");
export const editorialDebtIndexPath = path.join(editorialDebtRoot, "index.md");

export function validateEditorialDebtItems(
  items: EditorialDebtItem[],
  root = repoRoot,
): void {
  checkEditorialDebtIdentifiers(items);
  for (const item of items) {
    for (const source of item.sources) {
      const sourcePath = source.split("#", 1)[0]!;
      if (/^https?:\/\//.test(sourcePath)) continue;
      const absolute = path.resolve(root, sourcePath);
      const relative = path.relative(root, absolute);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        !fs.existsSync(absolute)
      ) {
        throw new Error(`${item.file}: source does not exist: ${sourcePath}`);
      }
    }
  }
}

export function loadEditorialDebtItems(
  itemsRoot = editorialDebtItemsRoot,
): EditorialDebtItem[] {
  if (!fs.existsSync(itemsRoot)) return [];
  return fs
    .readdirSync(itemsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const file = path.join(itemsRoot, entry.name);
      return parseEditorialDebtItem(file, readUtf8(file));
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function runEditorialDebtCli(args = process.argv.slice(2)): number {
  try {
    const write = args.includes("--write");
    const unknown = args.filter((arg) => arg !== "--write");
    if (unknown.length > 0) {
      throw new Error(`Unknown option(s): ${unknown.join(", ")}.`);
    }
    const items = loadEditorialDebtItems();
    validateEditorialDebtItems(items);
    const index = renderEditorialDebtIndex(items);
    if (write) {
      ensureDir(editorialDebtRoot);
      writeUtf8(editorialDebtIndexPath, index);
      console.log(
        `Updated editorial debt index for ${items.length.toLocaleString()} item(s).`,
      );
    } else {
      if (!fs.existsSync(editorialDebtIndexPath)) {
        throw new Error(
          "Editorial debt index is missing. Run npm run editorial:debt:update.",
        );
      }
      if (readUtf8(editorialDebtIndexPath) !== index) {
        throw new Error(
          "Editorial debt index is stale. Run npm run editorial:debt:update.",
        );
      }
      console.log(
        `Validated ${items.length.toLocaleString()} editorial debt item(s).`,
      );
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialDebtCli();
}
