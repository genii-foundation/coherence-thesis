type PartLabelSource = {
  partId: string;
  title?: string;
  partTitle?: string;
  order?: number;
  partOrder?: number;
};

type VolumeLabelSource = {
  parts: PartLabelSource[];
};

function partTitle(part: PartLabelSource): string {
  return part.partTitle ?? part.title ?? "";
}

function partOrder(part: PartLabelSource): number {
  return part.partOrder ?? part.order ?? 0;
}

export function isSyntheticFrontMatterPart(part: PartLabelSource): boolean {
  return (
    part.partId === "front-matter" &&
    partOrder(part) === 0 &&
    partTitle(part) === "Front Matter"
  );
}

export function authoredPartCount(volume: VolumeLabelSource): number {
  return volume.parts.filter((part) => !isSyntheticFrontMatterPart(part)).length;
}

export function displayPartTitle(
  part: PartLabelSource,
  volume?: VolumeLabelSource,
): string {
  if (!isSyntheticFrontMatterPart(part)) return partTitle(part);
  if (volume && authoredPartCount(volume) === 0) return "Contents";
  return "Opening";
}

export function displayPartKicker(
  part: PartLabelSource,
  volume?: VolumeLabelSource,
): string {
  if (!isSyntheticFrontMatterPart(part)) return `Part ${partOrder(part)}`;
  if (volume && authoredPartCount(volume) === 0) return "Manuscript";
  return "Opening";
}

export function displayPartCountLabel(volume: VolumeLabelSource): string {
  const count = authoredPartCount(volume);
  if (count === 0) return "Unpartitioned";
  return `${count.toLocaleString()} part${count === 1 ? "" : "s"}`;
}
