# Image send capability — implementation record

Generated: 2026-08-03
Session: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M)
Repo: `Jini`, branch `refactor/jini-admin-extraction`, `packages/agent-runtime/src/providers/`
Unblocks: OQ-2, the vision self-check slice of `@jini-ai/vibecoding`
Supersedes the "blocked" verdict in `../recon/2026-08-03-jini-multimodal-capability.md`

## READ THIS FIRST — the adapters are not on the path a user's image travels

Everything below about the five provider adapters is correct, proven on the wire, and necessary.
**It is also not the transport Tovu's admin assistant uses.** Established by tracing, late in the
session, after the adapter work was done:

- **`/api/proxy` has ZERO callers in Tovu** (`grep -rn "api/proxy" src apps/admin/src`).
- `Tovu/src/server/routes/admin/assistant/deps.ts` describes the assistant as *"a reverse proxy in
  front of the agent-daemon process"* — i.e. the **CLI-agent/daemon path**, the one where
  `defs/claude.ts` drops `_imagePaths`.
- Tovu's chat UI is `apps/admin/src/components/AssistantDock.tsx` hosting a `<ChatPane>`.

So the regular user flow — drop an image into the admin chat — is blocked, but **not** for the
reason first reported. See the correction immediately below.

### CORRECTED: the attachment mechanism already exists, fully built

