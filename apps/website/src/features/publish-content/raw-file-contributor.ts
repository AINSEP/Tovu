import { createHash } from "node:crypto";
import { executeCommand } from "@jini-ai/cms/core";
import type { JsonObject } from "@jini-ai/core/primitives";
import { computeBlobStorageKey, isDocumentOnlyBlob } from "@jini-ai/cms/media";
import { BackstopRefusal, checkRawFilePath, checkRawValues, BACKSTOP_LIMITS } from "./backstop-policy.js";
import { normalizeMode } from "./file-tree-policy.js";
import type { RawFileInverse, RawFilePort, RawFileSnapshot } from "./backstop-ports.js";
import { PublishContentApplyRowError } from "./apply-errors.js";
import { CONTENT_HASH_VERSION, contentHash } from "./content-hash.js";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler, SkippedPackEntity } from "./type-registry.js";

function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function stateFor({ relPath, file }: { relPath: string; file: RawFileSnapshot }, _optional = {}): Record<string, unknown> {
  return { path: relPath, sha256: sha(file.bytes), size: file.bytes.byteLength, mode: normalizeMode({ mode: file.mode }) };
}
function hash({ relPath, file }: { relPath: string; file: RawFileSnapshot }, _optional = {}): string { return contentHash({ entityType: "raw-file", state: stateFor({ relPath, file }) }); }
function version({ relPath, file }: { relPath: string; file: RawFileSnapshot }, _optional = {}): number { return Number.parseInt(hash({ relPath, file }).slice(0, 12), 16); }

export function contributeRawFilePublish(): PublishContentContributor {
  return { entityType: "raw-file", dependsOn: [], build: (deps: PublishContentDeps) => buildRawFileHandler({ deps }) };
}

type RawFileApplyInput = Parameters<PublishContentHandler["apply"]>[0];
type RawFileGateway = Required<Pick<PublishContentDeps, "changeSets" | "outbox" | "authorize">>;

/** What every step of one built raw-file handler reads. `files` is fixed when the handler is built (as
 *  before the split); `deps.backstop` is read again by each step; `skipped` is the one list `pack`
 *  rewrites and `listSkipped` reads. */
interface RawFileEnv {
  readonly deps: PublishContentDeps;
  readonly files: RawFilePort | undefined;
  readonly skipped: SkippedPackEntity[];
}

/** The state one `apply` command's three hooks share: what `captureInverse` saw, and whether `execute`
 *  wrote. Created by `writeRawFileCommand`, which is its only owner. */
interface RawFileWrite {
  prior: RawFileInverse | undefined;
  priorVersion: number | undefined;
  written: boolean;
}

function pathReason({ deps, relPath }: { deps: PublishContentDeps; relPath: string }, _optional = {}): string | null {
  const policy = checkRawFilePath({ relPath });
  if (policy) return policy;
  return isCoveredPath({ deps, relPath })
    ? `File '${relPath}' already publishes normally; use Overwrite live in normal publishing.` : null;
}

async function loadBlob({ deps, entity }: { deps: PublishContentDeps; entity: PackedEntity }, _optional = {}): Promise<Uint8Array | null> {
  if (!deps.backstop?.blobs) return null;
  const media = deps.ports.media;
  // A forged file entity must not turn private or purged Library bytes into a public file.
  // Missing policy dependencies fail closed rather than allowing an unguarded store read.
  if (!media || await isDocumentOnlyBlob({ deps: { mediaRepo: media.repo, blobRepo: media.assetBlobRepo },
    input: { workspaceId: deps.workspaceId, sha256: entity.state.sha256 as string } })) {
    throw new PublishContentApplyRowError({ rowOutcome: "blocked", message: "Library documents cannot be published" });
  }
  const storageKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256: entity.state.sha256 as string });
  return await deps.backstop.blobs.exists({ storageKey }) ? deps.backstop.blobs.get({ storageKey }) : null;
}

async function checkRawFile(
  { env, entity, sourceBytes }: { env: RawFileEnv; entity: PackedEntity; sourceBytes?: Uint8Array },
  _optional = {}
): Promise<string | null> {
  const { files, deps } = env;
  if (!files) return "Send by hand is not available on this destination.";
  const relPath = entity.state.path;
  if (typeof relPath !== "string") return "Choose a regular file inside the site folder.";
  const denied = pathReason({ deps, relPath }) ?? await files.check({ relPath });
  if (denied) return denied;
  if (!validRawFileMetadata({ entity, relPath })) return "The raw file has an invalid address, size, mode or checksum.";
  return verifiedBytesReason({ entity, bytes: sourceBytes ?? await loadBlob({ deps, entity }), relPath });
}

