import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  buildRouteLedger,
  buildSectionLedger,
  routeLedgerPath,
  sectionLedgerPath,
  type CompiledCatalog,
  type RouteLedger,
  type SectionLedger,
} from "./shared";
import { validateManuscripts } from "./validate";

type RecordRoutesOptions = {
  catalog?: CompiledCatalog;
  ledgerPath?: string;
  routeLedgerPath?: string;
  validate?: () => void;
};

function readSectionLedger(filePath: string): SectionLedger {
  if (!fs.existsSync(filePath)) return { version: 1, routes: [] };
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SectionLedger;
}

function readRouteLedger(filePath: string): RouteLedger {
  if (!fs.existsSync(filePath)) return { version: 2, routes: [] };
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as RouteLedger;
}

function writeAtomically(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, value);
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function recordSectionRoutes(
  options: RecordRoutesOptions = {},
): boolean {
  const filePath = options.ledgerPath ?? sectionLedgerPath;
  const routeFilePath =
    options.routeLedgerPath ??
    (options.ledgerPath
      ? path.join(path.dirname(options.ledgerPath), "route-ledger.json")
      : routeLedgerPath);
  const catalog = options.catalog ?? buildCatalog();
  const validate = options.validate ?? validateManuscripts;
  const hadLedger = fs.existsSync(filePath);
  const hadRouteLedger = fs.existsSync(routeFilePath);
  const original = hadLedger ? fs.readFileSync(filePath, "utf8") : null;
  const originalRoutes = hadRouteLedger
    ? fs.readFileSync(routeFilePath, "utf8")
    : null;
  const committed = readSectionLedger(filePath);
  const committedRoutes = readRouteLedger(routeFilePath);
  const candidateLedger = buildSectionLedger(catalog, committed);
  const candidateRouteLedger = buildRouteLedger(
    catalog,
    committedRoutes,
    candidateLedger,
  );
  const candidate = `${JSON.stringify(candidateLedger, null, 2)}\n`;
  const candidateRoutes = `${JSON.stringify(candidateRouteLedger, null, 2)}\n`;

  if (original === candidate && originalRoutes === candidateRoutes) {
    validate();
    console.log("Published route ledgers are already current.");
    return false;
  }

  writeAtomically(filePath, candidate);
  writeAtomically(routeFilePath, candidateRoutes);
  try {
    // The full validator reads the candidate at its canonical location. The
    // replacement is transactional: a failure restores the exact prior file,
    // so an invalid publishing state cannot escape this command.
    validate();
  } catch (error) {
    if (original === null) {
      fs.rmSync(filePath, { force: true });
    } else {
      writeAtomically(filePath, original);
    }
    if (originalRoutes === null) {
      fs.rmSync(routeFilePath, { force: true });
    } else {
      writeAtomically(routeFilePath, originalRoutes);
    }
    throw error;
  }

  console.log(
    `Recorded ${candidateLedger.routes.length.toLocaleString()} section routes and ${candidateRouteLedger.routes.length.toLocaleString()} published routes.`,
  );
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    recordSectionRoutes();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
