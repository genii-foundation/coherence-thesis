# Agent Instructions

This repository is the canonical source for The Coherence Thesis. Read this file first, then read the nearest nested `AGENTS.md` for the files you touch.

## Domain map

| Path | Authority | Local instructions |
| --- | --- | --- |
| `editorial/` | Manuscripts, voice cards, overview, reviews, debt, standards, schemas, and templates | `editorial/AGENTS.md` |
| `publishing/` | Durable continuity, audio publication, and Updates state | `publishing/AGENTS.md` |
| `generated/` and generated `public/data/` files | Disposable local output | Never commit |
| `scripts/` | Editorial, manuscript, audio, Updates, development, and repository tooling | `scripts/AGENTS.md` |
| `src/` | Reader application and server routes | `src/AGENTS.md` |
| `supabase/` | Database schema, policies, and migrations | `supabase/AGENTS.md` |
| `.agents/` | Repository skills and agent metadata | `.agents/AGENTS.md` |

## Core rules

- Edit canonical prose only in `editorial/sources/volumes/<editorial-id>/manuscript.md`.
- Keep each manuscript beside its `voice-card.md` and `volume.json`.
- Import canonical paths from `scripts/repository/paths.ts` in repository tooling. Do not scatter path literals.
- Do not edit generated reader sections, catalogs, reports, browser payloads, or PDFs by hand. Run `npm run manuscripts:prepare`.
- Build, preview, test, import, compile, and preparation commands must not modify `editorial/` or `publishing/`.
- Preserve historical source paths in each `volume.json`. Preserve old public links through the continuity workflow.
- Preserve unrelated local changes. Never reset, replace, or delete user work without explicit authorization.
- Search for an existing component, hook, script, parser, or helper before creating another one. Shared behavior belongs in a shared primitive.
- Verify every exported entry point has a real consumer before shipping.
- Use machine time for estimates. Do not quote human hours or days.

## Validation

Use focused checks while iterating. Before commit, run:

```bash
npm run validate
```

If the change can affect browser behavior, run the combined static and browser gate instead:

```bash
npm run validate:ui
```

Useful focused commands include:

```bash
npm run repository:validate-layout
npm run repository:validate-agents
npm run repository:source-boundary
npm run editorial:validate
npm run manuscripts:validate
npm run test:e2e:fast:desktop
npm run test:e2e:fast
```

Run `npm run readme:update` when package metadata, manuscript statistics, catalog state, or development status changes.

## Git and pull requests

- Do not work directly in the primary `main` checkout. Use one focused branch and worktree per coherent change.
- Use a short Conventional Commit branch prefix such as `feat/`, `fix/`, `edit/`, `docs/`, `chore/`, `refactor/`, or `perf/`.
- Use `edit/` for manuscript, overview, reviewed continuity, and related editorial changes.
- Refresh the pull request base before final validation. Run `npm run updates:generate` and commit `publishing/updates/snapshot.json` when it advances.
- Open a completed pull request in ready state. Use draft state only for incomplete work or a concrete missing gate.
- A stacked pull request may be ready for review, but it must be rebased onto current `main`, retargeted, refreshed, and revalidated before merge.
- Squash each focused pull request into `main` separately. Delete its branch and remove its worktree after merge.
- Pull request bodies and other external posts must begin with `(AI Generated).`
- Never include agent product names or similar implementation giveaways in external titles, branch names, or post bodies.
- State the exact remaining gate whenever a pull request should not merge yet.

## Updates history

The public Updates page is generated from every commit on `main`. Do not write manual changelog entries or edit `publishing/updates/snapshot.json` by hand. The Literary view is path derived. It recognizes current editorial manuscript paths and historical manuscript paths. A missing optional deployment link is allowed. A missing commit is not.

After a merge, verify that production `/updates/` contains the merged pull request or commit before closing the work.

## Interface rules

- Reader text must remain readable without JavaScript.
- Local progress is private by default. Do not add analytics, mandatory login, server history, or remote sync without explicit product approval.
- Keep controls and overlays reachable inside supported viewports. Menus must scroll internally when needed.
- Reuse the established button, radio, typography, radius, and focus patterns.
- Format user-facing numbers with `Number.toLocaleString()` or `Intl.NumberFormat`.
- Make long manuscript titles wrap or truncate without covering adjacent controls.

## Writing style

- Do not use em dashes, en dashes, or double hyphen prose constructions.
- Avoid filler phrases such as "delve into", "it's worth noting", "leverage" as a verb, "in today's world", "furthermore", "moreover", "additionally", "at the end of the day", "game-changer", and "seamlessly".
- Cut throat-clearing. Prefer short, concrete sentences.
- User-facing copy should sound human. Contractions are fine.

## Debugging standard

For rare, stateful, or intermittent failures, preserve evidence and make the next occurrence easier to explain. Useful evidence includes routes, visible state, local storage, catalog hashes, import reports, package versions, job output, and browser errors.

For SVG, canvas, or other geometry-sensitive work, verify rendered geometry after all transforms. Test representative boundaries and midpoints on desktop and mobile.

Mitigation should be conservative and observable. It should recover without churn and include tests for the failed state or threshold.
