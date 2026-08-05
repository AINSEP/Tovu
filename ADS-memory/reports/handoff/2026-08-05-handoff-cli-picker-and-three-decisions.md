# Handoff: Local CLI picker work + three user decisions deferred to next session

Generated: 2026-08-05T20:45:00Z
Source agent/session: Coordinator (Review/Pipeline Mode), Claude Code / Opus 5 (1M context)
Target: claude (fresh Claude Code session, same machine)
Repos: `/Users/la/Programming/Tovu` and `/Users/la/Programming/Jini`, both on `refactor/jini-admin-extraction`
Predecessor: `ADS-memory/reports/refactors/2026-08-05-handoff-session-end-restart.md` (`004b171`) — still
current for the items this session did **not** touch (tab-close, confirmation transport, DOM-query Stage 1).

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then this handoff. **Nothing is mid-flight** — all three subagents
> reported complete and were stopped with `TaskStop`; every path this session owned is committed. The user
> made **three decisions at the very end and deferred all three to you** — they are in `## The Three
> Decisions` and are the most perishable thing in this document. Do NOT re-derive: the model-list discovery
> dead-ends (all four seams closed), the Open Design precedent, or the dropdown root cause (five-hop trace,
> argv evidence). A ready-to-apply patch already exists on disk. Start at `## The Three Decisions`.

---

## The Three Decisions (made 2026-08-05, deferred to next session)

The user was asked three questions and answered all three, then said *"can we do this next session actually?"*
**Nothing was implemented after these answers.** They are the work queue.

| # | Question | User's answer |
|---|---|---|
| 1 | Apply the dropdown patch now? | **"Apply, and add reload-persistence too"** |
| 2 | Local CLI model list — how to close it? | **"Build the BYOK-shaped live call"** |
| 3 | Widen typecheck scope to cover `development/e2e/**`? | **"Widen scope, then wire protocol"** |

**Decisions 1 and 2 both went against the Coordinator's stated recommendation.** That is the user's call and
is not to be relitigated — but the reasoning matters for *how* you build, so it is preserved below under each
task. Treat the recommendation as a constraint list to satisfy, not an argument to re-run.

---

## Original problems, verbatim

The user's own words, so scope isn't drifted by paraphrase:

**Problem A (loading banner) — FIXED this session:**
> "When I reload or log in, there's... it says 'no usable CLI' In red. Can you change that to to have, like,
> a loading signal? And then text is loading CLIs. Load... or no. Loading available CLIs."

**Problem B (stale model list) — investigated, decision made, NOT implemented:**
> "and I think there's something wrong with the CLI in the AI chat. Um, I'm not seeing Sonnet five or Opus
> five. I'm seeing really old models. […] slight correction. I see the sonnet and the opus, but not the
> sonnet five and opus five specifically. So wanna make sure that I have the latest models or if this is a
> bug of some kind."

Then, correcting the Coordinator's initial hardcoded-list approach:
> "No. You should be getting the AI or, like, the models from the back end. Um, I think agent runtime is the
> one that handles it. So I think you have to try an API call. to see which models for Claude are available."

And later, directing the prior-art check:
> "can you look up Open Design and how they do it? cbm-mcp should help i think"

**Problem C (dropdown inert) — root-caused, patch prepared, NOT applied:**
> "the dropdown to choose the model doesnt work in Tovu. i changed it to sonnet and it just says its opus 5.
> did we ever wire that up?"

---

## Task 1 — Apply the dropdown patch + add reload-persistence

**Why this exists:** Problem C. The user selects a model in the Local CLI picker and the run ignores it.
Answer to their literal question ("did we ever wire that up?"): **no, never** — not partially, not for some
models. The dropdown has never been connected to the spawn path.

**Root cause — three stacked, independently fatal gaps.** Fixing one leaves the dropdown just as inert.
Full five-hop trace: `Jini/ADS-memory/reports/chat-pane-model-dropdown-not-wired-2026-08-05.md` (`859223bc`).

