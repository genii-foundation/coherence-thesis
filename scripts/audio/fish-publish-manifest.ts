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
  progressSectionsPath,
  writeJson,
} from "../manuscripts/shared";
import type {
  AudioClipManifest,
  AudioClipSection,
  AudioClipVoice,
} from "../../src/lib/audio-manifest";
import type { ProgressSectionData } from "../../src/lib/reader-data";
import { audioManifestSourcePath } from "../repository/paths";

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
};

type PublishCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export type PublishCatalogSection = Pick<
  ProgressSectionData,
  "sectionId" | "title" | "audioVersionId"
>;

export type PublishableAudioFile = {
  source: FishAudioFile;
  filePath: string;
  objectKey: string;
  href: string;
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
  const upload = hasFlag(args, "--upload");
  return {
    runId,
    runManifest,
    version,
    bucket: optionValue(args, "--bucket") ?? defaultBucket,
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
}): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(input.voiceId)) {
    throw new Error(`Voice id '${input.voiceId}' is not safe for object keys.`);
  }
  return [
    "audiobook",
    input.version,
    input.voiceId,
    `${input.audioVersionId}.mp3`,
  ].join("/");
}

function readRunManifest(options: Options): {
  run: FishRunManifest;
  manifestPath: string;
  runRoot: string;
} {
  const manifestPath = options.runManifest
    ? path.resolve(options.runManifest)
    : path.join(artifactsAudioRoot(), options.runId!, "manifest.json");
  const run = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as FishRunManifest;
  return { run, manifestPath, runRoot: path.dirname(manifestPath) };
}

function readCatalogSections(): PublishCatalogSection[] {
  return JSON.parse(fs.readFileSync(progressSectionsPath, "utf8")) as ProgressSectionData[];
}

function resolveRunFilePath(file: FishAudioFile, runRoot: string): string {
  if (path.isAbsolute(file.outputPath) && fs.existsSync(file.outputPath)) {
    return file.outputPath;
  }
  return path.resolve(runRoot, file.relativeOutputPath);
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
}): PublishableAudioFile[] {
  const catalogBySectionId = new Map(
    input.catalogSections.map((section) => [section.sectionId, section]),
  );
  const files = generatedFiles(input.run);
  const seen = new Map<string, FishAudioFile>();
  const byVoiceSection = new Map<string, PublishableAudioFile>();
  const publishable: PublishableAudioFile[] = [];

  for (const file of files) {
    const catalogSection = catalogBySectionId.get(file.sectionId);
    if (!catalogSection) {
      throw new Error(`Unknown sectionId in audio run: ${file.sectionId}`);
    }
    if (catalogSection.audioVersionId !== file.audioVersionId) {
      throw new Error(
        `Stale audioVersionId for ${file.sectionId}: ${file.audioVersionId}`,
      );
    }
    if (file.format !== "mp3") {
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
    const objectKey = objectKeyFor({
      version: input.version,
      voiceId: file.voiceId,
      audioVersionId: file.audioVersionId,
    });
    const entry = {
      source: file,
      filePath,
      objectKey,
      href: publicHref(input.publicBase, objectKey),
    };
    byVoiceSection.set(`${file.voiceId}:${file.sectionId}`, entry);
    publishable.push(entry);
  }

  for (const voice of input.run.voices) {
    for (const section of input.catalogSections) {
      if (!byVoiceSection.has(`${voice.id}:${section.sectionId}`)) {
        throw new Error(
          `Missing generated audio for ${voice.id}/${section.sectionId}`,
        );
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
      return {
        sectionId: file.source.sectionId,
        audioVersionId: file.source.audioVersionId,
        href: file.href,
        byteSize: file.source.byteSize,
        durationSeconds: file.source.durationSeconds,
      };
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

async function objectExists(input: {
  endpoint: string;
  bucket: string;
  objectKey: string;
  credentials: PublishCredentials;
}): Promise<boolean> {
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
  if (response.status === 404) return false;
  if (response.ok) return true;
  throw new Error(
    `Unable to check object ${input.objectKey}: ${response.status} ${response.statusText}`,
  );
}

async function uploadObject(input: {
  endpoint: string;
  bucket: string;
  file: PublishableAudioFile;
  credentials: PublishCredentials;
}): Promise<"uploaded" | "skipped"> {
  const exists = await objectExists({
    endpoint: input.endpoint,
    bucket: input.bucket,
    objectKey: input.file.objectKey,
    credentials: input.credentials,
  });
  if (exists) return "skipped";
  const body = fs.readFileSync(input.file.filePath);
  const payloadHash = sha256Hex(body);
  const url = s3ObjectUrl(input.endpoint, input.bucket, input.file.objectKey);
  const headers = signS3Request({
    method: "PUT",
    url,
    headers: {
      "cache-control": defaultCacheControl,
      "content-type": "audio/mpeg",
    },
    payloadHash,
    credentials: input.credentials,
  });
  const response = await fetchWithRetry(
    url,
    { method: "PUT", headers, body },
    `Unable to upload ${input.file.objectKey}`,
  );
  if (!response.ok) {
    throw new Error(
      `Unable to upload ${input.file.objectKey}: ${response.status} ${response.statusText}`,
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
  files: PublishableAudioFile[];
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

async function main() {
  const options = parseAudioPublishOptions(process.argv.slice(2));
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
  const { run, manifestPath, runRoot } = readRunManifest(options);
  const catalogSections = readCatalogSections();
  const files = validateAudioRunForPublish({
    run,
    runRoot,
    catalogSections,
    version: options.version,
    publicBase,
  });
  const manifest = createAudioClipManifest({
    run,
    catalogSections,
    files,
  });

  let uploadResult: UploadResult = { uploaded: 0, skipped: 0 };
  if (options.upload) {
    uploadResult = await uploadFiles({
      files,
      endpoint: endpoint!,
      bucket: options.bucket,
      credentials: readCredentials(options),
      skipExisting: options.skipExisting,
      concurrency: options.concurrency,
    });
  }

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
        uploaded: uploadResult.uploaded,
        skipped: uploadResult.skipped,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith("fish-publish-manifest.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
