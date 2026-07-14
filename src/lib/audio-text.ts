export function textForAudio(section: { title: string; text: string }): string {
  return `${section.title.trim()}\n\n${section.text.trim()}`.trim();
}

export function audioBodyStartCharacter(title: string): number {
  return title.trim().length + 2;
}
