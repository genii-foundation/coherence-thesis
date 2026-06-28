---
name: coherence-ship-site
description: Prepare and verify the Coherence Thesis static site for publishing. Use when asked to ship, publish, deploy, create a preview, verify static export output, or confirm that origin/main contains a validated publishable state.
disable-model-invocation: true
---

# Ship Site

Prepare the static manuscript site for publishing from the current `main` branch.

## Workflow

1. Verify the branch and working tree:

```bash
git branch --show-current
git status --short
```

2. Pull or fetch only when needed for the requested publish action. Do not overwrite local changes.
3. Run the full validation gate:

```bash
npm run validate
```

4. Run desktop and mobile browser smoke tests:

```bash
npm run test:e2e
```

5. Start or refresh the static preview:

```bash
npm start
```

6. Verify representative routes:
   - `/`
   - `/overview/`
   - one deep manuscript section route
   - `/sitemap.xml`
   - `/robots.txt`
7. If a deployment target exists, use the project-approved deploy command for that target. Do not invent a raw deploy command.
8. Commit and push any publish-prep changes to `origin/main`.

## Publishability Checks

- Static export must complete without route generation errors.
- `src/generated/manuscripts/catalog.json` must be fresh.
- README status should reflect the current branch, revision, and manuscript stats.
- The site must remain readable without JavaScript.
- Toolbar progress, breadcrumbs, overview links, and audio controls should pass browser smoke tests.
