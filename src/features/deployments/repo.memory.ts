import type { DeploymentsReadRepoPort } from "./read-repo";
import type { DeploymentRunRecord, DeploymentTargetRecord, EnvironmentRecord, ReleaseRecord } from "./types";

/**
 * @file In-memory `DeploymentsReadRepoPort` double for `server/app.ts`'s hermetic composition —
 * mirrors `features/post/repo.memory.ts`'s shape exactly: seedable constructor arrays, a plain
 * `Array.prototype.filter` per method, no ordering/cap logic duplicated from the real adapter
 * (a test that needs newest-first or the cap boundary exercises `repo.sqlite.ts` directly, the
 * same division of testing labor `search-index.memory.ts` documents for its own sqlite/memory
 * pair).
 */

export class InMemoryDeploymentsReadRepo implements DeploymentsReadRepoPort {
  private readonly environments: EnvironmentRecord[];
  private readonly targets: DeploymentTargetRecord[];
  private readonly releases: ReleaseRecord[];
  private readonly runs: DeploymentRunRecord[];

  constructor(
    seed: {
      environments?: EnvironmentRecord[];
      targets?: DeploymentTargetRecord[];
      releases?: ReleaseRecord[];
      runs?: DeploymentRunRecord[];
    } = {}
  ) {
    this.environments = [...(seed.environments ?? [])];
    this.targets = [...(seed.targets ?? [])];
    this.releases = [...(seed.releases ?? [])];
    this.runs = [...(seed.runs ?? [])];
  }

  async listEnvironments(required: { workspaceId: string }): Promise<EnvironmentRecord[]> {
    return this.environments.filter((row) => row.workspaceId === required.workspaceId);
  }

  async listTargets(required: { workspaceId: string }): Promise<DeploymentTargetRecord[]> {
    return this.targets.filter((row) => row.workspaceId === required.workspaceId);
  }

  async listReleases(required: { workspaceId: string }): Promise<ReleaseRecord[]> {
    return this.releases.filter((row) => row.workspaceId === required.workspaceId);
  }

  async listRuns(required: { workspaceId: string }): Promise<DeploymentRunRecord[]> {
    return this.runs.filter((row) => row.workspaceId === required.workspaceId);
  }
}
