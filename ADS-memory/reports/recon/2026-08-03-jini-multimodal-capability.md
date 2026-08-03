# Recon: can Jini/Tovu's model layer send images today?

**Purpose:** Before designing a vision self-check slice for `@jini-ai/vibecoding` (render → screenshot → feed back to model, per the screenshot-to-code recon), determine whether Jini's existing model-request-building code can send an image to a model at all.
**Repos:** `/Users/la/Programming/Jini` (HEAD `a2a7a4a`, 2026-08-03; untracked `packages/vibecoding/`) and `/Users/la/Programming/Tovu` (HEAD `ed840fc`, 2026-08-03; dirty working tree — unrelated admin-UI changes in flight, not touched here).
**Method:** Direct `rg`/file reads, per instruction. Codebase Memory MCP indexes checked for freshness first: `Users-la-Programming-Jini-packages` reports 0 changed files since indexing (but does not yet include the untracked `packages/vibecoding/`, which is out of scope for this question anyway — see below); `Users-la-Programming-Tovu-src` reports 3 changed files, all unrelated admin-UI files (`FormEditor.tsx`, `ADR-INDEX.md`, `check-capability-inventory.ts`) — neither index's staleness affects anything cited below, all of which was re-read from source directly regardless.

## Verdict

**No — text-only end to end, on both of Jini's two model-transport paths, right now.** This is not a "nobody happened to wire it up" gap; it is a structural one. The direct-provider request-building code that backs Tovu's four-protocol admin assistant (`packages/agent-runtime/src/providers/{anthropic-messages,openai-chat,azure-chat,google-messages}.ts`, fronted by `packages/http-kit/src/model-proxy.ts`) has **no image content-part type at all** in any of its four provider adapters — the Anthropic content-block union is `text | tool_use | tool_result` with `tool_result.content: string`; OpenAI's message `content` is typed `string | null`, not an array of parts; and the Google adapter's own doc comment states outright: *"Scope for this pass: text + function-call parts and the tool-execution loop only. `inlineData`/`fileData` parts (multimodal input/output) ... are out of scope."* Separately, the attachment-upload system (`ChatAttachment`, `@jini-ai/http-kit`'s `attachments.ts`) is real and well-built, but it only reaches the CLI-coding-agent orchestration path (`imagePaths` → `AgentExecutor.run()` → per-agent `buildArgs`) — and there, the flagship `claude` CLI definition (`agent-runtime/src/defs/claude.ts:81`) takes `_imagePaths` as an explicitly-unused, underscore-prefixed parameter: the image path is never passed to the `claude` CLI invocation at all. This is exactly the open-lovable trap (attachment reaches storage/plumbing, never the model) confirmed on Jini's own flagship coding-agent path.

## Q1 — Can Jini send an image to a model today?

No, on the path that matters for a tool-calling vision loop (the direct-provider request/response cycle):

- `packages/agent-runtime/src/providers/anthropic-messages.ts:63-90` — `AnthropicContentBlockParam = AnthropicTextBlockParam | AnthropicToolUseBlockParam | AnthropicToolResultBlockParam`. No `image` variant exists in this union. `AnthropicToolResultBlockParam.content: string` (line 78) — even a tool result, which is exactly where a screenshot-to-code-style self-check loop would need to attach a rendered screenshot, can only be a plain string here.
- `packages/agent-runtime/src/providers/openai-chat.ts:57-63` — `OpenAiMessageParam.content: string | null`. The real OpenAI Chat Completions API allows `content` to be an array of `{type: "text"|"image_url", ...}` parts; this adapter's type does not model that at all — it is flatly a string.
- `packages/agent-runtime/src/providers/azure-chat.ts:1-58` — reuses `openai-chat.ts`'s `runOpenAiCompatibleRequest`/message shape wholesale (its own doc, lines 6-11: "Azure OpenAI's chat-completions JSON request/response body is byte-identical to plain OpenAI's... this module reuses `openai-chat.ts`'s extracted SSE-reduction loop"). Whatever OpenAI's adapter can or can't carry, Azure inherits identically — same text-only ceiling.
- `packages/agent-runtime/src/providers/google-messages.ts:57-77` — `GooglePart = GoogleTextPart | GoogleFunctionCallPart | GoogleFunctionResponsePart`. No `inlineData`/`fileData` part. The module's own doc (lines 44-49) says this explicitly: *"`inlineData`/`fileData` parts (multimodal input/output) ... are out of scope"* for this pass — a first-party admission, not an inference on my part.
- These four adapters are exactly what backs the live route: `packages/http-kit/src/model-proxy.ts:1-90` implements `POST /api/proxy/{anthropic,openai,azure,google,ollama}/stream` as "thin SSE route wrappers over `@jini-ai/agent-runtime`'s `run{Anthropic,OpenAi,Azure,Google,Ollama}ToolTurn`" — I grepped the full 754-line file for `image`/`attachment`/`multimodal`/`ContentPart` and got zero hits. This route is confirmed live (Tovu's `list-models.ts` imports `listProviderModels` from the same `@jini-ai/agent-runtime` package for the model-discovery side of the same four-protocol admin assistant feature — `Tovu/src/server/routes/admin/assistant/list-models.ts:1,6`), so this is not dead/experimental code.

**Message vocabulary**: `packages/chat-core/src/messages.ts:42-61` (`ChatMessage`) has `content: string` — a flat string, no content-part array, at the layer every chat UI in Jini is built on. There is no multimodal concept anywhere in this type.

## Q2 — Attachments already exist. How far do they go?

As far as disk and a capability-scoped claim system — genuinely well-engineered — and then into the CLI-coding-agent path only, where most agents drop the image on the floor:

- `ChatAttachment` (`chat-core/src/messages.ts:26-33`) is UI/wire metadata only: `{path, name, kind, size, order}` — no bytes, no data URL.
- `@jini-ai/http-kit`'s `attachments.ts` (`packages/http-kit/src/attachments.ts`) is a real, security-conscious upload/claim system: sniffs `kind` from magic bytes not client-supplied MIME (`detectAttachmentKind`, lines 353-369), issues opaque `attachment:<uuid>` capability ids until `claim()` (lines 587-669) exchanges them for real, integrity-reverified filesystem paths, and is scoped to run lifetime (`cleanupRun`). This is a solid piece of engineering — but it is a **file-staging** system, not a **model-transport** system: its documented purpose (lines 43-58) is to hand claimed image paths to `AgentExecutor.run()` as `imagePaths`.
- `imagePaths` flows through `daemon/src/agent-executor.ts` (lines 519, 1650, 1784, 1826, 1931, 2339, 2479, 2529) into each agent definition's `buildArgs(prompt, imagePaths, ...)` in `agent-runtime/src/defs/*.ts`. I checked the actual usage across every def file grep turned up: **the overwhelming majority declare the parameter `_imagePaths`** (TypeScript's convention for "intentionally unused") — `devin.ts`, `codebuddy.ts`, `antigravity.ts`, `qwen.ts`, `deepseek.ts`, `trae-cli.ts`, `opencode.ts`, `pi.ts`, `amp.ts`, `copilot.ts`, `grok-build.ts`, `mimo.ts`, `codex.ts`, `aider.ts`, `cursor-agent.ts`, and — most importantly — **`claude.ts:81`**, whose `buildArgs` never references `_imagePaths` again in its body (confirmed by reading through the function). **The image never reaches the `claude` CLI invocation.**
- Two exceptions confirm the pattern is a real choice, not an oversight: `qoder.ts:30,54` actually reads and filters `imagePaths`, and two lower-level agent protocols do real work — `agent-protocol/acp/session-params.ts:99-106` (`buildPromptBlocks`) appends one `{type: 'resource_link', uri: imagePath}` block per image to the ACP `session/prompt` payload, and `agent-protocol/pi-rpc/session.ts:255-284` genuinely base64-encodes image bytes into a `{type, data, mimeType}` array for the "pi" RPC protocol's `images` field, with real security work (symlink/upload-root re-verification, byte/count budgets). So **image-to-agent transport has been built once, for one narrow CLI-subprocess protocol** — it is not theoretical, but it is not the flagship Claude path, and it is a different mechanism entirely from the direct-provider proxy in Q1.

**Definitive answer**: attachments reach disk and a real claim/lifecycle system, and reach the *option list* every `AgentExecutor.run()` call passes down — but whether they reach a model depends entirely on which CLI-agent definition is running, and the one most likely to matter for vibecoding (`claude`) currently discards them.

## Q3 — Per-provider breakdown (Tovu's four protocols)

All four fail identically, for the same underlying reason (the request-building types have no image variant) — worth stating per-provider anyway since the *reason* differs slightly:

- **anthropic**: no `image` block type in the content-block union; would need a new `AnthropicImageBlockParam` (`{type: 'image', source: {type: 'base64'|'url', ...}}`) added to `AnthropicContentBlockParam`, and `AnthropicToolResultBlockParam.content` widened from `string` to `string | readonly AnthropicContentBlockParam[]` (matching the real Anthropic API, which already allows this).
- **openai**: no content-part array at all — `OpenAiMessageParam.content` is `string | null`. This needs the bigger change of the four: widening to `string | null | Array<{type:'text',text:string}|{type:'image_url',image_url:{url:string}}>` to match OpenAI's real Chat Completions shape.
- **azure**: inherits whatever `openai-chat.ts` gets, automatically, since `azure-chat.ts` reuses its request builder wholesale — no separate work once OpenAI is fixed.
- **google**: no `inlineData`/`fileData` part type; needs a new `GoogleInlineDataPart` (`{inlineData: {mimeType, data}}`) added to `GooglePart`. This is the one provider where the source itself already names the gap as deferred rather than unconsidered.

## Q4 — What is the gap, tagged Jini vs. host

Assuming screenshot capture itself is the host's job (per the brief), the transport gap from "I have PNG bytes" to "the model saw them" breaks down as:

**Jini pieces (belong in the package, reusable across hosts):**
1. Add an image content-block/part type to all three of `anthropic-messages.ts`, `openai-chat.ts` (azure inherits free), and `google-messages.ts` — both for a message's own content and, critically, for a *tool result's* content, since the whole point of the screenshot-to-code pattern is embedding the image inside a tool result, not the initial user turn. This is a small, well-scoped, three-file change to existing, already-tested turn-runners — not a rewrite.
2. `@jini-ai/vibecoding` itself needs the actual tool-loop scaffolding this capability requires: a tool definition shaped like screenshot-to-code's `screenshot_preview` (name, empty/near-empty args schema, a description telling the model when to call it) plus an `executeTool`-style implementation that calls a host-supplied render/screenshot callback and returns a result whose content uses the new image block type from (1). **This does not exist yet** — I checked: `packages/vibecoding/src/` currently contains only `core/apply.ts`, `core/target.ts`, `core/types.ts`, `core/index.ts` (an early "apply" tier per the in-flight `ADS-memory/reports/recon/2026-08-03-vibecoding-apply-tier.md`/`...-inventory.md` reports elsewhere in this session's Tovu working tree) — no model-turn-running or tool-loop code at all yet. This recon lands before that code exists, which is the right order.
3. Deciding which of the two existing transport mechanisms vibecoding builds on. My read of the evidence: the **direct-provider proxy** (Q1's path) is structurally the better fit, because `runAnthropicToolTurn`/`runOpenAiToolTurn`/etc. already have the exact shape a self-check loop needs — an `executeTool` hook and a tool-result-then-continue loop — whereas the **CLI-agent path** (Q2) hands control to an external subprocess's own conversational protocol (stdin JSONL for `claude`, RPC calls for `pi`, ACP `session/prompt` calls) where Jini can't inject a tool-result image mid-turn without speaking that specific CLI's own protocol, and most of those CLIs don't even accept an image argument today. Building the vision loop on the CLI-agent path would mean fixing N per-CLI integrations (starting with `claude.ts`'s dropped `_imagePaths`) with no guarantee that CLI's own agent will treat an image as a "look at what you just built" self-check rather than a one-time attachment on the first prompt.

