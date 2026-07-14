---
name: coherence-repository-maintenance
description: Audit and maintain Coherence Thesis repository structure, branches, worktrees, governance, skills, scripts, generated boundaries, licensing, ownership, CI, and documentation without absorbing product or manuscript work. Use for branch cleanup, orphan analysis, repository restructuring, path migrations, agent instruction updates, skill maintenance, dependency hygiene, and focused maintenance pull requests.
---

# Repository Maintenance

Keep repository structure honest, comprehensible, and reversible. Audit first. Mutate only the scope the user authorizes.

## Establish scope

1. Read the root AGENTS.md and each nested AGENTS.md that governs the target.
2. Inspect repository status and preserve unrelated work.
3. Refresh remote references when safe.
4. Define the requested maintenance boundary before editing or deleting anything.
5. Use an isolated worktree for maintenance changes unless direct main work is explicitly authorized.

Do not mix reader features, manuscript prose, editorial judgment, or production publication into a maintenance pull request.

## Audit branches and worktrees

Treat branch, pull request, and worktree audits as read-only unless deletion, closure, merge, or cleanup is explicitly authorized.

1. Enumerate every remote branch except the protected base.
2. Map each branch to all pull requests and states.
3. Check whether an open pull request uses the branch as a head or base.
4. Compare current branch heads with recorded pull request heads.
5. Distinguish squash-merged residue from unique unmerged work with content and history evidence.
6. Inspect local branches and worktrees before remote deletion.
7. Produce an exact preserve, delete, continue, or review disposition for every branch.

Never infer that a branch is safe merely because its original pull request merged.

## Maintain structure and governance

- Keep editorial source under editorial/sources/.
- Keep reviewed publication state under publishing/.
- Keep generated output untracked.
- Centralize canonical paths in scripts/repository/paths.ts.
- Preserve every historical source path and old literary Updates prefix.
- Keep nested AGENTS.md files scoped to real domain boundaries.
- Keep skills concise, valid, and linked to canonical repository guidance.
- Keep CODEOWNERS, NOTICE, license maps, README, CONTRIBUTING, and CI aligned with path changes.
- Do not duplicate policy across root instructions, nested instructions, skills, and human documentation.

## Handle durable state

- Default audits and validators to read-only behavior.
- Require an explicit command and reviewed diff for durable editorial or publishing writes.
- Never make build, preview, test, import, compile, or preparation commands rewrite editorial/ or publishing/.
- Preserve append-only ledgers, immutable publication objects, and historical review evidence.
- Respect mixed licensing when moving files across boundaries.

## Validate

Run focused checks for the affected system first. Then run:

    npm run validate

Run the combined static and browser gate only when maintenance can affect browser behavior:

    npm run validate:ui

After changing skills or instructions, run `npm run repository:validate-agents` and validate every affected skill with the Skill Creator validator when available. After path or ownership changes, run `npm run repository:validate-layout`, `npm run repository:source-boundary`, and any focused tests for license maps or ownership files.

## Deliver

1. Review the final diff for unrelated changes and generated output.
2. Use a maintenance, refactor, documentation, or fix commit title that states the real effect.
3. Push one focused branch and open or update one focused pull request when changes were authorized.
4. Report commands, evidence, remaining risks, and any external cleanup completed.
5. Do not merge, delete remote state, or publish unless the user explicitly asked for that action.
