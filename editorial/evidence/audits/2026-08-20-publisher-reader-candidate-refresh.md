# GENII Publisher Reader Candidate Refresh

Date: 2026-08-20

Status: Local migration candidate evidence. This record does not approve a push,
merge, deployment, package publication, database mutation, credential change, or
production change.

## Active candidate

The active GENII Publisher source commit is
`4e4960628165ea5fa13077c430e908865ff96c7c`. The five local archives under its
full commit directory are bound by `candidate.json` to Node.js 22.12.0 and npm
10.9.0. The exact candidate validator accepts all five archives and the current
manifest and lockfile references.

This candidate replaces
`060a7b7b816c90ce3698391929386442453dec14`. An exact byte comparison proves
that four archives did not change:

- Publisher Content remains 970,833 bytes with SHA-256
  `b16794d767a09a0c110da03ada7e83f0ff7ce1d5ebf520e68fe329c8034b30e7`.
- Publisher Reader remains 364,497 bytes with SHA-256
  `b24eb5807ec7c7e2a5be2ead8833aec12f7e92f65cfec29f89b37828ee0633f4`.
- Publisher core remains 183,853 bytes with SHA-256
  `4f45fd2faacbe928cbeee2d63dc95cc2d0592730f996d662185389b5ce3e878f`.
- Publisher Next remains 240,587 bytes with SHA-256
  `2b015cec1215471eeedb8b110fd2323afa01249ad3f22c2d04b94fcd685cab12`.

Only the Publisher Schema archive changed. Its prior 1,007,811 byte archive had
SHA-256
`bf227acc0b33b3fe15673f4bacb9f957eb9351248c259455b92f13366ecdab02`.
The active 1,007,982 byte archive has SHA-256
`2b3fc07554e5c2c33ac196145c57441face45c290e774e2750abcf7971d3d635`.
The exact payload difference is confined to `CHANGES.md`, `src/types.ts`, and
generated `dist/types.d.ts`. Runtime JavaScript and every schema JSON file are
byte identical. The corrected public `AudioEnvelopeVoice` declaration now
exposes envelope `clips` directly, while `AudioCatalogVoice` continues to expose
catalog `sections`. Publisher validation passed 1,080 tests with two expected
skips, and exact commit CI passed all seven Node, loader portability, and browser
hydration jobs. This is a declaration correction, not a runtime or serialized
protocol change.

## Link behavior

The prior Coherence content proof identified 21 approved semantic link
occurrences. Thirteen were already representable by the Reader. Eight were
rejected by the generic `reader.markdown.link_formatting_partial` precheck when
their exact selections fell inside emphasis or strong formatting. The later
Reader logic already reparsed the emitted Markdown and required exact normalized
syntax tree equality after accounting only for the requested link wrappers.

Publisher commit `060a7b7b816c90ce3698391929386442453dec14` removes that redundant
precheck. It retains the exact reparse and syntax tree equality guard together
with the existing protections for cross-node selections, existing links,
autolinks, code, images, HTML, overlapping links, Unicode ranges, URLs, escapes,
and entities. The Publisher repository's complete local validation passed 1,080
tests with two expected skips and no failures for the exact commit.

