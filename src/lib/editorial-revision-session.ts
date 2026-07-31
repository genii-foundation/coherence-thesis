export const workingRevisionStatuses = [
  "awaiting-intent",
  "drafting",
  "review",
  "approved",
  "recorded",
] as const;

export type WorkingRevisionStatus = (typeof workingRevisionStatuses)[number];

export type WorkingRevisionVariant = {
  label: string;
  derivedFrom?: string;
  title: string;
  text: string[];
  reasoning: string[];
  status: "candidate" | "rejected" | "approved";
};

export type WorkingRevisionDirection = {
  text: string;
  createdAt: string;
};

export type WorkingRevisionSession = {
  schemaVersion: 1;
  sectionId: string;
  editorialId: string;
  currentHeading: string;
  sourceHref: string;
  paragraphAnchor: string | null;
  selectedPassage: string;
  baseCheckpointId: string | null;
  status: WorkingRevisionStatus;
  directions: WorkingRevisionDirection[];
  variants: WorkingRevisionVariant[];
  approvedVariant: string | null;
  durableRecordPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RevisionPromptContext = {
  sectionId: string;
  editorialId?: string;
  paragraphAnchor?: string;
  selectedPassage?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  label: string,
  source: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${source}: ${label} must be a nonempty string.`);
  }
  return value.trim();
}

function optionalString(
  value: unknown,
  label: string,
  source: string,
): string | null {
  if (value === null) return null;
  return requiredString(value, label, source);
}

function parseDirection(
  value: unknown,
  index: number,
  source: string,
): WorkingRevisionDirection {
  if (!isObject(value)) {
    throw new Error(`${source}: directions[${index}] must be an object.`);
  }
  return {
    text: requiredString(value.text, `directions[${index}].text`, source),
    createdAt: requiredString(
      value.createdAt,
      `directions[${index}].createdAt`,
      source,
    ),
  };
}

function parseVariant(
  value: unknown,
  index: number,
  source: string,
): WorkingRevisionVariant {
  if (!isObject(value)) {
    throw new Error(`${source}: variants[${index}] must be an object.`);
  }
  const status = requiredString(
    value.status,
    `variants[${index}].status`,
    source,
  );
  if (!["candidate", "rejected", "approved"].includes(status)) {
    throw new Error(`${source}: variants[${index}].status is invalid.`);
  }
  if (
    !Array.isArray(value.text) ||
    value.text.length === 0 ||
    value.text.some(
      (paragraph) => typeof paragraph !== "string" || paragraph.trim() === "",
    )
  ) {
    throw new Error(
      `${source}: variants[${index}].text must be a nonempty string array.`,
    );
  }
  if (
    !Array.isArray(value.reasoning) ||
    value.reasoning.length === 0 ||
    value.reasoning.some(
      (note) => typeof note !== "string" || note.trim() === "",
    )
  ) {
    throw new Error(
      `${source}: variants[${index}].reasoning must be a nonempty string array.`,
    );
  }
  return {
    label: requiredString(value.label, `variants[${index}].label`, source),
    ...(value.derivedFrom === undefined
      ? {}
      : {
          derivedFrom: requiredString(
            value.derivedFrom,
            `variants[${index}].derivedFrom`,
            source,
          ),
        }),
    title: requiredString(value.title, `variants[${index}].title`, source),
    text: value.text.map((paragraph) => paragraph.trim()).filter(Boolean),
    reasoning: value.reasoning.map((note) => note.trim()).filter(Boolean),
    status: status as WorkingRevisionVariant["status"],
  };
}

export function parseWorkingRevisionSession(
  value: unknown,
  source = "working revision session",
): WorkingRevisionSession {
  if (!isObject(value)) throw new Error(`${source}: document must be an object.`);
  if (value.schemaVersion !== 1) {
    throw new Error(`${source}: schemaVersion must be 1.`);
  }
  const status = requiredString(value.status, "status", source);
  if (!workingRevisionStatuses.includes(status as WorkingRevisionStatus)) {
    throw new Error(`${source}: status is invalid.`);
  }
  if (!Array.isArray(value.directions)) {
    throw new Error(`${source}: directions must be an array.`);
  }
  if (!Array.isArray(value.variants)) {
    throw new Error(`${source}: variants must be an array.`);
  }

  const variants = value.variants.map((variant, index) =>
    parseVariant(variant, index, source),
  );
  const labels = variants.map((variant) => variant.label);
  if (new Set(labels).size !== labels.length) {
    throw new Error(`${source}: variant labels must be unique.`);
  }
  for (const variant of variants) {
    if (variant.derivedFrom && !labels.includes(variant.derivedFrom)) {
      throw new Error(
        `${source}: variant ${variant.label} derives from missing ${variant.derivedFrom}.`,
      );
    }
  }

  const approvedVariant = optionalString(
    value.approvedVariant,
    "approvedVariant",
    source,
  );
  const approved = variants.filter((variant) => variant.status === "approved");
  const hasApproval = status === "approved" || status === "recorded";
  if (hasApproval) {
    if (
      approved.length !== 1 ||
      approvedVariant === null ||
      approved[0]?.label !== approvedVariant
    ) {
      throw new Error(
        `${source}: approved state requires one matching approved variant.`,
      );
    }
  } else if (approvedVariant !== null || approved.length > 0) {
    throw new Error(
      `${source}: only approved or recorded state may carry approval.`,
    );
  }
  if (status === "recorded" && value.durableRecordPath === null) {
    throw new Error(`${source}: recorded state requires durableRecordPath.`);
  }

  return {
    schemaVersion: 1,
    sectionId: requiredString(value.sectionId, "sectionId", source),
    editorialId: requiredString(value.editorialId, "editorialId", source),
    currentHeading: requiredString(
      value.currentHeading,
      "currentHeading",
      source,
    ),
    sourceHref: requiredString(value.sourceHref, "sourceHref", source),
    paragraphAnchor: optionalString(
      value.paragraphAnchor,
      "paragraphAnchor",
      source,
    ),
    selectedPassage: requiredString(
      value.selectedPassage,
      "selectedPassage",
      source,
    ),
    baseCheckpointId:
      value.baseCheckpointId === undefined
        ? null
        : optionalString(
            value.baseCheckpointId,
            "baseCheckpointId",
            source,
          ),
    status: status as WorkingRevisionStatus,
    directions: value.directions.map((direction, index) =>
      parseDirection(direction, index, source),
    ),
    variants,
    approvedVariant,
    durableRecordPath: optionalString(
      value.durableRecordPath,
      "durableRecordPath",
      source,
    ),
    createdAt: requiredString(value.createdAt, "createdAt", source),
    updatedAt: requiredString(value.updatedAt, "updatedAt", source),
  };
}

export function createWorkingRevisionSession(
  input: Pick<
    WorkingRevisionSession,
    | "sectionId"
    | "editorialId"
    | "currentHeading"
    | "sourceHref"
    | "paragraphAnchor"
    | "selectedPassage"
    | "baseCheckpointId"
  >,
  now: string,
): WorkingRevisionSession {
  return {
    schemaVersion: 1,
    ...input,
    status: "awaiting-intent",
    directions: [],
    variants: [],
    approvedVariant: null,
    durableRecordPath: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function addWorkingRevisionDirection(
  session: WorkingRevisionSession,
  text: string,
  now: string,
): WorkingRevisionSession {
  const direction = text.trim();
  if (!direction) throw new Error("Revision direction must not be empty.");
  if (session.status === "approved" || session.status === "recorded") {
    throw new Error("An approved revision cannot accept more direction.");
  }
  return {
    ...session,
    status: "drafting",
    directions: [...session.directions, { text: direction, createdAt: now }],
    updatedAt: now,
  };
}

export function publishWorkingRevisionVariants(
  session: WorkingRevisionSession,
  value: unknown,
  now: string,
): WorkingRevisionSession {
  if (session.directions.length === 0) {
    throw new Error("Record the editor's direction before publishing variants.");
  }
  if (session.status === "approved" || session.status === "recorded") {
    throw new Error("An approved revision cannot publish another variant set.");
  }
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("Publish at least two distinct variants.");
  }
  const variants = value.map((variant, index) =>
    parseVariant(variant, index, "variant file"),
  );
  if (variants.some((variant) => variant.status === "approved")) {
    throw new Error("Only the editor can approve a variant.");
  }
  const labels = variants.map((variant) => variant.label);
  if (new Set(labels).size !== labels.length) {
    throw new Error("Variant labels must be unique.");
  }
  for (const variant of variants) {
    if (variant.derivedFrom && !labels.includes(variant.derivedFrom)) {
      throw new Error(
        `Variant ${variant.label} derives from missing ${variant.derivedFrom}.`,
      );
    }
  }
  return {
    ...session,
    status: "review",
    variants,
    approvedVariant: null,
    updatedAt: now,
  };
}

export function approveWorkingRevisionVariant(
  session: WorkingRevisionSession,
  label: string,
  now: string,
): WorkingRevisionSession {
  if (session.status !== "review") {
    throw new Error("Variants must be ready for review before approval.");
  }
  if (!session.variants.some((variant) => variant.label === label)) {
    throw new Error(`Unknown variant ${label}.`);
  }
  return {
    ...session,
    status: "approved",
    variants: session.variants.map((variant) => ({
      ...variant,
      status: variant.label === label ? "approved" : "rejected",
    })),
    approvedVariant: label,
    updatedAt: now,
  };
}

export function markWorkingRevisionRecorded(
  session: WorkingRevisionSession,
  durableRecordPath: string,
  now: string,
): WorkingRevisionSession {
  if (session.status !== "approved") {
    throw new Error("Only an approved revision can be recorded.");
  }
  const expectedPath = `editorial/evidence/calibration/${session.editorialId}/${session.sectionId}.json`;
  if (durableRecordPath.trim() !== expectedPath) {
    throw new Error(`Durable record path must be ${expectedPath}.`);
  }
  return {
    ...session,
    status: "recorded",
    durableRecordPath: durableRecordPath.trim(),
    updatedAt: now,
  };
}

export function workingRevisionHref(sectionId: string): string {
  return `/admin/revisions/${sectionId}/`;
}

export function revisionPrompt({
  sectionId,
  editorialId,
  paragraphAnchor,
  selectedPassage,
}: RevisionPromptContext): string {
  return [
    `/coherence-editorial-calibration Revise ${sectionId}`,
    editorialId ? ` in ${editorialId}` : "",
    paragraphAnchor ? ` at paragraph ${paragraphAnchor}` : "",
    selectedPassage ? `. Selected text: ${JSON.stringify(selectedPassage)}` : "",
    `.`,
  ].join("");
}
