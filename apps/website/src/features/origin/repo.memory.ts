/**
 * @file In-memory `OriginSettingRepoPort` double.
 *
 * Purpose:
 * Test/dev double for the origin-setting store: one `VerifiedOrigin` per
 * workspace plus that workspace's redirect and egress allowlists. SQL adapters remain host-owned; generic in-memory storage is delegated to Jini.
 *
 * Generic implementation and rationale: Jini packages/http-kit/src/verified-origin/repo.memory.ts.
 */
import {
  InMemoryOriginSettingRepo as JiniOriginSettingRepo,
  type OriginSettingSeed,
  type VerifiedOrigin,
} from "@jini-ai/http-kit/verified-origin";
import type { OriginSettingRepoPort } from "./ports.js";

export type { OriginSettingSeed } from "@jini-ai/http-kit/verified-origin";

// Workspace-seed/host-allowlist rationale: Jini/packages/http-kit/src/verified-origin/repo.memory.ts.
/**
 * In-memory `OriginSettingRepoPort`. Seed it with one entry per workspace;
 * e.g. for local dev/tests, seed `{ scheme: "https", host: "localhost",
 * port: 3000, source: "dev-capability", verifiedAt: <now> }` as the
 * workspace's dev-capability origin.
 *
 * Translate Tovu scalar repository calls into Jini object arguments.
 * Jini owns normalization, validation and defensive copies; SQL repositories keep their contract.
 */
export class InMemoryOriginSettingRepo implements OriginSettingRepoPort {
  private readonly repo: JiniOriginSettingRepo;

  constructor(seeds: OriginSettingSeed[] = []) {
    this.repo = new JiniOriginSettingRepo({ seeds });
  }

  findByWorkspaceId(workspaceId: string): Promise<VerifiedOrigin | null> {
    return this.repo.findByWorkspaceId({ workspaceId });
  }

  findRedirectAllowlist(workspaceId: string): Promise<string[]> {
    return this.repo.findRedirectAllowlist({ workspaceId });
  }

  findEgressAllowlist(workspaceId: string): Promise<string[]> {
    return this.repo.findEgressAllowlist({ workspaceId });
  }
}
