---
name: coherence-build-feature
description: Build Coherence Thesis site features in the canonical repository, launch or refresh the static preview when useful, validate with the project gates, then commit and push to origin/main. Use for reader UI, manuscript navigation, progress, audio, overview, import tooling, generated catalog behavior, styling, tests, and project docs.
disable-model-invocation: true
---

# Build Feature

Implement a complete feature or fix in the Coherence Thesis repository, validate it, then commit and push it to `origin/main`.

## Workflow

1. Read `AGENTS.md`, `README.md`, and the files that own the requested surface.
2. Search for an existing component, helper, script, or pattern before adding a new one.
3. Keep manuscript source rules intact:
   - Canonical text lives in `content/manuscripts/`.
   - Generated catalog data lives in `src/generated/manuscripts/`.
   - Do not edit generated catalog data by hand.
4. Implement the smallest coherent slice that handles the request end to end.
5. Use focused checks while iterating:
   - `npm run manuscripts:compile` after manuscript or overview edits
   - `npm run manuscripts:validate` after manuscript or overview reference changes
   - `npm run test` after pure TypeScript or state helper changes
   - `npm run test:e2e` after reader navigation, toolbar, progress, audio, or responsive UI changes
6. Run `npm run readme:update` when stats, package metadata, recent commits, or development status changed.
7. Run `npm run validate` before committing.
8. If the change affects browser behavior, run `npm run test:e2e` before committing.
9. Stage the complete feature, commit with a Conventional Commit title, and push to `origin/main`.

## Preview

Use the static preview when the user should inspect the site or when visual verification matters:

```bash
npm run build
npm start
```

The default preview URL is `http://127.0.0.1:3100`.

## UI Rules

- Keep basic reading functional without JavaScript.
- Keep toolbar controls reachable on desktop and mobile.
- Keep dropdowns inside the viewport with internal scrolling when needed.
- Match existing typography, radius, color, spacing, and focus states.
- Do not add hover lift, bounce, glossy controls, or one-off gradients.
- Use `Number.toLocaleString()` or `Intl.NumberFormat` for displayed counts.

## Closeout

Close out with the commit hash, pushed branch, validation commands, and preview URL when a preview is running.
