# Local CLI model dropdown fix — patch prepared, NOT applied

**Date:** 2026-08-05
**Agent:** Programmer
**Status:** Recon + authoring only, per explicit instruction. No writes to `AssistantDock.tsx` or
`assistant-transport.ts`. No Jini source changes. No build. Only this report is committed.

Builds directly on the root-cause trace in
`Jini/ADS-memory/reports/chat-pane-model-dropdown-not-wired-2026-08-05.md` — three independent,
stacked wiring gaps, all in Tovu source. This report is the ready-to-apply fix for all three,
diffed against the live working tree (including the other session's uncommitted 420/300-line
changes in the two dirty files), not against `HEAD`.

## Baseline for the pre-apply safety check

All four files read at these exact mtimes — the apply step must re-check before touching anything:

```
Aug  5 12:24:17 2026  apps/admin/src/components/AssistantDock.tsx      (dirty vs HEAD — other session)
Aug  5 12:24:17 2026  apps/admin/src/lib/assistant-transport.ts        (dirty vs HEAD — other session)
Aug  5 12:17:37 2026  src/assistant/agent-daemon-server.ts             (clean, matches HEAD)
Aug  5 12:24:17 2026  apps/admin/src/lib/execution-settings.ts         (clean, matches HEAD — read only, not patched)
```

## 1. The diff — three hops, one atomic change

### Hop 1+2 — `apps/admin/src/components/AssistantDock.tsx`

**Import block** (add `type ChatPaneAgentSelection`):
```diff
 import {
   A2uiSurfaceCard,
   ChatPane,
   ConversationList,
   JiniChatProvider,
   createDaemonAttachmentUploader,
   createMcpUiToolCaller,
   registerExtEventRenderer,
   registerMcpUiSurfaceRenderer,
   type ChatPaneAgent,
+  type ChatPaneAgentSelection,
   type FrontendSessionBridge,
 } from "@jini-ai/chat/react";
```

**`resolveRunContext`** — accept and forward `model`, same "omit when absent" convention as
`frontendBindToken` already uses:
```diff
 /**
- * Builds the per-call run context the daemon reads `frontendBindToken` out of
- * (`assistant-transport.ts`'s `contextRef` wiring). Omits the key entirely when no bind token
- * exists yet, rather than sending `frontendBindToken: undefined`, matching the daemon's own
- * "absent means no bound frontend" contract.
+ * Builds the per-call run context the daemon reads `frontendBindToken`/`model` out of
+ * (`assistant-transport.ts`'s `contextRef` wiring). Omits each key entirely when absent, rather
+ * than sending it as `undefined` or an empty string, matching the daemon's own "absent means
+ * default" contract for both fields.
+ *
+ * `model` is forwarded opaque and unfiltered — including the `'default'` sentinel
+ * (`DEFAULT_MODEL_OPTION.id`, `@jini-ai/agent-runtime`) that `ChatPane`'s own selection resolution
+ * falls back to when nothing else is picked. Every agent def's `buildArgs` (and
+ * `resolveModelForAgent`) already treats `'default'`/absent identically as "omit `--model`, defer
+ * to the CLI's own config" — that is the one place this decision is made; duplicating the check
+ * here would only be a second copy of it to keep in sync.
  *
  * @param input.bindToken - The current tab's page-control bind token, or `undefined` if unbound.
+ * @param input.model - The Local CLI picker's live model selection, or `undefined` before a
+ *   selection has resolved (e.g. no agents detected yet).
  * @returns The context object to merge into a run's `contextRef`.
  * @example
- * const context = resolveRunContext({ bindToken: agentBridge?.bindToken() });
+ * const context = resolveRunContext({ bindToken: agentBridge?.bindToken(), model: selectionRef.current.model });
  */
-export function resolveRunContext({ bindToken }: { bindToken: string | undefined }): { frontendBindToken?: string } {
-  return bindToken === undefined ? {} : { frontendBindToken: bindToken };
-}
+export function resolveRunContext(
+  { bindToken, model }: { bindToken: string | undefined; model?: string },
+): { frontendBindToken?: string; model?: string } {
+  return {
+    ...(bindToken === undefined ? {} : { frontendBindToken: bindToken }),
+    ...(typeof model === "string" && model.length > 0 ? { model } : {}),
+  };
+}
```

