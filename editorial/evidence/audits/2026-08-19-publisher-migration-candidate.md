# GENII Publisher Migration Candidate Decision Record

Date: 2026-08-19

Status: Local migration candidate evidence. This record does not approve a push,
merge, deployment, package publication, database mutation, credential change, or
production change.

## Candidate identity

The candidate binds these exact repository commits:

- Coherence Thesis baseline: `d250a760b51a071037af0c18ac73cc3131312f09`
- GENII Publisher source: `15a5fc8967412b0c45a7f129e6f03f7cf7388197`
- Publisher repository: `https://github.com/genii-foundation/publisher`

The Publisher commit was checked out on
`feat/reader-parity-refresh` when the archives were verified. A different
Publisher commit requires new archives, new digests, a regenerated lockfile, and
a new review. The archives are local candidate inputs. They have not been
published to a package registry.

## Vendored archive provenance

The five archives live under
`vendor/genii-publisher/15a5fc8967412b0c45a7f129e6f03f7cf7388197/`.
`candidate.json` binds them to Publisher commit
`15a5fc8967412b0c45a7f129e6f03f7cf7388197`, Node.js 22.12.0, and npm
10.9.0. Every archive reports version `0.1.0-alpha.0`, license `CPAL-1.0`,
and a Node.js engine that includes 22.12.0.

| Package | Archive | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `@genii-foundation/publisher-schema` | `genii-foundation-publisher-schema-0.1.0-alpha.0.tgz` | 1,007,811 | `bf227acc0b33b3fe15673f4bacb9f957eb9351248c259455b92f13366ecdab02` |
| `@genii-foundation/publisher-content` | `genii-foundation-publisher-content-0.1.0-alpha.0.tgz` | 970,833 | `b16794d767a09a0c110da03ada7e83f0ff7ce1d5ebf520e68fe329c8034b30e7` |
| `@genii-foundation/publisher-reader` | `genii-foundation-publisher-reader-0.1.0-alpha.0.tgz` | 364,675 | `533ff21afee6c3d2ae0a689be22508df17ec2bbd391aaa1ab436fc6ff700daf6` |
| `@genii-foundation/publisher` | `genii-foundation-publisher-0.1.0-alpha.0.tgz` | 183,853 | `4f45fd2faacbe928cbeee2d63dc95cc2d0592730f996d662185389b5ce3e878f` |
| `@genii-foundation/publisher-next` | `genii-foundation-publisher-next-0.1.0-alpha.0.tgz` | 240,587 | `2b015cec1215471eeedb8b110fd2323afa01249ad3f22c2d04b94fcd685cab12` |

## Dependency decision

The local candidate uses one exact framework and toolchain graph:

- Node.js `22.12.0`
- npm `10.9.0`
- Next.js `16.3.1`
- React `19.2.8`
- React DOM `19.2.8`
- TypeScript `5.9.3`
- ESLint config for Next.js `16.3.1`
- TypeScript ESLint `8.55.0`
- Playwright `1.61.1`
- Sharp `0.35.3`

The supporting type packages are pinned to `@types/node` 22.20.1,
`@types/react` 19.2.17, and `@types/react-dom` 19.2.3. The package lock has one
copy of the exact Next.js, React, React DOM, TypeScript, TypeScript ESLint,
Playwright, and Sharp versions selected above. The CI browser image is pinned to
the matching Playwright 1.61.1 release.

Playwright 1.61.1 is retained deliberately. The 1.62.1 candidate blocked network
requests correctly but reported `navigator.onLine` as true when Chromium
reloaded a page into an already offline context. That broke both desktop and
mobile cold offline Reader acceptance. The behavior matches the open upstream
issue at `https://github.com/microsoft/playwright/issues/42174`. The migration
does not need a browser runner upgrade, and it must not weaken the cold offline
proof to accommodate one.

Sharp remains a direct dependency because the manuscript PDF tooling imports it.
The root dependency and the Next.js override both select 0.35.3, leaving one
locked copy. An exact npm 10.9.0 audit of the candidate lock on 2026-08-19
reported zero vulnerabilities at every severity: zero info, low, moderate, high,
and critical findings, with zero total findings across 744 dependencies.

## Temporary TypeScript exception

