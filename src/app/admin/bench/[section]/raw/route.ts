import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { headers } from "next/headers";

import {
  extractSection,
  render,
  type CalibrationRecord,
} from "../../../../../../scripts/editorial/compare-render";

// Renders a bench on request from the durable record, rather than serving a file the
// CLI wrote earlier. The renderer is shared with npm run editorial:compare, so there is
// one implementation and the two cannot drift.
//
// The admin layout gates its pages, but a route handler has no layout, so the same two
// server side conditions are repeated here. Both must fail closed.
function localOnly(host: string | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const hostname = ((host ?? "").split(":")[0] ?? "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function problem(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Calibration bench</title>
     <style>body{background:#f4ead7;color:#13202a;font:16px/1.6 ui-serif,Georgia,serif;margin:0;padding:14vh 8vw}
     a{color:#a47b3f}code{font-family:ui-monospace,monospace;font-size:14px}</style>
     <p>${message}</p><p>Close this frame and pick another session.</p>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ section: string }> },
): Promise<Response> {
  if (!localOnly((await headers()).get("host"))) return new Response("Not found", { status: 404 });

  const { section } = await context.params;
  // The section id arrives from the URL and is attacker controlled in principle.
  // Constrain it to the shape the records use rather than resolving whatever arrives.
  if (!/^[a-z0-9-]+$/.test(section)) return problem("That is not a section id.");

  const volume = `volume-${/^v(\d{2})-/.exec(section)?.[1] ?? ""}`;
  const root = process.cwd();
  const recordPath = path.join(root, "editorial/evidence/calibration", volume, `${section}.json`);
  if (!existsSync(recordPath)) return problem(`No calibration record for <code>${section}</code>.`);

  const record = JSON.parse(readFileSync(recordPath, "utf8")) as CalibrationRecord;
  if (!record.generations?.some((g) => Array.isArray(g.text))) {
    return problem(
      `<code>${section}</code> recorded a decision without generating variants, so there is nothing to compare side by side. Its findings are the evidence.`,
    );
  }

  const baselinePath = path.join(
    root,
    "editorial/evidence/reviews/volumes",
    volume,
    record.baseline.batchId,
    record.baseline.path,
  );
  if (!existsSync(baselinePath)) return problem(`Baseline missing for <code>${section}</code>.`);

  const baseText = extractSection(readFileSync(baselinePath, "utf8"), record.sectionHeading);
  if (!baseText.length) {
    return problem(`Heading “${record.sectionHeading}” is not in the baseline.`);
  }
  const currentText = extractSection(
    readFileSync(path.join(root, "editorial/sources/volumes", volume, "manuscript.md"), "utf8"),
    record.sectionHeading,
  );

  return new Response(render(record, baseText, currentText), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
