---
name: coherence-utility-ship-site
description: Merge, publish, and verify an explicitly approved Coherence Thesis production revision from current origin/main with complete history, current generated output, required validation, deployment evidence, and live Updates verification. Use only when the user asks to merge, ship, deploy, publish, or verify production. Do not use for ordinary feature previews.
---

# Ship Site

Publish only an explicitly approved revision. Fail closed when the target, history, validation, or deployment state is uncertain.

## Establish the target

1. Read the root AGENTS.md and publishing/AGENTS.md.
2. Confirm the exact pull request, branch, revision, and requested production action.
3. Preserve unrelated local work.
4. Fetch origin/main and verify the checkout against the fresh remote revision.
5. If a pull request is not yet merged, confirm approval, required checks, review status, focused scope, and a current base before merging. Run `npm run repository:validate-pr-topology -- --pr <number>` and stop unless every open pull request targets `main`.

## Verify publication state

- Canonical editorial source lives under editorial/sources/.
- Reviewed continuity, audio, and Updates state lives under publishing/.
- Generated output is untracked and must be recreated from source.
- Build, preview, and test commands must not modify editorial/ or publishing/.

If the target changes any canonical manuscript, resolve its fresh base SHA and
run:

    npm run audio:verify-manuscript-publication -- --base <base-sha>

The command must pass before merge and again after a base refresh. If it fails,
show the author the exact sections and return to the audio republication steps
in coherence-utility-manuscript-publish. Do not merge, deploy, hide audio, or accept a
deferred record in place of matching immutable clips and timing sidecars.

Refresh the checked Updates snapshot through the target revision and verify its head:

    npm run updates:generate
    npm run updates:verify -- <target-revision>

Choose the final gate from the target diff:

- Agent-only instructions, skills, and metadata: run `npm run repository:validate-agents` and the current validator for each changed skill when available. Do not run unit, build, or Playwright suites.
- Simple editorial prose with no route or executable change: run the applicable editorial, manuscript, continuity, and audio checks. Do not run application test suites.
- Application logic, repository tooling, schemas, or other executable behavior: run `npm run validate`.
- Browser-visible behavior, routes, rendering, player code, or reader interaction: run `npm run validate:ui`.

Do not broaden validation merely because the change is being shipped. Record the exact focused evidence used.

## Merge and deploy

1. Merge only after the final base refresh, required validation, and pull request topology check succeed.
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

## Finalize manuscript publication

When the release contains a staged manuscript candidate:

1. Resolve the exact production commit containing the deployed manuscript.
2. Run `npm run editorial:checkpoints -- publish` with that commit and the
   verified publication date.
3. Review the manifest diff. The approved candidate must move into the
   published checkpoint chain without changing its snapshot hash.
4. Commit and merge the checkpoint update through the normal focused workflow.
5. Revalidate the lineage and confirm future revision sessions select the new
   published checkpoint.

Production publication is incomplete until this record is merged. Do not mark
the checkpoint published from a deployment request, a candidate commit, or a
green build alone.

## Closeout

Report the merged revision, deployment URL, validation evidence, representative routes, live Updates evidence, and any remaining publication risk. Retain the remote branch as recoverable history. Remove its clean local worktree and branch only after production verification succeeds.
