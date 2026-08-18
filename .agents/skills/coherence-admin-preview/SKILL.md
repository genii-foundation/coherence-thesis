---
name: coherence-admin-preview
description: Start, verify, and hand off the Coherence Thesis managed local preview and administrative workbench. Use when the author asks to start, open, launch, restart, inspect, or check the local preview, reader, admin workbench, dashboard, localhost site, or any `/admin` route, including the explicit `/coherence-admin-preview` slash command.
---

# Coherence Admin Preview

Start the repository-managed preview from the current Coherence Thesis worktree and return verified reader and admin URLs.

Use the managed process implemented by `scripts/dev/preview.mjs` through the repository npm commands. Do not invent another server wrapper.

## Start the preview

1. Read the root `AGENTS.md`. Preserve unrelated worktree changes.
2. Find an unused localhost port, starting at `55082` and incrementing until one is available. Use a read-only socket probe. Do not stop or replace an existing process merely to claim its port.
3. From the current repository worktree, run `npm run preview:dev -- --port <port>`. Allow the managed command to finish its startup work.
4. Run `npm run preview:dev:status -- --port <port>`.
5. Confirm all of the following before calling the preview ready:
   - `repoRoot` is the current worktree.
   - `branch`, `gitSha`, and `candidateDigest` describe the candidate being served.
   - `candidateMatchesStartedPreview` is `true`.
   - `managerAlive` and `serverAlive` are `true`.
6. If the user named a route, open or request that route and verify it responds. Otherwise verify `/` and `/admin/`, including that `/admin/` renders the administrative workbench rather than a public route or error page.
7. Run the status command once more after the route checks and reconfirm every identity and liveness field. The preview helper intentionally excludes Next.js's generated `next-env.d.ts` rewrite from candidate identity.
8. Return clickable links for the reader root and admin workbench, plus the branch, abbreviated Git SHA, and whether the candidate is dirty. State the concrete failure if any verification fails.

Keep the managed preview running after handoff. Do not run validation suites, commit, push, or open a pull request unless the user separately requests that work.

## Restart a stale preview

If the reported candidate does not match the current worktree, stop only that managed preview with `npm run preview:dev:stop -- --port <port>`, start it again on the same port, and repeat every verification step. Never stop an unverified process or a preview belonging to another worktree.

If a managed preview cannot remain alive, give the author the durable command from `AGENTS.md` to run in their own terminal. Do not claim that a preview remains available after its status becomes stale.
