import { describe, expect, it } from "vitest";
import {
  firstTermIndex,
  foldSearchText,
  foldTitleText,
  matchesFoldedQuery,
  searchTerms,
} from "./reader-text-search";

// The five exports were extracted from two private helpers that already shipped:
// SearchMenuIsland had `normalize`, `queryTerms`, and `firstTermIndex`;
// OutlineMenuIsland had `searchable` and `matchesQuery`. The originals are
// reproduced below verbatim so the extraction can be checked by differential
// comparison instead of by hand copied expectations. If someone later "improves"
// the shared module, these tests fail with the exact input that changed.

// SearchMenuIsland.normalize, as it stood before the extraction.
function originalNormalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// SearchMenuIsland.queryTerms, as it stood before the extraction.
function originalQueryTerms(query: string): string[] {
  return originalNormalize(query).split(" ").filter(Boolean);
}

// SearchMenuIsland.firstTermIndex, as it stood before the extraction.
function originalFirstTermIndex(text: string, terms: string[]): number {
  const indexes = terms
    .map((term) => text.indexOf(term))
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

// OutlineMenuIsland.searchable, as it stood before the extraction.
function originalSearchable(value: string): string {
  return value.trim().toLowerCase();
}

// OutlineMenuIsland.matchesQuery, as it stood before the extraction.
function originalMatchesQuery(values: string[], query: string): boolean {
  if (!query) return true;
  return values.some((value) => originalSearchable(value).includes(query));
}

// Inputs chosen to hit every branch of both folds: casing, apostrophes of both
// shapes, punctuation runs, leading and trailing whitespace, non-breaking space,
// digits, accented Latin, non-Latin scripts, and empty strings.
const textSamples = [
  "",
  " ",
  "   \t\n  ",
  "!!!",
  "?!.,;:-_()[]{}<>/\\|@#$%^&*+=~`\"",
  "a",
  "A",
  "The QUICK Brown Fox",
  "reader's",
  "READER'S",
  "reader’s",
  "'leading apostrophe",
  "trailing apostrophe'",
  "''",
  "a...b",
  "end. -- start",
  "one,two;three",
  "  padded  ",
  "tabs\tand\nnewlines",
  "non\u00a0breaking",
  "chapter 12",
  "v2.0.1",
  "café",
  "naïve",
  "Ünicode",
  "日本語",
  "emoji \u{1f600} here",
  "Volume I: The Coherence Thesis",
  "Part 2 - Foundations",
  "Mixed 'quotes' and “curly” ones",
  "hyphen-separated-words",
  "under_scored_words",
  "e.g. i.e. etc.",
  "  MULTIPLE   inner    spaces  ",
];

const termSets: string[][] = [
  [],
  [""],
  ["alpha"],
  ["zulu"],
  ["gamma", "beta"],
  ["beta", "gamma"],
  ["zulu", "yankee"],
  ["alpha", "zulu"],
  ["a"],
  ["the", "quick", "fox"],
  ["reader's"],
];

const haystacks = [
  "",
  "alpha beta gamma",
  "gamma beta alpha",
  "the quick brown fox",
  "reader's guide to the reader's guide",
  "a",
];

describe("foldSearchText", () => {
  it("matches the original SearchMenuIsland normalize on every sample", () => {
    for (const sample of textSamples) {
      expect(foldSearchText(sample)).toBe(originalNormalize(sample));
    }
  });

  it("lowercases and leaves clean prose otherwise intact", () => {
    expect(foldSearchText("The QUICK Brown Fox")).toBe("the quick brown fox");
  });

  it("keeps the straight apostrophe so possessives stay one token", () => {
    expect(foldSearchText("reader's")).toBe("reader's");
    expect(foldSearchText("READER'S")).toBe("reader's");
    expect(searchTerms("reader's guide")).toEqual(["reader's", "guide"]);
  });

  it("strips the curly apostrophe, splitting the possessive in two", () => {
    // U+2019 is outside the allowed class, so it becomes a space. This is the
    // original behavior, not a decision made during the extraction, and it means
    // typing a curly apostrophe finds a different set of results than a straight
    // one. Locked in here so any future fix is a deliberate, visible change.
    expect(foldSearchText("reader’s")).toBe("reader s");
    expect(searchTerms("reader’s")).toEqual(["reader", "s"]);
  });

  it("collapses a punctuation run to exactly one space", () => {
    // This is the source of the snippet offset drift. firstTermIndex reports an
    // index into the folded string, while resultSnippet slices the raw string
    // with it, so every collapsed run shifts the snippet window left.
    expect(foldSearchText("a...b")).toBe("a b");
    expect(foldSearchText("a...b")).toHaveLength(3);
    expect("a...b").toHaveLength(5);

    expect(foldSearchText("end. -- start")).toBe("end start");
    expect(foldSearchText("end. -- start").indexOf("start")).toBe(4);
    expect("end. -- start".indexOf("start")).toBe(8);

    expect(foldSearchText("one,two;three")).toBe("one two three");
    expect(foldSearchText("?!.,;:-_()[]{}<>/\\|@#$%^&*+=~`\"")).toBe("");
  });

  it("collapses whitespace runs of every kind", () => {
    expect(foldSearchText("  MULTIPLE   inner    spaces  ")).toBe(
      "multiple inner spaces",
    );
    expect(foldSearchText("tabs\tand\nnewlines")).toBe("tabs and newlines");
    // A non-breaking space is matched by \s, so it survives the punctuation pass
    // and is collapsed to a plain space by the whitespace pass.
    expect(foldSearchText("non\u00a0breaking")).toBe("non breaking");
  });

  it("returns an empty string for empty, blank, and all punctuation input", () => {
    expect(foldSearchText("")).toBe("");
    expect(foldSearchText(" ")).toBe("");
    expect(foldSearchText("   \t\n  ")).toBe("");
    expect(foldSearchText("!!!")).toBe("");
  });

  it("keeps digits", () => {
    expect(foldSearchText("chapter 12")).toBe("chapter 12");
    expect(foldSearchText("v2.0.1")).toBe("v2 0 1");
  });

  it("drops non ASCII letters instead of transliterating them", () => {
    // The allowed class is a to z only, so accented and non Latin characters are
    // punctuation as far as the fold is concerned. Searching for "cafe" will not
    // find "cafe" spelled with an acute accent.
    expect(foldSearchText("café")).toBe("caf");
    expect(foldSearchText("naïve")).toBe("na ve");
    expect(foldSearchText("Ünicode")).toBe("nicode");
    expect(foldSearchText("日本語")).toBe("");
    expect(foldSearchText("emoji \u{1f600} here")).toBe("emoji here");
  });
});

describe("foldTitleText", () => {
  it("matches the original OutlineMenuIsland searchable on every sample", () => {
    for (const sample of textSamples) {
      expect(foldTitleText(sample)).toBe(originalSearchable(sample));
    }
  });

  it("preserves punctuation, which is the whole point of the second fold", () => {
    expect(foldTitleText("Volume I: The Coherence Thesis")).toBe(
      "volume i: the coherence thesis",
    );
    expect(foldTitleText("Part 2 - Foundations")).toBe("part 2 - foundations");
    expect(foldTitleText("e.g. i.e. etc.")).toBe("e.g. i.e. etc.");
    expect(foldTitleText("!!!")).toBe("!!!");
    expect(foldTitleText("reader’s")).toBe("reader’s");
    expect(foldTitleText("café")).toBe("café");
  });

  it("trims the outside but does not collapse inner whitespace", () => {
    expect(foldTitleText("  padded  ")).toBe("padded");
    expect(foldTitleText("  MULTIPLE   inner    spaces  ")).toBe(
      "multiple   inner    spaces",
    );
  });

  it("differs from foldSearchText exactly where punctuation appears", () => {
    const title = "Part 2 - Foundations";
    expect(foldTitleText(title)).toBe("part 2 - foundations");
    expect(foldSearchText(title)).toBe("part 2 foundations");
    expect(foldTitleText(title)).not.toBe(foldSearchText(title));
  });

  it("agrees with foldSearchText on plain lowercase words", () => {
    for (const sample of ["alpha", "alpha beta", "chapter 12", "reader's"]) {
      expect(foldTitleText(sample)).toBe(foldSearchText(sample));
    }
  });
});

describe("searchTerms", () => {
  it("matches the original SearchMenuIsland queryTerms on every sample", () => {
    for (const sample of textSamples) {
      expect(searchTerms(sample)).toEqual(originalQueryTerms(sample));
    }
  });

  it("splits a folded query into tokens", () => {
    expect(searchTerms("The QUICK Brown")).toEqual(["the", "quick", "brown"]);
  });

  it("drops empty tokens rather than emitting blanks", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("!!!")).toEqual([]);
    expect(searchTerms("  padded  ")).toEqual(["padded"]);
    expect(searchTerms("...a...b...")).toEqual(["a", "b"]);
    expect(searchTerms("one,two;three")).toEqual(["one", "two", "three"]);
    for (const term of searchTerms("?!.,;:-_ a -_:;,.!?")) {
      expect(term).not.toBe("");
    }
  });
});

