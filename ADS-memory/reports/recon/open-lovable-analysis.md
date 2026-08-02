# open-lovable Analysis — for Tovu AI-Generated Pages Feature

Status: COMPLETE
Target: `/Users/la/Programming/OSS-Repos/open-lovable`
Analyst: CodeBase Analyzer persona (dispatched subagent)
Date: 2026-08-01

## Persona Confirmation

Loaded `AI-Dev-Shop/agents/codebase-analyzer/skills.md`, `AI-Dev-Shop/skills/code-navigation/SKILL.md`,
and `AI-Dev-Shop/skills/codebase-graph/SKILL.md` before starting work. Operating as the
CodeBase Analyzer agent. Dispatch marker `<<SUBAGENT_DISPATCH>>` present — skipped
`CLAUDE.md`/`AGENTS.md` bootstrap and startup banner per instructions.

## Backends Used

- Target size: 749 files (excl. node_modules/.git) — under the 500-file "direct exploration
  acceptable" line from the skill, but dispatch brief explicitly required both backends, so
  built both regardless.
- Codebase Memory MCP: **succeeded**. PATH binary `/Users/la/.local/bin/codebase-memory-mcp` 0.8.1,
  mode `moderate`. Project `Users-la-Programming-OSS-Repos-open-lovable`. 1858 nodes / 3428 edges
  over 313 files (node_modules/.next/public/.git excluded automatically).
- Graphify: **succeeded**. CLI `/Users/la/.local/bin/graphify` 0.8.50, `update --force`, code-only
  (no LLM tokens spent). Output: `/Users/la/Programming/Tovu/AI-Dev-Shop/ADS-memory/reports/graphify-out/open-lovable-b92cb42c/`
  (note: lands under `AI-Dev-Shop/ADS-memory/`, a nested copy — the freshness script resolved
  `ADS_MEMORY_ROOT` there, not at `/Users/la/Programming/Tovu/ADS-memory/`; flagging as a minor
  tooling quirk, not chasing further). 1157 nodes / 1729 edges / 119 communities, built from commit `d5d1c9a9`.
- Both backends used for architecture discovery below; all load-bearing claims validated against
  direct `Read`/`Bash wc -l` on source.

---

## Architecture Map

**Stack**: Next.js 15 App Router, Vercel AI SDK (`ai` package) with 4 swappable providers
(Anthropic, OpenAI, Google, Groq), Tailwind, shadcn/ui. Sandbox execution via **E2B or Vercel
Sandbox** (pluggable, confirmed — see Q5). CLI installer package `packages/create-open-lovable`
scaffolds a new project with either template.

**Core generation pipeline** (all file:line from direct Read, not just graph):

1. UI: `app/generation/page.tsx` (3957 lines — single mega-component, the whole builder UI:
   chat, live preview iframe, code viewer, sandbox lifecycle, all in one file)
2. Edit-intent analysis: `app/api/analyze-edit-intent/route.ts` (189 lines) — calls the LLM to
   produce a JSON "search plan" (see Q1)
3. Search execution: `lib/file-search-executor.ts` (267 lines) — greps sandbox file contents for
   the search plan's terms, no LLM call
4. Context selection fallback: `lib/context-selector.ts` (362 lines) — keyword-based file
   selection when the search plan comes up empty
5. Main generation: `app/api/generate-ai-code-stream/route.ts` (1895 lines — the largest route,
   and the heart of the system) — builds the mega system-prompt, calls `streamText`, parses the
   XML-ish output live, writes SSE progress events
6. Apply to sandbox: `app/api/apply-ai-code-stream/route.ts` (798 lines) / `apply-ai-code/route.ts`
   (799 lines, appears to be the pre-streaming predecessor kept for compat — needs confirmation)
7. Optional surgical-edit path: `lib/morph-fast-apply.ts` (219 lines) — delegates edits to the
   hosted Morph "Fast Apply" model instead of full-file regeneration (see Q4)
8. Sandbox abstraction: `lib/sandbox/factory.ts` (40 lines) → `SandboxProvider` interface →
   `lib/sandbox/providers/e2b-provider.ts` (511 lines) and `vercel-provider.ts` (599 lines)
9. Scrape-to-clone: `app/api/scrape-url-enhanced/route.ts` (126 lines) using Firecrawl, feeding
   into the same generation pipeline as a context block (see Q6)

**God nodes / hotspots (from Graphify `GRAPH_REPORT.md`)**: `cn()` (Tailwind class merge helper,
132 edges — expected in any shadcn-based app, not a real hotspot), `SandboxProvider` (18 edges),
`E2BProvider` (16), `VercelProvider` (15), `SandboxManager` (14) — the sandbox abstraction really
is the structural core once you filter out the styling-utility noise.

**Import cycles**: Graphify found 7, all confined to `components/app/(home)/sections/hero/Pixi/...`
(the marketing-page canvas animation) — cosmetic, not in the generation pipeline. Not a concern.

