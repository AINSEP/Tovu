import type { AdminExecutionCredential, AdminExecutionCredentialPatch } from "../lib/api";

/**
 * @file What `useAdminExecutionCredential` needs from the outside world, as an interface rather than
 * a direct `lib/execution-settings` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`' `usePageEditor`: this file declares, `admin-execution-credential-dependencies
 * .hooks.ts` binds the real implementation, and nothing else reaches `lib/execution-settings`'s
 * `loadAdminExecutionCredential`/`saveAdminExecutionCredential` for this hook.
 *
 * ## What is deliberately NOT in this port
 *
 * - `hasUsableAdminKey` — a pure rule with no I/O; per the pattern a hook imports rules directly
 *   rather than having them injected (same reasoning `assistant-chats-port.hooks.ts` gives for
 *   `persistableMessages`).
 * - `readLegacyLocalCredential`/`clearLegacyLocalCredential` — real `localStorage` I/O, but jsdom
 *   (this repo's test environment) already provides a working, in-memory `localStorage`, and the
 *   hook's existing test suite already exercises both functions directly with zero mocking pain.
 *   Injecting them would add a seam with no testability gap to close.
 * - The `settings-refresh-bus` publish/subscribe calls — `settings-refresh-bus.ts` ships its own
 *   dedicated test-reset export (`resetSettingsRefreshBus`), and the hook's existing tests already
 *   call the real bus directly (`publishSettingsRefresh`) with no module mock — the same testability
 *   the `useX`/`useWiredX` split exists to provide, already met by a different, purpose-built seam.
 *
 * What DOES belong here: the two functions that reach `api.getAdminExecutionCredential`/
 * `api.setAdminExecutionCredential` under the hood (`lib/execution-settings.ts`) — the hook's
 * existing test file has to `vi.mock("../../lib/api", ...)` to cover them, which is exactly the
 * module-mocking this pattern replaces with an injected fake.
 */
export interface AdminExecutionCredentialPort {
  loadAdminExecutionCredential(): Promise<AdminExecutionCredential>;
  saveAdminExecutionCredential(patch: AdminExecutionCredentialPatch): Promise<AdminExecutionCredential>;
}
