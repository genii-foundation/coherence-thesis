import { describe, expect, it } from "vitest";
import {
  allUpdateDays,
  buildUpdatesMetadata,
  getUpdatesPageHref,
  getUpdatesPageSlice,
  getUpdatesPaginationStaticParams,
  getUpdatesTotalPages,
  parseUpdatesPage,
  updatesPageSize,
} from "./updates-pagination";

describe("updates pagination", () => {
  it("paginates update days without dropping history", () => {
    const pages = Array.from(
      { length: getUpdatesTotalPages() },
      (_, index) => getUpdatesPageSlice(index + 1),
    );

    expect(getUpdatesTotalPages()).toBe(
      Math.ceil(allUpdateDays.length / updatesPageSize),
    );
    expect(pages.flat()).toEqual(allUpdateDays);
    expect(pages[0]?.length).toBeLessThanOrEqual(updatesPageSize);
  });

  it("builds stable latest and numbered routes", () => {
    expect(getUpdatesPageHref(1)).toBe("/updates/");
    expect(getUpdatesPageHref(2)).toBe("/updates/2/");
    expect(parseUpdatesPage("2")).toBe(2);
    expect(parseUpdatesPage("0")).toBeNull();
    expect(parseUpdatesPage("2x")).toBeNull();
    expect(parseUpdatesPage("999")).toBeNull();
    expect(getUpdatesPaginationStaticParams()).toEqual(
      Array.from(
        { length: Math.max(0, getUpdatesTotalPages() - 1) },
        (_, index) => ({ page: String(index + 2) }),
      ),
    );
  });

  it("gives each page its own canonical metadata", () => {
    expect(buildUpdatesMetadata(1)).toMatchObject({
      title: "Updates",
      alternates: { canonical: "/updates/" },
    });
    expect(buildUpdatesMetadata(2)).toMatchObject({
      title: "Updates, page 2",
      alternates: { canonical: "/updates/2/" },
    });
  });
});
