---
name: coherence-ship-site
description: Merge, publish, and verify an explicitly approved Coherence Thesis production revision from current origin/main with complete history, current generated output, required validation, deployment evidence, and live Updates verification. Use only when the user asks to merge, ship, deploy, publish, or verify production. Do not use for ordinary feature previews.
---

# Ship Site

Publish only an explicitly approved revision. Fail closed when the target, history, validation, or deployment state is uncertain.

## Establish the target

1. Read the root AGENTS.md and publishing/AGENTS.md.
2. Confirm the exact pull request, branch, revision, and requested production action.
3. Preserve unrelated local work.
4. Fetch origin/main and verify the checkout against the fresh remote revision.
5. If a pull request is not yet merged, confirm approval, required checks, review status, focused scope, and a current base before merging.

## Verify publication state

- Canonical editorial source lives under editorial/sources/.
- Reviewed continuity, audio, and Updates state lives under publishing/.
- Generated output is untracked and must be recreated from source.
- Build, preview, and test commands must not modify editorial/ or publishing/.

Refresh the checked Updates snapshot through the target revision and verify its head:

    npm run updates:generate
    npm run updates:verify -- <target-revision>

Run the complete gates on the final revision:

    npm run validate:ui

The combined gate builds once and runs the browser suite against that exact production build.

## Merge and deploy

1. Merge only after the final base refresh and required validation succeed.
2. Use the repository's normal focused squash workflow.
3. Use only the project-approved deployment mechanism.
4. Do not weaken history freshness, continuity validation, generated boundaries, or deployment link checks to obtain a green result.
5. Never create a recursive snapshot-only commit after a main build advances generated history.

## Verify production

Check representative production routes:

- The home page.
- The overview.
- The Updates page.
- One deep manuscript route.
- The sitemap.
- The robots file.

Confirm:

- The deployment corresponds to the merged revision.
- The live Updates page contains the merged pull request or revision.
- Manuscript text remains readable without JavaScript.
- Required continuity and audio state are current.
- No stale or partial deployment replaced the last good release.

If deployment or live verification fails, continue the authorized ship task with a focused fix. Do not declare success until production and Updates are current.

## Closeout

Report the merged revision, deployment URL, validation evidence, representative routes, live Updates evidence, and any remaining publication risk. Delete the merged branch and remove its worktree only after production verification succeeds.
