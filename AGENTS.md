# Agent Instructions

## Core Rules

- This repository is the canonical source of truth for The Coherence Thesis. Source manuscripts are Markdown files in `sources/manuscripts/`. Generated canonical reader sections live in `content/manuscripts/`.
- Do not edit generated manuscript data by hand. Edit Markdown, then run `npm run manuscripts:compile`. This also rebuilds the public reader data, breadcrumb data, and manuscript search index.
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
- Stable section IDs support deep links, read progress, update badges, recommendations, audio queues, and future spaced repetition. Preserve historical deep links from this publishing pipeline forward with `content/series/aliases.json`.
- New Markdown source updates must go through the publishing workflow:

```bash
npm run manuscripts:import
npm run manuscripts:compile
npm run manuscripts:validate
```

- Do not accept an import when the parser has collapsed, fragmented, reordered, or renamed sections incorrectly. Fix the source or importer first.
- Treat removed or renamed sections as a link preservation event. Add aliases when old public routes should continue to resolve.

## Interface Rules

- Reader text must remain readable without JavaScript. Client islands may enhance progress, audio, menus, and preferences.
- Local progress is private by default. Do not add login, server-side reading history, analytics, or remote sync without explicit product approval.
- Toolbar controls must remain reachable at supported desktop and mobile widths. If controls collapse into a menu, make form controls fill the menu width.
- Floating menus, dropdowns, command palettes, and overlays must stay inside the viewport and scroll internally when content grows.
- Buttons and dialog controls should use the established button hierarchy, radius, typography, and focus states. Do not add hover lift, bounce, glossy buttons, or one-off gradient CTA treatments.
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

- Fast local UI gate, reuses or starts Next dev instead of rebuilding the static export:

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

- `npm run validate` already compiles manuscripts, validates manuscript references, lints, runs unit tests, and builds the static export.
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