**Entry points** (from `get_architecture`): 20+ route handlers under `app/api/`, one per concern
(create-sandbox, install-packages, run-command, check-vite-errors, monitor-vite-logs,
report-vite-error, restart-vite, kill-sandbox, ...) — confirms a fine-grained REST-per-verb style
rather than a single RPC/tool-call surface.

---

## Q1 — Generation Loop (end-to-end trace)

**First generation** (`isEdit=false`): `app/generation/page.tsx` UI → POST
`app/api/generate-ai-code-stream/route.ts:91` (`POST`) → builds ~900-line system prompt inline
(`route.ts:579-928`, string concatenation, not templated) → `streamText()` call at `route.ts:1334`
→ streamed text parsed live with regex as it arrives (`route.ts:1397-1504`) → on stream completion,
full-buffer regex re-parse extracts `<file>` blocks (`route.ts:1568`), packages, explanation →
SSE `type: 'complete'` event sent to the client with the full `generatedCode` string and file list
→ client (in `page.tsx`) then calls `apply-ai-code-stream` to actually write files into the sandbox
and trigger a Vite dev-server reload.

**Edit generation** (`isEdit=true`): same route, but first runs an "agentic search" sub-pipeline
before the main `streamText` call:
1. `route.ts:202-209` — POST to `/api/analyze-edit-intent` with `{prompt, manifest, model}` →
   returns a `searchPlan` (JSON: search terms + edit type + reasoning) — **this is itself a full
   extra LLM round-trip** before the generation LLM call even starts.
2. `route.ts:218-225` — `executeSearchPlan()` (`lib/file-search-executor.ts`) greps the plan's
   search terms against cached file contents in-process (no LLM, no sandbox round-trip — fast).
3. `route.ts:236` — `selectTargetFile()` picks the single best match by line/file.
4. If found: builds a tiny "SURGICAL EDIT" prompt naming exactly one file+line
   (`route.ts:252-262`). If not found: falls back to `selectFilesForEdit()` keyword matching
   (`lib/context-selector.ts`), and if that manifest is missing too, fetches sandbox files fresh
   via `/api/get-sandbox-files` and repeats intent analysis (`route.ts:328-503`) — three
   nested fallback tiers for "which file(s) do I edit," all before the actual generation prompt
   is even assembled.

So a single edit request can trigger **up to 2 LLM calls** (intent analysis + generation) plus up
to 2 extra HTTP round-trips to fetch sandbox state, all before any code is generated. This is a
real latency cost worth naming under Q5/TRAPS.

## Q2 — Output Protocol

**Not JSON, not tool calls, not fenced markdown.** A bespoke pseudo-XML dialect invented for this
app, parsed with hand-written regexes against the accumulated string buffer — never a real XML/SAX
parser:

- `<file path="...">content</file>` — full or new file (`route.ts:1568`:
  `/<file path="([^"]+)">([\s\S]*?)<\/file>/g`)
- `<package>name</package>` and `<packages>\nname1\nname2\n</packages>` — dependency requests,
  only parsed when `isEdit` is true (`route.ts:1448`, `1518`) — **initial generation is documented
  as React-only, no packages**, which is a real constraint worth noting for Tovu (simpler, but
  limits what a first generation can look like)
- `<explanation>...</explanation>` — human-readable summary (`route.ts:1612`)
- `<edit target_file="..."><instructions>...</instructions><update>...</update></edit>` — only
  emitted in Morph Fast Apply mode (see Q4)
- Comment: the code explicitly says "Neither Groq nor Anthropic models support tool/function
  calling in this context / We use XML tags for package detection instead" (`route.ts:1310-1311`)
  — i.e. the custom-tag format was a **workaround for provider/SDK limitations at the time it was
  written**, not a deliberate design choice. Anthropic and OpenAI both support tool calling now;
  this reads as dated.

**Streaming handling is the most fragile part of the codebase.** The live-stream parser
(`route.ts:1397-1504`) does regex matching **per chunk** against `tagBuffer + text` to detect tag
boundaries for progress events (file/component/package), but the *actual* file extraction that
feeds the sandbox only happens **after the full stream completes**, via a second full-buffer regex
pass (`route.ts:1568`). The live per-chunk parsing is purely cosmetic (progress toasts); it does
not incrementally build files. This means: no true incremental apply, and a single malformed tag
(unbalanced quote in a `path="..."`, nested `<file>`-looking text inside a string literal) can
break the whole-buffer regex silently — there's no error surfaced when `fileRegex.exec` just
produces zero matches.

**Truncation is treated as an expected failure mode, not an edge case** — there's an entire
heuristic subsystem (`route.ts:1615-1810`) that: counts open vs. close `<file>` tags, checks for
brace mismatches >3, checks for content ending in `(` or `,` or `...`, and if
`appConfig.codeApplication.enableTruncationRecovery` is on, **fires a second, separate `streamText`
call per truncated file** to regenerate just that file from a generic "complete this file" prompt
(no diff context, just the original user prompt again) — `route.ts:1754`. This is a real, working
pattern (detect truncation → targeted re-ask) that's worth studying, but it's also evidence the
base pipeline truncates often enough to need production-grade recovery machinery.

## Q3 — System Prompt Architecture

