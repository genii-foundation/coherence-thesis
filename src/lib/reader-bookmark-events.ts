// The selection island saves a bookmark; the toolbar island owns the control
// that shows where it went. Neither should import the other, so they meet at a
// window event, which is how every other cross-island signal here works.
export const readerBookmarkSavedEvent = "coherence:reader-bookmark-saved";

// How long the toolbar trigger pulses after a save. Long enough to catch the
// eye of someone reading the toast, short enough not to become chrome. Motion
// preferences are honoured by the stylesheet, which neutralizes animation under
// prefers-reduced-motion and under the reader's own animations setting.
export const bookmarkPulseMs = 1_800;

export function announceBookmarkSaved(): void {
  window.dispatchEvent(new Event(readerBookmarkSavedEvent));
}
