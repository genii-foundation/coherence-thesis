# Working Revision Session

A working revision session is transient collaboration state for one passage. It gives the editor a page to watch while the chat asks for direction, prepares variants, and iterates toward approval.

Working sessions live at:

```text
generated/revision-sessions/<section-id>.json
```

The entire directory is ignored. A working session is not editorial evidence, a ruling, a manuscript change, or permission to create any of them.

## Why working state is separate

The editor must define the desired change before the machine proposes language. Creating a calibration record first reverses that authority: it lets the machine diagnose the passage, choose the problem, and begin accumulating durable evidence before the editor has said what the session is for.

The working page may appear before the editor answers because it records no editorial conclusion. Its first useful state is a question: what should change?

## Required fields

- `schemaVersion`: integer, currently `1`
- `sectionId`: the canonical continuity identity
- `editorialId`: the owning volume
- `currentHeading`: the current section heading
- `sourceHref`: the current reader route
- `paragraphAnchor`: the selected paragraph anchor, or `null` for the whole section
- `selectedPassage`: the current canonical passage being revised
- `baseCheckpointId`: the immutable manuscript checkpoint from which this
  editorial line descends
- `status`: `awaiting-intent`, `drafting`, `review`, `approved`, or `recorded`
- `directions`: the editor's instructions in the order received
- `variants`: the current comparison set
- `approvedVariant`: the approved label, or `null`
- `durableRecordPath`: the eventual durable evidence path, or `null`
- `createdAt`: session creation time
- `updatedAt`: most recent working-state change

Each direction contains `text` and `createdAt`.

Each variant contains:

- `label`: its visible identity
- `derivedFrom`: its parent label when it refines another variant
- `title`: a short description of the approach
- `text`: the proposed passage as an array of paragraphs
- `reasoning`: specific gains, costs, and unresolved choices
- `status`: `candidate`, `rejected`, or `approved`

## Lifecycle

1. `start` creates the page with `status: awaiting-intent`. It does not create variants.
2. The chat shares the page and asks the editor what should change.
3. `direction` appends the editor's answer and moves the session to `drafting`.
4. The agent reads the current passage, its base checkpoint, the permanent
   original, standard, effective voice card, neighboring prose, and relevant
   ledgers. It then publishes at least two distinct variants and moves the
   session to `review`.
5. The editor may request another round. Each new direction returns the session to `drafting`.
6. Only the editor can choose a final variant. `approve` marks exactly one variant approved.
7. After approval, the agent may update the manuscript and create durable editorial evidence. `recorded` links the working page to that evidence after it exists.

## Commands

Open the working page before asking for intent:

```bash
npm run editorial:revision -- start --section <section-id> --anchor <paragraph-anchor>
```

Record editor direction:

```bash
npm run editorial:revision -- direction --section <section-id> --request-file <path>
```

Publish a complete variant array:

```bash
npm run editorial:revision -- variants --section <section-id> --file <path>
```

Mark the editor's approved variant:

```bash
npm run editorial:revision -- approve --section <section-id> --variant <label>
```

After the durable evidence exists:

```bash
npm run editorial:revision -- recorded --section <section-id> --record-path <path>
```

The command prints the local administrative route after every transition. Share that route in the chat.

## Authority boundary

Generated working state may preserve the editor's words so the next round follows them. It may not be cited as a ruling or generalized into editorial guidance.

Approval authorizes the agent to implement and document the approved revision. It does not automatically make every preference corpus scoped. Record section, volume, and corpus implications deliberately under the calibration record schema.
