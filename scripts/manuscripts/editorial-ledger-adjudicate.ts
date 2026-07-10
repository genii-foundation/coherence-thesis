import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseSentenceLedger,
  validateSentenceLedger,
  type SentenceDisposition,
  type SentenceLedgerRecord,
} from "./editorial-ledger";
import {
  parseStructureLedger,
  type StructureLedgerRecord,
} from "./editorial-structure-ledger";
import { repoRoot, writeUtf8 } from "./shared";

export const authorityKinds = [
  "empirical",
  "medical",
  "legal",
  "historical",
  "quotation",
  "implementation-status",
  "authorial-doctrine",
] as const;

export type AuthorityKind = (typeof authorityKinds)[number];

type ClaimAnalysis = {
  authority: AuthorityKind[];
  claimTypes: string[];
  claimInvariants: string[];
};

type IndependentReviewEvidence = {
  reviewDirectory: string;
  files: string[];
};

type CliOptions = {
  reviewDirectory?: string;
  write: boolean;
  help: boolean;
};

type AdjudicationSummary = {
  sentences: Record<SentenceLedgerRecord["reviewStatus"], number>;
  structure: Record<StructureLedgerRecord["reviewStatus"], number>;
};

const initializerReasonCodes = new Set([
  "exact-text-match",
  "changed-text-review-required",
  "inserted-content-review-required",
  "merged-text-review-required",
  "removed-from-current",
]);

const authorityRules: Array<{
  kind: AuthorityKind;
  claimTypes: string[];
  reasonCode: string;
  invariant: string;
  patterns: RegExp[];
}> = [
  {
    kind: "empirical",
    claimTypes: ["factual", "empirical"],
    reasonCode: "evidence-verification-required",
    invariant:
      "Preserve the measurement, population, comparison, scope, causality, and evidentiary status until the empirical claim is verified.",
    patterns: [
      /\b(?:research|stud(?:y|ies)|data|evidence|measur(?:e|ed|ement|able)|statistic|survey|experiment|correlat(?:ion|ed|es)|caus(?:e|es|ed|al)|predict(?:s|ed|ive)|participants?|sample size)\b/i,
      /\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|thousand|years?|people|participants?|times)\b/i,
      /\b(?:always|never|inevitably|the only)\b/i,
    ],
  },
  {
    kind: "medical",
    claimTypes: ["medical"],
    reasonCode: "medical-review-required",
    invariant:
      "Preserve the boundary between observation, hypothesis, diagnosis, treatment, and demonstrated clinical effect until qualified review is complete.",
    patterns: [
      /\b(?:nervous system|trauma|medical|medicine|clinical|diagnos\w*|disease|disorder|therap\w*|treatment|patient|health|heart rate|HRV|cortisol|vagal|endocrine|hormone|immune|neuro\w*|physiolog\w*|biolog(?:y|ical)|somatic|disability|mental illness|healing)\b/i,
    ],
  },
  {
    kind: "legal",
    claimTypes: ["legal"],
    reasonCode: "legal-review-required",
    invariant:
      "Preserve the stated right, duty, prohibition, exception, remedy, and jurisdiction without implying legal validity that has not been established.",
    patterns: [
      /\b(?:legal|law|constitutional|constitution|rights?|due process|appeal|jurisdiction|liability|contract|fiduciar\w*|statute|regulation|consent|privacy|ownership|governance standing|equal voice|unconditional floor)\b/i,
    ],
  },
  {
    kind: "historical",
    claimTypes: ["historical"],
    reasonCode: "historical-source-verification-required",
    invariant:
      "Preserve the actor, event, date, sequence, lineage, comparison class, and attribution until the historical claim is sourced.",
    patterns: [
      /\b(?:histor(?:y|ic|ical|ically)|centur(?:y|ies)|millennia|ancient|medieval|modern era|originated|emerged in|for generations|for decades|since the)\b/i,
      /\b(?:1[0-9]{3}|20[0-9]{2})\b/,
    ],
  },
  {
    kind: "quotation",
    claimTypes: ["quotation"],
    reasonCode: "quotation-attribution-verification",
    invariant:
      "Preserve exact wording, attribution, title, edition, and adaptation status until the primary source is checked.",
    patterns: [
      /(?:^|\s)["\u201c][^"\u201d]{2,}["\u201d](?:\s|$)/,
      /\b(?:said|wrote|writes|according to|quoted|quotation|epigraph|adapted from)\b/i,
    ],
  },
  {
    kind: "implementation-status",
    claimTypes: ["project-status"],
    reasonCode: "implementation-status-verification-required",
    invariant:
      "Preserve the distinction among proposal, design fiction, prototype, pilot, deployed system, and current operation until dated status evidence exists.",
    patterns: [
      /\b(?:currently|already|operational|implemented|implementation|deployed|launched|prototype|pilot|beta|in development|under construction|being built|has been built|have been built|does not yet exist|not yet (?:built|implemented|launched)|remains unbuilt|exists today|now exists|active program)\b/i,
      /\b(?:Providence|Purposeful|Cardinal Scale|COHERENCE|Bio-Consensus|Proof of Council)\b.{0,80}\b(?:exists?|is|are|has|have|uses?|offers?|supports?|records?|mints?|operates?|currently|already|will)\b/i,
    ],
  },
  {
    kind: "authorial-doctrine",
    claimTypes: ["normative", "authorial-doctrine"],
    reasonCode: "authorial-doctrine-ratification-required",
    invariant:
      "Preserve the normative boundary and its exceptions without treating editorial review as authorial ratification.",
    patterns: [
      /\b(?:must|ought|should|shall|nonnegotiable|inviolable|inalienable|sacred|forbidden|permitted|cannot be allowed|will never)\b/i,
      /\b(?:this (?:book|volume|thesis)|the coherence thesis|we|I)\b.{0,100}\b(?:argue|claim|hold|believe|define|propose|insist|commit|refuse|mean)\b/i,
      /\b(?:we call|is defined as|means that|our position|our doctrine|the principle is|the rule is)\b/i,
    ],
  },
];