/** The checks on the bytes themselves: present, as long as stated, matching the checksum, then scanned. */
function verifiedBytesReason(
  { entity, bytes, relPath }: { entity: PackedEntity; bytes: Uint8Array | null; relPath: string },
  _optional = {}
): string | null {
  const { sha256, size } = entity.state;
  if (!bytes || bytes.byteLength !== size || sha(bytes) !== sha256) return "The file's verified bytes are missing on live; send it again.";
  return checkedBytesReason({ entity, bytes, relPath, size: size as number });
}

/** Scans verified raw bytes, then checks the state hash. @complexity O(b) in bytes scanned/hashed. */
function checkedBytesReason({ entity, bytes, relPath, size }: {
  entity: PackedEntity; bytes: Uint8Array; relPath: string; size: number;
}, _options = {}): string | null {
  // Raw files have no extension allowlist. Scan all small files, including unknown extensions,
  // using their real bytes rather than a sender-controlled textSample.
  if (size <= BACKSTOP_LIMITS.scanBytes) {
    const secret = checkRawValues({ values: { [relPath]: Buffer.from(bytes).toString("utf8") } });
    if (secret) return secret;
  }
  return contentHash({ entityType: "raw-file", state: entity.state }) === entity.contentHash ? null : "The raw file does not match its checked content hash.";
}

/** Reads one selected file, retaining policy and read failures as skips. @complexity O(k) plus file read. */
async function selectedFile(
  { env, relPath }: { env: RawFileEnv; relPath: string },
  _options = {}
): Promise<{ reason: string | null; file: RawFileSnapshot | null }> {
  let reason = pathReason({ deps: env.deps, relPath });
  let file: RawFileSnapshot | null = null;
  if (!reason) try {
    if (!env.files) throw new Error("Send by hand has no file reader");
    file = await env.files.read({ relPath });
  } catch (error) {
    // Only expected refusals are public skips; driver/I/O details belong to the failure handler.
    if (!(error instanceof BackstopRefusal)) throw error;
    reason = error.message;
  }
  if (!reason && !file) reason = "The selected file no longer exists.";
  return { reason, file };
}

/** Checks and indexes one snapshot for later blob transfer. @complexity O(b) in file bytes. */
async function packFile({ env, relPath, file }: { env: RawFileEnv; relPath: string; file: RawFileSnapshot }, _options = {}): Promise<PackedEntity | null> {
  const state = stateFor({ relPath, file });
  const entity: PackedEntity = { entityType: "raw-file", id: relPath, schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION,
    contentHash: contentHash({ entityType: "raw-file", state }), requiredBlobs: [state.sha256 as string], state };
  const reason = await checkRawFile({ env, entity, sourceBytes: file.bytes });
  if (reason) env.skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason });
  else {
    const index = env.deps.backstop?.fileBlobIndex;
    if (!index) throw new Error("Send by hand has no file blob index");
    index.set({ sha256: state.sha256 as string, entry: { absPath: file.absPath, size: file.bytes.byteLength } });
    return entity;
  }
  return null;
}

/** Records undo and transaction compensation from the same captured snapshot. @complexity O(1). */
function recordInverse({ deps, entity, inverse }: { deps: PublishContentDeps; entity: PackedEntity; inverse: RawFileInverse }, _options = {}): void {
  deps.backstop?.inverses?.push({ kind: "raw-file", entity, before: inverse, afterHash: entity.contentHash });
  deps.backstop?.fileRollbacks?.push(async () => {
    const reason = await undoRawFile({ deps, entity, before: inverse, afterHash: entity.contentHash });
    if (reason) throw new Error(reason);
  });
}

/** Checks pack availability and selection count before file reads. @complexity O(1). */
function selectedPaths({ env }: { env: RawFileEnv }, _options = {}): readonly string[] | null {
  const { deps } = env;
  if (!env.files || !deps.backstop?.fileBlobIndex) return null;
  const selected = deps.backstop.selection?.files ?? [];
  if (selected.length > BACKSTOP_LIMITS.files) throw new BackstopRefusal({ message: "Choose at most 50 files per send." });
  return selected;
}

