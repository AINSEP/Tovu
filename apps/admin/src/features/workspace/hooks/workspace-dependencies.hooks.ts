import { api, type AdminWorkspace } from "../../../lib/api";
import type { WorkspacePort } from "./workspace-port.hooks";

/**
 * @file The only place under `features/workspace` that reaches `lib/api` — see
 * `workspace-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultWorkspacePort: WorkspacePort = {
  getWorkspace: () => api.getWorkspace(),
  updateWorkspace: (patch) => api.updateWorkspace(patch),
};

/** Seed state for {@link createFakeWorkspacePort}. */
export interface FakeWorkspacePortOptions {
  workspace?: AdminWorkspace;
}

const DEFAULT_FAKE_WORKSPACE: AdminWorkspace = {
  id: "fake-ws",
  name: "Fake Workspace",
  slug: "fake-workspace",
  createdAt: new Date(0).toISOString(),
};

/**
 * An in-memory {@link WorkspacePort} for tests — the fake that lets a test describe "the workspace
 * is named X" directly, instead of hand-building `Response` objects and stubbing global `fetch`.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeWorkspacePort(options: FakeWorkspacePortOptions = {}): WorkspacePort & {
  /** The fake's current workspace record. */
  readonly current: AdminWorkspace;
} {
  let current = options.workspace ?? DEFAULT_FAKE_WORKSPACE;

  return {
    get current() {
      return current;
    },

    async getWorkspace() {
      return { workspace: current };
    },

    async updateWorkspace(patch) {
      current = { ...current, ...patch };
      return { workspace: current };
    },
  };
}
