import type {
  PublishContentConfirmResult,
  PublishContentExecuteResult,
  PublishContentPeerSummary,
  PublishContentPlanResult,
} from "@tovu/publish-content-ui";

/**
 * @file What `use-publish-content-confirm.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented in
 * `development/docs/architecture/wired-hooks-convention.md` and mirrored next door in
 * `dashboard-port.hooks.ts`: this file declares, `publish-content-dependencies.hooks.ts` binds the
 * real `api` client, and nothing else under `features/dashboard` reaches `lib/api` for publishing.
 *
 * The split earns its keep twice over here. The routes behind `planPublish`/`confirmPublish`/
 * `executePublish` are Task 10's, landing in parallel with this dialog — the fake in the
 * dependencies module is what let the whole ceremony be built and tested before a single one of them
 * existed, and it is what made absorbing their real shape (peer in the PATH, `bundleId` carried from
 * plan into execute) a change to `lib/api.ts` and this interface rather than to the dialog.
 *
 * ## The credential rule, restated where it is easiest to break
 *
 * `PublishContentPeerSummary` carries `masked` and `hasCredential`. Those are the ONLY
 * credential-shaped fields that exist on the client at all. No method on this port takes a peer URL
 * or a secret, and none returns one: every call names a peer by `peerId` and the server resolves
 * the sealed material itself. Do not add a method that breaks that.
 */
export interface PublishContentPort {
  /** `publish_content.read`. */
  listPeers(): Promise<{ peers: readonly PublishContentPeerSummary[] }>;
  /** `publish_content.read` — pure planning, zero writes (`features/publish-content/planner.ts`). */
  planPublish(input: { peerId: string }): Promise<PublishContentPlanResult>;
  /** `publish_content.apply`. Issues the one token that authorizes an execute. */
  confirmPublish(input: { peerId: string; planId: string; planHash: string }): Promise<PublishContentConfirmResult>;
  /**
   * `publish_content.apply`. The only call in this port that writes anything.
   *
   * `bundleId` comes from {@link planPublish}'s own result and is not optional: the peer's
   * `/import/execute` refuses a confirmation token presented against any bundle but the one it
   * planned, so the client carries the value across the ceremony rather than the server keeping
   * implicit per-operator state between two requests.
   */
  executePublish(input: {
    peerId: string;
    bundleId: string;
    confirmationToken: string;
  }): Promise<PublishContentExecuteResult>;
}
