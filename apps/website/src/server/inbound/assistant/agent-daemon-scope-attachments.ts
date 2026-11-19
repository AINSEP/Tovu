import type express from "express";
import { readFile as realReadFile } from "node:fs/promises";
import type { Principal } from "@jini-ai/core";
import { prepareMessageAttachments as realPrepareMessageAttachments, type MessageAttachmentImage, type UserMessageDelivery } from "@jini-ai/daemon";
import { createDiskAttachmentStore, stageAttachmentClaim as realStageAttachmentClaim, attachmentUploadRoutes, attachmentCleanupRoutes, type AttachmentStore, type AttachmentsHttpDeps, type RunMessageRequest, type RunStartHandler, type StoredAttachment } from "@jini-ai/daemon/http";
import { sniffContentType as realSniffContentType } from "@jini-ai/cms/media";
import { failRunBeforeStart as realFailRunBeforeStart } from "#src/assistant/agent-session-preset";
import { registerDaemonAttachmentLookup, RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { TOVU_MAX_UPLOAD_BYTES } from "#src/contracts/core/upload-limits";
import { mountJiniRoutes, type daemonRouteHost } from "../../runtime/composition/jini-routes.js";
import { agentReceivesImageAttachments as realAgentReceivesImageAttachments } from "./run-start-decisions.js";
import { prepareByokMessageAttachments as realPrepareByokMessageAttachments } from "./byok-message-attachments.js";
import type { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";

type OnStartedContext = Parameters<RunStartHandler>[0];
/** The extra `AgentExecutor.run()` fields a claimed attachment batch contributes. */
export type AttachmentRunFields = { imagePaths?: readonly string[]; imageContents?: readonly MessageAttachmentImage[]; attachmentNotice?: string;
  extraAllowedDirs?: readonly string[]; uploadRoot?: string };
/**
 * Total bytes one composer turn's staged attachments may sum to (`createDiskAttachmentStore`'s
 * `maxBatchBytes`, `@jini-ai/http-kit`'s own default is 20 MB). Kept at twice
 * {@link TOVU_MAX_UPLOAD_BYTES} (below) — the daemon's own per-file cap — rather than left equal to
 * it, so a turn with one file at the cap still has room for a second small one; that default's own
 * doc says the per-file cap "should be at or below" this value, and an exact match would leave zero
 * headroom for any additional attachment in the same turn. Owner-directed (2026-09-21): the
 * per-file cap rose to 50 MiB alongside the media upload cap it mirrors, so this rose to 100 MiB to
 * keep that headroom.
 */
const ATTACHMENT_MAX_BATCH_BYTES = TOVU_MAX_UPLOAD_BYTES * 2;

type AttachmentPorts = {
  getAttachmentStore(): Pick<AttachmentStore, 'claim'> | undefined;
  routeDeps: { siteBinding: { dir: string } }; stagedAttachmentCleanupByRunId: Map<string, () => Promise<void>>;
  defaultAgentId: string; getAgentDef: (required: { id: string }) => Parameters<typeof realAgentReceivesImageAttachments>[0]['def'];
  stageAttachmentClaim?: typeof realStageAttachmentClaim; prepareMessageAttachments?: typeof realPrepareMessageAttachments;
  readFile?: (path: string) => Promise<Uint8Array>; sniffContentType?: typeof realSniffContentType;
  failRunBeforeStart?: typeof realFailRunBeforeStart; console?: Pick<Console, 'error'>; agentReceivesImageAttachments?: typeof realAgentReceivesImageAttachments;
};
export function createAttachmentRunFieldsResolver(ports: AttachmentPorts, _optional = {}) {
  return resolveAttachmentRunFields.bind(undefined, ports);
}

/**
 * Claims `attachmentIds` against `attachmentStore` and resolves the extra `AgentExecutor.run()`
 * fields the claimed batch contributes (`imagePaths`/`extraAllowedDirs`/`uploadRoot`). Returns
 * `null` when the run should be aborted instead — this function has already called
 * `runLifecycle.finish({status: "failed", ...})` and logged why in that case, mirroring the
 * severity {@link onStarted}'s malformed-`contextRef` branch already gives a failure this early.
 * A no-op ({} fields) when `attachmentIds` is empty — the common case, no store round trip needed.
 */
async function resolveAttachmentRunFields(
  { getAttachmentStore, routeDeps, stagedAttachmentCleanupByRunId, defaultAgentId: DEFAULT_AGENT_ID, getAgentDef,
    stageAttachmentClaim = realStageAttachmentClaim, prepareMessageAttachments = realPrepareMessageAttachments,
    readFile = realReadFile, sniffContentType = realSniffContentType, failRunBeforeStart = realFailRunBeforeStart,
    console = globalThis.console, agentReceivesImageAttachments = realAgentReceivesImageAttachments }: AttachmentPorts,
  { run, attachmentIds, runLifecycle, agentId = DEFAULT_AGENT_ID }: {
    run: Pick<OnStartedContext["run"], "id">; attachmentIds: readonly string[]; runLifecycle: OnStartedContext["lifecycle"]; agentId?: string;
  }, _optional = {},
): Promise<AttachmentRunFields | null> {
  if (attachmentIds.length === 0) return {};

  const attachmentStore = getAttachmentStore();
  if (!attachmentStore) {
    // Structurally unreachable (see `attachmentStore`'s own doc) but fails only this run, not the
    // process, if it somehow is.
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: attachments are not ready yet." }, {});
    console.error(`[agent-daemon] run ${run.id}: attachment claim requested before the attachment store was ready`);
    return null;
  }

  try {
    // Only `.path` (the opaque capability id) is ever read by `claim()` — it looks up its own
    // internal registry by that id and re-derives `name`/`kind`/`size` from what `register()`
    // recorded at upload time, never from a caller-supplied value. The placeholder `name`/`kind`
    // below satisfy `StoredAttachment`'s shape without asserting anything the store would actually
    // trust.
    const refs: StoredAttachment[] = attachmentIds.map((id) => ({ path: id, name: "", kind: "file" }));
    const originalClaim = await attachmentStore.claim({ attachments: refs, runId: run.id });
    if (originalClaim.batchDirectory === undefined) return {};
    // Register cleanup before yielding so terminalization during the copy still reaps it.
    const staging = stageAttachmentClaim({ claim: originalClaim, filesystemRoot: routeDeps.siteBinding.dir }, {});
    stagedAttachmentCleanupByRunId.set(run.id, async () => (await staging).cleanup());
    const claimed = (await staging).claim;
    const def = getAgentDef({ id: agentId });
    const byPath = new Map(claimed.attachments.map(attachment => [attachment.path, attachment]));
    const prepared = await prepareMessageAttachments({ refs: [...byPath.keys()], read: ({ ref }) => {
      return readStagedAttachment({ byPath, ref, readFile, sniffContentType });
    } }, { fileAccess: true, imageAccess: agentReceivesImageAttachments({ def }, {}) });
    // Non-image uploads need an explicit prompt notice as well as site-contained staging; otherwise a
    // readable .md/video is never named to the agent. Generic delivery now owns that distinction.
    return { imagePaths: prepared.imagePaths, imageContents: prepared.images, attachmentNotice: prepared.notice,
      uploadRoot: claimed.batchDirectory };

  } catch (error) {
    // Fails the run outright rather than silently continuing without the image: the same severity
    // this handler already gives a malformed `contextRef` above. A user who attached a screenshot
    // and gets a run that never saw it (already-claimed, expired past `retentionMs`, or an
    // integrity check failure) would otherwise get a confusing answer about content the agent never
    // looked at, with nothing explaining why.
    const message = error instanceof Error ? error.message : String(error);
    await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message: "The assistant could not start: an attached file could not be read." }, {});
    console.error(`[agent-daemon] run ${run.id}: attachment claim failed`, message);
    return null;
  }
}

