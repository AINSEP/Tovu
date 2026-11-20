BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
You are a refactor programmer (Codex gpt-6.1-sol). Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first. You run NO tests.
REPO: your cwd = private Tovu clone, branch codex/tv-pr, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f). Base for every sheet: **merge-6**. No Jini dependency (the Jini integrations catalog on the current lock is enough).
TASK (TOVU ONLY; in this order; no sidekicks/subagents): N-age-leaves-T, N-audit-T (it absorbs N-audit-desktop-T: do both workflow files in this one sheet), M-Q3-T, EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them. The CULL wins over the design. Do NOT edit any package-lock.json, do NOT edit `apps/website/src/assistant/__tests__/fixtures/moved-tools.golden.json` (combine refreshes it), and do NOT change `resolveCredentialForProvider` (see the CULL's BUGS 2).
SHEETS (order, base, STOP):
1. N-age-leaves-T · merge-6 · new files `apps/admin/.npmrc`, `apps/desktop/.npmrc`, `apps/site-chat/.npmrc` (root `.npmrc` lines 1–3 verbatim). STOP if any of them already exists. COMMIT-PLAN.md entry "N-age-leaves-T".
2. N-audit-T · merge-6 · files `.github/workflows/ci.yml`, `.github/workflows/desktop.yml`. Steps exactly as the CULL lists, no `id:`, root steps before the `GATES BELOW ARE` comment. STOP if `Install root dependencies` / `Install desktop dependencies` steps are missing or an audit step already exists. COMMIT-PLAN.md entry "N-audit-T".
3. M-Q3-T · merge-6 · files `apps/website/src/features/media-generation/{tool-registrations.ts,agent-tools.ts}`, `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts`. Test first (one case). STOP if `getMediaProviderCredentials` is not exported from `apps/website/src/features/media/index.ts`, if `resolveDefaultImageModel` has a caller other than `requireImageModel` (`git grep -n -F 'resolveDefaultImageModel' -- apps/`), if the exact old description text is not in `agent-tools.ts`, if the test file has no `saveMediaProviderCredentials` fixture, or if a cast is needed. COMMIT-PLAN.md entry "M-Q3-T" (note: golden byte refresh owed at combine after the r62t-tests repair).

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the existing code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize code you move or touch.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: keep existing why-comments verbatim; add NO new comments except where the sheet gives the exact text.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the stated bug fix (failing test first); API args (required, optional = {}) for NEW functions only, framework-dictated signatures exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (hard). A file over 500 lines is NOT a stop reason (note it in COMMIT-PLAN.md and continue). Errors never generic: plain words + redacted details. No product names (Tovu, tovu.dev) anywhere in Jini; no vendor code in Jini core; never raise a debt number. STOP a sheet (continue the others) if a named declaration or anchor is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a function limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (the combine runner runs them and the named mutations); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root with ONE entry per sheet (sheet id, base, files touched, test added, mutation owed, deletions).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (reason). Files touched. Anything you deleted from your own diff.

## DESIGN (Codex 6.2, r62t-practice) — context only; the CULL below wins
# Tovu → Jini · Engineering practices and CLI ownership

The immediate work is to add explicit CI dependency audits, extend Tovu’s existing release-age policy to its three standalone npm projects, and make the media tool honor saved model selections. **Jini’s API gate, Semgrep, and the initial property suites already exist.** The daemon executor moves follow R8b. The ACP recommendation puts the OpenCode pilot after the folder move, so ACP is independent of this dispatch.

Evidence is pinned to Tovu `776ce6d0f` and Jini `d3e78b387`. I used the dispatch exception for the absent Tovu `AI-Dev-Shop` checkout. The work was read-only. I ran no tests, builds, installs, type checks, or linters.

## 1. Disposition

| ID | Disposition | Reason |
|---|---|---|
| N-age-root | RETIRE | Tovu `.npmrc:2–3` at `352ac8c1b88` and Jini `pnpm-workspace.yaml:28–30` at `1a1a4d430` implement the 14-day resolution policy, with an `@jini-ai/*` exemption. |
| N-age-leaves-T | READY-FOR-CODEX | Tovu admin, desktop, and site-chat have independent locks and currently lack their own project `.npmrc` files. |
| N-audit-J | READY-FOR-CODEX | Add a report-only `pnpm audit` step to Jini CI. The 11-11 run established advisory debt. |
| N-audit-T | READY-FOR-CODEX | Add explicit report-only audits for Tovu’s root, admin, and site-chat locks in main CI. |
| N-audit-desktop-T | READY-FOR-CODEX | Add the independent desktop lock audit to Desktop Gates. |
| N-API | RETIRE | Jini `package.json:13–14` exposes `api:check` and `api:update`. `scripts/check-api-surface.ts:38–57` reads and writes `api-baseline/*.json`. CI invokes the check as a blocking step at `.github/workflows/ci.yml:74–78`. Its breaking-change rule covers removed exports and subpaths, with a pending major/minor changeset accepted. Combine-6 recorded a baseline refresh in `0d5b7c2e`. |
| N-property | RETIRE | Property testing is already established with `fast-check` 4.3.0. Jini CI runs `quality:properties` at `.github/workflows/ci.yml:160–163` in report-only mode. Tovu’s `test:ci` glob includes its website property tests. Five risk-prioritized targets are listed below. |
| N-mutation | OWNED-ELSEWHERE `r62t-tests` | Stryker scale-up and mutation verification. |
| N-SAST | RETIRE | The 11-11 cloud run at `4e44218a8` and H2 triage supersede “never run.” Tovu `.github/workflows/semgrep.yml:34–60` and Jini `.github/workflows/ci.yml:227–261` already run blocking rule tests and report-only scans. |
| N-Renovate | RETIRE from this dispatch | The owner chose Renovate and deferred enabling it until ramp-up. Keep that trigger in the backlog. |
| N-performance | OWNED-ELSEWHERE `r62t-perfobs` | Performance budgets. |
| K-R8 | OPUS-CLOUD | Rebase R8a/C6/R8b and complete step 9 under the existing `r62t-blocked` handoff. Runtime declarations and the workspace lock are involved. Follow `origin/codex/split-jini` for platform process changes. |
| K-Codex | OPUS-CLOUD | Moving `isolation.ts` verbatim requires `smol-toml` in the destination package. Daemon declares it at `package.json:187,208`. Agent-runtime does not. Stage the dependency transfer with the existing runtime binding and check remaining daemon users before dropping a declaration. |
| K-Claude | PARTIAL · after R8b | Move the Claude-specific filesystem, config-dir, and subagent staging code after the binding and launch call sites settle. Claude-compatible MCP delivery also serves CodeBuddy. |
| K-OpenCode | PARTIAL · after R8b | Move the OpenCode HTTP config and receipt differences. Move the environment-JSON merge once for OpenCode and MiMo. |
| K-Antigravity | PARTIAL · after R8b | R8a supplies the lock and writer seam needed by `permissions.ts`. Re-anchor its callers and write-order tests on the integrated branch. |
| K-Pi | PARTIAL · after R8b | Prepared R8b patch `0006` deletes both daemon `pi/` files and routes attachment through `agentRuntime.sessions.attachPiRpc`. Verify that adoption, then consolidate the runtime definition. Daemon’s Pi run lifecycle still owns run bookkeeping. |
| K-Gemini | PARTIAL · after R8b | There is no active Gemini CLI definition. The legacy JSON dialect still has a registered parser and tested tool receipts. Preserve that compatibility in the existing `defs/gemini/` folder. |
| K-vendors / M-Q4 | OPUS-CLOUD | R7 route conversion is complete at `72e2c856d`. The provider cutover needs export, host wiring, and dependency work. Include the connect-card model selection and remove `http/xai.ts:162,254,737`’s built-in search fallback in that cutover. |
| M-Q3-T | READY-FOR-CODEX · after catalog baseline repair | Tovu’s `resolveDefaultImageModel` ignores the saved model. The store already exposes it without decrypting a credential. |
| M-Nano-renderer | NEEDS-DECISION | **When a direct Nano Banana renderer caller supplies neither a saved model nor a usable wire model, should it use the caller’s catalog model?** Recommend yes. `nanobanana.ts:35,104` currently substitutes a fixed ID, and `nanobanana.test.ts:90–102` pins that behavior. This is a published renderer, so make the fallback contract explicit before changing it. |
| M-catalog / M-alias | RETIRE from hard-wire cleanup | CLI fallback lists belong to their definitions. The remaining catalog, capability, and approved alias classifications are below. |
| C, Tovu rules | OWNED-ELSEWHERE `r62t-rules-tovu` | Sibling scope. |
| C, Jini product names and IDs | OWNED-ELSEWHERE `r62t-rules-jini-a` | Sibling scope. |
| C, remaining Jini owner rules | OWNED-ELSEWHERE `r62t-rules-jini-b` | Sibling scope. |
| Hardwiring, CSS tokens, log safety, env access | OWNED-ELSEWHERE `r62t-hardwire` | Ledger work. |
| Tovu error-gate ledger, admin/desktop/site-chat | OWNED-ELSEWHERE `r62t-debt-a` | Sibling scope. |
| Tovu error-gate ledger, website features/assistant/CLI/contracts | OWNED-ELSEWHERE `r62t-debt-b` | Sibling scope. |
| Tovu error-gate ledger, website server/platform | OWNED-ELSEWHERE `r62t-debt-c` | Sibling scope. |
| Jini error-gate ledger | OWNED-ELSEWHERE `r62t-debt-jini` | Includes `mcp-bridge.ts` error rows. |
| D structural work | OWNED-ELSEWHERE `r62t-struct` | Sibling scope. |
| E coverage and test quality | OWNED-ELSEWHERE `r62t-tests` | Includes the existing catalog golden failure. |
| H bug classes and H2 bugs | OWNED-ELSEWHERE `r62t-hygiene-a` | Sibling scope. |
| H remaining hygiene | OWNED-ELSEWHERE `r62t-hygiene-b` | Sibling scope. |
| T-PO-02 Tovu cover-image | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| a49 S1 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| a59 S2 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| A66 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| a10 S2/S3 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| B01 J | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Optional loaders | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| G-TESTS-0 ratchet | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Lost-updates S13 and S0–S12 halves | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Publish P0.4/P0.7/P0.8-rest | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Size 02 steps 5–7 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| S6c | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Security A06/A51/A50 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Desktop 1 | OWNED-ELSEWHERE `r62t-resheet` | Census §2. |
| Pure function-size and complexity splits | OWNED-ELSEWHERE `fn50` / `c6fix` | The 424 admin UI functions stay tabled. |
| a09 | HELD | Chat redaction prerequisite. |
| R4/C-CHAT-DEPS | HELD | Chat redaction prerequisite. |
| G-TESTS T0 | HELD | Chat redaction prerequisite. |
| Run-finalizer B1 | HELD | Chat redaction prerequisite. |
| L7a | HELD | Chat redaction prerequisite. |
| Chat redaction | OWNED-ELSEWHERE `r62t-redact` | Independent redesign. |
| AG-UI | OWNED-ELSEWHERE `r62t-agui` | Includes the site-assistant transport change. |
| ACP | OWNED-ELSEWHERE `r62t-acp` | Existing-client repair and OpenCode pilot. |
| Agent-plugin routing | OWNED-ELSEWHERE `r62t-routing` | Includes the assistant guide pointer. |
| `ex-env*` | HELD | Env schema remainder. |
| Todos §L | HELD | Parked. |

### Property coverage by risk

| Target | Existing evidence |
|---|---|
| OAuth URL validation | Jini `packages/oauth/src/endpoint-safety.ts:22,66,70`. `endpoint-safety.property.unit.test.ts:15–81` checks scheme, address, port, and credential policy. Tovu also pins the host binding in `apps/website/src/platform/oauth/__tests__/unit/endpoint-safety.property.unit.test.ts`. |
| IP classification | Jini `packages/platform/src/net/address.ts:7,32`. `address.property.unit.test.ts:20–96` tests equivalent address forms and classification. |
| Streamed JSON | Jini `packages/chat/src/core/partial-json.ts:142`. `partial-json.property.unit.test.ts:27–60` covers arbitrary inputs, complete values, and prefixes. |
| Form submission validation | Jini `packages/cms/src/forms/forms.ts:198`. `submission.property.unit.test.ts:20–70` covers unknown fields, size limits, required data, and honeypot handling. Tovu’s field-validation property suite exercises the published forms entry. |
| Consent configuration parsing | Tovu `apps/website/src/features/consent/validation.ts:14`. `validation.property.unit.test.ts:16–59` covers schema and copy limits, CSS length, and policy links. |

## 2. K inventory and post-R8b handoff

Daemon paths below are relative to `packages/daemon/src/agent-executor/`. Definition paths are relative to `packages/agent-runtime/src/defs/`. The listed mutations belong to combine verification after each move.

| CLI | Daemon files and merge-6 anchors | Definition today and move | Shared mechanism and parity pin |
|---|---|---|---|
| Codex | `codex/contracts.ts`, `home-config.ts:35,65,222`, `home-staging.ts:24,42,52,226`, `isolation.ts:45,56`, `mcp-delivery.ts:4` | `codex.ts` plus `codex/` leaves. Consolidate in `defs/codex/index.ts` and move the named executor files into `defs/codex/` after the dependency transfer. Keep builder identity in `runtime-def-binding.ts:11–23`, including the custom-def case. | Reuse the existing file I/O; Codex owns TOML and isolation policy. Port `staging-policy.test.ts` and `home-http-staging.test.ts`. Mutate the personal-MCP refusal to allow staging to proceed. |
| Claude | `claude/config-dir.ts:11,44,153`, `contracts.ts`, `filesystem.ts:16`, `mcp-config.ts:12`, `mcp-delivery.ts:6,63`, `subagent-start.ts:5` | `claude.ts` plus `claude/` leaves. Consolidate as `defs/claude/index.ts`. Move home selection, filesystem policy binding, and subagent staging under that folder. Use R8’s filesystem binding. | Keep a single `.mcp.json` delivery path for Claude and CodeBuddy and reuse `mcp-json-file.ts:30,45,49,53`. Port the subagent staging cases and retain the real-launch HTTP/stdio tests. Mutate the HTTP failure path to skip the existing prelaunch stdio selection. |
| OpenCode | `opencode/constants.ts:1`, `mcp-config.ts:7,17,52,112`, `tool-calls.ts:4` | `opencode.ts` plus `opencode/` leaves. Consolidate as `defs/opencode/index.ts`. OpenCode owns `withOpenCodeHttpMcp`, `mergeOpenCodeHttpMcpConfig`, and its receipt dialect. | `mergeEnvContentMcpConfig` and `mergeEnvContentInstructions` have OpenCode and MiMo callers. Move them once. Port `opencode/__tests__/mcp-config.test.ts:4` and retain the mixed receipt integration case. Mutate the merge to discard unrelated permissions. |
| Antigravity | `antigravity/permissions.ts:9,18,30,43,62`; `mcp-bridge.ts:184,188,213` | Already has `antigravity/index.ts`, `auth.ts`, `event-stream.ts`, `model-discovery.ts`. Move `permissions.ts` under that directory after applying R8a’s lock/writer injection. | Reuse the host-provided lock and writer. Port `antigravity-permissions.order.test.ts:31,49,62`. Mutate the order to write before the original backup. |
| Pi | `pi/contracts.ts:1`, `pi/options.ts:1`, `launch.ts:1010`, `pi-rpc-events.ts:54,126,175` | `pi.ts` plus `pi/` leaves. Consolidate as `defs/pi/index.ts`. Verify R8b patch `0006` removes the duplicate daemon grace setting and preserves the runtime binding at `runtime-port-bindings.ts:82–89`. | Keep journaling, terminal outcomes, and process cleanup in daemon. Keep `native-events-characterization.test.ts` at that boundary. Mutate the binding to drop the configured Pi grace value. |
| Gemini legacy | `gemini/tool-calls.ts:4`; `tool-call-receipts.ts:1–11`; `child-stream-events.ts:52` | `gemini/event-stream.ts` is registered at `agent-runtime/src/json-event-stream.ts:29`. Place the legacy adapter in `defs/gemini/tool-calls.ts`. Keep the OpenCode adapter in its own folder and preserve the common receipt selection and fold. | Keep `tool-row-folding.test.ts:13–68` at the daemon/chat boundary. Mutate each dialect to omit its correlation candidate. Its folded row test should fail while repeated native calls remain visible. |

Additional daemon references and their disposition:

- **Launch and public entries.** `launch.ts:424–508,945–1010,1470–1648` contains staging, invocation, and child dispatch. `contracts.ts:1–6,406–501,554–572`, `index.ts:109–112,161–169`, and the public `agent-executor.ts:43–76` carry types or exports. Re-anchor these on R8b and repoint to the real owner through the host binding. Reconcile the daemon API baseline and changesets for public removals. `http-mcp.ts:5,50–71` is part of the common delivery decision.
- **MCP and stream lifecycle.** `mcp-bridge.ts:67,106,119–133,156,184–243`, `mcp-json-file.ts:7,30–53`, and `tool-call-receipts.ts:1–11` contain the reusable delivery and receipt logic. `child-input.ts:39,119,229`, `child-lifecycle.ts:35,52`, `child-stdout.ts:51`, `child-stream-events.ts:41–95`, `message-relay.ts:14`, and `continuation/continuation-transport.ts:15,23` use protocol and run signals. Keep lifecycle ownership in daemon. In particular, the prepared R8b change still applies the receipt adapter in daemon after switching to `streams.jsonEvents`; moving it into the default binding requires parity for host-supplied bindings too.
- **Host and compatibility policy.** `agent-env.ts:10–14` documents why the common host environment contains `USER`. `amr/executable-env.ts:1` is AMR’s OpenCode companion setting and belongs with AMR when its consumer moves. `http/agents.ts:89` filters the legacy Gemini catalog row. `http/host-tools.ts:56` is a host launcher inventory entry for the Antigravity editor. Keep those two HTTP concerns outside the CLI move.
- **Shared behavior and examples.** `event-translation.ts:41,43,160`, `ai-trace-lifecycle.ts:5,26`, `chat-settings.ts:56`, `http/delegated-tools.ts:12`, `image-prompt-delivery.ts:9,71`, and `run-lifecycle-events.ts:113` describe shared usage normalization, telemetry, delegation, image delivery, or heartbeat behavior. `ports/agent-runtime.ts:47,69` names existing filesystem and stream members. Use those members during the move.

### Audit hits

All **66 agent-runtime model hits** are definition fallback catalog entries. Preserve the exact IDs and labels:

| Count | File and lines | Classification |
|---:|---|---|
| 1 | `aider.ts:27` | Aider fallback, already owned by Aider. |
| 22 | `antigravity/index.ts:200–221` | Antigravity fallback, already in its folder. It includes provider model names. |
| 16 | `claude.ts:68–83` | Move with the Claude definition. |
| 8 | `codebuddy/index.ts:28–31,33–35,37` | CodeBuddy fallback, already in its folder. |
| 18 | `codex.ts:375–386,390–394,396` | Move with the Codex definition. |
| 1 | `cursor-agent.ts:95` | Cursor fallback, already owned by Cursor. |

The **six integrations hits** are `providers.ts:103,118,181` (catalog entries), `ui-defaults.ts:12` (explicit starter-picker data), `dispatch/providers/openai.ts:237` (speech capability check), and `dispatch/providers/nanobanana.ts:35` (actual runtime fallback, M-Nano-renderer). Preserve the first five with their catalog or provider ownership. There were zero test or fixture rows among the 72 audit hits. Keep the `opus` and `sonnet` aliases at `claude.ts:64–65` and Tovu’s `gemini-flash-latest` alias at `site-assistant.ts:125`. The xAI search fallback and the Tovu media omission path were found separately from those 72 rows.

The **22 Jini per-CLI hits** have these owners:

- **5 daemon hits:** `agent-executor/contracts.ts:2`, `index.ts:29`, `launch.ts:2,3,103`. Fold the actual coupling into K and keep examples with the affected code.
- **10 runtime hits:** `defs/amp/index.ts:6`, `defs/amr/executable-resolution.ts:8`, `defs/amr/index.ts:9`, `defs/antigravity/index.ts:24,200`, `defs/codebuddy/index.ts:2`, and `defs/hermes/index.ts:26` are in their owning CLI folders already. Preserve shared Claude-compatible behavior and the AMR companion resolution. `runtime-def-binding.ts:2` follows Codex. `providers/aihubmix.ts:7` and `providers/google-messages.ts:5` are provider-protocol work.
- **7 other hits:** `core/src/contracts/agents/definition.ts:6` twice and `:194` describe shared contracts. `chat/src/react/features/chat-pane/model-options.ts:4,51–53` composes the existing per-CLI presentation leaves. `ui/src/features/execution/rules.ts:185` describes shared model handling. The two hits in `integrations/.../providers/aihubmix{,-shared}.ts` are vendor-protocol code. The matching runtime and media AIHubMix helpers are a candidate for one provider implementation after signature and behavior parity.

The **four Tovu hits** are all host bindings or product behavior. Keep the Claude/Haiku release smoke in `apps/desktop/src/smoke-packaged-chat.ts:30–61`. Keep site-owner permission and browser guidance in `assistant-runtime-guidance.ts:39–80`, and Tovu’s subprocess settings and hook policy in `assistant-system-overlay.ts:104–127`. Keep `site-assistant.ts:102–125,433–504`’s host configuration with Tovu and coordinate transport edits with AG-UI. Verify Claude, Codex, and Antigravity against the real host binding in Chrome and Electron after K combines.

### Vendor cutover

Jini’s `xaiRoutes` is exported at `daemon/src/http/index.ts:341–348` and mounted at `server/src/builtin-features.ts:537–553`. Move the OAuth and xAI Responses implementation into `packages/provider-plugins/src/xai/`. Keep route registration and gates at the host boundary. Reuse the existing `XaiOAuthPort` and `BaseUrlGuardPort` where their contracts fit. Put the selected search model in the connect-card credential flow, resolve it from the connected credential, and return the existing typed configuration error when the selection is absent. The preset currently passes only `dataDir` and `listenerRef`. The connect-card persistence and existing-credential path need to be verified before dispatch.

`daemon/src/http/model-proxy.ts:85–89,503–568` dispatches Anthropic, OpenAI, Azure, Google, and Ollama turns. Each wire implementation belongs to its own provider. Use the existing `daemon/src/ports/provider-http.ts:57` port for the host binding, with the daemon carrying generic route, stream, and error handling. The shown registry has no xAI turn. Pin the five streams, request cancellation, redaction, and the xAI route’s existing origin and body-limit behavior. Retain the timeout over the response body. For Q-M4, pin the saved selection across two requests and the no-selection failure before outbound work.

Run the vendor job after R7. Serialize its manifest and API-surface edits with the combined `xd-rs-c`/`xd-rs-c2` changes and R8 step 9. Reconcile `scripts/injection-debt.json:64,66`, affected public exports, package locks, and the xAI OpenAPI description at `server/openapi/xai.yaml:172`. Chrome and Electron owe a connect, save, restart, and search look.

## 3. Ready sheets

The following brief rules apply verbatim to every dispatch below:

> Behaviour identical except for the named change. API args `(required, optional = {})` for NEW functions only. Framework-dictated signatures are exempt. No re-export shells, new deps, new `eslint-disable`/`@ts-ignore`/`as any`/`as never`. Functions ≤50 lines and complexity ≤10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. STOP the sheet and continue the others if a named declaration is missing, an unlisted production importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`), a cast is needed, or function size or complexity exceeds its limit. Record same-repoint test importers in `REFRESH.md`. No other repo-wide scans. No tests, builds, installs, type checks, linters, or codebase-memory-mcp. `.git` read-only. Hooks injected as props. Vendor code lives in provider packages. Jini domain code uses framework-neutral contracts, with only own-package, core, and protocol imports. Host presets are excepted. Lockfile, new dependency, or new Jini package work goes to OPUS-CLOUD.
>
> Execute only named edits. Keep moves verbatim and preserve why-comments. Add no unnamed helper, option, layer, comment, or test scaffold. Review the diff and delete incidental edits, recording deletions in `COMMIT-PLAN.md`.

### N-audit-J

**Jini `d3e78b387` · 3k tokens · no pushed predecessor for this write set.**

- Edit `.github/workflows/ci.yml` in `quality-gates` immediately after the frozen install at `:61`. Add `name: Dependency audit (report-only)`, `run: pnpm audit`, and `continue-on-error: true`.
- Acceptance at combine. A successful audit appears in CI and an advisory exit leaves an observable failed step while later quality checks run. Mutation for the latter case is deleting `continue-on-error`. The 11-11 run reported 174 severity counts, including 6 critical and 64 high. Reporting is the rollout choice for this sheet.
- No imports, package exports, debt rows, manifests, or UI look. Stop if the existing workspace audit requires a secret or a registry exception.

### N-age-leaves-T

**Tovu `776ce6d0f` · 3k tokens · no pushed predecessor for this write set.**

- Create `apps/admin/.npmrc`, `apps/desktop/.npmrc`, and `apps/site-chat/.npmrc`. Copy root `.npmrc:2–3` verbatim into each, `min-release-age=14` and `min-release-age-exclude[]=@jini-ai/*`.
- Acceptance at combine. In each standalone project, a new third-party version under 14 days is refused during resolution, an eligible `@jini-ai/*` version remains selectable, and frozen install leaves the existing lock unchanged. Mutate one leaf by deleting its first setting and repeat the young third-party case for that leaf.
- No imports, exports, debt, manifests, or UI look. Stop if any leaf has gained its own project config with different policy or if verification requires modifying a tracked lockfile.

### N-audit-T

**Tovu `776ce6d0f` · 4k tokens · no pushed predecessor for this write set.**

- Edit `.github/workflows/ci.yml`. Insert three report-only steps immediately after the root install at `:85`, named `Dependency audit (root)`, `Dependency audit (admin)`, and `Dependency audit (site chat)`. Each runs `npm audit --package-lock-only` with `continue-on-error: true`. Root uses workflow cwd, admin has `working-directory: apps/admin`, site chat has `working-directory: apps/site-chat`. Their separate locks are the ones behind the installs at `:335,370`.
- Acceptance at combine. Each step reports its own lock and an advisory exit leaves later gates running. Mutate site chat by removing its working directory and verify the scope check detects the duplicate root audit. The historic root-only run reported 53 advisories, including 3 critical and 32 high.
- No imports, exports, debt, manifest edits, or UI look. Stop if a standalone lock has been absorbed into root or the registry requires new credentials.

### N-audit-desktop-T

**Tovu `776ce6d0f` · 3k tokens · no pushed predecessor for this write set.**

- Edit `.github/workflows/desktop.yml` after `desktop-gates` installs desktop dependencies at `:79–80`. Add `Dependency audit (desktop)` with `working-directory: apps/desktop`, `run: npm audit --package-lock-only`, and `continue-on-error: true`.
- Acceptance at combine. The desktop lock gets its own result and subsequent desktop gates run when the audit reports findings. Mutation is deleting `working-directory` and checking that the resulting root audit fails the scope check.
- No imports, exports, debt, manifests, or UI look. Same lock and registry STOP conditions as N-audit-T.

### M-Q3-T

**Tovu `776ce6d0f` · 7k tokens · after the `r62t-tests` catalog golden repair.** The listed pushed refs leave the write set untouched. Keep the existing `r62t-tests` prerequisite because combine-6 already reports unexplained catalog-byte drift.

- Tests first in `apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts` beside `:431–451`. Use `fakeRouteDeps`, `saveMediaProviderCredentials`, and `wired`. Save an OpenAI credential with `model: "dall-e-3"` and supply the existing env credential fixture. An omitted model must send `"dall-e-3"` and the saved key. An explicit `"gpt-image-2"` must still select that catalog model. Preserve the existing env-only and unreadable-saved-credential cases. Mutate by bypassing the saved-model selection and verify the omission case fails.
- In `apps/website/src/features/media-generation/tool-registrations.ts:24–36`, add the exact named specifier `getMediaProviderCredentials,` to the existing `from "../media/index.js"` import. In private `resolveDefaultImageModel` at `:217`, read the marker map using the current workspace and repository. Before the existing credential search, use `imageModelIds.find` in catalog order. Resolve each ID’s provider through the existing registry and select it when that provider’s entry has `apiKeyConfigured === true` and `entry.model === id`. Return the match. The existing credential lookup and dispatch at `:438–453` still unwrap the selected key and authorize the call. The existing catalog fallback handles cases where no saved model matches. The private resolver’s only caller is `requireImageModel` at `:285`.
- In `agent-tools.ts:51`, describe that an omitted model uses a saved credential’s image model first, followed by the existing credential-aware catalog ordering. Keep the tool enum and explicit-model validation. At combine, refresh only the resulting byte-count change in `apps/website/src/assistant/__tests__/fixtures/moved-tools.golden.json`, after the repaired baseline and a catalog diff that attributes the delta to this description. The consumer calculation is `moved-tools.golden.test.ts:66–77`.
- No package export, injection-debt, or manifest rows. Chrome look owed for admin save followed by an omitted-model tool call. Stop if the marker view differs from the credential repo’s canonical provider IDs, or if the catalog diff contains unrelated changes. This sheet treats a saved value as selectable when it is an advertised image model for that credential’s provider. Custom deployment aliases outside the catalog need their selection semantics specified separately.

## 4. Dispatch order and remaining work

| Order | Branch and base | Order inside job | Estimate |
|---|---|---|---:|
| 1 | Jini `codex/jini-practice-ci`, merge-6 | N-audit-J. Independent of the pending pushed refs. | 3k |
| 2 | Tovu `codex/tovu-practice-ci`, merge-6 | N-age-leaves-T → N-audit-T → N-audit-desktop-T. Independent of the pending pushed refs and Jini release. | 10k |
| 3 | Tovu `codex/tovu-media-saved-model`, merge-6 plus the repaired catalog baseline | M-Q3-T. Use the current Jini integrations catalog; no new Jini release is needed. | 7k |

These are the verified portions for the 6–8-sheet jobs. The coordinator can fill the Jini job with five to seven compatible Jini sheets and the Tovu CI job with three to five compatible Tovu sheets. Queue M-Q3-T with the next verified Tovu batch after its baseline prerequisite. There are five executable sheets in this lane across both repos.

**PARTIAL.** The K table provides post-R8b work units. Their final importer lines, exports, and debt edits depend on the rebased R8b binding, any `fn50`/`c6fix` changes to the declarations being moved, and the combined manifest work. Recensus the actual launch and preset callers before dispatch, including external consumers of the daemon’s current public executor exports. `mcp-bridge.ts` also overlaps the Jini error ledger. The xAI provider work still needs the connect-card and persistence call sites pinned. The historical `ro-tovu-ext` survey checkout named in the dispatch was absent; the 11-11 summary, merge-6 sources, audits, branch diffs, and prepared R8 patches supplied the evidence used here.

## OVER-ENGINEERING CULL (Opus) - WINS
# Cull of r62t-practice (§N engineering practice, one folder per AI CLI/vendor, 72 model ids)

Input `cull-inputs/designs/r62t-practice.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; checked with `git show` and single-symbol `git grep`.

**Counts (5 READY sheets → 4 after the merge):** **KEEP 2** (N-audit-J, N-age-leaves-T) · **CUT-TO 2** (N-audit-T absorbs N-audit-desktop-T; M-Q3-T) · DROP 0 · **NEEDS-DECISION 4** · **BLOCKED 7** (K-R8, K-Codex, K-Claude, K-OpenCode, K-Antigravity, K-Pi, K-Gemini, all on R8b) · **CLOUD 2** (K-vendors/M-Q4; M-Q3-T golden refresh). Agree with every RETIRE row (spot-checked below).

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| N-audit-J (Jini CI) | **KEEP** | merge-6 | `ci.yml:61` is `pnpm install --frozen-lockfile`. There is no `audit` step anywhere in Jini CI. One report-only step. Cut the "mutation" (CI YAML has no test; the combine reads the first CI log). |
| N-age-leaves-T (Tovu) | **KEEP** | merge-6 | Root `.npmrc:2–3` holds the policy. `apps/{admin,desktop,site-chat}/.npmrc` do not exist, and npm reads the project `.npmrc` at the install prefix, not the repo root. Three copied two-line files. Acceptance (a young version refused) needs installs, so it is a combine check. |
| N-audit-T + N-audit-desktop-T (Tovu CI) | **CUT-TO** (one sheet) | merge-6 | Same change in two workflow files, so one sheet. Anchors hold (`ci.yml:85` root `npm ci`; `desktop.yml:79–80` desktop install). Cut both "mutations" ("verify the scope check detects the duplicate root audit"): no such scope check exists. Place the root steps **before** the `GATES BELOW ARE continue-on-error + id` comment block (`ci.yml:87–90`), and give them **no `id:`**, so the Gate summary never counts them. |
| M-Q3-T (Tovu media) | **CUT-TO** | merge-6 (golden refresh: needs `r62t-tests` repair) | Bug confirmed (BUGS 1). Keep the design's fix: one marker read and a catalog-order match, with no decrypt. Cut the tests to **one** case (the explicit-model path is unchanged and already covered). The `moved-tools.golden.json` byte refresh is a combine step after the `r62t-tests` repair, not executor work. |
| K-R8 / K-Codex | **BLOCKED** on R8b (+ CLOUD for the `smol-toml` dependency move) | — | Agree. |
| K-Claude / K-OpenCode / K-Antigravity / K-Pi / K-Gemini | **BLOCKED** on R8b | — | Agree with the moves of daemon `agent-executor/<cli>/*` into `agent-runtime/src/defs/<cli>/`. **Cut** "consolidate `defs/<cli>.ts` into `defs/<cli>/index.ts`". All ~30 defs use the `x.ts` + `x/` pair (`defs/` tree), so renaming five of them is churn that breaks the pattern (NEEDS-DECISION 1). **Cut** the AIHubMix "one provider implementation" idea (speculative). **Gap:** the inventory omits daemon `agent-executor/mimo/constants.ts` (imported by `mcp-bridge.ts:6`). It moves with the OpenCode/MiMo env-merge unit. |
| K-vendors / M-Q4 | **CLOUD** | after R7 | Agree on the move to `provider-plugins/src/xai/`. **Split** M-Q4 (a saved search model in the connect card + removing `DEFAULT_SEARCH_MODEL = 'grok-4.20-reasoning'`, `http/xai.ts:162,254,737`) out of the move. A move changes no behaviour; M-Q4 is a feature with a new failure mode (NEEDS-DECISION 3). |
| M-Nano-renderer | NEEDS-DECISION | — | See below. |
| 72 model-id hits | agree RETIRE | — | 66 agent-runtime CLI fallback catalogs + 5 integrations catalog/capability rows are data owned by their CLI or provider; only `nanobanana.ts:35` is a runtime fallback. |
| N-age-root, N-API, N-property, N-SAST, N-Renovate, M-catalog/alias | agree RETIRE | — | Checked: Jini `package.json:13–14` (`api:check/update`), `ci.yml:78` (`pnpm api:check`), `ci.yml:162` (`quality:properties`), `ci.yml:227` (semgrep), `pnpm-workspace.yaml:28–30` (14-day age + `@jini-ai/*` exclusion). |

## Exact cut text

### N-audit-J · Jini · merge-6
"In `.github/workflows/ci.yml`, job `quality-gates`, insert right after `- run: pnpm install --frozen-lockfile` (`:61`):
```yaml
      - name: Dependency audit (report-only)
        run: pnpm audit
        continue-on-error: true
```
Nothing else. No `id:`."

### N-age-leaves-T · Tovu · merge-6
"Create `apps/admin/.npmrc`, `apps/desktop/.npmrc` and `apps/site-chat/.npmrc`, each holding exactly root `.npmrc` lines 1–3 (comment + `min-release-age=14` + `min-release-age-exclude[]=@jini-ai/*`). No lock edits."

### N-audit-T · Tovu · merge-6 (absorbs N-audit-desktop-T)
"In `.github/workflows/ci.yml`, right after the `Install root dependencies` step (`run: npm ci`, `:85`) and **before** the `GATES BELOW ARE …` comment, insert three steps. Each has `run: npm audit --package-lock-only` and `continue-on-error: true`, and none has an `id:`:
- `name: Dependency audit (root)`
- `name: Dependency audit (admin)` with `working-directory: apps/admin`
- `name: Dependency audit (site chat)` with `working-directory: apps/site-chat`

In `.github/workflows/desktop.yml`, right after `Install desktop dependencies` (`:79–80`), insert `name: Dependency audit (desktop)`, `working-directory: apps/desktop`, `run: npm audit --package-lock-only`, `continue-on-error: true`. No other edits."

### M-Q3-T · Tovu · merge-6
"In `apps/website/src/features/media-generation/tool-registrations.ts`:
- Add `getMediaProviderCredentials,` to the existing `from "../media/index.js"` import list.
- In `resolveDefaultImageModel`, before `const checkedProviders`, add:
```ts
  const saved = await getMediaProviderCredentials({ repo: routeDeps.mediaProviderCredentialRepo }, { workspaceId: routeDeps.workspaceId });
  const savedModel = imageModelIds.find((id) => {
    const entry = saved[routeDeps.mediaProviderRegistry.findModel({ id })?.provider ?? ""];
    return entry?.apiKeyConfigured === true && entry.model === id;
  });
  if (savedModel) return savedModel;
```
Add one sentence to its doc: `A saved credential's own image model (Admin -> Media providers) wins first, in catalog order.` Leave the rest of the function, `requireImageModel` and the dispatch unchanged.
- In `agent-tools.ts` (`model` description, `:51`), replace `"When omitted, the first model in this list whose vendor has a credential configured is used; if no vendor "` with `"When omitted, the model saved with a vendor's credential is used; otherwise the first model in this list whose vendor has a credential configured; if no vendor "`. The enum and validation stay unchanged.

**Test (write it first):** in `__tests__/tool-registrations.test.ts`, beside the omitted-model cases (`:431–451`), add **one** case. Save an OpenAI credential with `model: "dall-e-3"` via the existing `saveMediaProviderCredentials` fixture, call with no `model`, and assert the dispatched request model is `"dall-e-3"`. Keep the existing cases. Mutation (combine): delete `if (savedModel) return savedModel;`. **Combine (CLOUD):** after the `r62t-tests` golden repair, refresh only this description's byte delta in `assistant/__tests__/fixtures/moved-tools.golden.json`. **Chrome look owed:** save a model in Admin → Media providers, then ask the assistant for an image without naming a model."

## BUGS (confirmed on merge-6)
1. Tovu `apps/website/src/features/media-generation/tool-registrations.ts:217–230` (`resolveDefaultImageModel`) ignores the model saved with a media credential. `resolveCredentialForProvider` (`:186–193`) also drops `saved.model` from the resolved credential, so the OpenAI adapter (Jini `dispatch/providers/openai.ts:145`, wire model only) never sees the saved choice. Fix: M-Q3-T.
2. Not sheeted, for the owner: on providers whose adapter prefers `credentials.model` (aihubmix `:76`, imagerouter `:57`, openrouter `:65`, nanobanana `:104`, custom-image `:48`), a caller that passed a saved model would override an explicit agent choice. Today Tovu never forwards it (see 1), so there is no live bug. Do NOT "fix" BUGS 1 by forwarding `saved.model` into the credential.

## NEEDS-DECISION (one line each, with recommendation)
1. **Folder shape:** convert `defs/<cli>.ts` + `defs/<cli>/` into `defs/<cli>/index.ts`? **No**: keep the existing pair (one name per CLI already). Move only the daemon per-CLI files into `defs/<cli>/` after R8b.
2. **M-Nano-renderer:** replace the fixed `NANOBANANA_DEFAULT_MODEL` fallback (`nanobanana.ts:35,104`)? **No change now**: `RenderContext.wireModel` is a required string (`dispatch/types.ts:155`), so the fallback fires only for a direct caller passing `''`. Revisit with the vendor cutover.
3. **M-Q4 (xAI saved search model):** ship it inside the provider move? **No**: move first, verbatim. M-Q4 follows as its own sheet, with a plain-words error when no model is saved.
4. **Report-only audits:** make the four audit steps blocking later? **Yes, after the H2-PKG lock job clears the critical and high advisories.** Until then, report-only.

## Jobs
- **`j-pr-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): N-audit-J. Batch with other Jini sheets.
- **`j-tv-pr-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 3 sheets): N-age-leaves-T → N-audit-T → M-Q3-T. M-Q3-T's code is on merge-6; only the golden refresh waits for `r62t-tests`.
- **Combine owes:** first CI run log for the four audits, a young-version install refusal in one leaf, the M-Q3-T mutation + golden refresh + Chrome look.
- **Blocked/Cloud:** the K moves after R8b (with the cuts above, plus `mimo/constants.ts` added), and the xAI move after R7 (M-Q4 split out).
- **Dropped:** both CI "scope-check" mutations, the separate desktop sheet, the explicit-model test, `x.ts → x/index.ts` consolidation, AIHubMix unification.
