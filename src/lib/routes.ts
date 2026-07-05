// Shared route-path helpers. These were previously copy-pasted into eight
// island components, where they had begun to drift. Keep one definition so a
// routing change (basePath, query handling) applies everywhere at once.

// Ensure a path ends with a trailing slash, matching the site's trailingSlash
// routing so path comparisons line up.
export function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

// The parent route of a path, e.g. /a/b/c/ -> /a/b/ .
export function parentRoute(path: string): string {
  return normalizePath(path).replace(/[^/]+\/$/, "");
}
