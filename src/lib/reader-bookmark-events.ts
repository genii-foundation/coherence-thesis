// The selection island knows when a passage becomes bookmarkable and when one
// is saved; the toolbar island owns the control that answers both. Neither
// imports the other, so they meet at window events, which is how every other
// cross-island signal here works.

// A selection just became large enough to bookmark. An invitation, not a
// result: the control turns, but never shows the filled glyph, because nothing
// has been stored yet.
export const readerBookmarkOfferedEvent = "coherence:reader-bookmark-offered";

// A bookmark was actually stored.
export const readerBookmarkSavedEvent = "coherence:reader-bookmark-saved";

// Both states are one full turn. They differ in what is behind the glyph and
// how fast it gets there, not in how many times it spins. Kept here so the
// timers that clear the state cannot drift from the stylesheet.
export const bookmarkOfferedTurnMs = 760;
export const bookmarkSavedTurnMs = 620;

export function announceBookmarkOffered(): void {
  window.dispatchEvent(new Event(readerBookmarkOfferedEvent));
}

export function announceBookmarkSaved(): void {
  window.dispatchEvent(new Event(readerBookmarkSavedEvent));
}
