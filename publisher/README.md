# Publisher migration configuration

This directory contains Coherence owned inputs for the proposed GENII Publisher
migration. The repository root `publication.json` is the Publisher entry point.
The `works` directory contains one declared work manifest for each canonical
volume.

The manifests are derived from the nine canonical volume packages, the prepared
manuscript catalog, and the durable continuity records. Run the repository
manifest command to regenerate them:

```bash
npm run publisher:manifests
```

Run `npm run publisher:manifests:check` to prove that the committed files still
match those authorities. Run `npm run publisher:reader:validate` to compile the
complete Publisher-valid projection of canonical manuscript bytes without
writing output. The explicit materialization command writes the four build-bound
preview artifacts under the ignored
`generated/publisher/host` directory:

```bash
npm run publisher:reader:materialize
```

Six further checks keep the current proof honest:

```bash
npm run publisher:content:fidelity
npm run publisher:routes:audit
npm run publisher:application:validate
npm run publisher:content:adapt
npm run publisher:audio:adapt
npm run publisher:theme:compile
```

The content check binds the exact corpus projection and its known fidelity gaps.
The route audit binds every current Publisher route to the durable Coherence
continuity census and fails if the reviewed open-gap baseline drifts. The
application proof assembles and renders the Publisher shell, but explicitly does
not assert content parity. The current content adapter proof preserves the exact
work, section, block, provenance, and source order authorities while retaining
four semantic target routes, adding 44 derived catalog root routes, and keeping
all 21 approved semantic links in isolated derived work inputs. It derives 46
chapter root owner groups across seven works and their 107 direct children from
raw catalog order. It assembles the adapted Reader, search, progress, route plan,
and Publisher application, then renders the semantic source work page and every
chapter root owner page. It does not wire that adapted output into the current
host, claim full route parity, start a preview, or activate a deployment. The
result has 583 active routes and route plan parameters, 582 application
parameters, zero absent catalog base paths or references, and exact anchored
Reader locations for all 46 owner sections. It assigns no child address. Base
route presence is true. Aggregate chapter page parity, nested fragment parity,
durable fragment parity, and full Reader route parity remain false. Exactly 107
nested catalog fragment hrefs remain unassigned because their child DOM IDs are
not rendered on the owner pages.
The audio adapter is a separate read-only, deterministic constructor proof. The
root publication manifest has no audio declaration, so the proof synthesizes no
public configuration and writes no catalog. It validates all 525 published
clips against their raw catalog audio versions and one exact Coherence
checkpoint unit, then withholds 403 published recordings whose Coherence spoken
text is not byte exact with the Publisher Reader narration profile. The isolated
catalog therefore contains 122 clips and 122 checkpoint-bound timing
references. It is strictly parsed and validated again before the exact catalog
text is bound into an audio envelope. The fragment-aware linked Reader is then
assembled with that envelope in memory, and all nine offline packages are
checked against their exact per-work audio and timing resources. Timing bodies
are not read, parsed, or claimed as parity. The Coherence checkpoints are not
Publisher AudioCheckpoint records, and the application manifest deliberately
does not bind audio. The envelope catalog hash and each offline package
narration catalog hash provide the audio binding. This proof does not modify
`publication.json`, materialize `generated/publisher/audio-catalog.json`, wire a
host, activate routes, verify live remote bytes, or claim audio or timing parity.
The theme compiler proof creates a disposable
official Publisher Next host in one unique ignored directory, selects the real
Coherence theme through the host alias, builds it, briefly starts its local
production server, fetches and inspects the proof and home routes, then removes
the disposable output. It does not activate a deployed host or assert content
parity. It also does not prove browser visibility or self-authenticate arbitrary
bytes in `node_modules`. The exact clean `npm ci` receipt and Publisher candidate
audit are its installed-code trust root, and the required local browser preview
remains the visibility and interaction gate.