**Component body** — a live-selection ref (mirrors the existing `frontendBindToken`/`agentBridge`
"read fresh, don't capture" convention a few lines below it), wired into `<ChatPane>` and read by
`runContext`:
```diff
   const chats = useChats();
 
   /**
    * Last assistant message id seen in a terminal state, so a run's completion fires the settings
    * refresh below exactly once. `onMessagesChange` runs on every delta of a streaming reply, and
    * the terminal message keeps arriving in later calls after it settles.
    */
   const settledRunMessageId = useRef<string | null>(null);
 
+  /**
+   * Live mirror of the Local CLI picker's current agent+model selection — read fresh inside
+   * `runContext` below, the same "don't capture, read at call time" pattern `frontendBindToken`
+   * already uses via `agentBridge?.bindToken()` a few lines down. A ref, not state: `ChatPane`
+   * already owns and re-renders on its own selection changes, so mirroring it into local state
+   * here would only add a redundant render with no new information — `onSelectionChange` firing is
+   * enough to keep this current for the NEXT `runContext` call, which is the only place it is read.
+   *
+   * Seeded to match `initialSelection` below so a run started before the operator ever opens the
+   * picker still carries the pane's actual starting selection rather than `undefined`.
+   */
+  const selectionRef = useRef<ChatPaneAgentSelection>({ agentId: "claude" });
+  const handleSelectionChange = useCallback((selection: ChatPaneAgentSelection) => {
+    selectionRef.current = selection;
+  }, []);
+
   const handleMessagesChange = useCallback(
     (messages: ChatMessage[]) => {
       ...
```

```diff
   const runContext = useMemo(
-    () => () => resolveRunContext({ bindToken: agentBridge?.bindToken() }),
+    () => () => resolveRunContext({
+      bindToken: agentBridge?.bindToken(),
+      model: selectionRef.current.model,
+    }),
     [agentBridge],
   );
```

**JSX** — pass the new handler alongside `initialSelection`:
```diff
         initialSelection={{ agentId: "claude" }}
+        onSelectionChange={handleSelectionChange}
         {...(chats.activeId ? { conversationId: chats.activeId } : {})}
```

### Hop 3 — `apps/admin/src/lib/assistant-transport.ts`

Insert immediately after the existing `frontendBindToken` block inside the Local CLI branch of
`startRun` (same function, same `contextRef` object, same "read by name, not spread" reasoning
already documented there):
```diff
       const frontendBindToken = input.context?.["frontendBindToken"];
       const contextRef: Record<string, unknown> = { prompt };
       if (typeof frontendBindToken === "string" && frontendBindToken.length > 0) {
         contextRef.frontendBindToken = frontendBindToken;
       }
 
+      /**
+       * The Local CLI picker's live model selection, from `ChatPane`'s `runContext` prop
+       * (`AssistantDock.tsx`'s `resolveRunContext`). Same "read by name, not spread" reasoning as
+       * `frontendBindToken` above, and the same "omit when absent" convention. Forwarded as an
+       * opaque string — `agent-daemon-server.ts` forwards it the same way, and
+       * `AgentExecutor.run()`'s def-level `buildArgs` is what decides what an absent or `'default'`
+       * value means for a given CLI (`@jini-ai/agent-runtime`'s `models.ts`/`resolveModelForAgent`).
+       */
+      const model = input.context?.["model"];
+      if (typeof model === "string" && model.length > 0) {
+        contextRef.model = model;
+      }
+
       if (input.attachments && input.attachments.length > 0) {
         contextRef.attachmentIds = input.attachments.map((attachment) => attachment.path);
       }
```

### Hop 4 — `src/assistant/agent-daemon-server.ts`

