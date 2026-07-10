import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies the requested text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("https://example.com/#section")).resolves.toBe(
      true,
    );
    expect(writeText).toHaveBeenCalledWith("https://example.com/#section");
  });

  it("reports unavailable or rejected clipboard writes", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyTextToClipboard("missing")).resolves.toBe(false);

    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await expect(copyTextToClipboard("denied")).resolves.toBe(false);
  });
});
