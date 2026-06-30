# Codebase Review Findings, July 3 2026

This register records every confirmed finding from a comprehensive review of the application code, build pipeline, tests, and infrastructure. Manuscript prose was out of scope.

## How this review was run

Eight independent reviewers each audited one dimension: security, duplication, performance, maintainability, framework best practices, usability and accessibility, architecture and extensibility, and testing and release engineering. Their 91 raw findings were merged into 65 unique findings. Every finding was then adversarially verified against the actual code, with high severity findings checked through three separate lenses (factual accuracy, real world impact, and fix validity). All 65 survived, though several severities were corrected during verification. A final completeness pass over areas with no findings surfaced 9 more, which were verified by hand. Line numbers reference the tree at commit `6719c8e`.

Severity meanings: **high** is a real bug or major ongoing cost, **medium** is debt with a clear payoff, **low** is worthwhile polish. Effort is machine time: **small** is under an hour, **medium** is one focused session, **large** is multiple sessions.

## Summary

| Group | Findings | High | Medium | Low |
|---|---|---|---|---|
| Correctness and data integrity | 9 | 4 | 3 | 2 |
| Security | 7 | 0 | 4 | 3 |
| Performance | 7 | 2 | 2 | 3 |
| Architecture and state | 5 | 1 | 3 | 1 |
| Duplication | 12 | 0 | 6 | 6 |
| Maintainability | 4 | 0 | 3 | 1 |
| Accessibility and usability | 10 | 1 | 4 | 5 |
| SEO and metadata | 3 | 1 | 1 | 1 |
| Testing and CI | 8 | 0 | 6 | 2 |
| Tooling and housekeeping | 9 | 0 | 4 | 5 |
| **Total** | **74** | **9** | **36** | **29** |

## Correctness and data integrity

### COR-1 (high, small): Sync merge doubles every engagement counter on each visit