describe("firstTermIndex", () => {
  it("matches the original SearchMenuIsland firstTermIndex on every pair", () => {
    for (const haystack of haystacks) {
      for (const terms of termSets) {
        expect(firstTermIndex(haystack, terms)).toBe(
          originalFirstTermIndex(haystack, terms),
        );
      }
    }
  });

  it("returns -1 when no term matches", () => {
    expect(firstTermIndex("alpha beta gamma", ["zulu"])).toBe(-1);
    expect(firstTermIndex("alpha beta gamma", ["zulu", "yankee"])).toBe(-1);
    expect(firstTermIndex("", ["alpha"])).toBe(-1);
  });

  it("returns -1 for an empty term list", () => {
    expect(firstTermIndex("alpha beta gamma", [])).toBe(-1);
  });

  it("returns the minimum index when several terms match", () => {
    expect(firstTermIndex("alpha beta gamma", ["gamma", "beta"])).toBe(6);
    expect(firstTermIndex("alpha beta gamma", ["beta", "gamma"])).toBe(6);
    expect(firstTermIndex("alpha beta gamma", ["gamma", "alpha", "beta"])).toBe(0);
  });

  it("ignores the terms that miss and keeps the ones that hit", () => {
    expect(firstTermIndex("alpha beta gamma", ["zulu", "gamma"])).toBe(11);
  });

  it("returns 0 rather than -1 for a term at the start", () => {
    // Guards the `index >= 0` filter. A truthiness check here would discard the
    // leading match and report the next one instead.
    expect(firstTermIndex("alpha beta", ["alpha"])).toBe(0);
    expect(firstTermIndex("alpha beta", ["beta", "alpha"])).toBe(0);
  });

  it("reports the first occurrence when a term repeats", () => {
    expect(firstTermIndex("beta alpha beta", ["beta"])).toBe(0);
  });

  it("takes the text as already folded and does not fold it again", () => {
    // Callers fold once at index build time. Passing raw text is a caller bug,
    // and the function is documented not to paper over it.
    expect(firstTermIndex("The QUICK Brown", ["quick"])).toBe(-1);
    expect(firstTermIndex(foldSearchText("The QUICK Brown"), ["quick"])).toBe(4);
  });
});

