# "Test connection" fails on Gemini thinking models — 2xx with no assistant text

Date: 2026-08-04. Agent: Web Design (Direct). Repos: `Jini` (fix), `Tovu` (symptom surface).
Status: **fix landed in Jini, tested; not yet confirmed against a live Gemini key.**

## Symptom

On `/admin/ai-assistant` → Visitor's AI Assistant, with a key that provably works:

- `Test Key` → "Key works — 42 models available."
- `Test connection` → **"Provider returned a 2xx response without assistant text"**

Two controls hitting the same provider with the same credential, disagreeing. The message reads as
"your key is bad", which it is not.

## Diagnosis

`Jini/packages/agent-runtime/src/providers/connection-test.ts` sends a smoke prompt ("Reply with
only: ok") and requires the reply to be exactly `ok`. Three separate things broke it on Gemini 2.5:

1. **`CONNECTION_TEST_MAX_TOKENS = 64`.** On Gemini 2.5 models, thinking tokens bill against
   `maxOutputTokens`. Their dynamic thinking budget routinely exceeds 64 on its own, so the model
   spends the entire allowance thinking, stops at `finishReason: MAX_TOKENS`, and returns a 2xx
   candidate with **no `content.parts` at all**. `extractText` returns `''` → that message.
   The constant's own comment anticipated exactly this case ("a reasoning model can spend the first
   few dozen tokens on hidden reasoning") and picked a number an order of magnitude too small.
2. **Thought parts were joined into the answer.** Gemini 2.5 returns hidden reasoning as ordinary
   parts flagged `thought: true`, interleaved with the real answer. The google `extractText` mapped
   every part's `text` and joined them, so even with enough budget a correct answer arrived as
   `"<paragraph of reasoning>ok"`, which the exact-match smoke check rejects. **This second failure
   was latent behind the first** — raising the budget alone would have swapped one wrong error
   message for another.
3. **The failure message named only the symptom.** No stop reason, so a too-small budget, a safety
   block, and a broken endpoint were indistinguishable to the operator.

## Fix

All three, in `connection-test.ts`:

| | |
|---|---|
| `CONNECTION_TEST_MAX_TOKENS` | 64 → **512** |
| google `extractText` | filters `thought: true` parts before joining |
| no-text failure detail | appends `(finish reason: …)` via a new `extractFinishReason` |

**Not** fixed with `generationConfig.thinkingConfig.thinkingBudget: 0`, which is the precise
Gemini-2.5 lever: that field is 2.5-only and the Gemini API rejects unknown `generationConfig`
members, so it would fix current models by breaking older ones. A larger ceiling is
provider-agnostic and is a ceiling, not a spend.

## Tests

3 added to `packages/agent-runtime/src/providers/__tests__/connection-test.test.ts`; suite 23/23.
**All 3 verified to FAIL against the pre-fix source**, not merely to pass — the budget assertion,
the thought-part join, and the missing stop reason each reproduce independently.

## Open — needs a real key

The diagnosis is derived from the code path and Gemini's documented thinking-token accounting, and
is **not** confirmed against live Gemini traffic; no key was available to this session. One command
settles it:

```
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H "x-goog-api-key: $KEY" -H "content-type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Reply with only: ok"}]}],"generationConfig":{"maxOutputTokens":64}}'
```

`finishReason: MAX_TOKENS` with no `parts` confirms cause 1. Re-run with `512` to confirm the fix
and to see whether `thought: true` parts appear (cause 2).

Per `2026-08-04-handoff-visitor-assistant-key.md` risk 5 — dated provider measurements go stale in
days. Re-measure before trusting this note's numbers.

## Landed alongside (same session)

- **`ByokProviderForm` Model field** now renders `SearchableModelSelect` when live discovery returns
  models, falling back to the old text input + `<datalist>` when it does not. The datalist was
  invisible until the operator typed, so a 42-model discovery showed an empty box. Free-text entry
  survives via the existing `CUSTOM_MODEL_SENTINEL` pattern. `features/execution` 160/160.
- **`ByokProviderForm` gained an `apiKeyFooter` slot** so a host can put controls directly under the
  API-key field. Omitted by every existing caller; output byte-identical without it.

## ⚠️ Shared-tree note

`connection-test.ts` already carried **another session's uncommitted empty-key guard** (5 tests) when
this session started. It is preserved and is part of the same working-tree diff. Whoever commits this
file is committing both changes — do not assume the diff is only the thinking-token fix.