At source checkpoint `62dac1f62a62d6d080940b8c46833e72803afec7`, the
earlier Coherence content adapter applied the complete 21-link set. Every link
succeeded individually and in its Reader-order block group across 17 blocks.
The linkful Content and Reader artifacts retained all 21 links, and the real
Publisher Next application assembled and exposed them on the source work page.
The proof server-rendered all 21 anchors inside their 17 exact source blocks.
That historical closed evidence hash is
`sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4`.
Its linked Reader build is
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`,
and its application build is
`sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8`.
That receipt closed the semantic-link renderer blocker inside the isolated
adapter. It did not establish host wiring, route parity, fragment parity, or
deployment readiness.

In that historical receipt, the four semantic target routes reduced absent raw
catalog base paths from 46 to 44, left 141 catalog references on those paths,
and bound exact anchored Reader locations for two same-owner sections. The exact
fragment gap was 151, down from the 153 baseline.

The current content adapter checkpoint is
`b75c07c36945f73fdbb7feaaa0603dfc06d39a3d`. It derives 46 chapter root
owner groups across seven works and 107 direct children from raw catalog order.
It retains the four semantic routes, adds the 44 still-needed catalog root
routes, and assigns exact anchored Reader locations to all 46 owners without
assigning a child location. It assembles 583 active routes and route plan
parameters plus 582 application parameters. Absent catalog base paths and
references are both zero. Exactly 107 nested catalog fragment hrefs remain
unassigned because their child DOM IDs are not rendered on the owner pages. Its
content evidence is
`sha256:0c1f2d3bf289a98a2e7363fae0e58a5d0e3257d412ad17519da40cf222e02acf`,
its Content build is
`sha256:f999fc8800202b361c493a928ae12ebac34b6ca979af5b9a802232eb7a8fed0c`,
its Reader build is
`sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d`,
and its application build is
`sha256:550ab8706333f4b54e90f3dec7ad6f043ec0cc2b683b7907edc723f24bf3bf3b`.
The evidence records `baseRoutePresence=true`,
`aggregateChapterPageParity=false`, `nestedFragmentParity=false`,
`durableFragmentParity=false`, and `fullReaderRouteParity=false`.

## Isolated audio constructor evidence

The strict audio adapter is synthetic constructor evidence only. The root
`publication.json` contains no audio declaration and remains unchanged. The
proof does not materialize its logical
`generated/publisher/audio-catalog.json` path. It performs no network access or
durable writes.

The source audio manifest is 261,544 bytes with exact text SHA-256
`8c502dab9c44d8a10c02ff2fd6ea3a9f72e914bafd6c35dbff4e615c928e5c59`.
Its sole Publisher schema incompatibility is the existing
`voices[0].renderedWordCount` field. That field is 203,868, exactly the sum of
the current checkpoint timing words. The repository text counter reports
203,892 words over the same 525 `textForAudio` inputs, so the evidence records
the 24 word counter difference rather than treating the two counters as
interchangeable.

All 525 current clips bind to the current raw catalog audio version and exactly
one of 573 historical units across 18 Coherence checkpoints. Current provenance
is 479 clips from `2026-08-01-nine-volume-revision-v1`, 23 from
`2026-08-18-pr206-editorial-v1`, and 23 from
`2026-08-18-pr207-publication-cleanup-v1`. The complete validated checkpoint
authority, including all root provenance and all 573 historical units, has
SHA-256 `bba6019049a7d34766b31d73ea2ae8879e3bce79c06da1b2bd5f8820756718f4`.
The separate current 525 match evidence SHA-256 is
`7e80cd202ee6333a1eb745f153627d819b15361a119b091f70ecefebefab04ec`.
These are Coherence checkpoint records, not Publisher AudioCheckpoint records.
They lack Publisher Reader build and historical spoken-text authority.

A separate non-gating local reconstruction audit found exact historical source
bindings for 113 of the 122 safe units. Nine Volume I units refer to source
commit `27a4fe04324f047c45b30eb17766a226e45e0fd1`, which is unavailable in the
current local object database. Their section IDs are
`v01-civilization-as-a-living-process`,
`v01-consciousness-and-participation`,
`v01-intelligence-as-an-emergent-property`,
`v01-reverence-through-observation`, `v01-the-flower`,
`v01-the-intelligence-we-are-building`, `v01-the-invitation`,
`v01-the-limits-of-the-claim`, and `v01-the-work-behind-the-book`. The 113
available binding records have SHA-256
`2bc9df8a474c6459c4bb24159e35d70ac4b2712a8f245faa5ec86280e57de759`.
This reconstruction is recorded for capacity evidence only. It is not a pass
gate and does not supply the missing Publisher checkpoint or historical
spoken-text authority.

Only 122 current recordings have Coherence spoken text that is byte exact with
the fragment-aware Publisher Reader narration profile. The proof withholds the
other 403 incompatible published recordings from its catalog and playback
projection. Of those mismatches, 195 have equal character length and 208 have
different length. Safe clip provenance is 119 from the initial nine-volume
checkpoint and three from the PR 207 checkpoint. The safe section ID SHA-256 is
`4aa80d0705d8bc974c6d78347a15c1796a2d527e752eb97aeee35ec29eeb40be`.

The safe projection carries 104,355,445 audio bytes, 4,387,745 timing reference
bytes, 10,840.535 seconds, 31,299 exact timing words, and 169 interpolated timing
words. It retains 122 timing size declarations only as checkpoint-bound
references. The proof does not fetch or parse timing bodies and does not claim
timing parity.

The canonical projected catalog value SHA-256 is
`b5a5da855a3e21576e2e563eaf8767d643e6a9bde48a204124bb749f5085bde9`.
Its exact 48,578 byte canonical text SHA-256 is
`a7094b6f7c9718810bae6a2c80e408678e39d9c09c5af0972d09d95193a6efdd`.

The earlier two-owner constructor receipt at checkpoint
`133052d1b3f711faaf31a6422d262e2d9ecb1016` remains historical. Its
route-derived identities were envelope text
`sha256:07f7060ba946ae260457ecd6c5c64b86deceb8ae14c17a69a7da7a88597f072b`,
Reader
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`,
application
`sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8`,
application artifact
`sha256:f2a92b5e4c125ddc190213a325103d82cf72ee4686349e69dafb3dbec96511ce`,
offline catalog text
`sha256:36194f0b06b891218ad5da4b974534c45bb1945da035c4cc3cc6bb1b6e9647c2`,
and evidence
`sha256:7aaf1025434570628d0e4cda4f8d606fffacf842d82a754a8120ea3f66e8154e`.