Publisher names TypeScript 7.0.2 as its reference compiler, but selecting it in
this Coherence candidate would make the installed lint graph dishonest. As of
2026-08-19, TypeScript ESLint 8.67.0 declares support for TypeScript versions
from 4.8.4 up to, but not including, 6.1.0. It therefore rejects TypeScript
7.0.2. Its visitor key dependency also resolves to `eslint-visitor-keys` 5.0.1,
which requires Node.js 22.13.0 or a later supported line and excludes the exact
Node.js 22.12.0 reference runtime.

TypeScript ESLint 8.55.0 is the latest compatible boundary before that visitor
key engine change. It supports TypeScript 5.9.3, ESLint 9, and Node.js 22.12.0.
The candidate therefore pins TypeScript 5.9.3 and TypeScript ESLint 8.55.0 in
both direct development dependencies and the consuming root override. The
existing ESLint configuration remains unchanged and continues to apply both the
Next.js core web vitals rules and the TypeScript rules. No peer warning, engine
warning, forced install, or lint coverage reduction is accepted.

This exception is temporary. It may be removed only when the complete Publisher
and Coherence lint graph declares support for the selected TypeScript version on
the exact reference Node.js runtime, or when a separately authorized toolchain
decision changes that runtime. A green compiler run cannot overrule incompatible
peer metadata. The dependency graph does not become honest through positive
thinking, although package managers have made a respectable business of the
attempt.

## Supabase boundary

`@genii-foundation/publisher-sync-supabase` is not vendored, installed, or locked
in this candidate. It remains a private Publisher package at version `0.0.0` and
is not one of the five reviewed archives. This candidate applies no Publisher
Supabase migration, reinterprets no existing row, changes no credential, and
mutates no database.

Any later preview integration must keep the current Coherence Supabase behavior
behind a Coherence-owned implementation of the Publisher provider interface.
Adopting the reference Publisher Supabase package requires a separate packed
candidate, schema compatibility report, migration dry run, existing row plan,
and explicit database authority.

## Trailing slash deferral

The current Coherence Next.js configuration retains `trailingSlash: true`.
Publisher reserves slash spelling per declared route and rejects a host-wide
`trailingSlash` setting. This dependency candidate does not resolve that policy
difference and does not change the existing Coherence setting.

Removing or replacing the setting is deferred until a complete route census
records current paths, redirects, query behavior, fragments, canonical volume
segments, generated section routes, and historical aliases. The exact candidate
must then prove those behaviors in the local preview before a host integration
can be approved. The deferral is a migration gate, not permission to guess at
route continuity.

## Phase 4 manifest and route evidence

The local migration worktree now contains a deterministic Publisher manifest
projection for all nine works and all 525 current sections. The projection is
derived from canonical manuscript bytes, the prepared manuscript catalog, the
section lineage, and the reviewed historical section mappings. It protects
`editorial`, `publisher`, and `publishing` as source roots. Every authority path
must remain inside the repository and may not cross a symbolic path segment.

The exact validated Reader identity is
`sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3`.
It contains 9 works, 525 sections, 3,485 blocks, 206,196 words, 535 active
routes, 535 static parameters, a trailing slash policy, and no redirects. The
four ignored Reader artifacts are written as one text transaction. A partial
write restores every prior artifact text, and output paths may not overlap a
protected root or cross a symbolic path segment.

The application assembly proof has build identity
`sha256:32c4b31d2e8a2cb15bec9f1ff5ecd9eb31a33cd25fea5dc243b266c5944ff44a`.
It renders one Publisher shell for home, work, and section pages with the
Reader state bootstrap before preference prepaint. It deliberately uses the
default Publisher theme and declares no Updates, narration, extension, or sync
integration. This proves application assembly only. It does not prove a host
cutover or content parity.

