# Model-Discovery Audit — why `gpt-6-astra` and the Fable models aren't showing

- Date: 2026-09-05
- Agent: Programmer (`AI-Dev-Shop/agents/programmer/skills.md` loaded)
- Scope: **investigation only.** No tooling, CLI config, or product code was changed.

---

## 1. The direct answer

**They are two different bugs with two different owners, and neither is "the CLIs have no dynamic
model list."**

`gpt-6-astra` was missing from Codex because of a **bug in OpenAI's own bundled catalog**: Codex
0.153.x shipped Astra with `visibility: "hide"`, so it was reachable via `-m gpt-6-astra` but never
rendered in a picker. OpenAI fixed it in [PR #42874 "[0.153 hotfix] Show Astra in bundled model
picker"](https://github.com/openai/codex/pull/42874) (merged; flipped `hide` → `list`). **The Codex
CLI on this machine was upgraded to 0.153.4 today at 17:01**, and as of right now Astra *is* listed —
verified live below. Nothing in Tovu or Jini caused that symptom and nothing here needs fixing for it.

The Fable symptom is **ours**. The `claude` CLI itself is fine: `~/.claude.json` carries a
server-fetched `additionalModelOptionsCache` containing `claude-fable-5-1` / "Fable", so Fable *is* in
Claude Code's own `/model` picker. But **Tovu's admin "Execution mode" Local-CLI picker never asks
Claude anything** — `claude` has no model-list subcommand, so Jini's def falls back to a hand-written
array in `Jini/packages/agent-runtime/src/defs/claude.ts:50-60` that stops at `claude-opus-5`. That
array is the list she is looking at, and it will go stale again on every model launch until something
replaces it.

So both halves of her instinct are right in a way she didn't expect: the Codex list *is* dynamic (and
was briefly wrong upstream), and the Claude list *is* hardcoded — by us, not by Anthropic.

**And her one factual error is worth correcting precisely:** an API for this does exist. Anthropic's
`GET /v1/models` returns `id`, `display_name`, `created_at`, `max_input_tokens`, `max_tokens` — **and
a `capabilities.effort` object that enumerates `low`/`medium`/`high`/`xhigh`/`max` with a
`supported: boolean` on each.** Reasoning levels *are* discoverable from at least one provider. Jini
already ships a working client for that endpoint (`listProviderModels`); it is simply not wired to
the Claude CLI picker.

---

## 2. Per-tool source table

| Surface | Exists? | Source of its list | Evidence |
|---|---|---|---|
| `codex debug models` | **Yes** | **Live**, fetched from OpenAI's backend each call, cached to `~/.codex/models_cache.json` with `fetched_at` / `etag` / `client_version`; falls back to a catalog **bundled in the binary** | Two consecutive runs moved `fetched_at` `02:00:23Z` → `02:04:54Z`. Binary carries `remote_models` feature flag, `OnlineIfUncached` + `models_cache.json` strings, and a `model_catalog_json` config key. PR #42874 confirms a bundled catalog exists too. |
| `codex models` | **No such subcommand** | n/a — the word is passed through as a *prompt* | `codex --help` lists 30 commands; `models` is not among them. `codex models --help` prints top-level help. |
| `codex` `-m/--model` | Accepts any string | Not validated against the catalog | `codex --help`: `-m, --model <MODEL>  Model the agent should use` (no `possible values`) |
| `~/.codex/config.toml` | Yes | **Local config, pins one model** | `config.toml:1` `model = "gpt-5.6-terra"`, `:2` `model_reasoning_effort = "xhigh"` |
| `claude models` | **No such subcommand** | n/a — passed through as a prompt (it started a real session) | `claude --help` Commands list: `agents, attach, auth, auto-mode, doctor, gateway, import, install, logs, mcp, plugin, project, respawn, rm, setup-token, stop, update, ultrareview`. No `models`. |
| `claude` `/model` picker | Yes (interactive only) | **Live/server-driven**, cached in `~/.claude.json` | `additionalModelOptionsCache = [{"value":"claude-fable-5-1[1m]","label":"Fable","description":"Fable 5.1 · Most capable for your hardest and longest-running tasks"}]`, answered `2026-09-05T21:59:05Z`. Binary contains a "Fable entitlement probe" + GrowthBook gate. |
| `claude --model` | Accepts alias or full id | Not enumerable from the CLI | `--help`: "Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5')" |
| `agy models` | **Yes** | **Live** ("Fetching available models…", then `slug<TAB>label`) | 14 rows returned, unchanged in count since the 2026-09-02 note |
| **Tovu admin → Local CLI card, Codex** | Yes | **Live** via `codex debug models` | `detectAgents()` run below: `modelsSource=live`, Astra present |
| **Tovu admin → Local CLI card, Claude** | Yes | **HARDCODED** | `Jini/packages/agent-runtime/src/defs/claude.ts:50-60` `CLAUDE_FALLBACK_MODELS`; `:92` `fetchModels` → `loadMmdRouteModels`, which returns `null` when `~/.config/mms/model-routes.json` is absent (`mmd-routes.ts:137-138`) — it is absent here — so `detection.ts:63` returns `source: 'fallback'` |
| Tovu admin → BYOK card | Yes | **Live REST**, per provider | `apps/website/src/server/inbound/admin-http/routes/assistant/list-models.ts` → `listProviderModels` → `providers/model-catalog.ts:229-242` |

