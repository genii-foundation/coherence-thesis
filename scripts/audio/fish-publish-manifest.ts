import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  artifactsAudioRoot,
  relativeToRepo,
  type FishAudioFile,
  type FishRunManifest,
} from "./fish-generator";
import {
  ensureDir,
  writeJson,
} from "../manuscripts/shared";
import type {
  AudioClipManifest,
  AudioClipSection,
  AudioClipVoice,
} from "../../src/lib/audio-manifest";
import type { ReaderSectionData } from "../../src/lib/reader-data";
import { isAudioTimingDocument } from "../../src/lib/audio-timings";
import { textForAudio } from "../../src/lib/audio-text";
import { loadAudioLocalEnv } from "./audio-local-env";
import {
  audioManifestSourcePath,
  readerSectionsPath,
} from "../repository/paths";
import {
  assertCanonicalRunManifestPath,
  assertSafeAudioPathSegment,
  resolveAudioRunFile,
  resolveAudioRunRoot,
} from "./audio-paths";

const defaultBucket = "audio-clips";
const defaultCacheControl = "public, max-age=31536000, immutable";
const emptyPayloadHash =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type Options = {
  runId?: string;
  runManifest?: string;
  version: string;
  bucket: string;
  output: string;
  upload: boolean;
  write: boolean;
  skipExisting: boolean;
  concurrency: number;
  projectRef?: string;
  endpoint?: string;
  region?: string;
  publicBase?: string;
  watch: boolean;
  pollMs: number;
  idleTimeoutMs: number;
};

export type PublishCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export type PublishCatalogSection = Pick<
  ReaderSectionData,
  "sectionId" | "title" | "text" | "audioVersionId"
>;

export type PublishableAudioFile = {
  source: FishAudioFile;
  filePath: string;
  objectKey: string;
  href: string;
  contentType: string;
  timingsFilePath?: string;
  timingsObjectKey?: string;
  timingsHref?: string;
};

export type PublishableObject = {
  filePath: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

type RemoteObjectMetadata = {
  byteSize: number | null;
  sha256: string | null;
  contentType: string | null;
  cacheControl: string | null;
};

type UploadResult = {
  uploaded: number;
  skipped: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (
    cause &&
    typeof cause === "object" &&
    ("code" in cause || "hostname" in cause || "syscall" in cause)
  ) {
    const details = cause as {
      code?: string;
      hostname?: string;
      syscall?: string;
    };
    return [
      error.message,
      details.code,
      details.syscall,
      details.hostname,
    ].filter(Boolean).join(" ");
  }
  return error.message;
}

async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  const attempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(750 * attempt);
    }
  }
  throw new Error(`${label}: ${describeFetchError(lastError)}`);
}

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer for ${value}.`);
  }
  return parsed;
}

export function parseAudioPublishOptions(args: string[]): Options {
  const runId = optionValue(args, "--run-id");
  const runManifest = optionValue(args, "--run-manifest");
  if (!runId && !runManifest) {
    throw new Error("Set --run-id or --run-manifest to a generated Fish audio run.");
  }
  if (runId && runManifest) {
    throw new Error("Use either --run-id or --run-manifest, not both.");
  }
  const version = optionValue(args, "--version");
  if (!version) {
    throw new Error("Set --version for immutable audio object paths.");
  }
  assertSafeAudioPathSegment(version, "Audio version");
  if (runId) assertSafeAudioPathSegment(runId, "Audio run id");
  const upload = hasFlag(args, "--upload");
  const bucket = optionValue(args, "--bucket") ?? defaultBucket;
  assertSafeAudioPathSegment(bucket, "Storage bucket");
  return {
    runId,
    runManifest,
    version,
    bucket,
    output:
      optionValue(args, "--output") ??
      audioManifestSourcePath,
    upload,
    write: upload || hasFlag(args, "--write"),
    skipExisting: hasFlag(args, "--skip-existing"),
    concurrency: parsePositiveInteger(optionValue(args, "--concurrency"), 3),
    projectRef:
      optionValue(args, "--project-ref") ?? process.env.SUPABASE_PROJECT_REF,
    endpoint:
      optionValue(args, "--endpoint") ?? process.env.SUPABASE_STORAGE_S3_ENDPOINT,
    region: optionValue(args, "--region") ?? process.env.SUPABASE_S3_REGION,
    publicBase: optionValue(args, "--public-base"),
    watch: hasFlag(args, "--watch"),
    pollMs: parsePositiveInteger(optionValue(args, "--poll-ms"), 5_000),
    idleTimeoutMs: parsePositiveInteger(
      optionValue(args, "--idle-timeout-ms"),
      1_800_000,
    ),
  };
}

function encodeObjectPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function defaultPublicBase(projectRef: string, bucket: string): string {
  return `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}`;
}

function defaultS3Endpoint(projectRef: string): string {
  return `https://${projectRef}.storage.supabase.co/storage/v1/s3`;
}

