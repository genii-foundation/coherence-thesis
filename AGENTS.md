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
- Treat the canonical manuscripts at the confirmed adoption commit as the
  repository originals. Keep approved candidates outside the published
  checkpoint chain until production contains the exact approved bytes.
- A manuscript change that alters a section's spoken title or body invalidates
  that section's published audio. Before merging or deploying the changed
  manuscript, guide the author through publishing matching immutable audio and
  timing sidecars, promote the reviewed audio checkpoint, and run
  `npm run audio:verify-manuscript-publication -- --base <base-sha>`. A stale
  audio record, deferred debt item, or unavailable playback control does not
  waive this gate.
- Preserve unrelated local changes. Never reset, replace, or delete user work without explicit authorization.
- Search for an existing component, hook, script, parser, or helper before creating another one. Shared behavior belongs in a shared primitive.
- Verify every exported entry point has a real consumer before shipping.
- Use machine time for estimates. Do not quote human hours or days.

## Validation

Match validation to the files and behavior changed. Do not run unit, build, or
Playwright suites for agent-only instructions, skills, metadata, or simple
editorial prose changes that cannot affect executable behavior. For those
changes, run only the focused validators that own the changed records. Skills
and agent instructions require `npm run repository:validate-agents` plus the
current skill validator when available. Editorial prose requires the applicable
editorial, manuscript, continuity, and audio checks.

Run `npm run validate` when application logic, repository tooling, schemas, or
other executable behavior changes. If the change can affect browser behavior,
run the combined static and browser gate instead:

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
npm run audio:verify-manuscript-publication -- --base <base-sha>
npm run test:e2e:fast:desktop
npm run test:e2e:fast
```

Run `npm run readme:update` when package metadata, manuscript statistics, catalog state, or development status changes.

## Local preview review gate

A local preview is a required review artifact, not a courtesy link. Previewable changes include manuscript prose, overview copy, reader UI, navigation, styling, generated catalog consumption, and the localhost admin surface.

For every previewable change:

1. Build the smallest runnable slice in its exact worktree.
2. Before running a broad test suite, start the lightest useful preview on an unused port with `npm run preview:dev -- --port <port>`.
3. Run `npm run preview:dev:status -- --port <port>`. Confirm the reported worktree, branch, Git SHA, and candidate digest belong to the change under review. Open the affected route and verify the requested behavior yourself.
4. Immediately give the author the direct local URL and wait for review. Do not substitute a Vercel preview, screenshot, test result, or description.
5. Apply requested corrections locally and show the revised preview before pushing another candidate. Keep the preview alive until the author finishes reviewing it.
6. After validation and the final candidate commit, restart or reconfirm the preview against that exact commit and show it again. Do not push the previewable candidate or open or update its pull request until the author explicitly approves the local preview or explicitly waives this gate.

Do not open a pull request in the same turn as the first preview handoff unless the author has already reviewed that exact candidate. If the candidate changes after approval, the approval is stale and the gate repeats. A hosted preview never replaces this gate.

The agent-managed preview server may not survive a turn. Verify it again before claiming it is available. If a managed preview cannot remain available, report the concrete blocker and give the author the durable command:

```bash
npm run preview:dev -- --port <port>
```

Budget for the restart. `predev` runs `npm run manuscripts:prepare` first, so a cold start rebuilds 534 sections, the search index, and the PDF manifest before the server answers.

A durable server is the author's to run, because a process started from their own shell is not reaped:

```bash
npm run dev -- --hostname 127.0.0.1 --port 55082
```

An existing server is reusable only after its preview status proves that it serves the exact worktree and candidate under review. A `200` response by itself proves only that something is listening.

## The admin workbench

`/admin` is the author's view of work in flight. It is localhost only, it fails closed twice on the server, and it is read only with respect to `editorial/`. It shows the task queue, per volume progress, the calibration bench, and the mechanical gates.

The workbench is only worth having if it is true. Every status must belong to one of these classes:

- **Derived editorial state.** Read counts, coverage, settlement, questions, debt, and mechanical gates from their canonical records at request time. Do not copy derived counts into task prose. Rendering, settlement, approval, publication, and deployment are different states. Label the exact state shown.
- **Live repository state.** Show the current branch, commit, tracked or untracked worktree changes, remote divergence, and request time from Git. Never label a task date or cached build date as a repository snapshot.
- **Agent work state.** Record multi-step work in `editorial/evidence/tasks/tasks.json`. Before the first substantive mutation, add the task or move the existing task to `in-progress`. Move it to `blocked` when progress stops on a real dependency. Move it to `done` only after the result exists and has been exercised. Set `updated` whenever the register changes.

Quick work completed in one edit does not need a ceremonial task. Work with multiple implementation or validation phases does. The queue is a factual execution record, not a collection of intentions. `editorial/evidence/debt/` holds obligations that need the author's judgment. When a task turns out to require a decision rather than execution, move it across rather than leaving it pending forever.

The admin routes refresh from repository state while visible. Keep progress derivation shared between the admin reader, CLI report, and validation. Add every new status source to `npm run repository:validate-admin-status`, and add a browser test that proves the visible label matches the underlying state.

Audit follow through when the author asks what is outstanding, before every progress claim, and before declaring a body of work complete. Compare the task queue, debt ledger, current Git state, canonical evidence, and what was agreed in conversation. An agreement made in passing has no durable status until it becomes a task or debt item. Record anything still real in the same turn it is found.

A scoped loop stops at its own stop condition and touches nothing else. That is correct behavior and not evidence that the remaining queue is stale, but it does mean the queue must be reconciled by hand once the loop ends.

## Editorial pass preconditions

An editorial pass binds itself to authorities, and a pass launched under a stale authority does damage at scale with perfect confidence. Before launching any editorial render or audit pass, over one section or nine volumes, verify every authority it will bind to:

- The voice cards are approved and in effect, prepared from the immutable baselines rather than from shipped text. One pending card blocks the volumes it governs.
- The rule index in `editorial/method/standard.md` is ratified. A candidate rule recorded in a calibration record is a diagnostic, not authority.
- No validation gate covering the pass is suspended. A suspended gate marks an unresolved authority question, and the pass inherits it.
- Continuity records validate, so structural verification has a true census to check against.
- The pass brief names the authorities it binds to, so the record shows what the work believed at the time.

If any of these fails, the pass does not start. Surface the failure to the author and fix the authority first. This was learned by binding a nine volume re-render to voice cards that had been transcribed from the very pass whose damage it was repairing.

## What counts as structure

Three kinds of line generate a public route. Changing any of them is a continuity decision, not an editorial one, and it must go through the continuity workflow rather than through a manuscript edit.

- Any `#` through `####` heading.
- Any standalone bold line. The importer at `scripts/manuscripts/import-markdown.ts` matches `/^\*{2,3}\s*(.+?)\s*\*{2,3}$/` and returns it as a level three heading, so `**Label.**` on its own line is a section. A single asterisk italic line is not.
- Any prose between a part label and the first chapter heading beneath it. That text compiles into a chapter start section with its own route, so restoring a fuller part introduction revives a retired section.

