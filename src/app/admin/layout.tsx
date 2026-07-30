import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNavigation } from "./AdminNavigation";
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
        <div className={styles.barInner}>
          <div className={styles.workspaceIdentity}>
            <span className={styles.mark}>Editorial workspace</span>
            <span className={styles.workspaceTitle}>Admin</span>
          </div>
          <AdminNavigation />
          <div className={styles.warn} aria-label="Local repository, read only">
            <span className={styles.statusDot} aria-hidden="true" />
            <span>Local repository</span>
            <span className={styles.warnDivider} aria-hidden="true" />
            <span>Read only</span>
          </div>
        </div>
      </header>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
