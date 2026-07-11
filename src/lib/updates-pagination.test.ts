import { describe, expect, it } from "vitest";
import {
  allUpdateDays,
  buildUpdatesMetadata,
  getUpdatesPageHref,
  getUpdatesPageSlice,
  getUpdatesPaginationStaticParams,
  getUpdatesSummary,
  getUpdatesTotalPages,
  literaryUpdateDays,
  parseUpdatesPage,
  updatesPageSize,
} from "./updates-pagination";

describe("updates pagination", () => {
  it("paginates all update days without dropping history", () => {
    const pages = Array.from({ length: getUpdatesTotalPages() }, (_, index) =>
      getUpdatesPageSlice(index + 1),
    );

    expect(getUpdatesTotalPages()).toBe(
      Math.ceil(allUpdateDays.length / updatesPageSize),
    );
    expect(pages.flat()).toEqual(allUpdateDays);
    expect(pages[0]?.length).toBeLessThanOrEqual(updatesPageSize);
  });

  it("filters literary commits before grouping and pagination", () => {
    const literaryEntries = literaryUpdateDays.flatMap((day) => day.entries);
    const expectedEntries = allUpdateDays
      .flatMap((day) => day.entries)
      .filter((entry) => entry.isLiterary);
    const pages = Array.from(
      { length: getUpdatesTotalPages("literary") },
      (_, index) => getUpdatesPageSlice(index + 1, "literary"),
    );

    expect(literaryUpdateDays.every((day) => day.entries.length > 0)).toBe(
      true,
    );
    expect(literaryEntries).toEqual(expectedEntries);
    expect(literaryEntries.every((entry) => entry.isLiterary)).toBe(true);
    expect(pages.flat()).toEqual(literaryUpdateDays);
    expect(getUpdatesSummary("literary")).toEqual({
      totalCommitCount: literaryEntries.length,
      totalDayCount: literaryUpdateDays.length,
    });
  });

  it("builds stable mode-aware latest and numbered routes", () => {
    expect(getUpdatesPageHref(1)).toBe("/updates/");
    expect(getUpdatesPageHref(2)).toBe("/updates/2/");
    expect(getUpdatesPageHref(1, "literary")).toBe("/updates/literary/");
    expect(getUpdatesPageHref(2, "literary")).toBe("/updates/literary/2/");
    expect(parseUpdatesPage("2")).toBe(2);
    expect(parseUpdatesPage("0")).toBeNull();
    expect(parseUpdatesPage("2x")).toBeNull();
    expect(parseUpdatesPage("999")).toBeNull();
    expect(parseUpdatesPage("999", "literary")).toBeNull();
    expect(getUpdatesPaginationStaticParams()).toEqual(
      Array.from(
        { length: Math.max(0, getUpdatesTotalPages() - 1) },
        (_, index) => ({ page: String(index + 2) }),
      ),
    );
    expect(getUpdatesPaginationStaticParams("literary")).toEqual(
      Array.from(
        { length: Math.max(0, getUpdatesTotalPages("literary") - 1) },
        (_, index) => ({ page: String(index + 2) }),
      ),
    );
  });

  it("gives each mode and page its own canonical metadata", () => {
    expect(buildUpdatesMetadata(1)).toMatchObject({
      title: "Updates",
      alternates: { canonical: "/updates/" },
    });
    expect(buildUpdatesMetadata(2)).toMatchObject({
      title: "Updates, page 2",
      alternates: { canonical: "/updates/2/" },
    });
    expect(buildUpdatesMetadata(1, "literary")).toMatchObject({
      title: "Literary updates",
      alternates: { canonical: "/updates/literary/" },
    });
    expect(buildUpdatesMetadata(2, "literary")).toMatchObject({
      title: "Literary updates, page 2",
      alternates: { canonical: "/updates/literary/2/" },
    });
  });
});
