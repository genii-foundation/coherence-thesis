# Application Instructions

This file governs application code under src/. Repository-wide policy remains in the root AGENTS.md.

## Reader contract

- Render manuscript text on the server so reading remains functional without JavaScript.
- Use client islands only to enhance progress, audio, search, menus, preferences, and optional sync.
- Keep local reading progress private by default.
- Do not add analytics, mandatory accounts, remote reading history, or new sync behavior without explicit product approval.
- Read canonical content through the generated catalog and browser payload interfaces. Application code must not write editorial or publishing state.

## Interface

- Reuse existing components, hooks, state helpers, and style patterns before creating new ones.
- Extract a shared primitive when two surfaces need the same behavior.
- Keep toolbar controls reachable at supported desktop and mobile sizes.
- Keep menus, dialogs, palettes, and overlays inside the viewport with internal scrolling when needed.
- Match established typography, radius, button hierarchy, focus states, and manuscript colors.
- Use locale-aware number formatting for reader-facing counts.
- Keep long titles from overlapping adjacent controls.
- Verify rendered geometry for transformed SVG, canvas, and compositor-sensitive interfaces.

## Content and licensing

- Keep substantial editorial prose in the editorial source tree, not embedded in application modules.
- Application code uses the software license.
- Imported manuscript prose, overview text, owned artwork, and other creative assets retain the content license described in NOTICE.
- Generated application catalogs are disposable and untracked.

## Validation routing

- Run focused unit tests for pure application logic.
- Run fast desktop browser checks while iterating on a narrow visual change.
- Run the broader fast browser suite for navigation, toolbar, progress, audio, or responsive behavior.
- Run the full repository validation before commit.
- Run the complete browser suite when the change can affect browser behavior.
- For visible changes, provide a fresh preview from the feature worktree and verify the actual rendered surface.
