// The editorial administration glyph: a page under revision, drawn as a bordered
// square with its top right corner open and a quill standing in the gap.
//
// The square is lucide's square-pen geometry, so the mark sits in the toolbar as
// a sibling of Search, Bookmark, and Settings rather than as an import from
// somewhere else. The quill replaces square-pen's ballpoint, which is what
// distinguishes editorial work from ordinary composition.
//
// The quill is authored at final scale rather than transformed from lucide's
// feather. Two earlier attempts are worth recording, because both fail in ways
// that are invisible until the icon is measured at 17px:
//
//   Uniform scale keeps the stroke honest but inherits the feather's own
//   proportion, which is square. It reads as a leaf lying across the page.
//
//   Rotation steepens the axis without touching the stroke, but rotating a
//   diagonal shape leaves its bounding box square as well, so it does not
//   actually gain height.
//
//   A non-uniform scale would give the height and thin the stroke along one axis
//   while thickening it along the other. At this size that reads as a drawing
//   error, not a style.
//
// Drawn directly, the quill is 10.1 wide by 14.4 tall, so it stands rather than
// leans, and every stroke stays at the 2 the rest of the toolbar uses.
export function EditorialAdminMark({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M21 2.6c1.8 3.6 1.4 7.4-1 10.2-1.4 1.7-3.4 2.7-5.8 2.8 1.3-3.2 3.6-7.9 6.8-13z" />
      <path d="M21 2.6c-3 4.6-6.3 9.4-9.8 14.4" />
      <path d="M20 11.2h-4.3" />
    </svg>
  );
}
