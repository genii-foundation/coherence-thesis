# Publisher migration configuration

This directory contains the Coherence owned inputs for the proposed GENII
Publisher migration. The repository root `publication.json` is the Publisher
entry point. The `works` directory contains one declared work manifest for each
of the nine canonical volumes.

The manifests are derived from the canonical volume packages, the prepared
manuscript catalog, and the durable continuity records. Regenerate them with:

```bash
npm run publisher:manifests
```

Run `npm run publisher:manifests:check` to prove that the committed files match
those authorities. Run `npm run publisher:reader:validate` to compile the
complete Publisher valid projection of canonical manuscript bytes without
writing output. The explicit materialization command writes build bound preview
artifacts under the ignored `generated/publisher/host` directory:

```bash
npm run publisher:reader:materialize
```

## Current corpus and route evidence

The current adapted Reader contains 3,486 blocks and 206,448 Publisher words.
The canonical Coherence catalog contains 202,137 words. The difference is
retained as explicit projection evidence. It is not described as prose parity.

The current materialized Reader contains a derived candidate route plan with
586 active routes and 584 explicit redirects. Redirect projection support has
landed. The continuity manifests supply 518 redirects, and the adapter supplies
66 redirects needed by the current catalog. Three aggregate section indexes
hold 57 references. All 107 current nested catalog hrefs have an address in the
adapted Reader. Aggregate chapter page parity is true. Broad nested fragment
parity, durable fragment parity, and full Reader route parity remain false.

These counts are candidate diagnostics, not a mechanically current route audit.
The reviewed raw and adapted route baselines remain stale and red against the
current authorities. Refreshing and promoting either baseline still requires
author review.

The current `npm run publisher:routes:report` command remains red and retains no
report while those reviewed baselines are stale. After author review and a
deliberate baseline refresh, the command can again write deterministic evidence
below the ignored `generated/reports/publisher` directory.

## Current runtime artifact transaction

The atomic materialization transaction writes seven artifacts in the following
order. The Reader is written last as the transaction commit marker.

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publisher/coherence-reader-state-migration.json` | 1,322,065 | `sha256:3e4c476028b4c8b5c13f58757ee9ae52117d5862c6302187be0caa164b4e2238` |
| `public/publication-reader-search.json` | 2,845,048 | `sha256:a0cc97c1e996a01859ecc3db7f6b6b84544468fb85cc8db922bd0a361a697721` |
| `public/publication-reader-progress.json` | 295,305 | `sha256:94aa897b597a2cdc5363d17f7f902ee5e3a06e0cd96ea048d8e8fdb6f0f9d5b3` |
| `publication-public-identity.json` | 736 | `sha256:40faa074ccd57b4ff5559577380e4e9d3ce0015f85706779c898dba8495392c9` |
| `publication-extensions.json` | 983 | `sha256:adb08654067d9201133f70f5ce104e4cb861ff98e472bac4d5fc349f63175f9b` |
| `publication-updates.json` | 100,481 | `sha256:b5f0f4acf0a7eeddaa1b076c97ce42240bdc0652c26a880005726ae911837e0d` |
| `publication-reader.json` | 5,053,224 | `sha256:12cb32ea39a97f30ec4c5ea6d7a1e9daf641b8ff214545ef12d6796458121ee8` |

These are build bound local receipts, not a release or deployment record.

## Transition boundary

The canonical application remains the current Coherence reader in ordinary
development and every production build. Run `npm run preview:dev:publisher`
for the explicit loopback only Publisher transition preview on its separate
default port. That mode uses Publisher's canonical route shapes, omits the
Coherence shell, and records its mode in the managed preview status. It runs
the synchronous preference bootstrap needed for that isolated preview. It
does not mount Publisher providers. The materialized migration and Updates
payloads stay dormant. Audio, offline, and synchronization remain inactive
capabilities. The preview is an integration surface. It is not a route, UX,
lifecycle, or deployment parity claim.

The recent Coherence toolbar, progress, bookmarks, audio, synchronization,
offline reading, aggregate pages, Updates timeline, and admin surface remain
authoritative. The Publisher preview does not claim to reproduce those features.
Only the migration and Updates payloads are materialized and dormant. Audio,
offline, and synchronization are inactive capabilities, not materialized
payloads. The isolated audio proof retains 122 safe clips and withholds 403
clips. The application manifest still declares no public audio catalog.

The remaining integration boundary is a supported embedded Publisher renderer
that can preserve Publisher content, extensions, theme, and attribution without
mounting a second reader rail. Author approval of refreshed local previews is
also required before any push, pull request, deployment, or migration decision.

## Validation

Eight proof commands define the intended mechanical gates:

```bash
npm run publisher:content:fidelity
npm run publisher:routes:audit
npm run publisher:application:validate
npm run publisher:content:adapt
npm run publisher:routes:adapted
npm run publisher:audio:adapt
npm run publisher:theme:compile
npm run publisher:offline:validate
```

The raw and adapted route audit commands are currently expected to remain red
until their stale baselines are refreshed and reviewed. The theme and offline
proofs are also pending refresh because their last green receipts bind the older
583 route and 582 application parameter authorities. Their descriptions below
are historical behavior, not current passing proof.

Static validation is intended to run the theme proof alone. UI validation and
CI are intended to run the offline proof instead because it composes the theme
proof internally. A single validation path does not stack both commands.

The content check binds the exact corpus projection and its known fidelity gaps.
Redirect projection can now preserve current Reader redirects, but the route
audit baselines do not yet bind the current Publisher routes to the durable
Coherence continuity census. The application proof assembles and renders the
Publisher shell, but does not assert content or UX parity. The current content
adapter preserves the exact work, section, block, provenance, source order, and
approved semantic link authorities. It assembles the adapted Reader, search,
progress, route plan, and Publisher application without activating a deployment.

The audio adapter is a separate read only, deterministic constructor proof. The
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
At its last green historical checkpoint, the theme compiler created a disposable
official Publisher Next host in one unique ignored directory. It selected the
real Coherence theme through the host alias, built it, briefly started its local
production server, fetched and inspected the proof and home routes, then removed
the disposable output. That receipt did not activate a deployed host, assert
content parity, prove browser visibility, or self authenticate arbitrary bytes
in `node_modules`. It is pinned to the older 583 route and 582 application
parameter authorities and must be refreshed.

At the same historical authority, the offline browser proof composed that theme
host through its live observer, installed Cardinal Scale through the official
controls, verified atomic replacement and rollback, cut network access, and
checked cold reading, search, text visibility, range handling, cache isolation,
and cleanup in the bundled Chromium browser. That receipt did not create a
deployment, change public routes, claim full route or content parity, or replace
explicit local preview approval. It also must be refreshed against the current
route and application authorities.

## Historical integration receipts

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
The proof removed its disposable host after verification. At that historical
checkpoint, `src/app` code and public routes remained untouched. This receipt
does not establish a local preview, deployment, content parity, route parity,
fragment parity, audio parity, timing parity, or browser fragment scrolling.

The later historical expanded disposable host receipt at source checkpoint
`bdfbe494ef259af1359dccee7e3ef4c1650d999d` consumed content evidence
`sha256:0c1f2d3bf289a98a2e7363fae0e58a5d0e3257d412ad17519da40cf222e02acf`.
It preserved content build
`sha256:f999fc8800202b361c493a928ae12ebac34b6ca979af5b9a802232eb7a8fed0c`,
Reader build
`sha256:f33a9dbce537081ac964269ad0fdbcc39cf8cb8258874f5099bc3de465aba96d`,
and adapted application build
`sha256:550ab8706333f4b54e90f3dec7ad6f043ec0cc2b683b7907edc723f24bf3bf3b`.
It produced themed application build
`sha256:7f62e6f77f9e46aa434be590b6a29b0fd8f6afabf2aa2e5004d9d6cce0307dad`
with application artifact
`sha256:5f4a1e65c17e7ffca5aff593da2cc5129ba4890705e0c5871332fce7f92fb00c`.
Its four artifact census was
`sha256:e54c7d43fbbcd407d4dd59512dcd2c8aa87c7581778de24c6cd417d1fe75367c`:

| Host path | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/publication-reader-progress.json` | 294,877 | `861d79fab357de5ab40d65b028a1987532e76f1312ed93ec47d4e987efd2805b` |
| `public/publication-reader-search.json` | 2,841,377 | `fc398e00bc2c1cb44d26676066f0ed4113f094aa868de5f92534fbefc29d4ed8` |
| `publication-public-identity.json` | 736 | `9b5101bfc95717640dc4d112646f78dd2f7eda4ec081f6b32bcb8239a1dfe997` |
| `publication-reader.json` | 4,907,617 | `6b418f2f52edbe0c3b7532c148e5959c0ea1ee5e4703be5e064dc92151172f76` |