### The live reproduction of the admin picker

Running the real `detectAgents()` out of the dist Tovu actually loads
(`node_modules/@jini-ai/agent-runtime` is a symlink to the Jini checkout):

```
=== claude | available=true | modelsSource=fallback | version=2.1.261 (Claude Code)
   models: default, sonnet, opus, haiku, claude-opus-5, claude-sonnet-5, claude-haiku-4-5, claude-opus-4-5, claude-sonnet-4-5
   reasoning: default, low, medium, high, xhigh, max
=== codex | available=true | modelsSource=live | version=codex-cli 0.153.4
   models: default, gpt-6-astra, gpt-reserve, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4-mini, codex-auto-review
   reasoning: default, none, minimal, low, medium, high, xhigh
=== antigravity | available=true | modelsSource=live | version=1.1.27
   models: default, gemini-3.8-flash-high, … (14 rows)
```

This is exactly what the "Execution mode" tab renders — `detect-agents.ts:135` calls `detectAgents()`
fresh on every POST, with no server-side cache, and `toExecutionTabAgent` forwards `models`,
`modelsSource` and `reasoningOptions` verbatim.

### Three real defects this surfaced (all in Jini, all small)

1. **`CLAUDE_FALLBACK_MODELS` is stale and structurally always will be** — `claude.ts:50-60`. No
   Fable, no Opus 4.6/4.7/4.8, no Sonnet 4.6. The Claude Code binary itself carries
   `claude-fable-5`, `claude-fable-5-1`, `claude-fable-5-mythos-5`, `claude-opus-4-6`,
   `claude-opus-4-7`, `claude-opus-4-8`, `claude-sonnet-4-6`.
2. **Codex's `visibility` filter tests the wrong literal.** `codex.ts:35` skips
   `entry.visibility === 'hidden'`, but the catalog's value is **`hide`** — confirmed both in the live
   JSON (`gpt-reserve` and `codex-auto-review` are `vis=hide`) and in OpenAI's own PR #42874, which
   describes flipping Astra from `hide` to `list`. Result: two internal models leak into the picker,
   visible in the `detectAgents()` output above.
3. **Codex's reasoning levels are hardcoded and now wrong.** `codex.ts:93-101` offers
   `none…xhigh`. The live catalog says `gpt-6-astra` supports `low, medium, high, xhigh, max, ultra`.
   `max` and `ultra` are unreachable from the Tovu picker even though `clampCodexReasoning`
   (`shared.ts:58-75`) would pass them straight through. The data is *right there* in the JSON the
   parser already reads and throws away.

