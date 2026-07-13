# Contributing to The Coherence Thesis

Thank you for helping improve the manuscripts, reader, publishing tools, or project documentation.

This is an open source project with deliberate editorial stewardship. Contributions are welcome. Final decisions about the roadmap, manuscript canon, releases, repository access, and merges belong to the repository maintainer, [@AubreyF](https://github.com/AubreyF).

## Before You Start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before starting a large feature, architecture change, new dependency, manuscript restructuring, or substantial editorial rewrite.
- Small fixes, tests, documentation improvements, and narrowly scoped accessibility changes can go directly to a pull request.
- Report security concerns privately through [SECURITY.md](SECURITY.md). Never include exploit details, credentials, or personal data in a public issue.

## Ways to Contribute

- Fix a bug or accessibility problem
- Improve tests, documentation, or development tooling
- Improve reader performance or browser compatibility
- Correct a typo or broken internal reference
- Propose manuscript edits with a clear editorial reason
- Preserve old public links when manuscript structure changes
- Reproduce and document an issue before proposing a fix

Manuscript work receives editorial review in addition to technical review. A technically valid change may still be declined if it conflicts with the voice, structure, claims, or intended direction of the project.

## Local Setup

The recommended runtime is Node.js 22, recorded in `.nvmrc`. Node.js 20.9 or newer is supported by the package metadata.

```bash
git clone https://github.com/<your-account>/coherence-thesis.git
cd coherence-thesis
nvm use
npm run bootstrap
npm run dev
```

The site works locally without account credentials. To work on sign-in or reader sync, copy `.env.example` to `.env.local` and use credentials from your own Supabase project. Never commit `.env.local`, service role keys, API keys, session data, or production credentials.

## Branches and Commits

Create a focused branch from the current `main` branch. Use a short prefix that describes the kind of work:

- `feat/` for a new capability
- `fix/` for a bug fix
- `edit/` for manuscript or overview changes
- `docs/` for documentation
- `chore/` for maintenance
- `refactor/` for behavior-preserving code changes
- `perf/` for performance work

Use Conventional Commit titles when practical, such as `fix: preserve aliases for renamed sections` or `docs: clarify local setup`.

Do not push directly to `main`. All changes enter through pull requests, and only the repository maintainer merges them.

## Source and Generated Files

The source manuscript workflow is intentionally strict:

- Edit manuscript text in `sources/manuscripts/`.
- Edit volume metadata and deliberate route aliases in `content/series/`.
- Edit overview nodes in `content/overview/`.
- Do not edit `content/manuscripts/`, `src/generated/manuscripts/`, or generated `public/data/` payloads by hand.
- Do not commit disposable manuscript output. `public/data/audio-manifest.json` remains tracked because it records hosted immutable audio.

For manuscript or series changes, run:

```bash
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
```

Review the ignored local materialization and import report. Do not accept an import that collapses, fragments, reorders, or incorrectly renames sections. Only source files and reviewed durable publishing state should appear in the Git diff.

Public headings and section IDs may improve, but their continuity identities and published routes remain durable. Run the preservation plan for every structural edit, review its lineage and aliases, then record the route set explicitly. Validation rejects silent link loss. The full process is documented in [Manuscript Link Continuity](docs/manuscript-link-continuity.md).

## Application Changes

- Keep manuscript text readable without JavaScript.
- Keep reading progress local and private by default.
- Do not add analytics, mandatory accounts, remote history, or sync behavior without explicit product approval.
- Reuse existing components, hooks, scripts, and interface patterns before creating new ones.
- Match the established button hierarchy, focus states, typography, radius, and responsive behavior.
- Keep controls and overlays reachable within supported desktop and mobile viewports.
- Add or update coverage for behavior changes.
- Verify every new exported entry point has a real consumer.

## Updates History

The public Updates page is compiled from `main`. Contributors do not write changelog entries by hand.

After bringing a pull request up to date with `main`, refresh the checked fallback and commit it when it changes:

```bash
npm run updates:generate
```

This local command preserves cached deployment links. Maintainers can explicitly revalidate historical deployment links with `npm run updates:generate -- --refresh-deployments`. Production publications always perform that revalidation.

Do not edit `src/generated/updates.json` manually. It caches immutable file and line statistics by commit SHA so production only needs to fetch the newest merge. Pull request CI checks that this cache matches the current base. A shallow production checkout first expands `main` from the canonical public Git repository, then falls back to the GitHub API. The deployment fails instead of publishing stale history when neither source can generate through the deployed main SHA.

The default Updates view includes every commit. The Literary view includes commits whose changed or renamed paths touch `sources/manuscripts/` or `content/manuscripts/`. This path rule preserves manuscript history across the source publishing transition and does not rely on commit message conventions.

Cards may include a best effort `View version` link to the successful public Vercel production deployment for the exact full commit SHA. Every Vercel production publication rechecks every stored historical URL and removes links confirmed unavailable. Transient failures preserve the previous mapping because they do not prove that Vercel deleted the deployment. Historical checks use bounded concurrency and per-request timeouts. Discovery of previously unknown links stops starting new batches after a fixed window. CI remains cache only because it validates but does not publish the site. Version link lookup must not relax the requirement for complete, current commit history.

## Validation

Run focused checks while developing. For changes that cannot affect browser behavior, run the full static gate before requesting review:

```bash
npm run validate
```

If the change can affect browser behavior, use the combined final gate instead. It builds once and runs Playwright against that exact build:

```bash
npm run validate:ui
```

`npm run test:e2e` remains available as a self-contained browser gate when a validated production build does not already exist.

Useful focused checks include:

```bash
npm run manuscripts:validate
npm run typecheck
npm run lint
npm run test
npm run test:app
npm run test:tooling
npm run test:changed
npm run test:e2e:fast:desktop
npm run test:e2e:fast
```

Run `npm run readme:update` when package metadata, manuscript statistics, the generated catalog, or development status changes.

If a check fails for a reason outside your change, include the exact command, relevant output, and your evidence that the failure is unrelated. Please do not achieve green checks by deleting the witness. The compiler remembers, even when we wish it did not.

## Pull Request Expectations

Keep each pull request focused on one coherent purpose. Include:

- What changed and why
- The issue, reader need, or publishing constraint addressed
- Important implementation or editorial decisions
- Tests and validation commands run
- Screenshots or a preview link for visible interface changes
- Durable route, provenance, or hosted-audio state and why it changed
- Known limits, risks, or follow-up work

Resolve review conversations and keep the branch current with `main`. Maintainers may close stale, unsafe, duplicative, or out-of-scope proposals.

## Licensing and Original Work

This repository has two license domains:

- Software, scripts, tests, configuration, and build tooling use the Apache License 2.0 in `LICENSE`.
- Manuscripts, site copy, overview text, and owned artwork use CC BY-SA 4.0 in `LICENSE-content`.

`NOTICE` contains the path-level mapping. Generated artifacts inherit the license of their source material.

By submitting a contribution, you represent that you have the right to submit it and agree that it may be distributed under the license that applies to the changed files. Identify third party material and its license in the pull request. Do not submit confidential material, copied text without permission, or content whose provenance cannot be explained.

## Conduct

Be specific, respectful, and willing to revise. Critique ideas and code, not people. Harassment, threats, discrimination, doxxing, and deliberate disruption are not welcome. The maintainer may moderate participation to protect contributors and the project.
