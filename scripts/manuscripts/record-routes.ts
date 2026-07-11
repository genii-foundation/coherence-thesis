import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCatalog,
  buildSectionLedger,
  sectionLedgerPath,
  type CompiledCatalog,
  type SectionLedger,
} from "./shared";
import { validateManuscripts } from "./validate";

type RecordRoutesOptions = {
  catalog?: CompiledCatalog;
  ledgerPath?: string;
  validate?: () => void;
};

function readLedger(filePath: string): SectionLedger {
  if (!fs.existsSync(filePath)) return { version: 1, routes: [] };
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as SectionLedger;
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
  const catalog = options.catalog ?? buildCatalog();
  const validate = options.validate ?? validateManuscripts;
  const hadLedger = fs.existsSync(filePath);
  const original = hadLedger ? fs.readFileSync(filePath, "utf8") : null;
  const committed = readLedger(filePath);
  const candidateLedger = buildSectionLedger(catalog, committed);
  const candidate = `${JSON.stringify(candidateLedger, null, 2)}\n`;

  if (original === candidate) {
    validate();
    console.log("Published section route ledger is already current.");
    return false;
  }

  writeAtomically(filePath, candidate);
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
    throw error;
  }

  console.log(
    `Recorded ${candidateLedger.routes.length.toLocaleString()} published section routes.`,
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
