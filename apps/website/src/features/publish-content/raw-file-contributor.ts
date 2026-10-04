import { createHash } from "node:crypto";
import { executeCommand } from "@jini-ai/cms/core";
import { computeBlobStorageKey } from "#src/features/media/index";
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
      const storageKey = computeBlobStorageKey({ workspaceId: deps.workspaceId, sha256: entity.state.sha256 as string });
      return await deps.backstop.blobs.exists({ storageKey }) ? deps.backstop.blobs.get({ storageKey }) : null;
    }
    async function check(entity: PackedEntity, sourceBytes?: Uint8Array): Promise<string | null> {
      if (!files) return "Send by hand is not available on this destination.";
      const relPath = entity.state.path;
      if (typeof relPath !== "string") return "Choose a regular file inside the site folder.";
      const denied = pathReason(relPath) ?? await files.check({ relPath });
      if (denied) return denied;
      const { sha256, size, mode } = entity.state;
      if (entity.id !== relPath || typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256) ||
        typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > BACKSTOP_LIMITS.bytes ||
        (mode !== 0o644 && mode !== 0o755) || entity.requiredBlobs.length !== 1 || entity.requiredBlobs[0] !== sha256) return "The raw file has an invalid address, size, mode or checksum.";
      const bytes = sourceBytes ?? await blob(entity);
      if (!bytes || bytes.byteLength !== size || sha(bytes) !== sha256) return "The file's verified bytes are missing on live; send it again.";
      // Raw files have no extension allowlist. Scan all small files, including unknown extensions,
      // using their real bytes rather than a sender-controlled textSample.
      if (size <= BACKSTOP_LIMITS.scanBytes) {
        const secret = checkRawValues({ values: { [relPath]: Buffer.from(bytes).toString("utf8") } });
        if (secret) return secret;
      }
      return contentHash("raw-file", entity.state) === entity.contentHash ? null : "The raw file does not match its checked content hash.";
    }
    const handler: PublishContentHandler = {
      entityType: "raw-file", schemaVersion: 1, permission: "publish.backstop", dependsOn: [], idempotencyScope: "run",
      pack: async function* () {
        skipped.length = 0;
        if (!files || !deps.backstop?.fileBlobIndex) return;
        const selected = deps.backstop.selection?.files ?? [];
        if (selected.length > BACKSTOP_LIMITS.files) throw new Error("Choose at most 50 files per send.");
        let total = 0;
        for (const relPath of selected) {
          let reason = pathReason(relPath);
          let file: RawFileSnapshot | null = null;
          if (!reason) try { file = await files.read({ relPath }); } catch (error) { reason = error instanceof Error ? error.message : "This file cannot be sent safely."; }
          if (!reason && !file) reason = "The selected file no longer exists.";
          if (reason || !file) { skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason: reason! }); continue; }
          total += file.bytes.byteLength;
          if (total > BACKSTOP_LIMITS.bytes) throw new Error("Choose files totaling at most 50 MB per send.");
          const state = stateFor(relPath, file);
          const entity: PackedEntity = { entityType: "raw-file", id: relPath, schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION,
            contentHash: contentHash("raw-file", state), requiredBlobs: [state.sha256 as string], state };
          reason = await check(entity, file.bytes);
          if (reason) skipped.push({ entityType: "raw-file", id: relPath, label: relPath, reason });
          else { deps.backstop.fileBlobIndex.set(state.sha256 as string, { absPath: file.absPath, size: file.bytes.byteLength }); yield entity; }
        }
      },
      inspect: async (relPath) => {
        if (!files || pathReason(relPath)) return null;
        let file: RawFileSnapshot | null;
        try { file = await files.read({ relPath }); } catch { return null; }
        return file ? { hash: hash(relPath, file), hashVersion: CONTENT_HASH_VERSION, version: version(relPath, file) } : null;
      },
      precheck: (entity) => check(entity),
      apply: async (input) => {
        const reason = await check(input.entity);
        if (reason) throw new PublishContentApplyRowError("blocked", reason);
        if (!files || !deps.changeSets || !deps.outbox || !deps.authorize) throw new Error("The raw file command gateway is not wired.");
        const bytes = await blob(input.entity);
        if (!bytes || sha(bytes) !== input.entity.state.sha256) throw new Error("The raw file bytes changed before apply.");
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
              await files.replace({ relPath: input.entity.id, bytes, mode: input.entity.state.mode as number });
              written = true;
              return { version: Number.parseInt(input.entity.contentHash.slice(0, 12), 16) };
            },
            captureEntityVersion: ({ result: saved }) => saved.version,
            rollback: async () => { if (written && prior) await files.restore({ inverse: prior }); },
          },
        });
        const inverse = prior as RawFileInverse | undefined;
        if (inverse) deps.backstop?.inverses?.push({ kind: "raw-file", entity: input.entity, before: inverse, afterHash: input.entity.contentHash });
        if (inverse) deps.backstop?.fileRollbacks?.push(async () => {
          const reason = await undoRawFile({ deps, entity: input.entity, before: inverse, afterHash: input.entity.contentHash });
          if (reason) throw new Error(reason);
        });
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
  if (deps.backstop?.coveredRoots.some((root) => entity.id === root.replace(/\/$/, "") || entity.id.startsWith(root.replace(/\/$/, "") + "/"))) return `File '${entity.id}' already publishes normally; it was left alone.`;
  const current = await files.read({ relPath: entity.id });
  if (!current || hash(entity.id, current) !== afterHash) return `File '${entity.id}' changed on live after this send; it was left alone.`;
  await files.restore({ inverse: before });
  return null;
}
