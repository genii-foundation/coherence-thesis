export function resolvePlaywrightServerMode(
  environment: Readonly<Record<string, string | undefined>>,
): "fast" | "prebuilt" | "full" {
  if (environment.PLAYWRIGHT_PREBUILT === "1") return "prebuilt";
  if (environment.PLAYWRIGHT_FAST === "1") return "fast";
  return "full";
}
