# Agent Instructions

## Core Rules

- This repository is the canonical source of truth for The Coherence Thesis. Tracked source manuscripts are Markdown files in `sources/manuscripts/`. Reader sections and browser payloads are generated locally and are not committed.
- Do not edit generated manuscript data by hand. Edit source Markdown, then run `npm run manuscripts:prepare`. Development, tests, and builds run the same preparation automatically.
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
- Do not edit generated reader sections in `content/manuscripts/` by hand. They are ignored materializations created by `npm run manuscripts:prepare`.
- Generated browser payloads live in `public/data/` and remain ignored. `public/data/audio-manifest.json` is the exception because it records externally published immutable audio.
- Overview nodes live in `content/overview/` and must reference real section IDs.
- Stable section IDs support deep links, read progress, update badges, recommendations, audio queues, and future spaced repetition. Preserve historical deep links from this publishing pipeline forward with `content/series/aliases.json`.
- New Markdown source updates must go through the publishing workflow:

```bash
npm run manuscripts:import
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
```

- Do not accept an import when the parser has collapsed, fragmented, reordered, or renamed sections incorrectly. Fix the source or importer first.
- Treat removed or renamed sections as a link preservation event. Add aliases when old public routes should continue to resolve. `manuscripts:validate` enforces this through the durable section ledger. Automatic preparation never updates that ledger. Only `npm run manuscripts:record-routes` records reviewed public routes.

## Updates History

- The public `/updates/` page is generated from every commit on `main`. Do not write manual changelog entries.
- `src/generated/updates.json` is the checked fallback and immutable statistics cache. Never edit it by hand. In a pull request, do not discard it as incidental build churn when it advances through the current main base.
- After refreshing `origin/main`, run `npm run updates:generate` before the final commit on every pull request. Commit the snapshot when it advances. Pull request CI rejects a fallback cache that is behind the current base.
- A post-merge build on `main` necessarily advances the generated snapshot through its own commit. Do not create a recursive snapshot-only commit for that output. The next normal pull request persists it as part of its base refresh.
- Production builds must generate history through the exact deployed `main` SHA. They first expand a shallow checkout from the canonical public Git repository, then use the GitHub API as a fallback. If complete Git history and GitHub are both unavailable, production must fail without replacing the last good deployment. It must never publish a green but stale Updates page.
- Preserve the page contract when changing this pipeline: every commit appears, pull requests are the primary card target when the squash subject identifies one, commit hashes remain available, and file and line statistics remain exact in the generated data.
- After merging, verify that the production `/updates/` page contains the merged pull request or commit SHA before closing the task.

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
- Use `edit/` for manuscript updates, including changes to source Markdown, `content/overview/`, and reviewed durable publishing metadata.
- Keep each PR focused. One worktree should map to one coherent PR.
- Do not merge changes to a shared UI component inside a PR whose stated purpose does not mention that surface. Move the UI change to a focused branch, or expand the PR scope and validation evidence before review.
- Commit messages should follow "Conventional Commits" when possible. Use `edit:` for manuscript updates.
- Run `npm run validate` before opening or updating a PR for merge.
- PR bodies must begin with `(AI Generated).`
- Squash merge into `main`, then delete the branch and remove the worktree.

## Debugging Standard

For rare, stateful, intermittent, or hard-to-reproduce failures, do not ship only a one-off patch. Preserve evidence, add targeted diagnostics when useful, and make the next occurrence easier to explain.

Good evidence can include route, visible UI state, local storage state, generated catalog hashes, import reports, build output, failed job output, package versions, and browser console errors.

For transformed SVG, canvas, or other geometry-sensitive UI, test the rendered result after viewBox, element, CSS, and vector-effect transforms. Source attributes and normalized path arithmetic are not proof of visible geometry. Cover representative boundary and midpoint states on desktop and mobile.

Mitigation should be conservative and observable. It should recover without churn, log or expose the reason where appropriate, and include tests for the state machine or threshold that failed.
