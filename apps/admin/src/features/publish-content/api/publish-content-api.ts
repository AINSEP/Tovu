import type { PublishContentConfirmResult, PublishContentExecuteResult, PublishContentPeerSummary, PublishContentPlanResult, PublishScope } from "@tovu/publish-content-ui";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminPublishDestinationView } from "./publish-content-api.types";

/** The peer-scoped prefix every publish-content push call hangs off — the peer is named in the PATH
 *  (`routes/publish-content/peer-transport.ts`), never in a body, and never as a URL or credential. */
function publishContentPeerPath({ peerId }: { peerId: string }, _optional: Record<string, never> = {}): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/peers/${encodeURIComponent(peerId)}`;
}

/** The zero-setup connect action's own path — a workspace-scoped singleton, not peer-scoped, since
 *  there is nothing to name until it exists (`routes/publish-content/destination.ts`). */
function publishContentDestinationPath(): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/destination`;
}

/** The admin API calls of the publish-content feature. */
export const publishContentApi = {
  // Publish Content — the peer push ceremony behind the Dashboard's "Publish Content"
  // button (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11).
  // Same 3-endpoint gated-mutation shape as `planMergeTerm`/`planRestore` above; the result types
  // come from `@tovu/publish-content-ui` so this client and the server's own planner cannot hold
  // two drifting copies of the report shape.
  //
  // Every call names a PEER by id. A raw peer URL or credential is never sent from the browser and
  // never returned to it — `PublishContentPeerSummary` carries `masked`/`hasCredential` and nothing
  // else credential-shaped (Task 10 owns the sealing).
  listPublishContentPeers: () =>
    request<{ peers: PublishContentPeerSummary[] }>({ path: `/workspaces/${WORKSPACE_ID}/publish-content/peers` }),
  /** Zero-setup connect — reads whether this install already publishes somewhere, and if not, the
   *  candidate pre-filled from the repo's own deploy config
   *  (`routes/publish-content/destination.ts`). Nothing credential-shaped is ever in this response:
   *  see that route's own header for why. */
  getPublishDestination: () => request<AdminPublishDestinationView>({ path: publishContentDestinationPath() }),
  /** The one action that turns a fresh install into a connected one — no key is minted, displayed
   *  or copied. `siteUrl` is optional; omitted, the server falls back to its own candidate, which is
   *  the only path the Dashboard's empty-state offer uses. */
  connectPublishDestination: (input: { siteUrl?: string } = {}) =>
    request<AdminPublishDestinationView>({ path: `${publishContentDestinationPath()}/connect` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** `selectedEntityKeys` (the report rows' own `entityType:entityId` keys) narrows the bundle this
   *  push stages on the peer BEFORE it plans — omitted means "everything", which is what an
   *  untouched dialog sends. See `features/publish-content/export-bundle.ts`'s `selectBundleEntities`
   *  for why a selection is applied at stage time rather than carried into execute.
   *
   *  `overwriteEntityKeys` (publish-overwrite-live-plan §4/S9) is the operator's ticked "Overwrite on
   *  live" rows — sent alongside `selectedEntityKeys`, never in place of it, so re-planning against a
   *  narrower selection never silently drops what was ticked. Omitted means nothing was ticked.
   *
   *  `scope` (`plan-publish-sections-2026-09-25.md` §2 S2) narrows the bundle on the SERVER before
   *  `selectedEntityKeys` does, same "absent means everything" contract. Sent unchanged on every call
   *  the dialog was opened with a scope for. */
  planPublishContent: ({
    peerId,
    selectedEntityKeys,
    overwriteEntityKeys,
    scope,
  }: {
    peerId: string;
    selectedEntityKeys?: readonly string[];
    overwriteEntityKeys?: readonly string[];
    scope?: PublishScope;
  }) =>
    request<PublishContentPlanResult>({ path: `${publishContentPeerPath({ peerId })}/push/plan` }, { init: {
      method: "POST",
      ...(selectedEntityKeys === undefined && overwriteEntityKeys === undefined && scope === undefined
        ? {}
        : {
            body: JSON.stringify({
              ...(selectedEntityKeys === undefined ? {} : { selectedEntityKeys }),
              ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys }),
              ...(scope === undefined ? {} : { scope }),
            }),
          }),
    } }),
  confirmPublishContent: (
    { peerId, planId, planHash }: { peerId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentConfirmResult>({ path: `${publishContentPeerPath({ peerId })}/push/confirm` }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    } }),
  /** `bundleId` comes from `planPublishContent`'s own response and is required: the peer's
   *  `/import/execute` refuses a confirmation token against any bundle but the one it planned.
   *  `overwriteEntityKeys` (publish-overwrite-live-plan §4/S9) is echoed straight from the confirmed
   *  plan's own `overwriteEntityKeys` — never re-derived here — so execute can only force the exact
   *  set the operator's plan was already confirmed against. */
  executePublishContent: (
    {
      peerId,
      bundleId,
      confirmationToken,
      overwriteEntityKeys,
    }: { peerId: string; bundleId: string; confirmationToken: string; overwriteEntityKeys?: readonly string[] },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentExecuteResult>({ path: `${publishContentPeerPath({ peerId })}/push/execute` }, { init: {
      method: "POST",
      body: JSON.stringify({ bundleId, confirmationToken, ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys }) }),
    } }),
};
