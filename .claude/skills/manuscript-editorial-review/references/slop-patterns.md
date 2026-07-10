# Slop Pattern Catalog

Every pattern below was found in this corpus by a full audit of all nine volumes plus the master ledger (July 2026). Examples are verbatim quotes; grep for them. Counts come from `npm run manuscripts:lint-prose` and targeted greps at audit time.

Three decision procedures apply throughout:

- **The deletion test.** If a sentence or clause can be cut and the passage loses nothing, cut it. Announcements, negations, and intensifiers almost always fail this test.
- **The strawman test.** A negation earns its place only if a real reader plausibly holds the denied belief. If the denial exists to set up the affirmation's rhythm, state the positive claim and stop.
- **The earned test.** A device (punchline paragraph, triad, litany, aphorism) is earned when the section has built the pressure it releases and the device carries information not already given. Reflexive use is slop even when a single instance would be fine.

---

## Tier 1: Banned. Zero instances in edited prose.

### 1.1 Em dashes, en dashes, double hyphens

The corpus's largest mechanical tell: 2,860 banned-pattern instances corpus-wide at baseline, roughly 2,700 of them dashes. Volume III peaks at one em dash per 65 words. The dash carries appositives, pivots, interruptions, and definitions that colons, periods, and recasting should carry.

> "This book is written to make that work legible — and to invite those capable of carrying it forward"
> "It makes a simpler — and more constrained — assertion:"

Fixes, in order of preference:
1. Split into two sentences. The appositive becomes its own short sentence.
2. Colon, when the second half names or defines the first.
3. Delete, when the interruption is decoration.
4. Commas, only when the aside is genuinely parenthetical and short.

