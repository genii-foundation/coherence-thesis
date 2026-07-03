import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Only same-origin, non-protocol-relative paths are allowed as a redirect
// target, so a crafted `?next=//evil.example` or `?next=https://evil.example`
// cannot bounce a freshly signed-in reader off-site.
function safeNextPath(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/?auth=error", requestUrl.origin));
}
