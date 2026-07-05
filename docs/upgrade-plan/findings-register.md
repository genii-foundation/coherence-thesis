# Findings Register

Every confirmed finding from the review, grouped by theme. Each entry carries a
stable ID, severity, effort (machine time), the file and line it anchors to, the
concrete failure it causes, and the fix. Effort: **small** is under an hour,
**medium** is one focused session, **large** is multi-session.

Verification: findings marked **[verified]** survived an adversarial pass where a
separate agent tried to refute them against the code. Findings marked
**[critic, reproduced]** came from a completeness pass and were re-checked by
hand during this write-up. See [methodology.md](methodology.md).

Severity totals: 8 high, 39 medium, 27 low. No critical findings.

## Contents

- [Security and privacy](#security-and-privacy)
- [Correctness and data integrity](#correctness-and-data-integrity)
- [Performance](#performance)
- [Duplication and reuse](#duplication-and-reuse)
- [Architecture and extensibility](#architecture-and-extensibility)
- [Accessibility and usability](#accessibility-and-usability)
- [Maintainability](#maintainability)
- [Testing, CI, and release engineering](#testing-ci-and-release-engineering)
- [SEO, metadata, and docs](#seo-metadata-and-docs)

---

## Security and privacy

### SEC-01 [medium, medium] Sync tables accept unbounded rows and payloads
`supabase/migrations/20260630000000_reader_sync.sql:9` [verified]

RLS only checks `auth.uid() = user_id`. There are no CHECK constraints on
payload size, `event_type` values, or id/route lengths, no per-user quota, and
no retention policy. Magic-link sign-in with the default `shouldCreateUser` lets
anyone create an account, then use the public anon key to insert unlimited
`reader_engagement_events` rows with multi-megabyte JSONB payloads or upsert an
arbitrarily large `reader_progress.progress` blob. On a free or pro Supabase
tier this is a direct storage-cost and availability attack, and legitimate
long-lived users grow the events table forever since nothing prunes it.

Fix: add CHECK constraints (`pg_column_size(payload) < ~8KB`, an `event_type`
allowlist, length caps on the text columns, `pg_column_size(progress) <
~256KB`), enforce a per-user event cap or a `pg_cron` retention job, and
consider db-level insert rate limiting.

### SEC-02 [medium, small] One-click account deletion with no confirmation or Origin check
`src/components/ToolbarProgressIsland.tsx:505`, `src/app/api/account/route.ts:24` [verified]

`deleteAccount()` fires directly from the Delete account button `onClick` with
no confirmation dialog, and the DELETE handler immediately calls
`admin.auth.admin.deleteUser(user.id)`, which cascades and destroys all synced
progress, events, and consent rows. A single misclick permanently deletes the
account. The handler also does no `Origin`/`Referer` validation; SameSite=Lax
cookies make cross-site abuse unlikely today, but the destructive endpoint has
zero defense in depth if cookie behavior changes.

Fix: add an explicit confirmation step (typed confirmation or two-step dialog)
before `deleteReaderAccount()`, and reject requests whose `Origin` header is
present and does not match the site origin.

### SEC-03 [medium, medium] Remote and persisted progress get only shallow validation
`src/lib/reader-sync.ts:86` [verified]

`loadRemoteReaderState()` feeds the remote JSONB through `parseProgress`, which
casts `JSON.parse` output to `ReaderProgressState` after checking only that a
truthy `.sections` key exists. Section entries are never validated, so a
corrupted entry with `percent` as a string or NaN timestamps reaches the
`maxPercent`/`readPercent` arithmetic and gets written back to localStorage,
permanently corrupting the local-first state the product promises to protect. A
`QuotaExceededError` thrown inside the `setProgress` updater crashes the island
with no error boundary. `upsertRemoteProgress` writes `schema_version: 2` while
the migration defaults to 1, and no reader ever reads it back.
`AudioPlayerIsland.loadPreference` has the same gap. The codebase already has
the right pattern: `parseSyncConsent` and `parseEngagementEvents` validate per
field.

Fix: validate each section entry (string ids, finite numbers, drop unknown
shapes), accept `unknown` so `reader-sync` need not stringify-then-reparse, cap
total sections and serialized size, wrap localStorage writes in try/catch with
an observable failure state, and check `schema_version` on read.

### SEC-04 [medium, medium] Engagement event log grows without bound and syncs unbatched
`src/lib/reader-progress-store.ts:46` [verified]

`appendStoredEvent` reads, parses, appends, and re-stringifies the entire events
array on every event, so cost per append is O(total events). Nothing prunes.
Events fire frequently, and `ToolbarProgressIsland.tsx:420-434` re-appends four
`recommendation_shown` events with fresh UUIDs every time progress changes while
the menu is open. Over months the array exceeds the ~5 MB localStorage quota, at
which point the writes throw `QuotaExceededError` out of scroll and click
handlers with no try/catch. Separately, `uploadRemoteEvents` sends all pending
events in one upsert, so a large backlog produces one oversized request that
fails every retry and wedges sync in the error state.

Fix: prune synced events and cap the array, batch uploads in chunks of ~100
marking each chunk as it lands, wrap `setItem` in try/catch with a drop-oldest
path, keep an in-memory copy so appends do not re-parse, and key the
`recommendation_shown` effect on a stable id string per menu-open.

### SEC-05 [low, small] No security headers anywhere; `X-Powered-By` exposed
`next.config.ts:3` [verified]

`next.config.ts` defines only `distDir` and `trailingSlash`, `vercel.json` sets
only build and install commands, and there is no security header configuration
anywhere. `poweredByHeader` stays at its default `true`. The site carries
authenticated Supabase sessions and renders a one-click Delete account button,
so the missing `frame-ancestors` protection makes a clickjacking chain concrete:
iframe the site, overlay two positioned clicks to open the progress popover and
click Delete account. Missing CSP means any future XSS runs with full session
access.

Fix: add an async `headers()` block applying `Content-Security-Policy` with
`frame-ancestors 'none'` (or `X-Frame-Options: DENY`),
`Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Content-Type-Options: nosniff`, and a minimal `Permissions-Policy`; set
`poweredByHeader: false`.

### SEC-06 [low, small] Open redirect via unvalidated `next` in the auth callback
`src/app/auth/callback/route.ts:14` [verified]

The route reads `next` from the query string and redirects with `new URL(next,
requestUrl.origin)`. `new URL` only applies the base origin when the input is
relative, so `?next=https://evil.example` or `?next=//evil.example` resolves to
the attacker's site. Exploitability is currently blocked by PKCE (the
`code_verifier` cookie must live in the browser that requested the link), which
is why this is low rather than high, but it is a latent post-login phishing
primitive if the flow ever changes. The only legitimate producer of `next` sends
an `encodeURIComponent(pathname)`, so a guard cannot break the real flow.

Fix: accept `next` only when it starts with `/` and not `//` or `/\`, else fall
back to `/`; or require `url.origin === requestUrl.origin`.

### SEC-07 [low, small] `set_updated_at` trigger has a mutable search_path
`supabase/migrations/20260630000000_reader_sync.sql:34` [verified]

The function is created without pinning `search_path`. The Supabase database
linter flags this (`function_search_path_mutable`). The function only calls
`now()`, so current risk is minimal, but it is a standard hardening gap that
surfaces on every Supabase security lint.

Fix: recreate with `security invoker set search_path = ''` and schema-qualify
future references.

---

## Correctness and data integrity

### BUG-01 [high, small] `mergeProgressStates` doubles engagement counters on every sync
`src/lib/reader-state.ts:267` [verified]

`mergeProgressStates` adds local and remote values for `openCount`,
`returnCount`, `activeSeconds`, `idleSeconds`, `totalVisibleSeconds`,
`manualReadCount`, `autoReadCount`, and `audioSeconds` (lines 267-285). Remote
state is the previously uploaded copy of local state, so every signed-in page
load merges local with its own remote mirror and doubles every counter, then
uploads the doubled state. Read one section for 100 active seconds and after
three visits the stored state claims 800 seconds and 8 opens. Every engagement
metric, and any future spaced-repetition logic built on it, becomes garbage.
Confirmed by reading the merge body directly: the timestamps use `Math.min`/
`Math.max`, but all eight counters use addition.

Fix: merge counters with `Math.max` (a device's counters are monotonic supersets
of what it uploaded), or track a last-synced snapshot and merge deltas. Add a
`reader-state.test.ts` case asserting `merge(state, state)` equals `state`.

### BUG-02 [high, medium] Multiple progress writers with last-writer-wins overwrite
`src/components/ToolbarProgressIsland.tsx:289` [verified]

Progress under the single key `coherence-reader-progress-v2` is written by
`ToolbarProgressIsland` (scroll, open, mark-read) and by `AudioPlayerIsland`
(`recordAudioSeconds`). `AudioPlayerIsland` correctly does read-modify-write
against `readStoredProgress()`, but `ToolbarProgressIsland` seeds a React copy
once at mount and thereafter serializes that in-memory copy on every write,
never listening to the update or storage events. Concrete failure: a reader
plays audio, `AudioPlayerIsland` writes `audioSeconds`, then the next scroll tick
writes the stale copy and silently drops the audio seconds. The same lost update
happens across two open tabs. `mergeProgressStates` exists but is used only for
remote sync, not local concurrent writers.

Fix: make `reader-progress-store.ts` the single source of truth via a
`useSyncExternalStore` subscribe/getSnapshot plus an `update(fn)` that does
read-modify-write inside one synchronous call, and have every island consume it
instead of a private React copy. Wire it to both the custom event and the
storage event. (Ties to ARCH-01/DATA-01.)

### BUG-03 [high, small] Theme and font flash on every page load
`src/components/ToolbarSettingsIsland.tsx:54` [verified]

Reader preferences (theme, font family, scale) are read from localStorage and
applied to `document.documentElement` only inside a post-mount `setTimeout`.
`layout.tsx` renders no pre-paint script and pins `viewport.colorScheme` to
`light`. A reader who chose the dark or black theme gets the bright parchment
theme painted first on every cold load, then a jarring flip once React hydrates,
and the font scale jumps, shifting layout. This hits every returning dark-theme
reader.

Fix: inject a tiny inline script in the document head that reads
`coherence-reader-preferences-v1` and sets the theme attribute, font-scale
custom properties, and theme-color meta before first paint. Keep
`ToolbarSettingsIsland` as the interactive writer.

### BUG-04 [high, small] Markdown lists render as run-on paragraphs
`src/components/MarkdownBody.tsx:55` [critic, reproduced]

`MarkdownBody` has branches for headings, blockquotes, and tables but no list
branch, so a Markdown bullet-list block falls through to `<p>{renderInline(...)}
</p>`. Because consecutive `- item` lines share one block (split on `/\n{2,}/`)
and HTML collapses newlines, the items render as one run-on paragraph with
literal `- ` markers. Reproduced: 17 canonical sections contain such lists (for
example the appendix citation lists under
`content/manuscripts/providence-imperative/08-the-invitation/12-appendix-...`),
so shipped reader pages visibly mangle published content. The PDF pipeline
already parses these blocks correctly, so only the web reader breaks.

Fix: add a list branch mirroring `scripts/manuscripts/pdf.ts` (split lines,
strip the marker, render `<ul><li>`), keeping the paragraph anchor id on the
wrapper. Best done as part of DUP-03 (shared block parser).

### BUG-05 [high, small] Canonical URLs declare ~460 pages duplicates of the homepage
`src/app/layout.tsx:26` [critic, reproduced]

The root layout sets `alternates: { canonical: "/" }`. Next.js metadata merging
inherits the nearest defined `alternates`, and only the section branch of
`generateMetadata` in the `[...route]` page overrides it. Reproduced by reading
the layout and the volume/overview `generateMetadata` functions: every volume,
part, chapter, and overview page therefore emits `<link rel="canonical"
href="https://www.coherence-thesis.com/">`, declaring roughly 460 hub pages to
be duplicates of the homepage and inviting crawlers to deindex them, while
`sitemap.ts` lists those same URLs. `openGraph.url: "/"` has the same problem for
social shares.

Fix: remove `alternates` and `openGraph.url` from the root layout and set
per-route canonicals in each `generateMetadata`, including the chapter and part
branches.

### BUG-06 [high, small] PDF pipeline silently falls back to core fonts in production
`scripts/manuscripts/pdf.ts:66` [critic, reproduced]

`registerFonts` probes hardcoded absolute font paths for macOS and Debian. Since
`public/downloads` is gitignored and `vercel.json` runs `npm run build` (which
regenerates PDFs), production PDFs are built on the deploy host where none of
those paths exist, so the code silently falls back to PDFKit core fonts
(Times-Roman/Courier) with WinAnsi encoding. Reproduced: the corpus contains
non-WinAnsi characters (U+2248, U+2192, U+2042, schwa, macron o), which AFM
encoding maps to `.notdef`, so the shipped PDFs get missing glyphs and different
typography than local builds, with no error and no CI to notice. The macOS mono
slot also registers Arial Unicode, which is not monospaced, so tables misalign.

Fix: vendor an OFL-licensed serif and mono TTF in the repo, register it
unconditionally, and fail the build when font registration falls back.

### BUG-07 [medium, small] SpeechSynthesis errors leave the audio player stuck playing
`src/components/AudioPlayerIsland.tsx:188` [verified]

`playIndex` builds an utterance with only an `onend` handler.
`SpeechSynthesisUtterance` also fires `onerror` (voice unavailable, synthesis
failure, interruption), common on Chrome with long text, and here the utterance
holds an entire section. On error `onend` never fires, so `playing` stays true,
the waveform animates forever, the queue never advances, and
`audioStartedAtRef` keeps accumulating listen-seconds that later record as real
listening time.

Fix: add a token-guarded `utterance.onerror` that flushes audio seconds, sets
`playing` false, and either advances the queue or surfaces a short message.

### BUG-08 [low, small] Client data loaders cache rejected promises forever
`src/lib/reader-data.ts:71` [verified]

All four loaders memoize with `promise ??= fetch(...)` and never clear the
module-level variable on rejection. One flaky network error during initial load
caches a rejected promise, so every later call (search, audio, share menu)
rejects instantly and the features stay dead until a full page reload. This is
made worse by the eager-on-mount loading pattern (PERF-01), which fires all four
fetches at the most failure-prone moment.

Fix: reset the memo on failure (attach `.catch` that nulls the variable and
rethrows) or store only fulfilled results.

### BUG-09 [low, small] "Recently read" lists sections that were only opened
`src/lib/reader-state.ts:376` [verified]

`recentlyReadSections` includes any section with a state entry.
`markSectionOpened` creates entries with `readAt: 0` for merely visited
sections, so a reader with fewer than four completed sections sees never-read
sections in the Recently read panel, and the `readAt: 0` sentinel leaks into UI
logic.

Fix: filter to entries with `readAt > 0` (or `lastReadAt` set) before mapping;
add a unit test with an opened-but-unread section.

### BUG-10 [medium, small] Sitemap and robots default to a placeholder host
`src/app/sitemap.ts:6`, `src/app/robots.ts:5` [verified]

Both build URLs from `process.env.NEXT_PUBLIC_SITE_URL ?? "https://
coherence-thesis.local"`, while `layout.tsx` hardcodes
`https://www.coherence-thesis.com` as `metadataBase`. `NEXT_PUBLIC_SITE_URL`
appears nowhere else, not in `.env.example`, README, or `vercel.json`. Unless
someone set it in the Vercel dashboard, the deployed sitemap lists every URL
under the nonexistent `.local` host and robots advertises a `.local` sitemap,
making the sitemap useless to search engines. Even when set, two sources of
truth can disagree on www vs apex.

Fix: create one shared `src/lib/site-url.ts` reading the env var with the real
domain as fallback, and use it in `layout.tsx`, `sitemap.ts`, and `robots.ts`;
add the var to `.env.example` or drop it.

---

## Performance

### PERF-01 [high, medium] ~4.2 MB of JSON fetched and parsed on every page load
`src/components/SearchMenuIsland.tsx:89` [verified]

`SiteShell` (in the root layout) mounts client islands that each fetch a
full-catalog payload in a mount-time effect on every page: `search-index.json`
(1.51 MB / 445 KB gzip) even before search opens, `reader-sections.json` (1.92
MB / 508 KB gzip) fetched by two islands, `breadcrumb-routes.json` (483 KB) just
to render current crumbs, and `pdf-downloads.json` (262 KB) before the share
menu opens. `reader-sections.json` and `search-index.json` each embed the full
manuscript text, so the corpus ships twice. Measured: ~1.01 MB gzip eager
transfer and ~4.18 MB of main-thread `JSON.parse` per fresh page view, on a site
whose actual content is a few KB of prose. Header islands scale linearly as the
corpus grows.

Fix: defer each fetch to first interaction; emit a slim progress manifest from
`compile.ts` (ids, hashes, hrefs, titles, paragraph fingerprints, no text) for
`ToolbarProgressIsland`; render breadcrumbs server-side per page; use `next/link`
for result and recommendation links so the module cache survives navigation.

### PERF-02 [high, small] Unthrottled scroll handler stalls the core reading interaction
`src/components/ToolbarProgressIsland.tsx:268` [verified]

The `onScroll` handler runs on every scroll event with no rAF or percent-change
gating. Each event calls `setProgress` with `recordScrollProgress`, which always
returns a new object even when the max percent is unchanged, so React re-renders
the 687-line island every tick. Each tick also `JSON.stringify`s the entire
progress state to localStorage and dispatches an event that makes every mounted
`ReadCheckmarkIsland`/`UpdatedMarkerIsland` re-parse the full blob. The progress
change re-runs `recommendNextSections`, which dedupes with `filter`+`findIndex`,
O(n^2) over up to 566 sections (~320k comparisons). Past 80% a second
`setProgress` fires per event. On long pages, especially mobile, this is a
per-frame main-thread stall during scrolling.

Fix: gate the handler with `requestAnimationFrame` and bail when the rounded
percent has not increased; make `recordScrollProgress` return the same reference
when unchanged; debounce the localStorage write (~500 ms trailing plus flush on
pagehide); replace the O(n^2) dedupe with a `Set`.

### PERF-03 [medium, small] Search re-normalizes the whole corpus on every keystroke
`src/components/SearchMenuIsland.tsx:136` [verified]

The results `useMemo` maps `scoreEntry` over all 566 entries on every query
change with no debounce. `scoreEntry` calls `normalize()` (two regex replaces
plus `toLowerCase`) on each entry's full text (~1.25 MB total corpus) per
keystroke. A 10-character query re-normalizes the whole corpus 10 times, roughly
12+ MB of transient string churn and 20+ full-corpus regex passes, causing
visible input lag on mid-range mobile.

Fix: precompute normalized title/hierarchy/body fields once when the index
resolves (or emit them from `compile.ts`) so per-keystroke work is substring
matching only; optionally debounce ~100 ms.

### PERF-04 [medium, small] Middleware refreshes the Supabase session on every request
`src/lib/supabase/middleware.ts:27` [verified]

The matcher covers every non-asset route and always calls
`updateSupabaseSession`, which constructs a Supabase client and awaits
`supabase.auth.getUser()` on every page view. All manuscript pages are static,
sync is opt-in, and no server component reads the session for rendering; the only
server-side consumers create their own clients. For the anonymous majority this
is pure per-request overhead that forces every page through a function
invocation instead of pure CDN static serving.

Fix: early-return when the request carries no `sb-` auth cookie, or narrow the
matcher to `/api/:path*` and `/auth/:path*`, or remove the middleware and rely
on the browser client's auto-refresh.

### PERF-05 [low, medium] 72 KB toolbar outline serialized into every static page
`src/components/SiteShell.tsx:28` [verified]

`SiteShell` calls `toolbarOutline()` (measured 71,630 bytes serialized: 9
volumes, 47 parts, 408 chapters) and passes it as props to three client islands.
Because they are client islands, the outline is embedded in the Flight payload
inlined into every prerendered HTML document, adding ~72 KB pre-gzip to each of
~600 static pages even when the outline is never opened. It also duplicates data
already shipped via `breadcrumb-routes.json`.

Fix: emit a small `/data/outline.json` from `compile.ts` and load it lazily when
the outline or brand menu first opens, or render the outline as static server
HTML inside the popover shell.

### PERF-06 [low, small] OG share image is a raw 2.4 MB PNG
`src/app/layout.tsx:8` [verified]

`openGraph`/`twitter` images point at `/art/coherence-thesis-hero.png`, served
raw at 2,445,562 bytes (1024x1536). `next/image` optimizes on-page uses, but
`og:image` is fetched unoptimized by crawlers. Several platforms cap or degrade
previews over ~600 KB, so link previews can silently fail, and every working
unfurl pulls 2.4 MB.

Fix: export a dedicated 1200x630 share image under ~300 KB and point the OG and
Twitter metadata at it, keeping the full-resolution hero for on-page rendering.

### PERF-07 [low, medium] Every compile regenerates all 575 PDFs from scratch
`scripts/manuscripts/pdf.ts:388` [verified]

`buildPdfDownloads` starts with `cleanDir`, then serially renders all 566
section PDFs plus 9 volume PDFs; each volume PDF re-renders every section, so the
corpus is laid out twice per run with no incremental skip, even though the
manifest already records a per-section `contentHash`. This runs on every
`manuscripts:compile`, invoked by both `build` and `validate`, so `validate`
does full PDF regeneration twice, and the pre-commit ritual makes it three
times.

Fix: skip regeneration when the output exists and its recorded hash matches;
replace the unconditional `cleanDir` with removal of only stale files; run the
remaining writes with bounded concurrency; drop the standalone
`manuscripts:compile` from `validate` since `build` already compiles.

---

## Duplication and reuse

### DUP-01 [medium, medium] Toolbar popover dismiss logic copy-pasted across six islands
`src/components/ToolbarProgressIsland.tsx:194` [verified]

The identical menu behavior (close on outside pointerdown, close on Escape, plus
a close-on-pathname-change timeout) is duplicated in `ToolbarProgressIsland`,
`OutlineMenuIsland`, `SearchMenuIsland`, `ToolbarSettingsIsland`,
`ToolbarShareIsland`, and `AudioPlayerIsland`. The copies have already drifted:
only `SearchMenuIsland` restores focus to the trigger on Escape; the other five
drop keyboard focus to `document.body`, so a keyboard or screen-reader user who
opens the outline, presses Escape, and hits Tab is thrown back to the top of the
page. This is both a duplication bug and a WCAG 2.4.3-adjacent focus failure.

Fix: extract `src/components/useToolbarMenu.ts` returning `{ open, setOpen,
containerRef, buttonRef }` that installs the listeners while open, restores focus
to `buttonRef` on Escape, and closes on `usePathname()` change. Adopt in all six.

### DUP-02 [medium, medium] Catalog schema hand-duplicated between scripts and app
`src/lib/manuscript-data.ts:179` [verified]

`scripts/manuscripts/shared.ts` defines `CompiledSection`/`CompiledChapter`/
`CompiledPart`/`CompiledVolume`/`CompiledCatalog` and `SearchIndexEntry`.
`src/lib/manuscript-data.ts` re-declares the same tree as `Section`/`Chapter`/
`Part`/`Volume`/`Catalog`, `reader-data.ts` re-declares `SearchIndexEntry`,
`BreadcrumbRoute`, `PdfDownloadManifest`, and `ReaderSectionData`, and
`compile.ts` defines some a third time inline. The boundary is bridged only by
unchecked casts (`catalogJson as Catalog`, `response.json() as Promise<...>`).
If `compile.ts` renames or retypes a field, the app types still claim it exists,
the cast succeeds, and the UI renders `undefined` at runtime with no compile
error. None of the four payloads carries a schema version.

Fix: create a runtime-free `src/lib/manuscript-schema.ts` imported by both
`scripts/manuscripts/*` and `src/lib/*`; build payloads with `satisfies`; delete
the `Compiled*` duplicates; replace the `as Catalog` cast with a typed import or
a cheap runtime shape check; add a `schemaVersion` field plus a loader check.

### DUP-03 [medium, medium] Markdown block parsing exists in three copies
`src/components/MarkdownBody.tsx:23` [verified]

Three implementations parse the same canonical Markdown: `MarkdownBody` (block
split plus `isTable`/`tableCells`), `scripts/manuscripts/pdf.ts` (byte-identical
`isTable`, near-identical `tableCells`, same split in `parseMarkdownBlocks`), and
`shared.ts` `paragraphFingerprints` (same split to assign anchors).
`MarkdownBody` assigns anchors positionally, so the "jump to first changed
passage" feature is correct only while `MarkdownBody` and `paragraphFingerprints`
split identically. Add list handling to one without mirroring the other and every
revision deep link points at the wrong paragraph, with no test or type error.
This is also the root cause of BUG-04.

Fix: create `src/lib/markdown-blocks.ts` (pure, no node imports) exporting
`splitBlocks` and `classifyBlock` plus `isTable`/`tableCells`, imported by all
three; add a test asserting `splitBlocks` count matches `paragraphFingerprints`
length for a fixture.

### DUP-04 [medium, small] `normalizePath` defined identically in eight components
`src/components/OutlineMenuIsland.tsx:9` [verified]

The one-line trailing-slash normalizer is copy-pasted verbatim in
`OutlineMenuIsland`, `ToolbarProgressIsland`, `ToolbarShareIsland`,
`ToolbarBreadcrumbs`, `AudioPlayerIsland`, `ToolbarBrandIsland`,
`MobilePageContextIsland`, and `MobileHomeLinkIsland`. A ninth variant,
`normalizeHref` in `manuscript-data.ts`, already differs (special-cases `/`),
proving the copies drift.

Fix: export one `normalizePath` (and the `parentRoute` helper) from
`src/lib/routes.ts` and replace all eight local definitions.

### DUP-05 [medium, small] Progress-subscription effect duplicated in three islands
`src/components/SectionRevisionNotice.tsx:18` [verified]

`ReadCheckmarkIsland` and `UpdatedMarkerIsland` contain an identical effect:
hydrate via `setTimeout(0)`, then subscribe to both the storage event and
`readerProgressUpdatedEvent`. `SectionRevisionNotice` is a drifted third copy
that hydrates once and never subscribes, so marking a section read from the
toolbar leaves the notice showing "Revised since you read this" with a stale
target until reload. The inconsistency exists today.

Fix: add a `useStoredProgress()` hook that returns progress hydrated on mount and
re-read on both events; use it in all three, which fixes the stale notice.

### DUP-06 [medium, small] Mounted-flag JSON loader effect copy-pasted five times
`src/components/ToolbarShareIsland.tsx:52` [verified]

The same 12-line effect (`let mounted = true; loadX().then(set).catch(fallback)`)
is duplicated in `ToolbarProgressIsland`, `AudioPlayerIsland` (with a bogus
dependency), `SearchMenuIsland`, `ToolbarShareIsland`, and `ToolbarBreadcrumbs`.
Three of them also re-implement "find the current section by normalized href".
Error-handling policy is inconsistent (silent empty vs a `loadError` flag).

Fix: add `useLoadedData<T>(load, fallback)` encapsulating the mounted flag, adopt
in all five; optionally add `useCurrentSection()` for the href matchers.

### DUP-07 [medium, small] Reading-pace constant duplicated between scripts and app
`src/lib/reading-time.ts:3` [verified]

`shared.ts` `readingMinutes` and `reading-time.ts` `readingMinutesForWords` are
the same `Math.max(1, Math.ceil(words / 220))`, maintained independently. Both
are user-visible at once (section header vs outline durations), so tuning the
pace in one file makes the header disagree with the outline for the same content.

Fix: have `shared.ts` import `readingMinutesForWords` from `reading-time.ts` (it
is dependency-free and tested) and delete the local copy.

### DUP-08 [low, small] Brand kicker/title derivation duplicated across two islands
`src/components/MobilePageContextIsland.tsx:26` [verified]

`ToolbarBrandIsland` and `MobilePageContextIsland` independently find the active
volume and derive the kicker and title, including the literal `Volume N · Title`
format string, in two places. A branding change applied to one ships
inconsistent wording at different widths.

Fix: extract `brandContext(pathname, volumes)` returning `{ kicker, title,
mobileTitle, activeVolume }` and consume from both.

### DUP-09 [low, small] The "section is read" predicate written in three places
`src/components/ReadCheckmarkIsland.tsx:20` [verified]

"A section is read when the stored contentHash equals the current contentHash" is
implemented in `reader-state.ts` `readPercent`, `ReadCheckmarkIsland`
`sectionsAreRead`, and inline twice in `ToolbarProgressIsland`. Change the
definition and three or four sites must change in lockstep or the checkmarks, the
percent, and the mark-read button disagree.

Fix: export `isSectionRead(progress, section)` from `reader-state.ts` and use it
everywhere; cover it in `reader-state.test.ts`.

### DUP-10 [low, small] Git subprocess helper duplicated three times
`scripts/update-readme-status.ts:10` [verified]

The `execFileSync("git", ...)` invocation is written three times across
`versions.ts`, `update-readme-status.ts` (with divergent swallow-to-empty error
policy), and inline in `shared.ts` `getGitRevision`.

Fix: export one `git(args, cwd?)` from a shared scripts module, implement
`getGitRevision` on top of it, and import it in `update-readme-status.ts`.

### DUP-11 [low, small] Audio voice preference bypasses the lib storage convention
`src/components/AudioPlayerIsland.tsx:21` [verified]

Every other persisted value defines its key, parse guard, and serializer in
`src/lib`. `AudioPlayerIsland` declares `voiceStorageKey` in the component and
does its own unvalidated `JSON.parse` spread, so a corrupted `rate` or non-string
`voiceURI` is accepted, unlike `parseFontSize`'s range checks. The persistence
logic cannot be unit-tested, and there is no single registry of `coherence-*`
keys for a future erase-all-data feature.

Fix: move the key and `parseVoicePreference`/`serializeVoicePreference` (with
rate/pitch clamping) into `audio-queue.ts` next to `defaultVoicePreference`; add
tests. Optionally add a generic `readJsonStorage(key, parse)` helper.

---

## Architecture and extensibility

### ARCH-01 / DATA-01 [high, medium] No single source of truth for progress state
`src/components/ToolbarProgressIsland.tsx:289` [verified]

See BUG-02. Beyond the lost-update symptom, the architectural cause is that
progress has no owning module: two islands write the same key with different
strategies and three more subscribe to a custom event. There is no reader that
guarantees read-modify-write.

Fix: promote `reader-progress-store.ts` to the sole owner with a
`useSyncExternalStore` API and an atomic `update(fn)`. This finding is the anchor
for Phase 3 and resolves BUG-02.

### ARCH-02 [medium, large] `ToolbarProgressIsland` is a 687-line god-component
`src/components/ToolbarProgressIsland.tsx:75` [verified]

One component owns eight concerns: pathname-to-section resolution, a 148-line
engagement effect (idle sampling, scroll milestones, read-threshold detection),
magic-link auth, consent lifecycle, account deletion, sync orchestration with a
status machine, and three rendered panels. It performs side effects
(`writeStoredProgress`) inside `setProgress` updater functions, which violates
updater purity and double-fires under StrictMode. Because the tracking engine
lives inside this one button, moving or removing the button silently kills all
progress capture, and none of the engine is reusable. `markSectionOpened` is
always called with source `"direct"`, so the whole `ReaderNavigationSource`
vocabulary is dead weight.

Fix: extract `useCurrentSection`, a headless `useReaderTracking` hook or
`<ReaderTracking>` island mounted once in `SiteShell`, a `useReaderSync` hook for
user/consent/status, and `SyncPanel`/`RecommendationList` components. Route all
writes through one `updateProgress(fn)` helper that computes state outside the
React updater.

### ARCH-03 [medium, medium] Sync and consent versioning are written but never read
`src/lib/reader-sync.ts:117` [verified]

`upsertRemoteProgress` hardcodes `schema_version: 2` while the migration default
is 1, and `loadRemoteReaderState` selects only the `progress` column, feeding it
to `parseProgress` with no version check. If the shape changes to v3, old clients
merge and re-upload v3 rows as v2, silently corrupting them. `consent_version`
and `copy_version` are stored and round-tripped but never compared against the
current constants, so bumping the consent copy would not prompt re-consent.

Fix: read `schema_version` and route through a per-version upgrade before
merging (refusing unknown future versions); add a consent gate that re-shows the
prompt when the stored version or copy differs; add tests for both.

### ARCH-04 [medium, medium] No section-ID drift detection in the import pipeline
`scripts/manuscripts/import-markdown.ts:247` [verified]

`AGENTS.md` calls stable section IDs the foundation of deep links, progress,
badges, audio, and sync. But `createSection` builds IDs from
`slugify(v{order} {title})` with order-dependent suffixes, and `main()` wipes
`content/manuscripts` before regenerating. Renumbering a volume, retitling a
section, or reordering duplicate-titled sections silently rewrites IDs, orphaning
every reader's localStorage and Supabase progress and breaking deep links.
Neither the importer nor `validate.ts` compares new IDs against the previous
catalog, so this data-loss event passes `npm run validate`. The 369-line
heuristic parser has no test file, and it is hardwired to the current nine
manuscripts via `startMarkers` and an `alwaysUpper` acronym set.

Fix: add an ID-drift gate that diffs generated IDs against the committed catalog
and fails unless removed IDs are covered by `aliases.json` or an explicit
acknowledgment; derive the ID prefix from `volumeId`; move `startMarkers` and
`alwaysUpper` into `volumes.json`; add `import-markdown.test.ts` with fixtures.

### ARCH-05 [low, medium] Audio playback hardwired to speechSynthesis, no provider seam
`src/components/AudioPlayerIsland.tsx:174` [verified]

The pipeline computes `audioVersionId` (`sectionId` + `contentHash`) end to end
precisely so pre-rendered TTS could be cache-keyed per revision, but the player
has no abstraction: `playIndex` constructs `SpeechSynthesisUtterance` directly,
voice prefs are speechSynthesis-specific, and listen-time accounting is
wall-clock inside the component. Adding a real TTS provider means rewriting the
island, and none of the queue state machine is unit-testable.

Fix: define an `AudioPlayback` interface (`load`, `play`, `pause`, `stop`,
`onEnded`, `onTick`), implement `SpeechSynthesisPlayback` as the first provider,
and move the queue-advance/token state machine out of the component. Keep
`audioVersionId` as the cache key in the contract.

---

## Accessibility and usability

### A11Y-01 [medium, medium] Keyboard focus indicator is nearly invisible
`src/app/globals.css:604` [verified]

Nearly every interactive element sets `outline: none` and styles
`:focus-visible` identically to `:hover` with a ~10-12% opacity bronze tint.
`.theme-choice:focus-visible` is identical to `[aria-pressed="true"]` and
`.font-select-option:focus-visible` identical to `[aria-selected="true"]`, so a
keyboard user cannot tell the focused option from the selected one. The bronze
values are tuned for parchment and are nearly invisible on the dark and black
themes. This fails WCAG 2.4.7 for keyboard users.

Fix: add a distinct theme-aware `:focus-visible` outline (for example `2px solid
var(--bronze-deep)` with offset) to the shared button and link rules, keeping the
tint for hover only.

### A11Y-02 [medium, small] `--ink-muted` fails WCAG AA contrast on light themes
`src/app/globals.css:9` [verified]

`--ink-muted` `#6d7a80` on parchment `#f4ead7` computes to about 3.7:1, and the
light theme pairing to about 4.4:1, both below the 4.5:1 AA threshold. It is used
for genuinely small text: the footer (0.82rem), version metadata (0.92rem),
outline duration labels (0.78rem), and card metadata (0.88rem).

Fix: darken `--ink-muted` for the textured and light themes to at least 4.5:1
(around `#5a666c` on parchment), or switch the small-text rules to `--ink-soft`
(passes at ~6.9:1).

### A11Y-03 [medium, small] Sync and sign-in status have no live-region semantics
`src/components/ToolbarProgressIsland.tsx:627` [verified]

`syncMessage` and `authMessage` render as plain `<p className="quiet-copy">` with
no live-region role. After a screen-reader user submits the magic-link form,
presses Sync now, or deletes data, nothing is announced. `ToolbarShareIsland`
gets this right with `role="status"`, so the codebase is inconsistent. The audio
player also conveys play/pause only by swapping a button's `aria-label`, which is
not reliably re-announced.

Fix: wrap `syncMessage` and `authMessage` in `role="status"` containers and add a
visually hidden live region in `AudioPlayerIsland` for playback transitions.

### A11Y-04 [medium, medium] Toolbar menus drop keyboard focus on Escape
`src/components/ToolbarProgressIsland.tsx:194` [verified]

Covered by DUP-01: five of six menus unmount the popover and drop focus to
`document.body` on Escape instead of returning it to the trigger. Called out
separately here because it is an independent WCAG failure that the DUP-01 hook
fixes as a side effect.

### A11Y-05 [medium, small] No `not-found`, `error`, or `global-error` boundaries
`src/app/manuscripts/[volumeId]/[...route]/page.tsx:222` [verified]

The catch-all route calls `notFound()` and `dynamicParams = false` makes any URL
outside the generated set 404, yet `src/app` has no `not-found.tsx`,
`error.tsx`, or `global-error.tsx`. On a public site built around deep links,
aliases, and renamed sections, dead links render Next's unstyled default 404 with
no path back to the overview, search, or index.

Fix: add `not-found.tsx` (links to home, overview, search; it renders inside the
root layout so the chrome is present), plus `error.tsx` and a minimal
`global-error.tsx`; add an e2e check for the custom 404.

### A11Y-06 [low, small] Toolbar buttons are dead controls without JavaScript
`src/components/SiteShell.tsx:48` [verified]

The primary nav is entirely client islands whose buttons server-render
(`aria-expanded`, `aria-controls` pointing at ids that never exist) but do
nothing without JS. Reader prose and prev/up/next links work without JS, which
honors the core promise, but a no-JS user tabs through six focusable buttons that
silently no-op, and breadcrumbs never appear. Presenting inert controls is worse
than hiding them.

Fix: hide the menu-only islands until hydration via a no-js/js class toggle, or
provide a `<noscript>` link to the manuscripts index.

### A11Y-07 [low, small] Font picker announces combobox roles but has no keyboard model
`src/components/ToolbarSettingsIsland.tsx:179` [verified]

The font button has `role="combobox"` `aria-haspopup="listbox"` and its options
`role="option"` in `role="listbox"`, but there is no arrow-key or
`aria-activedescendant` handling; options are only reachable by Tab, which
contradicts the model those roles announce. The theme button row is a plain
`div` with `aria-label`, which is not exposed without a role.

Fix: implement the select-only combobox keyboard pattern (arrows move an active
option, Enter selects, Escape closes), or drop the roles and expose a simple
disclosure of buttons; add `role="group"` to the theme div.

### A11Y-08 [low, small] Hover tooltips cannot be dismissed with Escape
`src/components/CleanTooltip.tsx:49` [verified]

`useCleanTooltip` opens on pointerenter/focus and closes only on
pointerleave/blur/pointerdown. With no Escape handling, hover content cannot be
dismissed without moving the pointer and can obscure the toolbar or breadcrumb
beneath it. WCAG 1.4.13 requires hover content to be dismissable.

Fix: while open, add a document keydown listener that closes on Escape.

### A11Y-09 [low, small] safe-area-inset CSS is inert because `viewportFit` is unset
`src/app/layout.tsx:15` [verified]

`globals.css` positions the mobile header and fixed popovers with
`env(safe-area-inset-*)`, but the Next viewport export omits
`viewportFit: "cover"`, so all `env()` values resolve to 0 and the safe-area
handling never engages. Since `appleWebApp.capable: true` is set, the site can
run as an iOS home-screen app where those insets matter.

Fix: add `viewportFit: "cover"` and verify the popover offset on a notched
device, or delete the `env()` math if edge-to-edge is not wanted.

### A11Y-10 [low, small] Mobile toolbar packs seven ~39px touch targets
`src/app/globals.css:2931` [verified]

At max-width 860px the toolbar buttons shrink to 2.45rem (39.2px) with 4.8px
gaps, placing up to seven adjacent icon-only controls below the 44pt / WCAG 2.5.5
target size. Mis-taps are likely on small phones, and each wrong tap opens a
full-width popover to dismiss.

Fix: keep the 39px visual size but restore a 44px hit area (padding with a
negative-margin icon, or an `::after` tap zone), or increase the gap.

### A11Y-11 [low, small] Read checkmark uses `aria-label` on a plain span
`src/components/ReadCheckmarkIsland.tsx:54` [verified]

The read indicator is `<span aria-label="Read" title="Read">` containing an
`aria-hidden` icon. `aria-label` on a generic span with no role is ignored by
most screen-reader/browser pairings, so the read state is silent for assistive
tech in chapter lists.

Fix: give the span `role="img"` with the label, or use a visually hidden
`<span className="sr-only">Read</span>`.

---

## Maintainability

### MAINT-01 [medium, small] Consent and sync mutations swallow errors and can throw from click handlers
`src/components/ToolbarProgressIsland.tsx:466` [verified]

`grantConsentAndSync` has no try/catch: if `loadRemoteReaderState` rejects, the
async `onClick` rejection is unhandled, local consent is already written granted,
and the UI shows no error. It ignores the `{ error }` from `upsertRemoteConsent`.
`revokeConsentAndPause` likewise ignores the error and unconditionally reports
"Sync paused", so the remote row can still say granted while the user believes
sync stopped. For a privacy flow this misreports state.

Fix: wrap in try/catch that sets `syncStatus: "error"`, check every
`upsertRemoteConsent` result; move consent transitions into the sync hook.

### MAINT-02 [medium, medium] `scripts/manuscripts/shared.ts` is a 716-line grab-bag
`scripts/manuscripts/shared.ts:1` [verified]

It mixes five layers: path constants, all pipeline types, generic fs/hash
utilities, Markdown/frontmatter parsing with a hand-rolled YAML scalar parser,
href builders, and the 160-line `buildCatalog`. Every pipeline script imports it
for different reasons, so unrelated changes collide, and its 82-line test cannot
meaningfully cover it. Ten exports have no consumers outside the file.

Fix: split into `paths.ts`, `types.ts`, `fs-utils.ts`, `markdown.ts`, and
`catalog.ts`; un-export or directly test the internal-only helpers.

### MAINT-03 [medium, small] Frontmatter parse failures do not name the file
`scripts/manuscripts/shared.ts:379` [verified]

`readMarkdownDocuments` calls `parseFrontmatter(readUtf8(filePath))`, but the
parser's errors carry no file path, so a compile over hundreds of files dies with
no pointer to the offender. `parseYamlScalar` is also fragile: single-quoted
values are converted with naive replaces and fed to `JSON.parse`, so any value
with a double quote or interior apostrophe throws an opaque `SyntaxError`.

Fix: wrap the `parseFrontmatter` call to rethrow with the file path, and harden
`parseYamlScalar` (unescape properly or use a tiny YAML lib) with tests.

### MAINT-04 [low, small] Dead export cluster in `src/lib`
`src/lib/manuscript-data.ts:298` [verified]

`sectionByRoute`, `aliasByRoute`, `sectionByRouteOrAlias`, `routeParams`, and
`excerpt` have zero consumers (the app uses `sectionByHrefOrAlias`).
`navigationSourcePayload` and `grantStoredConsent` have no callers, and
`ToolbarProgressIsland` re-implements the latter inline. `queueFromSection` is
used only by its own test while production uses `queueFromSections`; it is
exactly `queueFromSections([section])`, and the local `AudioSection` type is
field-for-field identical to `AudioQueueItem`. `AGENTS.md` requires every export
to have a consumer.

Fix: delete the dead exports and their tests; use `grantStoredConsent` in
`ToolbarProgressIsland` or remove it; delete the `AudioSection` alias.

### MAINT-05 [low, small] `reader-state.ts` mutators repeat the base-record envelope five times
`src/lib/reader-state.ts:108` [verified]

`markSectionOpened`, `recordScrollProgress`, `recordReadingTime`,
`recordAudioSeconds`, and `markRead` each rebuild the identical envelope (spread
sections, spread existing, re-assert id/contentHash/readAt/percent defaults)
before applying their specific fields. Five copies of default-preserving
boilerplate is where a future field silently gets dropped by one mutator.

Fix: add a private `upsertSection(progress, section, patch)` that owns the
envelope and defaults; rewrite the five mutators as thin patches.

### MAINT-06 [low, small] Product thresholds are inline magic numbers
`src/components/ToolbarProgressIsland.tsx:294` [verified]

The 80% read threshold, the 5000 ms sample interval, and the 1500 ms sync
debounce are inline in `ToolbarProgressIsland`; `SearchMenuIsland` inlines its
800 ms debounce, 12-result cap, and scoring weights. `idleThresholdMs` and
`scrollMilestones` are already named constants in the same file, so the
convention exists but is applied inconsistently.

Fix: hoist to named constants (`readThresholdPercent`, `timingSampleIntervalMs`,
`syncDebounceMs`, and a constants block in `SearchMenuIsland`).

---

## Testing, CI, and release engineering

### TEST-01 [medium, medium] No CI pipeline exists
`package.json:39` [verified]

There is no `.github/workflows` directory and no tracked CI config of any kind.
`vercel.json` runs only `npm run build`, never lint, unit tests,
`manuscripts:validate`, or Playwright. The full quality gate exists only as an
`AGENTS.md` convention a human must remember to run. A PR merged from a machine
that skipped the gate, or a web-UI merge, can ship a broken build, a stale
generated catalog, an RLS-affecting migration, or a compromised dependency bump
straight to `main` with no machine check. There is no scheduled `npm audit`.

Fix: add `.github/workflows/ci.yml` on `pull_request` and `push` to `main`
running `npm run validate`, `npx playwright install --with-deps chromium && npm
run test:e2e`, and a drift check (`git diff --exit-code src/generated public/data
content/manuscripts` after compile). Cache node_modules and browsers on the
lockfile. Add a dependency audit or Dependabot. Make it a required check and
harden `playwright.config.ts` for CI.

### TEST-02 [medium, medium] Sync, the delete route, and every island have zero unit tests
`src/components/ToolbarProgressIsland.tsx:176` [verified]

The entire sync state machine lives in `ToolbarProgressIsland` (merge, upload,
delete) with no tests. `reader-sync.ts` has none: the row mapping, the
`uploadedIds` contract `markEventsSynced` depends on, the delete error coalescing,
and the JSON round-trip are all unverified. The security-sensitive DELETE
`/api/account` route is untested, including its 401 and 503 branches. The e2e
suite never exercises sync. Only the pure `mergeProgressStates` has one test. A
regression in merge/upload ordering or the delete route would silently destroy
reading history or accounts.

Fix: extract the sync orchestration into a plain module taking an injected
client and unit-test first-sign-in merge, remote-newer vs local-newer, upload
failure, and delete; add `reader-sync.test.ts` with a mock client; add a test for
the DELETE handler covering 503, 401, 500, and success.

### TEST-03 [medium, medium] The e2e suite is one 1772-line spec of multi-concern tests
`tests/e2e/reader.spec.ts:409` [verified]

All 16 tests live in one file spanning home, overview, breadcrumbs, share,
settings, audio, sync, and navigation. Playwright parallelizes per file, so
unrelated features serialize, failures are hard to locate, and the fast loop
cannot target a feature without `--grep`. The test at line 409 runs to line 851
and asserts outline filtering, search keyboard nav, result CSS layout, and the
progress popover, so one early failure masks everything after it. Dozens of
assertions pin computed styles (font sizes, weights, box-shadows) rather than
behavior, so any design change requires editing hundreds of lines. Two hover
checks use `waitForTimeout(200)`, which races the CSS transition and flakes.

Fix: split into per-surface spec files with one concern per test and shared
helpers; replace `waitForTimeout` with `toHaveCSS` polling or `expect.poll`;
reduce computed-style pinning to a small set of contractual tokens.

### TEST-04 [medium, small] Tests are coupled to live manuscript prose
`tests/e2e/reader.spec.ts:21` [verified]

The spec builds ~25 fixtures at module scope with non-null assertions on content
searches (a title including "Federated Footprint", hardcoded hrefs). A manuscript
edit renaming any of these fails every test in the file at collection time with
`Cannot read properties of undefined`, not a readable assertion.
`shared.test.ts` asserts `volumeCount === 9` and that the first section's
`versionUrl` matches a GitHub PR URL, even though `validate.ts` deliberately
accepts commit URLs. Since manuscript edits are the primary workflow, this is a
recurring tax.

Fix: move content-derived fixtures into `beforeAll`/test bodies with explicit
`toBeDefined`; assert structural invariants against the series config instead of
hardcoded counts; accept both PR and commit URL shapes.

### TEST-05 [medium, medium] Type-safety gates are weaker than the codebase warrants
`tsconfig.json:7` [verified]

Only `strict` is enabled; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
and `verbatimModuleSyntax` are absent. ESLint applies only the Next presets
(non-type-checked) with zero project rules. The code is dominated by array and
record indexing over the generated catalog (`catalog.sections[0].versionDate`
unguarded in tests, non-null assertions in app code). A pipeline change producing
an empty list becomes a runtime `TypeError` instead of a compile error.

Fix: enable `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (both already
mostly satisfied), add `typescript-eslint` strict-type-checked for `src/` and
`scripts/`, and fix the fallout.

### TEST-06 [medium, small] The stale-artifact check is neutralized by validate ordering
`scripts/manuscripts/validate.ts:174` [verified]

`validate.ts` stale-checks only `catalog.json` and `search-index.json` against a
fresh build, but `npm run validate` runs `manuscripts:compile` first, which
rewrites both, so the assertion can never fail inside the gate it protects. The
other committed artifacts (`reader-sections.json`, `breadcrumb-routes.json`,
`pdf-downloads.json`) have no stale check. Committed data can drift from sources
with a green validate, and the test suites import the committed catalog while the
deployed build recompiles.

Fix: after compile in the gate (or CI), fail on `git diff --exit-code
src/generated public/data`; or run `manuscripts:validate` before compile and
extend the comparison to all payloads.

### TEST-07 [medium, small] Playwright config lacks CI hardening and hides the build in a 120s timeout
`playwright.config.ts:16` [verified]

In full mode the `webServer` command is `npm run build && npm run
preview:production` with `timeout: 120000`. The build includes compilation, full
PDF regeneration, and `next build`; when it exceeds two minutes the suite fails
with an opaque webServer timeout instead of the build log. There is no
`forbidOnly: !!process.env.CI` (a stray `test.only` would pass a future CI while
skipping everything), no CI retries, and `list`-only reporter. Fast mode's dev
server never runs `manuscripts:compile`, so on a fresh worktree the PDF download
test fails because `public/downloads` is gitignored and absent.

Fix: run the build as an explicit step (or raise the timeout to 10 minutes); add
`forbidOnly`, CI retries, and an HTML reporter; ensure `public/downloads` exists
before `test:e2e:fast`.

### TEST-08 [medium, small] No Node version pinning
`package.json:2` [verified]

No `engines` field, no `.nvmrc`, no engine-strict. The lockfile confirms
`next@16.2.9` needs Node >= 20.9, but the machine default here is Node 14.17.
`ensure-node-modules.mjs` records `nodeMajor` but enforces no minimum, so running
any script under old Node attempts `npm ci` with npm 6, which cannot read
lockfile v3, producing a confusing error rather than a clear wrong-Node failure.

Fix: add `"engines": { "node": ">=20.9" }` and a `.nvmrc`; have
`ensure-node-modules.mjs` fail fast with a clear message under Node < 20;
reference the pin in the CI `setup-node` step.

### TEST-09 [low, small] `ensure-node-modules` over-triggers `npm ci` and has a Windows spawn hazard
`scripts/ensure-node-modules.mjs:53` [verified]

Freshness is keyed on a custom state file hashing `package-lock.json`. After a
routine `npm install <pkg>` (which already produced a correct `node_modules` and
lockfile), the hash mismatches, so the next `npm run <anything>` deletes
`node_modules` and reruns full `npm ci`, doubling install time and wiping
npm-linked packages mid-debug. Separately, `spawnSync` of `npm.cmd` without
`shell: true` fails with EINVAL on patched Node >= 18.20/20.12 on Windows, so the
bootstrap that fronts every script breaks for Windows contributors.

Fix: use npm's own `node_modules/.package-lock.json` compared to the root
lockfile as the signal, writing the custom state only after `npm ci`; accept a
matching hidden lockfile as current after plain `npm install`. For Windows, spawn
`process.execPath` with `npm-cli.js`, or pass `shell: true` for `.cmd`.

### TEST-10 [low, small] No coverage tooling configured
`vitest.config.ts:10` [verified]

No coverage block and no `@vitest/coverage-v8` devDependency, even though
`.gitignore` already anticipates a `/coverage` directory. With every island,
`reader-sync.ts`, `reader-progress-store.ts`, `reader-data.ts`, and the API route
at zero coverage, nothing measures the gaps, so they will not shrink; validate
reports green while roughly half of `src/` is untested.

Fix: add `@vitest/coverage-v8`, a `test:coverage` script, and a config scoped to
`src/` with text and lcov reporters; publish the summary in CI and consider a
modest threshold on `src/lib`.

---

## SEO, metadata, and docs

The remaining completeness-critic gaps. These were not run through the adversarial
verifier but were read during the critic pass; treat severities as provisional
until confirmed during implementation.

### DOC-01 [low, small] Sitemap advertises non-canonical alias duplicate pages
`src/app/sitemap.ts:49` [critic]

The sitemap emits an entry for every catalog alias `sourceHref` (95 URLs, mostly
generated legacy routes). Those routes render as full duplicate copies of the
target section whose canonical points elsewhere, so the sitemap advertises
non-canonical duplicates and inflates crawl budget by ~9%.

Fix: drop the aliases block from the sitemap; optionally serve aliases as
permanent redirects to the target instead of 200 duplicates, which also satisfies
the link-preservation rule more cleanly.

### DOC-02 [low, small] The README status block bakes in volatile local git state
`scripts/update-readme-status.ts:38` [critic]

`buildStatus` writes the branch name, short revision, and working-tree dirtiness
into the committed README. The committed README currently claims a branch and
"local changes present" that no longer match the repo, and after every squash
merge the block is stale until someone reruns `readme:update` (nothing in
validate or CI checks it).

Fix: drop the branch/working-tree/timestamp lines (keep the stable manuscript
stats, which validate could assert against the catalog), or regenerate the block
in an automated post-merge step.

### DOC-03 [low, small] License grant contradicts the README and footer
`README.md:174`, `src/components/SiteShell.tsx:63` [critic]

The README and footer state the manuscripts, copy, and artwork are CC BY-SA 4.0,
but the repo ships only the Apache-2.0 LICENSE (with the appendix notice left as
the unfilled template) and `package.json` declares `"license": "Apache-2.0"` for
the whole package. There is no `LICENSE-content` or NOTICE mapping which paths
fall under which license, so the only machine-readable grant contradicts the
README.

Fix: add the CC BY-SA 4.0 text (or a `LICENSE-content` pointer) plus a scope
statement, and consider SPDX clarification in `package.json`.

### DOC-04 [low, small] Homepage hardcodes per-volume tags outside the series pipeline
`src/app/page.tsx:7` [critic]

The homepage hardcodes a `manuscriptTags` record keyed by `volumeId`, even though
all other per-volume metadata lives in `volumes.json` and flows through the
catalog. Adding or renaming a volume silently drops its tags to the planet-name
fallback with no validation, and tag edits require touching app code.

Fix: move tags into `volumes.json`/`VolumeConfig`, carry them through
`buildCatalog`, and delete the inline record.

### DOC-05 [low, small] Overview audio engagement id changes on every commit
`src/components/SiteShell.tsx:37` [critic]

The overview audio item is keyed `audioVersionId: \`overview-${gitRevision}\``.
Every section's `audioVersionId` is `sectionId + contentHash` so it changes only
when text changes, but `gitRevision` changes on every commit (and is
`"uncommitted"` in dev), so overview audio engagement events can never be grouped
across deploys even when the text is identical.

Fix: derive the overview audio id from a hash of the overview text, matching the
section convention.

### DOC-06 [low, small] Tailwind is imported but no utility classes are used
`src/app/globals.css:1` [critic]

`globals.css` imports Tailwind and defines an `@theme inline` block, and
`tailwindcss` plus `@tailwindcss/postcss` are devDependencies, but a scan of
every className in `src/**/*.tsx` shows zero Tailwind utilities; the design system
is the 64.5 KB hand-written stylesheet with a custom reset on top of Tailwind
preflight. The import ships unused preflight/theme layers, adds a PostCSS scan to
every build, and advertises a stack the code does not use.

Fix: either delete the Tailwind import, the two packages, and `postcss.config.mjs`
and keep one reset, or actually adopt utilities; consider splitting the monolithic
`globals.css` by surface while touching it.

### DOC-07 [low, small] Stale static-export remnants
`package.json:59` [verified]

`serve@^14` is in devDependencies but nothing references it (Playwright serves
via `next start`, no script calls it). `AGENTS.md` still says `validate` "builds
the static export" and the repo ignores `out/`, but the app now has middleware
and route handlers incompatible with `output: "export"`, and `next.config.ts`
sets no output mode. Contributors following `AGENTS.md` reason about the wrong
deployment model.

Fix: remove `serve` and refresh the lockfile; update `AGENTS.md` and the `out/`
ignores to describe the current Vercel/Node deployment with static prerendering.

### DOC-08 [low, small] Footer copyright year frozen at build time
`src/components/SiteShell.tsx:18` [verified]

`copyrightYearLabel()` calls `new Date().getFullYear()` in a server component
prerendered once at build, so every page serves the year captured during the last
deploy until someone rebuilds.

Fix: accept and document the build-time snapshot, or compute the year in a tiny
client island with `suppressHydrationWarning`.
