import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import styles from "./admin.module.css";

// Admin tools read editorial and generated state off the filesystem, which does
// not exist on a deployed host. Two independent server side conditions gate the
// whole subtree, and both run before any child renders or touches the disk.
//
// A client side check would be decoration. This must fail closed.
function assertLocalOnly(host: string | null): void {
  if (process.env.NODE_ENV === "production") notFound();
  const hostname = ((host ?? "").split(":")[0] ?? "").toLowerCase();
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  if (!local) notFound();
}

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  assertLocalOnly((await headers()).get("host"));

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.mark}>Admin</span>
        <nav className={styles.nav}>
          <a href="/admin/">Status</a>
          <a href="/admin/calibration/">Editorial revisions</a>
        </nav>
        <span className={styles.warn}>local only, read only</span>
      </header>
      <main className={styles.main}>
        <AdminBreadcrumbs />
        {children}
      </main>
    </div>
  );
}