The stable live semantic projection was
`sha256:328497cf4aa2dfee368f28fc79a36b86ebf612db4d19e42043268392380ee69a`,
the host source identity was
`sha256:bbf2181d273b6efc66b9f25e4d6525e5992c972be3842dc880fa1401dff0b882`,
the application payload was
`sha256:367e0f464a2b40f014512c802e1b7392dff871209dac0bef7d3264c710f5919e`,
and the scaffolding was
`sha256:988ae47b6575ac312251b287507723a2beb3c54eb7ad5a8d37dc16ca663dac54`.
The 47 safe live paths had stable path census
`sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916`.
The committed run observed 22,452,422 bytes in total, with a maximum response of
7,878,888 bytes and a minimum of 58,948 bytes. Those byte counts are a per-run
transport census. Raw Next HTML hashes are intentionally absent, and the stable
semantic projection is the durable live identity.

The host proved 46 unique visible owner sections, exact Reader, search, and
progress relationships, all 21 semantic links across 17 block groups, and no
nested child ownership. The 107 child section IDs were unique, disjoint from the
owners, and remained unassigned as Reader locations because their DOM IDs were
absent from the owner pages. The application manifest
had no audio declaration, the four normal Reader artifacts contained no audio,
no audio artifact existed on disk, all offline audio and timing counts were zero,
and a bounded live request to `/publication-audio.json` returned 404. The proof
removed its disposable host after verification. No durable host route, layout,
configuration, local preview, publication, or deployment followed from this
receipt. At that historical checkpoint, `src/app` code and public routes
remained untouched.

## Source boundaries

The current manifests declare all nine works and all 525 current sections. They
preserve each current section page route, continuity identity, historical
identity, progress group, and exact manuscript source hash. The root manifest
does not activate Updates, narration, synchronization, a deployed theme, or a
production Publisher host. The historical isolated theme compiler receipt is
integration evidence awaiting refresh, not migration activation.

The manifest protects `editorial`, `publisher`, and `publishing` as source roots.
Reader and report materialization refuse protected roots, unsafe output paths,
and symbolic output paths before writing.

Coherence also owns polished reader behavior that the current Publisher
candidate does not yet express through a supported embedded renderer. The raw
Markdown projection and the adapted projection remain separate evidence. The
adapter adds the approved semantic links and current continuity addresses to
derived work inputs without changing the canonical manuscripts or the historical
receipts above.

No file in `editorial` or `publishing` is generated by this tooling. Those trees
remain source authority and are read only during manifest generation.