function publicHref(publicBase: string, objectKey: string): string {
  return `${publicBase.replace(/\/+$/g, "")}/${encodeObjectPath(objectKey)}`;
}

function objectKeyFor(input: {
  version: string;
  voiceId: string;
  audioVersionId: string;
  extension: string;
}): string {
  assertSafeAudioPathSegment(input.version, "Audio version");
  assertSafeAudioPathSegment(input.voiceId, "Voice id");
  assertSafeAudioPathSegment(input.audioVersionId, "Audio version id");
  return [
    "audiobook",
    input.version,
    input.voiceId,
    `${input.audioVersionId}.${input.extension}`,
  ].join("/");
}

function audioContentType(format: FishAudioFile["format"]): string {
  if (format === "opus") return "audio/ogg";
  if (format === "wav") return "audio/wav";
  return "audio/mpeg";
}

function readRunManifest(options: Options): {
  run: FishRunManifest;
  manifestPath: string;
  runRoot: string;
} {
  const canonical = options.runManifest
    ? assertCanonicalRunManifestPath(artifactsAudioRoot(), options.runManifest)
    : (() => {
        const runRoot = resolveAudioRunRoot(artifactsAudioRoot(), options.runId!);
        return { runRoot, manifestPath: path.join(runRoot, "manifest.json") };
      })();
  const { manifestPath, runRoot } = canonical;
  const run = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as FishRunManifest;
  if (run.runId !== path.basename(runRoot)) {
    throw new Error("Audio run manifest id does not match its directory name.");
  }
  return { run, manifestPath, runRoot };
}

function readCatalogSections(): PublishCatalogSection[] {
  return JSON.parse(fs.readFileSync(readerSectionsPath, "utf8")) as ReaderSectionData[];
}

function resolveRunFilePath(file: FishAudioFile, runRoot: string): string {
  return resolveAudioRunFile(runRoot, file.relativeOutputPath, "Audio file path");
}

function generatedFiles(run: FishRunManifest): FishAudioFile[] {
  return run.files.filter((file) => !file.error && (file.generatedAt || file.skipped));
}

