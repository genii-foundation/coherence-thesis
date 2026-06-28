<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Instructions

## Core Rules

- This repository is the canonical source of truth for The Coherence Thesis. Word documents are import inputs and provenance. Canonical manuscript text lives in `content/manuscripts/`.
- Do not edit generated manuscript data by hand. Edit Markdown, then run `npm run manuscripts:compile`.
- After implementing any feature, run the narrowest useful checks during iteration, then run `npm run validate` before commit.
- For UI changes, also run `npm run test:e2e` unless the change cannot affect browser behavior.
- After every completed feature, commit and push to `origin/main` without waiting to be asked again.
- Update `README.md` with `npm run readme:update` when package metadata, manuscript stats, generated catalog state, or development status changes.
- Before creating a new component, hook, script, or helper, search the repository for an existing primitive that does the same job. Duplication is a bug unless there is a clear reason.
- Before shipping, verify every exported function, class, component, or script entry point you added is called from an appropriate consumer.
- Preserve unrelated local changes. Never reset, checkout, or delete user work unless explicitly asked.

## Manuscripts

- Authors edit Markdown in `content/manuscripts/`.
- Overview nodes live in `content/overview/` and must reference real section IDs.
- Stable section IDs support deep links, read progress, update badges, recommendations, audio queues, and future spaced repetition. Preserve IDs when a section remains conceptually the same.
- New Word imports must go through the review workflow:

```bash
npm run manuscripts:import -- --source /absolute/path/to/manuscript.docx
npm run manuscripts:diff-import -- --draft artifacts/imports/<import-id>/content/manuscripts
npm run manuscripts:apply-import -- --draft artifacts/imports/<import-id>/content/manuscripts --force
npm run manuscripts:compile
npm run manuscripts:validate
```

- Do not apply a draft import when the parser has collapsed, fragmented, reordered, or renamed sections incorrectly. Fix the draft or importer first.
- Treat removed sections in an import diff as a review event. Confirm intent before applying.

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

- Static preview:

```bash
npm run build
npm start
```

- `npm run validate` already compiles manuscripts, validates manuscript references, lints, runs unit tests, and builds the static export.
- Use focused tests during implementation when they answer a specific question. Do not spend full validation time after every tiny visual tweak when a batch is still open.

## Git Workflow

- Work on the current branch unless the user asks for a separate branch. This repository currently ships directly from `main`.
- Commit messages should follow Conventional Commits when possible:
  - `feat:` for user-facing features
  - `fix:` for bug fixes
  - `chore:` for tooling, dependencies, or config
  - `docs:` for documentation-only changes
  - `refactor:` for behavior-preserving restructuring
  - `perf:` for performance improvements
  - `style:` for CSS or formatting-only changes
- After validation, stage the complete feature, commit it, and push to `origin/main`.

## Debugging Standard

For rare, stateful, intermittent, or hard-to-reproduce failures, do not ship only a one-off patch. Preserve evidence, add targeted diagnostics when useful, and make the next occurrence easier to explain.

Good evidence can include route, visible UI state, local storage state, generated catalog hashes, import reports, build output, failed job output, package versions, and browser console errors.

Mitigation should be conservative and observable. It should recover without churn, log or expose the reason where appropriate, and include tests for the state machine or threshold that failed.
