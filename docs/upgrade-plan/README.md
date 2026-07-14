# Coherence Thesis Modernization Plan

> Historical record: this plan describes the repository reviewed in July 2026. Its paths, counts, and implementation status are preserved as evidence and are not the current repository map. See the root `README.md` and `docs/decisions/0001-editorial-source-layout.md` for the current structure.

A comprehensive review of the application code, build pipeline, data layer, and
release engineering, with a phased plan to modernize the codebase. This document
is the entry point. The full evidence sits in the companion files:

- [findings-register.md](findings-register.md): every confirmed finding, with
  file and line references, the concrete failure it causes, and the fix.
- [implementation-status.md](implementation-status.md): what this PR implements
  versus what is deferred to follow-up PRs.
- [methodology.md](methodology.md): how the review was run and how findings were
  verified.

Scope reviewed: `src/`, `scripts/`, `middleware.ts`, `next.config.ts`,
`supabase/migrations/`, `tests/`, config files, `package.json`, `vercel.json`,
and the absence of CI. Manuscript prose in `sources/` and `content/` was out of
scope; only the pipeline that processes it was reviewed.

## What this codebase is

A statically generated Next.js 16 (App Router) reader for a nine-volume
manuscript body. Source Markdown in `sources/manuscripts/` compiles through
`scripts/manuscripts/*.ts` into canonical sections in `content/manuscripts/`, a
catalog at `src/generated/manuscripts/catalog.json`, and four browser payloads
in `public/data/`. Client interactivity ships as 17 island components in
`src/components/`. Reader progress is local-first with optional Supabase sync.

The foundation is sound: static generation, local-first privacy, a real
compile pipeline, deep-link aliases, and an existing validation gate. The
review found no critical (data-loss or actively exploitable) issues. It did find
sharp correctness bugs, real performance debt on the core reading interaction,
pervasive copy-paste across the islands, and the single largest structural gap,
no automated CI.

## Health at a glance

| Dimension | State | Headline |
| --- | --- | --- |
| Security | Fair | No critical holes. Missing security headers, unbounded sync tables, no delete confirmation, one open-redirect gap. |
| Correctness | Needs work | Sync counters double on every login; Markdown lists render as run-on text; canonical URLs deindex ~460 pages. |
| Performance | Needs work | ~4.2 MB of JSON parsed on every page load; unthrottled scroll handler stalls the core reading interaction. |
| Duplication | Poor | `normalizePath` copied 8 times, menu dismiss logic 6 times, catalog schema hand-duplicated across scripts and app. |
| Accessibility | Fair | Focus indicator is nearly invisible; theme flash on load; sub-AA muted text; menus drop focus on Escape. |
| Architecture | Fair | A 687-line god-component owns telemetry, auth, sync, consent, and UI. Sync versioning is written but never read. |
| Testing / CI | Poor | No CI at all. Sync, the delete route, and every island have zero unit tests. |

## Findings summary

74 confirmed findings. 65 came through the eight-dimension review and survived
adversarial verification; 9 came from a completeness critic pass, of which the
three highest-impact were independently reproduced during this write-up and are
promoted into the register.

| Severity | Count | Meaning |
| --- | --- | --- |
| Critical | 0 | Exploitable or data-loss on arrival. |
| High | 8 | Real bug, meaningful weakness, or major cost hitting users now. |
| Medium | 39 | Maintainability, performance, or security debt with clear payoff. |
| Low | 27 | Worthwhile polish. |

Most-cited themes across findings: maintainability (20), duplication (14),
accessibility (12), best practices (12), testing and CI (10), then security,
performance, and architecture (8 each).

## The plan

Six phases, ordered so that user-facing correctness and safety land first,
then the structural work (CI, shared primitives) that makes every later change
cheaper and safer. Each phase maps to one focused PR (or a small set), and each
finding ID below links to its full entry in the register.

### Phase 0: Correctness and safety (land first)

Small, high-impact fixes that either corrupt data, mislead search engines, or
mangle published content today. Most are an hour or less of machine time.

- **BUG-01** Fix `mergeProgressStates` counter doubling (merge with `Math.max`,
  add an idempotence test). Every signed-in reader's engagement metrics inflate
  exponentially today.
- **BUG-04** Add a list branch to `MarkdownBody` so bullet lists stop rendering
  as run-on paragraphs with literal `- ` markers. 17 canonical sections are
  visibly mangled on the web reader.
- **BUG-05** Set per-route canonical URLs. The root `alternates.canonical: "/"`
  currently declares ~460 hub pages to be duplicates of the homepage.
- **BUG-06** Vendor an OFL-licensed serif and mono font and register it
  unconditionally in the PDF pipeline; fail the build on font fallback.
  Production PDFs currently ship with missing glyphs and wrong typography.
- **SEC-06** Validate the `next` redirect parameter in the auth callback.
- **SEC-05** Add security headers (`frame-ancestors`, HSTS, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) and set `poweredByHeader: false`.
- **SEC-02** Add a confirmation step before account deletion and an `Origin`
  check on the DELETE handler.
- **BUG-03** Inject a pre-paint inline script so the reader's theme and font
  scale apply before first paint, ending the dark-theme flash.
- **BUG-10** Point sitemap and robots at the real canonical host, not the
  `.local` placeholder.

