# Dynamic model list (Design B)

Status: revised 2026-11-13 (second pass) for the re-review of `1e4afece7`: new findings 7, 8, 10 and "partly" rows 3 and 14. Not built. Line anchors are against Jini `design-d2` at `bec86f159` and the Tovu clone at `461f81c56`.

Order of work:
1. **Terra M2–M4** may run now (see the prompt's top block). They touch no line B0 or B1 changes and nothing R13 loads. The one shared file is `amr/index.ts`: M3 edits lines 9–184, B0-1 adds the opt-out field near `:311`, so either order applies cleanly.
2. **B0 (Opus)**, starting with B0-0 (the shared classifier). Lands on the Jini branch on its own.
3. **Terra M1 + Opus B1 as one landing.** Terra commits M1 on a lane branch; Opus commits B1 on top of it; the coordinator lands both as one squash commit (`git merge --squash`). The M1 lane commit alone turns R13 check MF3 red on any machine with codex, agy or claude installed. That is expected, and it is why M1 never lands alone.
4. **B0-UI (Opus + Chrome)**, **O-img (Opus)**, then **B-media (Opus)**, whose capability parts wait on owner decision Q-M2.

Green claims: only the B0 commit, the M2–M4 commits and the M1+B1 squash commit are claimed green on `pnpm guard`, and only after the cloud gate (section 8) has run on them. No claim is made for the M1 lane commit. Nothing is pushed until the squash has landed. Terra lane: `model-list.terra-prompt.md`.

Owner rule: model ids are never hard-coded. Each provider or CLI discovers its list at runtime, and the exact id the user chose is stored and used. When discovery fails, the user sees a plain-words error with Copy details, never a quiet swap to a stale id.

## 1. What already exists

**Agent discovery** (Jini `packages/agent-runtime/src`). Every def in `defs/` spreads `createAgentModelDiscovery(...)` (`model-discovery-native.ts:22` → `model-discovery.ts:137`). Sources, in order: live probe (`fetchModels` / `listModels`), the CLI's own disk catalog (`DISK_CATALOG_AGENTS` = codex, opencode, claude, codebuddy, `model-discovery.ts:12`), the last good snapshot. When all fail, `offlineSnapshot(..., configuration.fallbackModels(), diagnostic)` (`:175`, `:208`, `:239`) serves the def's hard-coded list, labelled "Offline fallback" (`packages/chat/src/react/features/chat-pane/model-options.ts:44`).

**Launch.** The daemon picks the model in `daemon/src/agent-executor/launch.ts:1240–1255` (`selectRunModel`) through `resolveModelForLaunch` (`model-discovery.ts:284`). In a locked run (`!input.cliParity`) every launch must resolve to a concrete id: `'default'` is dropped from the context (`launch.ts:941`), and `resolveFromCatalog` (`model-discovery.ts:124`) needs row evidence (`rowEvidence`, `:110`). In a parity run `'default'` is deleted and no `--model` is passed (`launch.ts:1241`), so the CLI picks. `models.ts` `resolveModelForAgent` / `concreteFallbackModel` (`:98–119`) has **no production caller** in Jini or Tovu (only a comment at `chat/src/core/assistant-client/transport.ts:629`). It is public API.

**What the hard-coded rows do today** (this is why finding 3 is right):
1. When an offline catalog has rows, an explicit selection resolves if it matches one. Defs with `supportsCustomModel: false` (antigravity `:219`, amr `:315`, amp `:50`) have no other path. If the rows are deleted first, a saved Antigravity choice stops launching offline.
2. A CLI config-file selection (`readModelConfiguration`) resolves offline only when it matches a row.
3. `staticDiscover` (`model-discovery.ts:256–261`) makes the first concrete fallback row the `defaultSelectionId` for host-supplied defs that have no discovery port. That is the silent stale launch.
4. Aliases (`sonnet`, `opus`, …) in an offline catalog never launch a locked run. `resolveFromCatalog` finds the row, sees `identityKind: 'alias'`, and returns "no concrete evidence". They only feed the picker and parity runs.

**BYOK** (`packages/integrations/src/media-providers/ui-defaults.ts` presets). `rules.ts:301–307` `presetCredentials` seeds `model: saved?.model ?? preset.preferredModels[0] ?? ''`. `ByokProviderForm.tsx:636` suggests `preferredModels` when discovery is not `ok`. The form does not seed a model from discovery. An empty model makes `isProviderConfigured` false (`rules.ts:255`).

**Media.** `dispatch/media-provider-registry.ts` holds one `{ provider, models, adapters }` contribution per vendor on the shared `@jini-ai/core/provider-registry`. The static catalogs in `providers.ts` (`IMAGE_MODELS` 88–133, `VIDEO_MODELS` 135–166, `AUDIO_MODELS_BY_KIND` 168–189) are only the data for the built-in contribution. Model ids are global: `collisionFault` (`:95–100`) refuses a second provider that offers the same id. Catalog id and wire id already differ for AIHubMix (`aihubmix-shared.ts:142–144`, `agent-runtime/src/providers/aihubmix.ts:175–177`). Media credentials store a `model` per provider (Tovu `media-provider-credential-repo`; read at `nanobanana.ts:104`). There is no media `listModels` port. `seed.ts` + `capability-registry.ts` is a capability table built to be swapped for live data later, and it has **no production consumer**.

**Freshness guard.** `scripts/check-model-fallback-freshness.ts` (R13, run by `scripts/guard.ts:61` and `check-guard-drift.ts:37`) guards claude, codex, antigravity, pi, aider and opencode with three checks. MF1: the def has `fallbackModelsAssertedAt`. MF2: that date is no older than 120 days. MF3 (only where the CLI is installed): the fallback contains every live id. MF3 fails as soon as rows are deleted on a machine with codex, agy or claude installed, so the R13 rewrite (B1) lands in the same squash commit as M1. R13 imports only those six def modules (`GUARDED_DEFS`, `check-model-fallback-freshness.ts:114–`); it never loads `ui-defaults.ts`, `amr/index.ts` or any Tovu file, so M2–M4 cannot change its result.

**Discovery-failure paths** (finding 7; every path a launch can take when discovery did not just succeed):
| Path | Where | Catalog the resolver sees | Today, stored concrete choice not in the rows |
|---|---|---|---|
| F1 probe fails, no earlier good catalog | `failureSnapshot` `:171–175` → `offlineSnapshot` | `freshness: 'offline-fallback'`, the def's fallback rows | resolves only if a fallback row matches |
| F2 probe fails, earlier good catalog | `failureSnapshot` `:174` | `freshness: 'stale'`, the last good rows, the probe's diagnostic | refused (`NO_CONCRETE_EVIDENCE`) |
| F3 good catalog expired, refresh pending | `lastGoodSnapshot` `:62–66` | `freshness: 'stale'`, the last good rows | refused |
| F4 first launch from the CLI's disk catalog | `readDiskCatalog` `:148–157`, `liveSnapshot` `:87–94` | `freshness: 'stale'`, `source: 'cli-cache'`, `defaultSelectionId` = config selection | refused |
| F5 config read fails during discovery | `discover` `:207–208` | `offline-fallback`, fingerprint without config material | see F6/F7 |
| F6 config read fails during resolution | `resolveDefaultModel` `:232` | any; returns before `resolveFromCatalog` | refused ("Launch configuration could not be read."), even when a row matches |
| F7 config read failed in discovery, succeeds in resolution | `resolveDefaultModel` `:233` | fingerprint mismatch | refused ("Launch configuration changed; refresh the catalog.") |

In every row, an explicit `context.model` that is not in the rows already launches as-is through the custom branch of `resolveModelForLaunch` (`:290–292`), unless the def sets `supportsCustomModel: false`. So the rows only matter for `supportsCustomModel: false` defs (antigravity, amr, amp), for `resumedModelId`, and for the config-file selection.

## 2. Decisions

| Where a value comes from | Rule |
|---|---|
| The list the picker shows | Discovery only: live, else the CLI disk catalog, else the last good snapshot. Offline, the def contributes keyword rows only (`default`, routing modes, and the aliases while Q-M1 is open). |
| The model a locked run uses | The stored exact choice (session/settings `model`, `resumedModelId`), else the CLI config-file selection, else the discovered default (`defaultSelectionId`). Never a row the code picked. |
| Discovery failed, stored concrete choice exists | Launch it as-is (B0-1), on every failure path F1–F6: offline fallback, stale catalog (F2–F4) and an unreadable config (F5/F6). If the CLI rejects it, show the CLI's own message. Exception: a def whose CLI fails silently on an unknown id declares so and gets the typed refusal instead (AMR, `amr/index.ts:294–295,311–314`). F7 (the config changed between discovery and launch) stays a refusal with Retry, because the catalog belongs to another launch scope. |
| Config file unreadable (F5/F6) | Only an explicit stored choice (`context.model`, `resumedModelId`) counts. The config-file and env selections are unknown, so with no explicit choice a locked run is refused with the config-read diagnostic (B0-5). |
| Parity run with an effort level | Unchanged path: `launch.ts:1245` resolves a model so the effort can be validated, and pins it. Offline with no stored choice it is refused (typed), never pinned to a code-picked row. Characterized in B0. |
| Discovery failed, no stored choice | Locked run: refuse with the error text below. Parity run: unchanged (no `--model`; the CLI decides and reports its own error). No per-agent "accepts no `--model`" table is needed, because the runtime never chooses for the user. The old assumption A2 is withdrawn. |
| Stored alias offline | Unchanged: refused ("Offline hints cannot resolve a display name or alias"). A locked run pins a concrete id. |
| BYOK with no saved model | `rules.ts:305` stays **exactly** `saved?.model ?? preset.preferredModels[0] ?? ''` (finding 15). With `preferredModels: []` it yields `''`, the provider reads as not configured, and the form asks the user to pick. No `rules.ts` change. |
| Keywords | These stay: `default`, `auto`, amp `smart/deep/rush`, qoder `lite/efficient/performance/ultimate`, devin `adaptive`, grok-build `grok-build`. `modelIdentityKind` (`core/model-discovery-shared.ts:5–10`) must class all of them as `routing-mode`. Today it misses qoder `lite`, `efficient` and `performance` (they read as `concrete`; `ultimate` is already a routing mode). B0-0 fixes the word list before anything else, because the new R13 rule and the launch policy both use this classifier. Version-less family aliases wait on Q-M1. |
| Wire/protocol/capability mappings | Retained, pending explicit review (section 6). Never deleted just because they contain a model name. |
| Tests | Model ids are allowed as fixture literals in `__tests__` / `*.test.*`. |

**Error text** (B0-4): "Couldn't load the model list for {Agent}: {diagnostic message}. Pick a model, or check that {bin} is installed and signed in, then press Retry." Copy details: agent id, source tried, diagnostic code, CLI version, timestamp, all passed through the existing redactor. `diagnostic()` (`model-discovery.ts:53`) already never stringifies vendor errors.

## 3. Inventory by behavior owner (both repos)

Completion search (replaces the old changed-files-only check): run `python3 -I <scan.py> <jini>/packages` and `python3 -I <scan.py> <tovu>/apps/website/src <tovu>/apps/admin/src <tovu>/apps/desktop/src <tovu>/apps/site-chat/src <tovu>/packages`. `scan.py` is in the coordinator scratchpad (`d2/scan.py`). It runs a quoted-literal regex over vendor model families and skips tests, fixtures, `dist` and `.d.ts`. After all stages, every remaining hit must be in a row of this section marked Keep, Retain or Waiting.

### 3a. Launch policy: Jini agent-runtime (Opus B0)
| Site | Change |
|---|---|
| `core/model-discovery-shared.ts:7` `modelIdentityKind` routing word list | B0-0 add `lite`, `efficient`, `performance` (lands first) |
| `model-discovery.ts:116–135` `catalogSelection` / `resolveFromCatalog` | B0-1 stored-choice rule for `freshness !== 'fresh'`; B0-4 no-selection reason |
| `model-discovery.ts:232` `resolveDefaultModel` config-read catch | B0-5 explicit stored choice, else typed refusal with the diagnostic |
| `model-discovery.ts:256–261` `staticDiscover` | B0-2 drop the first-concrete-row default |
| `model-discovery.ts:263–272` `staticResolve` | B0-1 same rule |
| `models.ts:98–118` `concreteFallbackModel` | B0-3 never `fallbacks[0]` |
| `model-discovery.ts:284–298` `resolveModelForLaunch` | B0-4 typed refusal |
| `daemon/src/agent-executor/launch.ts:1252` | B0-4 shows the specific reason |

### 3b. Agent def fallback rows: Jini `packages/agent-runtime/src/defs` (Terra M1, after B0 lands; on a lane branch, landed in one squash with B1)
Concrete rows only (`modelIdentityKind` = concrete, after B0-0): 107 rows in 14 defs. Codex and Hermes have two ranges each, so that their why-comments stay in place for B1 to move (finding 10).

| Def | Array | Delete lines | Rows | Keep |
|---|---|---|---|---|
| `claude.ts` | 56–78 | 62–77 | 15 | `DEFAULT`:57; aliases 58–61 (Q-M1) |
| `codex.ts` | 339–363 | 341–352 and 356–362 | 19 (12 + 7; incl. `o3`:361) | `DEFAULT`:340; why-comment 353–355 (B1 moves it) |
| `antigravity/index.ts` | 193–218 | 195–217 | 23 (incl. `gpt-oss-120b-medium`:217; the old anchor `:19` was wrong, it is `:213`) | `DEFAULT`:194 |
| `codebuddy/index.ts` | 22–46 | 24–45 | 15 (glm/claude/gpt/gemini/deepseek/kimi/minimax, `-ioa` ids) | `DEFAULT`:23 |
| `cursor-agent.ts` | 86–92 | 89–91 | 3 (`sonnet-4`, `sonnet-4-thinking`, `gpt-5`; versioned, so concrete) | `DEFAULT`:87, `auto`:88 |
| `aider.ts` | 19–30 | 22–29 | 3 (`gpt-5.6-sol`, `deepseek/deepseek-chat`, `gemini/gemini-2.0-flash`) | `DEFAULT`:20, `sonnet`:21 (Q-M1) |
| `deepseek.ts` | 23–27 | 25–26 | 2 | `DEFAULT`:24 |
| `kimi.ts` | 12–17 | 14–16 | 3 | `DEFAULT`:13 |
| `qwen.ts` | 12–16 | 14–15 | 2 | `DEFAULT`:13 |
| `reasonix.ts` | 53–57 | 55–56 | 2 | `DEFAULT`:54 |
| `opencode.ts` | 49–57 | 51–56 | 3 (provider-qualified) | `DEFAULT`:50 |
| `pi.ts` | 58–73 | 60–72 | 6 (provider-qualified) | `DEFAULT`:59 |
| `grok-build.ts` | 66–79 | 69–78 | 4 | `DEFAULT`:67, `grok-build`:68 (routing keyword) |
| `hermes/index.ts` | 27–51 | 31–50 | 7 (incl. `openai-codex:` provider-qualified ids) | `DEFAULT`:28; why-comment 29–30 (B1 moves it) |
| `devin.ts` | 31–40 | none | 0 | `adaptive`:33 keyword; `swe/opus/sonnet/codex/gpt/gemini` 34–39 (Q-M1) |
| `amp/index.ts`, `qoder.ts`, `amr/index.ts:296`, and the defs whose list is only `DEFAULT` | — | none | 0 | already keywords only |

**Comments inside the deleted ranges** (finding 10; owner rule: why-comments move, they are never deleted):
| Lines | Content | Decision |
|---|---|---|
| `claude.ts:62` | "picker cache additions; older IDs remain below" | Only describes the deleted rows. Deleted with them. |
| `codebuddy/index.ts:24,27,32,36,38,41,43` | family headings ("GLM family", ...) | Labels, not reasons. Deleted. |
| `codex.ts:353–355` | codex-cli shows its bundled catalog when it cannot reach the backend | CLI behavior. Kept by M1; B1 moves it next to the disk-catalog comment at `codex.ts:335–338`. |
| `aider.ts:22–26` | which row replaced `gpt-4o`, and why it is spelled bare | The LiteLLM spelling reason already lives at `aider.ts:13–18`, which B1 keeps. The rest is about the deleted rows. Deleted. |
| `pi.ts:66–69` | which row replaced `o4-mini` | Only describes the deleted row. Deleted. |
| `hermes/index.ts:29–30` | xAI via SuperGrok OAuth or `XAI_API_KEY` in `~/.hermes/.env` | Credential guidance. Kept by M1; B1 moves it into the `hermes/index.ts:21–26` rewrite. |
| `hermes/index.ts:44` | "OpenAI Codex." | Label. Deleted. |

Live sources after deletion: claude, codex, antigravity, cursor-agent, kimi, opencode, pi, reasonix, grok-build, hermes, devin and amr all have a probe. Four have no live list: aider, deepseek and qwen (config file only) and codebuddy (config file plus disk catalog). For those four, the offline picker shows Default plus the custom-model box. All four leave `supportsCustomModel` unset, so free text launches through the custom branch of `resolveModelForLaunch`.

### 3c. Stale comments and the freshness guard: Jini (Opus B1, on the M1 lane branch; lands in one squash with M1)
- Delete the `fallbackModelsAssertedAt` lines and the comments that only justify them: `claude.ts:203–207`, `codex.ts:364–366`, `antigravity/index.ts:191–192`, `aider.ts:31–34`, `opencode.ts:58–62`, `pi.ts:74–77`. The field itself: `types.ts:363–378`, `:714`, `:718`; `detection.ts:396–397`.
- Move the two why-comments M1 left inside the arrays (never delete them):
  - `codex.ts:353–355` → append to the comment at `:335–338`, reworded without the deleted id: "An older codex-cli (0.140.0) that cannot reach the backend still lists the models bundled with it as visible; the freshness guard found this."
  - `hermes/index.ts:29–30` → into the `:21–26` rewrite: "xAI Grok is available through the SuperGrok OAuth (`hermes auth add xai-oauth`) or `XAI_API_KEY` in `~/.hermes/.env`; OpenAI Codex through `hermes auth add openai`."
- Rewrite the comment blocks that describe the deleted lists, keeping every sentence about CLI behavior: `claude.ts:30–54` and `:192–202`, `codex.ts:324–325` and `:335–338`, `antigravity/index.ts:16–32` and `:220–222` (`:28` also claims `isKnownModel` gates ids, but the real gate is `resolveModelForLaunch`), `aider.ts:13–18`, `deepseek.ts:19–22`, `hermes/index.ts:21–26`, `pi.ts:56–57`, `opencode.ts:38–43` (keep the timeout reason), and `devin.ts:27–30` (after Q-M1).
- Rewrite R13 (`scripts/check-model-fallback-freshness.ts`, its test `scripts/__tests__/check-model-fallback-freshness.test.ts`, `scripts/lib/self-test.ts:20`) as one rule over **every** def in `AGENT_DEFS`: `fallbackModels` contains no row whose `modelIdentityKind` is `concrete`. MF1–MF3, `DEFAULT_MAX_AGE_DAYS`, the live probes and `GUARDED_DEFS` go away. Either keep the rule name `R13-model-fallback-freshness`, so the guard wiring (`guard.ts:61`, `check-guard-drift.ts:37`, `script-entrypoints.test.ts:38`) stays untouched, or rename it in all four places.

### 3d. BYOK presets: Jini `packages/integrations/src/media-providers/ui-defaults.ts` (Terra M2)
`preferredModels` → `[]` at `:101` (Anthropic), `:118` (OpenAI), `:145` (Google Gemini) and `:158` (OpenRouter, missed before). The comments at `:110–117` and `:140–144` describe the deleted lists, but each holds a reason that outlives them (finding 10). Both reasons move into the `DEFAULT_PROVIDER_PRESETS` doc comment (`:89–94`), with no model ids:
- `:114–117` (OpenAI): a code-picked newer, pricier flagship as the silent default "would jump an existing user's cost without them choosing it".
- `:140–144` (Gemini): a hard-coded head goes stale and silently pins new users to an old generation (seen live).

Exact text is in the Terra prompt, M2 step 3. `rules.ts:305` is unchanged (finding 15). The type at `core/src/provider-catalog.ts:48` is unchanged.

### 3e. AMR preference order: Jini `defs/amr/index.ts` (Terra M3)
Delete `PREFERRED_AMR_CHAT_MODEL_ORDER` / `_RANK` (`:9–18`). `orderAmrChatModels` (`:171–184`) returns the discovered order. Also update the `collectChatModels` doc (`:159`) and the test `defs/__tests__/amr.test.ts:157`.

### 3f. Agent picker hosts: Tovu + Jini UI (Opus B0-UI, Chrome)
| Site | Today | After |
|---|---|---|
| Jini `chat/src/react/features/chat-pane/model-options.ts:44` | "Offline fallback" label | Error text + Retry + Copy details; the custom box stays where `supportsCustomModel` allows it |
| Tovu `apps/website/src/assistant/agents.ts:188` | first snapshot shows `def.fallbackModels` | shows the pending state (`discoveryPending`) until the probe answers |
| Tovu `apps/website/src/assistant/agents.ts:103` | uninstalled CLI shows `def.fallbackModels` | keyword rows only; the picker says the CLI is not installed |
| Tovu `apps/desktop/src/desktop-agent-inventory.ts:31` | probe failure → `def.fallbackModels` | probe failure → error state with Copy details |
| Jini `ui/src/features/execution/react/components/ByokProviderForm.tsx:636` | suggests `preferredModels` when not `ok` | suggests discovered models only; on `error`, shows the message + Copy details; an empty model reads "Pick or type a model" |
| Run failure `AGENT_MODEL_UNRESOLVED` (`launch.ts:1252`) | generic sentence | B0-4 reason + Copy details |

### 3g. Tovu media default image model (Terra M4 + Opus O-img)
- The tool description at `apps/website/src/features/media-generation/agent-tools.ts:102–103` names three ids and claims `gpt-image-2` is the default. Real behavior (`tool-registrations.ts:209–222`, `resolveDefaultImageModel`): Tovu uses the first model in this field's enum whose vendor has a reachable credential (saved row first, then env). If no vendor has one, it returns `DEFAULT_MODEL` (`:139`) and the call fails with the "no credential configured" error. **M4 (Terra)** rewrites the description to say exactly that (finding 16, option "match real behavior"). There is no "saved default" wording, because no stored default image model exists.
- **O-img (Opus, test-first)**: at `tool-registrations.ts:139` and `:221`, when no provider has a credential, throw a plain-words `MediaGenerationValidationError`-style message ("No media provider has a key yet. Add one in Admin → Media → Media providers.") instead of returning `gpt-image-2`. Doc comments: `:130–138`, `:196–199`. Test `__tests__/tool-registrations.test.ts:302` keeps its OpenAI-credential case. The M4 text stays true before and after this change.
- Q-M3 asks whether an omitted `model` should prefer the user's saved per-provider credential model.

### 3h. Visitor assistant: Tovu (waiting on Q-M1)
`apps/website/src/server/runtime/composition/modules/site-assistant.ts:119,165` uses `gemini-flash-latest` as the Google default, and `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts:223,320` preselects `gemini-flash-latest` from the discovered list. Both stay if Q-M1 keeps aliases. (`:320` duplicates `withDiscoveredModel` at `:221`; reuse it the next time this file is touched.)

### 3i. xAI search model: Jini `daemon/src/http/xai.ts:159,246,746` (waiting on Q-M4)
`DEFAULT_SEARCH_MODEL = 'grok-4.20-reasoning'` is used when neither the request nor the host names a model. The host option is `searchDefaultModel`, which Tovu does not set.

### 3j. Media catalogs and defaults: Jini integrations (B-media)
Nothing in this table runs before the owner answers Q-M2 (row 14 of the review). A discovered media model with no capability cannot be offered to the image, video or audio surface, so every row that removes a built-in row or relies on discovered rows waits.
| Site | Stage | Waits on |
|---|---|---|
| `providers.ts:89–132` image rows, `:136–165` video rows, `:170–187` audio rows | B-media-2 (delete built-in rows) | **Q-M2** (capability), then B-media-1 |
| `providers.ts:82` `customModelPlaceholder` (names ids) | B-media-2 | **Q-M2** |
| `ui-defaults.ts:12` `NANO_BANANA_MODEL` (used at `:18,23,28,37,46`), `:59` `models: [...]` | B-media-2 | **Q-M2** |
| `dispatch/providers/nanobanana.ts:35,104` | B-media-2 | **Q-M2** |
| `seed.ts:14–` + `capability-registry.ts` (capability seed, no consumer) | B-media capability | **Q-M2** decides whether it becomes the data table or is deleted |
| `dispatch/providers/openai.ts:237` (`gpt-4o-mini-tts` takes `instructions`) | capability mapping (section 6) | **Q-M2** |

These are not models: `providers.ts:29` (provider alias map) and `:64` (the `kling` provider id).

### 3k. Not model ids (excluded from the count)
`claude-mcp-json`, `claude-stream-json`, `mimo-env-content`, `opencode-env-content`, the `grok-build` agent id in UI maps, `codex-*` identifiers, Tovu comments that record which model ran an audit (`site-exporter.ts:447`, `theme/validation/profiles.ts:65`, `manifest-v2.ts:51`, `assistant-ag-ui.ts:579–580`), and `admin/.../media-provider-catalog.ts:17` (provider aliases).

## 4. Opus B0: launch policy (lands first, test-first)

For each item: write the failing test first, run it red, mutate to prove it, then fix. Owner rules: cyclomatic and cognitive complexity at 10 or below and at most 50 lines per function (add helpers rather than branches); any new function takes `(requiredObj, optionalObj)`; why-comments move, never vanish; no vendor names outside the def or adapter that owns them. Each item lists the existing test whose expectation it changes on purpose.

- **B0-0 classifier (first commit of B0).** Add `lite|efficient|performance` to the routing-mode word list in `modelIdentityKind` (`core/model-discovery-shared.ts:7`). Why-comment: "Qoder's tiers name a routing policy, not a model; the server picks the model." Effect, stated in the CHANGELOG: a locked Qoder run that selects `lite`, `efficient` or `performance` is now refused like `ultimate` already is, and Qoder's picker no longer offers them as concrete choices; parity runs still pass `--model lite` unchanged (`qoder.ts:13`). Old R13 does not use the classifier, so this commit does not touch its result.
- **B0-1 stored choice when discovery could not confirm.** One pure helper, `storedChoiceResolution({ context, catalog, configSelection, optOut }, { resolvedAt })`, used by `resolveFromCatalog`, `staticResolve` and B0-5. It returns `resolved` with `id = selectionId = selection` when all hold:
  - `catalog.freshness !== 'fresh'` (covers F1 offline fallback and F2–F4 stale catalogs);
  - the selection equals `context.model`, `context.resumedModelId` or `configSelection` (compared by value, so the disk catalog's `defaultSelectionId`, which is the config selection, counts; a native discovered default does not);
  - `isConcreteId(selection)` (after B0-0) and no catalog row matches it;
  - the def has not opted out.
  `source` is `'config-file'` when it equals `configSelection`, else `catalog.source`. Otherwise it returns `undefined` and the caller keeps today's path. Opt-out: one declared def field (Opus names it); the default is to launch. AMR sets it, citing its fail-closed comment (`amr/index.ts:294–295,311–314`); for an opted-out def the result is the typed refusal of B0-4, never a launch. Why-comment: "The user picked this id while it was real. Without a fresh list we cannot re-check it, and swapping in another id is worse than letting the CLI answer."
- **B0-2** `staticDiscover`: `defaultSelectionId` comes only from `context.model`, `resumedModelId` or `configuredDefault`. Replace the "preserve that contract" comment with the reason it was dropped. CHANGELOG: host-supplied static defs no longer launch their first fallback row.
- **B0-3** `concreteFallbackModel` (`models.ts:98–111`): return the first remembered live id, else `resolved`. Delete `return fallbacks[0]!.id` and update the comment at `:112–118`. Add a CHANGELOG entry (public API).
- **B0-4 typed refusal.** Every refusal on F1–F7 carries a plain-words reason. With no selection on a non-fresh catalog it names the diagnostic (`catalog.diagnostics[0]?.message`), using the error text in section 2. `resolveModelForLaunch:293` throws `RuntimeSelectionError` instead of `Error`, so `launch.ts:1252` prints the reason prefixed with `def.name`. The generic sentence stays only for unexpected errors.
- **B0-5 unreadable config (F5/F6).** At `resolveDefaultModel:232`, keep the caught error as `diagnostic(error)` instead of discarding it. Call `storedChoiceResolution` with `configSelection: undefined`, so only `context.model` or `resumedModelId` can launch, on any catalog freshness (the fingerprint cannot be checked, and the explicit id is what the user chose). `missingResumedModel` still refuses first. Otherwise refuse with "Couldn't read {Agent}'s settings: {diagnostic message}. Pick a model, or fix the settings file, then press Retry." F7 (`:233`, fingerprint mismatch) is unchanged apart from the B0-4 wording plus Retry. Changes on purpose: `model-discovery-policy.test.ts:487–491` (new reason text).
- **Characterization tests.** Written by Opus first; each is run red before the change (or green for "unchanged") and green after. Fixture model ids are allowed in tests.

| # | Path | Setup | Expected after B0 | Today |
|---|---|---|---|---|
| C1 | F1 | antigravity (`supportsCustomModel: false`), offline, saved `context.model` not in rows | launches that id | refused once rows are deleted |
| C2 | F1 | codex, offline, config-file selection not in rows | launches it, `source: 'config-file'` | refused once rows are deleted |
| C3 | F1 | codex, offline, `resumedModelId` not in rows | launches it | refused |
| C4 | F2 | antigravity, earlier good catalog, probe fails, saved `context.model` absent from the last good rows | launches it | refused |
| C5 | F3 | good catalog expired, refresh pending, config selection absent from rows | launches it | refused |
| C6 | F4 | codex first launch from the disk catalog, `resumedModelId` absent from it | launches it | refused |
| C7 | F1/F2 | amr (opted out), offline or stale, saved id | typed refusal naming the agent; no launch | refused (generic) |
| C8 | F6 | config read throws, `context.model` set, antigravity | launches it | refused |
| C9 | F6 | config read throws, no explicit choice | refused, reason contains the config diagnostic | refused (generic) |
| C10 | F7 | catalog from another launch scope | refused with Retry wording | refused |
| C11 | F1 | any def, offline, no choice, locked run | refused with the discovery diagnostic | refused (generic) |
| C12 | F1 | offline, saved alias `sonnet` | refused ("Offline hints cannot resolve a display name or alias.") | unchanged |
| C13 | fresh | fresh catalog, saved `resumedModelId` absent from rows | refused (typed) | unchanged |
| C14 | static | `staticDiscover` with concrete fallback rows, no choice | no `defaultSelectionId` | first concrete row |
| C15 | parity | `cliParity`, model `'default'`, no effort | no resolution call, no `--model` | unchanged |
| C16 | parity + effort | `cliParity`, effort `high`, live catalog with a discovered default | resolves the discovered default, validates effort, pins it (`launch.ts:1245–1249`) | unchanged |
| C17 | parity + effort | `cliParity`, effort `high`, offline, no choice | refused (typed, asks to pick a model before choosing effort) | native def: refused (generic); static host def: pinned the first fallback row |
| C18 | parity + effort | `cliParity`, effort `high`, offline, config-file selection not in rows (no explicit model) | launches the choice; effort validated against the def's advertised levels (`concreteModelOptions` adds the resolved id, `core/model-discovery-shared.ts:52–64`) | refused |
| C19 | B0-0 | `modelIdentityKind` on `lite`, `efficient`, `performance`, `ultimate` → `routing-mode`; on `glm-5.1`, `gpt-5.4-mini`, `claude-haiku-4-5` → `concrete` | as stated | first three read `concrete` |
| C20 | B0-0 | qoder locked run, selection `lite` | refused like `ultimate` | resolves `lite` |

The cases use a `supportsCustomModel: false` def, `resumedModelId` or the config selection on purpose: an explicit `context.model` on a custom-capable def already launches today through the custom branch (section 1), so it cannot show the change.

- Files: `agent-runtime/src/__tests__/model-discovery-shared.test.ts` (C19), `model-discovery-policy.test.ts` (C1–C13), `model-discovery.test.ts` (C14), `models.test.ts` (B0-3), `defs/__tests__/qoder.test.ts` (C20), `daemon/src/agent-executor/__tests__/starting-model.test.ts` (C15–C18, next to its existing parity cases at `:146–165`).

## 5. B-media (Opus; design only until Q-M2 is answered)

Extend the existing registry; do not add a second catalog. Only item 1 may be built before Q-M2; items 2–4 wait on it.
1. **Identity** (does not wait on Q-M2). `MediaProviderModel` gains `wireId` (the id the vendor API takes). Built-in rows keep their current `id`, so saved selections keep resolving. Their `wireId` comes from the existing maps (`aihubmix-shared.ts:142–144`) or equals `id`. Discovered rows get a provider-qualified `id` (`<providerId>:<wireId>`, with a separator no current id contains), so `collisionFault` (`:95`) never trips when OpenAI and AIHubMix both report `gpt-image-1`. Dispatch sends `wireId`, never the registry id.
2. **Discovery port** (**waits on Q-M2**: a discovered row cannot be contributed without a surface). `VendorAdapter` gains an optional `listModels({ credentials }, { signal })`. Results are cached per (provider, credential fingerprint, base URL) with the same lifetimes as the agent catalog (15 min for a good result, 30 s after a failure) and contributed through `providers.contribute`. Outbound calls go through the existing `dispatch/ssrf-guard.ts` / `outbound.ts`.
3. **Stored selections** (**waits on Q-M2**, because B-media-2 removes built-in rows only once discovered rows can replace them). A saved model id that is a built-in id keeps working. When B-media-2 removes the built-in rows, a migration rewrites saved ids to qualified ids. Migrations may carry the old ids (migration exemption, owner 10-29). A saved id that no longer resolves gets a plain-words error naming the provider, never a substitute.
4. **Capability** (which surface and caps a discovered model has): **waits on Q-M2.** Dependent rows: every row of 3j, items 2–3 above, the capability rows of section 6, and Q-M3 (which needs item 1 only, but its value grows with item 2).

## 6. Retained pending explicit review (protocol / wire / capability mappings)

No stage here deletes these. Each needs its own reviewed decision:
- `dispatch/providers/openai.ts:150–152` (dall-e quality) and `:237` (`gpt-4o-mini-tts` takes `instructions`): capability, **waits on Q-M2**
- `dispatch/openai-compatible.ts:202–203` (size tables): capability, **waits on Q-M2**
- `dispatch/providers/aihubmix.ts:108–110`
- `aihubmix-shared.ts:142–144` and `agent-runtime/src/providers/aihubmix.ts:175–177` (catalog id → wire id)
- `dispatch/providers/minimax.ts:49`
- `dispatch/providers/custom-image.ts:59`
- `video-request.ts:29`: capability, **waits on Q-M2**
- `agent-runtime/src/providers/model-catalog.ts:130` (non-chat filter)
- `defs/amr/index.ts:50–57` (Vela id normalizer) and `:105–109` (non-chat filter)
- `claude-code-models.ts:159`
- `core/model-discovery-shared.ts:7–8` (identity classifier word lists): kept; B0-0 only adds the three Qoder tiers

## 7. Owner decisions

- **Q-M1 (raised, open):** keep version-less family aliases as keywords? These are claude `fable/sonnet/opus/haiku` (`claude.ts:58–61`), aider `sonnet` (`aider.ts:21`), devin `swe/opus/sonnet/codex/gpt/gemini` (`devin.ts:34–39`) and Tovu's `gemini-flash-latest` (3h). **Recommend keep:** the CLI resolves them, so they never go stale. Evidence: offline they cannot launch a locked run anyway (section 1, item 4); they only serve the picker and parity runs. Terra leaves them alone.
- **Q-M2 (open; blocks section 5 items 2–4, all of 3j and the capability rows of section 6):** how discovered media models get their capability. (a) **Recommended:** the user tags the model (image / video / audio) when picking it, stored with the credential. No hard-coded per-model data, so nothing goes stale. (b) A capability table kept as data with a check. `capability-registry.ts` + `seed.ts` is already that table, with a swap seam and no consumer yet, but it is per-model data that must be maintained by hand. Nothing that depends on this runs until the owner answers.
- **Q-M3 (new):** when the media tool omits `model`, should it first use the saved model on the first provider credential that has one (the user's own choice), before today's "first catalog model whose vendor has a key"? Recommend yes, after B-media stage 1. M4's wording stays true either way.
- **Q-M4 (new):** the xAI search model (`xai.ts:159`). Either the user picks it once in the xAI connect card from xAI's model list (stored), or the host injects a value. Recommend the stored pick, with no default in code.

## 8. Cloud-gate tests (single files, on each landing commit)

- B0: `agent-runtime/src/__tests__/model-discovery-shared.test.ts`, `model-discovery-policy.test.ts`, `model-discovery.test.ts`, `models.test.ts`, `defs/__tests__/qoder.test.ts`, `defs/__tests__/antigravity.test.ts`, `defs/__tests__/amr.test.ts`, `defs/__tests__/offline-fallback-models.test.ts`, `daemon/src/agent-executor/__tests__/starting-model.test.ts`, `chat/src/react/features/chat-pane/__tests__/model-options.test.ts`; type-check agent-runtime, daemon and chat; then `pnpm guard` (old R13 must be unchanged).
- Terra M2–M4 (any time): `defs/__tests__/amr.test.ts`, `ui/src/__tests__/features/execution/rules.test.ts`, the `ByokProviderForm.*.test.tsx` files that read presets; Tovu `features/media-generation/__tests__/` files that reference `agent-tools`.
- M1 + B1 squash commit (one gate run; the M1 lane commit alone is not gated): each changed def's `defs/__tests__/<id>.test.ts`, `defs/__tests__/offline-fallback-models.test.ts`, `scripts/__tests__/check-model-fallback-freshness.test.ts`, `scripts/__tests__/guard-drift-cli.unit.test.ts`, `scripts/__tests__/script-entrypoints.test.ts`, then `pnpm guard` (new R13, which relies on B0-0).
- Tovu (after it consumes the new Jini build): `apps/website/src/assistant/__tests__/agents.test.ts`, `agents-owned-runtime.test.ts`, `server/inbound/admin-http/routes/assistant/__tests__/detect-agents-route.test.ts`, `features/media-generation/__tests__/tool-registrations.test.ts`, `providers-tools.test.ts`.
- B0-UI: a Chrome check of the chat picker's offline state and of the BYOK form with discovery failing.