An earlier pass in this session claimed `<ChatPane>` had no attachment affordance, citing zero grep
hits in `packages/chat-react/src`. **That directory does not exist**, and the grep ran with stderr
suppressed, so "no such directory" was indistinguishable from "no matches." Absence of a path was
read as absence of a capability. (This is the same trap as the handoff's "an empty symbol-name
search is evidence about names, not capability" — committed hours after that lesson was recorded.)

The real path is `@jini-ai/ui/chat` → `packages/ui/src/react/chat`, and it contains a complete,
tested mechanism:

- `Composer.tsx:83-99` — a real `type="file"` input and "Attach files" button.
- `hooks/useChatPaneFileDrop.hooks.ts` — real `dataTransfer`/`onDrop` drag-and-drop.
- `features/chat-pane/create-daemon-attachment-uploader.ts` — `createDaemonAttachmentUploader(baseUrl)`
  returns a ready-made uploader with per-file/per-batch quotas, bounded concurrency and rollback on
  partial failure.
- `hooks/useChatPane.hooks.ts:260-276` — already forwards staged attachments into
  `transport.startRun` as `input.attachments`, a first-class field
  (`chat-core/src/transport.ts:59`).
- `ChatPane.tsx:216-233` — `resolveDropTargetProps`/`resolveComposerAttachmentPicker` gate **purely**
  on whether the host passes `uploadAttachments`. Undefined → both return `{}` and the affordance is
  inert. **That is the entire gate.**

So the UI half is a one-line switch (`uploadAttachments` + `attachmentAccept="image/*"`), not a
build, and **no change to `@jini-ai/ui` is required**.

### The four real breaks — all Tovu-side wiring

1. `apps/admin/src/components/AssistantDock.tsx` — `<ChatPane>` never receives `uploadAttachments`.
2. `apps/admin/src/lib/assistant-transport.ts` (~190-221) — `startRun` silently drops
   `input.attachments`; the POST body is only `{contextRef, agentId}`.
3. `src/server/modules/assistant.ts` (144-177) — no proxied `/api/attachments` route, so a correct
   client upload has nowhere to land.
4. `src/assistant/agent-daemon-server.ts` — two breaks: it never mounts `registerAttachmentRoutes`/
   `createDiskAttachmentStore`, and `onStarted` (284-350) never decodes attachment refs, never calls
   `.claim()`, and never passes `imagePaths` to `agentExecutor.run()` (337-343) — despite that field
   being first-class and daemon-supported at `agent-executor.ts:519`.

`http-kit`'s `attachments.ts` upload/claim system is production-quality and **genuinely
unreferenced** by any real product surface: the only caller of `.claim()` and the only mounting of
`registerAttachmentRoutes` in either repo is `examples/reference-web/src/daemon.ts:589`. It is
demo-only today.

**Documentation defect found:** `attachments.ts`'s own module doc (line ~49) presents
`attachmentRefsFrom(context.request)` as the canonical way to pull refs off a run-start request.
**That helper does not exist**, and `http-kit`'s real `RunCreateRequest` (`runs.ts:37-41`) has only
`contextRef`/`agentId`/`idempotencyKey` — no attachments field. Refs must travel inside `contextRef`'s
own JSON blob, the same channel `prompt`/`principalId` already use.

**The methodological lesson, stated plainly: the recon listed "whether the frontend actually sends
an attachment" as unverified and out of scope, and that unverified item turned out to decide which
transport mattered.** An unverified assumption about *which path the product uses* outranks any
amount of verified detail about a path it does not. Trace the product's real call path before
choosing where to spend.

### The CLI fix is far cheaper than the recon assumed

The recon recommended against the CLI-agent path because it would mean speaking N per-CLI protocols.
That is not required. Measured directly: piping `Tell me what this image is as best you can:
/tmp/probe-image.png` into a live `claude -p` produced an accurate description of the image. The CLI
reads the file itself when the path is named in the prompt.

Two caveats, both measured rather than assumed:
- It **first refused** the same request with the path under `/Users/la/Desktop`, reporting the
  directory as outside its allowed working directories. The allowed-dir half is real and necessary —
  and maps onto `buildArgs`'s existing `extraAllowedDirs` → `--add-dir` mechanism.
- `writePromptToStdin` (`agent-executor.ts:2564`, writing at ~1972-1981) sends `input.prompt`
  **verbatim**, so prompt augmentation has to happen where the prompt is assembled, not in
  `buildArgs` — which receives the paths (line 2339) but only builds argv.

**Do not make this a blanket change.** Four integrations already forward images correctly and would
deliver twice: `defs/qoder.ts`, `agent-protocol/acp/session-params.ts` (`buildPromptBlocks`), and
`agent-protocol/pi-rpc/session.ts`. It needs a per-def delivery mode, and "cannot accept images" must
stay distinguishable from "not yet wired".

### What the BYOK adapter work is still good for

The direct-provider route is the right home for the **vision self-check loop** (renderer → tool
result → model), which is a first-party mechanism that never involves a user upload. That was the
original justification and it still holds. The adapters are also what any future BYOK chat surface
will need. Neither claim depends on the assistant's current transport.

## Why this was done

The multimodal recon established that Jini could not send an image to a model on any transport
path, and that the fix belonged on the direct-provider proxy path rather than the CLI-agent path.
This is that fix. Two Sonnet 5 subagents at xhigh implemented it, split so neither owned a file the
other touched.

## The correction the recon understated, and it mattered

The recon's verification pass named `AnthropicToolResultBlockParam.content: string` as the precise
blocker. True, but incomplete. Reading the file directly turned up **two more `string`s on the same
chain**:

- `AnthropicToolResult.content` (line ~105) — the **host-facing** type returned by the
  caller-supplied `AnthropicToolExecutor`.
- `AnthropicTurnEvent`'s `tool_result` variant `content` (line ~119) — the event the caller receives.

Widening only the wire type would have produced a type capable of carrying an image **that no host
could put an image into**, because the executor callback could not return one and the event stream
could not report one. Both agents were briefed on the full chain. Anyone implementing from the
recon's summary alone would have shipped the incomplete version and it would have typechecked.

## THE FINDING: the tool-result channel is not uniform across providers

This is the load-bearing architectural fact from this work, and it was not anticipated by any prior
report or by the brief. It was surfaced by the OpenAI/Google agent at its milestone check-in and
independently confirmed by the Coordinator before implementation proceeded.

| provider | can a tool result carry an image? | mechanism |
|---|---|---|
| **Anthropic** | **Yes** | `tool_result.content` accepts a content-block array natively |
| **Ollama** (`/api/chat`) | **Yes** | `images[]` is legal on ANY message role, including `tool` |
| **OpenAI** | **No** | `tool`-role message content is documented text-only |
| **Azure** | **No** | inherits OpenAI's shape byte-for-byte |
| **Google** (classic `generateContent`) | **No** | `FunctionResponse.response` is a struct with no parts array |

For the three that cannot, the accepted design is a **synthetic follow-up `user` turn**: the tool
message stays text, and the image is appended immediately afterward as an ordinary user-role
message with image parts.

Two constraints on that workaround, both mandated by the Coordinator after review:

1. **Ordering is correctness, not style.** OpenAI requires every `tool_call` from an assistant turn
   to be answered by its `tool` message *before* any non-tool message. Emit ALL tool messages first,
   then ONE batched follow-up carrying images from however many results produced them. A naive
   one-follow-up-per-tool-result implementation is malformed whenever an assistant turn makes
   parallel tool calls, and a single-tool-call test will not catch it.
2. **The synthetic turn must be attributed.** A bare user message containing an image is
   indistinguishable to the model from the human having just uploaded a screenshot — actively
   harmful in a self-check loop, where the model may treat its own render as a new user request.
   Each image is preceded by a text part naming the tool call it answers.

**Consequence for `@jini-ai/vibecoding`:** a vision self-check loop cannot assume one uniform
transport.

### DECISION (user, 2026-08-03): absorb the asymmetry behind the seam

`@jini-ai/vibecoding` exposes ONE uniform "return an image from a tool" capability and selects the
mechanism per provider internally. A host never learns which provider it is on.

```
host calls:            selfCheck.returnImage(png)
vibecoding internally: anthropic -> tool_result content block
                       openai    -> tool msg + synthetic user turn
                       google    -> functionResponse + follow-up Content
```

Rejected alternatives: **Anthropic-only** (ships fastest, but "works on one provider" cuts against
the package being host-agnostic, which is its entire premise) and **expose a capability flag** (most
honest, but pushes the hard part onto every consumer, i.e. onto both Tovu and Zana).

Consequence: every provider on the route needs the capability, which is why Ollama — outside the
original four-protocol brief — is being completed rather than left text-only.

## Anthropic adapter — COMPLETE

`packages/agent-runtime/src/providers/anthropic-messages.ts` (+268/−7 incl. tests). **25/25 tests
pass** (20 pre-existing unchanged — backward compatibility confirmed; 5 new). `tsc` build clean.

Types added, modeled on Anthropic's real current `ImageBlockParam`:

```ts
AnthropicBase64ImageSource  { type: 'base64'; media_type: 'image/jpeg'|'image/png'|'image/gif'|'image/webp'; data: string }
AnthropicUrlImageSource     { type: 'url'; url: string }
AnthropicImageBlockParam    { type: 'image'; source: ... }
AnthropicToolResultContentBlock = AnthropicTextBlockParam | AnthropicImageBlockParam
```

`AnthropicToolResultBlockParam.content`, `AnthropicToolResult.content`, and the `tool_result` turn
event's `content` all widened to `string | readonly AnthropicToolResultContentBlock[]`. The
request-building path needed **zero** changes — it already `JSON.stringify`s `messages` — and that
was proven by a round-trip test rather than assumed.

**Runtime guard `guardToolResult()`**, applied to every `executeTool()` result: validates
`media_type` against the 4 allowed values and base64 length against a 10 MB-equivalent char cap
(O(1), no decode). On violation it substitutes `{ content: '[rejected …]', isError: true }` — a
legible `is_error` tool_result the model can react to, rather than an opaque upstream 400 that kills
the turn. Rationale: `AnthropicToolExecutor` is host-owned, and TypeScript types do not constrain a
buggy host at runtime. Matches the posture of `connection-guard.ts` and `role-marker-guard.ts`.

Deliberate scope narrowings, documented in the module header as decisions rather than gaps:

- URL-sourced images are **not** size-checked — Anthropic's servers fetch those, not this adapter.
  Different threat model from the SSRF guard on our own outbound `baseUrl`.
- `DocumentBlockParam`/`SearchResultBlockParam`/`ToolReferenceBlockParam` are allowed in a real
  tool_result but were **not** added — out of scope for a text+image self-check.
- `AnthropicMessageParam.content` (direct user-turn images) is **not** gated by the guard: it is
  supplied by our own proxy layer, not by an arbitrary host tool. Different trust boundary.
- The 8000×8000px dimension limit is **not** enforced (would require decoding). Left documented as a
  known limitation rather than silently claimed.

## The live route is transparent — VERIFIED, not assumed

The recon's grep of `packages/http-kit/src/model-proxy.ts` for `image`/`attachment`/`multimodal`
returned zero hits, which is **ambiguous in the way that matters**: it could mean the proxy is a
dumb pass-through (adapter change already works end to end) or that it reshapes `messages` and
would silently strip an unknown `type: 'image'` block (feature dead on the live path despite green
unit tests). A grep cannot tell those apart. The file was read.

**Verdict: genuinely transparent. No fix needed; `model-proxy.ts` was NOT modified.** Four
independent lines of evidence:

1. `parseCommon` (model-proxy.ts:191-231) validates only top-level transport fields. `messages` is
   typed `unknown[]` and passed through untouched; the call site is a raw cast with no runtime
   transform (`messages: parsed.messages as unknown as readonly AnthropicMessageParam[]`, line 626).
2. **No zod anywhere in the file.** All validation is hand-rolled and top-level only — nothing walks
   into `messages[]` or `content[]`, so the silent-unknown-key-stripping failure mode cannot occur.
3. `executeTool` is a pure passthrough to the host-injected `deps.anthropicExecuteTool` with zero
   coercion, and `http-kit` now compiles clean against the widened `AnthropicToolResult` — proving
   nothing in that file asserts `.content` is a string.
4. Outbound SSE uses `JSON.stringify(event)` (`sse.ts` `defaultFormatEvent`), not interpolation of
   `.content`, so a nested image block serializes correctly — no `[object Object]` risk.

The module's own doc comment states the ignorance is deliberate: it never inspects the *contents* of
`messages`/`tools`, which is "provider wire-protocol knowledge this package does not have."

One new integration test in `packages/http-kit/src/__tests__/model-proxy.test.ts` reads the actual
`res.write()` SSE bytes and asserts the image survives both the outbound stream and the continuation
request body. **82/82 pass** (81 pre-existing + 1 new). This is the test class that would have caught
a real gap here; the agent-runtime unit tests only ever touch in-memory objects.

## Ollama — COMPLETE, and it is a THIRD shape

`packages/agent-runtime/src/providers/ollama-chat.ts`. **36/36** adapter tests (31 pre-existing
unchanged + 5 new) and **83/83** on the live proxy route; both builds clean.

Endpoint confirmed from the adapter's own `ollamaRequestUrl` (`{baseUrl}/api/chat`, NDJSON), not
assumed — Ollama's OpenAI-compatible `/v1/chat/completions` surface uses an incompatible
`image_url` shape, so picking wrong would have failed only at runtime against a real server.

**Ollama does NOT need the synthetic-follow-up workaround.** Two affirmative source citations, not
an absence-of-counterexample:

- `ollama/api/types.go` — `Message.Images []ImageData` where `ImageData` is a Go `[]byte`, which
  `encoding/json` marshals as a **bare base64 string** (no `data:` prefix, no media type).
- `ollama/server/prompt.go` — `imageTaggedMessages`, the function that actually builds the model
  prompt, iterates every message reading `msg.Images` with **no role check at all**. The only
  restriction found is model-specific (`mllama` rejects >1 image), never role-specific.

So images are legal on a `tool`-role message and it was implemented on the Anthropic pattern —
native, on the tool message itself. Three shapes now exist, not two.

### Two corrections to earlier assumptions in this document's own briefs

1. **"Ollama is typically localhost" is wrong.** The adapter's *default* target is
   `https://ollama.com` — Ollama Cloud, a remote metered service. Any reasoning that leaned on a
   local-only threat model was unsound.
2. **No byte-size cap was added, deliberately.** Anthropic's 10MB is a real, documented, verifiable
   number. Ollama publishes no equivalent for either target; a local install's ceiling is host
   memory, which is not a vendor figure. Inventing one would violate the verify-against-real-docs
   rule, so the guard checks only what is checkable: a `data:` URI prefix (the realistic mistake —
   a host reusing an Anthropic/OpenAI-shaped value) and an empty string. Both O(1), no decode.

### A pre-existing bug fixed as necessary infrastructure

`OllamaToolResult` had **no `isError` field at all**, and the tool loop hardcoded `isError: false`
unconditionally regardless of what `executeTool` returned — so a host could not report a failed tool
call on this provider, and the new guard could not signal a rejected image. Added `isError?: boolean`
wired as `result.isError ?? false`; every existing caller keeps identical behavior, confirmed by the
unchanged pre-existing test still passing verbatim.

### Flagged, not fixed

The real Go `Message` struct has a `ToolCallID string` field (`json:"tool_call_id,omitempty"`) that
this adapter's own doc comment claims does not exist ("Ollama has no call-id concept on the wire").
Either it was added upstream after the original port, or the comparison missed it. Unrelated to
images; left alone as a possible follow-up.

## OpenAI / Azure / Google adapter — COMPLETE

**83/83 scoped tests**; the **full `agent-runtime` package suite passes 1926/1926 across 99 files**
with no regressions; typecheck clean.

### The synthetic turn is attributed, and the ordering is pinned by test

Each image (or run of images) in a follow-up is preceded by a text part reading
``Image output from tool `<name>` (tool_call_id: <id>):``, built per-call inside the batching loop so
several image-bearing calls in one batch stay disambiguated. Without it, a bare user-role image is
indistinguishable to the model from the human having just pasted a screenshot — in a self-check loop
the model then answers the "new user message" instead of continuing its own tool-driven reasoning.

The ordering rule is proven, not assumed. A dedicated multi-tool-call test on all three adapters
fires **3 parallel tool calls (1 text-only, 2 with images)** and asserts the exact 6-message
sequence: `[user, assistant(3 tool_calls), tool(call_1), tool(call_2), tool(call_3), user(batched
labeled images)]`. All three tool messages contiguous, exactly one follow-up after all of them. The
Google variant asserts the single continuation `Content` carries all 3 `functionResponse` parts
first, then the labeled image sections, un-interleaved.

**Backward compatibility is proven byte-identically, not claimed.** Pre-existing untouched tests
still assert `{role:'tool', content:'72F sunny', tool_call_id:'call_1'}` exactly — no follow-up, no
label, no placeholder. Better still, the text-only call *inside* the mixed batch produces that same
shape, proving the split/attribution logic is genuinely per-call and never leaks onto a call that
had no image. Rebuilding agent-runtime's
dist and typechecking `http-kit` confirms `model-proxy.ts`'s pass-through executor typings pick up
the widened types automatically — no edit needed there either.

Wire shapes verified against live docs:

- **OpenAI** `/v1/chat/completions` (explicitly not the newer Responses API):
  `{type:'text'}` / `{type:'image_url', image_url:{url, detail?}}`, data URIs supported.
- **Azure**: **confirmed inherits for free**, to a good standard of proof — Microsoft Learn states
  verbatim that "the format is the same as the chat completions API for GPT-4o, except that the
  message content can be an array containing text and images", *and* reading `azure-chat.ts`
  confirms `azureRequestBody` spreads `messages` into the body with no transform. A dedicated
  round-trip test asserts it against the real assembled body rather than trusting the doc. Note the
  types are **duplicated** rather than imported from OpenAI's adapter, per that file's existing
  convention — it only ever borrowed `runOpenAiCompatibleRequest`, never the types.
- **Google** classic `generateContent`: camelCase `inlineData: {mimeType, data}`, chosen to match
  every other field the file already sends (`functionCall`, `functionResponse`, `usageMetadata`).

**The two workarounds differ in shape, deliberately.** OpenAI/Azure need a separate synthetic
`role:'user'` message because a `tool` message is text-only. Gemini's `Content.parts` has no such
restriction, so the image rides in the *same* `role:'user'` Content as the `functionResponse` part
(`parts: [...functionResponseParts, ...followUpImageParts]`). `functionResponse.response` stays a
plain string in both designs.

### THE ONE UNVERIFIED CLAIM — smoke-test before shipping the self-check loop

Whether Gemini actually **honors** an `inlineData` part folded into the same `Content` as a
`functionResponse` part could not be confirmed from docs. The only documented multimodal
function-response example belongs to the newer Interactions API, which is out of scope for this
adapter. The chosen approach is **structurally legal** per the Part/Content schema and avoids
inventing an undocumented follow-up-message pattern, which is a sound basis for proceeding — but it
is the one genuinely unverified behavioral claim in this work. **Run a live smoke test against the
real Gemini API before the vision self-check loop ships.** Do not resolve it by guessing.

### Guards, and the honesty standard applied to them

- OpenAI/Azure: jpeg/png/webp/gif allowed (a non-animated GIF is indistinguishable from an animated
  one by mime type alone — noted in code). OpenAI documents a 512MB payload and 1500-image cap but
  **no per-image byte limit**, so the adapter adds a conservative 20MB per-image guard *explicitly
  commented in-code as the implementer's own choice, anchored to Google's real number, not a vendor
  figure*. That labeling is the standard to hold future work to.
- Google: enforces the real documented 20MB total-inline budget, applied per-image (strictly tighter
  than the doc allows, and documented as such). No count cap invented, because none is documented.
- A plain `https://` image URL is **not** size- or reachability-checked on any adapter: the vendor's
  servers fetch it, not this process — a different threat model from `connection-guard.ts`'s SSRF
  guard on our own outbound `baseUrl`. Stated in one sentence in each file.
- Invalid or oversized content becomes an `isError: true` tool result the model can react to, rather
  than an opaque vendor 400. Consistent across all four adapters.

### Process note: a coordination message silently failed to deliver

The Coordinator sent this agent two corrections mid-task; the send reported success and the message
never arrived ("no response came back on the earlier design-call flag"). The agent independently
re-derived the first correction (tool-message ordering) from the docs. The second (attributing the
synthetic user turn so the model does not mistake its own render for a human upload) had to be
re-sent after the fact. **A successful send is not proof of delivery** — number messages and require
a paraphrased ack, and re-check on completion whether each correction actually landed.

## Method notes worth keeping

- Both agents were required to verify wire shapes against **live vendor docs**, not memory — this
  package's own header comments establish that convention ("verify against real API docs, don't
  guess from memory"). Both complied and cited fetched URLs.
- Neither agent was permitted to invent a provider-neutral image abstraction. Each adapter models
  its own vendor's wire shape; a neutral type, if ever needed, belongs to a higher layer. This kept
  two concurrent agents from having to coordinate a shared type.
- The milestone check-in earned its cost. The OpenAI/Google agent's tool-result finding arrived
  *before* implementation, when redirecting was free.

---

## 2026-08-03 (later session) — live BYOK verification against a real Gemini key

**Transport: CONFIRMED on all four adapters.** Ran `image-wire-probe.mjs` with a real 201KB PNG.
Image bytes reach the continuation request in each provider's correct wire shape:

| provider | mechanism | landing site in the request body |
|---|---|---|
| Anthropic | native | `$.messages[2].content[0].content[0].source.data` |
| Ollama | native | `$.messages[2].images[0]` |
| OpenAI / Azure | synthetic labeled user turn | `$.messages[3].content[1].image_url.url` |
| Google | `inlineData` folded into the `functionResponse` Content | `$.contents[2].parts[2].inlineData.data` |

**Comprehension: still unproven for Gemini — blocked behind a NEW, unrelated adapter defect.**

Tested with a real `GEMINI_API_KEY`. The key is valid (`gemini-flash-latest` → `200`). The blocker is
our own code:

> HTTP 400 — "Function call is missing a thought_signature in functionCall parts. This is required
> for tools to work correctly … position 2."

`grep -rn "thoughtSignature|thought_signature" packages/agent-runtime/src/` → **zero hits**. The
adapter never captures the `thoughtSignature` off a `functionCall` part and never echoes it back on
the continuation, which Gemini 3.x requires. The continuation is rejected before the model evaluates
any image, so the inlineData fold is **neither confirmed nor refuted** — it is untested behind an
earlier break.

**The 2.x escape hatch is gone.** Measured on this key: `gemini-2.5-flash` and `gemini-2.5-flash-lite`
return **404**; `gemini-2.0-flash` reports quota `limit: 0`; `gemini-2.0-flash-001`/`-lite` return 429.
Only 3.x (`gemini-flash-latest` → `gemini-3.6-flash`, `gemini-3-flash-preview`) serves traffic. So the
Google adapter's tool loop works on no currently-served Gemini model.

**Scope of impact — deliberately narrow.** This route (`/api/proxy/*/stream`, direct-provider BYOK) is
NOT the path a user's dropped image travels; `grep -rn "api/proxy" src apps/admin/src` is still zero
hits, and the admin assistant uses the CLI-agent/daemon path. It does not affect the composer
attachment feature, ChatFab/ChatPane, or anything currently shipping. It blocks the vision self-check
loop and any future BYOK chat surface, and only those.

**Fix, when wanted:** capture `thoughtSignature` per `functionCall` part in `google-messages.ts` and
echo it back on the continuation request, plus a regression test. Self-contained; good cloud dispatch.

---

## 2026-08-03 (same session, later) — BOTH open questions closed

### The `thought_signature` defect is fixed

Jini `726f1ae4`. `google-messages.ts` now captures `thoughtSignature` off the response `Part` and
echoes it back, verbatim, on the continuation.

**Wire shape, measured against a live response rather than taken from docs** — the published
`thought-signatures` page redirects to a thinking guide that describes a *different*, thinking-block
form, which would have led to the wrong implementation:

```json
{ "functionCall": { "name": "render_preview", "args": {}, "id": "UgFzM3QW" },
  "thoughtSignature": "EukCCuYCARFNMg+HEX+iufpVJfgG..." }
```

It is a **sibling of `functionCall` on the same `Part`**, not a field inside it. The wire key is
camelCase `thoughtSignature` even though the 400's text spells it `thought_signature`.

Treated as opaque: carried and re-sent unmodified, never parsed or synthesized. Absent and empty are
kept distinguishable — a `functionCall` with no signature is legal; one with `""` is malformed.

Tests: `agent-runtime` **1928/1928** (+2 regression tests asserting the sibling placement explicitly,
since nesting it inside `functionCall` is the natural-looking mistake and would still typecheck).

### Gemini DOES honor `inlineData` beside `functionResponse` — CONFIRMED

The question this document previously recorded as *"Structurally legal, undocumented. Do not resolve
by guessing"* is now measured, and the answer is **yes**.

Method: a solid-colour PNG generated at runtime, returned as the **only** channel carrying the
colour — no text hint anywhere in the prompt or the tool result. Two runs, two different colours:

| colour sent | model replied |
|---|---|
| `rgb(128,0,128)` | `purple` |
| `rgb(0,160,60)` | `green` |

Two correct answers across different colours rules out a lucky guess. The vision self-check loop is
unblocked on the Google path.

**Note on why this could not be tested earlier:** it was never a key problem. The key was valid the
whole time. The comprehension test was blocked behind the `thought_signature` 400, which killed the
continuation before the model evaluated any image — an earlier break masking a later question.
