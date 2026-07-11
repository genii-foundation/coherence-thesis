---
name: coherence-ship-site
description: Prepare and verify the Coherence Thesis Next.js site for publishing, then document publish decisions, validation evidence, deploy state, and any publish-prep changes in a high-context pull request or closeout. Use when asked to ship, publish, deploy, create a preview, verify production build output, or confirm that origin/main contains a validated publishable state.
disable-model-invocation: true
---

# Ship Site

Prepare the manuscript site for publishing from the current `main` branch.

## Workflow

1. Verify the branch and working tree. Preserve unrelated local changes:

```bash
git branch --show-current
git status --short
```

2. For publish, deploy, preview, or verification against `main`, refresh the remote base before trusting the checkout:

```bash
git fetch origin main
git rev-parse origin/main
git rev-parse HEAD
```

If the fetch fails, stop and report the failure. If the requested publish target is `origin/main`, verify the checkout is at the freshly fetched `origin/main` or can fast-forward cleanly before validating. Do not publish, deploy, or verify a stale local `main` as current.
3. Pull or fetch any additional deployment refs only when needed for the requested publish action. Do not overwrite local changes.
4. Capture publish context while working:
   - What publish, preview, deploy, or verification request is being handled.
   - Which revision, branch, and generated catalog state are being verified.
   - Whether any publish-prep change was needed and why.
   - Which routes, browser behaviors, and deploy target evidence matter for this publish.
5. Refresh the checked Updates fallback through the target main revision and verify its head:

```bash
npm run updates:generate
npm run updates:verify -- <target-main-sha>
```

6. Run the full validation gate:

```bash
npm run validate
```

7. Run desktop and mobile browser smoke tests:

```bash
npm run test:e2e
```

8. Start or refresh the production preview:

```bash
npm start
```

9. Verify representative routes:
   - `/`
   - `/overview/`
   - `/updates/`
   - one deep manuscript section route
   - `/sitemap.xml`
   - `/robots.txt`
10. If a deployment target exists, use the project-approved deploy command for that target. Do not invent a raw deploy command. After a main deployment, verify that production `/updates/` contains the deployed commit SHA or merged pull request.
11. Review the final diff before staging. Confirm generated files are expected, README state is intentional, preview or deploy evidence is recorded, the Updates fallback is current, and unrelated local changes are left alone. When verifying an already merged main revision, do not create a snapshot-only commit just to record that revision. The next normal pull request carries it forward through its base refresh.
12. Commit any publish-prep changes with a Conventional Commit title, push the branch, and open or update a focused pull request. If the user explicitly requested direct main work, commit directly on `main` and do not open a pull request unless asked.

## Publishability Checks

- The production build must complete without route generation errors.
- `src/generated/manuscripts/catalog.json` must be fresh.
- `src/generated/updates.json` must match the target main revision before publish, and the live Updates page must contain the deployed SHA after publish.
- README status should reflect the current branch, revision, and manuscript stats.
- The site must remain readable without JavaScript.
- Toolbar progress, breadcrumbs, overview links, and audio controls should pass browser smoke tests.

## Pull Request Quality

Start from `.agents/templates/pull-request-description.md`. The body must begin with `(AI Generated).`

Include publish-specific context whenever it applies:

- The publish, deploy, preview, or verification request that prompted the work.
- The source revision, branch, generated catalog state, and README state being verified.
- The reason for any publish-prep change, including generated file refreshes or metadata updates.
- Representative routes checked and why they cover the publishing risk.
- Production preview, browser smoke, deployment command, deployment URL, and deploy status evidence.
- Any skipped, narrowed, retried, or failed validation with the exact reason.
- Known publish risks, such as stale generated data, route generation sensitivity, deployment target uncertainty, or follow-up monitoring.

## Commit Quality

Make every commit reviewable on its own:

- Keep publish-prep changes separate from unrelated feature or manuscript edits.
- Do not commit generated output unless it was intentionally refreshed for publishability.
- Make sure validation, preview, and deploy evidence in the closeout and pull request matches the actual commands run.
- If validation or deployment fails, either fix the cause or leave a precise blocker with the failing command and relevant output.

## Closeout

Close out with the commit hash when a commit was made, pushed branch, pull request URL when one exists, validation commands, representative routes checked, preview URL, deployment URL, and deploy status. If no code changed, state the verified revision and evidence instead.
