# Compression Calibration Record

## Purpose

The first nine volume editorial pass reduced the corpus from 202,575 words to 105,934 words, a 48 percent reduction. This record captures where that pass removed or diminished material that should have survived, and what the guidelines should have produced instead.

It is the author's instrument. Each entry names a specific loss, shows the text, and states the correct treatment. The entries drive revisions to `editorial/standards/editorial.md` and to individual voice cards. Nothing here edits a manuscript directly.

This record is durable editorial state. It is not generated, and no build or preparation command may rewrite it.

## Status

- Calibration set: open for selection
- Entries populated: 1 of a target 6 to 10
- Guideline rounds completed: 0
- Set frozen: no

Freeze the set before the first calibration round. A set that changes between rounds measures nothing.

## Compression profile

Measured against each batch's immutable `baseline.md`.

| Volume | Baseline words | Current words | Change | `remove` rate | `keep` rate |
| --- | --- | --- | --- | --- | --- |
| I | 11,176 | 8,285 | -26% | 19% | 24% |
| II | 35,243 | 32,465 | -8% | 3% | 26% |
| III | 46,718 | 19,881 | -57% | 28% | 1% |
| IV | 47,847 | 15,275 | -68% | 44% | 6% |
| V | 23,675 | 10,246 | -57% | 37% | 7% |
| VI | 7,620 | 4,582 | -40% | 18% | 18% |
| VII | 10,474 | 5,014 | -52% | 31% | 9% |
| VIII | 14,985 | 7,289 | -51% | 27% | 13% |
| IX | 4,837 | 2,897 | -40% | 14% | 9% |
| Corpus | 202,575 | 105,934 | -48% | | |

Volume II is the conservative control. It is the only volume edited at a proportion that may already be acceptable, so it belongs in the calibration set as a check against overcorrection.

## Selecting entries

Choose for diversity of failure, not only severity. A useful set contains:

- Two or three losses that damaged the work, the primary complaint
- One or two removals that were correct, so revised rules do not overcorrect
- At least one lyrical, ceremonial, or liturgical passage, where flattening looks different from truncation
- At least one Volume II passage as the conservative control

### Finding candidates

Sections deleted in full, by volume:

```bash
node -e "const fs=require('fs');const b=process.argv[1];const rows=fs.readFileSync(b+'/sentence-ledger.jsonl','utf8').trim().split('\n').map(JSON.parse);const s={};for(const r of rows){s[r.sectionId]=s[r.sectionId]||{n:0,rm:0};s[r.sectionId].n++;if(r.disposition==='remove')s[r.sectionId].rm++}console.log(Object.entries(s).filter(([,v])=>v.rm===v.n&&v.n>=8).map(([k,v])=>k+'  ('+v.n+' sentences)').join('\n'))" editorial/reviews/volumes/volume-04/2026-07-09-production-pass
```

Sections ranked by removal rate across the whole corpus, which surfaces heavy cuts that fell short of full deletion:

```bash
node -e "const fs=require('fs'),path=require('path');const out=[];for(const v of fs.readdirSync('editorial/reviews/volumes').sort()){const base=path.join('editorial/reviews/volumes',v);const batch=fs.readdirSync(base)[0];const rows=fs.readFileSync(path.join(base,batch,'sentence-ledger.jsonl'),'utf8').trim().split('\n').map(JSON.parse);const s={};for(const r of rows){s[r.sectionId]=s[r.sectionId]||{n:0,rm:0};s[r.sectionId].n++;if(r.disposition==='remove')s[r.sectionId].rm++}for(const [k,x] of Object.entries(s))if(x.n>=10)out.push([v,k,x.n,x.rm,x.rm/x.n])}out.sort((a,b)=>b[4]-a[4]);console.log(out.slice(0,25).map(r=>r[0]+'  '+r[1]+'  '+r[3]+'/'+r[2]+'  '+Math.round(r[4]*100)+'%').join('\n'))"
```

Note when reading ledgers: a `remove` record always has empty `proposedText` and `resultLocations` arrays, because the schema requires it. Empty result locations are therefore not evidence of anything. The signal to look for is a section where every sentence carries `remove`, or a high removal rate relative to its neighbors.

## How to fill an entry

Author fields carry your judgment. Agent fields are filled from the ledgers before we draft any rule change. Leave agent fields blank when you add an entry.

Keep the corrected treatment concrete. "Restore this" is weaker than "keep sentences 1 through 6 verbatim and cut sentence 12." A rule can be drafted from the second and not from the first.

The verdict uses the vocabulary already defined in the editorial plan: too light, correct, or too strong.

Punctuation rule applies here as it does in the manuscripts. No em dashes, no en dashes, no double hyphens used as punctuation.