describe("matchesFoldedQuery", () => {
  it("matches the original OutlineMenuIsland matchesQuery on every pair", () => {
    const valueSets = [
      [],
      [""],
      ["Volume I: The Coherence Thesis"],
      ["  Padded Title  ", "Second Value"],
      ["Part 2 - Foundations", "Chapter 3"],
    ];
    const queries = ["", "volume", "coherence thesis", "padded", "part 2 -", "zulu", ":"];
    for (const values of valueSets) {
      for (const query of queries) {
        expect(matchesFoldedQuery(values, query)).toBe(
          originalMatchesQuery(values, query),
        );
      }
    }
  });

  it("returns true for an empty query, even with no values", () => {
    expect(matchesFoldedQuery([], "")).toBe(true);
    expect(matchesFoldedQuery(["anything"], "")).toBe(true);
    expect(matchesFoldedQuery([""], "")).toBe(true);
  });

  it("returns false when no value contains the query", () => {
    expect(matchesFoldedQuery([], "volume")).toBe(false);
    expect(matchesFoldedQuery(["Chapter 3"], "volume")).toBe(false);
  });

  it("matches case insensitively against any one of the values", () => {
    const values = ["Volume I: The Coherence Thesis", "Chapter 3"];
    expect(matchesFoldedQuery(values, foldTitleText("COHERENCE"))).toBe(true);
    expect(matchesFoldedQuery(values, foldTitleText("chapter 3"))).toBe(true);
  });

  it("matches a substring, not a whole word", () => {
    expect(matchesFoldedQuery(["Foundations"], "undat")).toBe(true);
  });

  it("keeps punctuation significant on both sides", () => {
    // The query must be folded with foldTitleText. Folding it with
    // foldSearchText strips punctuation the values still carry, and the match
    // fails.
    const values = ["Part 2 - Foundations"];
    expect(matchesFoldedQuery(values, foldTitleText("Part 2 - F"))).toBe(true);
    expect(matchesFoldedQuery(values, foldSearchText("Part 2 - F"))).toBe(false);
  });

  it("trims each value before testing, so leading space never blocks a match", () => {
    expect(matchesFoldedQuery(["  Padded Title  "], "padded")).toBe(true);
  });
});