| Hop | File | Defect |
|---|---|---|
| 1 | `Tovu apps/admin/src/components/AssistantDock.tsx` | Passes neither `selection` nor `onSelectionChange` to `<ChatPane>`. Selection updates `@jini-ai/chat`'s internal state only; nothing outside ever learns. Grepped for both props + `modelByAgentId`/`localCli`: zero hits |
| 2 | same file | `useChatPane.hooks.ts`'s `sendPrompt` **does** call `options.runContext({prompt, selection, workingDirectory})` — but AssistantDock's `runContext` is `() => resolveRunContext({bindToken})`, **zero parameters**. JS passes the object; it is silently discarded. Its return value has no `model` either |
| 3 | `Tovu apps/admin/src/lib/assistant-transport.ts:479-522` | Local CLI `startRun` builds `contextRef` from only `prompt`/`frontendBindToken`/`attachmentIds`. The POST to `/api/runs` has no `model` field |
| 4 | `Tovu .../agent-daemon-server.ts:434-565` | `onStarted` decodes `contextRef` as `{prompt?, principalId?, attachmentIds?}` (line 442) — no `model`. `agentExecutor.run({...})` at 549-556 has no `model` key, unconditionally |
| 5 | `Jini agent-executor.ts:2320, 2363-2368` + `defs/claude.ts` `buildArgs` | **Correct.** Omits `--model` only because `input.model` is `undefined` by then; adds `--model <x>` whenever given one |

**Argv evidence (not model self-report).** The agent deliberately did *not* spawn a real `claude` (Tovu's path
runs bypass-permissions and would burn real usage). It called the built `buildArgs` from
`packages/agent-runtime/dist/defs/claude.js` — the exact function `agent-executor.ts` invokes — with the shape
hop 4 proves Tovu sends (`{permissionMode:"restricted"}`, no model key) → **no `--model` in argv**. Same call
with `{model:"sonnet"}` → `--model sonnet` appears. Translation works; the value never arrives.
**Explicitly ruled out:** model misreporting itself (never used as evidence), config precedence (no flag is
sent, so nothing to outrank), "never persists" (it does, client-side), "wrong per-agent key" (the ledger is
not read under *any* key).

**The prepared patch:** `Tovu/ADS-memory/reports/local-cli-model-dropdown-fix-patch-2026-08-05.md` (`d6877ea`).
Contains fenced, ready-to-apply diffs for all three hops, based on the **live working tree** (not `HEAD`), the
four test blocks, and a pre-apply safety script.

**Patch base verified intact at handoff time:** `AssistantDock.tsx` and `assistant-transport.ts` are still
mtime `12:24:17`, still dirty at 420/300 lines (693 insertions total), and Tovu's new `558d6a3`
(`feat(byok): land the admin execution-credential keystore`) **did not touch either file**. The diffs still apply.
**Re-verify before applying anyway** — content diff, not just mtime.

**What the user's answer changes.** The patch as written deliberately does **not** persist the selection. The
agent's reasoning: `agentId` doesn't persist today either (`initialSelection={{agentId:"claude"}}` is
hardcoded), so persisting only `model` yields a half-persisted state; and touching `saveExecutionConfig`
widens the diff inside two files carrying another session's work. **The user chose to add persistence anyway.**
So next session must additionally wire the already-existing, currently-unread ledger:
`Tovu apps/admin/src/lib/execution-settings.ts:284-306` → `executionConfig.localCli.modelByAgentId`.
It already stores the selection correctly; nothing reads it. Consider whether `agentId` should persist in the
same pass, since the half-persisted concern is real and now the user's problem to weigh.

**Preserve these two decisions from the patch — they are correct and non-obvious:**
- `DEFAULT_MODEL_OPTION` (`'default'`) is the universal sentinel meaning *omit `--model`*, already owned
  downstream by each def's `buildArgs`/`resolveModelForAgent`. The diff forwards `model` **opaque and
  unfiltered** rather than re-checking for `'default'` at three new hops. Do not duplicate that policy.
- Hop 4's recommended shape extracts the `contextRef` decode into an exported pure
  `parseRunStartContextRef`. `onStarted` has **zero unit coverage today** (module-private closure over
  `agentExecutor`/`attachmentStore`); the extraction is what makes that hop directly testable without
  standing up the real Express app. Skip it and you fall back to composition-only evidence.

---

## Task 2 — Build the BYOK-shaped live model call for the Local CLI path

