---
name: coherence-build-feature
description: Build Coherence Thesis site features in the canonical repository, use an isolated feature branch unless the user explicitly requests main, validate with the project gates, push a focused branch, open or update a pull request, share a clickable preview link, then wait for explicit preview approval before publishing or merging. Use for reader UI, manuscript navigation, progress, audio, overview, import tooling, generated catalog behavior, styling, tests, and project docs.
disable-model-invocation: true
---

# Build Feature

Implement a complete feature or fix in the Coherence Thesis repository, validate it, then commit, push, and open or update a focused pull request. Work on `main` only when the user explicitly asks for a direct main change. Never merge or publish the pull request until the user explicitly confirms that the preview looks good.

## Workflow

1. Read `AGENTS.md`, `README.md`, and the files that own the requested surface.
2. Confirm the request is clear before writing code. Ask concise clarifying questions when the desired behavior, affected surface, or acceptance criteria are ambiguous.
3. Check `git status --short --branch`. Preserve unrelated local changes.
4. Before creating a new worktree or branch, refresh the remote base:

```bash
git fetch origin main
git rev-parse origin/main
```

If the fetch fails, stop and report the failure. Do not create a feature branch from a stale local `main`, stale `origin/main`, or an existing feature worktree. Create the dedicated branch and worktree from the freshly fetched `origin/main` by default:

```bash
git worktree add -b <type>/<slug> <worktree-path> origin/main
```

Stay on `main` only when the user explicitly requests it. In that case, verify local `main` is clean and current with `origin/main` before editing. If it is behind, fast-forward it before editing. If it cannot be fast-forwarded cleanly, stop and report the blocker.
5. Search for an existing component, hook, helper, script, fixture, or test pattern before adding a new one.
6. Keep manuscript source rules intact:
   - Source manuscripts live in `sources/manuscripts/`.
   - Generated canonical reader sections live in `content/manuscripts/`.
   - Generated browser data lives in `public/data/`.
   - Do not edit generated manuscript or catalog data by hand.
7. Capture implementation context while working:
   - What user problem or publishing constraint the change addresses.
   - Which existing patterns or primitives were reused.
   - Why any new component, hook, helper, script, or test was created.
   - Which alternatives were considered and why they were rejected.
   - Any product, accessibility, manuscript, performance, or compatibility tradeoffs.
8. Implement the smallest coherent slice that handles the request end to end.
9. Before shipping, verify every exported function, class, component, hook, or script entry point added in the change has an appropriate consumer.
10. Use focused checks while iterating:
   - `npm run manuscripts:compile` after manuscript or overview edits
   - `npm run manuscripts:validate` after manuscript or overview reference changes
   - `npm run test` after pure TypeScript or state helper changes
   - `npm run test:e2e:fast:desktop` for narrow desktop UI checks while iterating
   - `npm run test:e2e:fast` after reader navigation, toolbar, progress, audio, or responsive UI changes while iterating
   - `npm run audio:publish-manifest -- --run-id <run-id> --version <version> --project-ref <supabase-project-ref>` without `--upload` after manuscript changes that may make hosted audiobook clips stale
11. If multiple user revisions are queued, implement all clear queued tasks on the same focused branch before running the deepest validation pass. Use focused checks during the queue only when they answer a specific implementation question. Run `npm run validate` and `npm run test:e2e` once after the queue is empty unless the user explicitly narrows validation.
12. Run `npm run readme:update` when stats, package metadata, recent commits, generated catalog state, or development status changed.
13. Launch a local development preview from the feature worktree on a fresh random port after the feature is implemented. Do this even when another preview is already running. For visible UI work, do not open or update the pull request until the preview is running, unless the user explicitly says not to launch one.
14. Run `npm run validate` before committing.
15. After refreshing `origin/main`, run `npm run updates:generate`. Treat `src/generated/updates.json` as the required Updates fallback cache, not disposable build churn. Commit it whenever it advances through the current main base.
16. If the change affects browser behavior, run `npm run test:e2e` before committing unless the user explicitly narrows the validation target.
17. Review the final diff before staging. Confirm the diff is focused, generated files are expected, no debug logs or temporary files remain, and unrelated local changes are left alone.
18. Stage the complete feature, commit with a Conventional Commit title, push the branch, and open or update a focused pull request. If the user requested a direct main change, commit directly on `main` and do not open a pull request unless asked.
19. As soon as the preview is ready, send the exact URL as a Markdown link in a user-visible update.
20. Ask the user whether they are ready to publish or what follow-on revisions are needed. Do not merge, publish, or mark the pull request ready for merge until the user explicitly confirms that the preview looks good.
21. If the user requests revisions after preview review, implement them on the same focused branch, validate again, push the update, and ask for preview approval again.
22. After the user explicitly confirms the preview looks good and asks to publish or merge, refresh the branch against the current base, regenerate and commit `src/generated/updates.json` if it changed, then run the production build gate before merging. Use `npm run build` at minimum, or the repository production build command if the package scripts change. Do not merge a PR after conflict resolution, rebase, or branch refresh until that production build has succeeded on the final branch contents.
23. Merge the pull request only after the final production build succeeds. After merging, confirm the resulting production deployment or deployment check succeeded. For Vercel-backed work, inspect the deployment linked to the merge commit or project dashboard, then verify that production `/updates/` contains the merged pull request or commit SHA. If the deployment fails or Updates is stale, treat it as a continuation of the merge task: create a focused fix branch, reproduce or explain the failure locally with the production build, push a fix PR, merge it, and repeat until the production build, deployment, and Updates history are green.
24. Complete the publish or merge workflow only after the merge commit, production build, deployment, and live Updates head are confirmed.

