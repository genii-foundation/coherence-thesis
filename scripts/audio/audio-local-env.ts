import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../manuscripts/shared";

const allowedAudioEnvironmentVariables = [
  "FISH_API_KEY",
  "FISH_AUDIO_API_KEY",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "SUPABASE_S3_REGION",
  "SUPABASE_STORAGE_S3_ENDPOINT",
  "SUPABASE_PROJECT_REF",
] as const;

export type AudioLocalEnvResult = {
  filePath: string;
  loaded: string[];
};

function quotedValue(rawValue: string, lineNumber: number): string {
  const quote = rawValue[0]!;
  let closingQuote = -1;
  for (let index = 1; index < rawValue.length; index += 1) {
    if (rawValue[index] !== quote) continue;
    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && rawValue[cursor] === "\\"; cursor -= 1) {
      backslashCount += 1;
    }
    if (backslashCount % 2 === 0) {
      closingQuote = index;
      break;
    }
  }
  if (closingQuote < 0) {
    throw new Error(`Invalid audio environment assignment on line ${lineNumber}.`);
  }
  const trailing = rawValue.slice(closingQuote + 1).trim();
  if (trailing && !trailing.startsWith("#")) {
    throw new Error(`Invalid audio environment assignment on line ${lineNumber}.`);
  }
  return rawValue.slice(1, closingQuote);
}

export function parseAudioLocalEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = contents.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]!.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice("export ".length).trimStart();

    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!assignment) {
      throw new Error(`Invalid audio environment assignment on line ${index + 1}.`);
    }
    const name = assignment[1]!;
    const rawValue = assignment[2]!;
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      values[name] = quotedValue(rawValue, index + 1);
      continue;
    }
    values[name] = rawValue.split("#", 1)[0]!.trimEnd();
  }
  return values;
}

export function audioLocalEnvPathFromGitCommonDir(cwd: string, gitCommonDir: string): string {
  const absoluteGitCommonDir = path.resolve(cwd, gitCommonDir);
  return path.join(path.dirname(absoluteGitCommonDir), ".env.audio.local");
}

export function defaultAudioLocalEnvPath(cwd = repoRoot): string {
  try {
    const gitCommonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (gitCommonDir) {
      return audioLocalEnvPathFromGitCommonDir(cwd, gitCommonDir);
    }
  } catch {
    // Fall back to this checkout when Git metadata is unavailable.
  }
  return path.join(cwd, ".env.audio.local");
}

export function loadAudioLocalEnv(filePath = defaultAudioLocalEnvPath()): AudioLocalEnvResult {
  if (!fs.existsSync(filePath)) {
    return { filePath, loaded: [] };
  }

  const mode = fs.statSync(filePath).mode & 0o777;
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(
      `Refusing to load ${filePath}. Set its permissions to 600 so only your account can read it.`,
    );
  }

  const values = parseAudioLocalEnv(fs.readFileSync(filePath, "utf8"));
  const loaded: string[] = [];
  for (const name of allowedAudioEnvironmentVariables) {
    const value = values[name];
    if (process.env[name] === undefined && value !== undefined && value !== "") {
      process.env[name] = value;
      loaded.push(name);
    }
  }
  return { filePath, loaded };
}