An editorial pass may restore prose beneath a chapter heading freely. It may not rename, add, remove, split, merge, or relocate a structural line, and it may not lengthen a part introduction, because each of those mints or retires a URL.

Where a baseline structural line is better than the current one, record it as an open question naming both forms and the cost of the change. Do not act on it.

This was learned the hard way. Restoring baseline headings in one volume orphaned a route alias; changing `**The living world.**` to `**The living world (§2).**` changed a section id; and restoring six part introductions in another volume revived six retired routes and required author facing route adjudication to resolve. All three read as ordinary prose restoration.

## Responding to editorial feedback

When the author comments on how the wording of a specific section could be better, offer an intent-first revision session before editing. The session creates an ignored working page, asks what the author wants changed, and shows variants only after the author answers.

Offer it on any section level wording note, not only contested ones. Name the section, then give a slash command the author can paste into any agent session:

```
/coherence-editorial-calibration Start an intent-first revision session for <section-id> in <editorial-id>. Selected passage: "<the text they marked>". Paragraph anchor <paragraph-anchor>. Before proposing or changing prose, run `npm run editorial:revision -- start --section <section-id> --anchor <paragraph-anchor>`, share the local `/admin/revisions/<section-id>/` link, and ask me what I want changed. Wait for my answer. After I answer, preserve my direction only in the generated working session, produce distinct variants from the current canonical passage under the editorial standard and voice card, publish them to the working page, and guide me through comparison and iteration. Do not create or change any durable editorial record, manuscript, ruling, standard, voice card, ledger, or evidence until I explicitly approve a final version. After approval, mark the working version approved, update the manuscript, record the approved session and any guidance the decision actually establishes, validate the result, and share the finished page.
```

Make the offer in one line. If the author starts the session, do not continue with the edit until they state what should change.

A session proceeds one author decision at a time. Open the working page, ask for intent, publish variants, collect feedback, and iterate. Mark a variant approved only after the author explicitly approves the finished language.

Durable editorial state begins after approval. Until then, write only under `generated/revision-sessions/`. Do not create a calibration record, edit the manuscript, promote a rule, or write an agent ruling to keep the session moving. After approval, preserve the explored branches and the author's decision accurately, apply the approved text, and record only the section, volume, or corpus guidance the decision actually establishes.

## Git and pull requests

- Do not work directly in the primary `main` checkout. Use one focused branch and worktree per coherent change.
- Store every substantive worktree on durable user storage. Never create or continue substantive work in `/tmp`, `/private/tmp`, `/var/tmp`, `/var/folders`, an operating-system cache, or any path documented as temporary or automatically purged. Application defaults do not override this rule.
- At the start of work, resolve the worktree's absolute path and stop before the first mutation if it is inside temporary storage. Recreate or reattach the branch in a durable sibling worktree such as `<repository-parent>/<repository-name>-worktrees/<task-name>` first.
- Treat the worktree as a workspace, not a backup. After each coherent unit of substantive work, and before a restart, handoff, extended pause, preview review, or independent review, preserve tracked and relevant untracked source in a named checkpoint commit on the task branch. A checkpoint commit is not publication, merge approval, or permission to bypass editorial gates.
- Before removing any worktree, prove that it has no uncommitted or untracked source, identify the commit that preserves its work, and confirm that another durable ref can reach that commit. Never rely on a conversation transcript, reflog, generated output, stash, or temporary directory as the only copy of work.
- Use a short Conventional Commit branch prefix such as `feat/`, `fix/`, `edit/`, `docs/`, `chore/`, `refactor/`, or `perf/`.
- Use `edit/` for manuscript, overview, reviewed continuity, and related editorial changes.
- Refresh the pull request base before final validation. Run `npm run updates:generate` and commit `publishing/updates/snapshot.json` when it advances.
- Open a completed pull request in ready state. Use draft state only for incomplete work or a concrete missing gate.
- For previewable work, satisfy the local preview review gate before pushing the candidate or opening or updating its pull request.
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
