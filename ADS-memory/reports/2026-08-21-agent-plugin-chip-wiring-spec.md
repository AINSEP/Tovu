# Agent Plugin chip wiring — design spec

**Date:** 2026-08-21 · **Author:** Software Architect (subagent dispatch) · **Status:** SPEC ONLY, nothing implemented.
**Method:** every file/line cited below was read from source today, in this session, not inherited from the dispatch brief or from memory. Two brief claims turned out to be measurably wrong; both are called out explicitly where they occur, not silently corrected.

## 0. What this is, and what it supersedes

This is the design for turning "UI/UX Design (Agent Plugin)" from an inert composer row into a real capability: select it, get a **removable chip above the textarea**, send, and the agent has genuinely read the plugin's guidance — provable, not assumed. Confirmed starting point (full chain in `2026-08-21-agent-plugin-wiring-static-verdict.md`, which this spec treats as settled): today, selecting the row inserts the literal string `"UI/UX Design agent plugin"` into the draft and nothing else happens. An A/B test with the string present vs. absent produced equivalent output, and an access-time probe showed zero file reads either way — the row is decorative.

**Owner-decided direction (not re-litigated here): chips, not text.** A `<textarea>` cannot style a substring, so the only way to make "this came from a structured selection" visible and machine-readable is to keep the reference out of the draft entirely and render it as its own removable element. That constraint shaped every choice below.

**One explicit supersession.** `apps/admin/src/features/plugins/agent-plugin-capability-adapter.ts:22-33` states a "FINAL decision, debate 3" (`ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md`, "3 — Agent Plugins → commands"): *"A Skill's `execute: { kind: 'context-injection' }` becomes a REAL, selectable `ComposerHostBinding` — its markdown composed directly into the draft."* This spec proposes a **third** `ComposerHostBinding` kind that does the opposite for the chip-eligible case: the markdown is composed into a structured ref, never into the draft. That earlier decision is not wrong for what it covered (a `resolve()`-less macro item with no chip mechanism to target) — it is superseded by the owner's newer, more specific instruction for this one capability. Flagging this because the adapter file's own header calls it non-negotiable; the owner's chip decision is a later, more specific instruction that overrides it for this path only, and I did not want to silently contradict a documented "FINAL decision" without saying so.

## 1. Two corrections to the dispatch brief, load-bearing for the design below

**1a. `augmentUserRequest` is not an "empty extension point" — it has zero callers anywhere in the engine.** The brief says Layer 3 is "filling in a blank, not inventing a mechanism," citing `agent-daemon-server.ts:442-455`'s `PromptAugmenter`. Verified: `augmentUserRequest` is declared in `Jini/packages/agent-runtime/src/prompt-augmenter.ts:46-51` and implemented as a passthrough at `agent-daemon-server.ts:444`, but I grepped every non-dist, non-test `.ts` file in the whole Jini monorepo for `augmentUserRequest(` — the **only** match is the interface's own declaration. `Jini/packages/daemon/src/agent-executor.ts` (2,900+ lines, the actual run loop) never calls it. What it *does* call, once per run at "Phase 8" (`agent-executor.ts:2456-2469`), is `promptAugmenter?.systemOverlay?.({ agentId, turnIndex })` — a **live** seam, but one that only ever sees `agentId` and a coarse 0/1 turn index, never message content. The prompt the CLI actually receives is `input.prompt`, set once in `agent-daemon-server.ts:573` (`` prompt = `<<SUBAGENT_DISPATCH>>\n\n${decoded.prompt}` ``, unchanged from `decoded.prompt` through to `agentExecutor.run({..., prompt, ...})` at line 627-635) and never touched by any `PromptAugmenter` method. **Wiring `augmentUserRequest` to do anything would have zero observable effect today** — it is dead code, not a stub. The real seam is the plain string Tovu already owns end-to-end at `agent-daemon-server.ts:573-635` — see §4.