export function validateAudioRunForPublish(input: {
  run: FishRunManifest;
  runRoot: string;
  catalogSections: PublishCatalogSection[];
  version: string;
  publicBase: string;
  requireComplete?: boolean;
}): PublishableAudioFile[] {
  if (input.run.mode !== "full") {
    throw new Error("Only a full corpus audio run can be published durably.");
  }
  if (
    input.run.schemaVersion !== 2 ||
    input.run.endpoint !== "stream-with-timestamp"
  ) {
    throw new Error("Durable publication requires a schema version 2 timestamped run.");
  }
  if (
    input.run.voices.length !== 1 ||
    !input.run.voices[0]?.referenceId?.trim()
  ) {
    throw new Error(
      "Durable publication requires exactly one narrator with a pinned reference_id.",
    );
  }
  const runVoiceById = new Map(input.run.voices.map((voice) => [voice.id, voice]));
  if (runVoiceById.size !== input.run.voices.length) {
    throw new Error("An audio run cannot declare duplicate narrator voice ids.");
  }
  if (input.run.corpus.voices !== input.run.voices.length) {
    throw new Error("Audio run voice totals do not match its narrator inventory.");
  }
  const catalogBySectionId = new Map(
    input.catalogSections.map((section) => [section.sectionId, section]),
  );
  const files = generatedFiles(input.run);
  const seen = new Map<string, FishAudioFile>();
  const byVoiceSection = new Map<string, PublishableAudioFile>();
  const publishable: PublishableAudioFile[] = [];

  for (const file of files) {
    const runVoice = runVoiceById.get(file.voiceId);
    if (!runVoice) {
      throw new Error(`Audio file uses an undeclared voice: ${file.voiceId}`);
    }
    if (
      file.provider !== input.run.provider ||
      file.model !== input.run.model ||
      file.voiceLabel !== runVoice.label
    ) {
      throw new Error(
        `Audio provenance does not match the run for ${file.voiceId}/${file.sectionId}.`,
      );
    }
    const catalogSection = catalogBySectionId.get(file.sectionId);
    if (!catalogSection) {
      throw new Error(`Unknown sectionId in audio run: ${file.sectionId}`);
    }
    const canonicalAudioText = textForAudio(catalogSection);
    if (file.title !== catalogSection.title) {
      throw new Error(`Stale title for ${file.sectionId}: ${file.title}`);
    }
    if (catalogSection.audioVersionId !== file.audioVersionId) {
      throw new Error(
        `Stale audioVersionId for ${file.sectionId}: ${file.audioVersionId}`,
      );
    }
    if (
      file.inputCharacters !== canonicalAudioText.length ||
      file.inputBytes !== Buffer.byteLength(canonicalAudioText, "utf8")
    ) {
      throw new Error(`Audio input length does not match current prose for ${file.sectionId}.`);
    }
    if (file.format !== "opus" && file.format !== "wav") {
      throw new Error(`Unsupported audio format for ${file.sectionId}: ${file.format}`);
    }
    const key = `${file.voiceId}:${file.sectionId}:${file.audioVersionId}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate audio mapping for ${file.voiceId}/${file.sectionId}`);
    }
    seen.set(key, file);
    const filePath = resolveRunFilePath(file, input.runRoot);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing audio file for ${file.sectionId}: ${filePath}`);
    }
    const actualByteSize = fs.statSync(filePath).size;
    if (actualByteSize <= 0 || file.byteSize !== actualByteSize) {
      throw new Error(`Audio byte size does not match the run manifest for ${file.sectionId}.`);
    }
    if (!file.durationSeconds || file.durationSeconds <= 0) {
      throw new Error(`Audio duration must be positive for ${file.sectionId}.`);
    }
    const actualAudioSha256 = sha256Hex(fs.readFileSync(filePath));
    if (file.audioSha256 !== actualAudioSha256) {
      throw new Error(`Audio digest does not match the generated run for ${file.sectionId}.`);
    }
    const objectKey = objectKeyFor({
      version: input.version,
      voiceId: file.voiceId,
      audioVersionId: file.audioVersionId,
      extension: file.format,
    });
    let timingsFilePath: string | undefined;
    let timingsObjectKey: string | undefined;
    let timingsHref: string | undefined;
    if (file.timingsRelativeOutputPath) {
      timingsFilePath = resolveAudioRunFile(
        input.runRoot,
        file.timingsRelativeOutputPath,
        "Audio timing path",
      );
      if (!fs.existsSync(timingsFilePath)) {
        throw new Error(`Missing audio timings for ${file.sectionId}: ${timingsFilePath}`);
      }
      const timings: unknown = JSON.parse(fs.readFileSync(timingsFilePath, "utf8"));
      if (
        !isAudioTimingDocument(timings) ||
        timings.sectionId !== file.sectionId ||
        timings.audioVersionId !== file.audioVersionId ||
        timings.voiceId !== file.voiceId ||
        timings.textCharacters !== canonicalAudioText.length ||
        timings.durationSeconds <= 0
      ) {
        throw new Error(`Invalid audio timings for ${file.voiceId}/${file.sectionId}`);
      }
      const allowedDurationDifference = Math.max(
        1.5,
        file.durationSeconds * 0.01,
      );
      if (
        Math.abs(timings.durationSeconds - file.durationSeconds) >
        allowedDurationDifference
      ) {
        throw new Error(
          `Audio and timing durations differ for ${file.voiceId}/${file.sectionId}.`,
        );
      }
      const actualTimingsByteSize = fs.statSync(timingsFilePath).size;
      if (actualTimingsByteSize <= 0 || file.timingsByteSize !== actualTimingsByteSize) {
        throw new Error(
          `Timing byte size does not match the run manifest for ${file.sectionId}.`,
        );
      }
      const actualTimingsSha256 = sha256Hex(fs.readFileSync(timingsFilePath));
      if (file.timingsSha256 !== actualTimingsSha256) {
        throw new Error(
          `Timing digest does not match the generated run for ${file.sectionId}.`,
        );
      }
      timingsObjectKey = objectKeyFor({
        version: input.version,
        voiceId: file.voiceId,
        audioVersionId: file.audioVersionId,
        extension: "timings.json",
      });
      timingsHref = publicHref(input.publicBase, timingsObjectKey);
    } else {
      throw new Error(`Missing timestamp sidecar mapping for ${file.sectionId}.`);
    }
    const entry = {
      source: file,
      filePath,
      objectKey,
      href: publicHref(input.publicBase, objectKey),
      contentType: audioContentType(file.format),
      timingsFilePath,
      timingsObjectKey,
      timingsHref,
    };
    byVoiceSection.set(`${file.voiceId}:${file.sectionId}`, entry);
    publishable.push(entry);
  }

  if (input.requireComplete !== false) {
    for (const voice of input.run.voices) {
      for (const section of input.catalogSections) {
        if (!byVoiceSection.has(`${voice.id}:${section.sectionId}`)) {
          throw new Error(
            `Missing generated audio for ${voice.id}/${section.sectionId}`,
          );
        }
      }
    }
  }

  return publishable;
}

export function createAudioClipManifest(input: {
  run: FishRunManifest;
  catalogSections: PublishCatalogSection[];
  files: PublishableAudioFile[];
}): AudioClipManifest {
  const filesByVoiceSection = new Map(
    input.files.map((file) => [`${file.source.voiceId}:${file.source.sectionId}`, file]),
  );
  const voices: AudioClipVoice[] = input.run.voices.map((voice) => {
    const sections: AudioClipSection[] = input.catalogSections.map((section) => {
      const file = filesByVoiceSection.get(`${voice.id}:${section.sectionId}`);
      if (!file) {
        throw new Error(`Missing validated audio for ${voice.id}/${section.sectionId}`);
      }
      const manifestSection: AudioClipSection = {
        sectionId: file.source.sectionId,
        audioVersionId: file.source.audioVersionId,
        href: file.href,
        format: file.source.format,
        byteSize: file.source.byteSize,
        durationSeconds: file.source.durationSeconds,
      };
      if (file.timingsHref) manifestSection.timingsHref = file.timingsHref;
      if (file.source.timingsByteSize !== undefined) {
        manifestSection.timingsByteSize = file.source.timingsByteSize;
      }
      return manifestSection;
    });
    return {
      id: voice.id,
      label: voice.label,
      provider: input.run.provider,
      model: input.run.model,
      sections,
    };
  });
  return {
    version: 1,
    generatedAt: input.run.generatedAt,
    voices,
  };
}

function sha256Hex(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: crypto.BinaryLike | crypto.KeyObject, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function amzDate(date: Date): { dateStamp: string; timestamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    dateStamp: iso.slice(0, 8),
    timestamp: iso,
  };
}

function canonicalPath(url: URL): string {
  return url.pathname
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/")
    .replace(/%2F/g, "/");
}

function signS3Request(input: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  credentials: PublishCredentials;
  now?: Date;
}): Record<string, string> {
  const now = input.now ?? new Date();
  const { dateStamp, timestamp } = amzDate(now);
  const headers: Record<string, string> = {
    ...input.headers,
    host: input.url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": timestamp,
  };
  const sortedHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers[name]!.trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [
    input.method,
    canonicalPath(input.url),
    input.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.credentials.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, input.credentials.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return {
    ...headers,
    Authorization: [
      `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", "),
  };
}