const dispositionReason: Record<SentenceDisposition, string> = {
  keep: "deliberate-keep-after-line-review",
  tighten: "clarity-and-cadence-tightening-reviewed",
  recast: "clarity-and-cadence-recast",
  split: "split-for-clarity-and-breath",
  merge: "merge-for-continuity-and-cadence",
  move: "moved-for-structural-continuity",
  query: "query-carried-from-initializer",
  remove: "developmental-compression-removal-reviewed",
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function combinedRecordText(
  record: Pick<SentenceLedgerRecord, "originalText" | "proposedText">,
): string {
  return [record.originalText, ...record.proposedText].join(" ");
}

function classifyLowRiskTypes(text: string): string[] {
  const types: string[] = [];
  if (/\b(?:may|might|could|perhaps|hypothesis|proposal|proposed|imagine|if)\b/i.test(text)) {
    types.push("speculative");
  }
  if (/\b(?:like|as if|metaphor|image|dragon|seed|sprout|stem|soil|flower|nest|river)\b/i.test(text)) {
    types.push("analogical");
  }
  if (/\?$/.test(text.trim())) types.push("rhetorical");
  if (/\b(?:you|your|let us|consider|read|remember)\b/i.test(text)) {
    types.push("directive");
  }
  if (types.length === 0) types.push("inferential");
  return types;
}

export function analyzeSentenceClaim(
  record: Pick<
    SentenceLedgerRecord,
    | "sectionId"
    | "sentenceOrdinal"
    | "originalHash"
    | "originalText"
    | "proposedText"
    | "disposition"
    | "citationAttachments"
  >,
): ClaimAnalysis {
  const text = combinedRecordText(record);
  const matchedRules = authorityRules.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  );
  if (record.citationAttachments.length > 0) {
    const quotationRule = authorityRules.find(
      (rule) => rule.kind === "quotation",
    )!;
    if (!matchedRules.includes(quotationRule)) matchedRules.push(quotationRule);
  }
  const authority = matchedRules.map((rule) => rule.kind);
  const claimTypes = unique([
    ...matchedRules.flatMap((rule) => rule.claimTypes),
    ...classifyLowRiskTypes(text),
  ]);
  const address = `${record.sectionId}:${record.sentenceOrdinal} (${record.originalHash})`;
  const claimInvariants = unique([
    `Preserve the proposition, scope, modality, causal force, image, and relationships recorded at baseline address ${address}.`,
    ...(record.disposition === "merge"
      ? [
          "Preserve every baseline input inside the shared merge result without changing scope or emphasis.",
        ]
      : []),
    ...(record.disposition === "remove"
      ? [
          "Treat removal as reviewed compression, not proof that the baseline claim was false or unimportant.",
        ]
      : [
          "Preserve semantic fidelity between the baseline record and the exact proposed text at every recorded result location.",
        ]),
    ...matchedRules.map((rule) => rule.invariant),
    ...(record.citationAttachments.length > 0
      ? ["Keep every recorded citation attachment bound to the claim it supports."]
      : []),
  ]);
  return { authority, claimTypes, claimInvariants };
}

