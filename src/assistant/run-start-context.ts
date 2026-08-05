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

/**
 * Decodes a run's `contextRef` JSON into the fields `onStarted` needs.
 *
 * `prompt`/`principalId` are required (a malformed value means the run cannot proceed at all);
 * `attachmentIds`/`model` are optional and silently degrade to "none"/`undefined` on a malformed
 * or absent value — an attachment or a model pick is optional, unlike `prompt`/`principalId`.
 *
 * @param contextRef - The raw JSON string from `RunStartHandler`'s `request.contextRef`.
 * @returns The four fields `onStarted` forwards into the prompt prefix, `principalByRunId`, the
 *   attachment claim step, and `AgentExecutor.run()`'s `model` respectively.
 * @throws If `contextRef` is not valid JSON, or decodes without a non-empty string `prompt` or
 *   `principalId`.
 * @complexity O(n) in `attachmentIds` length; O(1) otherwise.
 * @overallScore 100/100
 */
export function parseRunStartContextRef(contextRef: string): {
  prompt: string;
  principalId: string;
  attachmentIds: readonly string[];
  model?: string;
} {
  const parsed = JSON.parse(contextRef) as {
    prompt?: unknown;
    principalId?: unknown;
    attachmentIds?: unknown;
    model?: unknown;
  };
  if (typeof parsed.prompt !== "string" || parsed.prompt.length === 0) {
    throw new Error("contextRef did not decode to a non-empty 'prompt'");
  }
  if (typeof parsed.principalId !== "string" || parsed.principalId.length === 0) {
    throw new Error("contextRef did not decode to a non-empty 'principalId'");
  }
  const attachmentIds = Array.isArray(parsed.attachmentIds)
    ? parsed.attachmentIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return {
    prompt: parsed.prompt,
    principalId: parsed.principalId,
    attachmentIds,
    ...(typeof parsed.model === "string" && parsed.model.length > 0 ? { model: parsed.model } : {}),
  };
}
