# Brief — BYOK is broken: Gemini model discovery fails, and BYOK reports "not configured"

**Read `../RUN-PROTOCOL.md` in full first.** It is mandatory and covers the branch, the run log, the
commit/push discipline, and the evidence standard. Everything below assumes it.

- **Run log path:** `ADS-memory/reports/cloud-runs/2026-08-04-byok-fix.md`
- **Fallback branch if push is rejected:** `fix-byok-gemini-models` (in whichever repo is rejected)
- **Deliverables:** the code fix (both repos as needed) + a findings note at
  `ADS-memory/reports/findings/2026-08-04-byok-gemini-model-discovery.md` in Tovu

## Bootstrap

1. Read `AI-Dev-Shop/agents/programmer/skills.md` in the Tovu repo before any work. If missing, log
   and STOP.
2. Confirm persona load in your first line of output.
3. Do NOT read `AI-Dev-Shop/AGENTS.md` or the root `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>` marker
   exempts you.

## The two symptoms, as the owner sees them

**Symptom 1 — Gemini model discovery.** Admin → assistant execution settings → BYOK tab → Google
Gemini protocol. API key is saved (field shows a masked value), Base URL is the default
`https://generativelanguage.googleapis.com`, Model is `gemini-2.5-flash`. Under the Model field, in
red:

> Could not load live models: Method doesn't allow unregistered callers (callers without established
> identity). Please use API Key or other form of API consumer identity to call this API.

And yet, on the same screen, **"Test connection" reports "valid completion" in green.** So the same
visible configuration succeeds for a completion and fails for model listing.

**Symptom 2 — readiness.** In the execution-mode picker (the panel listing Local CLI / Antigravity /
Claude Code / Codex CLI / OpenCode), the row **"Use API · BYOK" is greyed out and labelled "not
configured"**, even though a Gemini key is saved. Local CLI is active instead.

## My hypothesis — verify or refute it, do not assume it

Both symptoms may share one root cause. Treat this as a lead, not a finding.

**Symptom 1.** `googleProviderModelsUrl` (Jini: `packages/agent-runtime/src/providers/google.ts:43-47`)
builds `…/v1beta/models?key=<apiKey>`, and `providerModelsHeaders` returns `{}` for the `google`
protocol (`providers/model-catalog.ts`) — so for Gemini the key travels **only** in that query param.
If `apiKey` is empty the URL becomes `?key=`, and "Method doesn't allow unregistered callers" is
precisely what Google answers an unauthenticated caller. **So the key is very likely empty by the time
it reaches this function.**

Why it could be empty here but not for Test connection:
`apps/admin/src/lib/execution-settings.ts:82` states the **browser-local store is the source of truth
for `apiKey` — "the ledger never sees it."** Both `testConnection` (`:390`) and `listModels` (`:405`)
read `config.apiKey` from the same `ByokConfig` shape, so the divergence is most likely in **which
config object each call site passes**: a manual button click plausibly uses live form state, while
automatic model discovery may use a config assembled from the ledger, which structurally cannot carry
the key. **I read the port, not the callers — confirming this is your first job.**

Reinforcing: the server route `src/server/routes/admin/assistant/list-models.ts` validates `protocol`
and requires `baseUrl`, but **never checks that `apiKey` is non-empty** — an empty key sails straight
through to the provider and produces this exact upstream error instead of a clear local one.

**Symptom 2** falls out of the same fact: if BYOK readiness is computed server-side from the ledger,
and the key only ever exists in browser-local storage, the server can never see a key and must always
report "not configured". Find the actual predicate that produces that label and check.

## What to do

1. **Confirm or refute the diagnosis** with `file:line` evidence. Trace both call sites of
   `listModels` and `testConnection` in `apps/admin/`, and find what computes the "not configured"
   label. Log what you find, including if it contradicts me.
2. **Fix the real cause**, not the symptom. If the key genuinely cannot be available to the listing
   call given the browser-local design, then the fix is architectural — say so and propose the
   options rather than smuggling the key somewhere it should not go. The "key never persists to the
   ledger" property is deliberate; **do not break it** to make discovery work.
3. **Add a guard regardless:** an empty `apiKey` for a protocol that requires one should fail fast
   with a clear local message ("No API key — model discovery needs the key from this browser"), not
   be forwarded to the provider to produce a confusing upstream error. Anthropic and OpenAI have the
   same hole (`x-api-key: <empty>`, `Bearer <empty>`), so fix the class.
4. **Prove it with tests.** You have no browser and no real API key, so you **cannot** verify this
   end-to-end — say that plainly in your report rather than implying you did. What you can do: a test
   asserting the key actually reaches the outbound URL/headers for each protocol, and a test that an
   empty key is rejected locally with the clear message. Follow existing test style; see
   `providers/__tests__/model-catalog.test.ts` in Jini.
5. **Record OQ-1 evidence.** A separate open question asks whether the BYOK execution path normalizes
   tool calls the same way the daemon path does, across anthropic/openai/azure/google. You will be
   deep in this code — note anything relevant in your findings file. Do not go build it.

## Hard constraints

- **Never write a real API key into any file, test fixture, log, or commit.** Use obvious fakes.
- Do not weaken the SSRF guard or the secret-redaction in `connection-guard.ts`.
- Do not remove the "apiKey is never persisted server-side" property.
- Keep Jini product-neutral: no consuming product's name in source or comments (guard rule R5,
  `scripts/check-engine-boundaries.ts`).

## Setup — the parts a brief must never omit

- **Jini is a pnpm workspace** (`pnpm-workspace.yaml`): `pnpm install` at the Jini repo root.
- **Tovu is npm** (`package-lock.json`) and depends on Jini via `file:../Jini/packages/*`. The two
  repos are cloned as siblings, so those relative paths resolve — but **Tovu consumes Jini's built
  `dist/`, so you must rebuild any Jini package you change or your fix will not reach Tovu.**
- Run scoped tests only: `npm --prefix packages/<pkg> run test` in Jini for a single package. **Never
  run a full-suite `npm test`** — the owner has asked for this explicitly and repeatedly.
- If a setup step fails, log the exact command, exit code and stderr, then **commit whatever you have
  before trying to fix it.** Never gate a commit on a green suite.

## Findings note

Write `ADS-memory/reports/findings/2026-08-04-byok-gemini-model-discovery.md`: the confirmed root
cause with `file:line`, what you changed, what you could not verify (and why), what the owner must
check in a real browser, and any OQ-1 evidence. Per repo convention a findings entry is for a landed
fix — if you could not land one, say that at the top.

## Final report

Root cause (confirmed or refuted), files changed in each repo, tests added and whether they pass,
**what remains unverified**, and the commit shas / branches pushed in both repos.
