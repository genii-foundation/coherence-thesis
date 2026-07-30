import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { headers } from "next/headers";

// Serves a rendered bench out of generated/, which Next does not expose as a static
// route because generated output is disposable and never committed. Without this the
// calibration page could only print the command that writes the file.
//
// The admin layout gates its pages, but a route handler has no layout, so the same two
// server side conditions are repeated here. Both must fail closed.
function localOnly(host: string | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const hostname = ((host ?? "").split(":")[0] ?? "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ section: string }> },
): Promise<Response> {
  if (!localOnly((await headers()).get("host"))) return new Response("Not found", { status: 404 });

  const { section } = await context.params;
  // The section id is a path segment from the URL, so it is attacker controlled in
  // principle. Constrain it to the shape the calibration records actually use rather
  // than resolving whatever arrives and hoping it stays inside the directory.
  if (!/^[a-z0-9-]+$/.test(section)) return new Response("Not found", { status: 404 });

  const file = path.join(process.cwd(), "generated", "calibration", `${section}.html`);
  if (!existsSync(file)) {
    return new Response(
      `No bench rendered for ${section}. Run: npm run editorial:compare -- --section ${section}`,
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(readFileSync(file, "utf8"), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
