# Implementation Status

Tracks which findings from the [findings-register.md](findings-register.md) are
implemented in this PR and which are deferred to focused follow-ups. IDs link to
the register.

The base PR (#24, merged) carried the reader-sync feature plus the first,
lower-risk waves of the modernization plan. Follow-up PRs pick up the deferred
architecture work one coherent slice at a time. Every commit keeps the full
local gate (`manuscripts:validate`, typecheck, lint, unit tests, build) green.

## Follow-up PR: single reader-progress store (Phase 4, wave 1)

- **ARCH-01 / BUG-02** one reader-progress store in `reader-progress-store.ts`
  via `useSyncExternalStore`. Every island now reads through `useReaderProgress()`
  and writes through `updateStoredProgress()`, an atomic read-modify-write against
  one in-memory snapshot kept in sync with `localStorage` and other tabs. This
  removes the lost-update window entirely: a scroll tick and an audio-seconds
  write can no longer clobber each other because neither holds a private stale
  copy. Covered by `reader-progress-store.test.ts` (the exact concurrent-writer
  scenario) and the full desktop + mobile e2e reader suite.
- **DUP-05** the progress-subscription effect (duplicated across
  `ReadCheckmarkIsland`, `UpdatedMarkerIsland`, `SectionRevisionNotice`) collapses
  into the store's one subscription. As a side effect the revision notice now
  reacts live when a section is marked read instead of showing stale text until
  reload.
- Removes the scroll-write debounce machinery: the rounded-percent gate plus
  `recordScrollProgress` returning the same reference already limit writes to
  actual changes, so `updateStoredProgress` is a no-op on idle scroll frames.

## Follow-up PR: audio playback provider seam (Phase 4, wave 2)

- **ARCH-05** `AudioPlayback` provider interface in `src/lib/audio-playback.ts`.
  `AudioPlayerIsland` no longer calls `window.speechSynthesis` directly (it had
  17 call sites); it depends on an `AudioPlaybackProvider` obtained from
  `createDefaultAudioProvider()`, and the browser engine lives behind
  `createBrowserSpeechProvider()`. The island keeps queue orchestration, the
  playback token, engagement events, and listen-seconds; the provider owns the
  engine. This is the seam the audio-provider research calls for: a precomputed
  `<audio>` clip provider can implement the same interface without touching the
  island. Covered by `audio-playback.test.ts` (the provider contract against a
  faked engine) and the desktop e2e audio-controls test.
- Folds in `docs/audio-provider-research.md` (was the standalone doc-only PR
  #22) so the design and its first implementation land together.

## Follow-up PR: sync schema versioning (Phase 4, wave 3)

- **ARCH-03** read and act on the remote `reader_progress.schema_version`.
  `loadRemoteReaderState` now returns `progressSchemaVersion`, uploads write the
  single `readerProgressSchemaVersion` constant instead of a literal `2`, and
  `reconcileRemoteProgress` decides the fold: it merges rows at or below the
  known schema and returns null for newer rows. `ToolbarProgressIsland` refuses
  to merge or upload over a row written by a newer reader (guarded by
  `remoteSchemaAheadRef`), so an outdated device cannot silently drop unknown
  fields or clobber richer remote data; it surfaces an "update this device"
  status instead. Covered by new `reconcileRemoteProgress` unit tests and the
  desktop e2e sync path. Scoped to the progress schema; re-prompting consent
  when `readerSyncConsentCopyVersion` changes remains a separate small
  follow-up (the version fields are already read and stored).

## Done in the base PR (#24)

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

## Shipped as follow-up PRs (Phase 4/5 waves)

Each landed as its own focused, CI-green PR on top of the base:

- **ARCH-01 / BUG-02** single reader-progress store (`useSyncExternalStore`),
  which also delivered **DUP-05**
- **ARCH-05** audio playback provider seam
- **ARCH-03** reader-sync schema-version guard
- **ARCH-04** section-ID drift gate (`content/series/section-ledger.json`)
- **MAINT-05** split `scripts/manuscripts/shared.ts` into `types.ts` / `io.ts`
- **DUP-03** shared `markdown-blocks` splitter
- **DUP-01 / A11Y-04** `useToolbarMenu` hook with Escape focus return
- **DUP-06 / DUP-11** `useLoadedData` load-once hook and `audio-preferences`
  module
- **SEC-03 / SEC-04** client progress sanitization and engagement-log pruning
- **PERF-07** incremental PDF build
- **PERF-05** fetch-on-demand outline payload (~68KB off every page)
- **TEST-02** sync-orchestration and account-route unit tests
- **TEST-05** `noUncheckedIndexedAccess` enabled, all sites guarded
- **MAINT-03 / MAINT-04 / DOC-05 / A11Y-10** named frontmatter errors, dead
  export removal, content-based overview audio id, 44px touch targets
- **ARCH-02** extracted the ~155-line section-engagement tracking out of
  `ToolbarProgressIsland` into a `useSectionEngagement` hook
- **PERF-01 (rest, progress + audio)** slim `progress-sections.json` manifest
  (~510KB, no body text) for the toolbar and the audio queue; the full ~1.9MB
  `reader-sections.json` is now fetched lazily only when audio first plays,
  removing ~1.4MB from every page load
- **PERF-01 (breadcrumbs)** breadcrumb routes are sharded by volume under
  `public/data/breadcrumbs/`; a page fetches only its volume's shard (6-130KB)
  instead of the full 483KB set. PERF-01 is now complete.

## Deferred to follow-up PRs

The genuinely remaining items:

- **TEST-03 / TEST-04** split the large e2e spec and decouple it from prose
- **A11Y-06 / A11Y-07** no-JS toolbar fallback and font-picker keyboard model
- **DOC-02 / DOC-03 / DOC-04 / DOC-06 / DOC-08** README status block, license
  clarity, homepage tags in series config, Tailwind decision, footer year
- **DUP-02** shared build/runtime catalog schema module (a payload schema
  version is the useful part; the type-share is cross-boundary and low value)
