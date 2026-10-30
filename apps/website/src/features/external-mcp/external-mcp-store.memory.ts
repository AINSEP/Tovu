import { InMemoryVaultRepo, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { SealedSecret } from "../webhooks/index.js";
import { externalMcpVaultEnvelope, externalMcpVaultRecord, persistExternalMcpVaultEnvelope, deleteExternalMcpVaultEnvelope } from "./external-mcp-vault.js";
import type { ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "./contracts.js";

/**
 * @file In-memory `ExternalMcpServerRepoPort` — the ADR-006 rule-of-two "first adapter", and the
 * double every store/route test binds instead of a real database.
 *
 * Keyed by `workspaceId` + `serverId` exactly as the table's composite primary key is, so a test
 * that leaks rows across workspaces fails here the same way it would against SQLite.
 *
 * {@link InMemoryExternalMcpServerRepo.tryClaimOAuthRefreshLease} reproduces the SQLite adapter's
 * compare-and-set SEMANTICS rather than its statement. It is genuinely atomic here for the reason
 * that matters in a test — JavaScript's single-threaded turn boundary means the read and the write
 * cannot be interleaved by another caller — so a test that asserts "the second claimant loses"
 * exercises the same contract the conditional UPDATE provides in production.
 */

function keyOf(workspaceId: UUID, serverId: string): string {
  return `${workspaceId} ${serverId}`;
}

type EnvelopeKind = "mcp-env" | "mcp-auth";
const ENVELOPE_FIELDS = [["mcp-env", "sealedEnv"], ["mcp-auth", "sealedOAuth"]] as const;
type EnvelopeField = typeof ENVELOPE_FIELDS[number][1];

/** A row's present envelopes as validated vault records, env first; throws VaultError("context")
 * when an envelope is not bound to this server and kind. @complexity O(1), at most two envelopes. */
function storedEnvelopes({ record }: { record: ExternalMcpServerRecord | undefined }, _options = {}): { kind: EnvelopeKind; field: EnvelopeField; vault: VaultRecord }[] {
  if (!record) return [];
  return ENVELOPE_FIELDS.flatMap(([kind, field]) => {
    const sealed = record[field];
    return sealed ? [{ kind, field, vault: externalMcpVaultRecord({ sealed, identity: record, kind }) }] : [];
  });
}

/** The envelope stored under `id` in `repo`, or null when the row carries none of that kind. */
async function envelopeAt({ repo, workspaceId, id }: { repo: InMemoryVaultRepo; workspaceId: UUID; id: string | null }, _options = {}): Promise<SealedSecret | null> {
  return id ? externalMcpVaultEnvelope({ record: (await repo.find({ workspaceId, id }))! }) : null;
}

export class InMemoryExternalMcpServerRepo implements ExternalMcpServerRepoPort {
  private readonly rows = new Map<string, ExternalMcpServerRecord>();
  private readonly vaults = new Map<string, InMemoryVaultRepo>();
  private pending: Promise<unknown> = Promise.resolve();

  private write<T>(body: () => Promise<T>): Promise<T> {
    const result = this.pending.then(body);
    this.pending = result.catch(() => {});
    return result;
  }

  /** Clone only one server's encrypted state; an aborted write leaves the live adapter intact. */
  private async stage({ previous }: { previous?: ExternalMcpServerRecord }): Promise<InMemoryVaultRepo> {
    const repo = new InMemoryVaultRepo({});
    for (const { vault } of storedEnvelopes({ record: previous })) await repo.put({ record: { ...vault, revision: 1 }, expectedRevision: null });
    return repo;
  }

  private async hydrate({ record }: { record: ExternalMcpServerRecord }): Promise<ExternalMcpServerRecord> {
    const repo = this.vaults.get(keyOf(record.workspaceId, record.serverId))!;
    const saved = { ...record };
    for (const { field, vault } of storedEnvelopes({ record })) {
      saved[field] = await envelopeAt({ repo, workspaceId: record.workspaceId, id: vault.id });
    }
    return saved;
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]> {
    return Promise.all([...this.rows.values()].filter(row => row.workspaceId === workspaceId).map(record => this.hydrate({ record })));
  }

  async findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null> {
    const record = this.rows.get(keyOf(input.workspaceId, input.serverId));
    return record ? this.hydrate({ record }) : null;
  }

  async upsert(record: ExternalMcpServerRecord): Promise<void> {
    await this.write(async () => {
      const key = keyOf(record.workspaceId, record.serverId);
      const previous = this.rows.get(key);
      // Stage a fresh Jini memory repository: failures leave both payloads and the row untouched.
      // Only this server's two envelopes are copied, so a save is bounded independently of roster size.
      const repo = await this.stage({ previous });
      const ids = {
        "mcp-env": await persistExternalMcpVaultEnvelope({ repo, sealed: record.sealedEnv, identity: record, kind: "mcp-env" }),
        "mcp-auth": await persistExternalMcpVaultEnvelope({ repo, sealed: record.sealedOAuth, identity: record, kind: "mcp-auth" }),
      };
      for (const { kind, vault } of storedEnvelopes({ record: previous })) {
        if (vault.id !== ids[kind]) await deleteExternalMcpVaultEnvelope({ repo, workspaceId: record.workspaceId, id: vault.id });
      }
      // Publish both together only after all staged writes/deletes have succeeded.
      const saved = { ...record,
        sealedEnv: await envelopeAt({ repo, workspaceId: record.workspaceId, id: ids["mcp-env"] }),
        sealedOAuth: await envelopeAt({ repo, workspaceId: record.workspaceId, id: ids["mcp-auth"] }),
      };
      this.vaults.set(key, repo);
      this.rows.set(key, saved);
    });
  }

  async deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean> {
    return this.write(async () => {
      const key = keyOf(input.workspaceId, input.serverId);
      const previous = this.rows.get(key);
      if (!previous) return false;
      const repo = await this.stage({ previous });
      // The staged row is detached; live state is published only after Jini deletes both payloads.
      for (const { vault } of storedEnvelopes({ record: previous })) {
        await deleteExternalMcpVaultEnvelope({ repo, workspaceId: input.workspaceId, id: vault.id });
      }
      this.rows.delete(key);
      this.vaults.delete(key);
      return true;
    });
  }

  async tryClaimOAuthRefreshLease(input: {
    workspaceId: UUID;
    serverId: string;
    nowIso: ISODateTime;
    leaseUntil: ISODateTime;
  }): Promise<boolean> {
    return this.write(async () => {
      const row = this.rows.get(keyOf(input.workspaceId, input.serverId));
      if (!row) return false;
      const held = row.oauthRefreshLeaseUntil;
      // A lease at or before `nowIso` is abandoned — a process that crashed mid-refresh must not wedge
      // the connection until something is restarted.
      if (held !== null && Date.parse(held) > Date.parse(input.nowIso)) return false;
      this.rows.set(keyOf(input.workspaceId, input.serverId), { ...row, oauthRefreshLeaseUntil: input.leaseUntil });
      return true;
    });
  }

  async releaseOAuthRefreshLease(input: { workspaceId: UUID; serverId: string }): Promise<void> {
    await this.write(async () => {
      const row = this.rows.get(keyOf(input.workspaceId, input.serverId));
      if (!row) return;
      this.rows.set(keyOf(input.workspaceId, input.serverId), { ...row, oauthRefreshLeaseUntil: null });
    });
  }
}
