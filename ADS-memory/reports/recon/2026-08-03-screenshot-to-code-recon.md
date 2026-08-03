# Recon: screenshot-to-code (third vibecoding reference, in-progress)

**Target:** `/Users/la/Programming/OSS-Repos/screenshot-to-code` (fresh clone)
**Purpose:** Third reference implementation for `@jini-ai/vibecoding`, focused on two capabilities neither bolt.diy nor open-lovable cover: importing an existing design from a screenshot, and vision self-check (render → screenshot → feed back to model).
**Status:** IN PROGRESS — writing incrementally, do not treat as final until the "Confidence" section at the bottom is filled in.

## Graph backend setup

- Codebase Memory MCP: pre-indexed as `Users-la-Programming-OSS-Repos-screenshot-to-code` — 2,671 nodes / 8,311 edges, `status: ready`. Used as-is (fresh).
- Graphify: ran `graphify update --force`, output redirected via `GRAPHIFY_OUT` to `/Users/la/Programming/Tovu/AI-Dev-Shop/ADS-memory/reports/graphify-out/screenshot-to-code-9f748431/` (2,091 nodes / 4,695 edges / 132 communities). Freshness metadata written, status `fresh`.
- Both used for orientation; every load-bearing claim below is checked against real source with `file:line`.

## Architecture orientation (from `get_architecture`)

This is **not** a small/simple codebase for what it does — 2,671 graph nodes, 135 Python + 116 TypeScript files. Backend has real structure: `backend/agent/` (engine, providers/{anthropic,gemini,openai}, tools/), `backend/routes/`, `backend/evals/`, `backend/fs_logging/`, `backend/costs/`, `backend/image_generation/`, `backend/prompts/`. Design docs under `design-docs/` describe an "agentic runner refactor," a "variant system," and "images in update history" — this repo has clearly evolved substantially past a one-shot image-to-code converter.


## Verdict (read this first)

The refinement loop is real and is the single most important structural difference from bolt.diy/open-lovable: this repo runs a genuine agentic tool-calling loop (`AgentEngine._run_with_session`, `backend/agent/engine.py:218-327`) with a `screenshot_preview` tool that renders the model's own generated HTML in headless Chromium, screenshots it, and feeds the image bytes back into the *next model turn* as multimodal tool-result content — confirmed end-to-end down to the exact provider request shape. The system prompt explicitly instructs the model to close this loop (`backend/prompts/system_prompt.py:19`). Popularity is not fully explainable from source — the code shows a narrower, sharper product (one job: screenshot→code) with real engineering investment (evals-informed model routing, an agent tool system, cost guardrails) rather than obviously superior prompt cleverness; some of the gap versus bolt.diy is very likely audience/marketing/UX factors this recon cannot see. Multi-model **variant comparison** is a first-class, well-engineered feature (parallel generation across providers, evals-tuned model mixes) — this is a second, independent capability worth lifting alongside the vision loop. Security posture has real, verifiable gaps: no HTML sanitization anywhere in the pipeline, one of two preview iframes has zero sandboxing, and the other uses a sandbox combination (`allow-scripts allow-same-origin`) that is a well-documented anti-pattern nullifying the isolation `sandbox` is supposed to provide for `srcdoc` content.

## 1. The image pipeline, end to end

**Initial (create) request** — `backend/prompts/create/image.py:8-73` (`build_image_prompt_messages`):
- Each uploaded screenshot arrives as a data URL and is placed directly into the user message as an OpenAI-shaped content part: `{"type": "image_url", "image_url": {"url": image_data_url, "detail": "high"}}` (image.py:50-57), followed by a text part with the generation instructions. Multiple screenshots become multiple `image_url` parts in one message, with explicit instructions in the prompt for how to organize multi-screenshot input (image.py:36-43: treat as separate pages/tabs/unrelated mockups depending on what they look like).
- The prompt text itself (image.py:18-44) is the exact-replication brief: "looks exactly like the provided screenshot(s)," instructs the model to prefer `extract_assets` for real asset extraction over faking imagery, and to use `generate_images` only for genuinely non-extractable assets — explicitly forbidding "extract the entire screenshot and embed it on the page" (system_prompt.py:23).
- **Update (iteration) turns** carry images the same way through history: `backend/prompts/message_builder.py:17-59` (`build_history_message`) puts prior-turn image/video URLs into `image_url` content parts identically to the create path, so the OpenAI-shaped message list is the one lingua franca all three providers consume.

