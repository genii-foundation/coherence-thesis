import { pathToFileURL } from "node:url";
import {
  auditSemanticLinks,
  loadSemanticLinkAuditInput,
  type SemanticLinkAuditInput,
} from "./audit-semantic-links";
import {
  validateSemanticLinkRegistryShape,
  type SemanticLinkAuditReport,
} from "./semantic-links";

export function validateSemanticLinkAuditState(
  input: SemanticLinkAuditInput,
): SemanticLinkAuditReport {
  const registry = validateSemanticLinkRegistryShape(input.registry);
  const report = auditSemanticLinks({ ...input, registry });
  const candidatesById = new Map(
    report.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  for (const occurrence of registry.occurrences) {
    const candidate = candidatesById.get(occurrence.occurrenceId);
    if (!candidate) {
      throw new Error(
        `Approved semantic link occurrence '${occurrence.occurrenceId}' no longer resolves in canonical prose. Run the advisory audit and review the source locator.`,
      );
    }
    const expectedDisposition =
      occurrence.decision === "link" ? "approved-link" : "reviewed-exclusion";
    if (candidate.disposition !== expectedDisposition) {
      throw new Error(
        `Approved semantic link occurrence '${occurrence.occurrenceId}' resolved as ${candidate.disposition}, expected ${expectedDisposition}.`,
      );
    }
    const concept = registry.concepts.find(
      (item) => item.conceptId === occurrence.conceptId,
    );
    if (!concept || candidate.target.continuityId !== concept.targetContinuityId) {
      throw new Error(
        `Approved semantic link occurrence '${occurrence.occurrenceId}' no longer resolves to its reviewed target.`,
      );
    }
  }
  return report;
}

export function runSemanticLinkValidationCli(
  args = process.argv.slice(2),
): number {
  try {
    if (args.length > 0) {
      throw new Error(
        `Semantic link validation accepts no options. Received: ${args.join(", ")}.`,
      );
    }
    const report = validateSemanticLinkAuditState(loadSemanticLinkAuditInput());
    console.log(
      `Validated ${report.counts.approvedLinks.toLocaleString()} approved semantic link(s) and ${report.counts.reviewedExclusions.toLocaleString()} reviewed exclusion(s).`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runSemanticLinkValidationCli();
}
