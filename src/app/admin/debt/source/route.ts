import { readFileSync } from "node:fs";
import path from "node:path";

import { headers } from "next/headers";

import { citedSourcePaths, readDebtRegister } from "../debtData";

// Serves a cited source as plain text so the evidence on a debt ticket can be
// checked without leaving the workbench.
//
// A route handler has no layout, so the admin subtree's two server side
// conditions are repeated here. Both fail closed.
function localOnly(host: string | null): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const hostname = ((host ?? "").split(":")[0] ?? "").toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!localOnly((await headers()).get("host"))) {
    return new Response("Not found", { status: 404 });
  }

  const wanted = new URL(request.url).searchParams.get("path") ?? "";
  // The allowlist is every path the register itself cites. Nothing is resolved
  // from the query string directly, so no traversal is reachable: a path that no
  // debt item names is simply not in the set.
  if (!citedSourcePaths(readDebtRegister()).has(wanted)) {
    return new Response(
      "That path is not cited by any editorial debt item.",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  try {
    return new Response(readFileSync(path.join(process.cwd(), wanted), "utf8"), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(`Cannot read ${wanted} from the working tree.`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