**Recommended shape** (extracts the decode/validate step into a pure, directly-testable function —
see the Tests section for why): add this immediately before `const onStarted`:
```diff
+/**
+ * Decodes a run's `contextRef` JSON into the fields `onStarted` needs, isolated as a pure function
+ * so this decode/validate step is directly unit-testable without standing up the daemon's Express
+ * app, `AttachmentStore`, or `AgentExecutor` — none of which this step touches.
+ *
+ * `prompt`/`principalId` are required (a malformed value means the run cannot proceed at all, same
+ * as before this was extracted); `attachmentIds`/`model` are optional and silently degrade to
+ * "none"/`undefined` on a malformed or absent value, matching each field's own pre-existing
+ * tolerance inline in `onStarted`.
+ *
+ * @param contextRef - The raw JSON string from `RunStartHandler`'s `request.contextRef`.
+ * @returns The four fields `onStarted` forwards into the prompt prefix, `principalByRunId`, the
+ *   attachment claim step, and `AgentExecutor.run()`'s `model` respectively.
+ * @throws If `contextRef` is not valid JSON, or decodes without a non-empty string `prompt` or
+ *   `principalId` — the same two required-field checks `onStarted` already enforced inline.
+ * @complexity O(n) in `attachmentIds` length; O(1) otherwise.
+ * @overallScore 100/100
+ */
+export function parseRunStartContextRef(contextRef: string): {
+  prompt: string;
+  principalId: string;
+  attachmentIds: readonly string[];
+  model?: string;
+} {
+  const parsed = JSON.parse(contextRef) as {
+    prompt?: unknown;
+    principalId?: unknown;
+    attachmentIds?: unknown;
+    model?: unknown;
+  };
+  if (typeof parsed.prompt !== "string" || parsed.prompt.length === 0) {
+    throw new Error("contextRef did not decode to a non-empty 'prompt'");
+  }
+  if (typeof parsed.principalId !== "string" || parsed.principalId.length === 0) {
+    throw new Error("contextRef did not decode to a non-empty 'principalId'");
+  }
+  const attachmentIds = Array.isArray(parsed.attachmentIds)
+    ? parsed.attachmentIds.filter((id): id is string => typeof id === "string" && id.length > 0)
+    : [];
+  return {
+    prompt: parsed.prompt,
+    principalId: parsed.principalId,
+    attachmentIds,
+    ...(typeof parsed.model === "string" && parsed.model.length > 0 ? { model: parsed.model } : {}),
+  };
+}
+
 const onStarted: RunStartHandler = ({ request, run, lifecycle: runLifecycle }) => {
   let prompt: string;
   let principal: Principal;
   let attachmentIds: readonly string[] = [];
+  let model: string | undefined;
   try {
     // `frontendBindToken` also rides in this envelope but is deliberately not read here —
     // `createFrontendControl`'s own `resolveBindToken` above owns that field, so there is exactly
     // one place that decides which tab a run may drive.
-    const parsed = JSON.parse(request.contextRef) as { prompt?: unknown; principalId?: unknown; attachmentIds?: unknown };
-    if (typeof parsed.prompt !== "string" || parsed.prompt.length === 0) {
-      throw new Error("contextRef did not decode to a non-empty 'prompt'");
-    }
-    if (typeof parsed.principalId !== "string" || parsed.principalId.length === 0) {
-      throw new Error("contextRef did not decode to a non-empty 'principalId'");
-    }
-    // Opaque `attachment:<uuid>` capability ids from `apps/admin/src/lib/assistant-transport.ts`
-    // — untrusted strings until `attachmentStore.claim()` re-validates them below. A malformed or
-    // absent field is silently treated as "no attachments" rather than failing the whole run: an
-    // attachment is optional, unlike `prompt`/`principalId` above.
-    if (Array.isArray(parsed.attachmentIds)) {
-      attachmentIds = parsed.attachmentIds.filter((id): id is string => typeof id === "string" && id.length > 0);
-    }
+    const decoded = parseRunStartContextRef(request.contextRef);
     // `<<SUBAGENT_DISPATCH>>` is AGENTS.md's own documented marker (Mandatory Startup section,
     // detection priority 1) for "skip the whole AI-Dev-Shop startup ceremony — this is a
     // dispatched subagent receiving a task prompt, not an interactive human session." Without it,
     // every chat-pane run re-runs the full dev-tooling bootstrap (reads AGENTS.md, prints the
     // startup banner, offers to install slash commands) before touching the user's actual request
     // — confirmed live, burning real turns on a product-facing feature that has nothing to do with
     // this repo's own AI-Dev-Shop pipeline.
-    prompt = `<<SUBAGENT_DISPATCH>>\n\n${parsed.prompt}`;
-    principal = { id: parsed.principalId };
+    prompt = `<<SUBAGENT_DISPATCH>>\n\n${decoded.prompt}`;
+    principal = { id: decoded.principalId };
+    attachmentIds = decoded.attachmentIds;
+    model = decoded.model;
   } catch (error) {
     const message = error instanceof Error ? error.message : String(error);
     void runLifecycle.finish({ runId: run.id, status: "failed", code: null, signal: null, resumable: false });
     console.error(`[agent-daemon] run ${run.id}: malformed contextRef`, message);
     return;
   }
```