function s3ObjectUrl(endpoint: string, bucket: string, objectKey: string): URL {
  const base = endpoint.replace(/\/+$/g, "");
  return new URL(`${base}/${encodeURIComponent(bucket)}/${encodeObjectPath(objectKey)}`);
}

async function readRemoteObjectMetadata(input: {
  endpoint: string;
  bucket: string;
  objectKey: string;
  credentials: PublishCredentials;
}): Promise<RemoteObjectMetadata | null> {
  const url = s3ObjectUrl(input.endpoint, input.bucket, input.objectKey);
  const headers = signS3Request({
    method: "HEAD",
    url,
    headers: {},
    payloadHash: emptyPayloadHash,
    credentials: input.credentials,
  });
  const response = await fetchWithRetry(
    url,
    { method: "HEAD", headers },
    `Unable to check object ${input.objectKey}`,
  );
  if (response.status === 404) return null;
  if (response.ok) {
    const contentLength = response.headers.get("content-length");
    const recordedByteSize = response.headers.get("x-amz-meta-byte-size");
    const parsedByteSize = Number(contentLength ?? recordedByteSize);
    return {
      byteSize:
        (contentLength !== null || recordedByteSize !== null) &&
        Number.isFinite(parsedByteSize)
          ? parsedByteSize
          : null,
      sha256: response.headers.get("x-amz-meta-sha256"),
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
    };
  }
  throw new Error(
    `Unable to check object ${input.objectKey}: ${response.status} ${response.statusText}`,
  );
}

