# Dynamic model list (Design B)

Status: designed 2026-11-13 and not built. The mechanism already exists, so this is a removal-and-wiring job. Terra lane: `model-list.terra-prompt.md`. Opus lane: section 5.

Owner rule: model ids are never hard-coded. Each provider or CLI discovers its model list at runtime, and the exact model the user chose is stored. When discovery fails, the user sees a plain-words error with Copy details, never a quiet fallback to a stale id.

## 1. What already exists (Jini `packages/agent-runtime/src`)

- **Discovery port per agent.** Each def gets one from `createAgentModelDiscovery(agentId, { fallbackModels, args?, parse? })` (`model-discovery-native.ts:22` → `model-discovery.ts:137`). Order of sources: live CLI/RPC/provider-API probe (`fetchModels`, `listModels: { args: ['models'] … }`, `codex debug models`, `loadAnthropicLiveModels`), then the CLI's own disk catalog (`DISK_CATALOG_AGENTS`), then the last good snapshot. Results are cached for 15 min (`MODEL_CATALOG_TTL_MS`); a failed probe is retried after 30 s (`MODEL_NEGATIVE_TTL_MS`). Each snapshot carries `source`, `freshness` and `diagnostics` (`model-discovery-types.ts:6,15`).
- **The leak.** When nothing answers, `offlineSnapshot(..., configuration.fallbackModels(), diagnostic)` (`model-discovery.ts:239`) returns the def's hard-coded `fallbackModels`. The picker labels it "Offline fallback" (`packages/chat/src/react/features/chat-pane/model-options.ts:44`). The rows are stale vendor ids, and `concreteFallbackModel` (`models.ts:97-111`) silently launches `fallbacks[0].id` for agents that need a concrete model. Neither is allowed.
- **Freshness guard.** `scripts/check-model-fallback-freshness.ts` (rule R13) plus `fallbackModelsAssertedAt` on defs exist only because the lists are hard-coded.
- **BYOK providers** (`packages/integrations/src/media-providers/ui-defaults.ts`). `preferredModels` is a fallback for live `listModels` discovery. `packages/ui/src/features/execution/rules.ts` uses `saved?.model ?? preset.preferredModels[0]`, so `saved.model` already stores the user's exact choice. The form falls back to `preferredModels` when `modelDiscovery.status !== 'ok'` (`ByokProviderForm.tsx:636`).

## 2. Decisions

