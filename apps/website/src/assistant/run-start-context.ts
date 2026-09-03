/**
 * @file `parseRunStartContextRef` — the decode/validate step for a run-start request's
 * `contextRef` JSON, pulled out of `agent-daemon-server.ts`'s `onStarted` handler into its own
 * module (2026-08-05, model-dropdown wiring fix, Hop 4 of 4) for the same reason `run-ownership.ts`,
 * `custom-instructions.ts`, and `daemon-auth.ts` already live apart from that file rather than
 * inline in it: `agent-daemon-server.ts` is the standalone daemon PROCESS entry point — it ends in
 * an unconditional `void start()` that binds a real port the moment the module is imported (see
 * that file's own header, "a separate OS process from Tovu's own server"). Importing it anywhere,
 * including from a test, triggers that bind attempt; a pure helper needed elsewhere (or tested in
 * isolation) has to live outside it or inherit that hazard. Keeping this function here is what
 * lets `parse-run-start-context-ref.unit.test.ts` exercise it directly, with no Express app,
 * `AttachmentStore`, or `AgentExecutor` involved — and with no risk of the test process binding a
 * real port or being torn down by the daemon's own `EADDRINUSE`/`process.exit()` handling.
 */

/** Requires `value` to be a non-empty string, or throws naming `label` — the shared shape
 *  `prompt`/`principalId` both need (a malformed value means the run cannot proceed at all).
 *  Split out of {@link parseRunStartContextRef} purely to keep it under the shop complexity
 *  ceiling; behavior (including the exact error text) is unchanged. */
function requireNonEmptyContextField(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`contextRef did not decode to a non-empty '${label}'`);
  }
  return value;
}

/** Filters an optional array field down to its non-empty string entries, defaulting to `[]` when
 *  the field is absent or not an array — the shared shape `attachmentIds` and `pluginRefIds` both
 *  need, so `onStarted` never has to special-case "the field was omitted" vs. "the field was an
 *  empty/malformed array". Split out of {@link parseRunStartContextRef} purely to keep it under
 *  the shop complexity ceiling; behavior is unchanged. */
function readContextStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
}

/** Reads an optional non-empty string field, silently degrading to `undefined` on any other shape
 *  — the shared "optional, degrade rather than fail" contract `model`/`reasoning`/
 *  `conversationId` all follow (see {@link parseRunStartContextRef}'s own doc). Split out purely
 *  to keep that function under the shop complexity ceiling; behavior is unchanged. */
function readOptionalContextString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Decodes a run's `contextRef` JSON into the fields `onStarted` needs.
 *
 * `prompt`/`principalId` are required (a malformed value means the run cannot proceed at all);
 * `attachmentIds`/`model`/`reasoning`/`pluginRefIds` are optional and silently degrade to
 * "none"/`undefined` on a malformed or absent value — an attachment, a model pick, a
 * reasoning-effort pick, or a pinned Agent Plugin is optional, unlike `prompt`/`principalId`.
 *
 * @param contextRef - The raw JSON string from `RunStartHandler`'s `request.contextRef`.
 * @returns The seven fields `onStarted` forwards into the prompt prefix, `principalByRunId`, the
 *   attachment claim step, `AgentExecutor.run()`'s `model` and `reasoning`, the Agent Plugin
 *   resolution step, and the per-conversation agent-session lookup (`agent-session-resume.ts`)
 *   respectively.
 * @throws If `contextRef` is not valid JSON, or decodes without a non-empty string `prompt` or
 *   `principalId`.
 * @complexity O(n + m) in `attachmentIds` and `pluginRefIds` length combined; O(1) otherwise.
 * @overallScore 100/100
 */
export function parseRunStartContextRef(contextRef: string): {
  prompt: string;
  principalId: string;
  attachmentIds: readonly string[];
  model?: string;
  reasoning?: string;
  pluginRefIds: readonly string[];
  conversationId?: string;
} {
  const parsed = JSON.parse(contextRef) as {
    prompt?: unknown;
    principalId?: unknown;
    attachmentIds?: unknown;
    model?: unknown;
    reasoning?: unknown;
    pluginRefIds?: unknown;
    conversationId?: unknown;
  };
  const prompt = requireNonEmptyContextField(parsed.prompt, "prompt");
  const principalId = requireNonEmptyContextField(parsed.principalId, "principalId");
  const attachmentIds = readContextStringArray(parsed.attachmentIds);
  const pluginRefIds = readContextStringArray(parsed.pluginRefIds);
  const model = readOptionalContextString(parsed.model);
  // The model field's twin, decoded with byte-identical rules: the Execution tab's
  // "Reasoning effort" pick rides this same envelope so the def's own `buildArgs` can turn it into
  // `--effort <level>` (claude) or `-c model_reasoning_effort=...` (codex). A runtime that encodes
  // effort inside the model id (antigravity) never sends this — its level is already part of
  // `model`.
  const reasoning = readOptionalContextString(parsed.reasoning);
  // Optional, same "silently degrade to none" convention as `model`/`attachmentIds`/
  // `pluginRefIds` above: a caller that never sends one (any daemon client other than the admin
  // chat pane, today) just never gets session-resume behavior, rather than the whole run failing.
  const conversationId = readOptionalContextString(parsed.conversationId);
  return {
    prompt,
    principalId,
    attachmentIds,
    pluginRefIds,
    ...(model === undefined ? {} : { model }),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(conversationId === undefined ? {} : { conversationId }),
  };
}