---

## 3. What the live APIs actually return

> **Credentials: none available, and none were obtained.** `ant` is not installed anywhere on this
> machine. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `OPENAI_API_KEY` are all unset. There is
> no `~/.config/anthropic` or `~/.anthropic`. `~/.codex/auth.json` holds a ChatGPT **OAuth** triple
> with `OPENAI_API_KEY: null`. Tovu's `.env` carries only `GEMINI_API_KEY`. **Both live calls were
> therefore not made.** Everything below is quoted from official documentation and vendor SDK source,
> and is labelled as such. No credential value was printed, logged, or written anywhere.

### Anthropic — `GET /v1/models` (documented; not called)

```bash
curl https://api.anthropic.com/v1/models \
    -H 'anthropic-version: 2023-06-01' \
    -H "X-Api-Key: $ANTHROPIC_API_KEY"
```

Per [platform.claude.com/docs/en/api/models-list](https://platform.claude.com/docs/en/api/models-list),
each `data[]` item is:

- `id` — unique model identifier
- `display_name` — human-readable name
- `created_at` — RFC 3339 release date
- `max_input_tokens`, `max_tokens`
- `type: "model"`
- `capabilities` — `batch`, `citations`, `code_execution`, `context_management`, `image_input`,
  `pdf_input`, `structured_outputs`, `thinking` (with `types.adaptive` / `types.enabled`), **and
  `effort`** (below)

Pagination: `after_id` / `before_id` / `limit` (max 1000), with `first_id` / `has_more` / `last_id`.

**Account scoping is explicit in the docs:** *"The Models API response can be used to determine which
models are available for use in the API."* So a model absent from the response means **not available
to that account** — it is not evidence that the API is stale. Distinguishing the two cases requires an
actual call with a real key, which could not be made here.

### OpenAI — `GET /v1/models` (documented; not called)

From the official `openai-node` SDK source (`src/resources/models.ts`), the entire model object is:

```typescript
export interface Model {
  id: string;            // The model identifier, which can be referenced in the API endpoints.
  created: number;       // The Unix timestamp (in seconds) when the model was created.
  object: 'model';
  owned_by: string;      // The organization that owns the model.
  shutdown_date?: string | null;
}
```

**No display name, no context window, no effort levels.** OpenAI's public models endpoint is far
poorer than Anthropic's — it is an id list. It would also almost certainly **not** contain
`gpt-6-astra`: that slug belongs to the Codex/ChatGPT backend catalog
(`https://chatgpt.com/backend-api/codex`), not the metered platform API.

---

## 4. The effort / reasoning-level question — settled

**The premise "no provider exposes reasoning/effort levels through an API" is REFUTED.** Two of the
three do:

| Provider | Effort levels discoverable? | Where |
|---|---|---|
| **Anthropic** | **YES** | `GET /v1/models` → `capabilities.effort` = `{low, medium, high, max, xhigh}`, each `{supported: boolean}`, plus a top-level `effort.supported`. Documented and quoted above. |
| **OpenAI / Codex backend** | **YES**, on the Codex catalog | `codex debug models` → `supported_reasoning_levels` + `default_reasoning_level` **per model, with descriptions**. Not uniform: Astra and the Sol/Terra models get `ultra`; Luna and `gpt-reserve` stop at `max`; GPT-5.5 and 5.4-mini stop at `xhigh`. |
| **OpenAI public platform API** | **No** | The `Model` interface above has no such field. |
| **Google / antigravity** | **No separate field** — effort is baked into the model slug (`gemini-3.8-flash-high/-medium/-low`) and is not uniform per base model | `agy models` output; matches the 2026-09-02 note |

Live proof from `codex debug models`, `gpt-6-astra`:

```
default_reasoning_level = "low"
supported_reasoning_levels = [
  {"effort":"low","description":"Fast responses with lighter reasoning"},
  {"effort":"medium","description":"Balances speed and reasoning depth for everyday tasks"},
  {"effort":"high","description":"Greater reasoning depth for complex problems"},
  {"effort":"xhigh","description":"Extra high reasoning depth for complex problems"},
  {"effort":"max","description":"Maximum reasoning depth for the hardest problems"},
  {"effort":"ultra","description":"Maximum reasoning with automatic task delegation"}
]
context_window = 272000
```

Claude Code's own accepted set is narrower than Anthropic's API: `claude --effort <level>` documents
`(low, medium, high, xhigh, max)` — five, no `ultra`. `codex -c model_reasoning_effort=` accepts the
catalog's six. Jini's `claude.ts:42-44` and `:98-107` already match the CLI exactly and are correct;
only `codex.ts:93-101` is wrong (missing `max`, `ultra`).

---

## 5. Recommendation, with cost

**Do not build a general-purpose "live model list across all providers" tool.** It would need an API
key per provider (none exist on this machine today), and for two of the four surfaces it would return
a *different* list than the one the CLI will actually accept — the metered platform API and the
subscription CLI catalogs are genuinely different products. That is a real trap, not a hypothetical:
`gpt-6-astra` lives in the Codex backend catalog and would not appear in `api.openai.com/v1/models`.

Three targeted fixes instead, in value order. All are inside Jini; none touches a vendor CLI, and all
are consistent with the standing "no vendor CLIs as integration points — prefer REST" rule, since the
one new network call is a REST call, not a CLI shell-out.

| # | Fix | Effort | Why |
|---|---|---|---|
| **1** | Wire `claude.ts`'s `fetchModels` to the **existing** `listProviderModels({protocol:'anthropic', …})` when an Anthropic key is resolvable, keeping `CLAUDE_FALLBACK_MODELS` as the no-key path. | **~2-4 h** | The client already exists and is SSRF-guarded and tested — `providers/model-catalog.ts` already sends `x-api-key` + `anthropic-version: 2023-06-01` to `/v1/models?limit=1000` and parses `id` + `display_name`. This is a wiring job, not a new capability. It permanently ends the Fable-class staleness. **Caveat, and it is the reason this was rejected in Aug: the Local-CLI path's defining property is that it needs no API key.** Layer live discovery on top; never gate the picker on it. |
| **2** | Read `supported_reasoning_levels` out of the catalog JSON `parseCodexDebugModels` already parses, and surface per-model effort options instead of the static `codex.ts:93-101` array. Fix `'hidden'` → `'hide'` in the same pass. | **~2-3 h** | Zero new I/O — the data is already in memory and being discarded. Unlocks `max`/`ultra` on Astra and stops `gpt-reserve`/`codex-auto-review` leaking into the picker. Needs a per-model (not per-agent) effort shape, which `reasoningInModelId` already precedents for antigravity. |
| **3** | Refresh `CLAUDE_FALLBACK_MODELS` by hand now (add `claude-fable-5-1`, `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-4-6`). | **~20 min** | Stopgap only. Buys time for #1; does not fix the class of bug. Do it today regardless. |

Extending #1 to also read `capabilities.effort` — and thereby make the Claude effort picker live too —
adds roughly **1 h** on top of #1.

**Cost of doing nothing:** the Claude list goes stale at every model launch, silently. There is no test
and no gate that fails when it does; that is precisely why it took a human noticing "it doesn't say
Fable" to find it.

---

## 6. Could not verify, and where memory is now stale

### Could not verify

- **Neither live API call was made.** No Anthropic or OpenAI credential exists on this machine (see §3).
  Whether `claude-fable-5-1` appears in *this account's* `GET /v1/models` response is therefore
  **UNVERIFIED**, and so is the dispatcher's note that Fable 5.1 is gated on 30-day data retention.
  The docs' account-scoping language is quoted; the gating claim itself is not confirmed.
- **The exact Codex catalog URL is UNVERIFIED.** The binary's strings are concatenated blobs; the base
  (`https://chatgpt.com/backend-api/codex`, from the `chatgpt_base_url` config key) and the caching
  behaviour are confirmed, the precise path is not. `RUST_LOG=debug codex debug models` emitted nothing
  on stderr.
- **Not directly observed: what her screen actually showed, or when.** The reconstruction in §1 rests
  on timestamps — Codex CLI upgraded to 0.153.4 at **17:01** today, dev server up since **15:14**,
  Fable option answered at **14:59** — plus the upstream PR. It fits, but it is an inference.
  The Codex *TUI* `/model` picker was not driven interactively; its list is the same catalog, so it
  should now show Astra, but that is reasoned, not observed.
- **The 5 s `listModels` timeout is not a factor.** `codex debug models` ran in 0.17 s / 0.16 s / 0.19 s
  across three runs — nowhere near `codex.ts:74`'s budget. Ruled out, not left open.

### Memory notes now stale

- `reference_local_cli_model_and_effort_surfaces.md` — **still accurate**, with two corrections:
  `claude` is now **v2.1.261** (not 2.1.259) and `agy` is **1.1.27** (not 1.1.25). The claim
  "`claude` has no models subcommand" is re-verified against the live `--help`. Its statement that
  the embedded list is scrapable with `strings` is confirmed (that is how the Fable ids above were
  found), but it is now **the wrong technique** — `~/.claude.json`'s `additionalModelOptionsCache` is
  a clean, server-fetched JSON list sitting in plain sight.
- `reference_agy_mcp_env_and_model_flag.md` — probed at v1.1.24, now v1.1.27. `agy models` still
  returns the same 14 rows. Its "`fallbackModels` in the def is stale" finding still stands.
- `project_local_cli_model_list_no_discovery.md` (31 days old) — **materially stale in one clause.**
  Its point 4 says "No `ant` binary, no `~/.config/anthropic`, no `ANTHROPIC_API_KEY`" — all three
  still true. But its framing that no live-model route exists is now wrong in the way that matters:
  Tovu's own `listProviderModels` shipped and **is** a working live Anthropic `/v1/models` client
  (`apps/website/.../list-models.ts` → `providers/model-catalog.ts`). The owner's 2026-08-05 decision
  to "build the BYOK-shaped live call anyway" was carried out — for BYOK. Extending it to the Local
  CLI picker is recommendation #1 above, and the design constraints that note records (never gate the
  picker on a key; keep the fallback) still apply verbatim.

