---
id: CTD-0112
title: Version provenance records commits that did not introduce the content
status: open
kind: technical
severity: high
scopes: ["corpus"]
sources: ["scripts/manuscripts/versions.ts", "publishing/continuity/version-provenance.json", "scripts/manuscripts/validate.ts"]
discovered: 2026-07-30
updated: 2026-07-30
resolved:
discoveredIn: corpus/2026-07-30-baseline-re-render
---

## Debt

`publishing/continuity/version-provenance.json` is a durable continuity record that states, for each section, the commit in which its current content first appeared. For most sections it states something that is not true.

Of 517 entries, 324 are attributed to `c4723b7a2`, a documentation commit whose entire diff is fourteen added lines in `AGENTS.md`. It touched no manuscript, no generated section, and no prose of any kind. It cannot be where 324 sections first acquired their current text. A further 137 entries are attributed to `1523af320`, which is not a valid object in this repository. Five more are attributed to `4d134acb2`, a commit that changed a reporting script and four calibration records.

That is 466 of 517 entries, about 90 percent, whose stated provenance is either impossible or unresolvable.

## Mechanism

`firstCommitForCurrentHash` in `scripts/manuscripts/versions.ts` walks the commit log for a section's path and looks for the first commit whose blob hashes to the section's current content. When it finds one, the answer is correct and useful. When it finds none, it falls back to `HEAD`:

```ts
if (!match) {
  const [commitSha = "", versionDate = ""] = runGit([
    "show", "-s", "--format=%H%x09%cI", "HEAD",
  ]).split("\t");
  return { commitSha, versionDate };
}
```

No match is the expected result whenever the content is uncommitted, which is the normal state while an editorial pass is running. So the fallback does not fire rarely. It fires for every section with pending edits, and it writes whatever commit happens to be at `HEAD` at that moment.

Two failure modes follow.

The record becomes false rather than absent. A missing entry is a question. An entry naming a real commit that does not contain the content is an answer, and a wrong one. Nothing downstream can distinguish the two, because the fallback produces a well formed entry indistinguishable from a genuine match.

And `npm run manuscripts:validate` requires an entry to exist for every section hash. The fallback is what lets that gate pass over uncommitted work. The gate reads as proof that provenance is known when it is proof only that a row was written.

The 137 entries pointing at an absent object suggest the record has also survived a history rewrite. A squash or rebase leaves entries naming commits that no longer exist, and nothing detects it, because nothing verifies that a recorded sha resolves.

## Why this surfaced now

Two agents were re-rendering different volumes in one shared worktree. One ran `manuscripts:versions` and found it had hashed the other agent's uncommitted prose and stamped it with its own commit sha. It reverted the change and reported it rather than letting the gate turn green.

That is the sharpest form of the problem. In a shared tree the fallback does not merely record an approximate commit, it attributes one agent's work to another agent's commit, and turns a failing gate green by fabricating the evidence the gate asks for.

The correct running order is also worth recording, since it was got wrong tonight: provenance derives from committed content, so it is commit, then `manuscripts:versions`, then `manuscripts:validate`. Running versions before committing is a no operation that reports success.

## Paydown

The values are derived and a regeneration on a quiet tree, after all editorial work is committed, produces correct entries for everything reachable in history. That is cheap and should happen regardless.

The mechanism needs an author decision, because the options trade differently and the choice affects the publication lifecycle rather than the prose.

- **Fail instead of guessing.** When no commit matches, stop and name the section. Correct, and it makes `manuscripts:validate` refuse to pass over uncommitted manuscript work, which is a real behavioural change to the gate.
- **Record the uncertainty.** Write the entry with an explicit pending marker instead of a sha, and let the gate decide what to do with it. Keeps the gate's current shape while making the record honest about what it does not know.
- **Verify recorded shas resolve.** Independent of the above, and it catches the 137 entries that a history rewrite orphaned.

C1. Does a version provenance entry mean the commit that introduced the content, or the commit at which the content was last observed? The record's name asserts the first and its behaviour implements the second.

C2. Should `npm run manuscripts:validate` pass while manuscript content is uncommitted?

C3. What check would have caught a fabricated entry, given that a fabricated entry is well formed and names a real commit?
