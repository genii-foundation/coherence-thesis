import { describe, expect, it } from "vitest";

import {
  addWorkingRevisionDirection,
  approveWorkingRevisionVariant,
  createWorkingRevisionSession,
  markWorkingRevisionRecorded,
  parseWorkingRevisionSession,
  publishWorkingRevisionVariants,
  revisionPrompt,
} from "./editorial-revision-session";

const startedAt = "2026-07-30T12:00:00.000Z";

function newSession() {
  return createWorkingRevisionSession(
    {
      sectionId: "v01-orientation",
      editorialId: "volume-01",
      currentHeading: "Orientation",
      sourceHref: "/manuscripts/1/opening/orientation/",
      paragraphAnchor: "p-hf0505fc63ec527f1",
      selectedPassage: "Civilization faces a coordination problem.",
      baseCheckpointId: "volume-01/original",
    },
    startedAt,
  );
}

describe("working editorial revision sessions", () => {
  it("opens with no inferred intent, variants, or durable evidence", () => {
    const session = newSession();

    expect(session.status).toBe("awaiting-intent");
    expect(session.directions).toEqual([]);
    expect(session.variants).toEqual([]);
    expect(session.approvedVariant).toBeNull();
    expect(session.durableRecordPath).toBeNull();
    expect(parseWorkingRevisionSession(session)).toEqual(session);
  });

  it("requires editor direction before variants and editor approval before recording", () => {
    const session = newSession();
    expect(() =>
      publishWorkingRevisionVariants(session, [], "2026-07-30T12:01:00.000Z"),
    ).toThrow("Record the editor's direction");

    const directed = addWorkingRevisionDirection(
      session,
      "Make the causal sequence easier to follow without softening the claim.",
      "2026-07-30T12:01:00.000Z",
    );
    const reviewing = publishWorkingRevisionVariants(
      directed,
      [
        {
          label: "A",
          title: "Closer causal sequence",
          text: ["Civilization faces a coordination problem."],
          reasoning: ["Keeps the claim and clarifies the sequence."],
          status: "candidate",
        },
        {
          label: "B",
          title: "More explicit transition",
          text: ["Civilization now faces a coordination problem."],
          reasoning: ["Makes the timing explicit at the cost of added emphasis."],
          status: "candidate",
        },
      ],
      "2026-07-30T12:02:00.000Z",
    );

    expect(() =>
      markWorkingRevisionRecorded(
        reviewing,
        "editorial/evidence/calibration/volume-01/v01-orientation.json",
        "2026-07-30T12:03:00.000Z",
      ),
    ).toThrow("Only an approved revision");

    const approved = approveWorkingRevisionVariant(
      reviewing,
      "A",
      "2026-07-30T12:03:00.000Z",
    );
    const recorded = markWorkingRevisionRecorded(
      approved,
      "editorial/evidence/calibration/volume-01/v01-orientation.json",
      "2026-07-30T12:04:00.000Z",
    );

    expect(approved.variants.find((variant) => variant.label === "A")?.status).toBe(
      "approved",
    );
    expect(recorded.status).toBe("recorded");
  });

  it("builds a compact skill invocation without duplicating its workflow", () => {
    const prompt = revisionPrompt({
      sectionId: "v01-orientation",
      editorialId: "volume-01",
      paragraphAnchor: "p-hf0505fc63ec527f1",
      selectedPassage: "Civilization faces a coordination problem.",
    });

    expect(prompt).toBe(
      '/coherence-editorial-calibration Revise v01-orientation in volume-01 at paragraph p-hf0505fc63ec527f1. Selected text: "Civilization faces a coordination problem.".',
    );
    expect(prompt).not.toContain("npm run");
    expect(prompt).not.toContain("Do not create");
  });
});
