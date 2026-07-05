import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ListTree } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="page-frame">
      <header className="page-heading">
        <p className="eyebrow">404</p>
        <h1>This page could not be found</h1>
        <p>
          The link may be out of date, or the section may have been renamed or
          moved.
        </p>
      </header>
      <div className="hero-actions">
        <Link className="primary-link" href="/">
          <BookOpen aria-hidden="true" size={18} />
          Return home
        </Link>
        <Link className="secondary-link" href="/overview/">
          <ListTree aria-hidden="true" size={18} />
          Read the overview
        </Link>
      </div>
    </div>
  );
}
