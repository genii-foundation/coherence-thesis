# Semantic Cross-References

Semantic cross-references connect a reviewed phrase in one manuscript section to the current destination of another section. They do not rewrite canonical prose, and they do not freeze headings or public routes.

## Authority

The current registry is `editorial/sources/corpus/semantic-links.json`. It contains two kinds of reviewed records:

- Concepts map editorial labels to a target continuity identity and a route level.
- Occurrences identify one exact phrase in one stable source section and paragraph. Each occurrence is either an approved link or a reviewed exclusion.

The registry stores no destination URLs. During compilation, each target continuity identity must have exactly one current owner. The compiler then derives the current section, chapter, part, or volume route from that owner.

## Candidate audit

Run the advisory audit across the corpus or one volume:

```bash
npm run editorial:semantic-links:audit
npm run editorial:semantic-links:audit -- --volume volume-01
```

The audit writes deterministic JSON and Markdown reports under `generated/reports/semantic-links/`. Reports include source context, canonical line and column, confidence signals, the current target owner and route, and any automatic exclusion reason.

High confidence is still a request for editorial judgment. Emphasis and exact title language are evidence, not permission. Plain lowercase language remains visible as a low confidence candidate. Headings, code, images, existing links, structural labels, and self-references are excluded from automatic conversion.

## Review

Create a decision file with the report hash, review date, and one decision with a rationale for each candidate under review. The review command is a dry run unless `--write` is present:

```bash
npm run editorial:semantic-links:review -- \
  --report generated/reports/semantic-links/candidates.json \
  --decisions generated/reports/semantic-links/review.json

npm run editorial:semantic-links:review -- \
  --report generated/reports/semantic-links/candidates.json \
  --decisions generated/reports/semantic-links/review.json \
  --write
```

There is no bulk approval option. A reviewed exclusion is durable, which prevents the same metaphorical or ordinary use from returning as fresh noise in every audit.

## Compilation guarantees

The compiler calculates canonical prose hashes, paragraph anchors, progress identities, word counts, and audio identities before it applies reviewed links. A route or heading change can therefore update a link without pretending that the spoken or written prose changed.

Compilation fails when:

- A registry record is malformed or duplicated.
- A source or target continuity identity has no current owner or more than one owner.
- A reviewed paragraph, phrase, or occurrence no longer exists exactly as approved.
- A requested route level cannot be derived from the current hierarchy.
- Two approved links overlap.

Reader links are server rendered and remain usable without JavaScript. Nested emphasis remains intact, and audio word positions count visible label text without counting Markdown syntax or destination URLs.

## Validation

Run focused validation while reviewing:

```bash
npm run editorial:semantic-links:validate
npm run manuscripts:validate
```

The full repository gate includes semantic link validation. Use `npm run validate:ui` when a change can affect rendered manuscript behavior or navigation.