Lives entirely inline in `app/api/generate-ai-code-stream/route.ts:579-928` as one JS template
literal (~350 lines / ~900 lines counting the isEdit-conditional block and the final
completion-rules append at `route.ts:1251-1285`) — **not** in a separate prompts/ file, not
templated with a prompt-management library, not versioned independently of the route code. There
is a smaller, separate system prompt in `analyze-edit-intent/route.ts` for the search-plan call
(need to confirm exact content — queued below).

Style: aggressive, repetitive, ALL-CAPS "CRITICAL", "VIOLATION = FAILURE", "🚨" emoji-flagged
directives, explicit ✅/❌ example pairs, restated 3-4 times across the prompt in different words
(e.g., "only edit what's asked" appears as its own rule at least 5 separate times across different
sections: `route.ts:582-586`, `623-660`, `674-707`, `897-907`, `1097-1120`). Representative excerpt:

```
🚨 CRITICAL RULE - VIOLATION WILL RESULT IN FAILURE 🚨
YOU MUST ***ONLY*** GENERATE THE FILES LISTED ABOVE!
...
EXAMPLE VIOLATIONS (THESE ARE FAILURES):
❌ User says "update the hero" → You update Hero, Header, Footer, and App.jsx
```

This is the single most diagnostic finding for the bolt.diy comparison the human already made:
**the prompt is doing enormous, repeated, brute-force persuasion work to compensate for the
model's tendency to over-edit** — that's a strong signal the underlying edit *mechanism* is weak
(whole-file regeneration with no structural guarantee of scope), so the prompt has to nag instead
of the system architecturally constraining what the model *can* output. Contrast with Morph Fast
Apply mode (`route.ts:930-946`), which is much shorter and calmer *because* the format itself
(small `<edit>` snippet + instruction, applied by a separate deterministic model) makes
over-editing structurally harder — the prompt doesn't have to threaten the model into behaving.
**Takeaway for Tovu: prompt architecture correlates inversely with mechanism quality here.** If
bolt.diy "feels better," worth checking whether it relies less on prompt-level threats and more on
constrained-output mechanisms.

Additional load-bearing constraints baked into the prompt (not just style):
- Hard Tailwind-only styling rule, explicit ban on `bg-background`/`text-foreground`/etc.
  (shadcn CSS-variable classes) in favor of literal Tailwind palette classes — presumably because
  the sandbox's Tailwind config doesn't define the CSS variables shadcn expects. Tovu-relevant:
  if Tovu ships a fixed design-token CSS file with a page, this class of failure disappears by
  construction rather than by prompt nagging.
- `maxTokens: 8192` (`route.ts:1308`) — the prompt itself claims "16,000 tokens available"
  (`route.ts:885`), which **does not match the actual `maxTokens: 8192` setting** two screens
  later — a real bug/stale-comment mismatch worth flagging under TRAPS.
- Quote-sanitization rules (straight vs. curly quotes) exist specifically because scraped website
  content gets embedded in the prompt/context and often contains smart quotes that break JSX
  string literals (`route.ts:786-848`) — a concrete lesson for Tovu's own scrape-to-clone feature.

---

## Q4 — Follow-up Edits (whole-file vs. surgical)

Two genuinely different mechanisms coexist, gated by `MORPH_API_KEY`:

**Default path (no Morph key): whole-file regeneration, always.** Even the "surgical edit" system
prompt (`route.ts:390-464`, quoted under Q1) still asks the model to "Provide the ENTIRE file
content with modifications integrated" — there is no diff/patch format in the default path. The
"surgical" part is *only* that the search-plan step (Q1) narrows which single file gets sent back
for full regeneration; the regeneration itself always rewrites the complete file text. This is why
the system prompt has to spend ~300 lines threatening the model not to touch unrelated files:
**the mechanism provides zero structural guarantee of scope** — scope is enforced entirely by
prompt persuasion, and the truncation-recovery subsystem (Q2) confirms this frequently goes wrong
at the token-budget level too.

**Morph Fast Apply path (optional, `lib/morph-fast-apply.ts`): genuine surgical edit via a second,
specialized model.** The primary LLM emits a *small* `<edit target_file="..."><instructions>...
</instructions><update>...</update></edit>` block — just the instruction plus the minimal changed
snippet, not the whole file (`parseMorphEdits`, `morph-fast-apply.ts:60-76`). That block is POSTed
to `https://api.morphllm.com/v1/chat/completions` (`morphChatCompletionsCreate`,
`morph-fast-apply.ts:42-57`) with the *original full file content* plus the instruction and update
snippet; Morph's `morph-v3-large` model (a real "fast apply" specialist, same category as the model
Cursor/Windsurf use for apply) returns the fully merged file, which is then written back
(`applyMorphEditToFile`, `morph-fast-apply.ts:180-217`). This is architecturally the right shape:
**generation model proposes a small diff-like instruction; a separate, cheaper, apply-specialized
model performs the merge** — it doesn't need to regenerate 200 lines of unrelated JSX to change one
class name, so there is far less surface for the "rewrote unrelated code" failure mode, and (per
Q3) the system prompt for this mode is dramatically shorter/calmer as a direct result.

