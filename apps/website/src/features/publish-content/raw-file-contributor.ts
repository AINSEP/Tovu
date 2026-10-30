import { createHash } from "node:crypto";
import { executeCommand } from "@jini-ai/cms/core";
import { computeBlobStorageKey, isDocumentOnlyBlob } from "@jini-ai/cms/media";
import { checkRawFilePath, checkRawValues, BACKSTOP_LIMITS } from "./backstop-policy.js";
import { normalizeMode } from "./file-tree-policy.js";
import type { RawFileInverse, RawFileSnapshot } from "./backstop-ports.js";
import { PublishContentApplyRowError } from "./apply-errors.js";
import { CONTENT_HASH_VERSION, contentHash } from "./content-hash.js";
import type { PackedEntity, PublishContentContributor, PublishContentDeps, PublishContentHandler, SkippedPackEntity } from "./type-registry.js";

function sha(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function stateFor(relPath: string, file: RawFileSnapshot): Record<string, unknown> {
  return { path: relPath, sha256: sha(file.bytes), size: file.bytes.byteLength, mode: normalizeMode(file.mode) };
}
function hash(relPath: string, file: RawFileSnapshot): string { return contentHash("raw-file", stateFor(relPath, file)); }
function version(relPath: string, file: RawFileSnapshot): number { return Number.parseInt(hash(relPath, file).slice(0, 12), 16); }

export function contributeRawFilePublish(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): PublishContentContributor {
  return { entityType: "raw-file", dependsOn: [], build: (deps) => {
    const files = deps.backstop?.files;
    const skipped: SkippedPackEntity[] = [];
    function pathReason(relPath: string): string | null {
      const policy = checkRawFilePath({ relPath });
      if (policy) return policy;
      return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCase().replace(/\/$/, "") ||
        relPath.toLowerCase().startsWith(root.toLowerCase().replace(/\/$/, "") + "/"))
        ? `File '${relPath}' already publishes normally; use Overwrite live in normal publishing.` : null;
    }
    async function blob(entity: PackedEntity): Promise<Uint8Array | null> {
      if (!deps.backstop?.blobs) return null;
      const media = deps.ports.media;
      // A forged file entity must not turn private or purged Library bytes into a public file.
      // Missing policy dependencies fail closed rather than allowing an unguarded store read.
      if (!media || await isDocumentOnlyBlob({ deps: { mediaRepo: media.repo, blobRepo: media.assetBlobRepo },
        input: { workspaceId: deps.workspaceId, sha256: entity.state.sha256 as string } })) {
        throw new PublishContentApplyRowError("blocked", "Library documents cannot be published");
      }
      const storageKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256: entity.state.sha256 as string });
      return await deps.backstop.blobs.exists({ storageKey }) ? deps.backstop.blobs.get({ storageKey }) : null;
    }
    async function check(entity: PackedEntity, sourceBytes?: Uint8Array): Promise<string | null> {
      if (!files) return "Send by hand is not available on this destination.";
      const relPath = entity.state.path;
      if (typeof relPath !== "string") return "Choose a regular file inside the site folder.";
      const denied = pathReason(relPath) ?? await files.check({ relPath });
      if (denied) return denied;
      const { sha256, size } = entity.state;
      if (!validRawFileMetadata({ entity, relPath })) return "The raw file has an invalid address, size, mode or checksum.";
      const bytes = sourceBytes ?? await blob(entity);
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
      return contentHash("raw-file", entity.state) === entity.contentHash ? null : "The raw file does not match its checked content hash.";
    }

    /** Reads one selected file, retaining policy and read failures as skips. @complexity O(k) plus file read. */
    async function selectedFile({ relPath }: { relPath: string }, _options = {}): Promise<{ reason: string | null; file: RawFileSnapshot | null }> {
      let reason = pathReason(relPath);
      let file: RawFileSnapshot | null = null;
      if (!reason) try { file = await files!.read({ relPath }); } catch (error) { reason = error instanceof Error ? error.message : "This file cannot be sent safely."; }
      if (!reason && !file) reason = "The selected file no longer exists.";
      return { reason, file };
    }
    /** Checks and indexes one snapshot for later blob transfer. @complexity O(b) in file bytes. */
    async function packFile({ relPath, file }: { relPath: string; file: RawFileSnapshot }, _options = {}): Promise<PackedEntity | null> {
      const state = stateFor(relPath, file);
      const entity: PackedEntity = { entityType: "raw-file", id: relPath, schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION,
        contentHash: contentHash("raw-file", state), requiredBlobs: [state.sha256 as string], state };
      const reason = await check(entity, file.bytes);
      if (reason) skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason });
      else {
        deps.backstop!.fileBlobIndex!.set(state.sha256 as string, { absPath: file.absPath, size: file.bytes.byteLength });
        return entity;
      }
      return null;
    }
    /** Records undo and transaction compensation from the same captured snapshot. @complexity O(1). */
    function recordInverse({ entity, inverse }: { entity: PackedEntity; inverse: RawFileInverse }, _options = {}): void {
      deps.backstop?.inverses?.push({ kind: "raw-file", entity, before: inverse, afterHash: entity.contentHash });
      deps.backstop?.fileRollbacks?.push(async () => {
        const reason = await undoRawFile({ deps, entity, before: inverse, afterHash: entity.contentHash });
        if (reason) throw new Error(reason);
      });
    }
    /** Checks pack availability and selection count before file reads. @complexity O(1). */
    function selectedPaths(_required: Record<string, never>, _options = {}): readonly string[] | null {
      if (!files || !deps.backstop?.fileBlobIndex) return null;
      const selected = deps.backstop.selection?.files ?? [];
      if (selected.length > BACKSTOP_LIMITS.files) throw new Error("Choose at most 50 files per send.");
      return selected;
    }
    const handler: PublishContentHandler = {
      entityType: "raw-file", schemaVersion: 1, permission: "publish.backstop", dependsOn: [], idempotencyScope: "run",
      pack: async function* () {
        skipped.length = 0;
        const selected = selectedPaths({}, {});
        if (!selected) return;
        let total = 0;
        for (const relPath of selected) {
          const { reason: readReason, file } = await selectedFile({ relPath });
          if (readReason || !file) { skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason: readReason! }); continue; }
          total += file.bytes.byteLength;
          if (total > BACKSTOP_LIMITS.bytes) throw new Error("Choose files totaling at most 50 MB per send.");
          const entity = await packFile({ relPath, file });
          if (entity) yield entity;
        }
      },
      inspect: async (relPath) => {
        if (!files || pathReason(relPath)) return null;
        let file: RawFileSnapshot | null;
        try { file = await files.read({ relPath }); } catch { return null; }
        return file ? { hash: hash(relPath, file), hashVersion: CONTENT_HASH_VERSION, version: version(relPath, file) } : null;
      },
      precheck: async (entity) => {
        try { return await check(entity); }
        catch (error) {
          if (error instanceof PublishContentApplyRowError) return error.message;
          throw error;
        }
      },
      apply: async (input) => {
        const reason = await check(input.entity);
        if (reason) throw new PublishContentApplyRowError("blocked", reason);
        if (!files || !deps.changeSets || !deps.outbox || !deps.authorize) throw new Error("The raw file command gateway is not wired.");
        let prior: RawFileInverse | undefined;
        let priorVersion: number | undefined;
        let written = false;
        const result = await executeCommand<{ version: number }>({
          deps: { clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox: deps.outbox, authorize: deps.authorize },
          command: { workspaceId: deps.workspaceId, actor: { kind: "user", id: input.principalId }, permission: "publish.backstop",
            summary: `Send '${input.entity.id}' by hand`, idempotencyKey: input.idempotencyKey },
          mutation: { entityType: "raw-file", entityId: input.entity.id, operation: input.expectedVersion === undefined ? "create" : "update",
            captureInverse: async () => {
              prior = await files.capture({ relPath: input.entity.id });
              // Derive OCC from the same snapshot saved for undo, rather than a separate read.
              priorVersion = prior.sha256 === null ? undefined : Number.parseInt(contentHash("raw-file", {
                path: prior.relPath, sha256: prior.sha256, size: prior.size, mode: prior.mode,
              }).slice(0, 12), 16);
              return { ...prior };
            },
            execute: async () => {
              const current = await files.read({ relPath: input.entity.id });
              const currentVersion = current ? version(input.entity.id, current) : undefined;
              if (priorVersion !== input.expectedVersion || currentVersion !== input.expectedVersion) throw new PublishContentApplyRowError("conflict", "This file changed on live after it was checked.");
              // Re-read through the shared isolation guard after authorization, immediately before writing.
              const bytes = await blob(input.entity);
              if (!bytes || sha(bytes) !== input.entity.state.sha256) throw new Error("The raw file bytes changed before apply.");
              await files.replace({ relPath: input.entity.id, bytes, mode: input.entity.state.mode as number });
              written = true;
              return { version: Number.parseInt(input.entity.contentHash.slice(0, 12), 16) };
            },
            captureEntityVersion: ({ result: saved }) => saved.version,
            rollback: async () => { if (written && prior) await files.restore({ inverse: prior }); },
          },
        });
        const inverse = prior as RawFileInverse | undefined;
        if (inverse) recordInverse({ entity: input.entity, inverse });
        return { changeSetId: result.changeSetId };
      },
      listSkipped: async () => [...skipped],
    };
    return handler;
  } };
}

export async function undoRawFile(
  { deps, entity, before, afterHash }: { deps: PublishContentDeps; entity: PackedEntity; before: RawFileInverse; afterHash: string },
  _optional: Record<string, never> = {},
): Promise<string | null> {
  const files = deps.backstop?.files;
  if (!files) return "Send by hand is not available on this destination.";
  if (before.relPath !== entity.id) return "The saved undo file does not match this item.";
  const denied = checkRawFilePath({ relPath: entity.id }) ?? await files.check({ relPath: entity.id });
  if (denied) return denied;
  if (isCoveredUndoPath({ deps, relPath: entity.id })) return `File '${entity.id}' already publishes normally; it was left alone.`;
  const current = await files.read({ relPath: entity.id });
  if (!current || hash(entity.id, current) !== afterHash) return `File '${entity.id}' changed on live after this send; it was left alone.`;
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

/** Undo retains its existing case-sensitive covered-root comparison. @complexity O(r * k). */
function isCoveredUndoPath({ deps, relPath }: { deps: PublishContentDeps; relPath: string }, _options = {}): boolean | undefined {
  return deps.backstop?.coveredRoots.some((root) => relPath === root.replace(/\/$/, "") || relPath.startsWith(root.replace(/\/$/, "") + "/"));
}
