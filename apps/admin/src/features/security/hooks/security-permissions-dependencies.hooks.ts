import { api } from "@/lib/api";
import type { SecurityPermissionsPort } from "./security-permissions-port.hooks";

/**
 * @file The only place `use-security-permissions.hooks.ts` reaches `lib/api` — see
 * `security-permissions-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `comments-dependencies
 *  .hooks.ts`'s `defaultCommentsPort`. */
export const defaultSecurityPermissionsPort: SecurityPermissionsPort = {
  me: () => api.me(),
};

/** Seed state for {@link createFakeSecurityPermissionsPort}. */
export interface FakeSecurityPermissionsPortOptions {
  effectivePermissions?: string[];
  /** When set, `me()` rejects with this instead of resolving — for load-failure tests. */
  meError?: Error;
}

/**
 * An in-memory {@link SecurityPermissionsPort} for tests — "every port gets a fake" (see
 * `comments-dependencies.hooks.ts`).
 */
export function createFakeSecurityPermissionsPort(options: FakeSecurityPermissionsPortOptions = {}): SecurityPermissionsPort {
  return {
    async me() {
      if (options.meError) throw options.meError;
      return { effectivePermissions: options.effectivePermissions ?? [] };
    },
  };
}
