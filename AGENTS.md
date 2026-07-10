# Agent Instructions

## Core Rules

- This repository is the canonical source of truth for The Coherence Thesis. Source manuscripts are Markdown files in `sources/manuscripts/`. Generated canonical reader sections live in `content/manuscripts/`.
- Do not edit generated manuscript data by hand. Edit source Markdown, then run the manuscript import, link preservation, and compile workflow. Compilation rebuilds public reader data, breadcrumb data, and the manuscript search index.
- After implementing any feature, run the narrowest useful checks during iteration, then run `npm run validate` before commit.
- For UI changes, use `npm run test:e2e:fast:desktop` for narrow desktop checks and `npm run test:e2e:fast` for broader local checks during iteration. Run `npm run test:e2e` before commit unless the change cannot affect browser behavior.
- After every completed feature, commit the complete change and open or update a focused PR without waiting to be asked again.
- Update `README.md` with `npm run readme:update` when package metadata, manuscript stats, generated catalog state, or development status changes.
- Before creating a new component, hook, script, or helper, search the repository for an existing primitive that does the same job. If two surfaces need the same UI or logic, extract a shared primitive and have both import it. Duplication is a bug unless there is a clear reason.
- Before shipping, verify every exported function, class, component, or script entry point you added is called from an appropriate consumer.
- Preserve unrelated local changes. Never reset, checkout, or delete user work unless explicitly asked.
- When estimating effort, describe machine time only, such as one conversation or about 10 minutes. Do not quote human hours or days.

## Manuscripts

- Authors edit source Markdown in `sources/manuscripts/` or series metadata in `content/series/`.
- Do not edit generated canonical reader sections in `content/manuscripts/` by hand. Run `npm run manuscripts:import`.
- Generated browser data lives in `public/data/`, including the reader payload, breadcrumb routes, and manuscript search index.
- Overview nodes live in `content/overview/` and must reference real section IDs.
- Public section IDs and headings are editorial material, not permanent wording constraints. Technical continuity IDs in `content/series/section-lineage.json` preserve reading history and route ancestry while public identities evolve. Preserve historical section routes in `content/series/aliases.json`, structural routes in `content/series/route-aliases.json`, and all published lineage in the append-only route ledger.
- New Markdown source updates must go through the publishing workflow:

```bash
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD --write
npm run manuscripts:compile
npm run manuscripts:validate
```

- Do not accept an import when the parser has collapsed, fragmented, reordered, or renamed sections incorrectly. Fix the source or importer first.
- Treat renamed, moved, split, merged, or removed sections as link preservation events. Do not keep a weak heading or obsolete ID merely to protect a URL. Run `npm run manuscripts:preserve-links` after import and before compile. Established lineage and unique unchanged content may carry forward automatically. Prose similarity is advisory only. Provide explicit section and structural mappings for every other case, then commit lineage and alias files. `manuscripts:validate` rejects missing routes and unrelated route reuse. Part, chapter, and volume membership may evolve when related lineage remains. Volume root paths remain fixed unless a separate site change adds reviewed redirects.
- Run `npm run manuscripts:audit-history -- --summary` after compilation whenever identities or routes change. It must report zero broken historical links across the complete first-parent catalog history.
- Record every discovered inconsistency, unfulfilled promise, unresolved claim, citation gap, canon conflict, literary weakness, link obligation, audio obligation, or editorial tooling limitation in `editorial/debt/items/`. Never delete a published debt item. Mark it resolved with evidence and retain its history. Reopen the same item if later evidence proves the paydown was partial. Run `npm run manuscripts:debt:update` after any debt change.

## Interface Rules