**Why this exists:** Problem B. The user wants the model list fetched from the backend, not hardcoded.

**What was already proven — do not re-investigate.** All four seams are closed against the *environment*, with
direct verification, not assumption. Full evidence:
`Jini/ADS-memory/reports/chat-pane-model-list-discovery-findings-2026-08-05.md` (`27dc88ac`, `6409ef02`).

| Seam | Ruled out because |
|---|---|
| Repair `loadMmdRouteModels` (`Jini packages/agent-runtime/src/mmd-routes.ts`) | **Not discovery at all.** Maps a synthetic model id to an alternate `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` pair — proxy routing. Never calls `api.anthropic.com`. It merely *takes* `CLAUDE_FALLBACK_MODELS` as an argument, which makes it look like discovery. Its `~/.config/mms/model-routes.json` is absent here; configuring it would still yield no model list |
| `listModels` CLI probe (as Codex uses: `codex.ts:71-75`, `debug models`) | `claude` has no models-list subcommand — verified against the installed binary via `claude --help` / `claude -p --help`, not merely the comment at `defs/claude.ts:88` |
| ACP probe (as hermes/kilo/kimi defs use) | `claude` exposes no ACP/JSON-RPC flags — verified |
| API call in `fetchModels` | No reachable credential. `claude auth status` → `authMethod: "claude.ai"`, `apiProvider: "firstParty"`, Max-subscription OAuth — not an API key. No `ant` binary, no `~/.config/anthropic`, no `ANTHROPIC_API_KEY`. `Tovu .../agent-executor.ts:535-539` (SEC-001) forbids reading credentials from `process.env` by design. `@anthropic-ai/sdk` is not a dependency in either repo |

**Open Design precedent** (`/Users/la/Programming/OSS-Repos/open-design`, read-only reference; already indexed
in cbm-mcp as `Users-la-Programming-OSS-Repos-open-design`, was `status: ready`, `head_sha == base_sha`).
Full report: `Jini/ADS-memory/reports/chat-pane-model-list-open-design-precedent-2026-08-05.md` (`cc411735`).

- **OD's `apps/daemon/src/runtimes/defs/claude.ts:44` is the file Jini's was ported from** — identical
  `fetchModels` line verbatim, byte-identical fallback array (same seven ids). OD ships the *same*
  static-fallback-only mechanism. Jini inherited OD's non-solution; OD has not solved it either.
- **OD does have a working live fetch — this is your reference implementation.**
  `apps/daemon/src/integrations/provider-models.ts`: `listProviderModels` (`:294-427`);
  for `protocol === 'anthropic'`, `providerModelsUrl` (`:238-256`) builds `GET {baseUrl}/v1/models?limit=1000`;
  `providerModelsHeaders` (`:258-278`) sends `x-api-key` + `anthropic-version`;
  `extractAnthropicModels` (`:181-201`) reads `data.data[].{id, display_name}`.
  Callers traced: `registerChatRoutes` → daemon startup → exposed at `/api/provider/models`.
  It is OD's **custom-provider connection-test** feature, not its coding-agent picker.
- `apiKey` is a **required, non-optional** parameter threaded into URL and headers — no ambient fallback, no
  reuse of an installed CLI's auth. That is the BYOK shape.

**The argument the user overrode — carry it as design constraints, not as a reopened debate.** The Local CLI
path's defining property is that it needs **no API key** (that is how subscription billing rather than metered
API billing is achieved). Gating its model list on an API key inverts that, and anyone holding a key can
already use BYOK mode, which fetches live lists today. The user chose to build it anyway. Therefore:

- **Do not make the picker unusable without a key.** Users on a Max subscription with no API key must still
  get the static fallback and a working picker. Live discovery is an enhancement layered on top, never a gate.
- **Keep `CLAUDE_FALLBACK_MODELS` as the fallback** — that is what it is for, and it now carries current ids.
- **Respect SEC-001.** Credentials are delegated per-run by the host, never read implicitly from `process.env`.
  Whatever credential surface is built must not violate that invariant; if it must, that is an architecture
  decision needing an explicit Software Architect pass and user sign-off, not an inline choice.
