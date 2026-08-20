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
not assert content parity. The content adapter proof preserves the exact work,
section, block, provenance, and source order authorities while adding the four
semantic target routes and all 21 approved semantic links to isolated derived
work inputs. It assembles the adapted Reader, search, progress, route plan, and
Publisher application, then renders the semantic source work page. It does not
wire that adapted output into the current host, claim full route parity, start a
preview, or activate a deployment. Its route evidence reports 44 absent base
paths with 141 catalog references. It also binds exact catalog fragment Reader
locations for two sections whose semantic routes already own the catalog base
path, proves their anchored search and progress hrefs, and proves the owner IDs
exist in server-rendered Publisher pages. This reduces the exact fragment gap
from 153 hrefs to 151 without claiming support for nested fragment owners. The
audio adapter is a separate read-only, deterministic constructor proof. The
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
The installed Publisher type declaration also names catalog `sections` on
`AudioEnvelopeVoice`, while the engine and schema emit envelope `clips`. The
proof records that candidate type-surface gap and uses one narrow read-only cast.
The theme compiler proof creates a disposable
official Publisher Next host in one unique ignored directory, selects the real
Coherence theme through the host alias, builds it, briefly starts its local
production server, fetches and inspects the proof and home routes, then removes
the disposable output. It does not activate a deployed host or assert content
parity. It also does not prove browser visibility or self-authenticate arbitrary
bytes in `node_modules`. The exact clean `npm ci` receipt and Publisher candidate
audit are its installed-code trust root, and the required local browser preview
remains the visibility and interaction gate.
To retain the complete route evidence locally, run `npm run
publisher:routes:report`. It writes one deterministic report below the ignored
`generated/reports/publisher` directory.

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
used by the current Reader, fidelity, route, application, and theme proofs. The
isolated content adapter proof adds the complete approved set to derived work
inputs and proves that the adapted application renders them. Until reviewed host
wiring consumes that adapted output, their absence remains an explicit gap in
the raw route and fidelity reports.

No file in `editorial` or `publishing` is generated by this tooling. Those trees
remain source authority and are read only during manifest generation.