```diff
       await agentExecutor.run({
         runId: run.id,
         agentId: request.agentId ?? DEFAULT_AGENT_ID,
         prompt,
         cwd: process.env.TOVU_AGENT_CWD ?? process.cwd(),
         permissionMode: resolvePermissionMode(),
+        ...(model !== undefined ? { model } : {}),
         ...attachmentRunFields,
       });
```

**Alternative, smaller patch** if the extraction is unwanted: skip the new `parseRunStartContextRef`
function, keep the inline `JSON.parse(...)` block, just widen its type to add `model?: unknown`,
add `if (typeof parsed.model === "string" && parsed.model.length > 0) model = parsed.model;` inside
the existing `try`, and add the same `...(model !== undefined ? { model } : {})` spread to the
`run()` call. Functionally identical; the tradeoff is entirely about testability (see Tests, below)
— this hop has **no existing unit coverage today** (confirmed: grepped `src/assistant/__tests__/`
for `onStarted`/`agent-daemon-server` — nothing exercises this handler directly), and `onStarted`
itself is a module-private closure over `agentExecutor`/`attachmentStore`/`customInstructionsCache`,
so testing it without the extraction means either standing up the real Express app (heavy) or
leaving this one hop verified only by composition (hops 1-3's tests plus the already-proven
`buildArgs` translation from the root-cause report) rather than directly.

## 2. The ledger decision — recommend: do NOT read/write `executionConfig.localCli.modelByAgentId`

`executionConfig.localCli.modelByAgentId` (`apps/admin/src/lib/execution-settings.ts:284-306`,
`selectedLocalCliModel`) is real, persisted, ADR-028-chokepoint state — and confirmed unread by
`AssistantDock.tsx` or `assistant-transport.ts` (grepped both for `selectedLocalCliModel`/
`modelByAgentId`/`localCli.model`: zero hits). It would be technically possible to fold this fix
into also reading/writing that ledger, making the model choice survive a reload.

**Recommendation: thread `ChatPane`'s own transient selection through per-run (the diff above), and
leave the ledger alone as a separate, smaller follow-up if reload-persistence is wanted later.**
Reasons:
- **Scope match.** The user's report is a same-session mismatch ("I changed it to Sonnet, it says
  Opus" — one exchange, not "it forgot my choice after I reloaded"). The transient fix fully
  resolves what was reported; folding in persistence answers a question nobody asked.
- **Symmetry.** `initialSelection={{ agentId: "claude" }}` is hardcoded today — the *agent* choice
  doesn't survive a reload either. Persisting only `model` while `agentId` stays hardcoded would be
  a half-persisted, confusing state, not a coherent feature.
- **Blast radius.** Reading/writing the ledger would touch `useExecutionConfig`'s `setExecutionConfig`/
  `saveExecutionConfig` chokepoint — shared, tested machinery already carrying 720 lines of another
  session's in-flight BYOK work in these same two files. A smaller, mechanically obvious diff is
  safer to apply against a moving target.
- **The follow-up stays cheap.** `selectedLocalCliModel` already exists and does the read-side work;
  wiring `initialSelection`/`onSelectionChange` to it later is a self-contained, separately reviewable
  change once this fix has landed and the other session's work has settled.