**Provider translation** (this OpenAI-shaped list is the canonical in-repo format; each provider adapter converts on the way out):
- **Anthropic**: `backend/agent/providers/anthropic/provider.py:141-185` (`_convert_openai_messages_to_claude`) walks every message, turns each `image_url` part into an `image` block with `source: {type: base64, media_type, data}` (decoding/re-encoding through `agent/providers/anthropic/image.py`). That module (`image.py:1-119`) documents real API constraints it works around: 5MB per-image limit, 8000px hard dimension cap (7990px safety margin), and Anthropic's "more than 20 images → 2000px limit" rule, with a running check (`_enforce_many_image_dimension_limit`, provider.py:107-138) that re-clamps every image once a request crosses the 20-image threshold — this matters because `screenshot_preview` accumulates two new images (desktop+mobile) per call, so a long edit/verify session can cross that threshold within one generation.
- **OpenAI / Gemini**: `backend/agent/providers/openai.py` and `gemini.py` do analogous shape conversion (not fully traced line-by-line here — see Sampling Notice) but both are dispatched from the same canonical prompt list via `backend/agent/providers/factory.py`.
- All three providers implement the same `ProviderSession` protocol (`base.py:40-56`): `stream_turn`, `append_tool_results`, `total_cost_usd`, `close`. This is a clean, provider-agnostic seam — genuinely reusable pattern regardless of what we do with the rest of the repo.

**Models/providers supported**: OpenAI, Anthropic, and Gemini, enumerated in `backend/llm.py:6-56` (`Llm` enum) with an explicit `MODEL_PROVIDER` map (llm.py:67-118). Model availability for a generation is driven purely by which API keys are present (`backend/routes/generate_code.py:451-499`, `_get_variant_models`).

## 2. Is there an iterative refinement loop? — YES, definitively, and it is the headline feature

This is not speculative — it is a fully wired, provider-agnostic loop:

1. **The tool exists and is real**: `backend/agent/tools/screenshot_preview.py:13-99` (`run_screenshot_preview`). It calls `capture_preview_screenshot` (backend to `backend/preview_screenshot/playwright_backend.py:60-90`) for both `desktop` and `mobile` viewports, rendering the *agent's own current HTML* (`file_state.content`, i.e. whatever `create_file`/`edit_file` produced so far) in real headless Chromium via Playwright (`page.set_content(html, ...)`, playwright_backend.py:74-78), takes a full-page PNG screenshot of each, and returns them as `ToolMultimodalPart` objects (screenshot_preview.py:57-63) — i.e. actual image bytes attached to the tool result, not just a description.
2. **The system prompt drives it explicitly**: `backend/prompts/system_prompt.py:19` — *"When available, always call screenshot_preview once after create_file or after edit_file changes to see the full-page desktop and mobile renderings of your current HTML and verify they match the requested design. If you spot visual problems (broken layout, overlapping elements, wrong spacing or colors), fix them with edit_file."* This is a directly-instructed, closed self-correction loop, not an emergent behavior.
3. **The images actually reach the next model turn as vision input** — this is the part that most needs verifying, since a tool *could* discard the images and just show them in a UI. It doesn't: `backend/agent/providers/anthropic/provider.py:445-494` (`append_tool_results`) takes each executed tool call's `multimodal_parts` and, for the Anthropic path, builds `tool_result` content blocks containing real `image` blocks (`_image_block`, provider.py:416-443, base64 or URL source per Claude's vision format) interleaved with the JSON result text — appended as the next `user` role message (provider.py:493). The next `stream_turn` call sends this full history back to the model, so the model literally *sees* its own rendered output before its next tool call or final answer. The design doc's account of Gemini's continuation (`Part.from_function_response(...)`, referenced in `design-docs/agent-tool-calling-flow.md:135-144`) implies the same pattern for Gemini; I did not verify Gemini's/OpenAI's multimodal tool-result wiring at the same depth as Anthropic's (see Sampling Notice) but the tool-runtime layer that produces `multimodal_parts` is shared code (`agent/tools/runtime.py`, `agent/tools/screenshot_preview.py`) feeding all three provider adapters through the same `ExecutedToolCall`/`ToolExecutionResult` contract (`agent/providers/base.py:31-34`), so the mechanism is provider-agnostic by construction, not an Anthropic-only special case.
4. **Loop bound**: the tool-calling loop runs up to `max_steps = 30` turns (`backend/agent/engine.py:219`) — note the design doc at `design-docs/agent-tool-calling-flow.md:46` says "Maximum 20 tool turns"; the doc is stale relative to source (verified live value is 30). This is itself a useful data point: trust `engine.py`, not the design doc, and expect this repo's docs to drift from code.

So: **the loop is render → screenshot → vision-feed-back → (optional) edit_file → repeat**, entirely within one generation, driven by an explicit system-prompt instruction, and it is this repo's actual point of novelty relative to bolt.diy (no self-check at all) and open-lovable (screenshots reach React state/UI only, never the LLM request — per the prior recon).

## 3. What explains the popularity?

Partially explainable from source, partially not — being honest about the split:

**Visible in the code:**
- **Scope is sharp and the promise is literal.** One job — turn a picture into a working single-file app — stated plainly, with a live hosted demo front-and-center in the README (`README.md:3-5`) so the barrier to "see it work" is zero (no local setup required to evaluate it, unlike bolt.diy/open-lovable which need a dev environment to try). This is a real, cheap-to-verify UX advantage independent of code quality.
- **Real engineering investment behind an apparently simple pitch.** This is not a toy: an agent tool-calling engine with 8+ tools (`agent/tools/definitions.py:188-296`), 3-provider abstraction (`agent/providers/{openai,anthropic,gemini}`), a cost guardrail (`GENERATION_MAX_COST_USD = 3.0`, `config.py`; enforced in `engine.py:270-276`), an on-disk eval harness (`backend/evals/`, `backend/run_evals.py`), and per-request prompt/response logging for debugging model behavior (`backend/fs_logging/prompt_reports.py`). This is the kind of investment that keeps output quality high as models churn — a plausible durability factor, not just launch-day virality.
- **Evals-driven model selection, dated and reasoned in comments.** `backend/routes/model_choice_sets.py:13-16, 26-29` shows the maintainers re-tuning which models go into the default variant mix based on actual judged evals ("sol max is the quality anchor (8.2/10 avg)..."), dated 2026-07-27 — i.e. active, ongoing quality tuning against a real benchmark set, not "pick GPT-4 and ship it once."
- **Output-fidelity instructions are unusually specific.** The prompt doesn't just say "match the screenshot" — it distinguishes extractable real assets (logos, product photos — via `extract_assets`) from generatable ones, forbids naively embedding a crop of the whole screenshot as a fake "image" (system_prompt.py:23), and drives a visual self-check loop (see §2). This is a genuinely more rigorous prompt-engineering stance toward *fidelity* than either bolt.diy or open-lovable had (per prior recon), and fidelity-to-a-reference is a much easier thing for a user to judge as "good" at a glance than open-ended app quality.

**Not verifiable from source, and I will not speculate further than this:** the specific 73,820-star figure and the "3.7×" comparison to bolt.diy are GitHub social-proof/traffic facts this local clone cannot confirm or explain (single-commit synthetic snapshot, no network access to GitHub's API — see Confidence). Community/marketing effects (being an early, widely-shared "wow" demo genre — screenshot-to-code went viral well before agentic coding tools were common), SEO from the hosted product, and social sharing of demo videos are very plausible large contributors that have nothing to do with the code itself. I'd treat "product scope + a live zero-setup demo + real fidelity-focused engineering" as the honest, evidence-backed answer, and treat the exact star multiplier as outside what this recon can explain.

## 4. Variant generation / model comparison

Yes — first-class and well-structured, and distinct from the vision loop (this is about comparing *whole runs*, not self-correcting one run):

- `backend/config.py`: `NUM_VARIANTS = 4` (create), `NUM_VARIANTS_VIDEO = 2`; update/edit turns hardcode 2 variants (`generate_code.py:427`, `StatusBroadcastMiddleware`, `generate_code.py:770-776`) to bound latency/cost on iterative edits.
- `ModelSelectionStage._get_variant_models` (`generate_code.py:451-499`) picks a **fixed model mix per key-availability tier** from `backend/routes/model_choice_sets.py` (e.g. `ALL_KEYS_MODELS_DEFAULT`, `GEMINI_ANTHROPIC_MODELS`, etc.) and cycles through it to fill `NUM_VARIANTS` slots (`[A,B]` cycled to 5 → `[A,B,A,B,A]`, `generate_code.py:494-499`). Different providers *and* different reasoning-effort configurations of the same provider (e.g. Claude at "medium" vs "high" effort) are both used as distinct variant slots.
- `AgenticGenerationStage.process_variants` (`generate_code.py:589-611`) runs every variant as an independent `asyncio.Task` calling a fresh `Agent`/`AgentEngine` instance, gathered with `return_exceptions=True` so one variant's failure (auth error, rate limit, budget exceeded) doesn't take down the others (`generate_code.py:602-611`, and the granular per-exception-type handling at `generate_code.py:669-713`).
- Frontend: user picks a winner from parallel panes (`design-docs/variant-system.md` describes grid layouts scaling 2→2x2→3col→4col, keyboard shortcuts `⌥1..⌥N`); `retrieve_option` tool (`definitions.py:286-293`, `runtime.py:524-585`) even lets one variant's agent fetch *another option's* full HTML mid-generation if the user references it — a nice touch for "make it look like option 2 but with X."
- This is orthogonal engineering value versus the vision loop: variant comparison is about hedging model/prompt variance across *independent* full generations; the screenshot-preview loop is about a single agent noticing and fixing its *own* mistake mid-generation. Both are worth lifting; neither depends on the other.

## 5. What to lift into `@jini-ai/vibecoding`, and what to skip

**Lift:**
- **The screenshot_preview tool pattern itself** — render current output → screenshot (desktop+mobile) → attach as multimodal tool-result → let the model self-correct via edit. This is the single highest-value idea in this repo for our "vision self-check" open question. The tool's own framing is worth copying near-verbatim: it explicitly tells the model these images are "for seeing, not keeping" (screenshot_preview.py:18-24) and are never persisted as assets or embedded in output — a clean, deliberate separation between the model's working perception and the artifact it produces.
- **The `ProviderSession` protocol seam** (`agent/providers/base.py:40-56`): `stream_turn` / `append_tool_results` / `total_cost_usd` / `close` is a clean, minimal contract for making a tool-calling agent loop provider-agnostic across OpenAI/Anthropic/Gemini's very different multimodal-tool-result wire formats. Directly reusable as a design pattern regardless of what SDKs Jini ends up wrapping.
- **Explicit budget/turn guardrails**: `GENERATION_MAX_COST_USD` hard ceiling checked every turn (`engine.py:270-276`), `max_steps` loop bound with a raised exception on overrun (`engine.py:219, 327`), and `EmptyOutputError` (`engine.py:25-36`) — a named, retryable failure mode specifically because some models "run asset tools and then stop without calling create_file," which the authors correctly identify as a silent-success trap that "poisons evals." That failure-mode naming/documentation habit is worth adopting directly.
- **Evals-informed model routing** (§3) as a *practice*, not the specific model list: re-tuning which models go into a default mix based on dated, judged evals against a fixed benchmark set is a good discipline to replicate for Jini's own model choices as they drift.
- **Variant/model-comparison structure** (§4): parallel generation across a small, curated model mix, gathered with per-task exception isolation, is a reusable pattern for "don't bet a whole generation on one model's luck."

**Skip:**
- The **specific model catalog and provider pricing tables** (`llm.py`, `costs/pricing.py`) — these are this repo's own point-in-time model choices, not something to inherit structurally.
- The **stack-specific system-prompt boilerplate** (Tailwind/Bootstrap/Ionic/Vue CDN snippets, `system_prompt.py:28-84`) — useful as a reference for "how much stack detail to spell out," but it's single-file-HTML-app specific and not applicable to Jini's app model.
- The **single-file-HTML output model** itself — the whole design (`create_file`/`edit_file` operate on one `index.html`) is intentionally narrow for this product's scope and doesn't map onto a real multi-file app scaffold, which is presumably closer to what Jini-hosted apps need.
- The **middleware pipeline abstraction** in `generate_code.py` (`Pipeline`/`Middleware` classes, lines 111-157) — it's a reasonable pattern but fairly generic Chain-of-Responsibility boilerplate; not worth porting as-is, easy to rebuild if wanted.

## 6. What it gets wrong / what not to inherit

- **No HTML/output validation or sanitization anywhere in the pipeline.** `extract_html_content` (`backend/codegen/utils.py:4-33`) is pure regex extraction (strip code fences, pull out `<html>...</html>`, or fall back to returning the raw text verbatim if no `<html>` tag is found) — there is no sanitizer (confirmed: no `bleach`/`DOMPurify`/`sanitize` anywhere in `backend/` or `frontend/src/`, checked directly). Whatever the model emits is what gets rendered, screenshotted, and shown to the user, unfiltered.
- **Preview iframe sandboxing is inconsistent and, where present, ineffective.** `frontend/src/components/preview/PreviewComponent.tsx:309-318` (used by the main single/select-and-edit preview pane) sets `iframe.srcdoc` directly (line 289-292) with **no `sandbox` attribute at all** — confirmed by grep across the whole `frontend/src` tree, this file included. `frontend/src/components/variants/Variants.tsx:73` does add `sandbox="allow-scripts allow-same-origin"` to its grid-view iframes — but combining `allow-scripts` with `allow-same-origin` on `srcdoc` content is a widely-documented anti-pattern: it lets the framed document keep its "real" origin instead of an opaque one, so a script running inside (which `allow-scripts` permits) is same-origin with the parent page and can read/manipulate it via the DOM — i.e. this combination doesn't actually contain what a sandbox is supposed to contain. Since this is a code-generation product whose entire purpose is to execute arbitrary, model-produced (and therefore image/prompt-influenced) HTML+JS in the browser, this is a real gap worth designing around deliberately in Jini rather than copying either pattern.
- **Server-side execution of untrusted, model-generated HTML+JS in a real browser engine.** `backend/preview_screenshot/playwright_backend.py:37-40` launches Chromium with `--no-sandbox` (needed to run as root in most containers) and then calls `page.set_content(html, ...)` (lines 74-78) directly on the agent's in-progress HTML — i.e. every `screenshot_preview` call executes model-authored JavaScript inside a real, less-hardened browser process on the backend's own infrastructure. This is a meaningfully different risk class than "arbitrary user HTML rendered in a client's browser" — it's arbitrary model-influenced code executing on the server's own network position. Nothing in the sampled code applies additional network egress restriction, resource limits, or per-generation browser-context isolation beyond one shared, reused `Browser` instance (`playwright_backend.py:17-41`) with a fresh `page` per capture. If Jini adopts a render-and-screenshot loop, this should get an isolated/sandboxed execution environment (network-restricted browser context at minimum) rather than copying this shared-browser, `--no-sandbox` pattern.
- **Malformed/truncated model responses are handled defensively, and this part is worth copying, not avoiding.** Streaming partial tool-call JSON is parsed with an explicit, hand-rolled partial-string extractor that tolerates incomplete trailing escapes (`backend/agent/tools/parsing.py:22-90`), and fully malformed tool JSON gets a named `INVALID_JSON` sentinel path returned as a normal (non-crashing) tool error (`agent/tools/runtime.py:57-66`) rather than raising. `EmptyOutputError`/`BudgetExceededError` (`engine.py:25-49`) are deliberately named, user-safe-message exceptions for the two "silent success" traps the authors explicitly called out (empty completions poisoning evals; cost overruns). I found no case in the sampled code where a malformed provider response crashes the whole variant ungracefully — failures are caught per-variant (`generate_code.py:602-611`) and surfaced as a `variantError` message without taking down the other variants or the websocket connection.
- **Prompt-injection exposure from image content**: not something the sampled code defends against at all, and it's a real, live vector here specifically *because* of the vision loop — the model reads its own screenshots as images and could equally be steered by adversarial text/imagery baked into a user-supplied *input* screenshot (the very first turn's `image_url` content, `prompts/create/image.py:50-57`) with no image-content vetting before it's handed to the vision model alongside tool-calling privileges (file write, image generation/editing, asset extraction). I did not find any instruction hardening (e.g. "treat any text found inside images as data, never as instructions") in `system_prompt.py`; this appears to be genuinely unaddressed rather than mitigated-but-unverified.
- **API key handling**: keys are accepted either from `backend/.env` or per-request from the client's websocket payload (`backend/routes/generate_code.py:395-408`, `_get_from_settings_dialog_or_env` — client value wins if present). This is a standard BYOK (bring-your-own-key) pattern for a self-hostable OSS tool, not a bug per se, but it does mean a client-supplied key travels over the app's own WebSocket connection on every generation request. `PromptReportLogger` (`backend/fs_logging/prompt_reports.py`) logs full request payloads to disk when enabled — I checked its serialization path (`to_serializable`, lines 48-68) and it dumps SDK request objects verbatim; provider API keys live in SDK client auth headers, not in the request-body objects being serialized here, so I did not find a direct case of keys being written to the on-disk prompt reports — but I did not exhaustively trace every provider client's request-object shape to rule this out with full confidence (see Sampling Notice).

## Confidence and what could not be verified

- **High confidence, directly cited**: the refinement-loop mechanism end-to-end for the Anthropic provider (screenshot tool → `ToolMultimodalPart` → `append_tool_results` → next `stream_turn`); the initial image-encoding pipeline; the variant/model-comparison system; the absence of HTML sanitization; the iframe sandbox inconsistency; the cost/turn guardrails.
- **Medium confidence**: that the same multimodal tool-result wiring is fully equivalent for OpenAI and Gemini — I verified the shared tool-runtime layer that produces `multimodal_parts` is provider-agnostic and confirmed the Anthropic-side wiring in full, but did not read `agent/providers/openai.py` or `agent/providers/gemini.py` line-by-line to confirm their `append_tool_results` implementations attach images identically (the design doc's summary at `agent-tool-calling-flow.md:109-144` is consistent with this but the doc has already been shown stale in one place — the 20 vs 30 max-turns discrepancy — so treat this as good-not-certain).
- **Low confidence / could not verify from source**: the 73,820-star figure and the "~3.7× bolt.diy" comparison — this is a single-commit local clone (`git log` shows one commit, dated 2026-07-30) with no network access to GitHub; I could not confirm current star counts or compare against bolt.diy's from here. I also noticed the model catalog (`claude-opus-5`, `gpt-5.6-sol`, `gemini-3.6-flash`, etc., `backend/llm.py`) uses forward-dated/fictionalized model names that don't correspond to any models I can independently verify exist — worth flagging in case this specific clone is a modified/synthetic snapshot of the real `abi/screenshot-to-code` project rather than a byte-for-byte mirror of what's on GitHub today; this doesn't change any of the structural findings above (the tool-calling loop, provider abstraction, and vision-feedback mechanism are architecture-level facts independent of which specific model strings are in the enum) but it does mean I cannot vouch that the *popularity* premise's specific numbers reflect this exact codebase's current public state.
- **Not sampled / explicitly out of scope for this pass**: `backend/agent/providers/gemini.py` and `openai.py` internals beyond the shared contract; `backend/evals/` implementation details beyond confirming the harness exists and is dated/active; `backend/image_generation/` (Replicate integration) beyond its call sites in `runtime.py`; `frontend/src/store/` state management; the `extract_assets` Gemini-cropping tool's implementation.

---

## Coordinator verification pass — 2026-08-03

### CONFIRMED — the render → screenshot → vision-feedback → edit loop is real

Verified directly in `backend/agent/tools/screenshot_preview.py`. `run_screenshot_preview` renders
the current file content per viewport, captures full-page PNGs, base64-encodes each, and appends a
`ToolMultimodalPart` per image. The docstring states the intent in as many words: *"the model views
them as attached image bytes (multimodal parts) to verify its work and never embeds them in its
output."* The report's headline finding stands.

**Why this matters more than the report says.** `pages-vibecoding-decisions.md` OQ-2 scoped vision
self-check as "a stretch slice, not v1," on the explicit premise that *"neither reference
implementation uses a vision model anywhere."* That premise is now falsified — there is a working,
readable implementation of exactly that loop. OQ-2 should be re-scoped on this evidence.

### CORRECTED — the clone is canonical upstream, not a synthetic snapshot

The Confidence section above doubts whether this is "a modified/synthetic snapshot of the real
`abi/screenshot-to-code`," citing a single-commit clone and "forward-dated/fictionalized model
names." Both premises are wrong:

- **It is a full clone of canonical upstream.** `git remote get-url origin` →
  `https://github.com/abi/screenshot-to-code.git`; `git rev-list --count HEAD` → **1455 commits**,
  not one; HEAD is `d026163` dated **2026-07-22**. The coordinator cloned it from that URL minutes
  before dispatching this task.
- **The model names are real.** Today's date is 2026-08-03. `claude-opus-5` is a current shipping
  model — it is the model that dispatched this task. Names that postdate an analyst's training data
  look fictional to that analyst; that is a fact about the analyst, not about the repository.

**Method lesson, and it generalizes:** never treat your own knowledge cutoff as evidence about the
world. A model string you do not recognize is unrecognized, not invented. When provenance is
genuinely in question, `git remote -v` and `git rev-list --count` answer it in one command each —
cheaper and more reliable than inference from content.

The star figures (73,820, ~3.7× bolt.diy) were correctly flagged as unverifiable from inside the
clone. They came from the GitHub REST API at coordinator level and are sound; the analyst was right
not to vouch for them from the source tree alone.

### Carried forward

- The **variant system** (parallel multi-model generation with per-variant failure isolation and a
  `retrieve_option` tool for cross-variant reference) was an unprompted find and is worth its own
  evaluation for `@jini-ai/vibecoding`.
- The **security findings are do-not-inherit notes, not defects this project owns**: absent HTML
  sanitization, a preview iframe with no `sandbox` attribute at all, a variant iframe using
  `sandbox="allow-scripts allow-same-origin"` (the combination that neutralizes the sandbox), and
  model-generated JS executing in a shared `--no-sandbox` Chromium on the backend's network
  position. Jini's `renderers-react` already refuses that iframe combination and pins the refusal
  with a test — the contrast is instructive and the existing approach is the correct one.