**Host pieces (Tovu, or whichever product embeds vibecoding):**
1. The render+screenshot capability itself (assumed out of scope here, per the brief).
2. Wiring: calling vibecoding's render-tool trigger, handing the resulting PNG bytes into the tool-result callback from (Jini piece 2), and supplying the BYOK provider credentials the existing proxy already requires (`apiKey`/`baseUrl` per request — no change needed here, this part already works).
3. Nothing in the existing `ChatAttachment`/upload system needs to change for this specific vision-loop use case — that system is for *user-supplied* attachments reaching a *CLI* agent, a different capability. A vibecoding self-check screenshot never needs to be uploaded/claimed at all; it can go straight from the host's renderer into the tool-result callback in memory, bypassing the attachment-store entirely.

## Confidence and what could not be verified

- **High confidence, directly cited**: the absence of an image/multimodal type in all four provider adapters (read in full or near-full); the `model-proxy.ts` route's confirmed live status and lack of any image handling; `ChatMessage`/`ChatAttachment`'s string/metadata-only shape; `claude.ts`'s confirmed unused `_imagePaths`; the two working counter-examples (`qoder.ts`, ACP `buildPromptBlocks`, pi-rpc `session.ts`).
- **Medium confidence**: that every other `_imagePaths`-underscored def (`devin.ts`, `codebuddy.ts`, `antigravity.ts`, `qwen.ts`, `deepseek.ts`, `trae-cli.ts`, `opencode.ts`, `pi.ts`, `amp.ts`, `copilot.ts`, `grok-build.ts`, `mimo.ts`, `codex.ts`, `aider.ts`, `cursor-agent.ts`) truly never uses the image path anywhere else in its file — I confirmed this via the naming convention and grep context, not a full read of every one of those ~15 files; the naming convention is a strong but not absolute signal (a file could reference the parameter under a different local binding after destructuring, though I saw no evidence of that in the ones I sampled).
- **Not verified / out of scope for this pass**: whether Tovu's admin-assistant frontend currently sends any attachment at all to `/api/proxy/*/stream` in practice (I confirmed the transport *can't* carry one, which makes this moot for the current question, but I did not trace the frontend composer's request-building code); the exact shape `ollama-chat.ts` uses (not one of Tovu's four protocols, not read); whether any other, not-yet-found code path in Jini (outside `agent-runtime`/`http-kit`/`daemon`/`chat-core`) independently calls a model with images (I did not do an exhaustive whole-repo grep for e.g. a standalone Gemini SDK image call outside these packages — the packages named in the brief were the ones searched).

