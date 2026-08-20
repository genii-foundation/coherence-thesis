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

The refreshed Coherence content adapter now applies the complete 21-link set.
Every link succeeds individually and in its Reader-order block group across 17
blocks. The linkful Content and Reader artifacts retain all 21 links, and the
real Publisher Next application assembles and exposes them on the source work
page. The proof server-renders all 21 anchors inside their 17 exact source
blocks. The closed evidence hash is
`sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4`.
The linked Reader build is
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`,
and its application build is
`sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8`.
This closes the semantic-link renderer blocker inside the isolated adapter. It
does not establish host wiring, route parity, fragment parity, or deployment
readiness.

The four semantic target routes reduce absent raw catalog base paths from 46
to 44. Those base paths account for 141 catalog references after adaptation,
and those base counts are unchanged by the fragment slice. Two sections already
owning semantic routes at their catalog base paths now select exact anchored
Reader locations. Their search and progress entries use those exact hrefs, and
their Publisher section pages server-render the exact owner IDs. The exact
fragment gap is therefore 151 after adaptation, down from the 153 baseline.
Nested fragment owners still lack a truthful composed page contract, so the
evidence continues to report base path coverage and fragment parity separately.

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
The proof strictly parses and validates that text, deep-compares the round trip,
and only then builds the envelope. It also strictly parses, validates, and
deep-compares the envelope before Reader projection and application assembly.
The linked Reader remains
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`.
Publisher Next deliberately excludes audio from the application manifest
identity, so the in-memory audio application retains build
`sha256:2e0f745a190e2d9652685d919de50ffcabd1af0ee141b0e277d18d1707fcbdc8`.
Audio is instead bound through the envelope source catalog hash and the exact
narration catalog hash on each of nine offline work packages.

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
parity follows from this evidence. Removing the obsolete type-gap limitation
from the closed evidence changes only its own identity. The current synthetic
proof evidence SHA-256 is
`7aaf1025434570628d0e4cda4f8d606fffacf842d82a754a8120ea3f66e8154e`.

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

## Remaining gates

This candidate remains local and in progress. The isolated content adapter now
proves all 21 semantic links, but the current host does not consume its adapted
output. Route and fragment continuity gaps remain open. A local reader preview
of the exact final candidate requires the author's approval before any Coherence
candidate push.

Before merge readiness, the server-side Reader state projection injection audit
must be rerun from the account enrolled in Trusted Access against this exact
Publisher candidate. The findings must be retained. Any required Publisher fix
invalidates these archives and requires a new source commit, five new archive
records, a regenerated lockfile, and renewed validation.

No part of this record authorizes a push, pull request update, merge, package
publication, deployment, database action, credential action, or production
change.
