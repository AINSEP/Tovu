# Models, plans, and credits

Everything here was observed against the live connected Higgsfield account on 2026-09-09. Where a
fact is about *this* account rather than about Higgsfield in general, it says so.

---

## `models_explore` — what it actually answers

`mcp__higgsfield__models_explore` takes an `action`:

| action | Use it for |
|---|---|
| `recommend` | "which model suits this goal" — pass `query` plus input context |
| `get` | one model's constraints (`model_id` required) |
| `list` / `search` | browsing the catalog |

Useful filters: `type` (`image` / `video` / `audio` / `3d`) and `input` (`text` for text-only,
`image` for models that accept reference media). For a plain text prompt with no reference image,
`{"action":"recommend","type":"image","input":"text"}` is the right query.

Each returned item carries its own `aspect_ratios`, `parameters`, and durations. Some carry
`supports_unlim` — see below, and do not read it as "this is free for me."

**`models_explore` is read-only and needs no write grant.** Only `generate_image` does.

---

## Cost preflight: `get_cost`

`generate_image` accepts `get_cost: true` inside `params`. It prices the request and **submits
nothing**:

```json
{ "params": { "model": "recraft_v4_1", "prompt": "…", "get_cost": true } }
```

Observed response:

```
Cost preflight for recraft_v4_1: 1.25 credits (1.25 exact). No job submitted.
```

with `structuredContent.cost = { credits: 1.25, credits_exact: 1.25 }`.

Use it when the operator asks what something will cost, or before a model you have not used
before. It is the one call in this integration that is guaranteed free of side effects.

**A successful preflight does not mean the generation will be accepted.** On this account the
preflight for `recraft_v4_1` succeeded *and the submit that followed it was refused* by the plan
gate. Preflight proves the connection, the auth, and the model id are all fine. It says nothing
about the account's entitlement to start a job.

---

## The plan gate

Some models are refused at submit time with exactly this:

```
Error starting generation: Requires basic plan or higher.
```

The structured payload carries `monetization_intent: "upgrade"`, a `recovery_tool` of
`show_plans_and_credits`, and a `request_id`.

Observed on the connected account, 2026-09-09:

| Model | Preflight | Submit |
|---|---|---|
| `gpt_image_2` (Higgsfield's own stated default) | — | ✗ Requires basic plan or higher |
| `recraft_v4_1` | ✓ 1.25 credits | ✗ Requires basic plan or higher |
| `z_image` | — | ✓ Job submitted, image delivered |

### How to read this correctly

**It is an account gate, not a model gate.** Two different models from two different providers
returning the *identical* message is the tell. Do not conclude "that model id is wrong" or "the
Higgsfield connection is broken" — the connection is demonstrably fine, because the preflight on
the same model in the same session succeeded.

**Do not retry it.** The account's plan does not change between two tool calls.

**Try a model that is not gated before you escalate.** `z_image` is the one verified to work on
this account. This is worth one attempt, and it is the difference between delivering the image
and handing the operator a bill.

**If everything is gated, stop and ask.** Present it as a real choice — upgrading the Higgsfield
plan is the operator's money. Note that `show_plans_and_credits`, the recovery tool Higgsfield
itself names, is **not in this deployment's operator allowlist**, so you cannot call it. Say what
you found and let them decide.

---

## The free-trial "unlim" allowance is not a fallback

`models_explore` reports a top-level `unlim` block, and items may carry `supports_unlim`. On this
account it reports:

```
unlim: { available: false }
```

with the server's own note that unlim is *"not spendable right now"* and that passing `use_unlim`
returns a typed rejection rather than a generation.

So: **`supports_unlim` on a model does not mean you can use it.** The model-level flag says the
model *accepts* unlim generations; the top-level `available` says whether this caller can spend
any. Read the top-level one. When it is `false`, `use_unlim` is not an escape from the plan gate
— it is a second, differently-worded refusal.

Note also that `use_unlim` caps `count` to 1 regardless of what you asked for.

---

## What is and is not enabled here

The operator's allowlist for this connection currently admits seven Higgsfield tools:
`generate_image`, `models_explore`, `job_status`, `jobs_wait`, `show_generations`,
`reveal_generation`, `show_generation_by_ids`. Of those, two carry the write grant:
`generate_image` and `reveal_generation`.

Everything else Higgsfield advertises — video generation, upscaling, billing, TikTok publishing,
website deployment, sandbox execution, and the rest — is refused `not-in-operator-allowlist` and
does not exist from inside a run. **This is normal and correct**, not a misconfiguration: a
default-deny allowlist against a server that advertises tens of tools is the posture working as
designed. Do not report those absences as problems, and do not ask the operator to widen the
allowlist unless they have asked for a capability that genuinely needs it.

**Video is not covered by this plugin.** `generate_video` is not allowlisted, so the chain in
SKILL.md is image-only. `media_import_from_url` itself does accept `video/mp4` and `video/webm`,
so nothing in Tovu blocks video — the gap is on the allowlist side, and widening it is an
operator decision.
