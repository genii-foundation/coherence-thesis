import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { FishTimestampChunk, FishTimestampSegment } from "../../src/lib/audio-timings";

export const defaultMlxWhisperModel = "mlx-community/whisper-large-v3-turbo";

export type MlxWhisperWord = FishTimestampSegment & {
  probability?: number;
};

export type MlxWhisperAlignment = {
  words: MlxWhisperWord[];
  durationSeconds: number;
};

type WorkerResponse = {
  ok: boolean;
  words?: MlxWhisperWord[];
  durationSeconds?: number;
  error?: string;
};

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseMlxWhisperResponse(value: string): MlxWhisperAlignment {
  const parsed = JSON.parse(value) as WorkerResponse;
  if (!parsed.ok) {
    throw new Error(`Local MLX Whisper alignment failed: ${parsed.error || "unknown error"}`);
  }
  if (!Array.isArray(parsed.words) || !isFiniteNonNegative(parsed.durationSeconds)) {
    throw new Error("Local MLX Whisper returned an invalid alignment response.");
  }
  const words = parsed.words.map((word) => {
    if (
      !word ||
      typeof word.text !== "string" ||
      !isFiniteNonNegative(word.start) ||
      !isFiniteNonNegative(word.end) ||
      word.end < word.start ||
      (word.probability !== undefined && !isFiniteNonNegative(word.probability))
    ) {
      throw new Error("Local MLX Whisper returned an invalid word boundary.");
    }
    return word;
  });
  if (words.length === 0 || parsed.durationSeconds <= 0) {
    throw new Error("Local MLX Whisper returned no timed words.");
  }
  return { words, durationSeconds: parsed.durationSeconds };
}

export function mlxAlignmentChunk(
  text: string,
  alignment: MlxWhisperAlignment,
  audioDurationSeconds: number,
): FishTimestampChunk {
  return {
    chunkSeq: 0,
    content: text,
    offsetSeconds: 0,
    audioDurationSeconds: Math.max(audioDurationSeconds, alignment.durationSeconds),
    segments: alignment.words,
  };
}

export function defaultMlxWhisperPython(): string {
  const configured = process.env.MLX_WHISPER_PYTHON?.trim();
  if (configured) return configured;
  const pipxPython = path.join(
    os.homedir(),
    ".local",
    "pipx",
    "venvs",
    "mlx-whisper",
    "bin",
    "python",
  );
  return fs.existsSync(pipxPython) ? pipxPython : "python3";
}

type ActiveRequest = {
  resolve: (alignment: MlxWhisperAlignment) => void;
  reject: (error: Error) => void;
};

export class MlxWhisperAligner {
  private child: ChildProcessWithoutNullStreams | null = null;
  private active: ActiveRequest | null = null;
  private queue: Promise<void> = Promise.resolve();
  private stderrTail = "";

  constructor(
    private readonly pythonPath = defaultMlxWhisperPython(),
    private readonly model = defaultMlxWhisperModel,
  ) {}

  align(audioPath: string): Promise<MlxWhisperAlignment> {
    const result = this.queue.then(() => this.request(audioPath));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child;
    const workerPath = path.join(import.meta.dirname, "mlx-whisper-worker.py");
    const child = spawn(this.pythonPath, [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.stderrTail = "";
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      const active = this.active;
      this.active = null;
      if (!active) return;
      try {
        active.resolve(parseMlxWhisperResponse(line));
      } catch (error) {
        active.reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-4_000);
    });
    child.on("error", (error) => this.rejectActive(error));
    child.on("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      if (this.active) {
        const detail = this.stderrTail.trim();
        this.rejectActive(new Error(
          `Local MLX Whisper worker exited with ${signal || code}.${detail ? ` ${detail}` : ""}`,
        ));
      }
    });
    return child;
  }

  private request(audioPath: string): Promise<MlxWhisperAlignment> {
    return new Promise((resolve, reject) => {
      if (this.active) {
        reject(new Error("Local MLX Whisper worker received overlapping requests."));
        return;
      }
      const child = this.ensureChild();
      this.active = { resolve, reject };
      child.stdin.write(`${JSON.stringify({ audioPath, model: this.model })}\n`, (error) => {
        if (error) this.rejectActive(error);
      });
    });
  }

  private rejectActive(error: Error): void {
    const active = this.active;
    this.active = null;
    active?.reject(error);
  }

  async close(): Promise<void> {
    await this.queue;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.stdin.end();
    });
  }
}