---

## Evidence appendix — commands run

All read-only. No CLI config, tooling config, or product code was modified.

```
codex --version                      → codex-cli 0.153.4
claude --version                     → 2.1.261 (Claude Code)
agy --version                        → 1.1.27
codex --help / codex debug --help    → command inventory
codex debug models                   → 8 models, 383 KB JSON
agy models                           → 14 rows
claude --help                        → command inventory (no `models`)
strings -a <claude 2.1.261 binary>   → embedded model ids incl. claude-fable-5-1
strings -a <codex rust binary>       → remote_models flag, models_cache.json, chatgpt_base_url
node <detectAgents via Tovu's symlinked dist>  → the admin picker's real payload
/usr/bin/time -p codex debug models  ×3        → 0.17 / 0.16 / 0.19 s
```

Machine headroom at start: `memory_pressure` free **68%**. Nothing was killed, signalled, or restarted;
the live dev server (pid 64043, up since 15:14) was left untouched.

## Sources

- [Anthropic — List Models](https://platform.claude.com/docs/en/api/models-list)
- [openai-node — `src/resources/models.ts`](https://raw.githubusercontent.com/openai/openai-node/master/src/resources/models.ts)
- [openai/codex PR #42874 — "[0.153 hotfix] Show Astra in bundled model picker"](https://github.com/openai/codex/pull/42874)
- [openai/codex issue #42868 — "Astra not showing on Codex Linux reliably"](https://github.com/openai/codex/issues/42868)
