import { describe, expect, it } from "vitest";
import { assessNodeVersion, formatRepositoryDoctorReport } from "./doctor";

describe("repository doctor Node assessment", () => {
  it("fails when the runtime is below the package requirement", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22",
        preferredVersion: "22",
        runtimeVersion: "v20.19.4",
      }),
    ).toMatchObject({ status: "fail" });
  });

  it("accepts the preferred supported runtime", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22",
        preferredVersion: "22",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "ok" });
  });

  it("warns when a supported runtime differs from the preference", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22",
        preferredVersion: "22",
        runtimeVersion: "v24.1.0",
      }),
    ).toMatchObject({ status: "warn" });
  });

  it("fails when the engine requirement is missing or unreadable", () => {
    expect(
      assessNodeVersion({
        preferredVersion: "22",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "fail" });
    expect(
      assessNodeVersion({
        engineRequirement: "latest",
        preferredVersion: "22",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "fail" });
  });

  it("warns when no preferred local version is declared", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "warn" });
  });

  it("distinguishes the read only inspection from dependency prehook repair", () => {
    expect(
      formatRepositoryDoctorReport({
        checks: [],
        inspectedAt: "2026-07-14T00:00:00.000Z",
      }),
    ).toContain(
      "Its npm prehook may repair local dependencies before this report starts.",
    );
  });
});