The current chapter-owner constructor receipt is checkpoint
`137d4ac751bd087054db4c9b1774039df000b968`. The source manifest,
checkpoint authority, current match evidence, safe and withheld section sets,
narration comparison, catalog value, catalog text, clip counts, and timing
counts remain unchanged. Only the six route-derived identities above changed.
The current envelope text is
`sha256:3439497dcea5375c520213b01df4e967e7b11c99f20feef7cd4d32d431651aa1`.
The proof strictly parses and validates that text, deep-compares the round trip,
and only then builds the envelope. It also strictly parses, validates, and
deep-compares the envelope before Reader projection and application assembly.
The linked Reader is
`sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d`.
Publisher Next deliberately excludes audio from the application manifest
identity, so the in-memory audio application has build
`sha256:550ab8706333f4b54e90f3dec7ad6f043ec0cc2b683b7907edc723f24bf3bf3b`
and artifact
`sha256:65c4163e8c3013d9261789a094fc46d064c269d756d55fb9933dfcf080db5aa2`.
Audio is instead bound through the envelope source catalog hash and the exact
narration catalog hash on each of nine offline work packages.
The current offline catalog text identity is
`sha256:78cde5d93f168c31d818dfb3b1d7c3a63223a0f2913e7e649c27103ed38bbe93`.

The active Publisher Schema declaration exposes envelope `clips`, and the
Coherence proof consumes that public type directly. No local cast or type
redefinition remains.

This proof records `sourceDeclarationPresent=false`,
`materializedCatalog=false`, `applicationConstructedInMemory=true`,
`publicApplicationAssembly=false`, `hostIntegrated=false`,
`routesActivated=false`, `audioParity=false`, `timingParity=false`,
`publisherCheckpointCompatible=false`, and
`liveRemoteBytesVerified=false`. No host integration, route activation, public
application assembly, live remote byte verification, audio parity, or timing
parity follows from this evidence. The current synthetic proof evidence SHA-256
is
`8126315287dc9aabf76ff6dc07f1f0f257130849a9d43bc38c5a1cf3ab755134`.