**Trap**: this is opt-in and silently degrades. If `MORPH_API_KEY` is unset (the common case for
someone just cloning the repo), the app quietly falls back to full whole-file regeneration with no
UI indication that edit quality just dropped — a new user with no key gets the worse mechanism by
default and has no reason to know a better one exists.

No unchanged-code-avoidance mechanism exists in the default path beyond "ask nicely" — no AST
diffing, no line-range patching, no checksum/hash comparison to skip untouched files. Morph mode is
the only place real diff-avoidance happens, and it's delegated entirely to a third-party paid API.

## Q5 — Preview / Sandbox

Confirmed: **pluggable, not single-vendor.** `lib/sandbox/factory.ts:5-21` (`SandboxFactory.create`)
switches on `process.env.SANDBOX_PROVIDER` (`'e2b'` default, or `'vercel'`) and instantiates either
`E2BProvider` (`lib/sandbox/providers/e2b-provider.ts`, using `@e2b/code-interpreter` ^2.0.0) or
`VercelProvider` (`lib/sandbox/providers/vercel-provider.ts`, using `@vercel/sandbox` ^0.0.17) —
both implement a shared `SandboxProvider` abstract interface (`createSandbox`, `runCommand`,
`writeFile`, `readFile`, `installPackages`, `terminate`, `getSandboxUrl`).

**How code runs**: both providers boot a real Vite dev server inside a microVM (E2B) or Vercel's
sandbox runtime (`node22`), on port 5173, and the client displays it live via a cross-origin
`<iframe>` (`app/generation/page.tsx:1597-1603`) pointed at the sandbox's public HTTPS URL — no
local execution of AI-generated code in the browser or on the Next.js server host itself. E2B setup
(`e2b-provider.ts:231-452`, `setupViteApp`) scaffolds `package.json`/`vite.config.js`/
`tailwind.config.js`/`index.html`/`src/main.jsx` from hardcoded string templates via Python
`subprocess`/file-write calls executed inside the sandbox (`this.sandbox.runCode(...)`), then
`npm install` and `npm run dev &` — this is genuinely a **full Node.js project bootstrap per
session**, not a lightweight single-file renderer.

