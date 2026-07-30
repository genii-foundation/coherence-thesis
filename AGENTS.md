# Agent Instructions

This repository is the canonical source for The Coherence Thesis. Read this file first, then read the nearest nested `AGENTS.md` for the files you touch.

## Domain map

| Path | Authority | Local instructions |
| --- | --- | --- |
| `editorial/` | Manuscripts, voice cards, overview, reviews, debt, standards, schemas, templates, and editorial guides | `editorial/AGENTS.md` |
| `publishing/` | Durable continuity, audio publication, Updates state, and publishing guides | `publishing/AGENTS.md` |
| `generated/`, `public/data/`, and `public/downloads/` | Disposable local output | Never commit |
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
npm run repository:validate-links
npm run repository:source-boundary
npm run readme:check
npm run editorial:validate
npm run manuscripts:validate
npm run test:e2e:fast:desktop
npm run test:e2e:fast
```

Run `npm run readme:update` when package metadata, manuscript statistics, catalog state, or development status changes.

## Local preview

The agent-managed preview server does not survive a turn. It runs as a child of the desktop application, and the harness reaps it when the turn ends, so a server confirmed healthy at the end of one reply is gone at the start of the next. Nothing crashes and nothing is logged. Do not diagnose this as a fault in the application, and do not tell the author the preview is running because it was running earlier.

Whenever a turn changes something the author would want to look at, verify the preview before the turn ends and start it if it is down:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 http://127.0.0.1:55082/
```

Anything other than `200` means start it with `preview_start` on the `coherence-reader` configuration, then give the author a direct link to the page the change affects rather than the site root. Previewable changes include manuscript prose, overview copy, reader UI, navigation, styling, generated catalog consumption, and the localhost admin surface.

Budget for the restart. `predev` runs `npm run manuscripts:prepare` first, so a cold start rebuilds 534 sections, the search index, and the PDF manifest before the server answers.

A durable server is the author's to run, because a process started from their own shell is not reaped:

```bash
npm run dev -- --hostname 127.0.0.1 --port 55082
```

The `coherence-reader-attach` configuration in `.claude/launch.json` connects to that server instead of spawning another. Prefer it whenever port 55082 is already answering.

## The admin workbench

`/admin` is the author's view of work in flight. It is localhost only, it fails closed twice on the server, and it is read only with respect to `editorial/`. It shows the task queue, per volume progress, the calibration bench, and the mechanical gates.

The workbench is only worth having if it is true. Two obligations follow.

**Refresh `editorial/evidence/tasks/tasks.json` in the same change that moves the work.** Add a task when you agree to do something that will not be finished in the current turn. Move it to `in-progress` when you start, and to `done` only once the thing exists and has been exercised. Never mark a task done in advance of the work; a queue that describes intentions is worse than no queue, because it is read as a record of fact. Set `updated` whenever the file changes.

The queue holds agent executable work. `editorial/evidence/debt/` holds obligations that need the author's judgment. When a task turns out to require a decision rather than execution, move it across rather than leaving it pending forever.

**Audit follow through when the author asks what is outstanding, and before declaring a body of work complete.** Compare three sources: the task queue, the debt ledger, and what was actually agreed in conversation. The third is the one that rots, because an agreement made in passing leaves no artifact unless someone writes it down. Anything found there that is still real becomes a task in the same turn it is found.

A scoped loop stops at its own stop condition and touches nothing else. That is correct behavior and not evidence that the remaining queue is stale, but it does mean the queue must be reconciled by hand once the loop ends.

## Responding to editorial feedback

When the author comments on how the wording of a specific section could be better, offer the calibration bench before editing. The bench compares the section's immutable baseline against each variant and records the reasoning, so a ruling improves every later pass instead of one paragraph.

Offer it on any section level wording note, not only contested ones. Name the section, then give a slash command the author can paste into any agent session:

```
/coherence-editorial-calibration Open a revision session for <section-id> in <editorial-id>. The author's note: "<their words>". Selected passage: "<the text they marked>". Open the record at editorial/evidence/calibration/<editorial-id>/<section-id>.json, derive variants from the immutable baseline under editorial/method/standard.md and the volume voice card, and render the bench with npm run editorial:compare -- --section <section-id>. Then present the variants with what each one changes and why, and stop. Do not record a ruling: the ruling is the author's to make. Once they have chosen, record it with `by` set to `author`, its scope, and the occasion, and promote any corpus scoped ruling into a named obligation.
```

Make the offer in one line and continue with the edit rather than blocking on an answer. If the author takes the offer, the ruling supersedes the edit.

A session ends at the presentation of variants. Deriving options and then recording your own decision is a session held with yourself, and it produces a record that claims a warrant it does not have. Record a ruling only after the author has chosen, and attribute it to them. Where you must decide something to keep moving, record it as a working note with `by` set to `editorial-agent`, and say plainly that it is unattended.

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