The isolated theme compiler proof builds the official Publisher Next host
contract 0.17.0 with Next 16.3.1, React 19.2.8, and all four public Publisher
packages at `0.1.0-alpha.0`. It selects the Coherence theme through the real
host alias, starts the built server, fetches the proof and home routes, binds
all 17 rendered theme properties to the exact Reader home root, and validates
five compiled font families across 48 delivered WOFF2 assets. Literata remains
the default among six Reader font choices. The exact application build is
`sha256:787b774208ab53709d50b8dea8ebf1396c10a56374d36afcd0199cd535915b67`.
The theme tokens have SHA-256
`a241690a22206464d9948bce0c6d3dd9de3cdfe0cb4f25a96e3fa953384a0845`,
the delivered CSS has SHA-256
`2e29e06f5ef7fed1b8a9018d771735de9fc06f2324d0fc4ca9e5628101ead9f4`,
and the font evidence has SHA-256
`ddf9acfd3b802c916707d32b5bc3ad99e1c6ee3b69130bc8eff955fae4694233`.
Two complete runs produced the same public evidence and removed their unique
ignored hosts. This proves compiler and runtime theme integration only. It does
not deploy the theme, change a current public route, or prove browser
visibility. Exact clean `npm ci` state plus the validated candidate archives and
lockfile are the installed-code trust root. The required local browser preview
remains the visibility and interaction gate.

The content fidelity census binds all 3,485 Reader blocks to exact canonical
source spans. The Coherence catalog contains 201,885 words while the Publisher
projection contains 206,196 words, a reviewed delta of 4,311. The projection
places 166 blocks and 1,125 words before the first declared catalog source
range. The visible catalog body boundary accounts for 174 blocks and 1,155
words. Fourteen canonical Markdown links survive. Twenty-one approved semantic
links exist only in the enriched catalog and remain absent from the Publisher
projection. The complete body projection has SHA-256
`dabc947bb7efd69d923d1865685bdd471b20404b948f978d816efdd9b5c7da0d`,
and the complete reviewed fidelity report has SHA-256
`7dd83c1e619b14fac9b34f16b8730042f63a3ab90335376af2aa843d08ccf5ab`.
These are recorded gaps, not parity.

The deterministic route ownership artifact is 5,891,644 bytes with SHA-256
`b855d53fe306253fb0a241ba5f989838036fb3ddd99f16a7a5f429342910dd39`.
Its canonical report has SHA-256
`e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0`.
It binds 535 active Publisher paths to 6,390 durable Coherence pathnames and
retains 7,247 reviewed open issues. The issue census is 63 aggregate chapter
paths, 45 aggregate part paths, 3 owner collisions, 988 fragment gaps, 156
unowned route aliases, 136 unowned section aliases, and 5,856 unclassified
durable paths. The exact collisions are `/api/account`, `/auth/callback`, and
`/offline-sw.js`. The report identity includes exact byte digests for the
route ledger, route aliases, and section aliases. It also includes the canonical
SHA-256 digest
`bb6a17d06120c3dfbd3a80b291d79a5804f9ace65039071f3230a00a4139ae10`
of the exact adapted catalog route projection. Volatile catalog metadata such
as `gitRevision` cannot change that identity, while route projection drift,
continuity target drift, and same-count issue substitution all fail. No route,
fragment, alias, or owner gap is silently accepted.

No public application route, root layout, Next.js configuration, Proxy,
deployed theme, deployment, or preview has been wired in this phase. Local
preview approval is still required before any candidate push.

## Required security review

Publisher commit `15a5fc8967412b0c45a7f129e6f03f7cf7388197` contains the known
server-side Reader state projection serialization hardening. That local fix is
part of the candidate and is not deferred.

Before this migration can be described as ready to merge, the server-side
projection injection review must be rerun from the account enrolled in Trusted
Access against the exact Publisher candidate. The findings must be retained. Any
required fix invalidates these archives and requires a new Publisher commit, five
new archive digests, a regenerated lockfile, and renewed validation. Trusted
Access is a required pre-merge audit gate. It is not a waiver for a known local
security defect.

## Authority and stop conditions

This record authorizes local evidence and validation only. It grants no authority
to push either repository, update or open a pull request, merge a branch, publish
packages, deploy a preview or production build, create another Vercel project,
change a production alias, apply a database migration, mutate database rows,
change credentials, or alter production state.

The candidate must stop and be reviewed again if any bound commit, archive byte,
dependency pin, lock resolution, route policy, Supabase boundary, or security gate
changes. A later push, merge, deployment, publication, database action, or
credential action requires fresh explicit authority.