async function* packRawFiles({ env }: { env: RawFileEnv }, _optional = {}): AsyncIterable<PackedEntity> {
  env.skipped.length = 0;
  const selected = selectedPaths({ env });
  if (!selected) return;
  let total = 0;
  for (const relPath of selected) {
    const { reason: readReason, file } = await selectedFile({ env, relPath });
    if (readReason || !file) { env.skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason: readReason ?? "The selected file no longer exists." }); continue; }
    total += file.bytes.byteLength;
    if (total > BACKSTOP_LIMITS.bytes) throw new BackstopRefusal({ message: "Choose files totaling at most 50 MB per send." });
    const entity = await packFile({ env, relPath, file });
    if (entity) yield entity;
  }
}

async function inspectRawFile({ env, id: relPath }: { env: RawFileEnv; id: string }, _optional = {}) {
  const { files, deps } = env;
  if (!files || pathReason({ deps, relPath })) return null;
  let file: RawFileSnapshot | null;
  try { file = await files.read({ relPath }); } catch { return null; }
  return file ? { hash: hash({ relPath, file }), hashVersion: CONTENT_HASH_VERSION, version: version({ relPath, file }) } : null;
}

async function precheckRawFile({ env, entity }: { env: RawFileEnv; entity: PackedEntity }, _optional = {}): Promise<string | null> {
  try { return await checkRawFile({ env, entity }); }
  catch (error) {
    if (error instanceof PublishContentApplyRowError) return error.message;
    throw error;
  }
}

/** Reads the file's current state into the shared write state: the undo snapshot and the OCC version
 *  come from the same capture, not from a separate read. */
async function captureRawFileInverse(
  { files, relPath, state }: { files: RawFilePort; relPath: string; state: RawFileWrite },
  _optional = {}
): Promise<JsonObject> {
  const prior = await files.capture({ relPath });
  state.prior = prior;
  // Derive OCC from the same snapshot saved for undo, rather than a separate read.
  state.priorVersion = prior.sha256 === null ? undefined : Number.parseInt(contentHash({ entityType: "raw-file", state: {
    path: prior.relPath, sha256: prior.sha256, size: prior.size, mode: prior.mode,
  } }).slice(0, 12), 16);
  return { ...prior };
}

/** The write itself: OCC against the captured and the current version, then a re-verified blob. */
async function replaceRawFile(
  { env, files, input, state }: { env: RawFileEnv; files: RawFilePort; input: RawFileApplyInput; state: RawFileWrite },
  _optional = {}
): Promise<{ version: number }> {
  const current = await files.read({ relPath: input.entity.id });
  const currentVersion = current ? version({ relPath: input.entity.id, file: current }) : undefined;
  if (state.priorVersion !== input.expectedVersion || currentVersion !== input.expectedVersion) throw new PublishContentApplyRowError({ rowOutcome: "conflict", message: "This file changed on live after it was checked." });
  // Re-read through the shared isolation guard after authorization, immediately before writing.
  const bytes = await loadBlob({ deps: env.deps, entity: input.entity });
  if (!bytes || sha(bytes) !== input.entity.state.sha256) throw new Error("The raw file bytes changed before apply.");
  await files.replace({ relPath: input.entity.id, bytes, mode: input.entity.state.mode as number });
  state.written = true;
  return { version: Number.parseInt(input.entity.contentHash.slice(0, 12), 16) };
}

async function writeRawFileCommand(
  { env, files, gateway, input }: { env: RawFileEnv; files: RawFilePort; gateway: RawFileGateway; input: RawFileApplyInput },
  _optional = {}
): Promise<{ changeSetId: string }> {
  const { deps } = env;
  const state: RawFileWrite = { prior: undefined, priorVersion: undefined, written: false };
  const result = await executeCommand<{ version: number }>({
    deps: { clock: deps.clock, idGen: deps.idGen, changeSets: gateway.changeSets, outbox: gateway.outbox, authorize: gateway.authorize },
    command: { workspaceId: deps.workspaceId, actor: { kind: "user", id: input.principalId }, permission: "publish.backstop",
      summary: `Send '${input.entity.id}' by hand`, idempotencyKey: input.idempotencyKey },
    mutation: { entityType: "raw-file", entityId: input.entity.id, operation: input.expectedVersion === undefined ? "create" : "update",
      captureInverse: () => captureRawFileInverse({ files, relPath: input.entity.id, state }),
      execute: () => replaceRawFile({ env, files, input, state }),
      captureEntityVersion: ({ result: saved }) => saved.version,
      rollback: async () => { if (state.written && state.prior) await files.restore({ inverse: state.prior }); },
    },
  });
  const inverse = state.prior;
  if (inverse) recordInverse({ deps, entity: input.entity, inverse });
  return { changeSetId: result.changeSetId };
}