`mergeProgressStates` in [src/lib/reader-state.ts:267](../../src/lib/reader-state.ts) adds local and remote values for `openCount`, `returnCount`, `activeSeconds`, `idleSeconds`, `totalVisibleSeconds`, `manualReadCount`, `autoReadCount`, and `audioSeconds`. Remote state is the previously uploaded copy of local state, so every signed in page load merges local state with its own mirror and doubles the counters, then uploads the doubled result. Read one section for 100 active seconds and after three visits the store claims 800 seconds and 8 opens. All engagement metrics built on these fields are corrupt.
**Fix:** merge counters with `Math.max` (each device's counters are monotonic supersets of what it uploaded), or track a last synced snapshot and merge deltas. Add a unit test asserting `merge(state, state)` equals `state`.

### COR-2 (high, medium): Progress store has multiple writers and loses updates

Progress under the `coherence-reader-progress-v2` key is written by both `ToolbarProgressIsland` and `AudioPlayerIsland`. The audio island does a correct read-modify-write, but `ToolbarProgressIsland` seeds a React copy once at mount ([ToolbarProgressIsland.tsx:105](../../src/components/ToolbarProgressIsland.tsx)) and serializes that in-memory copy on every write. It never subscribes to the update event or the cross tab `storage` event. Play audio, then scroll: the next scroll tick overwrites the stored audio seconds with the stale copy. The same lost update happens across two open tabs.
**Fix:** make `reader-progress-store.ts` the single source of truth with a subscribe and snapshot API (`useSyncExternalStore`) plus an `update(fn)` that does read-modify-write atomically. All islands consume the store instead of holding private copies.

### COR-3 (high, small): The web reader mangles Markdown lists

`MarkdownBody` ([src/components/MarkdownBody.tsx:55](../../src/components/MarkdownBody.tsx)) has branches for headings, blockquotes, and tables but none for lists, so a bullet list block falls through to a single `<p>` with literal `- ` markers run together. 17 canonical sections contain such lists (the citation appendices in Volume 3, for example), so shipped pages visibly mangle published content. The PDF pipeline already renders these correctly, making the web reader the only broken surface.
**Fix:** add a list branch mirroring the logic in `scripts/manuscripts/pdf.ts:173`, keeping the paragraph anchor on the wrapper element.

### COR-4 (high, small): Production PDFs silently ship with wrong fonts and missing glyphs

`registerFonts` in [scripts/manuscripts/pdf.ts:66](../../scripts/manuscripts/pdf.ts) probes absolute font paths that exist on macOS and Debian. The Vercel build host has neither, so all 575 production PDFs silently fall back to PDFKit core fonts with WinAnsi encoding. The corpus contains characters outside WinAnsi (approximation signs, arrows, schwa), which render as missing glyph boxes. Local PDFs and deployed PDFs differ in typography with no error raised. The macOS mono slot also registers Arial Unicode, which is not monospaced, so table alignment differs per host.
**Fix:** vendor an OFL licensed serif and mono TTF in the repo, register them unconditionally, and fail the build if font registration falls back.

### COR-5 (medium, small): Speech synthesis errors leave the audio player stuck on playing

`playIndex` in [src/components/AudioPlayerIsland.tsx:188](../../src/components/AudioPlayerIsland.tsx) wires `onend` but not `onerror`. Synthesis errors are common on Chrome with long texts, and each utterance here is a full section. On error the player stays in the playing state, the waveform animates forever, the queue never advances, and wall clock listen time keeps accumulating into `audioSeconds`.
**Fix:** add a token guarded `onerror` that flushes audio seconds, stops playback or advances the queue, and surfaces a short message.

### COR-6 (medium, small): Consent and sync mutations swallow errors and can misreport state

`grantConsentAndSync` ([ToolbarProgressIsland.tsx:466](../../src/components/ToolbarProgressIsland.tsx)) has no try/catch, so a rejected remote load becomes an unhandled rejection after local consent was already granted. It and `revokeConsentAndPause` ignore the `{ error }` result of `upsertRemoteConsent`, then report success, so the remote consent row can still say granted while the user believes sync is paused. For a privacy consent flow this misreports state.
**Fix:** wrap the flows in try/catch that sets the error status, and check every `upsertRemoteConsent` result before reporting success.

### COR-7 (low, small): One transient fetch failure permanently disables search, audio, and breadcrumbs

All four loaders in [src/lib/reader-data.ts:71](../../src/lib/reader-data.ts) memoize with `promise ??= fetch(...)` and never clear the module variable on rejection. One flaky network error caches a rejected promise, and every later call fails instantly until a full reload. The eager on-mount loading pattern fires all four fetches at the most failure prone moment of a page load.
**Fix:** reset the memo on rejection so the next call retries.

### COR-8 (low, small): The recently read panel lists sections that were only opened

`recentlyReadSections` ([src/lib/reader-state.ts:376](../../src/lib/reader-state.ts)) includes any section with a state entry. `markSectionOpened` creates entries with `readAt: 0` for sections merely visited, so readers with few completed sections see never read sections in the "Recently read" list.
**Fix:** filter to entries with `readAt > 0` and add a unit test with an opened but unread section.

### COR-9 (low, small): Footer copyright year is frozen at build time

`copyrightYearLabel` ([src/components/SiteShell.tsx:18](../../src/components/SiteShell.tsx)) calls `new Date().getFullYear()` in a statically prerendered server component, so the site shows the year of the last deploy.
**Fix:** accept and document the snapshot, or compute the year in a tiny client island.

## Security

### SEC-1 (low, small): Open redirect in the auth callback

[src/app/auth/callback/route.ts:14](../../src/app/auth/callback/route.ts) redirects to `new URL(next, requestUrl.origin)` with `next` read straight from the query string. `new URL` honors absolute and protocol relative input, so `?next=https://evil.example` or `?next=//evil.example` sends a freshly signed in reader to an attacker page. Verification note: exploitation is currently blocked because PKCE requires the code verifier cookie from the browser that requested the magic link, so this is latent rather than live. It becomes a phishing primitive the moment any flow detail changes.
**Fix:** accept `next` only when it starts with `/` and not `//` or `/\`, otherwise fall back to `/`.

### SEC-2 (low, small): No security headers anywhere

[next.config.ts](../../next.config.ts) sets only `distDir` and `trailingSlash`; [vercel.json](../../vercel.json) sets only build commands. There is no CSP, no `frame-ancestors` or `X-Frame-Options`, no HSTS, no `Referrer-Policy`, no `X-Content-Type-Options`, and `X-Powered-By` stays exposed. The missing frame protection matters most: the site carries authenticated sessions and a one click Delete account button, which is a concrete clickjacking target.
**Fix:** add a `headers()` block with CSP (at minimum `frame-ancestors 'none'`), HSTS, `Referrer-Policy`, `nosniff`, a minimal `Permissions-Policy`, and set `poweredByHeader: false`.

### SEC-3 (medium, small): One click irreversible account deletion with no confirmation and no origin check

The Delete account button ([ToolbarProgressIsland.tsx:620](../../src/components/ToolbarProgressIsland.tsx)) calls `deleteAccount()` directly from `onClick`, and the server route immediately runs `admin.auth.admin.deleteUser`, cascading away all synced data. A single misclick inside the popover destroys the account. The DELETE handler also performs no Origin validation; browser defaults make cross site abuse unlikely today, but a destructive endpoint deserves defense in depth.
**Fix:** add an explicit confirmation step in the UI, and reject requests whose Origin header is present and does not match the site origin.

### SEC-4 (medium, medium): Supabase tables accept unbounded rows and unbounded payloads

The migration ([supabase/migrations/20260630000000_reader_sync.sql:9](../../supabase/migrations/20260630000000_reader_sync.sql)) has no CHECK constraints on payload size, event type values, or column lengths, no per user quota, and no retention policy. Magic link sign in creates accounts for anyone, so any internet user can insert unlimited engagement rows with multi megabyte jsonb payloads using the public anon key. That is a direct storage cost and availability attack, and even honest users grow the events table forever.
**Fix:** add CHECK constraints (`pg_column_size` caps, event type allowlist, length caps), plus a retention job or per user event cap.

### SEC-5 (medium, medium): Remote progress passes only shallow validation before entering local state

`parseProgress` ([src/lib/reader-state.ts:65](../../src/lib/reader-state.ts)) checks only that a truthy `.sections` key exists, then casts. Individual entries are never validated, so a corrupted remote blob (buggy client, manual PostgREST write with the user's own JWT) flows through the merge into localStorage, permanently corrupting the local first state the product promises to protect. `reader-sync.ts:87` also does a wasteful stringify round trip to reuse this parser, and `AudioPlayerIsland.loadPreference` spreads unvalidated JSON into typed preference state the same way. The codebase already has the right pattern in `parseSyncConsent`; these parsers skip it.
**Fix:** validate each section entry field by field, cap section count and serialized size before merging or persisting, and validate voice preference types and ranges.

### SEC-6 (medium, medium): The client event log grows without bound and quota errors are uncaught

`appendStoredEvent` ([src/lib/reader-progress-store.ts:46](../../src/lib/reader-progress-store.ts)) parses and rewrites the whole events array on every append, and nothing ever prunes synced events. The recommendation panel also re-appends four fresh UUID events every time progress changes while the menu is open, because the effect keys on array identity. Over months the array hits the localStorage quota, at which point writes throw `QuotaExceededError` out of scroll and click handlers with no catch. Sync uploads the whole backlog as one unbatched upsert, so an oversized payload fails identically on every retry and wedges sync.
**Fix:** prune synced events, cap the stored array, chunk uploads (about 100 rows), wrap storage writes in try/catch with a drop oldest policy, and key the recommendation effect on stable ids.

### SEC-7 (low, small): The updated-at trigger function has a mutable search_path

`public.set_updated_at()` ([migration line 34](../../supabase/migrations/20260630000000_reader_sync.sql)) is created without pinning `search_path`. Current risk is minimal since it only calls `now()`, but the Supabase linter flags it and it is standard hardening.
**Fix:** recreate the function with `set search_path = ''`.

## Performance

### PERF-1 (high, medium): Every page load eagerly fetches about 4.2 MB of JSON

Four always mounted toolbar islands each fetch a full catalog payload in a mount effect on every page: the search island loads `search-index.json` (1.5 MB) before search is ever opened, the progress island and audio island both load `reader-sections.json` (1.9 MB), the breadcrumbs island loads `breadcrumb-routes.json` (483 KB) just to render the current page's crumbs, and the share island loads `pdf-downloads.json` (262 KB) before the menu opens. The full manuscript text ships twice (sections and search index). Measured: about 1.0 MB gzipped transfer and 4.2 MB of main thread `JSON.parse` per fresh page view, on pages whose actual content is a few KB of prose. Search result links are plain `<a>` tags, so following one reloads the document and pays it all again.
**Fix:** defer each fetch to first interaction; emit a slim progress manifest without section text (ids, hashes, titles, hrefs, paragraph fingerprints) for the progress island; render breadcrumbs server side at build time; use `next/link` for result links.

### PERF-2 (high, small): Unthrottled scroll handler serializes all progress to localStorage per scroll event

The scroll handler ([ToolbarProgressIsland.tsx:268](../../src/components/ToolbarProgressIsland.tsx)) runs on every scroll event with no rAF gate. `recordScrollProgress` returns a new object even when nothing changed, so the 687 line island re-renders per tick, `writeStoredProgress` stringifies the entire progress state and writes localStorage per tick, a window event makes every checkmark island re-parse the blob, and the recommendation memo re-runs an O(n^2) dedupe over up to 566 sections. This is a per frame main thread stall during scrolling, the core interaction of a reading site.
**Fix:** gate with `requestAnimationFrame`, bail when the rounded percent has not increased, return the same reference on no change, debounce persistence (about 500 ms with a `pagehide` flush), and dedupe with a `Set`.

### PERF-3 (medium, small): Search re-normalizes the entire corpus on every keystroke

`scoreEntry` ([src/components/SearchMenuIsland.tsx:47](../../src/components/SearchMenuIsland.tsx)) runs two regex replaces plus `toLowerCase` over each entry's full text for all 566 entries on every keystroke. A ten character query re-processes roughly 12 MB of transient strings. The index never changes after load, so all of this work is recomputed identically.
**Fix:** precompute normalized fields once when the index resolves (or emit them from the compiler), and debounce the query.

### PERF-4 (medium, small): Middleware runs Supabase session refresh on every request for a static site

[middleware.ts](../../middleware.ts) matches every non asset route and awaits `supabase.auth.getUser()` per request. Every manuscript page is statically generated, sync is opt in, and no server component reads the session. Anonymous readers (the overwhelming majority) pay client construction and auth work per page view, and the middleware forces function invocations where pure CDN serving would do.
**Fix:** return early when no `sb-` auth cookie is present, or narrow the matcher to `/api` and `/auth` routes, or remove the middleware and rely on client side token refresh.

### PERF-5 (low, medium): A 72 KB outline is embedded in the HTML of every page

`SiteShell` passes the full `toolbarOutline()` result (72 KB serialized: 9 volumes, 47 parts, 408 chapters) as props to three client islands, so it is inlined into the Flight payload of all roughly 600 static pages, whether or not the outline is opened. It duplicates data already shipped in `breadcrumb-routes.json`.
**Fix:** emit `/data/outline.json` at compile time and load it when the outline first opens, or render the outline as static server HTML inside the popover shell.

### PERF-6 (low, small): The social share image is a raw 2.4 MB PNG

`og:image` points at the 1024x1536 hero PNG. Link preview crawlers fetch it unoptimized, and several platforms cap or reject large preview images, so unfurls can silently fail.
**Fix:** export a dedicated 1200x630 share image under about 300 KB and point OpenGraph and Twitter metadata at it.

### PERF-7 (low, medium): Every compile regenerates all 575 PDFs serially from scratch

`buildPdfDownloads` ([scripts/manuscripts/pdf.ts:385](../../scripts/manuscripts/pdf.ts)) deletes all output then renders 566 section PDFs plus 9 volume PDFs sequentially, laying out the 199k word corpus twice. It runs inside `manuscripts:compile`, which `validate` and `build` both invoke, so a pre-commit run pays it two to three times even when no text changed. The manifest already records a content hash per section that could gate the work.
**Fix:** skip PDFs whose recorded content hash matches, remove only stale files, and bound concurrency instead of running serially.

## Architecture and state

### ARC-1 (medium, large): ToolbarProgressIsland is a 687 line component owning eight concerns

One component owns section resolution, a 148 line engagement effect (idle sampling, scroll milestones, read thresholds), magic link auth, consent lifecycle, account deletion, sync orchestration with debounce, and three rendered panels ([ToolbarProgressIsland.tsx:75](../../src/components/ToolbarProgressIsland.tsx)). It performs side effects inside `setProgress` updater functions, which violates updater purity and double fires under StrictMode. Because the tracking engine lives inside this specific button, removing the button from a layout silently kills all progress capture, and the `ReaderNavigationSource` vocabulary is dead weight since no other island can report navigation intent.
**Fix:** extract `useCurrentSection`, a headless reader tracking island mounted once in `SiteShell`, and a sync account hook; route all writes through one `updateProgress(fn)` helper. The toolbar becomes a thin popover over those hooks.

### ARC-2 (medium, medium): Sync schema and consent versions are written but never read

`upsertRemoteProgress` hardcodes `schema_version: 2` while the migration defaults to 1, and no reader ever checks the value ([src/lib/reader-sync.ts:117](../../src/lib/reader-sync.ts)). Consent `version` and `copyVersion` round trip but nothing compares them to current constants, so bumping the consent version would not prompt re-consent. The versioning fields exist to enable evolution and are inert.
**Fix:** read `schema_version` and route through explicit per version upgrades, refusing unknown future versions. Gate sync on consent version and copy version matching current constants.

### ARC-3 (medium, medium): Importer hardcodes manuscript knowledge and nothing detects section ID drift

Section IDs derive from volume order plus title slugs with order dependent suffixes ([scripts/manuscripts/import-markdown.ts:247](../../scripts/manuscripts/import-markdown.ts)), and the importer wipes and regenerates `content/manuscripts`. Renumbering a volume, retitling a section, or reordering duplicate titles silently rewrites IDs, which orphans every reader's progress and breaks published deep links, and `npm run validate` would pass. The 369 line heuristic parser has zero tests, and it hardcodes per manuscript start markers and acronym lists in source, so adding manuscript ten means editing importer code.
**Fix:** add an ID drift gate that diffs generated IDs against the committed catalog and fails unless removals are covered by aliases. Move start markers and title case exceptions into `content/series/volumes.json`. Add importer tests with fixture markdown.

### ARC-4 (medium, medium): The catalog schema is duplicated between scripts and app, joined by unchecked casts

`scripts/manuscripts/shared.ts` defines the `Compiled*` tree; [src/lib/manuscript-data.ts](../../src/lib/manuscript-data.ts) re-declares the same shapes; `reader-data.ts` re-declares the payload types a third time; breadcrumb types exist in three places. The boundary is `catalogJson as Catalog` plus `response.json() as Promise<T>`. Rename a field in the compiler and the app types still claim it exists, the cast succeeds, and the UI renders `undefined` at runtime. No generated payload carries a schema version, so a cached old payload against new island code fails undetectably.
**Fix:** create one runtime free schema module imported by both scripts and app code, build payloads with `satisfies`, and add a `schemaVersion` field checked by the loaders.

### ARC-5 (low, medium): Audio playback is hardwired to browser speechSynthesis

The pipeline computes `audioVersionId` end to end precisely so prerendered TTS audio could be cache keyed per section revision, but the player constructs `SpeechSynthesisUtterance` directly and keeps the queue state machine inside the component ([src/components/AudioPlayerIsland.tsx:174](../../src/components/AudioPlayerIsland.tsx)). Adding a real TTS provider means rewriting the island, and none of the playback logic is testable.
**Fix:** define an `AudioPlayback` interface in `src/lib`, implement speech synthesis as the first provider, and move the queue state machine out of the component.

## Duplication

### DUP-1 (medium, medium): The popover dismiss state machine is copy pasted across six islands, and five drop focus on Escape

Identical open, outside pointerdown close, Escape close, and route change close logic exists in six components (progress, outline, search, settings, share, audio). The copies have already drifted: only `SearchMenuIsland` restores focus to its trigger on Escape; the other five drop keyboard focus to `<body>`, throwing keyboard and screen reader users back to the top of the page.
**Fix:** extract a `useToolbarMenu` hook that owns the listeners, restores focus on close, and closes on pathname change; adopt it in all six.

### DUP-2 (medium, small): normalizePath is defined identically in eight components

The one line trailing slash normalizer appears verbatim in eight island files, and a ninth variant in `manuscript-data.ts` already differs, proving drift happens.
**Fix:** export one `normalizePath` (plus the `parentRoute` helper) from a shared module and import it everywhere.

### DUP-3 (medium, small): The progress store subscription effect exists three times and one copy has drifted

`ReadCheckmarkIsland` and `UpdatedMarkerIsland` share an identical hydrate plus subscribe effect. `SectionRevisionNotice` is a third, drifted copy that hydrates once and never subscribes, so marking a section read from the toolbar leaves a stale "Revised since you read this" notice until reload. That bug is a direct cost of the copy paste.
**Fix:** add a `useStoredProgress()` hook and use it in all three, which fixes the stale notice.

### DUP-4 (medium, small): The mounted flag JSON loader effect is copy pasted five times

The same 12 line effect wraps each `loadX()` call in five components, one copy carrying a bogus dependency, with inconsistent error handling policy across them. Three of the five also re-implement find-current-section-by-href.
**Fix:** add `useLoadedData(load, fallback)` and optionally `useCurrentSection()` on top.

### DUP-5 (medium, small): Breadcrumbs are implemented twice and the tests cover the copy that never ships

`buildBreadcrumbRoutes` in `compile.ts` writes the shipped payload; `breadcrumbRoutes()` in `manuscript-data.ts` is consumed only by unit tests. The tricky singleton chapter rule is written independently in both. Tests can pass while shipped breadcrumbs diverge.
**Fix:** keep exactly one implementation, imported by both the compiler and the tests, and diff the regenerated payload to confirm identical output.

### DUP-6 (medium, medium): Markdown block parsing exists in three copies that must stay in sync for deep links to work

`MarkdownBody.tsx`, `pdf.ts`, and `paragraphFingerprints` in `shared.ts` all split and classify the same markdown independently. Paragraph anchors are assigned positionally, so the revision jump feature is correct only while `MarkdownBody` and `paragraphFingerprints` split identically. Adding list handling to one but not the other shifts every anchor with no test failing. Note this constraint directly affects the COR-3 fix.
**Fix:** create `src/lib/markdown-blocks.ts` with `splitBlocks` and `classifyBlock`, import it from all three, and add a test asserting split count matches fingerprint count.

### DUP-7 (medium, small): The reading pace constant is maintained in two places

The `Math.max(1, Math.ceil(words / 220))` formula exists in `shared.ts` and `reading-time.ts`. Both are user visible at once: section headers use the compile time value, outline cards compute client side. Tuning one file makes durations disagree.
**Fix:** have `shared.ts` import `readingMinutesForWords` from `src/lib/reading-time.ts` and keep 220 defined once.

### DUP-8 (low, small): The section-is-read predicate is written in three places

Content hash equality defines "read" in `reader-state.ts`, `ReadCheckmarkIsland`, and twice in `ToolbarProgressIsland`. Changing the definition requires lockstep edits or the surfaces disagree.
**Fix:** export `isSectionRead(progress, section)` from `reader-state.ts` and use it everywhere.

### DUP-9 (low, small): The git subprocess helper is written three times across scripts

`versions.ts`, `update-readme-status.ts`, and `shared.ts` each spawn git with slightly different error policies.
**Fix:** export one `git(args, cwd?)` helper and keep error policy at call sites.

### DUP-10 (low, small): Brand kicker and title derivation duplicated between desktop and mobile

`ToolbarBrandIsland` and `MobilePageContextIsland` independently derive the active volume, kicker, and `Volume N · Title` strings. A branding change applied to one ships inconsistent wording at different widths on the same page.
**Fix:** extract a pure `brandContext(pathname, volumes)` helper consumed by both.

### DUP-11 (low, small): Five progress mutators rebuild the same record envelope

`markSectionOpened`, `recordScrollProgress`, `recordReadingTime`, `recordAudioSeconds`, and `markRead` each rebuild the identical default preserving envelope. A future field will silently be dropped by one mutator but not the others; the `paragraphs` array is already preserved only by `markRead`.
**Fix:** add an `upsertSection(progress, section, patch)` helper owning the envelope; rewrite the mutators as thin patches.

### DUP-12 (low, small): Audio voice preferences bypass the lib level storage convention

Every other persisted value defines its key, parse guard, and serializer in `src/lib` with range validation and tests. The audio island declares its key inline and spreads unvalidated JSON into preference state, so a stored rate of 900 is accepted.
**Fix:** move the key and a validating parser into `src/lib/audio-queue.ts` with tests, mirroring `reader-preferences.ts`.

## Maintainability

### MNT-1 (medium, medium): scripts/manuscripts/shared.ts is a 716 line grab bag

It mixes path constants, all pipeline types, fs and hash utilities, markdown and frontmatter parsing including a hand rolled YAML scalar parser, href builders, and the 160 line catalog builder. Ten of its exports have no consumers outside the file.
**Fix:** split into `paths.ts`, `types.ts`, `fs-utils.ts`, `markdown.ts`, and `catalog.ts`; un-export internal helpers.

### MNT-2 (medium, small): Frontmatter parse failures do not name the failing file

A compile over hundreds of generated files dies with "Markdown file is missing frontmatter." and no path ([shared.ts:379](../../scripts/manuscripts/shared.ts)). The YAML scalar parser also feeds single quoted values through `JSON.parse`, so an interior apostrophe throws an opaque SyntaxError.
**Fix:** rethrow with the file path, and harden or replace the scalar parser with tests for quoted values.

### MNT-3 (low, small): Product defining thresholds are inline magic numbers

The 80 percent read threshold, 5000 ms sampling interval, and 1500 ms sync debounce are inline in the progress island; the search island inlines its debounce, result cap, and scoring weights. The same file already names `idleThresholdMs`, so the convention exists but is inconsistent.
**Fix:** hoist to named constants beside the existing ones.

### MNT-4 (low, small): Dead export cluster misleads readers about what the app uses

Seven exported functions have no production consumers: `sectionByRoute`, `aliasByRoute`, `sectionByRouteOrAlias`, `routeParams`, `excerpt`, `navigationSourcePayload`, and `grantStoredConsent` (which the progress island re-implements inline instead of calling). `queueFromSection` is consumed only by its own test and duplicates `queueFromSections`. The repo's own rules require every export to have a consumer.
**Fix:** delete the dead exports and their tests, and either use `grantStoredConsent` or remove it.

## Accessibility and usability

### A11Y-1 (high, small): Dark theme readers get a bright flash on every page load

Preferences apply only in a post mount effect ([ToolbarSettingsIsland.tsx:54](../../src/components/ToolbarSettingsIsland.tsx)); the layout renders no pre-paint script and pins `colorScheme: "light"`. Every cold load paints bright parchment first, then flips after hydration; the font scale jump also shifts layout. This hits every returning dark theme reader at night.
**Fix:** inject a tiny inline head script that reads the stored preference and sets the theme attributes before first paint.

### A11Y-2 (medium, medium): The keyboard focus indicator is suppressed across the whole UI

Nearly every interactive element sets `outline: none` and styles `:focus-visible` identically to hover with a roughly 11 percent opacity tint ([globals.css:604](../../src/app/globals.css)). Focused and selected options in the settings menus are visually identical, and the hardcoded bronze tints are nearly invisible on dark themes. This fails WCAG 2.4.7 in practice.
**Fix:** add a distinct theme aware `:focus-visible` outline to the shared button and link rules; keep the tint for hover only.

### A11Y-3 (medium, small): Muted text fails WCAG AA contrast on the default and light themes

`--ink-muted` computes to about 3.7:1 on parchment and 4.4:1 on light, below the 4.5:1 threshold, and is used for genuinely small text: footer, version metadata, outline durations, card metadata.
**Fix:** darken the token to reach 4.5:1 or switch the small text rules to `--ink-soft`.

### A11Y-4 (medium, small): Sync and sign in status messages are never announced

`syncMessage` and `authMessage` render as plain paragraphs with no live region, so screen reader users never hear "Check your email to finish." or sync results. The share island already gets this right with `role="status"`.
**Fix:** wrap both in `role="status"` containers and add a hidden live region announcing audio play and pause transitions.

### A11Y-5 (low, small): The font picker declares combobox semantics it does not implement

The trigger declares `role="combobox"` with a listbox popup, but there is no arrow key handling and no `aria-activedescendant`; options are Tab only, contradicting what the roles announce. The theme row is a plain div whose `aria-label` is not exposed without a role.
**Fix:** implement the select only combobox keyboard pattern or drop the roles; add `role="group"` to the theme row.

### A11Y-6 (low, small): Hover tooltips cannot be dismissed with Escape

`useCleanTooltip` closes only on pointer leave, blur, or pointerdown. WCAG 1.4.13