### Phase 1: Establish CI and the safety net

- **TEST-01** Add `.github/workflows/ci.yml` running `npm run validate`, the
  Playwright suite, and a generated-artifact drift check on every PR, plus a
  dependency audit. This is the single highest-value change: nothing
  currently prevents a broken build, stale catalog, or failing test from
  reaching `main`.
- **TEST-08** Pin Node with `engines` and `.nvmrc`; fail fast in
  `ensure-node-modules.mjs` on an unsupported Node.
- **TEST-05** Enable `noUncheckedIndexedAccess` and type-checked lint rules, and
  fix the fallout. The catalog-indexing-heavy code is exactly what this flag
  guards.
- **TEST-06** Fix the stale-artifact check so `validate` actually enforces it,
  and extend it to the `public/data/` payloads.

### Phase 2: Performance on the reading path

- **PERF-01** Defer the four eager catalog fetches to first interaction, and
  emit a slim progress manifest (ids and hashes, no body text) so the corpus is
  not shipped twice on every page.
- **PERF-02** Throttle the scroll handler with `requestAnimationFrame`, bail
  when the rounded percent is unchanged, and debounce the localStorage write.
- **PERF-03** Precompute normalized search fields once at load instead of
  re-normalizing the full corpus on every keystroke.
- **PERF-04** Skip the Supabase session refresh in middleware for anonymous
  requests, or narrow the matcher to the routes that need it.
- **PERF-05, PERF-06, PERF-07** Lazy-load the toolbar outline, ship an optimized
  OG image, and make PDF regeneration incremental.

### Phase 3: Shared primitives (kill the duplication)

Extract the primitives the islands keep re-implementing. Each removes a whole
class of drift bug and shrinks the surface for later phases.

- **ARCH-01 / DATA-01** A single progress store (`useSyncExternalStore`) that
  every island reads and writes through, ending the multiple-writer lost-update
  bug (**BUG-02**).
- **DUP-01** `useToolbarMenu` for the six copies of open/close/dismiss logic,
  fixing the focus-drop-on-Escape regression in five of them.
- **DUP-02** A shared `manuscript-schema.ts` imported by both scripts and app,
  replacing the hand-duplicated catalog types and unchecked casts, with a schema
  version on each payload.
- **DUP-03** `src/lib/markdown-blocks.ts` shared by `MarkdownBody`, the PDF
  script, and the fingerprinting code, so paragraph anchors cannot silently
  drift from the reader.
- **DUP-04 through DUP-10** `normalizePath`, the mounted-flag loader effect, the
  progress-subscription effect, brand derivation, the reading-pace constant, the
  git subprocess helper, and the "section is read" predicate each collapse to
  one definition.

### Phase 4: Architecture and extensibility

- **ARCH-02** Decompose the 687-line `ToolbarProgressIsland` into a headless
  tracking island, sync hooks, and thin presentational panels.
- **ARCH-03** Wire up the sync `schema_version` and consent versioning that are
  currently written but never read, so a migration and re-consent path exists.
- **ARCH-04** Add an ID-drift gate to the import pipeline so a renumbered volume
  or retitled section cannot silently orphan reader progress.
- **ARCH-05** Introduce an `AudioPlayback` interface so a real TTS provider can
  be added without rewriting the audio island.
- **MAINT-05** Split the 716-line `scripts/manuscripts/shared.ts` into paths,
  types, fs utilities, markdown, and catalog modules.

### Phase 5: Accessibility and remaining polish

- **A11Y-01** Give every interactive element a visible, theme-aware
  `:focus-visible` outline.
- **A11Y-02** Darken `--ink-muted` to pass WCAG AA on the parchment and light
  themes.
- **A11Y-03 through A11Y-10** `aria-live` on sync and audio status, real
  keyboard handling on the font picker, Escape-dismissible tooltips,
  `viewportFit: "cover"`, 44px mobile touch targets, and a no-JS fallback path.
- **SEC-01, SEC-03, SEC-04** Add table constraints, payload validation, and
  event pruning to the sync layer.
- **TEST-02 through TEST-04** Split the 1772-line e2e spec, decouple tests from
  live prose, and add coverage tooling plus the missing sync and API-route unit
  tests.
- Remaining low findings: dead exports, magic numbers, error handling, docs and
  licensing accuracy.

## Recommended first PRs

If you want the fastest path to a materially better codebase:

1. **Phase 0 as one PR.** Nine small fixes, all user-facing, all low-risk. This
   is the highest value per hour in the whole plan.
2. **CI (TEST-01) as its own PR.** After this, every later change is guarded.
3. **The progress store + menu hook (Phase 3 core) as one PR.** This removes the
   worst duplication and fixes the lost-update and focus bugs as side effects.

## How to work through this

- Each finding in the register carries a severity, an effort estimate (machine
  time: small is under an hour, medium is one focused session, large is
  multi-session), and exact file and line references.
- Follow the repo's own rules from `AGENTS.md`: one worktree and one focused PR
  per coherent change, run `npm run validate` before opening a PR, and preserve
  the deep-link contract (add `content/series/aliases.json` entries whenever a
  section ID or route would change).
- The plan is designed so phases can proceed in parallel across contributors
  once Phase 1 (CI) is in place, since CI will catch cross-phase regressions.