## Preview

Use a local development preview when the user should inspect the feature or iterate on revisions. Run it from the feature worktree unless the user explicitly requested direct main work, and always choose a new unused local port instead of reusing the default port.

```bash
PORT=$(node -e "const net=require('node:net');const server=net.createServer();server.listen(0,'127.0.0.1',()=>{console.log(server.address().port);server.close();});")
npm run preview:dev -- --hostname 127.0.0.1 --port "$PORT"
```

The preview URL is `http://127.0.0.1:$PORT`. Keep the preview process running for the user, open the URL in a browser when requested, and include the exact URL in closeout and pull request preview section. Check the preview process with `npm run preview:dev:status -- --port "$PORT"` before closeout. Stop it with `npm run preview:dev:stop -- --port "$PORT"` only when the worktree is being removed or the user asks to shut it down. Do not ship a visible UI pull request whose preview section says the preview was not launched. Use the static preview only for final publish verification or when the user specifically asks for a production build preview:

```bash
npm run build
npm exec -- serve out -l "$PORT"
```

As soon as any preview is ready, send the exact URL to the user as a Markdown
link in a user-visible update, for example
`[Local preview](http://127.0.0.1:$PORT)`. Include the same URL again in the
final closeout when the preview is still running.

After the initial implementation is complete, use this review checkpoint before
publishing or merging:

```text
Preview: [Local preview](http://127.0.0.1:$PORT)

Does this preview look good to publish, or are follow-on revisions needed?
```

Do not merge or publish a pull request before the user explicitly confirms that
the preview looks good.

## UI Rules

- Keep basic reading functional without JavaScript.
- Keep toolbar controls reachable on desktop and mobile.
- Keep dropdowns inside the viewport with internal scrolling when needed.
- Match existing typography, radius, color, spacing, and focus states.
- Do not add hover lift, bounce, glossy controls, or one-off gradients.
- Use the shared connected radio pattern for radio controls: `settings-radio-section`, `settings-radio-group`, and `settings-radio-option`.
- Use `Number.toLocaleString()` or `Intl.NumberFormat` for displayed counts.
- For transformed SVG progress paths, measure the visible rendered geometry after all SVG and CSS transforms. Do not accept source path ratios or dash attributes as visual proof.
- Keep temporary comparison routes available through explicit preview approval when they are the clearest way to review multiple visual states. Remove them only after approval and rerun the affected browser coverage.

## Pull Request Quality

Every pull request description must explain not only what changed, but why the change exists and why this shape was chosen. The body must begin with `(AI Generated).`

If a diff changes a shared UI surface that is not named by the PR title and summary, split that change into a focused branch before review. Broad validation does not make an unrelated product change part of the stated scope.

Start from `.agents/templates/pull-request-description.md` by default:

```markdown
(AI Generated).

## Summary
- ...

## Why
- ...

## Decisions
- ...

## Implementation Notes
- ...

## Validation
- ...

## Preview
- ...

## Risks and Follow-ups
- ...
```

Include these details whenever they apply:

- The user request, bug, publishing need, or UX gap that prompted the change.
- The affected routes, components, generated files, scripts, and data flows.
- Why each new component, hook, helper, script, test fixture, or generated artifact was created instead of reusing an existing one.
- Existing primitives and patterns that were reused.
- Alternatives considered, with the concrete reason they were not chosen.
- Accessibility, responsive layout, no-JavaScript reader behavior, manuscript link preservation, performance, cache, or browser compatibility considerations.
- Audio manifest considerations, including whether hosted clips still match current `audioVersionId` values and whether a new immutable Supabase version path is required.
- Validation commands run, their outcomes, and any useful manual preview or screenshot evidence.
- Known limits, residual risk, and follow-up work that should not block the pull request.

Keep the PR title concise and human. Do not include tool or agent identifiers in branch names, PR titles, commit titles, or PR prose beyond the required body prefix.

## Commit Quality

Make every commit reviewable on its own:

- Keep one coherent concern per commit.
- Use a Conventional Commit title that names the user-visible or maintainer-visible change.
- Do not mix formatting churn, generated output, or dependency changes into an unrelated feature commit.
- Include generated artifacts only when the repository workflow requires them.
- Make sure validation evidence in the closeout and pull request matches the actual commands run.
- If validation fails, either fix the cause or leave a precise blocker with the failing command and relevant output.

## Closeout

Close out with the commit hash, pushed branch, pull request URL when one exists, validation commands, production build evidence, post-merge deployment status, and a Markdown link to the preview URL when a preview is running. If validation was skipped or narrowed, state exactly why. If the preview has not been approved yet, say that the pull request is waiting for user preview approval before merge or publish.
