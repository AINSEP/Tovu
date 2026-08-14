import { api, type AdminUser } from "../../../lib/api";
import type { LoginPort } from "./login-port.hooks";

/**
 * @file The only place under `features/auth` that reaches `lib/api` — see `login-port.hooks.ts`
 * for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultLoginPort: LoginPort = {
  login: (credentials) => api.login(credentials),
};

/** Fallback fake user returned by {@link createFakeLoginPort} when the caller doesn't seed one —
 *  distinct from any real workspace user id so a test asserting on it can't accidentally pass
 *  against a coincidentally-matching real fixture. */
const FAKE_USER: AdminUser = { id: "fake-user-1", username: "fake-admin" };

/** Seed state for {@link createFakeLoginPort}. */
export interface FakeLoginPortOptions {
  /** User `login()` resolves with. Defaults to {@link FAKE_USER}. */
  user?: AdminUser;
  /** When set, `login()` rejects with this instead of resolving — for failed-credential tests. */
  loginError?: Error;
}

/**
 * An in-memory {@link LoginPort} for tests — "every port gets a fake" (see
 * `media-dependencies.hooks.ts`). Ignores the submitted credentials by design: this hook has no
 * server to check them against, so a fake describing "this login attempt succeeds/fails" is more
 * useful than one that re-implements credential matching.
 */
export function createFakeLoginPort(options: FakeLoginPortOptions = {}): LoginPort {
  return {
    async login() {
      if (options.loginError) throw options.loginError;
      return { user: options.user ?? FAKE_USER };
    },
  };
}