Never swap dash for comma mechanically. Each removal is a sentence-level decision. Exemptions: separator glyph lines (Vol VI's dotted rules), table syntax, and quoted external text. Heading dashes and epigraph attribution dashes are frozen pending the global decisions in volume-notes.md.

### 1.2 "It is worth pausing / naming / noting"

Twenty-six instances of "it is worth" plus a gerund. Each announces that a thought is about to happen instead of having it.

> "Before moving on, it is worth pausing."
> "It is worth naming the relationship between this membrane and what comes next"

Fix: delete the announcement and open with the observation. If a real tempo change is needed, the volume's separator device already does that job.

### 1.3 "Not merely" and "not simply"

Sixty-four "not merely", ten "not simply". They inflate one claim into a fake two-step where the first step was never on the table.

> "not merely an individual capacity but a property of the whole"

Fix: keep the second half of the sentence. If it collapses without the first half, the first half was the content and the sentence needs a real rewrite.

### 1.4 Meta-assertion punchlines

One-sentence paragraphs that assert their own importance instead of demonstrating it.

> "This distinction matters."
> "This structure is intentional."
> "This is not a rhetorical question. It is a design specification."

Fix: delete. Show the weight; never announce it.

### 1.5 Trailer handoffs and syllabus openers

Chapter endings that advertise the next chapter, and chapter openings that list their own agenda. Vol II closes nearly every chapter with an italic "The next chapter turns to..." paragraph. Vol IV has 36 "This chapter" announcements.

> "*The next chapter turns to what happens between regulated nervous systems...*"
> "This chapter names the specific mechanisms through which the scaling problem manifests, examines the historical record..., and proposes the specific design responses..."

Fix: a chapter ends on its last concrete image or claim. If a bridge helps, it becomes one plain sentence at the start of the next chapter. A first paragraph that only lists what the chapter will do gets deleted; start inside the first mechanism, scene, or claim. Exception: one agenda sentence where the register deliberately shifts (Vol III's red-team chapter).

### 1.6 Performed sincerity and self-certifying disclaimers

Words that assert honesty, plainness, or restraint instead of exhibiting it: "say it as plainly as it deserves", "without hyperbole", "This is not a hedge", "honest account", "We could have hidden this list. We did not." Vol III has roughly 57 "honest" family words.

> "We say without hyperbole that such a system would be the most valuable personal instrument a human being could carry."
> "We could have hidden this list. We did not, because the people we are looking for are not reassured by certainty."

Fix: cut the frame, keep the content. "Such a system would be the most valuable personal instrument a person could carry" is stronger without its oath. The honesty devices themselves (failure catalogs, retired statistics, named critics) are voice; only the self-congratulation around them is slop.

### 1.7 Stock AI filler

"delve", "tapestry", "testament to", "seamless(ly)", "leverage" as a verb, "foster", "underscore", "pivotal", "multifaceted", "game-changer", "furthermore", "moreover", "at its core", "in essence", "paradigm shift", "nothing less than". The corpus is nearly clean of these (a verification finding: most score zero). Keep them at zero. Do not build the pass around them; the slop here is structural.

### 1.8 Agentless research gestures

Empirical claims attributed to no one, in a series whose load-bearing commitment is falsifiability.

> "Research consistently shows that groups with moderate individual skill but high coherence outperform"
> "It is well established across neuroscience, psychology, and physiology."

Fix: name the finding concretely with a pointer to The Roots, or downgrade the claim to what the author personally stands behind. Never leave "research shows" floating.

---

## Tier 2: Budgeted. Hard caps, spent only on earned instances.

### 2.1 Negation-contrast scaffold. Max one per chapter, never two within ten paragraphs.

"This is not X. It is Y." and kin: 258 raw "is not a" hits, 138 full two-sentence instances. The corpus's signature move: deny a strawman, then assert the grander truth. In Vol IV it fires three times within a few paragraphs, repeatedly.

> "This is not a moral preference. It is thermodynamic reality applied to social systems."
> "Patient capital is not a nicety here. It is a precondition."
> "This is not a counsel of despair. It is a structural reality that any honest funding strategy must design around" (nearly identical to "This is not a conspiracy. It is a structural reality..." three paragraphs earlier)

Reserve the budget for first definitions of canonical terms where a real misreading exists ("Coherence is not a state. It is a capacity." is a keeper). Everywhere else apply the strawman test and state the positive claim with a concrete detail that makes the strawman impossible.

### 2.2 Apophatic litany. Max one per volume, at a deliberate definitional set piece.

"It is not X. It is not Y. It is not Z." stacks, mostly spent on product-disclaimer content repeated chapter after chapter.

> "It is not a score. It is not a ranking. It is a longitudinal portrait..."
> "It is not a business plan. It is not a manifesto in the political sense, though it makes political claims. It is not a spiritual text, though it touches the sacred..."

Fix: consolidate the disclaimers into one passage per volume (Vol I's "What This Is, and What It Is Not" is the canonical home). Elsewhere, one plain boundary sentence.

### 2.3 Question-reframe. Max one per volume.

"The question is not X. The question is whether Y." Forty-two "The question is" instances, 17 in reframe form.

> Keeper: "The question is not whether we might fail. The question is whether the failure we risk is preferable to the failure we guarantee by not trying."

Elsewhere: ask the better question directly. The dismissed question rarely needs to appear.

### 2.4 "Not because A, but because B". Max one per chapter.

Thirty-four full-form instances. Keep only where the negated cause is a belief real readers hold.

> Keeper: "not because talent is born there but because talent, once there, can find itself."
> Cut-candidate: "not because it is declared, but because" (nobody thinks declaration is the cause)

### 2.5 Punchline one-sentence paragraphs. Max one per section, never consecutive.

Vol I has 68 standalone paragraphs of twelve words or fewer in 11,574 words, one every 170 words, arriving before any pressure exists. Never split one sentence into fragment paragraphs ("Not as isolated crises." / "But as symptoms of a deeper mismatch.").

> What the device looks like when it works: "The currency can raise a ceiling. It can never lower a floor."

Spend the budget on the section's actual thesis. Fold the rest back into the preceding paragraph. Vol VI's fable register is exempt, but each instance must still earn its white space.

### 2.6 Triads. Max two list-triads per page, one anaphora set per chapter, no nesting, no verbatim reuse.

Three hundred plus "A, B, and C" lists; Vol I runs 5.4 per 1,000 words. Several triads recur word-for-word ("long-term reasoning, empathy, and nuance" three times). Triple anaphora nests triads inside triads.

> "the slow, patient, measurable process of being genuinely seen, genuinely matched, and genuinely held" (double-nested, plus triple intensifier)

Fix: keep all three items only when each adds distinct information. Otherwise cut to two or expand to four-plus concrete specifics. On a triad's second verbatim appearance, name one member concretely or point back to the first use. Exempt: the canonical dictionary triad "regulated, relational, and reality-responsive" and other canon phrasings listed in voice-and-canon.md.

### 2.7 Intensifier varnish. Per-chapter caps: "genuinely" 2, "precisely" 2, "actually" 3, "quietly" 2, depth words 3 combined.

"genuinely" 158 corpus-wide (61 in Vol III alone, twice in single sentences), "precisely" 94, "actually" 209, "deeper/deepest" 151. In a series about authentic presence, the sincerity adverb is especially corrosive: it asserts what the prose should demonstrate.

> "To match people by who they genuinely are, the network must first be able to recognize who they genuinely are"

Default fix is deletion; the sentence almost always survives. Where a real contrast with fake versions is intended, name the fake version concretely. Depth words become the actual relation: earlier, causal, structural, physiological, older.

### 2.8 Abstract-noun stacking. Max one of {architecture, infrastructure, capacity, substrate, mechanism, coordination, coherence} per sentence, outside formal definitions.

"architecture" 568, "infrastructure" 256, "capacity" 221, "substrate" 153, "mechanism" 148. Sentences chain three or more with no image or actor.

> "the layered account of human capacity that the Providence architecture requires"

Fix: "the capacity to X" becomes "can X" with a named subject. "The quality of X" (60 instances, cap 3 per chapter) becomes the observable behavior: "how carefully they listened", not "the quality of attention they bring". "Substrate" is reserved for its term-of-art sense. Chapter titles stop reusing "The Architecture of ___". The target shape is one canonical abstraction anchored to one concrete, testable image: "Trust is the substrate of coordination; trust falls precisely as leverage rises" earns both of its budget words.

### 2.9 "It is the..." resolution cadence. Target a two-thirds reduction in Vol III (60 hits).

The resolution clause of the negation scaffold: 201 corpus-wide. Distinct concepts all resolve into the same syntactic music.

> "It is the mechanism through which the constitutional principles either become real or remain aspirational."

Fix: vary the syntax. Re-name the subject ("The ledger is the layer..."), lead with the concrete function, or resolve into an example.

### 2.10 Superlatives. "One of the most" max one per volume, with a falsifiable comparison class.

Twenty-five "one of the most" instances; prayer, ritual, the scientific community, and vagal-tone research are each "one of the most powerful/sophisticated/durable/studied" things in history.

Fix: state the specific achievement ("monasteries kept libraries alive through two collapses") and let the reader do the superlative. "Profound" 1 per volume; "sacred" only for literally religious referents; "luminous" 2 per volume and only in Vols VI, VII, IX.

### 2.11 Agentless openers. "There is a / There is something" max two per chapter.

Forty-one "There is a" openers, plus "a kind of" (22) and "a way of" (27): gesturing at categories instead of naming members.

Fix: promote the buried noun to subject and give it a verb. Exception: openers that immediately land in the body ("There is a particular quality of exhaustion that does not lift with rest." is a keeper).

### 2.12 Self-reference. One orientation or register note per volume.

Two hundred plus "this book / this volume" instances. The register notes are a series convention and stay; the running self-narration goes.

> "And here the book can finally say the thing it has been holding since the Seed."

Fix: convert self-description into the thing described. Delete sentences whose only content is what the book is doing.

### 2.13 "This is why". Max two per chapter.

Causal connective asserting linkage without showing it (7 in Vol I alone). Fix: put cause and effect in one sentence ("Well-intentioned policies fail because...") or let the example show the link.

---

## Tier 3: Structural patterns. Fixed in the structural sweep, before line edits.

### 3.1 Cloned section templates

Vol IV ends all 28 chapters with "Coda: In Plain Terms" rotating through synonym openers ("In plain terms:", "The plain version:", "Plainly:", "Simply put:", "Said simply:"). Vol II anchors six chapters with a near-identical "What Providence Is and Is Not Doing" litany section.

Fix: keep every heading verbatim (deep-link IDs). Inside, stop the synonym rotation and let each coda earn its own first sentence; vary length aggressively (one sentence to a short story). In Vol II, keep the full treatment for two or three highest-stakes chapters and compress the rest to a single boundary sentence. The recurring bolded "In Plain Terms" headers themselves are an intentional device, not slop.

### 3.2 Duplicated and near-duplicated blocks

Cross-chapter copy-paste: Vol II repeats its money paragraph twice within 80 lines and its "same discipline" disclaimer in five chapters; Vol VII restates its Saturn exposition nearly verbatim in Parts I and II; Vol IX states its creed three times; Vol V duplicates "almost embarrassingly simple" six lines apart.

Fix: decide which instance owns the material (usually the first full treatment), keep it, and shrink echoes to a pointer or a single line. Deliberate refrains listed in voice-and-canon.md are exempt and must stay identical wherever they repeat.

### 3.3 Recap and daisy-chain paragraphs

Chapter-opening recaps ("we have argued/described/named": 19 in Vol III), "What this chapter argues, then..." closers, and causal daisy-chains ("Once X becomes possible, Y becomes possible. Once Y becomes possible...": "becomes possible" 13 times in Vol V).

Fix: delete recaps of an argument just made. Compress daisy-chains to the links that carry new information; keep the full chain only at its single canonical statement.

### 3.4 Uniform chapter silhouettes

All 13 Vol II chapters: epigraph, essay, recap, trailer. Vol V opens 14 of 20 chapters with the same two templates ("Every civilization..." or "There is a...").

Fix: break the silhouette deliberately. Keep the self-epigraph device where the Vol I line genuinely resonates; open other chapters with scene or data. Vary chapter endings: some on an image, some on a claim, at most one on a question.

### 3.5 Production scaffolding in published text

Vol I ships two blockquoted draft notes (lines 11 and 842). Vol III ships 12 "[verify]" citation placeholders. The master ledger (a working canon register with pending decisions) compiles alongside reader-facing volumes.

Fix: these are author decisions, not silent edits. Flag per volume-notes.md. The Vol III [verify] markers are described in-text as deliberate honesty devices; resolving them is a publication-readiness decision for the author.

### 3.6 Motif fatigue

Leitmotifs recalled until numb: "builders find builders" six times, Vol VIII's six motifs recalled three to ten times each, Vol IX's bolded Scale creed three times.

Fix: thin, never eliminate. Keep the strongest placement (usually first full statement plus one climactic return) and cut or vary the middle recurrences. Deliberate bookend refrains are exempt.
