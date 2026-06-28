---
name: coherence-manuscript-import
description: Import and update Coherence Thesis manuscripts from Word documents through the repository review workflow. Use when asked to seed a new manuscript, compare a revised .docx draft, preserve stable section IDs, apply reviewed import output, validate overview references, or regenerate manuscript data.
disable-model-invocation: true
---

# Manuscript Import

Word documents are import inputs. Repository Markdown is canonical after review.

## Workflow

1. Confirm the source Word document path and inspect the current git state.
2. Confirm canonical Markdown and generated data are currently valid:

```bash
npm run manuscripts:compile
npm run manuscripts:validate
```

3. Create a draft import:

```bash
npm run manuscripts:import -- --source /absolute/path/to/manuscript.docx
```

4. Compare draft output to canonical Markdown:

```bash
npm run manuscripts:diff-import -- --draft artifacts/imports/<import-id>/content/manuscripts
```

5. Review the import report and diff report. Summarize added, changed, unchanged, and removed sections when the change is meaningful.
6. Apply only after review:

```bash
npm run manuscripts:apply-import -- --draft artifacts/imports/<import-id>/content/manuscripts --force
```

7. Regenerate and validate:

```bash
npm run manuscripts:compile
npm run manuscripts:validate
npm run readme:update
npm run test
```

8. Run `npm run build` when route data, overview references, or generated catalog data changed.
9. Commit and push the reviewed manuscript update to `origin/main`.

## Stable IDs

- Preserve existing section IDs when the section is conceptually the same.
- Create a new ID only for genuinely new sections.
- If a section is split or merged, document the migration in the import report notes or commit message.
- Treat removed sections as a review event before applying.

## Failure Handling

- Stop on duplicate IDs, empty bodies, missing frontmatter, broken overview references, bad ordering, or stale generated data.
- If the parser collapses or fragments the document, fix the importer or draft output before applying.
- Never normalize a broken import into canonical Markdown.