---

## Coordinator verification pass — 2026-08-03

### CONFIRMED — no image variant, and `tool_result` is the specific blocker

`packages/agent-runtime/src/providers/anthropic-messages.ts:63-86` reads exactly as reported:
`AnthropicContentBlockParam = AnthropicTextBlockParam | AnthropicToolUseBlockParam |
AnthropicToolResultBlockParam`. No image variant.

**The detail that matters most, and it is sharper than "no image type":**
`AnthropicToolResultBlockParam.content` is declared `readonly content: string` — a plain string, not
an array of parts. A screenshot-to-code-style self-check returns its images *inside a tool result*.
So even adding a top-level image block would not be enough; `tool_result.content` has to become a
parts array. That is the precise change, and it is the one most likely to be missed by someone
implementing from the summary.

### CONFIRMED under adversarial check — the unused `_imagePaths` finding survives

This one deserved scrutiny, because the report's evidence looked weaker than it was.
`claude.ts:81` reads `buildArgs: (_prompt, _imagePaths, …)` — but **`_prompt` is underscored too**,
and the prompt is unquestionably delivered (via stdin, as that file's own comment explains). So
"underscored" does not by itself mean "dropped", and the inference could have been wrong.

Checked directly. `buildArgs` has exactly one call site (`packages/daemon/src/agent-executor.ts:2337`),
and `imagePaths` appears outside `defs/` only in:

- `agent-runtime/src/types.ts:256` — the signature itself
- `agent-protocol/acp/session-params.ts:99` — `buildPromptBlocks`, which genuinely forwards images
- `agent-protocol/pi-rpc/session.ts:265-267` — which genuinely base64-encodes and forwards them

There is **no stdin fallback for images** the way there is for the prompt. Counts: 16 defs underscore
the parameter, 4 use it. The finding holds.

### What this changes

**OQ-2's status flips twice in one day, and the net position is "blocked", not "buildable".**
Earlier today the screenshot-to-code recon falsified OQ-2's premise that no reference implementation
uses vision — a working loop exists and is readable. This recon establishes the other half: **our own
stack cannot carry it yet.** A vision self-check is proven as a design and blocked as an
implementation until three provider adapters gain image support, `tool_result.content` becomes a
parts array, and `@jini-ai/vibecoding` grows the turn-running scaffolding it does not yet have.

**Accepted recommendation:** build on the direct-provider proxy path, not the CLI-agent path. The
proxy's turn-runners already have the execute-tool-then-continue shape a self-check loop needs,
whereas the CLI-agent path hands control to an external subprocess's own protocol where a mid-turn
tool-result image cannot be cleanly injected. Also accepted: a self-check screenshot needs no
attachment-store involvement — it goes renderer → callback in memory, never uploaded or claimed.