---

# Entries

## Entry 1. Volume IV, The Governance Architecture

**Status:** worked example, author confirmation needed

### Identity

- Volume: IV
- Section ID: `v04-the-governance-architecture`
- Batch: `editorial/reviews/volumes/volume-04/2026-07-09-production-pass`
- Baseline: `baseline.md`, sha256 declared in `review.json`

### What the pass did

*Agent field.*

All 12 sentences carry `disposition: remove`, and no sentence in the section was tightened, recast, merged, or moved. The section was deleted whole rather than absorbed into a neighbor. Reason codes recorded on these records:

- `developmental-compression-removal-reviewed`
- `independent-reviews-exposed-unresolved-authority`
- `legal-review-required`
- `implementation-status-verification-required`
- `evidence-verification-required`

Review status is split between `reviewed` and `query`, so part of this deletion was never settled.

### Baseline text

> How Distributed Sovereignty and Planetary Coordination Actually Coexist
>
> Volume III's Part II established the philosophical and constitutional foundations of Providence's governance: the Providence Principle, the Living Constitution, the distinction between platform and protocol, the ten constitutional principles.
>
> Those foundations were established with the depth they required, and establishing them was the necessary first work.
>
> Volume IV's Part III makes them operational.
>
> The principles are no longer the question.
>
> The mechanisms are.
>
> The movement from principle to mechanism is not a diminishment.
>
> It is where the principles become real.

### Current text

Nothing. The section does not exist in the current manuscript.

### What was lost

*Author field. Name the loss in the work's own terms.*

This passage is a structural hinge. It tells the reader that Volume III argued principles and Volume IV will build mechanisms, and it defends that movement against being read as a retreat into administration. Removing it leaves Volume IV's Part III opening on mechanism with no statement of why mechanism follows principle.

### Why it matters

*Author field.*

### Correct treatment

*Author field. Be specific enough that a rule can be written from it.*

### Verdict

*Author field: too light, correct, or too strong.*

### Rule that authorized the loss

*Agent field.*

Two candidates, both to be confirmed with you:

1. Section 4.3, false antithesis, flags the construction `This is not X. It is Y`. The final two sentences match that shape exactly. The rule reads "Keep a contrast only when both sides are plausible and the distinction matters." Here both sides are plausible and the distinction is the section's entire point, so the exception should have applied and did not.
2. Section 4.23, meta claims about the text, flags `the previous section established` and similar wayfinding. The rule already carves out "genuine wayfinding in a long philosophical work." A nine volume work is the paradigm case, and the carve out did not hold.

The pattern to test across other entries: the catalog's exceptions are stated as prose qualifications inside rules whose main clause instructs removal. Under production pressure the main clause appears to win.

### Proposed guideline change

*Agent field, drafted after your verdict.*

- Target: global standard or voice card
- Change:
- Predicted effect on this entry:

---

## Entry 2

### Identity

- Volume:
- Section ID:
- Batch:

### What the pass did

*Agent field.*

### Baseline text

> 

### Current text

> 

### What was lost

*Author field.*

### Why it matters

*Author field.*

### Correct treatment

*Author field.*

### Verdict

*Author field.*

### Rule that authorized the loss

*Agent field.*

### Proposed guideline change

*Agent field.*

---

## Entry 3

### Identity

- Volume:
- Section ID:
- Batch:

### What the pass did

*Agent field.*

### Baseline text

> 

### Current text

> 

### What was lost

*Author field.*

### Why it matters

*Author field.*

### Correct treatment

*Author field.*

### Verdict

*Author field.*

### Rule that authorized the loss

*Agent field.*

### Proposed guideline change

*Agent field.*

---

# Calibration rounds

Each round re-runs the editorial pass across the frozen calibration set only, starting from the immutable baselines, under the current draft of the guidelines. Change one lever per round where possible, or improvement cannot be attributed.

| Round | Date | Guideline change under test | Entries judged correct | Notes |
| --- | --- | --- | --- | --- |
| 0 | 2026-07-09 | original standard | 0 | the pass recorded above |
| 1 | | | | |
| 2 | | | | |

Round 1 begins only after the set is frozen and every entry carries an author verdict.

# Guideline change ledger

Every accepted change, with the entries that justified it. A change with no entry behind it does not belong in the standard.

| Change | Target file | Justified by | Round introduced | Kept |
| --- | --- | --- | --- | --- |
| | | | | |

# Exit criteria

The calibration is complete when every entry in the frozen set carries the verdict `correct` under the current guidelines, and a re-run of Volume II under those same guidelines does not exceed its original 8 percent reduction by a margin you accept.

Only then does the full corpus re-run begin.
