# Review Methodology

How the review that produced [findings-register.md](findings-register.md) was
run, so the results can be trusted, reproduced, and extended.

## Shape of the review

The review ran as a multi-agent workflow with four phases: parallel discovery
across eight dimensions, cross-dimension deduplication, adversarial verification
of every candidate finding, and a completeness critic pass to catch what the
first three missed. Findings that survived verification are in the register;
findings that were refuted were dropped.

The design goal was to avoid the two failure modes of a single-pass review:
missing whole categories (addressed by fixed dimensions plus a critic) and
reporting plausible-but-wrong issues (addressed by an adversarial verifier that
was told to refute each claim before accepting it).

## Phase 1: Discovery across eight dimensions

Eight reviewers ran in parallel, each scoped to one dimension and pointed at the
specific files and trust boundaries relevant to it:

1. **Security** — auth callback, account API, middleware and Supabase clients,
   the RLS migration, sync data flow, security headers, and script file handling.
2. **Duplication and reuse** — all 17 islands and `src/lib`, plus the pipeline
   scripts, looking for repeated storage, menu, loader, and parsing logic.
3. **Performance** — payload sizes (measured on disk), eager fetches, scroll and
   keystroke handlers, RSC payload weight, images, and the PDF pipeline.
4. **Maintainability** — the largest files first, error handling, type-safety
   escapes, magic numbers, dead exports, and test-coverage gaps.
5. **Framework and tooling best practices** — Next 16 / React 19 / TS 5 idioms,
   config files, App Router patterns, and the missing CI.
6. **Usability and accessibility** — focus management, ARIA, contrast, the no-JS
   story, touch targets, and the theme-flash path.
7. **Architecture and extensibility** — the compile pipeline, the client state
   model, island coordination, the route contract, and the sync and audio seams.
8. **Testing, CI, and release engineering** — the test inventory, CI presence,
   the bootstrap script, deploy config, and artifact drift.

Every reviewer was instructed to ground each finding in code it actually read,
cite a file and line, and calibrate severity honestly. This produced 91 raw
findings.

## Phase 2: Deduplication

A merge step combined the 91 raw findings into 65 unique ones, unioning the
dimensions of overlapping entries (for example, the multiple-writer bug surfaced
under both performance and architecture), keeping the highest severity and the
most specific location, without dropping distinct issues or softening severities.

## Phase 3: Adversarial verification

Each of the 65 merged findings was handed to a verifier told to refute it: read
the exact code cited plus its callers and config, and default to "not real" if
the evidence did not hold up. High and medium findings were checked through three
lenses in parallel (is the claim factually true, does the failure actually
materialize for this app, is the recommended fix correct and proportionate); low
findings got a single refutation pass. A finding was kept only if a majority of
its verifiers confirmed it, and its severity was recalibrated to the verifiers'
consensus.

All 65 survived, though several severities were adjusted down during this pass.
The clearest example is the open-redirect finding (SEC-06): the verifier
confirmed the code flaw but demonstrated that PKCE currently blocks the exploit,
so it was downgraded from high to low with the reasoning recorded in the register.

## Phase 4: Completeness critic

A final agent was given the confirmed findings and asked what the review missed,
spending its time on files with zero findings: the app pages themselves, the PDF
script, sitemap and robots, licensing, and README accuracy. It surfaced nine
gaps. These did not go through the adversarial verifier, so they carry a lighter
evidence bar.

During this write-up, the three highest-impact critic gaps were reproduced by
hand and promoted into the register at high or medium severity:

- **BUG-04** (Markdown lists render as run-on text): confirmed by finding 17
  canonical sections containing `- ` list blocks and confirming `MarkdownBody`
  has no list branch.
- **BUG-05** (canonical URLs deindex ~460 pages): confirmed by reading the root
  layout's `alternates.canonical: "/"` and confirming the volume and overview
  `generateMetadata` functions do not override it.
- **BUG-06** (PDF fonts fall back in production): confirmed by reading the
  hardcoded font-path probing and confirming the corpus contains non-WinAnsi
  characters that core-font encoding maps to `.notdef`.

The remaining six critic gaps (DOC-01 through DOC-06) are in the register marked
`[critic]` with provisional severities.

## What the review did not do

- It did not run a dependency CVE scan. The security review covered architecture
  (service-key handling, client-bundle exposure), not version-level advisories.
  A `npm audit` step is itself a finding (TEST-01).
- It did not execute the app or measure runtime performance in a browser. Payload
  sizes were measured on disk; the scroll and keystroke costs were reasoned from
  the code, not profiled. Confirming them with a real profile is worthwhile
  before the performance phase.
- It did not review manuscript prose, only the pipeline that processes it.

## Verification status in the register

- **[verified]** — survived the adversarial refutation pass.
- **[critic, reproduced]** — from the critic pass, re-checked by hand for this
  write-up (BUG-04, BUG-05, BUG-06).
- **[critic]** — from the critic pass, provisional severity, confirm during
  implementation.

## Reproducing or extending this

The review was a scripted workflow over the repository at a single commit. To
re-run it after changes, or to add a dimension, the pattern is: fan out
dimension reviewers with explicit file targets and a strict "cite file and line"
instruction, deduplicate, then run an adversarial verifier that is told to refute
rather than confirm. The adversarial step is what separates a finding a
maintainer can act on from a plausible guess.
