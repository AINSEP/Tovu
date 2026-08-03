/**
 * @file In-memory `OriginSettingRepoPort` double.
 *
 * Purpose:
 * Test/dev double for the origin-setting store: one `VerifiedOrigin` per
 * workspace plus that workspace's redirect and egress allowlists. No SQLite
 * adapter exists yet (out of scope for this library-layer slice); this is the
 * only implementation of `OriginSettingRepoPort` for now.
 */
import type { UUID } from "@jini-ai/cms/core";
import type { OriginSettingRepoPort } from "./ports";
import { createVerifiedOrigin, type VerifiedOrigin } from "./types";

/** One workspace's seed data for `InMemoryOriginSettingRepo`. */
export interface OriginSettingSeed {
  workspaceId: UUID;
  origin: VerifiedOrigin;
  /** Exact-match hosts allowed as cross-origin redirect targets. */
  redirectAllowlist?: string[];
  /** Exact-match hosts allowed as third-party egress destinations. */
  egressAllowlist?: string[];
}

/**
 * In-memory `OriginSettingRepoPort`. Seed it with one entry per workspace;
 * e.g. for local dev/tests, seed `{ scheme: "https", host: "localhost",
 * port: 3000, source: "dev-capability", verifiedAt: <now> }` as the
 * workspace's dev-capability origin.
 */
export class InMemoryOriginSettingRepo implements OriginSettingRepoPort {
  private readonly origins: Map<UUID, VerifiedOrigin>;
  private readonly redirectAllowlists: Map<UUID, string[]>;
  private readonly egressAllowlists: Map<UUID, string[]>;

  constructor(seeds: OriginSettingSeed[] = []) {
    this.origins = new Map();
    this.redirectAllowlists = new Map();
    this.egressAllowlists = new Map();

    for (const seed of seeds) {
      this.origins.set(seed.workspaceId, createVerifiedOrigin(seed.origin));
      this.redirectAllowlists.set(seed.workspaceId, normalizeHostList(seed.redirectAllowlist));
      this.egressAllowlists.set(seed.workspaceId, normalizeHostList(seed.egressAllowlist));
    }
  }

  async findByWorkspaceId(workspaceId: UUID): Promise<VerifiedOrigin | null> {
    return this.origins.get(workspaceId) ?? null;
  }

  async findRedirectAllowlist(workspaceId: UUID): Promise<string[]> {
    return this.redirectAllowlists.get(workspaceId) ?? [];
  }

  async findEgressAllowlist(workspaceId: UUID): Promise<string[]> {
    return this.egressAllowlists.get(workspaceId) ?? [];
  }
}

function normalizeHostList(hosts: string[] | undefined): string[] {
  return (hosts ?? []).map((host) => host.trim().toLowerCase());
}