export function remoteObjectMatches(
  local: Pick<PublishableObject, "byteSize" | "sha256" | "contentType">,
  remote: RemoteObjectMetadata,
): boolean {
  return (
    (remote.byteSize === null || remote.byteSize === local.byteSize) &&
    remote.sha256 === local.sha256 &&
    remote.contentType === local.contentType &&
    remote.cacheControl === defaultCacheControl
  );
}

function remoteObjectMismatchDetails(
  local: Pick<PublishableObject, "byteSize" | "sha256" | "contentType">,
  remote: RemoteObjectMetadata,
): string {
  return JSON.stringify({
    local,
    remote,
    expectedCacheControl: defaultCacheControl,
  });
}

export async function uploadObject(input: {
  endpoint: string;
  bucket: string;
  file: PublishableObject;
  credentials: PublishCredentials;
}): Promise<"uploaded" | "skipped"> {
  const remote = await readRemoteObjectMetadata({
    endpoint: input.endpoint,
    bucket: input.bucket,
    objectKey: input.file.objectKey,
    credentials: input.credentials,
  });
  if (remote) {
    if (!remoteObjectMatches(input.file, remote)) {
      throw new Error(
        `Existing object does not match the local digest: ${input.file.objectKey} ${remoteObjectMismatchDetails(input.file, remote)}`,
      );
    }
    return "skipped";
  }
  const body = fs.readFileSync(input.file.filePath);
  const payloadHash = sha256Hex(body);
  if (body.byteLength !== input.file.byteSize || payloadHash !== input.file.sha256) {
    throw new Error(`Local audio object changed during publication: ${input.file.filePath}`);
  }
  const url = s3ObjectUrl(input.endpoint, input.bucket, input.file.objectKey);
  const headers = signS3Request({
    method: "PUT",
    url,
    headers: {
      "cache-control": defaultCacheControl,
      "content-type": input.file.contentType,
      "if-none-match": "*",
      "x-amz-meta-byte-size": String(body.byteLength),
      "x-amz-meta-sha256": payloadHash,
    },
    payloadHash,
    credentials: input.credentials,
  });
  const response = await fetchWithRetry(
    url,
    { method: "PUT", headers, body },
    `Unable to upload ${input.file.objectKey}`,
  );
  if (response.status === 409 || response.status === 412) {
    const raced = await readRemoteObjectMetadata({
      endpoint: input.endpoint,
      bucket: input.bucket,
      objectKey: input.file.objectKey,
      credentials: input.credentials,
    });
    if (raced && remoteObjectMatches(input.file, raced)) return "skipped";
    throw new Error(
      `Conditional upload found a different immutable object: ${input.file.objectKey}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Unable to upload ${input.file.objectKey}: ${response.status} ${response.statusText}`,
    );
  }
  const uploaded = await readRemoteObjectMetadata({
    endpoint: input.endpoint,
    bucket: input.bucket,
    objectKey: input.file.objectKey,
    credentials: input.credentials,
  });
  if (!uploaded || !remoteObjectMatches(input.file, uploaded)) {
    const details = uploaded
      ? ` ${remoteObjectMismatchDetails(input.file, uploaded)}`
      : " Remote object was not found after upload.";
    throw new Error(
      `Uploaded object failed digest verification: ${input.file.objectKey}${details}`,
    );
  }
  return "uploaded";
}

