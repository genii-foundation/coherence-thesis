// The one place manuscript markdown is split into blocks.
//
// Paragraph anchors and content hashes are assigned at build time by index over
// these blocks (paragraphFingerprints), and MarkdownBody renders the same
// blocks at read time in the same order. If the two split differently, the
// anchor for block N would attach to different prose than the build recorded,
// silently drifting every paragraph deep link. Sharing this function makes that
// divergence impossible.
export function splitMarkdownBlocks(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}