- Reader text must remain readable without JavaScript. Client islands may enhance progress, audio, menus, and preferences.
- Local progress is private by default. Do not add login, server-side reading history, analytics, or remote sync without explicit product approval.
- Toolbar controls must remain reachable at supported desktop and mobile widths. If controls collapse into a menu, make form controls fill the menu width.
- Floating menus, dropdowns, command palettes, and overlays must stay inside the viewport and scroll internally when content grows.
- Buttons and dialog controls should use the established button hierarchy, radius, typography, and focus states. Do not add hover lift, bounce, glossy buttons, or one-off gradient CTA treatments.
- Radio controls should use the shared connected radio pattern with `settings-radio-section`, `settings-radio-group`, and `settings-radio-option` unless native circles are explicitly required.
- User-facing numbers must use `Number.toLocaleString()` or `Intl.NumberFormat`.
- Long manuscript titles in compact UI must truncate or wrap cleanly. Text must not overlap adjacent controls.

## Writing Style

- Do not use em dashes, en dashes, or double hyphen prose constructions.
- Avoid AI filler phrases such as "delve into", "it's worth noting", "leverage" as a verb, "in today's world", "furthermore", "moreover", "additionally", "at the end of the day", "game-changer", and "seamlessly".
- Cut throat-clearing. If a first sentence only announces the paragraph, delete it.
- Prefer short concrete sentences. If a sentence needs heavy punctuation to stay standing, split it.
- User-facing copy should sound like a person wrote it. Prefer concrete language over abstract phrasing.
- Contractions are fine.
- Use `.agents/skills/coherence-editorial-review/` for manuscript audits, developmental review, sentence-level editing, and final editorial verification.
- Commit each pilot and production review under `editorial/reviews/<volume-id>/<batch-id>/`. Include a validated sentence ledger that accounts for every baseline sentence and reconstructs every current sentence exactly once. Include a validated structure ledger that does the same for every heading and standalone display unit.
- Read `editorial/debt/index.md` before each batch. Cite every debt item opened, carried, or resolved in the review record and pull request.
- Keep the corpus editorial audit advisory until every published volume has completed the new editorial pass. Hard fail completed volumes with `npm run manuscripts:editorial:strict -- --volume <volume-id>`. Add the global strict command to `npm run validate` only after all volumes are clean.

## Validation

- Default full gate:

```bash
npm run validate
```

- UI smoke gate:

```bash
npm run test:e2e
```

- Fast local UI gate, reuses or starts Next dev instead of rebuilding the production site:

```bash
npm run test:e2e:fast
```

For repeated UI loops, keep the isolated e2e dev server running in a separate terminal:

```bash
npm run dev:e2e
npm run test:e2e:fast:desktop
```

- Static preview:

```bash
npm run build
npm start
```

- `npm run validate` already validates manuscript references and generated artifact freshness, type checks, lints, runs unit tests, and builds the production site (a Next.js server deployment with statically prerendered pages plus the auth and account route handlers, not a static export).
- Use focused tests during implementation when they answer a specific question. Do not spend full validation time after every tiny visual tweak when a batch is still open.

## Git Workflow

- Do not work directly on `main` for feature, manuscript, or process changes unless the user explicitly asks for a direct commit.
- Use a separate git worktree for each feature, manuscript edit, bug fix, or process change. Keep the primary checkout on `main` as the clean integration workspace.
- Create a short branch with a Conventional Commit prefix, such as `feat/`, `fix/`, `edit/`, `docs/`, `chore/`, `refactor/`, or `perf/`, followed by a kebab-case description.
- Use `edit/` for manuscript updates, including changes to `content/manuscripts/`, `content/overview/`, import applications, and generated manuscript catalog updates caused by canonical text edits.
- Keep each PR focused. One worktree should map to one coherent PR.
- Commit messages should follow "Conventional Commits" when possible. Use `edit:` for manuscript updates.
- Run `npm run validate` before opening or updating a PR for merge.
- PR bodies must begin with `(AI Generated).`
- Squash merge into `main`, then delete the branch and remove the worktree.

## Debugging Standard

For rare, stateful, intermittent, or hard-to-reproduce failures, do not ship only a one-off patch. Preserve evidence, add targeted diagnostics when useful, and make the next occurrence easier to explain.

Good evidence can include route, visible UI state, local storage state, generated catalog hashes, import reports, build output, failed job output, package versions, and browser console errors.

Mitigation should be conservative and observable. It should recover without churn, log or expose the reason where appropriate, and include tests for the state machine or threshold that failed.
