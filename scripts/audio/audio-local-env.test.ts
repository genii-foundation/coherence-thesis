import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  audioLocalEnvPathFromGitCommonDir,
  loadAudioLocalEnv,
  parseAudioLocalEnv,
} from "./audio-local-env";

const names = [
  "FISH_AUDIO_API_KEY",
  "SUPABASE_PROJECT_REF",
  "UNRELATED_VALUE",
] as const;
const originalValues = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const original = originalValues.get(name);
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("loadAudioLocalEnv", () => {
  it("parses the narrow environment syntax used by audio credentials", () => {
    expect(
      parseAudioLocalEnv([
        "# local audio credentials",
        "export FISH_AUDIO_API_KEY = secret=value # comment",
        'SUPABASE_S3_SECRET_ACCESS_KEY="quoted # value" # comment',
        "SUPABASE_S3_REGION='us-east-2'",
        "EMPTY_VALUE=",
      ].join("\r\n")),
    ).toEqual({
      FISH_AUDIO_API_KEY: "secret=value",
      SUPABASE_S3_SECRET_ACCESS_KEY: "quoted # value",
      SUPABASE_S3_REGION: "us-east-2",
      EMPTY_VALUE: "",
    });
  });

  it("rejects malformed assignments instead of guessing", () => {
    expect(() => parseAudioLocalEnv("FISH_AUDIO_API_KEY 'missing equals'"))
      .toThrow("line 1");
    expect(() => parseAudioLocalEnv('FISH_AUDIO_API_KEY="missing quote'))
      .toThrow("line 1");
    expect(() => parseAudioLocalEnv('FISH_AUDIO_API_KEY="value" trailing'))
      .toThrow("line 1");
  });

  it("resolves absolute and relative common Git directories", () => {
    expect(audioLocalEnvPathFromGitCommonDir("/repo/worktree", "/repo/main/.git")).toBe(
      "/repo/main/.env.audio.local",
    );
    expect(audioLocalEnvPathFromGitCommonDir("/repo/main", ".git")).toBe(
      "/repo/main/.env.audio.local",
    );
  });

  it("loads approved values without overriding explicit environment values", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-env-"));
    const filePath = path.join(directory, ".env.audio.local");
    fs.writeFileSync(
      filePath,
      [
        "FISH_AUDIO_API_KEY=from-file",
        "SUPABASE_PROJECT_REF=project-from-file",
        "UNRELATED_VALUE=ignored",
      ].join("\n"),
      { mode: 0o600 },
    );
    process.env.FISH_AUDIO_API_KEY = "from-process";

    const result = loadAudioLocalEnv(filePath);

    expect(process.env.FISH_AUDIO_API_KEY).toBe("from-process");
    expect(process.env.SUPABASE_PROJECT_REF).toBe("project-from-file");
    expect(process.env.UNRELATED_VALUE).toBeUndefined();
    expect(result.loaded).toEqual(["SUPABASE_PROJECT_REF"]);
  });

  it.runIf(process.platform !== "win32")("rejects a credentials file readable by other accounts", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-env-"));
    const filePath = path.join(directory, ".env.audio.local");
    fs.writeFileSync(filePath, "FISH_AUDIO_API_KEY=value\n", { mode: 0o644 });

    expect(() => loadAudioLocalEnv(filePath)).toThrow(/permissions to 600/);
  });
});
