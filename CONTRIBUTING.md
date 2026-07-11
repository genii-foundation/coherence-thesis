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
npm run manuscripts:compile
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
- Do not edit `content/manuscripts/`, `src/generated/manuscripts/`, or `public/data/` by hand.
- Run the importer and compiler, then commit the expected generated output with the source change.

For manuscript or series changes, run:

```bash
npm run manuscripts:import
npm run manuscripts:compile
npm run manuscripts:validate
```

Review the generated diff. Do not accept an import that collapses, fragments, reorders, or incorrectly renames sections.

Stable section IDs and routes support public links, reading progress, update badges, recommendations, audio, and future learning tools. If a published route disappears, add an intentional alias to `content/series/aliases.json`. Validation checks the permanent section ledger and will reject silent link loss.

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

Do not edit `src/generated/updates.json` manually. It caches immutable file and line statistics by commit SHA so production only needs to fetch the newest merge. Pull request CI checks that this cache matches the current base. A shallow production checkout first expands `main` from its existing Git remote, then falls back to the GitHub API. The deployment fails instead of publishing stale history when neither source can generate through the deployed main SHA.

## Validation

Run focused checks while developing, then run the full gate before requesting review:

```bash
npm run validate
```

If the change can affect browser behavior, also run:

```bash
npm run test:e2e
```

Useful focused checks include:

```bash
npm run manuscripts:validate
npm run typecheck
npm run lint
npm run test
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
- Generated files and why they changed
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