## Stable Reader and route identity

The refreshed real-authority route integration built the active Reader archive
and preserved Reader build identity
`sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3`.
The public Reader projection used by that audit is unchanged. It still has 535
active paths, and its reviewed route ownership report still binds 6,390 durable
Coherence pathnames with 7,247 open issues.

The canonical route report SHA-256 remains
`e3f7926dfdb6220256db4a100c00bb6422d7aed4b3ca42ea445a55acea0760e0`.
Its authority hashes, counts, issue census, and exact collision set remain
unchanged. The report artifact identity now binds Publisher commit
`4e4960628165ea5fa13077c430e908865ff96c7c`. This commit reference is the only
reviewed route identity field that changed. The ignored route artifact is
5,891,674 bytes with SHA-256
`0c1312c0f662d904944186079a3c6d8efb7e23debf7a1afc0183989f3303ade8`.

Focused candidate and route integration validation passed 47 tests. The direct
candidate audit also accepted five exact archives, and the direct route audit
matched the reviewed baseline.

A separate derived comparison applies the same route authorities to the current
583 path adapted Reader. It reports 7,105 open issues with report SHA-256
`59f3f1360da373aa3f29513224c978fff770a3251986d100ccadfa1391d9d498`.
Its issue census is 15 unowned aggregate chapter paths, 45 unowned aggregate
part paths, three collisions, 942 durable fragment gaps, 156 unowned route
aliases, 136 unowned section aliases, and 5,808 unclassified durable paths.
This is a derived comparison, not a replacement or amendment of the reviewed
7,247 issue raw baseline. The 107 current nested catalog fragment hrefs are a
narrower current-catalog census and do not erase the 942 durable fragment gaps.

## Theme evidence boundary

The isolated theme compiler proof now refuses any Publisher candidate other
than `4e4960628165ea5fa13077c430e908865ff96c7c`. The real Next proof passed on
the exact Node.js and npm runtime for that candidate. It preserved application
build identity
`sha256:787b774208ab53709d50b8dea8ebf1396c10a56374d36afcd0199cd535915b67`
and produced application artifact hash
`sha256:21ea8a80a7d55907dfb953f3bcc5756172ddeba758041fa0553f0757d4127cef`.

The compiled CSS hash remains
`sha256:2e29e06f5ef7fed1b8a9018d771735de9fc06f2324d0fc4ca9e5628101ead9f4`.
The font evidence hash remains
`sha256:ddf9acfd3b802c916707d32b5bc3ad99e1c6ee3b69130bc8eff955fae4694233`.
The proof validated five compiled font families across 48 assets and removed its
disposable host. No CSS or font identity gate was relaxed. This is isolated
compiler and runtime evidence. It is not a deployment or a local preview.

That raw Reader receipt remains historical evidence. The earlier 539 route
linkful disposable official Publisher Next host at source checkpoint
`62dac1f62a62d6d080940b8c46833e72803afec7` consumed the four artifacts from
the linkful content proof. The standalone content proof remained unchanged with
`wiredToHostRoutes=false` and evidence
`sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4`.
The separate host proved that its exact derived artifacts were consumable without
changing current `src/app` code or public routes.

