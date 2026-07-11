export function sectionHeadingHref(
  readerHref: string,
  sectionId: string,
): string {
  return `${readerHref.replace(/#.*$/, "")}#${sectionId}`;
}

export function chapterHeadingHref(
  chapterHref: string,
  chapterId: string,
): string {
  return `${chapterHref.replace(/#.*$/, "")}#${chapterId}`;
}