## 3. `DEFAULT_MODEL_OPTION` — confirmed, and the diff preserves it without re-implementing it

Confirmed via `packages/agent-runtime/src/models.ts` (`DEFAULT_MODEL_OPTION = { id: 'default', ... }`)
and `resolveModelForAgent` (`:72-96`, `if (resolved && resolved !== 'default') return resolved;`) —
`'default'` is the universal sentinel every agent def treats identically: omit `--model`, defer to
the CLI's own config. `claude.ts`'s own `buildArgs` does the same check
(`if (options.model && options.model !== 'default') { args.push('--model', options.model); }`),
confirmed via direct call in the root-cause report (Case A/B argv evidence).

The diff above does **not** re-implement this check at any of the three hops — `resolveRunContext`,
`assistant-transport.ts`, and `parseRunStartContextRef` all forward `model` as an opaque, unfiltered
string (only checking `typeof === "string" && length > 0`, never comparing against the literal
`"default"`). This is deliberate: the sentinel is a single, already-tested piece of logic that
lives at the CLI-translation boundary (`claude.ts`, and identically in every other def) — adding a
second copy of "is this the default sentinel" in Tovu's own code would be a duplicate source of
truth that could drift from it. `ChatPane`'s own `resolveChatPaneSelection` typically resolves
`selection.model` to `'default'` when nothing else is picked, so that literal string DOES flow all
the way through this diff's three hops unfiltered — and is correctly turned into "no `--model` flag"
only once, at the one place that already owns that decision.

## 4. Tests to add

**Hop 1+2 — `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`:**

