import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { UUID } from "@jini-ai/cms/core";

import type { StaticPublishTargetId } from "./types";

/**
 * @file Durable "where did we last publish" memory, one entry per `(workspaceId, target)` — the fix
 * for Defect 2 (2026-08-16 live-publish finding): the site went live at
 * `https://leonaburime-ucla.github.io/tovu-demo/`, and the assistant still had nowhere to look that
 * up. `publish-run.ts`'s own `currentRun` snapshot answers "is a publish running right now", not
 * "what did the last SUCCESSFUL one produce" — it resets to `IDLE_RUN` on every process restart, and
 * even mid-process it only remembers the single most recent run for the whole server, not one entry
 * per target. Nothing else under `src/features/deployments/` records a publish at all: `publish-run.ts`
 * never persists `owner`, and `deployment_list` (`../agent-tools.ts`) is a genuinely different
 * subsystem — provider-driven continuous-deployment records, not this feature's one-shot static
 * publishes — and says so in its own tool description.
 *
 * Purpose:
 * {@link PublishHistoryStore} is the port; {@link InMemoryPublishHistoryStore} is the test double
 * (same "died on process restart" trade-off `verify.ts`'s cache accepts deliberately — fine there
 * because a stale verification just means "re-verify", but wrong here: an in-memory-only history would
 * defeat the one thing this fix exists for, so this module's DEFAULT is the file-backed store below,
 * never the in-memory one). {@link createFilePublishHistoryStore} is that default: one JSON file per
 * workspace under `infra/publish-history/` — `infra/` is this repo's own established, gitignored,
 * Docker-volume-mounted runtime-data root (already used by `export-run.ts`'s `TOVU_EXPORT_DIR` and
 * `adapter.ts`'s `TOVU_PUBLISH_DIR`; see that file's own `publishOutputDir` doc), so this survives a
 * container restart the same way every other durable-but-not-database artifact in this feature already
 * does. Deliberately NOT `adapter.ts`'s own `infra/publish/<target>` directory — that tree is a real
 * publish's OUTPUT (the exported file set actually handed to a provider) and gets a fresh `clean`
 * export written into it on every run (that file's own header), which would silently delete a history
 * record placed there. A sibling directory, written to independently, is what keeps this record alive
 * across every future publish rather than only until the next one starts.
 *
 * No DB table: adding one needs a migration, and migrations belong to whichever dispatch owns
 * `drizzle/` for this session (not this one) — coordinated rather than assumed. A flat JSON file is a
 * legitimate, already-precedented alternative for a collection this small (at most one entry per
 * provider per workspace, the same "inherently small, no pagination needed" reasoning
 * `PublishCredentialSetRepoPort.listByWorkspace`'s own doc gives for a structurally similar collection).
 *
 * The atomic temp-file+rename write technique below is a small, deliberate LOCAL duplicate of
 * `site-dir/atomic-write.ts`'s `writeJsonFileAtomic` rather than an import of it — that helper's own
 * header scopes it as "no exported contract... both callers are within this same module" (the
 * `site-dir` domain), and this codebase already has a precedent for re-implementing a few lines locally
 * rather than crossing a domain boundary neither file otherwise needs (`verify.ts`'s `deriveS3Endpoint`
 * makes the identical call, and documents the identical reasoning, for `s3-compatible-target.ts`'s own
 * `deriveEndpoint`).
 *
 * Architectural role:
 * `features/deployments/static-publish` domain logic. `publish-run.ts` is the ONE place a
 * `PublishHistoryStore` is written to (both its shared entry points — the admin route's fire-and-forget
 * `startPublishRun` and the agent tool's awaited `runPublishAndAwait` — settle through the same
 * function, so both callers record identically with no change needed at either call site).
 * `publish-agent-tools.ts`'s capabilities handler is the one place it is read from, surfaced per
 * provider as `lastPublish`.
 */

/** One completed (or partial-but-live) publish, exactly what a caller needs to resolve "publish my
 *  site again" without asking the human anything, and what a future read-only history UI would need
 *  to show one row. `owner`/`repo` are present only for `github-pages` (`StaticPublishConfig`'s own
 *  per-target field split — see `types.ts`); every other target carries neither. */
export interface PublishHistoryEntry {
  readonly target: StaticPublishTargetId;
  readonly url: string;
  /** `false` only for the s3-compatible "uploaded, not yet confirmed reachable" partial outcome
   *  (`StaticPublishOutcome`'s own `ok: "partial"` branch) — everything else that reaches this store
   *  at all is a full, confirmed-live success (see {@link PublishHistoryStore.recordSuccess}'s own
   *  doc: an `ok: false` outcome is never recorded, so `reachable` is never "the publish failed"). */
  readonly reachable: boolean;
  readonly status: string;
  readonly projectName: string;
  readonly publishedAt: string;
  readonly owner?: string;
  readonly repo?: string;
  readonly basePath?: string;
}