function readCredentials(options: Options): PublishCredentials {
  const accessKeyId =
    process.env.SUPABASE_S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.SUPABASE_S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Set SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY in the environment.",
    );
  }
  if (!options.region) {
    throw new Error("Set --region or SUPABASE_S3_REGION from the Supabase S3 settings.");
  }
  return {
    accessKeyId,
    secretAccessKey,
    region: options.region,
  };
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await task(items[index]!, index);
      }
    },
  );
  await Promise.all(workers);
}

async function uploadFiles(input: {
  files: PublishableObject[];
  endpoint: string;
  bucket: string;
  credentials: PublishCredentials;
  skipExisting: boolean;
  concurrency: number;
}): Promise<UploadResult> {
  let uploaded = 0;
  let skipped = 0;
  let completed = 0;
  await runLimited(input.files, input.concurrency, async (file) => {
    const result = await uploadObject({
      endpoint: input.endpoint,
      bucket: input.bucket,
      file,
      credentials: input.credentials,
    });
    if (result === "skipped") {
      if (!input.skipExisting) {
        throw new Error(`Refusing to overwrite existing object: ${file.objectKey}`);
      }
      skipped += 1;
    } else {
      uploaded += 1;
    }
    completed += 1;
    if (completed % 25 === 0 || completed === input.files.length) {
      console.log(
        JSON.stringify({
          progress: completed,
          total: input.files.length,
          uploaded,
          skipped,
        }),
      );
    }
  });
  return { uploaded, skipped };
}

function publishableObjects(files: PublishableAudioFile[]): PublishableObject[] {
  const objectFor = (
    filePath: string,
    objectKey: string,
    contentType: string,
  ): PublishableObject => {
    const body = fs.readFileSync(filePath);
    return {
      filePath,
      objectKey,
      contentType,
      byteSize: body.byteLength,
      sha256: sha256Hex(body),
    };
  };
  return files.flatMap((file) => [
    objectFor(file.filePath, file.objectKey, file.contentType),
    ...(file.timingsFilePath && file.timingsObjectKey
      ? [objectFor(
          file.timingsFilePath,
          file.timingsObjectKey,
          "application/json",
        )]
      : []),
  ]);
}

function isTransientManifestReadError(error: unknown): boolean {
  return error instanceof SyntaxError || (
    error instanceof Error && "code" in error && error.code === "ENOENT"
  );
}

