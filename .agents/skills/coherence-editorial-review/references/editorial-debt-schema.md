# Editorial Debt Schema

Editorial debt records every known inconsistency, unfulfilled promise, unresolved claim, missing source, canon conflict, literary weakness, link obligation, audio obligation, or technical limitation discovered during manuscript work.

Store one durable Markdown file per item in `editorial/debt/items/`. Never delete an item after publication. Mark it resolved, record the paydown, and keep it as evidence.

## Required frontmatter

- `id`: the next contiguous identifier in the form `CTD-0001`
- `title`: a concise description of the obligation
- `status`: `open`, `query`, `deferred`, or `resolved`
- `kind`: `audio`, `canon`, `citation`, `factual`, `link`, `literary`, `logical`, `promise`, `structural`, `technical`, or `terminology`
- `severity`: `critical`, `high`, `medium`, or `low`
- `scopes`: a nonempty JSON-style string array such as `["volume-1", "volume-3"]`
- `sources`: a nonempty JSON-style string array of repository paths, optionally followed by a Markdown fragment
- `discovered`: discovery date in `YYYY-MM-DD` form
- `updated`: date of the latest history entry
- `resolved`: resolution date for resolved items, or an empty value
- `discoveredIn`: batch, review, audit, or user decision that exposed the debt

The filename begins with the lowercase ID and a useful slug, such as `ctd-0001-missing-roots-bibliography.md`.

## Required body

Every item contains nonempty `Debt`, `Evidence`, `Paydown criteria`, and `History` sections. History entries use `- YYYY-MM-DD:` and remain chronological. A resolved item also contains a nonempty `Resolution` section.

## Workflow

1. Search `editorial/debt/index.md` before opening a new item.
2. Add a new item as soon as the obligation is discovered. Do not wait for the end of the batch.
3. Use the next ID. IDs stay contiguous so deletion fails validation.
4. Cite the debt ID in the batch review record and any pull request that carries or pays it down.
5. When work resolves the debt, change its status to `resolved`, set the dates, explain the resolution, and append history. Never remove the file.
6. If later evidence shows that a resolved issue still exists elsewhere, reopen the same ID. Change the status back to `open` or `query`, clear the `resolved` date, preserve the earlier paydown under a `Partial paydown` section, and append the new evidence to history. Do not open a duplicate item.
7. Run `npm run manuscripts:debt:update` after any item change.
8. Run `npm run manuscripts:debt` to validate records and generated index freshness.

Debt is not permission to publish a known critical defect. The register makes obligations durable. Publication gates still decide what may ship.