- Note Tovu **already has** BYOK credential storage that hits the live provider API for its own model list
  (landed further by another session's `558d6a3`, `feat(byok): land the admin execution-credential keystore`).
  The likely cheapest shape is extending that existing storage to feed a second consumer, not building a new
  credential surface from scratch. **Check `558d6a3` first — it may have moved this ground.**
- Adding `@anthropic-ai/sdk` requires an install. See the install trap under `## Risks`.

**Already shipped and NOT to be reverted:** `Jini 9525b794` freshened `CLAUDE_FALLBACK_MODELS` with
`claude-opus-5` / `claude-sonnet-5`, keeping `claude-haiku-4-5` (still current) and `claude-opus-4-5` /
`claude-sonnet-4-5` last as still-active older options. That edit is correct **as a fallback** and stays.
Also note the `sonnet`/`opus`/`haiku` **alias** entries pass bare strings to the CLI, which resolves them
itself — those never go stale. Only pinned ids need maintenance.

---

## Task 3 — Widen typecheck scope, then wire `@jini-ai/protocol`

**Why this exists:** carried from the prior handoff. `Tovu development/e2e/surface-live-agent.spec.ts:72-82`
hand-mirrors the agent wire envelope because `@jini-ai/protocol` isn't resolvable from Tovu — and a
hand-mirrored shape is what caused the bug that spec was written to guard.

**Recon complete:** `Tovu/ADS-memory/reports/findings/2026-08-05-protocol-wiring-recon.md` (`e08d758`).

- **No drift today.** Every field the spec branches on (`kind`, `payload.type` variants `mcp-ui`/`tool_result`,
  `toolUseId`, `content`, `isError`, `status`) matches `Jini packages/protocol/src/events.ts` exactly. The
  value is **preventive, not corrective** — but the historical concern is real, so don't conclude "mirroring
  is fine."
- **Change needed:** one line, `"@jini-ai/protocol": "file:../Jini/packages/protocol"` in **`devDependencies`**
  (not `dependencies` — only an e2e spec consumes it, never bundled by `npm run build`). Exact hunk in the report.
- **Type-only, zero runtime footprint** — `import type` is erased by Playwright's esbuild transform; no `zod`
  bundling risk. Requires an `npm install` to create the symlink and touch `package-lock.json`.
- **`protocol`'s `dist/` is built and current** — verified by content (`dist/events.d.ts` contains `src`'s
  newer variant tags), not mtime.
- **The caveat that drove decision 3:** nothing type-checks `development/e2e/**` today. Root `tsconfig.json`
  scopes to `src/**/*.ts` and CI's `typecheck` script runs the same command. Without widening scope, wiring
  buys IDE-time detection only, **not a CI gate**.
