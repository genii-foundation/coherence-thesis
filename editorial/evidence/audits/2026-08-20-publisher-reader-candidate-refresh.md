# GENII Publisher Reader Candidate Refresh

Date: 2026-08-20

Status: Local migration candidate evidence. This record does not approve a push,
merge, deployment, package publication, database mutation, credential change, or
production change.

## Active candidate

The active GENII Publisher source commit is
`060a7b7b816c90ce3698391929386442453dec14`. The five local archives under its
full commit directory are bound by `candidate.json` to Node.js 22.12.0 and npm
10.9.0. The exact candidate validator accepts all five archives and the current
manifest and lockfile references.

This candidate replaces
`15a5fc8967412b0c45a7f129e6f03f7cf7388197`. An exact byte comparison proves
that four archives did not change:

- Publisher Schema remains 1,007,811 bytes with SHA-256
  `bf227acc0b33b3fe15673f4bacb9f957eb9351248c259455b92f13366ecdab02`.
- Publisher Content remains 970,833 bytes with SHA-256
  `b16794d767a09a0c110da03ada7e83f0ff7ce1d5ebf520e68fe329c8034b30e7`.
- Publisher core remains 183,853 bytes with SHA-256
  `4f45fd2faacbe928cbeee2d63dc95cc2d0592730f996d662185389b5ce3e878f`.
- Publisher Next remains 240,587 bytes with SHA-256
  `2b015cec1215471eeedb8b110fd2323afa01249ad3f22c2d04b94fcd685cab12`.

Only the Publisher Reader archive changed. Its prior 364,675 byte archive had
SHA-256
`533ff21afee6c3d2ae0a689be22508df17ec2bbd391aaa1ab436fc6ff700daf6`.
The active 364,497 byte archive has SHA-256
`b24eb5807ec7c7e2a5be2ead8833aec12f7e92f65cfec29f89b37828ee0633f4`.
The Publisher source difference is confined to Reader Markdown implementation
and documentation plus Reader and Next integration tests. No Schema, Content,
core Publisher, Next package source, theme, font, sync, or database source
changed in this candidate refresh.

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
`060a7b7b816c90ce3698391929386442453dec14`. This commit reference is the only
reviewed route identity field that changed.

Focused candidate and route integration validation passed 47 tests. The direct
candidate audit also accepted five exact archives, and the direct route audit
matched the reviewed baseline.

## Theme evidence boundary

The isolated theme compiler proof now refuses any Publisher candidate other
than `060a7b7b816c90ce3698391929386442453dec14`. The real Next proof passed on
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