**1b. The reference set is 12 files, not 10.** `ls AI-Dev-Shop/skills/ui-ux-design/references/` returns 12 `.md` files (`brand-and-voice`, `components-and-states`, `delight-and-motion`, `foundations`, `inclusive-ai-imagery`, `kole-jain-uiux-concepts`, `openai-frontend-skill`, `premium-ui`, `research-and-validation`, `sam-crawford-premium-websites`, `self-made-web-designer-core-skills`, `visual-storytelling`), totaling 68 KB; `SKILL.md` itself is 8.0 KB (~1,900 tokens, not the "77 lines" the brief estimated from a stale read — current `SKILL.md` is 76 lines of markdown but 5.5–8 KB depending on how it's measured; word-count matters more than line-count for the token-budget question in §5).

## 2. What already exists that this design should reuse, not reinvent

Four pieces of load-bearing prior art, found while tracing the real request path — none mentioned in the brief because the brief was written from the composer-capabilities layer down, and these live either above or below it.

**2a. A removable-chip component already exists and is already keyboard-accessible.** `Jini/packages/chat/src/react/components/AttachmentTray.tsx` renders `composer.attachments` as `.jini-attachment-chip` elements, each with a real `<button type="button" aria-label="Remove {name}">` — a genuine focusable, `Enter`/`Space`-activatable control in the DOM tab order, not a `div` with an `onClick`. It's already mounted directly above the textarea in `Composer.tsx:296-297`, exactly matching the brief's own mockup. **Recommendation: do not design a new chip component. Generalize `AttachmentTray` (or add a sibling `CapabilityRefTray` that shares its CSS classes and button pattern) rather than inventing new interaction/accessibility design.** This closes the brief's "note keyboard accessibility" ask — the answer is "reuse the existing pattern verbatim," not a new decision.

**2b. `ComposerHostBinding` already anticipates a third kind — it's typed as a closed union today, deliberately.** `apps/admin/src/features/plugins/composer-capabilities.ts:41-57` defines exactly two kinds (`compose-text`, `allowlisted-tool-call`) and its module doc says outright: *"No third kind exists."* That sentence describes the **current** state of a decision this spec is explicitly asked to revisit, not a constraint to design around. §3 proposes the third kind this file's own structure was clearly built to accommodate (`ComposerHostBinding` is a discriminated union already; adding a member is additive, not a rewrite).

**2c. The composer→transport→server attachment path is a byte-for-byte template for capability refs — and it's a `git blame`-able, well-commented one.** Tracing an attachment's full path:
- Composer state: `useComposer.ts` — `attachments: ChatAttachment[]`, `addAttachment()`, `removeAttachment(id)`, folded into `canSubmit` and cleared in `reset()`.
- Send: `useChatPane.hooks.ts:260,272-278` — `sendPrompt()` reads `composer.attachments`, passes them to `conversation.sendMessage(trimmed, { agentId, attachments: attachments.length === 0 ? undefined : attachments, context })`.
- Client transport: `apps/admin/src/lib/assistant-transport.ts:495-544`, `buildLocalCliContextRef()` — reads `input.attachments`, writes `contextRef.attachmentIds = input.attachments.map(a => a.path)`, **omitted entirely when empty** (an explicit, commented convention, not an oversight).
- Wire: `contextRef` is `JSON.stringify`-ed into the `POST /api/runs` body (`assistant-transport.ts:609`); `src/server/modules/assistant.ts:118-130` re-stringifies it after injecting the server-trusted `principalId` (client-supplied `prompt`/`attachmentIds`/`model` pass through verbatim; `principalId` never does).
- Server decode: `src/assistant/run-start-context.ts:31-58`, `parseRunStartContextRef()` — decodes `attachmentIds` defensively (`Array.isArray` + per-element `typeof` filter), degrades to `[]` on anything malformed, never throws for this field.
- Resolution before spawn: `agent-daemon-server.ts:624`, `resolveAttachmentRunFields(run, attachmentIds, runLifecycle)` — turns opaque `attachment:<uuid>` ids into real, re-validated paths via `AttachmentStore.claim()`, called **inside the `customInstructionsCache.refresh().then(...)` block, immediately before `agentExecutor.run()`**.

Every hop in §3/§4 below is this same shape with `attachments`→`capabilityRefs` and `attachmentIds`→`pluginRefIds`. This is not a stylistic preference — it means the design has zero new architectural risk to evaluate; the risk was already accepted and shipped for attachments.

**2d. One real gap this template inherits: the BYOK path drops it.** `assistant-transport.ts:422-481`, `startByokRun()` — builds its request body from `input.history.map(m => ({role, content}))` only. No `attachments`, no `context`, nothing else from `StartRunInput` reaches `POST /api/admin/v1/assistant/byok-turn`. Attachments are silently dropped in BYOK mode today; capability refs would be too, under this design, for the identical reason. **Not a new regression this spec introduces — it's an existing gap in a sibling feature that this spec inherits by using the same template.** Flagging it because the owner may want it closed for both at once; that's a separate, larger decision (touches `src/server/modules/assistant-byok.ts`) and out of scope here.

## 3. Layer 1 — Jini composer (`Jini/packages/chat/`)

**Scope note up front, per the brief: this is a shared package.** Every host embedding `@jini-ai/chat` gets these types whether or not it uses them (they're additive/optional, so no other host breaks) — but the change requires rebuilding `Jini/packages/chat/dist/` before Tovu's `file:../../../Jini/packages/chat` dependency (`apps/admin/package.json`) sees it, i.e. a `pnpm build` in Jini plus whatever picks up the new dist (dev server restart or reinstall) before it's visible in Tovu at all.

**3a. `slots.ts` — extend `ComposerDiscoveryOutcome`.** Currently `{ draft?: string }` (line 138-141). Add a second, independent optional field:
```ts
export interface ComposerDiscoveryOutcome {
  draft?: string;
  /** Set by a host effect that resolved to a structured, chip-rendered reference instead of draft
   * text — mutually exclusive with `draft` in practice (a host returns one or the other), but typed
   * as two independent optionals rather than a union so an outcome with neither remains valid (the
   * existing "no-op" case, e.g. an MCP-server descriptor's `execute: {kind: 'unavailable'}`). */
  capabilityRef?: ComposerCapabilityRef;
}

/** One chip's payload — opaque to the engine and to Jini's own rendering beyond `label`/`onRemove`
 * plumbing. Mirrors `ChatAttachment`'s own "host-meaningful id, package-opaque otherwise" shape. */
export interface ComposerCapabilityRef {
  id: string;        // e.g. "agent-plugin:ui-ux-design:skill:ui-ux-design" — reused from the
                      // ComposerDiscoveryItem.id that produced it, so removal/dedup keys match.
  label: string;      // rendered on the chip, e.g. "UI/UX Design"
  kind?: string;      // passed through for host-side styling (icon choice), never switched on here
}
```

**3b. `useComposer.ts` — add `capabilityRefs` state, symmetric to `attachments`.**
```ts
capabilityRefs: ComposerCapabilityRef[];
addCapabilityRef: (ref: ComposerCapabilityRef) => void;   // de-dupe by id, replace not stack
removeCapabilityRef: (id: string) => void;
```
Include in `canSubmit` (a chip alone, with an otherwise-empty draft, should be sendable — same reasoning `attachments.length > 0` already gets) and in `reset()`.

**3c. `Composer.tsx` — branch `notifyDiscovery`'s `onResolved` on which outcome field is present.** Today (`Composer.tsx:221-227`) it only ever checks `outcome.draft`. Add:
```ts
if (outcome.capabilityRef !== undefined) {
  composer.addCapabilityRef(outcome.capabilityRef);
  return; // do not also touch the draft
}
```
placed before the existing `draft` branch. `selectPlusItem` (`Composer.tsx:256-262`) currently does `composer.setDraft(expectedDraft)` **before** calling `notifyDiscovery` whenever `item.insertText` is set — for a chip-eligible item this needs `insertText` to be absent (or the pre-write skipped) so nothing lands in the draft ahead of the async resolution; §5 below has the Tovu-side catalog entry with `insertText: undefined` for exactly this reason, matching the existing `/mcp` item's pattern (`insertText: ""`) of "this item has no draft-text macro."

Render the tray: mount a `CapabilityRefTray` (adapted from `AttachmentTray.tsx`, §2a) between the existing `AttachmentTray` and the `<textarea>` at `Composer.tsx:296-297`, or merge both into one tray component keyed by a discriminated item type if the two chip styles should visually share a row — a UI call, not an architectural one; either is a small diff either way.

**3d. `core/transport.ts` — extend `SendMessageOptions`/`StartRunInput`.** Add `capabilityRefs?: ComposerCapabilityRef[]` to both interfaces (transport.ts:28-32, 55-65), mirroring `attachments` exactly, including the same "omit when empty" convention downstream implementations should follow (not enforced by the type — `attachmentIds`'s own omission is a `buildLocalCliContextRef`-side choice, not a `ChatTransport` contract).

**3e. `useChatPane.hooks.ts` — thread it through `sendPrompt`.** One line added next to `attachments` at line 260/276: read `composer.capabilityRefs`, pass through to `conversation.sendMessage(..., { ..., capabilityRefs: refs.length === 0 ? undefined : refs })`. `useConversation.ts`'s `sendMessage` (line 126+) forwards whatever `SendMessageOptions` it's given into `run.start()` — verified it does this generically for `attachments`/`context` already (`useConversation.ts:173` comment: *"sendMessage forwards attachments to run.start"*), so no further change needed there beyond the type extension in 3d.

**Effort: moderate, 1 focused session.** Almost the whole diff is "copy the attachment path's shape with a new name" — the only genuinely new code is the `ComposerHostBinding`-adjacent branch in `notifyDiscovery` (3c) and the tray component adaptation (2a/3c). Test surface: `useComposer` unit tests, `Composer.tsx` interaction tests (select → chip appears → remove → chip gone → keyboard-only remove), `useChatPane`/`useConversation` forwarding tests — all with direct unit-test precedent already in the suite for the attachment equivalents to model against.

## 4. Layer 2 — transport (composer → Tovu backend → daemon)

No new endpoint. Same envelope, one more optional field, at the two points identified in §2c/§1a:

**4a. `assistant-transport.ts`, `buildLocalCliContextRef()` (line 495-544).** Add, mirroring the `attachmentIds` block at line 528-541 exactly:
```ts
if (input.capabilityRefs && input.capabilityRefs.length > 0) {
  contextRef.pluginRefIds = input.capabilityRefs.map((ref) => ref.id);
}
```
(Named `pluginRefIds` rather than reusing `capabilityRefs` verbatim server-side, to keep the wire vocabulary distinct from the client-side `ComposerCapabilityRef[]` shape it's derived from — same "id-only over the wire, full object stays client-side" discipline `attachmentIds` already demonstrates.)

**4b. `run-start-context.ts`, `parseRunStartContextRef()` (line 31-58).** Add a fourth optional field, decoded with the same defensive `Array.isArray` + per-element `typeof` filter already used for `attachmentIds` (line 49-51):
```ts
const pluginRefIds = Array.isArray(parsed.pluginRefIds)
  ? parsed.pluginRefIds.filter((id): id is string => typeof id === "string" && id.length > 0)
  : [];
```
returned alongside the existing four fields. Malformed or absent degrades to `[]`, never throws — matching `attachmentIds`'s own "optional, degrade silently" contract stated in the function's own doc comment (line 19-21), extended to cover the new field.

**4c. Server-side re-stringify (`src/server/modules/assistant.ts:118-130`) needs no change at all** — it spreads `...decoded` and only ever *adds* `principalId`; an extra `pluginRefIds` key already survives that spread untouched. Verified by reading the exact line: `contextRef: JSON.stringify({ ...decoded, principalId: principal.id })`.

**Effort: small, well under a session.** Two functions touched, each already has a same-shaped sibling field to copy, both already have unit tests to extend (`parse-run-start-context-ref.unit.test.ts` per `run-start-context.ts`'s own module doc, and whatever covers `buildLocalCliContextRef` — a pure, already-exported function per its own doc, "directly testable with a `StartRunInput` fixture, no `fetch`/`EventSource` involved").

## 5. Layer 3 — Tovu resolution (ref → prompt content)

This is where §1a's correction changes the design. Since `augmentUserRequest` is never called, resolution cannot live there — it has to happen exactly where `attachments` already gets resolved: inside `agent-daemon-server.ts`'s `onStarted` handler, before `agentExecutor.run()`.

**5a. Where, precisely.** `agent-daemon-server.ts:617-635` — immediately after `resolveAttachmentRunFields` and before the `agentExecutor.run({...})` call, add a symmetric step:
```ts
const pluginRefText = await resolvePluginRefPromptText(pluginRefIds); // new — see 5c
await agentExecutor.run({
  runId: run.id,
  agentId: request.agentId ?? DEFAULT_AGENT_ID,
  prompt: pluginRefText ? `${pluginRefText}\n\n${prompt}` : prompt,
  cwd: process.env.TOVU_AGENT_CWD ?? process.cwd(),
  ...
});
```
`pluginRefIds` decoded the same way `attachmentIds` already is at line 575 (`decoded.attachmentIds` → add `decoded.pluginRefIds`). Prepended rather than appended: the model reads top-to-bottom and the operator's actual request is what it should treat as "the task," with the attached-capability context read first, the same ordering `<<SUBAGENT_DISPATCH>>\n\n${decoded.prompt}` already establishes for a different prefix at line 573.

**5b. `installAgentPlugin`/`capability-projection.ts`: bypass, don't use — with reasons.**
- `installAgentPlugin` (`src/features/agent-plugins/install.ts`) exists to safely extract an **untrusted, uploaded archive** — its entire 500-line hardening surface (zip-slip, decompression bombs, content-addressed digest verification) exists because the input is bytes a marketplace claims are a plugin. The `ui-ux-design` content this spec needs is not that: it already ships **inside the Tovu repo** at `AI-Dev-Shop/skills/ui-ux-design/`, trusted the same way every other file in the repo is trusted. Running it through an archive-extraction pipeline designed for adversarial input would be solving a threat model that doesn't apply here.
- Concretely, there is no `InstalledAgentPlugin` for `ui-ux-design` today — `installAgentPlugin` has zero production callers (confirmed in the prior verdict report and re-confirmed here: every reference is inside its own tests). Standing the whole install pipeline up just to read a file that's already on disk is a detour, not a reuse.
- **Recommendation: a new, narrow `ComposerCapabilitySource`** (Tovu's own extension point, `composer-capabilities.ts:110-113` — already designed for exactly this: *"a future live source... plugs into without this module or `AssistantDock.tsx` changing shape"*) that reads `AI-Dev-Shop/skills/ui-ux-design/SKILL.md` directly off disk, server-side, using the same already-vetted containment primitive `install.ts`/`capability-projection.ts` already use (`package-paths.ts`'s `assertContainedOnDisk`) — reusing the one piece of that machinery that's actually relevant (don't-escape-the-directory), not the parts built for archive trust.
- This also means `agent-plugin-capability-adapter.ts` is **not** the file to extend — it maps an `InstalledAgentPlugin`'s descriptors, and there still isn't one. A new, much smaller module (or a few functions added to `composer-capabilities.ts` itself) is the right size for "list one bundled skill directory as a capability."

**5c. Full text vs. pointer — recommend a hybrid, with the reasoning the brief asked for.**
- `SKILL.md` alone: 8.0 KB, roughly 1,900 tokens. Injecting this in full on every message where the chip is attached is cheap and, per `capability-projection.ts:96-119`'s own existing (if currently unwired) design for Agent Plugin skills, exactly the pattern already chosen there: `execute: { kind: "context-injection", markdown }` composes the **whole** skill markdown, not a pointer. There's real precedent for "inject the small entry-point file in full."
- The 12 reference files together: 68 KB, roughly 15,000-17,000 tokens. Injecting **all** of them unconditionally on every attach is a real cost for content the model may not need for a given task (a landing-page request may need `foundations.md`/`premium-ui.md` and have no use for `inclusive-ai-imagery.md`). This is the size mismatch the brief flagged.
- The `systemOverlay()` tension the brief asked me to analyze: `agent-daemon-server.ts:447-448` tells every run *"you are... not doing general development work on the Tovu codebase"* and steers it toward `search_tools`/`execute_delegated_tool` for anything touching this site's actual state. Read closely, that sentence is scoped to *site actions* (content, users, permissions, DB, rendering) — not to reading a file the operator explicitly attached via a chip. But nothing in the current overlay text carves out that exception, so an agent skimming it has no signal that "read this specific attached file" is different from "poke around the codebase." **Recommendation: inject `SKILL.md`'s full text (small, cheap, matches existing Agent Plugin precedent) plus an explicit, unambiguous instruction pointing at the 12 reference files — phrased as "the operator attached this" rather than "the codebase has this,"** so it doesn't read as the kind of general exploration the overlay discourages. Concretely, the text §5a prepends should read along these lines:
  > *The operator attached the "UI/UX Design" capability to this message. Its guidance:*
  > *[full SKILL.md text]*
  > *This capability also has 12 deeper reference files at `AI-Dev-Shop/skills/ui-ux-design/references/*.md` (brand & voice, component states, motion, foundations, inclusive imagery, two named practitioners' concepts, premium-UI patterns, research/validation methodology, self-made-designer core skills, visual storytelling). Read whichever are relevant to this specific task before finishing design work — they are not duplicated above.*

  This resolves the tension the brief named rather than picking a side and hoping: the cheap, always-relevant entry point is guaranteed present; the expensive, task-dependent depth is reachable but not force-fed, and it's framed as attached user content, not a repo-exploration invitation.
- This hybrid is also what makes the acceptance test in §6 diagnostic rather than trivial — see the note on why SKILL.md's read and a reference file's read prove two *different* things.

**Effort: moderate, 1 focused session.** The new capability source (5b) is genuinely new code (~60-100 LOC: list one directory, read one file, produce one `TovuComposerCapability` with the new binding kind) but small and low-risk (no archive parsing, no untrusted input). The resolution step (5a) is a straight mirror of `resolveAttachmentRunFields`'s calling shape. The `ComposerHostBinding` third kind (`{ kind: "attach-capability-ref"; ref: {...} }`) needs one addition to the union in `composer-capabilities.ts:41-57` and one new branch in `AssistantDock.hooks.tsx`'s `resolveComposerDiscoveryOutcome` (line 804-827) returning `{ capabilityRef: {...} }` instead of `{ draft: ... }`.

## 6. The acceptance test — spec, with real, verified file contents

**Setup.** Pre-stamp every file in scope to a known-stale atime so a real read is unambiguous (macOS `relatime` does not bump atime on an ordinary read otherwise):
```bash
find AI-Dev-Shop/skills/ui-ux-design -type f -exec touch -a -t 202001010000 {} \;
```
**One asymmetry the test must account for, which the brief's undifferentiated "13 files" framing misses:** under the §5c hybrid design, `SKILL.md`'s atime *will* bump on every run where the chip is attached, regardless of the agent's own behavior — Tovu's own server-side resolution step (5a) does a real `readFile` on it to build the prompt. **That bump is not evidence the agent read anything; it's evidence the resolution step ran.** The diagnostic signal is entirely in the **12 reference files'** atimes: nothing in this design ever reads them server-side, so any bump there can only come from the agent's own file-read tool calls, following the pointer text.

**(a) Positive test, two parts (proving two different halves of the design):**
1. *Proves the injected block landed:* ask a question answerable only from `SKILL.md`'s own structure — e.g. *"Under this skill's Reference section, what three subsections does it break into, and what does the Decision Rule one say happens if none of the fit conditions hold?"* (Verified real structure: `## Reference` → `### Preconditions`, `### Decision Rule`, `### Failure Path`, `SKILL.md:54-73`.) A correct answer requires the injected text; it does not require any tool call, so a stale `SKILL.md` atime here is expected and not itself proof.
2. *Proves the pointer was followed:* ask a question answerable only from a reference file — e.g. *"What does Kole Jain's UI/UX concepts reference say, and separately what does Sam Crawford's premium-websites reference say?"* (Real files, verified to exist: `references/kole-jain-uiux-concepts.md`, `references/sam-crawford-premium-websites.md` — specific personal names an agent cannot plausibly invent.) A correct, specific answer **and** a post-run atime bump on those two specific files together are the pass condition; a correct-sounding answer with no atime bump is the exact "confident answer without reading anything" failure mode the original A/B run exposed, and would mean the pointer text isn't working even though the answer looks right.

**(b) Access-time corroboration.** After the run:
```bash
stat -f "%N: %Sa" AI-Dev-Shop/skills/ui-ux-design/SKILL.md AI-Dev-Shop/skills/ui-ux-design/references/*.md
```
Expect: `SKILL.md` bumped (server-side, not diagnostic per above); the two files named in the question bumped (diagnostic — agent read them); the other 10 reference files' atimes are informative but not part of the pass/fail condition — a agent reading more than asked isn't a failure, just extra signal about how it chose to explore.

**(c) Negative control — grep-verified absent from the entire skill, not assumed.** I ran `grep -rli "a/b test|conversion rate|multivariate"` across `SKILL.md` and all 12 reference files: **zero matches.** Ask: *"What does the attached UI/UX Design capability's reference material say about running A/B tests or multivariate tests to validate a design decision?"* Pass condition: the agent says this isn't covered by the attached material (optionally still answering from its own general knowledge, clearly distinguished as such) rather than presenting a specific methodology as something "the plugin" said. A confident, specific-sounding answer attributed to the attached material is a fail — exactly the failure mode that made the original brief's naive "what did I just give you?" test worthless on its own.

(I deliberately did **not** use a sibling-skill topic — e.g. `AI-Dev-Shop/skills/web-compliance/`, which sounds like a natural negative control since it's bundled alongside `ui-ux-design` inside the *Jini* agent-plugins package but not copied into this capability's own reference set — because Tovu's repo root **also** happens to have its own independent top-level `AI-Dev-Shop/skills/web-compliance/` directory, unrelated to this feature. An agent could stumble onto that via an unrelated, legitimate repo-wide search and produce a correct-sounding answer through a path that has nothing to do with whether this design's pointer worked, corrupting the control. Flagging the near-miss because it's the kind of confound the original A/B test taught this workstream to watch for.)

## 7. What I could not verify

- Exact CSS/visual treatment `apps/admin` layers on top of Jini's default `.jini-attachment-chip` styling (didn't read `apps/admin`'s own `assistant.css`) — relevant only to how the new chip *looks*, not to the mechanism; a UI-focused follow-up, not an architecture question.
- Whether `installAgentPlugin`'s archive-install pipeline has a near-term roadmap (a marketplace, external plugin uploads) that would make "bypass it for this feature" a decision worth re-raising with whoever owns that workstream — `install.ts`'s comments reference `CTX-AGENTPLUGINS-2026-08-12.md` (confirmed to exist at `ADS-memory/reports/swarm-consensus/context/R2-HEADER-agentplugins-2026-08-12.md` and the debate outputs in `ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-*.md`) but I did not read those in full to confirm there's no stated intent to route bundled, repo-shipped skills through the same install pipeline for consistency. If such an intent exists, §5b's recommendation should be revisited.
- Whether `src/server/modules/assistant-byok.ts` could cheaply forward `attachments`/`capabilityRefs` (closing §2d's gap) or whether that path's single-request-holds-the-whole-turn shape makes it structurally harder — I read only `assistant-transport.ts`'s client side of that gap, not the BYOK server route itself.
- Live behavioral confirmation of §6 — this is a spec for the test, not a run of it. The brief said to design it, not execute it, and building the new capability source (§5b) has to exist before there's anything to attach.

## 8. Effort summary

| Layer | Scope | Estimate | Key risk |
|---|---|---|---|
| 1 — Jini composer | New `ComposerCapabilityRef` type, `useComposer` state, `Composer.tsx` branch, chip tray (adapt existing `AttachmentTray`) | 1 session | Shared package — needs a `dist/` rebuild before any other layer can be tested end-to-end; affects every `@jini-ai/chat` host (additive/optional, so non-breaking, but still a coordination point) |
| 2 — Transport | Two functions, each mirroring an existing sibling field (`attachmentIds`) | <1 session | None significant — narrowest, lowest-risk layer |
| 3 — Tovu resolution | New bundled-skill capability source (bypassing `installAgentPlugin`), new resolution step in `agent-daemon-server.ts`, third `ComposerHostBinding` kind | 1 session | Getting the inject-vs-pointer prompt text right is more of a prompt-engineering iteration risk than an architecture risk — the mechanism is straightforward once §5a/5b land |
| Acceptance test | Manual/scripted session per §6 | <1 session | Inherently a live-LLM-behavior check, not unit-testable; best run interactively once §1-3 ship |

**Sequencing note:** Layers 2 and 3 can be built and smoke-tested independently of Layer 1 — a hand-crafted `contextRef` with `pluginRefIds` set (bypassing the browser entirely, e.g. via `curl` against `POST /api/runs`) exercises the whole server-side path before any composer UI work lands, which de-risks the harder-to-verify prompt-content question (§5c) before spending the shared-package session on Layer 1.

## 9. Open questions for the owner

1. Does the "chips, not text" decision extend to the existing `/search` capability (`composer-capabilities.ts:238-272`, the one live `allowlisted-tool-call` binding today), or is this chip mechanism scoped to context-injection-style capabilities only? Nothing in this spec forces an answer either way — `ComposerHostBinding` stays a three-member union regardless — but the UI question ("does every discovery-menu selection become chip-eligible, or just some") is worth deciding before `CapabilityRefTray` is built, since a mixed tray (some removable refs, some already-executed tool calls) is a different design than a pure one.
2. Should the §2d BYOK gap be closed in the same pass, or tracked separately? It's pre-existing for attachments and this design would just inherit it, but the owner may not have known it existed until this spec surfaced it.
