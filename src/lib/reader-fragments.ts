export type FragmentSection = {
  sectionId: string;
  legacySectionIds?: string[];
  paragraphs?: Array<{ anchor: string }>;
};

export type ReaderFragmentTarget = {
  sectionId: string;
  anchorId: string;
};

export function canonicalReaderDestination(
  readerHref: string,
  currentHash: string,
  section?: FragmentSection,
): string {
  if (!currentHash) return readerHref;
  const baseHref = readerHref.replace(/#.*$/, "");
  const readerFragment = decodedFragment(readerHref.split("#", 2)[1] ?? "");
  const fragment = decodedFragment(currentHash);
  const paragraphPattern = /^p-(?:\d+|h[0-9a-f]{16}(?:-\d+)?)$/;
  if (paragraphPattern.test(fragment)) {
    return `${baseHref}#${readerFragment ? `${readerFragment}-` : ""}${fragment}`;
  }

  const legacyId = [...(section?.legacySectionIds ?? [])]
    .sort((left, right) => right.length - left.length)
    .find((id) => fragment.startsWith(`${id}-p-`));
  if (legacyId) {
    const paragraphAnchor = fragment.slice(legacyId.length + 1);
    const exactParagraph =
      /^p-h[0-9a-f]{16}(?:-\d+)?$/.test(paragraphAnchor) &&
      section?.paragraphs?.some(
        (paragraph) => paragraph.anchor === paragraphAnchor,
      );
    if (exactParagraph) {
      return `${baseHref}#${
        readerFragment ? `${section?.sectionId ?? readerFragment}-` : ""
      }${paragraphAnchor}`;
    }
  }

  return `${baseHref}#${fragment}`;
}

function decodedFragment(hash: string): string {
  const value = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readerFragmentTarget(
  hash: string,
  sections: FragmentSection[],
): ReaderFragmentTarget | null {
  const fragment = decodedFragment(hash);
  if (!fragment) return null;
  const identities = sections
    .flatMap((section) => [
      { sectionId: section.sectionId, anchorId: section.sectionId },
      ...(section.legacySectionIds ?? []).map((legacyId) => ({
        sectionId: section.sectionId,
        anchorId: legacyId,
      })),
    ])
    .sort((left, right) => right.anchorId.length - left.anchorId.length);
  const qualified = identities.find(
    (identity) =>
      fragment === identity.anchorId ||
      fragment.startsWith(`${identity.anchorId}-p-`),
  );
  if (qualified) return qualified;
  if (sections.length === 1 && /^p-(?:\d+|h[0-9a-f]{16}(?:-\d+)?)$/.test(fragment)) {
    return {
      sectionId: sections[0]!.sectionId,
      anchorId: sections[0]!.sectionId,
    };
  }
  return null;
}