That linkful host preserved Reader build
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`.
Its themed application build was
`sha256:bbcc7b942e807a7006f9269988e042f1215f4e1f698bcec3cb6cf720ac872390`,
and its application artifact was
`sha256:90f83e508c8cd8df01e24e11f13396f7ec21f57654c3c2e06862db5cb8ee8e09`.
The complete four artifact census was
`sha256:f60614c51fcfea1c4ab914ecbfc0c5a1674f21467af03367bb2773fc64d943a6`.
The live semantic projection was
`sha256:e11abcb70bb75f6fba5eef7053539daff96af876932ed3b40436302fe56a4579`.
The host source identity was
`sha256:df0ef6388b6bdf8724a72cdd0d745b60854a1b150265513e4b848067af44fe64`,
the application payload was
`sha256:37943580ad7ce95ecfa029c50132a2380dc4e289b5e3e18131f4c60c1a5339ae`,
and the host scaffolding was
`sha256:c55e244af9fb3a69cb642ed6f03d218439f9e40b2931319c2707b041c6921ed3`.

That historical host copies and verifies exactly four Reader artifacts:

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publication-reader-progress.json` | 293,631 | `5ee386ad395b860e9826c3059b484a7ad7cf9253a6c5f934701f97b4b7d22f1b` |
| `public/publication-reader-search.json` | 2,840,131 | `d5db3c6db1eba655199398d49bde51662698cd31aff3069804b3d299b709a4ba` |
| `publication-public-identity.json` | 736 | `d30d5f44af0f1628187160dbabffdbc979a77a2aece2f5a0f25c60f7b71d9b73` |
| `publication-reader.json` | 4,867,644 | `e56c4c2701a7fff2e5225ee0726b696f65e5a3c1b761170a8eff02a65566c764` |

Its per-run bounded live HTML response census was:

| Publisher route | Bytes |
| --- | ---: |
| `/manuscripts/1/` | 7,878,737 |
| `/manuscripts/1/seed-sprout-stem-and-soil/the-stem/` | 230,890 |
| `/manuscripts/1/seed-sprout-stem-and-soil/the-soil/` | 166,983 |

Each HTML response is bounded to 16 MiB, and all fetched responses share a 64
MiB total budget. Raw Next HTML hashes are intentionally not retained because
equivalent successful runs produce volatile transport bytes. The stable live
semantic projection above is the durable identity. That host proves all 21 links
across 17 exact block groups and
the two same-owner IDs `v01-how-coherence-becomes-structure` and
`v01-the-human-being-reconsidered`. It retained 44 absent catalog base paths with
141 references and 151 absent fragment hrefs. The application manifest had no
audio declaration, and no fifth Reader artifact was copied. A bounded live
request to `/publication-audio.json` returned 404. The live runtime reported zero
offline audio clips, audio resources, timing resources, and narration catalogs.
The host was removed after verification.

This historical linkful host receipt is not a local preview, deployment,
content parity, route parity, fragment parity, audio parity, or timing parity.
It does not prove browser fragment scrolling. Current `src/app` code and public
routes remain untouched.