/** Workspace-and-target-scoped read/write for the last successful publish. `recordSuccess` is named
 *  for what it is ever called with, not what it is capable of rejecting — see this file's header for
 *  why an `ok: false` `StaticPublishOutcome` is never passed to it at all (the caller decides that,
 *  not this port). */
export interface PublishHistoryStore {
  getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null>;
  /** Replaces whatever was previously recorded for `(workspaceId, entry.target)` — a publish's history
   *  is "the last one", not an append-only log (spec: "record the last successful publish per
   *  target"). */
  recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void>;
}

/** Test double — same shape/isolation-by-key discipline as `InMemoryPublishCredentialVerificationCache`
 *  (`verify.ts`). NEVER the production default (see this file's header for why: it dies on restart,
 *  which defeats the entire point of this fix) — tests inject this explicitly. */
export class InMemoryPublishHistoryStore implements PublishHistoryStore {
  private readonly entries = new Map<string, PublishHistoryEntry>();

  private static key(workspaceId: UUID, target: StaticPublishTargetId): string {
    return `${workspaceId}::${target}`;
  }

  async getLast(input: { workspaceId: UUID; target: StaticPublishTargetId }): Promise<PublishHistoryEntry | null> {
    return this.entries.get(InMemoryPublishHistoryStore.key(input.workspaceId, input.target)) ?? null;
  }

  async recordSuccess(input: { workspaceId: UUID; entry: PublishHistoryEntry }): Promise<void> {
    this.entries.set(InMemoryPublishHistoryStore.key(input.workspaceId, input.entry.target), input.entry);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One workspace's whole history file, keyed by target — the unit this module reads and
 *  read-modify-writes as a whole (one small file, not one file per target: at most five keys ever). */
type WorkspaceHistory = Partial<Record<StaticPublishTargetId, PublishHistoryEntry>>;

/** `encodeURIComponent`, not the raw `workspaceId`, as the filename — a plain, standard escape that
 *  keeps this store safe against a `workspaceId` containing a path separator or `..` segment without
 *  inventing a bespoke validation regex, matching the defense-in-depth (not "assume the input is
 *  always well-formed") posture this feature already takes for model/form-supplied strings elsewhere
 *  (`adapter.ts`'s `OWNER_PATTERN`/`REPO_PATTERN`). `workspaceId` here is server-assigned, never
 *  agent- or form-supplied, but this store has no way to know that about every future caller. */
function historyFilePath(dir: string, workspaceId: UUID): string {
  return path.join(dir, `${encodeURIComponent(workspaceId)}.json`);
}

/** Reads one workspace's history file. Never throws: a missing file (nothing published yet for this
 *  workspace) and a corrupt/malformed one (this store's own atomic write is the only writer, but a
 *  hand-edited or partially-copied file is not this module's problem to diagnose) both degrade to "no
 *  history recorded" rather than propagating — the same "a stale/corrupt on-disk record must never
 *  crash a read" posture `read-site-dir.ts`'s schema-guarded reads already take elsewhere in this
 *  codebase. */
function readWorkspaceHistory(dir: string, workspaceId: UUID): WorkspaceHistory {
  let raw: string;
  try {
    raw = fs.readFileSync(historyFilePath(dir, workspaceId), "utf8");
  } catch {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as WorkspaceHistory) : {};
  } catch {
    return {};
  }
}

/** Writes one workspace's whole history file atomically (temp file in the SAME directory, then
 *  `renameSync` over the real path — POSIX rename is atomic within one filesystem) — see this file's
 *  header for why this is a small local duplicate of `site-dir/atomic-write.ts`'s identical technique
 *  rather than an import of it. */
function writeWorkspaceHistoryAtomic(dir: string, workspaceId: UUID, data: WorkspaceHistory): void {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = historyFilePath(dir, workspaceId);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}

/**
 * The production default: one JSON file per workspace under `infra/publish-history/` (or
 * `TOVU_PUBLISH_HISTORY_DIR`, mirroring `adapter.ts`'s `TOVU_PUBLISH_DIR`/`export-run.ts`'s
 * `TOVU_EXPORT_DIR` — a real operational knob, and what lets this module's own tests redirect off the
 * checked-out repo without a test-only code path).
 *
 * @param deps.dir - Overridable for tests; defaults to the env-or-`infra/` resolution above.
 * @complexity O(1) per operation — one small JSON file read and/or write, no larger than five entries.
 * @overallScore 100
 */
export function createFilePublishHistoryStore(deps: { dir?: string } = {}): PublishHistoryStore {
  const dir = deps.dir ?? (process.env.TOVU_PUBLISH_HISTORY_DIR !== undefined ? path.resolve(process.env.TOVU_PUBLISH_HISTORY_DIR) : path.resolve(process.cwd(), "infra", "publish-history"));

  return {
    async getLast(input) {
      const history = readWorkspaceHistory(dir, input.workspaceId);
      return history[input.target] ?? null;
    },
    async recordSuccess(input) {
      const history = readWorkspaceHistory(dir, input.workspaceId);
      writeWorkspaceHistoryAtomic(dir, input.workspaceId, { ...history, [input.entry.target]: input.entry });
    },
  };
}