async function applyRawFile({ env, input }: { env: RawFileEnv; input: RawFileApplyInput }, _optional = {}): Promise<{ changeSetId: string }> {
  const { files, deps } = env;
  const reason = await checkRawFile({ env, entity: input.entity });
  if (reason) throw new PublishContentApplyRowError({ rowOutcome: "blocked", message: reason });
  const { changeSets, outbox, authorize } = deps;
  if (!files || !changeSets || !outbox || !authorize) throw new Error("The raw file command gateway is not wired.");
  return writeRawFileCommand({ env, files, gateway: { changeSets, outbox, authorize }, input });
}

function buildRawFileHandler({ deps }: { deps: PublishContentDeps }, _optional = {}): PublishContentHandler {
  const env: RawFileEnv = { deps, files: deps.backstop?.files, skipped: [] };
  return {
    entityType: "raw-file", schemaVersion: 1, permission: "publish.backstop", dependsOn: [], idempotencyScope: "run",
    pack: () => packRawFiles({ env }),
    inspect: ({ id }: { id: string }, _optional = {}) => inspectRawFile({ env, id }),
    precheck: ({ entity }: { entity: PackedEntity }, _optional = {}) => precheckRawFile({ env, entity }),
    apply: (input: RawFileApplyInput) => applyRawFile({ env, input }),
    listSkipped: async () => [...env.skipped],
  };
}

export async function undoRawFile(
  { deps, entity, before, afterHash }: { deps: PublishContentDeps; entity: PackedEntity; before: RawFileInverse; afterHash: string },
  _optional = {},
): Promise<string | null> {
  const files = deps.backstop?.files;
  if (!files) return "Send by hand is not available on this destination.";
  if (before.relPath !== entity.id) return "The saved undo file does not match this item.";
  const denied = checkRawFilePath({ relPath: entity.id }) ?? await files.check({ relPath: entity.id });
  if (denied) return denied;
  if (isCoveredPath({ deps, relPath: entity.id })) return `File '${entity.id}' already publishes normally; it was left alone.`;
  const current = await files.read({ relPath: entity.id });
  if (!current || hash({ relPath: entity.id, file: current }) !== afterHash) return `File '${entity.id}' changed on live after this send; it was left alone.`;
  await files.restore({ inverse: before });
  return null;
}

/** Checks wire metadata without reading any blob. @complexity O(1). */
function validRawFileMetadata({ entity, relPath }: { entity: PackedEntity; relPath: string }, _options = {}): boolean {
  const { sha256, size, mode } = entity.state;
  if (entity.id !== relPath || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) return false;
  if (!validRawFileSize({ size })) return false;
  if (mode !== 0o644 && mode !== 0o755) return false;
  return entity.requiredBlobs.length === 1 && entity.requiredBlobs[0] === sha256;
}

/** Validates size before any byte access. @complexity O(1). */
function validRawFileSize({ size }: { size: unknown }, _options = {}): boolean {
  return typeof size === "number" && Number.isSafeInteger(size) && size >= 0 && size <= BACKSTOP_LIMITS.bytes;
}

/** Packing and undo share case-insensitive coverage so an undo cannot bypass normal publishing.
 * @complexity O(r * k) time for r roots of length k, plus O(p) path normalization.
 */
function isCoveredPath({ deps, relPath }: { deps: PublishContentDeps; relPath: string }, _options = {}): boolean | undefined {
  const normalizedPath = relPath.toLowerCase();
  return deps.backstop?.coveredRoots.some((root) => {
    const normalizedRoot = root.toLowerCase().replace(/\/$/, "");
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + "/");
  });
}
