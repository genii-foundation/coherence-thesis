---
name: coherence-admin-local-preview
description: Launch, verify, and hand off a Coherence Thesis local development preview with the localhost administrative workbench. Use when an editor asks to open, start, run, preview, or inspect the local site, development server, admin interface, admin dashboard, workbench, or any `/admin` route.
---

# Local Preview

Give an editor one verified local site and administrative workbench without asking them to remember repository commands.

## Load the preview contract

1. Read the local preview review gate and admin workbench sections in `AGENTS.md`.
2. Use the managed process in `scripts/dev/preview.mjs` through the repository npm commands. Do not invent another server wrapper.
3. Work from the exact checkout or worktree the editor placed in scope.

## Start or reuse the preview

1. Inspect the current worktree, branch, Git SHA, and changes.
2. Select an unused localhost port. Honor a requested port. Otherwise prefer `55082` when it is free.
3. If a managed preview already exists, run `npm run preview:dev:status -- --port <port>`. Reuse it only when its worktree and candidate identity match the requested checkout.
4. Start a new managed preview when needed:

       npm run preview:dev -- --port <port>

5. Run the status command after startup. Confirm its worktree, branch, Git SHA, candidate digest, process state, and URL.
6. Open both the site root and `/admin/`. Confirm each responds successfully and that `/admin/` renders the administrative workbench rather than a public route or error page.

## Hand off to the editor

Immediately provide both direct links:

- `http://127.0.0.1:<port>/`
- `http://127.0.0.1:<port>/admin/`

State the serving worktree, branch, Git SHA, and whether the candidate is dirty. Keep the preview running while the editor reviews it.

If the managed process cannot remain alive, give the durable command from `AGENTS.md` for the editor to run in their own terminal. Do not claim a preview is available after its status becomes stale.

## Stop safely

Stop only the managed preview and port in scope, and only when the editor asks or the owning workflow reaches its documented cleanup point:

    npm run preview:dev:stop -- --port <port>

Never terminate an unidentified process or another worktree's preview.
