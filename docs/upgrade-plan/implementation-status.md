# Implementation Status

Tracks which findings from the [findings-register.md](findings-register.md) are
implemented in this PR and which are deferred to focused follow-ups. IDs link to
the register.

This PR carries the reader-sync feature (formerly PR #21) plus the first,
lower-risk waves of the modernization plan. Every commit keeps the full local
gate (`manuscripts:validate`, typecheck, lint, unit tests, build) green.

## Done in this PR

### Phase 0: correctness and safety
- **BUG-01** merge counters with `max`, not sum (with idempotence test)
- **BUG-03** pre-paint theme/font script, no more load flash
- **BUG-04** markdown bullet lists render as `<ul>`
- **BUG-05** per-route canonical URLs; root homepage-canonical removed
- **BUG-06** vendored OFL PT Serif/PT Mono; PDF build fails on font fallback
- **BUG-09** "Recently read" excludes opened-but-unread sections
- **BUG-10 / DOC-01** shared site-url; `.local` placeholder and alias sitemap
  URLs removed
- **SEC-02** two-step delete confirmation plus DELETE `Origin` check
- **SEC-05** security headers and `poweredByHeader: false`
- **SEC-06** validated auth-callback redirect
- **DUP-09 / A11Y-03 / A11Y-11 / MAINT-01 / MAINT-06** shared read predicate,
  aria-live status, read-badge role, consent error handling, named constants

### Phase 1: CI and tooling
- **TEST-01** `.github/workflows/ci.yml` (validate, typecheck, lint, coverage,
  build, public/data drift check, advisory audit, Playwright)
- **TEST-05 (partial)** `verbatimModuleSyntax` on; `typecheck` in the gate
- **TEST-06** reordered validate so the stale check runs against committed
  artifacts; CI drift-checks all `public/data` payloads
- **TEST-07** Playwright CI hardening (forbidOnly, retries, HTML report, raised
  webServer timeout)
- **TEST-08** `engines`, `.nvmrc`, fast-fail on old Node
- **TEST-10** v8 coverage config
- **DOC-07** removed unused `serve` dependency; corrected AGENTS.md wording

### Phase 2: performance
- **PERF-01 (partial)** deferred the search, PDF-manifest, and audio
  reader-sections loads to first interaction
- **PERF-03** precomputed search normalization
- **PERF-04** middleware skips anonymous requests
- **PERF-06** optimized OG share image
- **BUG-07** SpeechSynthesis error handling
- **BUG-08** data loaders retry after transient failure

### Phase 3: shared primitives
- **DUP-04** one `normalizePath`/`parentRoute` (`src/lib/routes.ts`)
- **DUP-07** one reading-pace source
- **DUP-10** one git subprocess helper

### Phase 5: accessibility and sync hardening
- **A11Y-01** visible theme-aware focus ring
- **A11Y-02** AA-contrast muted text
- **A11Y-05** not-found / error / global-error boundaries
- **A11Y-08** Escape-dismissible tooltips
- **SEC-01** payload/row size bounds and per-user event cap (hardening migration)
- **SEC-07** pinned trigger search_path

## Deferred to follow-up PRs

These are the larger refactors and the remaining polish. Each is a clean,
self-contained next PR; the register entry has the full detail.

### Architecture (highest value remaining)
- **ARCH-01 / BUG-02** single progress store via `useSyncExternalStore`. The
  lost-update window is already narrowed (debounced writes, audio read-modify-
  write), but the store is the real fix.
- **ARCH-02** decompose the 687-line `ToolbarProgressIsland`
- **ARCH-03** read and act on sync `schema_version` / consent versioning
- **ARCH-04** section-ID drift gate in the import pipeline
- **ARCH-05** `AudioPlayback` provider interface
- **MAINT-05** split `scripts/manuscripts/shared.ts`

### Duplication (remaining)
- **DUP-01** `useToolbarMenu` hook (also fixes **A11Y-04** focus-return in five
  menus)
- **DUP-02** shared catalog schema module with a payload schema version
- **DUP-03** shared `markdown-blocks` module (BUG-04 was fixed inline in
  `MarkdownBody`; the anchor-drift invariant still wants one parser)
- **DUP-05 / DUP-06 / DUP-08 / DUP-11** progress-subscription hook, loader hook,
  brand-context helper, audio voice-pref module

### Performance (remaining)
- **PERF-01 (rest)** slim progress manifest and server-side breadcrumbs so
  `ToolbarProgressIsland` and `ToolbarBreadcrumbs` stop loading full payloads
- **PERF-05** lazy outline payload
- **PERF-07** incremental PDF build

### Testing and types (remaining)
- **TEST-02** unit tests for sync orchestration, `reader-sync`, and the account
  route
- **TEST-03 / TEST-04** split the 1772-line e2e spec and decouple it from prose
- **TEST-05 (rest)** `noUncheckedIndexedAccess` (147 call sites to guard) and
  type-checked lint rules

### Accessibility and docs (remaining)
- **A11Y-06** no-JS toolbar fallback
- **A11Y-07** font-picker keyboard model
- **A11Y-10** 44px mobile touch targets
- **SEC-03 / SEC-04** client-side payload validation and event-log pruning
- **DOC-02 / DOC-03 / DOC-04 / DOC-05 / DOC-06 / DOC-08** README status block,
  license clarity, homepage tags in series config, overview audio id, Tailwind
  decision, footer year