The earlier raw Reader theme receipt remains historical evidence. It preserves
application build
`sha256:787b774208ab53709d50b8dea8ebf1396c10a56374d36afcd0199cd535915b67`
and application artifact
`sha256:21ea8a80a7d55907dfb953f3bcc5756172ddeba758041fa0553f0757d4127cef`.
The earlier 539 route linkful disposable host receipt at source checkpoint
`62dac1f62a62d6d080940b8c46833e72803afec7` consumed the four artifacts from
the separate linkful content proof without changing that proof's
`wiredToHostRoutes=false` receipt or its evidence identity
`sha256:cf3a0da4dfe103353287262a6e27a0be5631f1ff8ceb4b859105f75948588ed4`.
That host preserved linked Reader build
`sha256:68bfb9da9dc5aa6ffdce273307f15551978d0064870c31a51674b4f6ff39abf2`,
then compiled themed application build
`sha256:bbcc7b942e807a7006f9269988e042f1215f4e1f698bcec3cb6cf720ac872390`
with application artifact
`sha256:90f83e508c8cd8df01e24e11f13396f7ec21f57654c3c2e06862db5cb8ee8e09`.
Its four artifact census was
`sha256:f60614c51fcfea1c4ab914ecbfc0c5a1674f21467af03367bb2773fc64d943a6`,
its live semantic projection was
`sha256:e11abcb70bb75f6fba5eef7053539daff96af876932ed3b40436302fe56a4579`,
its host sources were
`sha256:df0ef6388b6bdf8724a72cdd0d745b60854a1b150265513e4b848067af44fe64`,
its application payload was
`sha256:37943580ad7ce95ecfa029c50132a2380dc4e289b5e3e18131f4c60c1a5339ae`,
and its scaffolding was
`sha256:c55e244af9fb3a69cb642ed6f03d218439f9e40b2931319c2707b041c6921ed3`.

The exact four artifacts consumed by that historical disposable host are:

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publication-reader-progress.json` | 293,631 | `5ee386ad395b860e9826c3059b484a7ad7cf9253a6c5f934701f97b4b7d22f1b` |
| `public/publication-reader-search.json` | 2,840,131 | `d5db3c6db1eba655199398d49bde51662698cd31aff3069804b3d299b709a4ba` |
| `publication-public-identity.json` | 736 | `d30d5f44af0f1628187160dbabffdbc979a77a2aece2f5a0f25c60f7b71d9b73` |
| `publication-reader.json` | 4,867,644 | `e56c4c2701a7fff2e5225ee0726b696f65e5a3c1b761170a8eff02a65566c764` |

Its per-run bounded response census was:

| Publisher route | Bytes |
| --- | ---: |
| `/manuscripts/1/` | 7,878,737 |
| `/manuscripts/1/seed-sprout-stem-and-soil/the-stem/` | 230,890 |
| `/manuscripts/1/seed-sprout-stem-and-soil/the-soil/` | 166,983 |

Each HTML response is bounded to 16 MiB, and all fetched responses share a 64
MiB total budget. Raw Next HTML hashes are intentionally not retained because
equivalent successful runs produce volatile transport bytes. The stable live
semantic projection above is the durable identity. That host rendered all 21
semantic links in 17 exact block
groups and exposed owner IDs `v01-how-coherence-becomes-structure` and
`v01-the-human-being-reconsidered`. It retained 44 absent base paths with 141
catalog references and 151 absent fragment hrefs. The application manifest had
no audio declaration, no fifth Reader artifact existed, the bounded live request
to `/publication-audio.json` returned 404, and the runtime census reported zero
offline audio clips, audio resources, timing resources, and narration catalogs.
The proof removed its disposable host after verification. Current `src/app`
code and public routes remain untouched. This historical receipt does not
establish a local preview, deployment, content parity, route parity, fragment
parity, audio parity, timing parity, or browser fragment scrolling.

The current expanded disposable host receipt at source checkpoint
`bdfbe494ef259af1359dccee7e3ef4c1650d999d` consumes content evidence
`sha256:0c1f2d3bf289a98a2e7363fae0e58a5d0e3257d412ad17519da40cf222e02acf`.
It preserves content build
`sha256:f999fc8800202b361c493a928ae12ebac34b6ca979af5b9a802232eb7a8fed0c`,
Reader build
`sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d`,
and adapted application build
`sha256:550ab8706333f4b54e90f3dec7ad6f043ec0cc2b683b7907edc723f24bf3bf3b`.
It produces themed application build
`sha256:7f62e6f77f9e46aa434be590b6a29b0fd8f6afabf2aa2e5004d9d6cce0307dad`
with application artifact
`sha256:5f4a1e65c17e7ffca5aff593da2cc5129ba4890705e0c5871332fce7f92fb00c`.
Its four artifact census is
`sha256:e54c7d43fbbcd407d4dd59512dcd2c8aa87c7581778de24c6cd417d1fe75367c`:

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publication-reader-progress.json` | 294,877 | `861d79fab357de5ab40d65b028a1987532e76f1312ed93ec47d4e987efd2805b` |
| `public/publication-reader-search.json` | 2,841,377 | `fc398e00bc2c1cb44d26676066f0ed4113f094aa868de5f92534fbefc29d4ed8` |
| `publication-public-identity.json` | 736 | `9b5101bfc95717640dc4d112646f78dd2f7eda4ec081f6b32bcb8239a1dfe997` |
| `publication-reader.json` | 4,907,617 | `6b418f2f52edbe0c3b7532c148e5959c0ea1ee5e4703be5e064dc92151172f76` |

