import { describe, expect, it } from "vitest";
import {
  assessNodeVersion,
  assessNpmVersion,
  formatRepositoryDoctorReport,
} from "./doctor";

describe("repository doctor Node assessment", () => {
  it("fails when the runtime is below the required patch", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22.12.0 <23",
        preferredVersion: "22.12.0",
        runtimeVersion: "v22.11.9",
      }),
    ).toMatchObject({ status: "fail" });
  });

  it("fails when the runtime is above the allowed major", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22.12.0 <23",
        preferredVersion: "22.12.0",
        runtimeVersion: "v26.0.0",
      }),
    ).toMatchObject({ status: "fail" });
  });

  it("accepts the exact preferred supported runtime", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22.12.0 <23",
        preferredVersion: "22.12.0",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "ok" });
  });

  it("warns when a supported newer patch differs from the preference", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22.12.0 <23",
        preferredVersion: "22.12.0",
        runtimeVersion: "v22.12.1",
      }),
    ).toMatchObject({ status: "warn" });
  });

  it("fails when the engine requirement is missing or unreadable", () => {
    expect(
      assessNodeVersion({
        preferredVersion: "22.12.0",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "fail" });
    expect(
      assessNodeVersion({
        engineRequirement: "latest",
        preferredVersion: "22.12.0",
        runtimeVersion: "v22.12.0",
      }),
    ).toMatchObject({ status: "fail" });
  });

  it("warns when no preferred local version is declared", () => {
    expect(
      assessNodeVersion({
        engineRequirement: ">=22.12.0 <23",
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

describe("repository doctor npm assessment", () => {
  it("accepts the exact required npm version", () => {
    expect(
      assessNpmVersion({
        engineRequirement: "10.9.0",
        runtimeVersion: "10.9.0",
      }),
    ).toMatchObject({ status: "ok" });
  });

  it("fails when npm differs from the exact requirement", () => {
    expect(
      assessNpmVersion({
        engineRequirement: "10.9.0",
        runtimeVersion: "10.8.3",
      }),
    ).toMatchObject({ status: "fail" });
  });
});
