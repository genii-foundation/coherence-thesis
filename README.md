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
| `editorial/sources/volumes/` | Canonical volume packages with manuscript, voice card, and manifest | Edit the complete editorial package here |
| `editorial/sources/corpus/` | Corpus-wide source ledgers and reviewed semantic links | Edit deliberately and preserve historical identity |
| `editorial/sources/overview/` | Curated overview nodes | Every reference must resolve to a real section |
| `editorial/reviews/` | Durable review batches and reconciliation evidence | Keep baseline paths, hashes, manifests, and approval state intact |
| `editorial/debt/` | Durable editorial obligations and paydown evidence | Update item files, then regenerate the index |
| `publishing/continuity/` | Section identity, lineage, routes, aliases, and provenance | Change only through an explicit reviewed publishing workflow |
| `publishing/audio/manifest.json` | Externally published immutable audio | Update only through the audio publishing workflow |
| `publishing/updates/snapshot.json` | Tracked Updates fallback and immutable statistics cache | Refresh through `npm run updates:generate`, never edit by hand |
| `generated/` | Ignored reader materializations, catalogs, and reports | Recreate locally, never commit |
| `public/data/` | Ignored browser payloads derived from source and publishing state | Recreate locally, never commit |
| `src/app/` | Next.js pages and server route handlers | Reader and account application code |
| `src/components/` | Shared interface components and client islands | Reuse existing primitives before adding new ones |
| `supabase/migrations/` | Reader sync schema, policies, and API grants | Review authorization changes as security-sensitive |
| `scripts/` | Import, compile, validation, preview, PDF, and audio tooling | Keep commands deterministic and reviewable |
| `tests/` | Browser coverage | Add or update coverage for browser behavior changes |

Generated manuscript fragments, catalogs, reports, search data, breadcrumbs, and PDF indexes never belong in commits. Durable editorial evidence, route history, aliases, version provenance, and hosted audio state remain tracked because current prose cannot reconstruct those reviewed or externally published facts.

## Quick Start

The project uses Node.js 22 through `.nvmrc`. Package metadata supports Node.js 20.11 or newer. Node.js 22 is the recommended local version.

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

After changing a manuscript or its adjacent `volume.json`, inspect the import, preserve any historical routes with aliases, and explicitly record the reviewed route set:

```bash
npm run manuscripts:import
npm run manuscripts:preserve-links -- --base HEAD
npm run manuscripts:record-routes
npm run manuscripts:prepare -- --force
npm run manuscripts:validate
```

Do not accept an import that collapses, fragments, reorders, or incorrectly renames sections. Fix the source or importer first.

Published routes are durable. When a heading or structure change removes a historical route, run the preservation plan and review its proposed lineage and aliases. The route ledgers record every reviewed public path, and validation fails when one disappears without a replacement. Ordinary development, testing, building, and deployment cannot modify those ledgers. See [Manuscript Link Continuity](docs/manuscript-link-continuity.md) for the full workflow.

### Semantic cross-references

Internal references are proposed by a deterministic audit and recorded only after individual review:

```bash
npm run editorial:semantic-links:audit -- --volume volume-01
npm run editorial:semantic-links:review -- --report <report> --decisions <review-file>
npm run editorial:semantic-links:review -- --report <report> --decisions <review-file> --write
npm run editorial:semantic-links:validate
```

Reviewed concepts target continuity identities rather than literal URLs. The compiler resolves each target to its current owner and route, then adds links to generated reader bodies without changing canonical prose, paragraph anchors, progress hashes, or audio identities. See [Semantic Cross-References](docs/semantic-cross-references.md) for the review and validation contract.

## Editorial Debt

Durable inconsistencies, unfulfilled promises, unresolved claims, citation gaps, literary weaknesses, and publishing obligations live in `editorial/debt/`. Add or reopen an item instead of hiding unfinished work in a review summary. Keep resolved items as evidence of paydown.

The index is generated from the item files:

```bash
npm run editorial:debt:update
npm run editorial:debt
```

The first command rebuilds `editorial/debt/index.md`. The second validates item structure, append-only identifiers, evidence paths, lifecycle dates, and index freshness. The full `npm run validate` gate includes the debt check.

## Updates Publishing

The public [Updates page](https://www.coherence-thesis.com/updates/) is compiled from every commit on the main branch. Refresh its checked fallback with:

```bash
npm run updates:generate
```

No manual changelog entry is needed. `updates:generate` is the explicit durable write for `publishing/updates/snapshot.json`. The production build uses `updates:prepare` to create an ignored snapshot under `generated/` before Next renders the site. It never modifies publishing state. Both commands read complete local Git history when available, including changed file, addition, and deletion totals for every commit. Shallow deploys first expand `main` from the canonical public Git repository and read the exact deployed SHA locally. If that fetch fails, they fall back to the GitHub API. The API path reuses immutable diff totals from the checked snapshot, then requests commit details only for new SHAs.

Every pull request refreshes and verifies `publishing/updates/snapshot.json` through its current main base. Because main requires current checks before merge, the checked cache stays one successful merge behind at most. Production main builds require the generated history to match the exact deployed SHA. If neither complete Git history nor GitHub can provide that history, the new deployment fails and Vercel keeps the previous good deployment. Local and preview builds may still use the last valid snapshot when offline. The page groups commits by UTC date and shows five dates per numbered page.

The default view shows all updates. The [Literary view](https://www.coherence-thesis.com/updates/literary/) filters before grouping and pagination to show commits that touched current editorial manuscripts or historical manuscript paths. Mixed commits remain literary, while each card keeps the complete commit statistics.

When an exact commit still has a successful public Vercel production deployment, its card can link to that rendered version. These links are keyed by the full commit SHA. Every production publication rechecks every stored historical URL and removes links that Vercel confirms are unavailable. Transient network failures, rate limits, and Vercel server errors preserve the last confirmed link instead of treating uncertainty as deletion. New link discovery remains time bounded. CI preserves the checked mappings because it validates but does not publish the site. This best effort enrichment never replaces or weakens complete history validation.

## Audiobook Publishing

Hosted audiobook clips are keyed by each section's `audioVersionId`. Manuscript content, boundaries, and volume metadata can change those IDs and make existing audio stale.

Validate a generated audio run against the current catalog before publishing:

```bash
npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <supabase-project-ref>
```

Without `--upload`, this verifies that each generated MP3 maps to a current section and `audioVersionId`, exists locally, and covers the requested voices.

After reviewing the validation result, add `--write` to update `publishing/audio/manifest.json`. Add `--upload` only with explicit publication authorization. Upload mode also writes the reviewed manifest.

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

Changes that can affect browser behavior use the combined production gate. It builds once and runs Playwright against that exact build:

```bash
npm run validate:ui
```

Useful focused commands during development:

```bash
npm run repository:doctor
npm run repository:validate-layout
npm run repository:validate-agents
npm run repository:source-boundary
npm run editorial:validate
npm run editorial:semantic-links:validate
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

The site software, scripts, components, tests, agent instructions, and build tooling are licensed under the [Apache License 2.0](LICENSE).

Original manuscripts, voice cards, editorial evidence, publishing continuity, site copy, and owned artwork are licensed under [Creative Commons Attribution-ShareAlike 4.0 International](LICENSE-content).

[NOTICE](NOTICE) maps repository paths to the applicable license. Third party materials retain their own licenses.

## Roadmap

- Complete final individual cover art for every manuscript
- Add spaced repetition tools grounded in stable section IDs
- Expand recommendation paths across the manuscript collection
- Build an introspection graph from local first reading history
- Explore an interactive assistant that can converse with the complete body of work while preserving reader trust

## Design Notes

The visual system draws from local first product discipline and Scriptorium reading mode. It uses warm paper, dark ink, bronze rules, restrained geometry, accessible contrast, and mobile first long form reading.
