import type { AdminExecutionCredential, AdminExecutionCredentialPatch } from "../lib/api";
import { loadAdminExecutionCredential, saveAdminExecutionCredential } from "../lib/execution-settings";
import type { AdminExecutionCredentialPort } from "./admin-execution-credential-port.hooks";

/**
 * @file The only place this hook's port reaches `lib/execution-settings` — see
 * `admin-execution-credential-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. */
export const defaultAdminExecutionCredentialPort: AdminExecutionCredentialPort = {
  loadAdminExecutionCredential: () => loadAdminExecutionCredential(),
  saveAdminExecutionCredential: (patch) => saveAdminExecutionCredential(patch),
};

/** The "nothing stored yet" server view — matches `lib/api.ts`'s `AdminExecutionCredential` shape
 *  for a row that has never been written. Exported so tests can start from it explicitly rather than
 *  re-typing the same object literal, mirroring the test file's own pre-conversion `unsetView()`. */
export const UNSET_ADMIN_EXECUTION_CREDENTIAL: AdminExecutionCredential = {
  isSet: false,
  masked: null,
  protocol: "anthropic",
  providerId: null,
  baseUrl: null,
  model: null,
  maxTokens: null,
  updatedAt: null,
};

/** Seed state for {@link createFakeAdminExecutionCredentialPort}. */
export interface FakeAdminExecutionCredentialPortOptions {
  /** What `loadAdminExecutionCredential()` returns until a save overwrites it. Defaults to nothing
   *  stored. */
  stored?: AdminExecutionCredential;
  /**
   * Called on every `saveAdminExecutionCredential`, before the default merge runs. Return a full
   * {@link AdminExecutionCredential} to replace the default merge outright (e.g. a custom `masked`
   * value), or throw to simulate a rejected save — the fake does not catch it, matching a real
   * `api.setAdminExecutionCredential` rejection.
   */
  onSave?: (patch: AdminExecutionCredentialPatch) => AdminExecutionCredential | undefined;
}

/**
 * An in-memory {@link AdminExecutionCredentialPort} for tests — the fake that lets a test describe
 * "nothing is stored yet" or "the save fails" directly, instead of `vi.mock`-ing `lib/api`. Shipped
 * alongside the real binding per the pattern's "every port gets a fake" rule (see
 * `assistant-chats-dependencies.hooks.ts`).
 */
export function createFakeAdminExecutionCredentialPort(
  options: FakeAdminExecutionCredentialPortOptions = {},
): AdminExecutionCredentialPort & {
  /** The credential view as currently held by the fake, after any save made through the port. */
  readonly current: AdminExecutionCredential;
  /** Every patch this fake received, in call order. */
  readonly saveCalls: AdminExecutionCredentialPatch[];
} {
  let stored = options.stored ?? UNSET_ADMIN_EXECUTION_CREDENTIAL;
  const saveCalls: AdminExecutionCredentialPatch[] = [];

  return {
    get current() {
      return stored;
    },
    saveCalls,

    async loadAdminExecutionCredential() {
      return stored;
    },

    async saveAdminExecutionCredential(patch) {
      saveCalls.push(patch);
      const overridden = options.onSave?.(patch);
      if (overridden) {
        stored = overridden;
        return stored;
      }
      stored = {
        isSet: true,
        masked: patch.apiKey ? `••••${patch.apiKey.slice(-4)}` : stored.masked,
        protocol: patch.protocol ?? stored.protocol,
        providerId: patch.providerId !== undefined ? patch.providerId : stored.providerId,
        baseUrl: patch.baseUrl ?? stored.baseUrl,
        model: patch.model ?? stored.model,
        maxTokens: patch.maxTokens ?? stored.maxTokens,
        updatedAt: new Date(0).toISOString(),
      };
      return stored;
    },
  };
}