function assertFreshSentenceRecords(records: SentenceLedgerRecord[]): void {
  for (const [index, record] of records.entries()) {
    if (record.reviewStatus !== "pending") {
      throw new Error(
        `sentence-ledger.jsonl:${index + 1}: adjudication accepts only freshly initialized pending records.`,
      );
    }
    if (
      record.reasonCodes.length === 0 ||
      record.reasonCodes.some((code) => !initializerReasonCodes.has(code))
    ) {
      throw new Error(
        `sentence-ledger.jsonl:${index + 1}: reasonCodes do not match initializer output.`,
      );
    }
  }
}

function assertFreshStructureRecords(records: StructureLedgerRecord[]): void {
  for (const [index, record] of records.entries()) {
    if (record.reviewStatus !== "pending") {
      throw new Error(
        `structure-ledger.jsonl:${index + 1}: adjudication accepts only freshly initialized pending records.`,
      );
    }
  }
}

export function adjudicateSentenceRecords(
  records: SentenceLedgerRecord[],
): SentenceLedgerRecord[] {
  assertFreshSentenceRecords(records);
  const adjudicated = records.map((record) => {
    const analysis = analyzeSentenceClaim(record);
    const unchanged =
      record.disposition === "keep" &&
      record.proposedText.length === 1 &&
      record.proposedText[0] === record.originalText;
    const reviewStatus: SentenceLedgerRecord["reviewStatus"] =
      analysis.authority.length > 0
        ? "query"
        : unchanged
          ? "approved"
          : "reviewed";
    const reasonCodes = unique([
      dispositionReason[record.disposition],
      reviewStatus === "query"
        ? "independent-reviews-exposed-unresolved-authority"
        : reviewStatus === "approved"
          ? "independent-reviews-support-final-wording"
          : "independent-reviews-complete-residual-risk-recorded",
      ...analysis.authority.map(
        (kind) => authorityRules.find((rule) => rule.kind === kind)!.reasonCode,
      ),
    ]);
    const risk: SentenceLedgerRecord["risk"] =
      reviewStatus === "query" ? "high" : unchanged ? "low" : "medium";
    return {
      ...record,
      reasonCodes,
      claimTypes: analysis.claimTypes,
      claimInvariants: analysis.claimInvariants,
      risk,
      reviewStatus,
    };
  });
  validateSentenceLedger(adjudicated);
  return adjudicated;
}

function structureAuthority(record: StructureLedgerRecord): AuthorityKind[] {
  const sentenceLike: Pick<
    SentenceLedgerRecord,
    | "sectionId"
    | "sentenceOrdinal"
    | "originalHash"
    | "originalText"
    | "proposedText"
    | "disposition"
    | "citationAttachments"
  > = {
    sectionId: `${record.unitType}-metadata`,
    sentenceOrdinal: record.unitOrdinal,
    originalHash: record.originalHash,
    originalText: record.originalText,
    proposedText: record.proposedText,
    disposition: record.disposition,
    citationAttachments: [],
  };
  return analyzeSentenceClaim(sentenceLike).authority;
}

export function adjudicateStructureRecords(
  records: StructureLedgerRecord[],
): StructureLedgerRecord[] {
  assertFreshStructureRecords(records);
  const adjudicated = records.map((record) => {
    const authority = structureAuthority(record);
    const unchanged = record.disposition === "keep";
    const publicRouteNeedsEvidence = ![
      "unchanged",
      "not-public",
    ].includes(record.routeImpact);
    const reviewStatus: StructureLedgerRecord["reviewStatus"] =
      authority.length > 0 || publicRouteNeedsEvidence
        ? "query"
        : unchanged
          ? "approved"
          : "reviewed";
    let routeOutcome: string;
    if (publicRouteNeedsEvidence) {
      routeOutcome =
        "Canonical route and historical alias destinations require explicit link preservation evidence before approval. Independent editorial review does not establish route continuity.";
    } else if (record.routeImpact === "not-public") {
      routeOutcome =
        authority.length > 0
          ? `No independent public route is attached to this display unit. Its wording remains a query for ${authority.join(", ")} authority.`
          : "No independent public route is attached to this display unit. The completed review supports its recorded wording.";
    } else {
      routeOutcome =
        authority.length > 0
          ? `Canonical wording and public route are unchanged. The wording remains a query for ${authority.join(", ")} authority.`
          : "Canonical wording and public route are unchanged.";
    }
    return { ...record, routeOutcome, reviewStatus };
  });
  const serialized = serializeLedger(adjudicated);
  parseStructureLedger(serialized, "structure-ledger.jsonl");
  return adjudicated;
}

function reviewArtifactHasVerdict(source: string): boolean {
  return /\b(?:PASS|FAIL|completed?|verdict)\b/i.test(source);
}