The stable live semantic projection is
`sha256:328497cf4aa2dfee368f28fc79a36b86ebf612db4d19e42043268392380ee69a`,
the host source identity is
`sha256:bbf2181d273b6efc66b9f25e4d6525e5992c972be3842dc880fa1401dff0b882`,
the application payload is
`sha256:367e0f464a2b40f014512c802e1b7392dff871209dac0bef7d3264c710f5919e`,
and the scaffolding is
`sha256:988ae47b6575ac312251b287507723a2beb3c54eb7ad5a8d37dc16ca663dac54`.
The 47 safe live paths have stable path census
`sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916`.
The committed run observed 22,452,422 bytes in total, with a maximum response of
7,878,888 bytes and a minimum of 58,948 bytes. Those byte counts are a per-run
transport census. Raw Next HTML hashes are intentionally absent, and the stable
semantic projection is the durable live identity.

The host proves 46 unique visible owner sections, exact Reader, search, and
progress relationships, all 21 semantic links across 17 block groups, and no
nested child ownership. The 107 child section IDs are unique, disjoint from the
owners, and remain unassigned as Reader locations because their DOM IDs are
absent from the owner pages. The application manifest
has no audio declaration, the four normal Reader artifacts contain no audio,
no audio artifact exists on disk, all offline audio and timing counts are zero,
and a bounded live request to `/publication-audio.json` returns 404. The proof
removes its disposable host after verification. No durable or current host
route, layout, configuration, local preview, publication, or deployment follows
from this receipt. Current `src/app` code and public routes remain untouched.

To retain the complete route evidence locally, run `npm run
publisher:routes:report`. It writes one deterministic report below the ignored
`generated/reports/publisher` directory.

The reviewed raw route audit remains the durable baseline with 535 active paths
and 7,247 open issues. A separately derived comparison over the 583 route
adapted Reader has 7,105 open issues with report identity
`sha256:59f3f1360da373aa3f29513224c978fff770a3251986d100ccadfa1391d9d498`.
That comparison does not replace or amend the reviewed raw baseline.

The current manifest slice is deliberately narrow. It declares all nine works
and all 525 current sections. It preserves each current section page route,
continuity identity, historical identity, progress group, and exact manuscript
source hash. It does not yet declare continuity redirects, Updates, narration,
synchronization, a deployed theme, or host routes. The isolated theme compiler
proof is integration evidence, not route ownership or migration activation.

The manifest protects `editorial`, `publisher`, and `publishing` as source roots.
Reader and report materialization refuse protected roots, unsafe output paths,
and symbolic output paths before writing.

Coherence also owns aggregate part and chapter pages, historical Reader
fragments, and a legacy shell that the current Publisher candidate cannot express
exactly. The current high-level Markdown projection also carries title matter and
section headings that produce 206,196 Publisher words for the 201,885 word
Coherence catalog. Twenty-one approved semantic links exist only in the enriched
Coherence catalog and remain absent from the raw-manuscript Publisher projection
used by the current raw Reader, fidelity, route, and application proofs and by
the standalone raw Reader theme compiler proof. The isolated content adapter
proof adds the complete approved set to derived work inputs and proves that the
adapted application renders them. The later
disposable host consumes those exact derived artifacts without changing the raw
Reader, route, fidelity, application, and historical theme receipts. Their
absence therefore remains an explicit gap in the raw route and fidelity reports.

No file in `editorial` or `publishing` is generated by this tooling. Those trees
remain source authority and are read only during manifest generation.
