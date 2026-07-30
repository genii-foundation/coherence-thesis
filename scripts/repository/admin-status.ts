import { readFileSync } from "node:fs";
import path from "node:path";

import { readEditorialVolumeProgress } from "../editorial/progress-data";
import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialTaskRegisterPath,
  editorialVolumeIds,
} from "./paths";

const tiers = new Set(["green", "amber", "red"]);
const states = new Set(["pending", "in-progress", "blocked", "done"]);
const manualProgressPattern =
  /\b\d+\s+(?:of|\/)\s*\d+\s+sections?\s+(?:rendered|settled)\b/i;

type TaskProgress = {
  kind?: unknown;
  editorialId?: unknown;
};

type Task = {
  id?: unknown;
  title?: unknown;
  tier?: unknown;
  status?: unknown;
  area?: unknown;
  detail?: unknown;
  blockedBy?: unknown;
  progress?: unknown;
};

type TaskRegister = {
  schemaVersion?: unknown;
  updated?: unknown;
  tasks?: unknown;
};

function fail(message: string): never {
  throw new Error(`Admin status is invalid: ${message}`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a nonempty string.`);
  }
  return value.trim();
}

export function validateAdminStatus(
  registerValue: unknown,
  {
    reviewsRoot = editorialReviewsRoot,
    calibrationRoot = editorialCalibrationRoot,
  }: {
    reviewsRoot?: string;
    calibrationRoot?: string;
  } = {},
): { tasks: number; progressTasks: number } {
  if (!registerValue || typeof registerValue !== "object") {
    fail("tasks.json must contain an object.");
  }
  const register = registerValue as TaskRegister;
  if (register.schemaVersion !== 1) fail("schemaVersion must be 1.");
  const updated = requiredString(register.updated, "updated");
  if (Number.isNaN(Date.parse(updated))) fail("updated must be an ISO date.");
  if (!Array.isArray(register.tasks)) fail("tasks must be an array.");

  const tasks = register.tasks as Task[];
  const ids = tasks.map((task, index) =>
    requiredString(task.id, `tasks[${index}].id`),
  );
  if (new Set(ids).size !== ids.length) fail("task ids must be unique.");
  const idSet = new Set(ids);
  let progressTasks = 0;

  tasks.forEach((task, index) => {
    const prefix = `tasks[${index}]`;
    const id = ids[index]!;
    if (!/^T-\d{3}$/.test(id)) fail(`${id} must use the T-000 format.`);
    requiredString(task.title, `${prefix}.title`);
    requiredString(task.area, `${prefix}.area`);
    const tier = requiredString(task.tier, `${prefix}.tier`);
    if (!tiers.has(tier)) fail(`${id} has invalid tier ${tier}.`);
    const status = requiredString(task.status, `${prefix}.status`);
    if (!states.has(status)) fail(`${id} has invalid status ${status}.`);

    if (task.detail !== undefined) {
      const detail = requiredString(task.detail, `${prefix}.detail`);
      if (task.progress && manualProgressPattern.test(detail)) {
        fail(
          `${id} duplicates derived section progress in detail. Read it from the progress source instead.`,
        );
      }
    }

    const blockedBy = task.blockedBy ?? [];
    if (!Array.isArray(blockedBy)) fail(`${id}.blockedBy must be an array.`);
    for (const dependencyValue of blockedBy) {
      const dependency = requiredString(
        dependencyValue,
        `${id}.blockedBy entry`,
      );
      if (dependency === id) fail(`${id} cannot block itself.`);
      if (!idSet.has(dependency)) {
        fail(`${id} references missing dependency ${dependency}.`);
      }
    }

    if (task.progress === undefined) return;
    if (!task.progress || typeof task.progress !== "object") {
      fail(`${id}.progress must be an object.`);
    }
    progressTasks += 1;
    const progress = task.progress as TaskProgress;
    if (progress.kind !== "calibration") {
      fail(`${id}.progress.kind must be calibration.`);
    }
    const editorialId = requiredString(
      progress.editorialId,
      `${id}.progress.editorialId`,
    );
    if (!editorialVolumeIds.includes(editorialId)) {
      fail(`${id} references unknown volume ${editorialId}.`);
    }
    const derived = readEditorialVolumeProgress(editorialId, {
      reviewsRoot,
      calibrationRoot,
    });
    if (!derived) fail(`${id} cannot resolve the current review baseline.`);
    if (status === "done" && derived.rendered !== derived.total) {
      fail(
        `${id} is done but only ${derived.rendered} of ${derived.total} sections have calibration records.`,
      );
    }
  });

  return { tasks: tasks.length, progressTasks };
}

export function main(): void {
  const register = JSON.parse(
    readFileSync(editorialTaskRegisterPath, "utf8"),
  ) as unknown;
  const report = validateAdminStatus(register);
  process.stdout.write(
    `Admin status is valid. ${report.tasks.toLocaleString()} tasks and ${report.progressTasks.toLocaleString()} derived progress task(s) checked.\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === import.meta.filename) main();
