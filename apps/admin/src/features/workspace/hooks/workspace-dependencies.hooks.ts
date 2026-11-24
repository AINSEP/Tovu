import type { AdminWorkspaceResponse as AdminWorkspace } from "@jini-ai/core/contracts/site/cms-workspace";
import { workspaceApi } from "@/features/workspace/api/workspace-api";
import type { WorkspacePort } from "@jini-ai/admin/screens/workspace/hooks/workspace-port.hooks";
import type { WorkspaceController } from "@jini-ai/admin/screens/workspace/Workspace";
import { useWorkspace } from "@jini-ai/admin/screens/workspace/hooks/use-workspace.hooks";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { describeApiError } from "../rules";
import { t } from "../workspace-i18n";

/**
 * @file The only place under `features/workspace` that reaches `lib/api` — see
 * `@jini-ai/admin/screens/workspace/hooks/workspace-port.hooks` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultWorkspacePort: WorkspacePort = {
  getWorkspace: () => workspaceApi.getWorkspace(),
  updateWorkspace: ({ patch }, _options = {}) => workspaceApi.updateWorkspace(patch),
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
  version: 1,
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

    async updateWorkspace({ patch }) {
      current = { ...current, ...patch };
      return { workspace: current };
    },
  };
}

/**
 * Binds the real `/api/.../workspaces/{id}` client — see {@link defaultWorkspacePort} above.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Workspace.tsx` composes this and a test composes `useWorkspace` (now
 * `@jini-ai/admin/screens/workspace/hooks/use-workspace.hooks`) with `createFakeWorkspacePort`.
 * This install's locale (`useAdminLocale()`), its workspace dictionary and its error-code copy
 * (`rules.ts`'s `describeApiError`) are injected here, because the shared hook owns none of them.
 */
export function useWiredWorkspace(): WorkspaceController {
  const locale = useAdminLocale();
  return useWorkspace({ port: defaultWorkspacePort, locale, translate: t, describeError: describeApiError });
}