async function main() {
  loadAudioLocalEnv();
  const options = parseAudioPublishOptions(process.argv.slice(2));
  if (options.watch && !options.upload) {
    throw new Error("--watch requires --upload.");
  }
  if (options.watch && !options.skipExisting) {
    throw new Error("--watch requires --skip-existing for resumable immutable uploads.");
  }
  const endpoint = options.endpoint ?? (
    options.projectRef ? defaultS3Endpoint(options.projectRef) : undefined
  );
  const publicBase = options.publicBase ?? (
    options.projectRef ? defaultPublicBase(options.projectRef, options.bucket) : undefined
  );
  if (!publicBase) {
    throw new Error("Set --project-ref or --public-base for public object URLs.");
  }
  if (options.upload && !endpoint) {
    throw new Error("Set --project-ref or --endpoint for Supabase S3 uploads.");
  }
  const catalogSections = readCatalogSections();
  const credentials = options.upload ? readCredentials(options) : undefined;
  const handledObjectKeys = new Set<string>();
  let uploaded = 0;
  let skipped = 0;
  let lastCompleted = -1;
  let lastProgressAt = Date.now();

  while (true) {
    let snapshot: ReturnType<typeof readRunManifest>;
    try {
      snapshot = readRunManifest(options);
    } catch (error) {
      if (options.watch && isTransientManifestReadError(error)) {
        if (Date.now() - lastProgressAt > options.idleTimeoutMs) {
          throw new Error(
            `Audio publishing could not read generation state for ${options.idleTimeoutMs}ms.`,
          );
        }
        await sleep(options.pollMs);
        continue;
      }
      throw error;
    }
    const { run, manifestPath, runRoot } = snapshot;
    const available = generatedFiles(run).length;
    const failed = run.files.filter((file) => Boolean(file.error)).length;
    const completed = available + failed;
    const isComplete = completed === run.files.length;
    const files = validateAudioRunForPublish({
      run,
      runRoot,
      catalogSections,
      version: options.version,
      publicBase,
      requireComplete: !options.watch || (isComplete && failed === 0),
    });
    const objects = publishableObjects(files);
    const pendingObjects = objects.filter(
      (object) => !handledObjectKeys.has(object.objectKey),
    );
    if (options.upload && pendingObjects.length > 0) {
      const result = await uploadFiles({
        files: pendingObjects,
        endpoint: endpoint!,
        bucket: options.bucket,
        credentials: credentials!,
        skipExisting: options.skipExisting,
        concurrency: options.concurrency,
      });
      for (const object of pendingObjects) handledObjectKeys.add(object.objectKey);
      uploaded += result.uploaded;
      skipped += result.skipped;
    }

    if (completed !== lastCompleted) {
      lastCompleted = completed;
      lastProgressAt = Date.now();
      console.log(JSON.stringify({
        watch: options.watch,
        completed,
        available,
        failed,
        total: run.files.length,
        uploadedObjects: uploaded,
        skippedObjects: skipped,
      }));
    }

    if (isComplete) {
      if (failed > 0) {
        throw new Error(
          `Audio generation finished with ${failed} failed file${failed === 1 ? "" : "s"}. Rerun generation before publishing the manifest.`,
        );
      }
      const manifest = createAudioClipManifest({ run, catalogSections, files });
      if (options.write) {
        ensureDir(path.dirname(options.output));
        writeJson(options.output, manifest);
      }
      console.log(
        JSON.stringify(
          {
            runManifest: relativeToRepo(manifestPath),
            mode: options.upload ? "upload" : options.write ? "write" : "validate",
            output: options.write ? relativeToRepo(options.output) : null,
            version: options.version,
            bucket: options.bucket,
            voices: manifest.voices.length,
            clips: files.length,
            objects: objects.length,
            uploaded,
            skipped,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!options.watch) {
      throw new Error(
        `Missing generated audio. ${available.toLocaleString()} of ${run.files.length.toLocaleString()} clips are available.`,
      );
    }
    if (Date.now() - lastProgressAt > options.idleTimeoutMs) {
      throw new Error(
        `Audio publishing saw no generation progress for ${options.idleTimeoutMs}ms.`,
      );
    }
    await sleep(options.pollMs);
  }
}

if (process.argv[1]?.endsWith("fish-publish-manifest.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