async function readStagedAttachment({ byPath, ref, readFile, sniffContentType }: {
  byPath: Map<string, StoredAttachment>; ref: string; readFile: (path: string) => Promise<Uint8Array>; sniffContentType: typeof realSniffContentType;
}, _optional = {}) {
  const attachment = byPath.get(ref);
  if (!attachment) throw new Error(`agent attachment was not staged: ${ref}`);
  const bytes = await readFile(attachment.path);
  return { name: attachment.name, path: attachment.path, bytes, mimeType: sniffContentType({ bytes }) };
}

type DeliveryPorts = {
  principalByRunId: Map<string, Principal>; ATTACHMENT_UPLOAD_DIRECTORY: string;
  agentExecutor: { sendUserMessage(required: RunMessageRequest, optional?: { imageContents: readonly MessageAttachmentImage[] }): Promise<UserMessageDelivery> };
  prepareByokMessageAttachments?: typeof realPrepareByokMessageAttachments;
};
export function createRunUserMessageDelivery(ports: DeliveryPorts, _optional = {}) {
  return deliverRunUserMessage.bind(undefined, ports);
}
/** Delivers authorized screenshot pixels through the existing live-input path. Reads do not claim
 * uploads: an unsupported runtime or an ending run must leave the whole turn available for the
 * idle attachment claim. Non-image files wait for idle delivery, which also grants directory access.
 * @complexity O(b) time/space in attachment bytes, bounded by the existing upload limits.
 */
async function deliverRunUserMessage(
  { principalByRunId, ATTACHMENT_UPLOAD_DIRECTORY, agentExecutor, prepareByokMessageAttachments = realPrepareByokMessageAttachments }: DeliveryPorts,
  { runId, text, id, attachmentIds = [] }: RunMessageRequest, _optional = {},
): Promise<UserMessageDelivery> {
  if (attachmentIds.length === 0) return agentExecutor.sendUserMessage({ runId, text, id });
  const principal = principalByRunId.get(runId);
  if (principal === undefined) return "not-running";
  const prepared = await prepareByokMessageAttachments({
    refs: attachmentIds, principalId: principal.id, uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY,
  }, {});
  if (prepared.notice !== "") return "unsupported";
  return agentExecutor.sendUserMessage({ runId, text, id, attachmentIds }, { imageContents: prepared.images });
}