- **Partial coverage even when wired:** the `mcp-ui` `resource` field is typed `unknown` in protocol *by
  design* (validated downstream by `@jini-ai/ui`'s `parseUIResource`), so the spec's `resource.resource.text`
  assumption stays outside what `@jini-ai/protocol` can ever validate.

**User chose: widen scope first, then wire.** Expect the first type-check of those specs to surface unrelated
pre-existing errors needing triage before CI goes green — that is the known blast radius, not a surprise.
Switching the spec to the real discriminated union also needs added narrowing at the two call sites reading
`event.payload` (illustrative diff in the report; deliberately not carried through, as it is implementation).

---

## Completed this session (do not redo)

- **Problem A fixed and committed** (`Jini 9525b794`). `ChatPane.tsx:394`'s `unavailable = pane.selectedAgent
  === undefined` collapsed "still scanning" and "scanned, found nothing" into one red `role="alert"`. Now
  three-state, mirroring the existing `workingDirectoryPending` pattern: `unavailable && scanningAgents` →
  `role="status"` **"Loading available CLIs"**; `unavailable` alone → the original alert.
  **Extra defect found and fixed, not in the brief:** `scanningAgents` started at `useState(false)` and only
  flipped true after first paint, leaving a one-frame mount gap where nothing was loaded *and* nothing was
  marked loading — the actual flash. Seeded from `access !== undefined`; verified `runtimeAccess` is a stable
  `useMemo(..., [])` at `Tovu AssistantDock.tsx:524`, making that the only reachable production path.
  Tests assert all three states distinctly + two hook-level tests pin the synchronous initial value.
  Scoped runs green: `packages/chat` 67 files/963 tests, `packages/agent-runtime` 99 files/1963 tests.
  `dist/` rebuilt via `npx tsc -p tsconfig.json` in both packages (no install) and grepped to confirm.
  Tovu's `node_modules/@jini-ai/{chat,agent-runtime}` symlink straight into those package dirs.
- **Guard cosmetic fixed** (`Jini 7a162e3f`). `scripts/check-engine-boundaries.ts` had two different
  exceptions both labeled "R2 exception #4". Renumbered **line 388** (the standalone
  `endpoint-policy.parity.test.ts` exception) to #5, keeping #4 on line 449's `@jini-ai/ui/mcp-ui`, which
  continues the enumerated #2 → #3 → #4 sequence and is the 4th item in the violation message at line 463.
  *(The Coordinator's brief said "renumber the second one" — positionally wrong; the agent corrected it.)*
  `pnpm guard` before and after: exactly **7 violations, all `R2-deep-path`, all in
  `packages/chat/src/react/features/chat-pane/**` reaching `@jini-ai/chat/core`, exit 1** — the known BYOK
  deferral. No count or category drift.
- **REF-002 closed as a non-issue** (`Jini 551d372e`). See `## Corrections to stored assumptions`.

---

## Corrections to stored assumptions (things previously believed that are now false)

1. **REF-002's premise was false.** The backlog ranked it first as "the only one with a mechanical gate."
   The case-insensitive `tovu` grep over `packages/**` returned **10 hits, all comment prose or one test
   title — zero policy leaks**, and `packages/mcp/` has **zero hits at all**. Reading
   `packages/mcp/src/server/tools/delegated-tool.ts` and `bin/serve.ts` directly shows the timeout is already
   generic: `DEFAULT_DELEGATED_TOOL_TIMEOUT_MS`, an injected `delegatedToolTimeoutMs` option, a `JINI_`-prefixed
   env override. **Do not re-raise REF-002.** Lesson: read the named source; don't stop at the grep the ticket suggests.
2. **`mmd-routes.ts` is not a discovery seam.** Corrected mid-session — see Task 2's table.
3. **`foundry/` stays gitignored — standing owner policy** ("always ignore foundry please", 2026-08-05).
   Never propose committing or un-ignoring it; never cite a path under it as repo-available evidence. The
   consequence is accepted: any REF-001 argument citing `foundry/docs/jini-port/extraction-plan.md` rests on a
   local-only file.
4. **`git commit -F <msgfile> -- <path>` fails on a brand-new untracked file** (`pathspec did not match any
   file(s) known to git`). Needs a preceding `git add <path>`. This hits every new report under
   `ADS-memory/reports/`. Put it in dispatch briefs.

---

## Commits owned by this session

**Jini** (8): `7a162e3f` guard renumber · `551d372e` REF-002 proposal · `9525b794` chat-pane three-state banner
+ current models · `be16c225` programmer report · `27dc88ac` credential findings · `6409ef02` mmd-routes trace
+ ACP/listModels ruled out · `cc411735` Open Design precedent · `859223bc` dropdown root cause

**Tovu** (2): `e08d758` protocol wiring recon · `d6877ea` dropdown fix patch (prepared, not applied)

**Not ours:** Tovu `558d6a3` (`feat(byok): land the admin execution-credential keystore`) is another session's
and is directly relevant to Task 2 — read it before designing.

---

## Subagent state — ALL THREE STOPPED, NOTHING IN FLIGHT

All ADS-persona-bootstrapped Sonnet 5 background agents. Each reported complete and idle, then was stopped
with `TaskStop`. **None killed mid-write — no tree verification owed, nothing half-applied.**

| Agent | Persona | Final state | Owned |
|---|---|---|---|
| `Refactor-REF002` | Refactor | **COMPLETE**, stopped | Jini `7a162e3f`, `551d372e` |
| `Prog-ProtocolRecon` | Programmer | **COMPLETE**, stopped | Tovu `e08d758` |
| `Prog-CliPickerFix` | Programmer | **COMPLETE**, stopped | Jini `9525b794`, `be16c225`, `27dc88ac`, `6409ef02`, `cc411735`, `859223bc` · Tovu `d6877ea` |

---

## Risks and traps

- **`SendMessage` silently dropped ≥2 dispatches to `Prog-CliPickerFix`.** One correction had to be sent
  **three times**, and the agent shipped a fix on a superseded brief in the meantime. What worked: requiring a
  **paraphrase-back** (not a bare ack) before the agent begins. What cost a round trip: reflexive re-sending
  after the original *had* landed. Keep the paraphrase requirement; drop the reflexive re-send.
- **At least two other sessions are live in both repos.** Tovu's dirty count went from ~30 to **279 files**
  during this session. In Jini, leave `packages/vibecoding/**` (incl. untracked `src/html/node/`),
  `pnpm-lock.yaml`, `packages/vibecoding/package.json` alone. A dirty file and abandoned work look identical —
  **assume dirty means in-flight**, and re-verify by content diff, not mtime alone.
- **Never `npm install` / `npm ci` / `pnpm install` in the live tree** — prunes `node_modules` other sessions
  depend on. **Never `pkill chromium`** — their live Playwright uses those binaries. Tasks 2 and 3 both need an
  install; **do them only when the tree is quiet.** A dev server was bound on port 5173 this session.
- **Tovu resolves `@jini-ai/*` into Jini's built `dist/`.** A source-only change has **zero runtime effect**.
  Rebuild and grep `dist/` to confirm, both directions.
- **Do not use a model's self-report as evidence of which model is running.** LLMs misidentify themselves;
  ground truth is the spawn argv. This nearly misdiagnosed Problem C.
- **Symptoms are reachable by many routes.** Name every path that could produce an observation before
  concluding. This session it mattered three times (banner flash, absent `--model`, the empty model list).
- **Verify claims in code comments.** A comment challenged this session (`defs/claude.ts:88`, "no list-models
  subcommand") turned out **true** — but only re-verification against `claude --help` established that.
  Comments in these repos have been measurably false before.
- **An aggregate pass count never proves a mock migration still asserts.** Per-file negative verification.
- **`.local-artifacts/` is gitignored** (`ADS-memory/.gitignore:1`). Anything that must survive goes in
  `ADS-memory/reports/`.

---

## Still open from the prior handoff (untouched this session)

1. **Tab-close behavior.** A run survives a closed tab. Verified real, defensible either way — needs a
   decision, not an investigation.
2. **Confirmation transport.** Honest payoff is one CMS tool + one chat verb + an `a7c0f8b5` E2E — **not**
   three tools. Two options costed in
   `Jini/ADS-memory/reports/findings/2026-08-05-confirmation-transport-gap.md`.
3. **DOM-query Stage 1** — still blocked; its design names `packages/vibecoding/src/html/regions.ts`, another
   session's live tree.
4. **QA negative-verification debt:** three external-review fixes (media lightbox `key`, MCP-UI form Enter
   guard, `redirect: 'error'`) pass but were never negative-verified by reverting them. Needs a quiet tree or
   worktree isolation.

---

## Handoff Contract

- **Inputs used:** this session's conversation; three dispatched ADS subagents (Refactor, Programmer ×2, all
  Sonnet 5); independent Coordinator verification via `git log`/`git show --stat`/`git status`/`ls -lT`/`grep`;
  cbm-mcp graph queries against an already-fresh `open-design` index; the `claude-api` skill for authoritative
  model IDs.
- **Output summary:** Problem A fixed and shipped; Problem B fully investigated to a decision (four seams +
  prior art closed); Problem C root-caused with argv evidence and a ready-to-apply patch; REF-002 closed as a
  non-issue; guard cosmetic cleared; protocol wiring recon complete. Three user decisions captured, none
  implemented.
- **Risks:** two other sessions active in both repos (Tovu at 279 dirty files); Tasks 2 and 3 both need an
  install and must wait for a quiet tree; `SendMessage` delivery is unreliable — require paraphrase-backs.
- **Suggested next assignee:** Programmer for Task 1 (patch + ledger wiring); Software Architect **first** for
  Task 2 (new credential surface vs SEC-001 is an architecture decision, and `558d6a3` may have moved the
  ground); Programmer/DevOps for Task 3, scope change before wiring.