| Where a value comes from | Rule |
|---|---|
| The list the picker shows | Discovery only: live, else the CLI disk catalog, else the last good snapshot. Never a hard-coded list. |
| The model a run uses | The stored exact choice (`saved.model` / the session's model id). If there is none: the discovered default (`defaultSelectionId`, what the CLI itself reports), else the CLI keyword `default` (the CLI uses its own configured model), for CLIs that accept it. |
| Discovery failed and no stored choice | Agents that need a concrete id refuse to launch with a plain-words error and Copy details (below). Agents that accept `default` run with `default`, and the picker shows the diagnostic. |
| Discovery failed but a stored choice exists | Use the stored id as-is (the user picked it; it was real). If the CLI rejects it, show the CLI's own message. Never swap in another id. |
| Routing keywords that are not vendor ids (`default`, `auto`) | Allowed as literals: they are CLI keywords, not model ids. |
| Tests | Model ids are allowed as test-fixture literals (any `__tests__`/`*.test.ts`). |
| Provider defaults ("the documented default") | Not hard-coded. If a provider's API names a default (Codex `debug models` is_default, Anthropic list order), discovery reads it; otherwise there is no default and the user picks. |

**Error text** (one shared helper, Opus lane B0): "Couldn't load the model list for {Agent}. {diagnostic message}. Check that {bin} is installed and signed in, then press Retry." Copy details: agent id, source tried, diagnostic code, CLI version, timestamp, with secrets redacted by the existing redactor.

## 3. Variants and counts (76 sites: 75 Jini + 1 Tovu)

| Variant | Sites | Lane |
|---|---|---|
| **M1 def fallback rows**: delete the concrete rows in `fallbackModels`, keeping `DEFAULT_MODEL_OPTION` and keyword rows (`auto`). Delete `fallbackModelsAssertedAt` and the comments that only justify specific ids. | claude 15, codex 18, codebuddy 8, antigravity 22, aider 1, cursor-agent 1 = **65** | Terra |
| **M2 BYOK `preferredModels`** → `[]` | ui-defaults.ts:101,118,145 = **3** | Terra |
| **M3 AMR preference rank**: delete `PREFERRED_AMR_CHAT_MODEL_ORDER`/`_RANK`; `orderAmrChatModels` keeps discovered order | amr/index.ts:13 = **1** | Terra |
| **M4 tool description text** names ids → "the workspace's saved default image model" | Tovu `apps/website/src/features/media-generation/agent-tools.ts:102` = **1** | Terra (Tovu) |
| **M5 media default constants** (`NANOBANANA_DEFAULT_MODEL`, `NANO_BANANA_MODEL` preset `models: [...]`) | nanobanana.ts:35, ui-defaults.ts:12 = **2** | Opus |
| **M6 media catalog rows** | providers.ts:103,118,181 = **3** | Opus |
| **M7 capability check by id** (`ctx.model === 'gpt-4o-mini-tts'`) | openai.ts:237 = **1** | Opus |

Counts: 65+3+1+1+2+3+1 = 76 (75 Jini + 1 Tovu).

## 4. Why M1 is safe to delete
Every M1 def already has a live source: claude (`fetchModels` → MMD routes, Claude Code's own list, Anthropic API), codex (`debug models` + disk catalog), antigravity (`listModels` args `['models']`), cursor-agent (`listModels` `['models']`), codebuddy (disk catalog, `DISK_CATALOG_AGENTS`), aider (no live list, but it accepts `default` and free-text custom models, `supportsCustomModel`). The only thing lost is a stale list shown when every source fails, and that is exactly the case the owner wants surfaced.

## 5. Opus lane (judgment)

- **B0 runtime/UI**:
  - `models.ts` `concreteFallbackModel`: for a def without `default`, return first live id, else the stored choice, else throw `RuntimeSelectionError` with the error text above. Never return `fallbacks[0]`.
  - `isKnownModel`: accept the stored choice when the catalog is offline.
  - `offlineSnapshot`: unchanged. It now carries only `default`/keywords plus the diagnostic.
  - chat `model-options.ts`: replace the "Offline fallback" label with the error text plus Retry and Copy details (UI = Opus + Chrome per owner rule).
  - `ByokProviderForm.tsx:636`: on a discovery error, show the error plus Copy details and keep the free-text field; `rules.ts`: `saved?.model ?? undefined`, and the form asks the user to pick.
  - `scripts/check-model-fallback-freshness.ts` (R13) becomes "a def's `fallbackModels` holds only `default`/`auto`", and `fallbackModelsAssertedAt` is deleted from `types.ts`.
- **B-media (M5–M7)**: there is no media-model discovery today. Add a `listModels` port to each media vendor adapter (`dispatch/vendor-adapter.ts`): OpenAI `GET /v1/models`, Google `GET /v1beta/models`, and the rest per vendor API. The provider catalog (`providers.ts`) keeps capability rows **keyed by what the vendor API reports**. Where no vendor API reports a capability (image vs text), the user tags the model when picking it, and the choice and tag are stored. `nanobanana.ts:104`: with no `credentials.model || ctx.wireModel`, throw "No image model is chosen for Nano Banana. Pick one in Admin → Media → Media providers." `openai.ts:237`: send `instructions` whenever given; on a 400 that names `instructions`, return "This voice model doesn't take style instructions. Remove them or pick another voice model." with Copy details. **Owner decision needed (B-media):** accept the user-tags-capability step for vendors whose API can't tell, or keep a small capability table as data with a freshness check (my recommendation: user tags; it is never stale).

## 6. Assumptions (for the reviewer)

- A1: `saved.model` (BYOK) and the chat session's model id already persist the exact id. This is from reading `rules.ts`; the chat side was not traced.
- A2: aider, cursor-agent, codex, claude, codebuddy and antigravity all accept a run with no `--model` (`default`). Their current fallback lists include `DEFAULT_MODEL_OPTION`, which the runtime only offers when the CLI accepts it (`models.ts:113-118` comment).
- A3: tests that assert the old fallback ids change to assert `[DEFAULT_MODEL_OPTION]`; tests that only use an id as input keep it as a fixture literal.
