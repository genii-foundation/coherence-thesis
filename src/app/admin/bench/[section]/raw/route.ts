import { headers } from "next/headers";

import { render } from "../../../../../../scripts/editorial/compare-render";
import { readCalibrationBench } from "../../benchData";

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

  const bench = readCalibrationBench(section);
  if (!bench) {
    return problem(
      `No complete comparison data is available for <code>${section}</code>.`,
    );
  }

  return new Response(render(bench.record, bench.baseText, bench.currentText), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
