// Shared by the server shell (build-time fallback) and the client year island
// (live value), so the two cannot compute the copyright range differently.
export function copyrightYearLabel(
  startYear: number,
  currentYear: number = new Date().getFullYear(),
): string {
  if (currentYear <= startYear) return `${startYear}`;
  return `${startYear} to ${currentYear}`;
}
