export function LegacySectionAnchors({
  currentSectionId,
  legacySectionIds,
}: {
  currentSectionId: string;
  legacySectionIds: string[];
}) {
  const ids = [...new Set(legacySectionIds)].filter(
    (sectionId) => sectionId && sectionId !== currentSectionId,
  );
  return ids.map((sectionId) => (
    <span
      key={sectionId}
      id={sectionId}
      className="legacy-section-anchor"
      aria-hidden="true"
    />
  ));
}
