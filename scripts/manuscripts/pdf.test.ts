import { describe, expect, it } from "vitest";
import { sectionRenderHash } from "./pdf";
import type { CompiledSection, CompiledVolume } from "./shared";

const section = { contentHash: "abc123" } as unknown as CompiledSection;
const volume = { title: "Volume One", numberLabel: "1" } as unknown as CompiledVolume;

describe("pdf incremental render hash", () => {
  it("is stable for identical inputs", () => {
    expect(sectionRenderHash(section, volume, "sig")).toBe(
      sectionRenderHash(section, volume, "sig"),
    );
  });

  it("changes when section content changes", () => {
    const changed = { contentHash: "def456" } as unknown as CompiledSection;
    expect(sectionRenderHash(section, volume, "sig")).not.toBe(
      sectionRenderHash(changed, volume, "sig"),
    );
  });

  it("changes when the render signature changes (fonts, cover, or render code)", () => {
    expect(sectionRenderHash(section, volume, "sig-a")).not.toBe(
      sectionRenderHash(section, volume, "sig-b"),
    );
  });

  it("changes when the containing volume title changes", () => {
    const renamed = { title: "Volume I", numberLabel: "1" } as unknown as CompiledVolume;
    expect(sectionRenderHash(section, volume, "sig")).not.toBe(
      sectionRenderHash(section, renamed, "sig"),
    );
  });
});
