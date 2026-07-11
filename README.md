# The Coherence Thesis

[![CI](https://github.com/providence-collective/coherence-thesis/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/providence-collective/coherence-thesis/actions/workflows/ci.yml)

The Coherence Thesis is a living manuscript project about interpersonal coherence, civilizational coordination, and future societies capable of becoming powerful without ceasing to become wise.

Read the published work at [coherence-thesis.com](https://www.coherence-thesis.com), or begin with the [five minute overview](https://www.coherence-thesis.com/overview/).

This public repository is the canonical source for the manuscripts, reader application, publishing tools, tests, and project documentation. Volumes One through Nine are published as independent complementary manuscripts.

## Reader Experience

The reader is a Next.js application with:

- A five minute overview map linked to exact manuscript sections
- Prerendered manuscript routes for search engines, older devices, and reading without JavaScript
- Local first reading progress and engagement history, with optional account sync
- Section and paragraph fingerprints that reveal text updated since a previous read
- Instant local search across a generated static index
- Browser speech playback and optional hosted audiobook clips
- A public updates log compiled from every commit on the main branch
- Responsive reader controls, accessibility coverage, and downloadable manuscript PDFs

## Development Status

<!-- BEGIN:development-status -->

- Next.js: 16.2.9
- Manuscripts: 9 volumes, 47 parts, 396 chapters, 551 sections
- Canonical words: 198,303
- Estimated full read: 902 minutes
- Overview nodes: 9

<!-- END:development-status -->

This block contains stable facts generated from the current package metadata and manuscript catalog. Refresh it with `npm run readme:update` when those sources change.

## Repository Map

| Path | Purpose | Editing rule |
| --- | --- | --- |
| `sources/manuscripts/` | Canonical source manuscripts | Edit these files for manuscript changes |
| `content/series/` | Volume metadata, section ledger, and route aliases | Edit deliberately and preserve published links |
| `content/overview/` | Curated overview nodes | Every reference must resolve to a real section |
| `content/manuscripts/` | Ignored local reader materialization | Generated from canonical source, never edit by hand |
| `src/generated/manuscripts/` | Ignored local application catalog | Generated from canonical source, never edit by hand |
| `src/generated/updates.json` | Tracked Updates fallback and immutable statistics cache | Refresh through `npm run updates:generate`, never edit by hand |
| `public/data/` | Ignored reader payloads plus the tracked hosted-audio manifest | Generate reader data locally; update audio only through its publishing workflow |
| `src/app/` | Next.js pages and server route handlers | Reader and account application code |
| `src/components/` | Shared interface components and client islands | Reuse existing primitives before adding new ones |
| `supabase/migrations/` | Reader sync schema, policies, and API grants | Review authorization changes as security-sensitive |
| `scripts/` | Import, compile, validation, preview, PDF, and audio tooling | Keep commands deterministic and reviewable |
| `tests/` | Browser coverage | Add or update coverage for browser behavior changes |

Generated manuscript fragments, catalogs, search data, breadcrumbs, and PDF indexes never belong in commits. Durable route history, aliases, version provenance, and the hosted-audio manifest remain tracked because current source files cannot reconstruct those reviewed or externally published facts.

## Quick Start

The project uses Node.js 22 through `.nvmrc`. Package metadata supports Node.js 20.9 or newer. Node.js 22 is the recommended local version.

```bash
git clone https://github.com/providence-collective/coherence-thesis.git
cd coherence-thesis
nvm use
npm run bootstrap
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run bootstrap` installs the locked dependencies with `npm ci` when the worktree needs them. Most project commands run the same dependency guard automatically.

### Optional account sync

The site runs without Supabase credentials. In that mode, manuscripts, local progress, search, and browser audio still work, while sign-in and remote sync remain unavailable.

To develop account sync, copy `.env.example` to `.env.local` and provide:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never commit credentials. The service role key is server only and must not use a `NEXT_PUBLIC_` prefix.

## Manuscript Publishing

Materialize all disposable manuscript outputs from canonical source:

```bash
npm run manuscripts:prepare
```

The command imports Markdown, compiles the catalog and browser payloads, and builds missing PDFs. It caches a source fingerprint under ignored `node_modules/.cache/`, so subsequent development and validation commands avoid unnecessary work.

Apply source Markdown to ignored reader sections for inspection:

```bash
npm run manuscripts:import
```

Compile the application catalog and public reader data without changing durable route history:

```bash
npm run manuscripts:compile
```

Validate section IDs, overview references, aliases, the section ledger, and generated artifact freshness:

```bash
npm run manuscripts:validate
```

After changing a source manuscript or `content/series/volumes.json`, inspect the import, preserve any historical routes with aliases, and explicitly record the reviewed route set:

```bash
npm run manuscripts:import
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
```

Do not accept an import that collapses, fragments, reorders, or incorrectly renames sections. Fix the source or importer first.

Published routes are durable. When a heading or structure change removes a historical route, add a deliberate alias to `content/series/aliases.json`. The section ledger records every published route, and validation fails when one disappears without a replacement. Ordinary development, testing, building, and deployment cannot modify that ledger.

## Updates Publishing

The public [Updates page](https://www.coherence-thesis.com/updates/) is compiled from every commit on the main branch. Refresh its checked in fallback with:

```bash
npm run updates:generate
```

No manual changelog entry is needed. The production build runs this command before Next renders the site. It reads complete local Git history when available, including changed file, addition, and deletion totals for every commit. Shallow deploys first expand `main` from the canonical public Git repository and read the exact deployed SHA locally. If that fetch fails, they fall back to the GitHub API. The API path reuses immutable diff totals from the checked snapshot, then requests commit details only for new SHAs.

Every pull request refreshes and verifies `src/generated/updates.json` through its current main base. Because main requires current checks before merge, the checked cache stays one successful merge behind at most. Production main builds require the generated history to match the exact deployed SHA. If neither complete Git history nor GitHub can provide that history, the new deployment fails and Vercel keeps the previous good deployment. Local and preview builds may still use the last valid snapshot when offline. The page groups commits by UTC date and shows five dates per numbered page.

The default view shows all updates. The [Literary view](https://www.coherence-thesis.com/updates/literary/) filters before grouping and pagination to show commits that touched canonical manuscript sources or their historical generated sections. Mixed commits remain literary, while each card keeps the complete commit statistics.

When an exact commit still has a successful public Vercel production deployment, its card can link to that rendered version. These links are keyed by the full commit SHA, checked for public reachability within a fixed generation budget, and omitted when the deployment is missing or no longer available. CI preserves the checked mappings instead of making required gates depend on optional network changes. This best effort enrichment never replaces or weakens complete history validation.

## Audiobook Publishing

Hosted audiobook clips are keyed by each section's `audioVersionId`. Manuscript content, boundaries, and volume metadata can change those IDs and make existing audio stale.

Validate a generated audio run against the current catalog before publishing:

```bash
npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <supabase-project-ref>
```

Without `--upload`, this verifies that each generated MP3 maps to a current section and `audioVersionId`, exists locally, and covers the requested voices.

Generate missing clips with Fish Audio:

```bash
FISH_API_KEY=<from-secret-store> npm run audio:fish -- --mode full --sections <section-ids> --voices <voice-id:label> --run-id <run-id>
```

Publish audio under a new immutable version path. Never overwrite existing Supabase objects, commit credentials, or print credentials in logs.

## Validation

The full local gate validates manuscript references and generated artifacts, checks types and lint, runs unit tests, and builds the production application:

```bash
npm run validate
```

Browser behavior has a separate production gate:

```bash
npm run test:e2e
```

Useful focused commands during development:

```bash
npm run manuscripts:validate
npm run typecheck
npm run lint
npm run test
npm run test:e2e:fast:desktop
npm run test:e2e:fast
```

`npm run test:e2e:fast` reuses or starts an isolated development server at `http://127.0.0.1:3200`. For repeated desktop loops, run `npm run dev:e2e` in one terminal and `npm run test:e2e:fast:desktop` in another.

GitHub Actions runs validation and the full Playwright suite for pull requests and pushes to `main`.

## Architecture and Privacy

Manuscript text is rendered on the server and remains readable without JavaScript. Client islands enhance progress, search, audio, menus, preferences, and optional sync.

Reading progress is private and local by default. The browser may store section IDs, content hashes, read timestamps, percent read, reading-time summaries, return counts, scroll milestones, search and recommendation interactions, audio engagement, and reader preferences.

No account is required. A signed-in reader must explicitly allow remote sync before local reading data uploads. Supabase row level security isolates synchronized records. The account API supports authenticated account deletion and rejects cross-origin destructive requests.

## Deployment and Governance

The production site is deployed by Vercel from `main`. The branch is protected, requires the validation and Playwright checks, rejects force pushes and deletion, and reserves merge authority for the repository maintainer.

Community work enters through focused pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, source rules, validation, licensing, and review expectations.

Report vulnerabilities privately through the process in [SECURITY.md](SECURITY.md). Do not publish exploit details in an issue.

## Licensing

The site software, scripts, components, tests, and build tooling are licensed under the [Apache License 2.0](LICENSE).

Original manuscripts, site copy, and owned artwork are licensed under [Creative Commons Attribution-ShareAlike 4.0 International](LICENSE-content).

[NOTICE](NOTICE) maps repository paths to the applicable license. Third party materials retain their own licenses.

## Roadmap

- Complete final individual cover art for every manuscript
- Add spaced repetition tools grounded in stable section IDs
- Expand recommendation paths across the manuscript collection
- Build an introspection graph from local first reading history
- Explore an interactive assistant that can converse with the complete body of work while preserving reader trust

## Design Notes

The visual system draws from local first product discipline and Scriptorium reading mode. It uses warm paper, dark ink, bronze rules, restrained geometry, accessible contrast, and mobile first long form reading.