export function assertCompletedIndependentReviews(
  reviewDirectory: string,
): IndependentReviewEvidence {
  const required = [
    "review.md",
    "semantic-review.md",
    "literary-review.md",
    "slop-review.md",
  ];
  const files = required.map((name) => path.join(reviewDirectory, name));
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Independent review is incomplete: missing ${path.basename(file)}.`,
      );
    }
    const source = fs.readFileSync(file, "utf8");
    if (!source.trim()) {
      throw new Error(
        `Independent review is incomplete: ${path.basename(file)} is empty.`,
      );
    }
  }
  const mainReview = fs.readFileSync(files[0]!, "utf8");
  if (!/independent review/i.test(mainReview)) {
    throw new Error(
      "Independent review is incomplete: review.md lacks an independent review record.",
    );
  }
  for (const file of files.slice(1)) {
    const source = fs.readFileSync(file, "utf8");
    if (!reviewArtifactHasVerdict(source)) {
      throw new Error(
        `Independent review is incomplete: ${path.basename(file)} lacks a completion verdict.`,
      );
    }
  }
  const slopReview = fs.readFileSync(files[3]!, "utf8");
  const missingCategories = Array.from({ length: 24 }, (_, index) => index + 1)
    .filter((category) => {
      const marker = new RegExp(`(?:^|\\s)4\\.${category}(?:\\s|$)`, "m");
      return !marker.test(slopReview);
    });
  if (missingCategories.length > 0) {
    throw new Error(
      `Independent review is incomplete: slop-review.md lacks categories ${missingCategories.map((value) => `4.${value}`).join(", ")}.`,
    );
  }
  return { reviewDirectory, files };
}

function serializeLedger(records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function countStatuses<Status extends string>(
  values: Status[],
  statuses: readonly Status[],
): Record<Status, number> {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      values.filter((value) => value === status).length,
    ]),
  ) as Record<Status, number>;
}

function summarize(
  sentences: SentenceLedgerRecord[],
  structure: StructureLedgerRecord[],
): AdjudicationSummary {
  const statuses = ["pending", "query", "reviewed", "approved"] as const;
  return {
    sentences: countStatuses(
      sentences.map((record) => record.reviewStatus),
      statuses,
    ),
    structure: countStatuses(
      structure.map((record) => record.reviewStatus),
      statuses,
    ),
  };
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { write: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--write") options.write = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--review") {
      options.reviewDirectory = optionValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown option '${arg}'.`);
    }
  }
  return options;
}

function help(): string {
  return [
    "Adjudicate freshly initialized editorial ledgers from completed independent review evidence.",
    "",
    "Usage:",
    "  npm run manuscripts:editorial-ledgers:adjudicate -- --review editorial/reviews/<volume>/<batch> [--write]",
    "",
    "The default is a dry run. Use --write only after reviewing the status counts.",
    "Changed prose is reviewed, unchanged low risk prose may be approved, and authority-sensitive claims remain queries.",
    "No result from this command is publication approval.",
  ].join("\n");
}

function resolveReviewDirectory(value: string): string {
  const reviewDirectory = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, reviewDirectory).replace(/\\/g, "/");
  if (
    relative.startsWith("../") ||
    path.isAbsolute(relative) ||
    !relative.startsWith("editorial/reviews/")
  ) {
    throw new Error("--review must name a batch inside editorial/reviews/.");
  }
  return reviewDirectory;
}

export function runEditorialLedgerAdjudicateCli(
  args = process.argv.slice(2),
): number {
  try {
    const options = parseArgs(args);
    if (options.help) {
      console.log(help());
      return 0;
    }
    if (!options.reviewDirectory) {
      throw new Error("Provide --review.");
    }
    const reviewDirectory = resolveReviewDirectory(options.reviewDirectory);
    assertCompletedIndependentReviews(reviewDirectory);
    const sentenceFile = path.join(reviewDirectory, "sentence-ledger.jsonl");
    const structureFile = path.join(reviewDirectory, "structure-ledger.jsonl");
    const sentences = adjudicateSentenceRecords(
      parseSentenceLedger(fs.readFileSync(sentenceFile, "utf8"), sentenceFile),
    );
    const structure = adjudicateStructureRecords(
      parseStructureLedger(fs.readFileSync(structureFile, "utf8"), structureFile),
    );
    const summary = summarize(sentences, structure);
    if (options.write) {
      writeUtf8(sentenceFile, serializeLedger(sentences));
      writeUtf8(structureFile, serializeLedger(structure));
    }
    const action = options.write ? "Adjudicated" : "Dry run for";
    console.log(
      `${action} ${path.relative(repoRoot, reviewDirectory)}. Sentence statuses: ${JSON.stringify(summary.sentences)}. Structure statuses: ${JSON.stringify(summary.structure)}. This is not publication approval.`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runEditorialLedgerAdjudicateCli();
}
