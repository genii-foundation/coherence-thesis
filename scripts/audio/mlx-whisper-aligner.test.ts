import { describe, expect, it } from "vitest";
import {
  mlxAlignmentChunk,
  parseMlxWhisperResponse,
} from "./mlx-whisper-aligner";

describe("MLX Whisper audio alignment", () => {
  it("parses validated word boundaries from the local worker", () => {
    const alignment = parseMlxWhisperResponse(JSON.stringify({
      ok: true,
      durationSeconds: 1.2,
      words: [
        { text: "One", start: 0, end: 0.4, probability: 0.99 },
        { text: "two", start: 0.5, end: 1.1, probability: 0.98 },
      ],
    }));

    expect(alignment.words).toHaveLength(2);
    expect(mlxAlignmentChunk("One two", alignment, 1.3)).toMatchObject({
      content: "One two",
      audioDurationSeconds: 1.3,
      segments: alignment.words,
    });
  });

  it("rejects worker failures and malformed boundaries", () => {
    expect(() => parseMlxWhisperResponse(JSON.stringify({
      ok: false,
      error: "model unavailable",
    }))).toThrow("model unavailable");
    expect(() => parseMlxWhisperResponse(JSON.stringify({
      ok: true,
      durationSeconds: 1,
      words: [{ text: "One", start: 1, end: 0 }],
    }))).toThrow("invalid word boundary");
  });
});
