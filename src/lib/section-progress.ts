import type { ProgressSection, Section } from "./manuscript-data";
import {
  isSectionRead,
  progressPercentForSection,
  updatedSinceRead,
  type ReaderProgressState,
} from "./reader-state";

export type SectionProgressInput = Pick<Section, "sectionId" | "contentHash"> &
  Partial<
    Pick<
      Section,
      "continuityId" | "legacyContinuityIds" | "progressContinuityGroups"
    >
  >;

export type SectionProgressKind = "unread" | "partial" | "read" | "updated";

export type SectionGroupProgressStatus = {
  kind: SectionProgressKind;
  percent: number;
  label: string;
};

function clampPercent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function sectionGroupProgressStatus(
  progress: ReaderProgressState,
  sections: SectionProgressInput[],
): SectionGroupProgressStatus {
  if (sections.length === 0) {
    return { kind: "unread", percent: 0, label: "No reading progress yet" };
  }

  const percent = Math.round(
    sections.reduce((total, section) => {
      return total + clampPercent(progressPercentForSection(progress, section));
    }, 0) / sections.length,
  );
  const isRead = sections.every((section) => isSectionRead(progress, section));
  const isUpdated = sections.some((section) => updatedSinceRead(progress, section));
  const kind: SectionProgressKind = isUpdated
    ? "updated"
    : isRead
      ? "read"
      : percent > 0
        ? "partial"
        : "unread";

  return {
    kind,
    percent,
    label:
      kind === "updated"
        ? "Updated since read"
        : kind === "read"
          ? "Read"
          : kind === "partial"
            ? `${percent}% read`
            : "Unread",
  };
}

export function progressSectionsForPrefix<
  T extends Pick<ProgressSection, "href" | "readerHref">,
>(
  sections: T[],
  href: string,
): T[] {
  const normalizedHref = href.endsWith("/") ? href : `${href}/`;
  return sections.filter(
    (section) =>
      section.href.startsWith(normalizedHref) ||
      section.readerHref.startsWith(normalizedHref),
  );
}

export function progressSectionForHref<
  T extends Pick<ProgressSection, "href" | "readerHref">,
>(
  sections: T[],
  href: string,
): T[] {
  const normalizedHref = href.endsWith("/") ? href : `${href}/`;
  return sections.filter(
    (section) => section.href === normalizedHref || section.readerHref === href,
  );
}