export function openScopeAttachments({ ATTACHMENT_UPLOAD_DIRECTORY }: { ATTACHMENT_UPLOAD_DIRECTORY: string }, _optional = {}) {
  // `createDiskAttachmentStore` is async (it reconciles `uploadDirectory` against the previous
  // process on construction — see its own doc), so it cannot be a module-scope `const` the way
  // `agentExecutor`/`toolExecutor` are. Assigned into the scope-local `attachmentStore` binding
  // `onStarted` reads, and awaited here — before the host mounts this scope — so no request
  // can ever reach this process while `attachmentStore` is still unset (`onStarted`'s own doc
  // explains why that matters).
  //
  // `retainAcrossRestarts` is NOT optional for this host, and the reason is specific to how this
  // process is started. The daemon is a `spawn()` child of `src/index.ts`, which dev runs under
  // `tsx watch` — so every save anywhere in `apps/website/src` kills and respawns it (see
  // `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts`). Without this option the store empties `uploadDirectory` on each
  // of those constructions, which means an unrelated source edit silently destroys every chat
  // attachment a user has staged but not yet sent. That is not a hypothetical: an upload was
  // observed erased by an API reload ~90 seconds later. The store's default is deliberately the
  // conservative one for hosts whose process lifetime really does bound an upload's; this host is
  // not one of them.
  //
  // Adoption is authenticated, not blind — a file that changed between processes is rejected by the
  // same integrity gate `claim()` applies, and anything unaccounted for is swept. Reverting to the
  // previous behavior is deleting this one option.
  return createDiskAttachmentStore({
    uploadDirectory: ATTACHMENT_UPLOAD_DIRECTORY,
  }, {
    retainAcrossRestarts: true,
    maxBatchBytes: ATTACHMENT_MAX_BATCH_BYTES,
  });
}

export function mountScopeAttachments({ app, attachmentStore, routeHost, authEnv, idlePark }: {
  app: express.Express; attachmentStore: AttachmentStore; routeHost: ReturnType<typeof daemonRouteHost>; authEnv: NodeJS.ProcessEnv;
  idlePark: Pick<ReturnType<typeof createAgentDaemonIdlePark>, 'hold'>;
}, _optional = {}) {
  // Server-side attachment tools consult the sole live owner, including uploads made after boot.
  // The adapter adds its own full-daemon-token gate; run credentials cannot access this route.
  registerDaemonAttachmentLookup({ app, store: attachmentStore, host: routeHost, mountRoutes: ({ routes }) => mountJiniRoutes({ app, routes }) }, { env: authEnv });
  // Registered ahead of `express.json()` in spirit (see `attachments.ts`'s own "mount before any
  // global body parser" note) even though call order here is necessarily after it (`express.json()`
  // is synchronous module-scope code above; this file's own body-parser-skip behavior for a
  // non-JSON `content-type` is what actually protects the upload route — see
  // `apps/website/src/server/runtime/composition/modules/assistant.ts#forwardAttachmentUpload`'s doc for the full trace of why an
  // `application/octet-stream` POST survives `express.json()` regardless of registration order).
  const attachmentDeps: AttachmentsHttpDeps = { store: attachmentStore,
      acquireActivity: () => idlePark.hold({}, {}),
      // The trusted-downstream-of-the-bearer-gate header `forwardAttachmentUpload`
      // (`server/runtime/composition/modules/assistant.ts`) now stamps from the uploading admin's
      // OWN session — see that function's doc. This is what `chat_list_pending_attachments`
      // (`list-pending-chat-attachments.ts`) scopes its listing by.
      resolveOwnerId: ({ request }) => request.headers.get(RUN_PRINCIPAL_HEADER) ?? undefined,
      // Without this, `@jini-ai/http-kit`'s own default (20 MB) silently undercuts
      // `TOVU_MAX_UPLOAD_BYTES` for the one media path that reaches it (a chat attachment promoted
      // to the library, `promote-chat-attachment.ts`) — this route's hard, streaming-enforced byte
      // cap, not just the client's own pre-check (`AssistantDock.hooks.tsx`'s
      // `useAttachmentUploader`, which must independently match this so a rejection surfaces before
      // the bytes are ever sent, not just after).
      maxAttachmentBytes: TOVU_MAX_UPLOAD_BYTES };
  mountJiniRoutes({ app, routes: attachmentUploadRoutes({ deps: attachmentDeps, host: routeHost }) }, { rawBody: true });
  mountJiniRoutes({ app, routes: attachmentCleanupRoutes({ deps: attachmentDeps, host: routeHost }) });
}