**Latency story** (not directly measured, but structurally evident): `appConfig.e2b.viteStartupDelay`
is an explicit fixed sleep after every Vite (re)start (`e2b-provider.ts:441`, `486`) — meaning
sandbox creation + `npm install` + Vite boot + a hardcoded wait is on the critical path before a
user sees anything, on top of the LLM generation stream itself. `E2BProvider.reconnect()` is a
stub that always returns `false` (`e2b-provider.ts:12-25`, comment: "E2B SDK doesn't directly
support reconnection... For now, return false") — **sandbox reconnection across serverless
function invocations is explicitly unimplemented**, meaning a cold Next.js lambda restart likely
orphans/loses track of the running sandbox. `SandboxManager` (`lib/sandbox/sandbox-manager.ts`) is
a singleton class built to track multiple sandboxes by ID, but the main generation route
(`generate-ai-code-stream/route.ts`) reads/writes `global.activeSandbox`/`global.sandboxState`
directly rather than going through `sandboxManager` — **two parallel, inconsistent sandbox-tracking
mechanisms coexist** (see TRAPS).

**Failure story**: `lib/build-validator.ts` (`validateBuild`) fetches the sandbox URL and checks for
the Vite default-scaffold page or a `vite-error-overlay` string in the HTML to decide if the app
"is rendering" — but (see Q7) **this function and its siblings are dead code**, never called from
the main flow. In practice, sandbox failure is only surfaced if the iframe itself fails to load or
shows the Vite error overlay visually to the human — there's no automated detect-and-recover loop
actually wired up.

For Tovu: this entire tier (VM provisioning, Node bootstrap, dev server, `npm install`, iframe
proxying) is the single biggest thing to **not** carry over — Tovu pages are one static HTML+CSS
document with server-side rendering already in place (`src/server/http/site/render.ts`); there is
no dev server, no npm, no sandbox VM needed at all. A live preview for Tovu is "render this HTML
string into an iframe/srcdoc," full stop — orders of magnitude simpler and faster than anything in
this pipeline.

## Q6 — Scrape-to-Clone (highest-interest item per brief)

**Bottom line: this is thinner than the "clone a website" framing suggests. Nearly everything is
delegated to Firecrawl (a paid third-party scraping API, `@mendable/firecrawl-js` ^4.3.3), and the
default path is a blunt text-dump, not structural analysis.** Two genuinely different quality tiers
exist, and only one of them is good:

**Tier 1 — "Normal Clone Mode" (default, used when a bare URL is submitted): weak.**
`app/api/scrape-url-enhanced/route.ts` POSTs the URL to Firecrawl's `/v1/scrape` endpoint asking for
`formats: ['markdown', 'html', 'screenshot']` (`route.ts:38-62`), but only the **markdown** actually
gets used downstream — `html` is fetched and explicitly discarded (`route.ts:76`: "html available
but not used in current implementation"). The screenshot is fetched and shown to the *user* as a
thumbnail in the sidebar (`app/generation/page.tsx:3380-3431`) but is **never sent to the LLM** —
confirmed by grep: it flows only into React state (`urlScreenshot`, `screenshotCollapsed`) and UI
markup, never into the `generate-ai-code-stream` request body. This is a real missed opportunity:
Firecrawl hands back a screenshot for free and none of the model calls are multimodal/vision calls
that could look at it — the clone is built from prose text alone. The full scrape payload is then
`JSON.stringify(scrapeData, null, 2)` directly into the user prompt verbatim
(`app/generation/page.tsx:2978-2998`) — no DOM structure, no layout hierarchy, no color/font
extraction, no component boundary detection. The model is told "recreate this site" and handed a
wall of markdown; all visual-fidelity work is left entirely to the model's imagination from text.
There's also a smart-quote sanitizer (`sanitizeQuotes`, `scrape-url-enhanced/route.ts:3-17`) because
scraped prose routinely contains curly quotes that break JSX string literals downstream — a small
but concrete lesson: **any scrape-derived text that gets embedded in generated source must be
quote/unicode-sanitized before it reaches the code-gen prompt**, Tovu will hit the identical class
of bug if it ever seeds AI-page content from scraped text.

**Tier 2 — "Brand Extension Mode" (opt-in, separate UI flow): the actually good pattern.**
`app/api/extract-brand-styles/route.ts` calls a *different, newer* Firecrawl endpoint —
`https://api.firecrawl.dev/v2/scrape` with `formats: ['branding']` (`route.ts:22-31`) — which
returns **structured JSON design tokens**: `colors.{primary,accent,background,textPrimary,link}`,
`typography.{fontFamilies,fontStacks,fontSizes}`, `spacing.{baseUnit,borderRadius}`,
`components.{buttonPrimary,buttonSecondary,input}` styles, and `personality.{tone,energy,
targetAudience}`. `app/generation/page.tsx:2802-2928` turns these into a prompt that spells out
**exact literal values** ("Primary Color: #xxxxxx", "H1 Size: 36px", "Border Radius: 6px") and
explicitly instructs the model to "Apply the EXACT colors," "Use the EXACT typography," and even
appends the raw JSON as a fallback reference block (`page.tsx:2878-2880`). This is qualitatively
different from Tier 1: **it's asking the model to apply a supplied design token set, not to infer
one from prose** — much closer to how a human designer would hand off brand guidelines, and a
strong candidate pattern for Tovu's own "import an existing design" feature. Caveat: Brand Extension
Mode explicitly does **not** try to reproduce the source site's layout/content — its own prompt says
"DO NOT recreate the original website... Build ONLY what the user requested" (`page.tsx:2888-2893`);
it is a "steal the look, not the page" mode, distinct from cloning.

**For Tovu**: (a) the Tier 2 pattern — extract a structured token set (colors/type/spacing/radius/
button styles) and inject literal values into the generation prompt rather than prose description —
is directly portable and is the single best idea in this whole codebase for Tovu's design-import
feature; Tovu would need to build or buy that extraction itself (Firecrawl's `branding` format is a
paid, closed capability, not something to depend on sight-unseen). (b) The Tier 1 default path is
not worth emulating as-is; if Tovu wants real "clone this page" fidelity it should look at capturing
actual DOM/CSSOM structure (computed styles, layout boxes) rather than markdown prose, and should
strongly consider a vision-capable model pass over the screenshot open-lovable already fetches but
discards.

## Q7 — Error Feedback Loop

**This is the most surprising finding in the whole analysis: most of the error-feedback
infrastructure is unwired dead code.** Verified by grep across the entire non-node_modules tree, not
just the main page:

- `components/HMRErrorDetector.tsx` — polls the preview iframe's DOM every 2s for a
  `<vite-error-overlay>` web component, regex-extracts "Failed to resolve import" package names, and
  calls an `onErrorDetected` callback. **Zero callers anywhere in the repo** — the component is
  fully defined, apparently functional in isolation, and never imported/mounted.
- `app/api/report-vite-error/route.ts`, `app/api/monitor-vite-logs/route.ts`,
  `app/api/check-vite-errors/route.ts` — a matched trio meant to let the sandbox (or client) report
  Vite compile errors into a `global.viteErrors` array and let the client poll for them. **No fetch
  call to any of these three routes exists anywhere in `app/generation/page.tsx`** (confirmed by
  grep for the route path strings) — they only reference each other, never a real caller.
- `lib/build-validator.ts` (`validateBuild`, `classifyError`, `calculateRetryDelay`,
  `extractMissingPackages`) — a complete, reasonable-looking error-classification and
  backoff-strategy module (missing-package vs. syntax-error vs. sandbox-timeout vs. vite-error, each
  with different retry delays). **Zero callers outside the file itself.**

**What actually runs instead**: packages are installed *proactively*, not reactively — during the
generation stream itself, `<package>`/`<packages>` tags emitted by the model (Q2) and packages
detected via static import-regex scanning of the generated file content
(`extractPackagesFromCode`, appearing independently in **both**
`generate-ai-code-stream/route.ts:1541-1565` **and** `apply-ai-code-stream/route.ts:35-64` — the
same function duplicated near-verbatim in two files) get pushed to `/api/install-packages`
(`page.tsx:431`). There is no loop that (a) actually runs/compiles the generated code, (b) captures
a real compile or runtime error, and (c) feeds that error back to the LLM for a repair attempt. The
closest thing to a feedback loop is the truncation-recovery mechanism (Q2), which reacts to the
LLM's *own output shape* (unbalanced tags/braces), not to the sandbox's actual build/runtime state.

**This is a strong, concrete candidate explanation for the human's bolt.diy-vs-open-lovable
preference.** If bolt.diy actually closes the build-error → LLM-repair loop (worth verifying
directly against bolt.diy's source in a follow-up pass), that would be a materially more capable
mechanism than what's actually running here, independent of model quality or prompt engineering.

## Q8 — Context Management

File selection is multi-tiered (already traced under Q1): LLM-generated search plan → in-process
grep execution → exact line target; falling back to LLM-free keyword/regex intent matching
(`lib/edit-intent-analyzer.ts:6-80`, pattern-matches phrases like "update the X", "add a new Y
page", "change the color" against six `EditType` categories, each with its own `fileResolver`);
falling back further to "send every file as context" (`generate-ai-code-stream/route.ts:1073-1121`).
Two independent edit-intent systems exist side by side (one LLM-backed via
`analyze-edit-intent/route.ts` + `generateObject` with a Zod schema, one pure-regex via
`edit-intent-analyzer.ts`) — reasonable layered-fallback design, not a trap, but worth noting as
two systems to keep in sync if either is modified.

**Token budgeting is all manual, hardcoded truncation, not a real budget model**: conversation
history capped at 20 messages / trimmed to last 15 (`route.ts:130-134`), edit history capped at
10/trimmed to 8 (`route.ts:137-139`), conversation-context string hard-truncated at 2000 characters
with a literal `"[Context truncated to prevent length errors]"` suffix (`route.ts:572-575`),
scraped-website content preview capped at 1000 characters (`route.ts:1179-1181`), `maxTokens: 8192`
on the generation call itself. None of this is derived from an actual tokenizer count — it's all
character/message-count heuristics, so it will over- or under-truncate depending on content density
(code vs. prose). No summarization step exists anywhere — old context is simply dropped, not
compressed.

**Conversation/session state is a bare in-memory global** (`global.conversationState`,
`global.sandboxState`, `global.activeSandbox`, `global.viteErrors` — four separate `declare global`
blocks across different route files) — no database, no Redis, nothing durable. This is fine for a
single-user local demo but means: no multi-instance/serverless-safe deployment (state pinned to one
process), and any server restart loses all conversation history and file cache instantly.

## Q9 — Design-System / Output Quality

No systematic design-token pass in the default path — output quality is entirely a function of (a)
the ~900-line prompt's explicit Tailwind class allowlist/blocklist (Q3: "use `bg-white` not
`bg-background`" — because the sandbox's Tailwind config has no shadcn CSS variables defined, so the
shadcn-style semantic classes the model has likely seen most in training data would silently render
unstyled) and (b) repeated aesthetic directives ("shadows, hover states, transitions,"
"hover:scale-105," specific example `className` strings given as few-shot patterns,
`route.ts:776-784`). This is prompt-level taste-injection via literal example strings, not a
generated or extracted design system — it will produce the same "AI slop" Tailwind look (gradient
hero, rounded-2xl cards, hover:scale-105 everywhere) across every generation, because every
generation gets the identical hard-coded example snippets.

The one exception is Brand Extension Mode (Q6 Tier 2) — literal token injection from an external
extraction, which does measurably better because the model isn't inventing values, it's applying
supplied ones. **The gap between Tier 1 and Tier 2 output quality is, structurally, the gap between
"describe good taste in English" and "hand the model actual numbers"** — a clean, generalizable
lesson: wherever Tovu can turn a design decision into a literal value the model must copy rather
than a rule it must remember, output quality should improve and prompt length should shrink.

No component library / shadcn primitives are available inside the *generated* sandbox app itself
(shadcn lives in the open-lovable dev app's own `components/ui/shadcn/`, not shipped into
`packages/create-open-lovable` templates) — every generation reimplements buttons/cards/inputs from
raw Tailwind + JSX each time, which is both a consistency risk (no shared primitives across
regenerations) and, per the fallback-to-full-rewrite mechanism (Q4), a real risk that a later edit
regenerates a previously-fine button in a subtly different style.

## Q10 — Security Posture

- **Sandbox isolation is real and provider-native**: E2B and Vercel Sandbox are both genuine
  micro-VM/isolated-compute products — generated code never executes in the Next.js server process
  or the reviewer's browser directly. This is the correct posture and not something to second-guess.
- **Preview iframe**: `sandbox="allow-scripts allow-same-origin allow-forms allow-popups
  allow-modals"` (`app/generation/page.tsx:1603`). `allow-scripts` + `allow-same-origin` together is
  the combination that, for same-origin content, would defeat most of what the `sandbox` attribute
  is for (the classic sandbox-escape pattern) — here it's mitigated because the iframe `src` is the
  sandbox provider's own distinct HTTPS subdomain (cross-origin to the Next.js app), so the real
  isolation boundary is the browser's same-origin policy plus the VM boundary, not the `sandbox`
  attribute itself. Worth being deliberate about this if Tovu ever does something structurally
  similar (e.g., previewing AI-generated HTML same-origin via `srcdoc` — that combination would be
  more dangerous without a distinct origin).
- **No Content-Security-Policy anywhere**: `next.config.ts` sets zero security headers (only an
  `images.remotePatterns` allowlist for `next/image`). No CSP, no `X-Frame-Options`, no
  `Permissions-Policy`. Not applicable to protecting *end users of a generated site* the way it
  would be for Tovu's public-facing served pages, but notable given generated code is untrusted
  LLM output rendered to the operator's own browser via the iframe.
- **No auth/rate-limiting layer on any API route**: no `middleware.ts` in the repo, no auth check
  visible in any of the 27 `app/api/*/route.ts` handlers sampled. Every route — including the ones
  that spend LLM tokens, Firecrawl credits, and sandbox VM minutes — is open to anyone who can reach
  the deployed instance. Reasonable for a self-hosted OSS template meant to run behind the
  deployer's own auth layer, but a gap Tovu (multi-tenant) cannot inherit as-is; Tovu's existing
  auth/session layer would need to gate any equivalent generation endpoints from day one.
- Secrets (`E2B_API_KEY`, `FIRECRAWL_API_KEY`, `MORPH_API_KEY`, provider LLM keys,
  `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`) are all plain `process.env` reads, no vault
  integration — standard for this class of project, nothing notable.
- `dangerouslySetInnerHTML` usage (13 call sites, grepped) is confined to the marketing/landing page
  (`components/app/(home)/...`, `components/shared/effects/...`) and static SVG/animation content,
  never touching AI-generated or scraped user content — no obvious XSS vector from the generation
  pipeline itself.

---

## TAKE — ranked, with port difficulty

1. **Structured design-token injection for "import an existing design" (Q6 Tier 2 / Q9).** Extract
   a small JSON of colors/typography/spacing/button-styles from a source page and inject literal
   values into the generation prompt instead of prose description. **Port difficulty: medium** —
   the *prompting pattern* ports directly (cheap, just prompt-template work), but Tovu would need
   its own extraction step since Firecrawl's `branding` format is a paid closed API; a scoped-CSS/
   computed-style scraper (even a simple heuristic one: sample `getComputedStyle` on a headless
   render of the target page for a handful of key elements) would get most of the value without a
   third-party dependency.

2. **Truncation detection + targeted single-file regeneration (Q2).** Detect malformed/incomplete
   output (unbalanced tags/braces, abrupt endings) and re-ask for just the broken piece rather than
   the whole document. **Port difficulty: low** — directly applicable to Tovu's single-HTML-document
   case, arguably simpler there (one document, not N files, so "detect truncation → re-ask for the
   rest of this one document" is a smaller problem than open-lovable's multi-file version).

3. **Layered edit-intent fallback chain (Q1/Q8): LLM search-plan → in-process grep → keyword
   regex → full context.** Each tier is cheap insurance against the tier above failing.
   **Port difficulty: low-medium** — for a single HTML+CSS document, the "search plan" tier
   simplifies enormously (no need to pick *which file*, just *which section/selector*), but the
   general shape (try cheap/precise first, degrade gracefully) is worth keeping.

4. **Fast-apply-style surgical edits via a specialized apply step (Q4).** Have the primary model
   emit a small instruction + snippet; use a second pass (could be a cheaper/faster model, not
   necessarily Morph specifically) to merge it into the full document. **Port difficulty:
   medium-high** — Tovu would need to either integrate a hosted fast-apply API (same dependency risk
   as Firecrawl) or build an equivalent smaller merge-focused prompt/model call; the payoff (shorter,
   calmer system prompts, less regeneration risk) is real per the Q3 finding, so this is worth
   prototyping even without a specialized model — a plain "here's the original doc + a small
   instruction, return the merged doc" second call to the same LLM may capture most of the benefit.

5. **Quote/unicode sanitization for any scraped or user-provided text before it lands inside
   generated source** (Q6). **Port difficulty: trivial** — copy the ~15-line `sanitizeQuotes`
   function verbatim; cheap insurance against a real, concretely-observed failure class.

## LEAVE — wrong for Tovu's single-HTML-document, no-sandbox use case

- **Entire sandbox tier** (E2B/Vercel VM provisioning, `npm install`, Vite dev server, iframe
  proxying to an external sandbox origin, sandbox reconnection/lifecycle management). Tovu pages are
  one server-rendered document with no build step; there is nothing here to run. This is the
  overwhelming majority of the codebase's actual complexity (Q5) and none of it transfers.
- **Multi-file project model** (App.jsx importing N component files, package.json/dependency
  management, `<package>` tag parsing, npm package auto-install). A Tovu Page is one document; there
  is no "which of 12 files do I edit" problem to solve, so most of the context-selector/
  file-search-executor machinery (Q1, Q8) has no target to port *onto* even though the fallback
  pattern (item 3 above) is worth keeping in spirit.
- **The bespoke bad-XML-via-regex output format itself (Q2)**, as opposed to the *idea* of a
  constrained output format. The code's own comment explains this was a workaround for
  provider/SDK tool-calling gaps that no longer exist — Tovu should use real structured output
  (tool calls / JSON schema via whichever SDK it standardizes on) rather than reinventing hand-rolled
  tag parsing against a buffered string, especially since this analysis found the parsing approach
  duplicated near-verbatim across two separate files with subtly different fallback heuristics in
  each (Q7/TRAPS) — a sign it was patched reactively rather than designed once.
- **In-memory-global session state** (Q8) — fine for a single-process local demo, wrong for any
  multi-tenant/multi-instance deployment; Tovu already has a real backing store (SQLite/Drizzle) and
  should use it for generation-session state from the start rather than replicating the global-var
  pattern and hitting the same "state doesn't survive a restart" bug later.
- **No-auth-by-default API routes (Q10)** — acceptable for a self-hosted template, not acceptable
  to copy into a multi-tenant product; any Tovu generation endpoint needs to sit behind the existing
  session/workspace auth from the first commit.

## TRAPS — fragility, dead code, design regrets found along the way

1. **Most of the error-feedback/build-validation subsystem is dead code (Q7)**: `HMRErrorDetector`,
   `build-validator.ts`'s entire exported API, and three dedicated API routes
   (`report-vite-error`, `monitor-vite-logs`, `check-vite-errors`) have zero callers anywhere in the
   codebase, confirmed by repo-wide grep. Someone built a reasonably thoughtful error-classification
   and recovery design and then it never got wired into the actual UI flow. **Lesson for whoever
   reviews Tovu's own equivalent work**: "the module exists and looks correct" is not evidence it
   runs — grep for real callers before crediting a capability.

2. **Duplicated, drifting parser logic (Q2/Q4/Q7)**: the `<file>` tag regex, `extractPackagesFromCode`,
   and general "parse the LLM's semi-structured output" logic is independently reimplemented in at
   least `generate-ai-code-stream/route.ts` and `apply-ai-code-stream/route.ts`, with
   `apply-ai-code-stream`'s `parseAIResponse` (route.ts:24-200+) growing extra fallback tiers
   (markdown code fences, `"Generated Files: a, b, c"` plain-text lists, raw code blocks with
   `// File:` comments) that `generate-ai-code-stream` doesn't have. This is the signature of
   patch-driven development against real failures rather than a designed contract — exactly the
   failure mode a real structured-output format (tool calls/JSON) would eliminate by construction.

3. **`maxTokens: 8192` vs. prompt text claiming "16,000 tokens available"** (`route.ts:885` vs.
   `route.ts:1308`) — a stale/mismatched constant that actively lies to the model about its own
   budget, plausibly contributing to the very truncation problem the recovery subsystem exists to
   patch over.

4. **Two parallel sandbox-tracking mechanisms** (Q5): a proper `SandboxManager` singleton class
   exists (`lib/sandbox/sandbox-manager.ts`) but the main generation route bypasses it entirely in
   favor of ad hoc `global.activeSandbox`/`global.sandboxState` — so the "real" abstraction layer is
   partially unused, similar in spirit to finding #1.

5. **`E2BProvider.reconnect()` always returns `false`** (`e2b-provider.ts:12-25`) — sandbox
   reconnection across function invocations/cold-starts is a stub, not implemented. Any serverless
   deployment topology where the Next.js process can restart between requests will silently lose
   sandbox continuity.

6. **Morph Fast Apply — the mechanically best edit path (Q4) — degrades silently and invisibly**
   when `MORPH_API_KEY` is unset, with no UI signal that a better mechanism exists. A new adopter
   following the default setup path gets the weaker mechanism by default.

7. **First-generation mode is hard-restricted to zero external packages** ("For INITIAL generation:
   Use ONLY React, no external packages," `route.ts:1269`), while edit-mode allows packages — an
   asymmetry that isn't obviously communicated to the end user and could surprise anyone expecting
   parity between "build me an X" and "now add Y to it."

---

## Summary for the dispatcher

Bottom line on the bolt.diy comparison: nothing found here contradicts the human's judgment — if
anything it explains it. The generation *mechanism* (whole-file regen + regex parsing + prompt-level
threats as the only scope-control) is weaker than the prompt's own confidence suggests, a meaningful
fraction of the "we handle errors gracefully" story is unwired dead code, and the one genuinely
strong idea (structured brand-token injection) is gated behind an opt-in flow most users won't
discover. The two things most worth stealing for Tovu are architecturally simple (token injection,
truncation-triggered targeted re-ask) and neither requires porting any of the sandbox/multi-file
machinery that makes up most of the codebase's bulk.
