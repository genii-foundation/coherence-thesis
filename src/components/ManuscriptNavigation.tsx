import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { NavigationItem } from "@/lib/manuscript-data";

export function ManuscriptNavigation({
  previous,
  parent,
  next,
}: {
  previous?: NavigationItem | null;
  parent: NavigationItem;
  next?: NavigationItem | null;
}) {
  return (
    <nav className="section-nav" aria-label="Page navigation">
      {previous ? (
        <Link className="section-nav-link section-nav-link-previous" href={previous.href}>
          <span className="section-nav-icon" aria-hidden="true">
            <ArrowLeft size={20} strokeWidth={1.6} />
          </span>
          <span className="section-nav-copy">
            <small>Previous</small>
            <strong>{previous.title}</strong>
          </span>
        </Link>
      ) : (
        <span className="section-nav-spacer" aria-hidden="true" />
      )}
      <Link className="section-nav-link section-nav-link-parent" href={parent.href}>
        <span className="section-nav-kicker">
          <span className="section-nav-icon" aria-hidden="true">
            <ArrowUp size={20} strokeWidth={1.6} />
          </span>
          <small>Up</small>
        </span>
        <strong>{parent.title}</strong>
      </Link>
      {next ? (
        <Link className="section-nav-link section-nav-link-next" href={next.href}>
          <span className="section-nav-copy">
            <small>Next</small>
            <strong>{next.title}</strong>
          </span>
          <span className="section-nav-icon" aria-hidden="true">
            <ArrowRight size={20} strokeWidth={1.6} />
          </span>
        </Link>
      ) : (
        <span className="section-nav-spacer" aria-hidden="true" />
      )}
    </nav>
  );
}