Extend the mocked `ChatPane`'s fake controls (the same pattern the existing `switch-to-api`/
`pick-model` buttons already use) with a new button exercising the new `onSelectionChange` prop:
```diff
     chatPaneSpy(props);
     return (
       <div data-testid="chat-pane">
         <button type="button" onClick={() => props.onExecutionModeChange("api")}>
           switch-to-api
         </button>
         <button type="button" onClick={() => props.onByokModelChange("gpt-5")}>
           pick-model
         </button>
+        <button
+          type="button"
+          onClick={() => props.onSelectionChange?.({ agentId: "claude", model: "claude-sonnet-5" })}
+        >
+          pick-local-model
+        </button>
       </div>
     );
```
(widen the mock's typed `props` parameter to add `onSelectionChange?: (selection: { agentId: string; model?: string }) => void; runContext?: () => { model?: string; frontendBindToken?: string };`)

The single strongest test in this whole set — proves hops 1+2 together, in the real component, with
no new scaffolding:
```ts
  it("a Local CLI model pick round-trips into the next run's context — the dropdown actually works", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={() => fakeChats()} />);
    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "pick-local-model" }));

    await waitFor(() => {
      const lastProps = chatPaneSpy.mock.calls.at(-1)?.[0] as { runContext: () => { model?: string } };
      expect(lastProps.runContext()).toEqual(expect.objectContaining({ model: "claude-sonnet-5" }));
    });
  });
```

Plus direct unit coverage for `resolveRunContext` itself, extending its existing `describe` block:
```ts
  it("carries the live model selection through when one exists", () => {
    expect(resolveRunContext({ bindToken: undefined, model: "sonnet" })).toEqual({ model: "sonnet" });
  });

  it("omits model entirely when absent — including the empty-string case", () => {
    expect(resolveRunContext({ bindToken: undefined, model: undefined })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined, model: "" })).toEqual({});
  });

  it("carries bindToken and model together without either shadowing the other", () => {
    expect(resolveRunContext({ bindToken: "tok-123", model: "opus" })).toEqual({
      frontendBindToken: "tok-123",
      model: "opus",
    });
  });
```

**Hop 3 — `apps/admin/src/lib/__tests__/assistant-transport.daemon.unit.test.ts`:**

Mirrors the existing `frontendBindToken` tests (lines 85-124) exactly — same fixture, same
assertions style, inserted right after them:
```ts
  test("carries the model through context when present as a non-empty string", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { model: "claude-sonnet-5" }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect(JSON.parse(body.contextRef).model).toBe("claude-sonnet-5");
  });

  test("omits model entirely when absent — not sent as an empty or undefined key", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun({ history: HISTORY, signal: new AbortController().signal }, handlers());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("model" in JSON.parse(body.contextRef)).toBe(false);
  });

  test("a non-string model (shape mismatch) is not forwarded", async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { id: "run-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createTovuAssistantTransport();

    await transport.startRun(
      { history: HISTORY, context: { model: 42 }, signal: new AbortController().signal },
      handlers(),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((init.body as string)) as { contextRef: string };
    expect("model" in JSON.parse(body.contextRef)).toBe(false);
  });
```

**Hop 4 — new file `src/assistant/__tests__/parse-run-start-context-ref.unit.test.ts`**, only
possible because of the extraction in section 1 — this is the one that most directly answers "model
survives into the executor call," since `parseRunStartContextRef`'s output is spread verbatim into
`agentExecutor.run(...)` with no further transformation:
```ts
import { describe, expect, it } from "vitest";
import { parseRunStartContextRef } from "../agent-daemon-server";

describe("parseRunStartContextRef", () => {
  it("forwards a model present in contextRef", () => {
    const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", model: "sonnet" }));
    expect(result.model).toBe("sonnet");
  });

  it("omits model when absent from contextRef", () => {
    const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1" }));
    expect(result.model).toBeUndefined();
  });

  it("a non-string model is not forwarded", () => {
    const result = parseRunStartContextRef(JSON.stringify({ prompt: "hi", principalId: "p1", model: 42 }));
    expect(result.model).toBeUndefined();
  });

  it("still requires prompt and principalId, unchanged", () => {
    expect(() => parseRunStartContextRef(JSON.stringify({ principalId: "p1" }))).toThrow(/prompt/);
    expect(() => parseRunStartContextRef(JSON.stringify({ prompt: "hi" }))).toThrow(/principalId/);
  });
});
```

If the alternative (no-extraction) hop-4 patch is used instead, this last file cannot be written as
a pure-function test — the only remaining direct-verification option would be a full Express
integration test standing up `agent-daemon-server.ts`'s real `start()`, which is materially more
expensive and is why the extraction is the recommended path.

Combined, these four blocks prove the `model` value survives every hop independently — the same
"prove each hop, don't hope one end-to-end test covers everything" approach the root-cause trace
itself used, rather than one long integration test that would pass or fail opaquely.

## 5. Pre-apply safety check (run this before applying anything)

```bash
cd /Users/la/Programming/Tovu
expected_dock="Aug  5 12:24:17 2026"
expected_transport="Aug  5 12:24:17 2026"
actual_dock=$(stat -f "%Sm" apps/admin/src/components/AssistantDock.tsx)
actual_transport=$(stat -f "%Sm" apps/admin/src/lib/assistant-transport.ts)
if [ "$actual_dock" != "$expected_dock" ] || [ "$actual_transport" != "$expected_transport" ]; then
  echo "ABORT: AssistantDock.tsx or assistant-transport.ts changed since this patch was authored." >&2
  echo "  AssistantDock.tsx: expected [$expected_dock], got [$actual_dock]" >&2
  echo "  assistant-transport.ts: expected [$expected_transport], got [$actual_transport]" >&2
  exit 1
fi
echo "OK: both files unchanged since 12:24 — safe to apply against the current working tree."
```
Also re-run `git status --short -- apps/admin/src/components/AssistantDock.tsx apps/admin/src/lib/assistant-transport.ts src/assistant/agent-daemon-server.ts apps/admin/src/lib/execution-settings.ts` immediately before applying, and diff the live file content against the exact blocks quoted in section 1 above (not just the mtime) — a touch without a content change, or a change that lands between this check and the apply, would still slip past mtime alone.

## Scope note

Bug 2's (a)/(b) call remains untouched. Nothing applied — this entire deliverable is the report you
are reading. No build run (Jini source untouched here — this bug never involved Jini's `dist/`).