The current expanded disposable host receipt is bound to source checkpoint
`bdfbe494ef259af1359dccee7e3ef4c1650d999d`. Its exact Git source-state
identity is
`sha256:73b117828fba515b07e3447425f8024f7f4989e724b418dfab57561036322825`.
It consumes the current content evidence and preserves Content build
`sha256:f999fc8800202b361c493a928ae12ebac34b6ca979af5b9a802232eb7a8fed0c`,
Reader build
`sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d`,
and adapted application build
`sha256:550ab8706333f4b54e90f3dec7ad6f043ec0cc2b683b7907edc723f24bf3bf3b`.
Its themed application build is
`sha256:7f62e6f77f9e46aa434be590b6a29b0fd8f6afabf2aa2e5004d9d6cce0307dad`,
and its application artifact is
`sha256:5f4a1e65c17e7ffca5aff593da2cc5129ba4890705e0c5871332fce7f92fb00c`.
The complete four artifact census is
`sha256:e54c7d43fbbcd407d4dd59512dcd2c8aa87c7581778de24c6cd417d1fe75367c`:

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publication-reader-progress.json` | 294,877 | `861d79fab357de5ab40d65b028a1987532e76f1312ed93ec47d4e987efd2805b` |
| `public/publication-reader-search.json` | 2,841,377 | `fc398e00bc2c1cb44d26676066f0ed4113f094aa868de5f92534fbefc29d4ed8` |
| `publication-public-identity.json` | 736 | `9b5101bfc95717640dc4d112646f78dd2f7eda4ec081f6b32bcb8239a1dfe997` |
| `publication-reader.json` | 4,907,617 | `6b418f2f52edbe0c3b7532c148e5959c0ea1ee5e4703be5e064dc92151172f76` |

The stable live semantic projection is
`sha256:328497cf4aa2dfee368f28fc79a36b86ebf612db4d19e42043268392380ee69a`.
The host source identity is
`sha256:bbf2181d273b6efc66b9f25e4d6525e5992c972be3842dc880fa1401dff0b882`,
the application payload is
`sha256:367e0f464a2b40f014512c802e1b7392dff871209dac0bef7d3264c710f5919e`,
and the scaffolding is
`sha256:988ae47b6575ac312251b287507723a2beb3c54eb7ad5a8d37dc16ca663dac54`.
The 47 safe live paths have path census
`sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916`.
The committed run observed 22,452,422 total response bytes, with a maximum of
7,878,888 and a minimum of 58,948. These are per-run transport observations.
Raw Next HTML hashes are intentionally absent. The stable semantic projection
is the durable live identity.

The host proves all 21 links across 17 exact block groups and 46 globally
unique visible owner sections in raw catalog group order. The owner group,
owner ID, child ID, and owner path identities are respectively
`sha256:6e4b2ffb9b6c1b130659a96be104d5e174b02e56286c16bc182fcadf64baacb2`,
`sha256:8f586a30ae231f85a1103613bce6fa08baec55f510175015605d70a106857cbb`,
`sha256:1c493c167d85bfdc507f1a0f061efbc7843a2af81bc185733440a7a32e9a3879`,
and
`sha256:aa33821c6b83a0ce25b176762b8bb6c0b24081a79fde993cee17e4dcb270b652`.
The 107 child IDs are unique, disjoint from the owners, and remain unassigned as
Reader locations because their DOM IDs are absent from the owner pages. Exact
Reader ancestry and Reader, search, and progress relationships validate. Base
route presence is true, while aggregate
chapter page parity, nested fragment parity, durable fragment parity, and full
Reader route parity remain false.

The application manifest has no audio declaration, the four normal Reader
artifacts contain no audio, no audio artifact exists on disk, all offline audio
and timing counts are zero, and the bounded live request to
`/publication-audio.json` returns 404. The proof removes its disposable host
after verification. The generated proof root is empty. Current `src/app` code
and public routes remain untouched. This is not a local preview, publication,
deployment, content parity, route parity, fragment parity, audio parity, timing
parity, or browser fragment scrolling proof. No durable or current host route,
layout, or configuration follows from it.

The complete repository validation passed 103 test files and 979 tests plus the
production build on this exact source checkpoint.

## Remaining gates

This candidate remains local and in progress. The isolated content adapter now
proves all 21 semantic links and base route presence for all 46 chapter owners,
and the separate disposable host consumes its four exact artifacts. The 107
nested catalog fragment hrefs remain unassigned because their child DOM IDs are
not rendered on the owner pages.
Aggregate chapter page parity, nested fragment parity, durable fragment parity,
and full Reader route parity remain false. A local reader preview of the exact
final candidate requires the author's approval before any Coherence candidate
push.

Before merge readiness, the server-side Reader state projection injection audit
must be rerun from the account enrolled in Trusted Access against this exact
Publisher candidate. The findings must be retained. Any required Publisher fix
invalidates these archives and requires a new source commit, five new archive
records, a regenerated lockfile, and renewed validation.

No part of this record authorizes a push, pull request update, merge, package
publication, deployment, database action, credential action, or production
change.
