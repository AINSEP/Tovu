# Higgsfield → Media, end to end (2026-09-09)

**A real Higgsfield-generated image is in the Media library right now.** Asset
`c881a51f-5b41-4aec-b806-e5624e1e1208`, a 2048×1152 PNG, imported through the product path by the
assistant itself.

Commit: `b6d23d67` — `feat(agent-plugins): higgsfield-media, written from a real end-to-end run`.

---

## The headline correction: the brief's premise was stale

Two of the four phases were already done before I started, and the real blockers were different
from the ones the brief named. Stating this first because everything else follows from it.

| Brief's assumption | Reality |
|---|---|
| `generate_image` is blocked by a missing write grant | **Already fixed.** The grant was saved 2026-09-07T04:06Z and has been live since. |
| The silent refusal is the real defect, still open | **Already shipped 2026-09-06**, three sinks. I watched it work correctly. |
| The remaining gap is import-by-URL | Correct, and `media_import_from_url` works — but nobody had ever run the last hop. |

`development/todos.md` already recorded the refusal fix as SHIPPED. The brief's framing of it as
open was reading an older part of that file.

### What actually blocked it

Nothing in Tovu's configuration. Three things in the *shape of the integration*, none of which
anyone had written down:

1. **`generate_image` is asynchronous.** It returns a job id and `status: "pending"`, never an
   image. Every earlier attempt that "succeeded" had produced a job, not an asset.
2. **`job_status` with `sync: true` can never complete over federation.** See the bug below.
3. **Model choice is an account paywall.** `gpt_image_2` (Higgsfield's own default) and
   `recraft_v4_1` both fail at submit with `Error starting generation: Requires basic plan or
   higher.` `z_image` is not gated. This is the difference between the path working and not.

And one gap of execution: **the last hop had never been run.** Across the entire chat history
exactly one message ever contained a CloudFront URL (2026-09-07 04:43Z), and that run ended at an
`assistant_ask_choice` without importing. No Higgsfield image had ever reached Media.

---

## Phase 1 — the real run

Driven through the admin chat dock as an operator, in operator language:

> "Use Higgsfield to generate an image of a red fox sitting in a snowy pine forest at dawn, and
> then put the finished image into the Media library."

The assistant found `mcp__higgsfield__generate_image` on its own — `search_tools` ranked it **#1
at 33.1**, above `media_generate_asset` — which is by itself proof the write grant is live and the
tool is admitted. It then hit the plan gate on `gpt_image_2` and `recraft_v4_1`, ran a cost
preflight, correctly concluded *"account plan gate, not a model gate"*, and put a real choice to
the operator. **It did not invent a cause.** That is the 2026-09-06 defect, fixed, observed live.

I answered "stop, I'll upgrade myself" (declining to spend money on a different vendor), then
asked it to try `z_image` specifically. Full trace, from `chat.db` message
`a09a2514-8e0e-4585-b435-6926635ce36a` (`run_status: succeeded`):

| # | Call | Result |
|---|---|---|
| 1 | `mcp__higgsfield__generate_image` `{"params":{"model":"z_image","prompt":"A red fox sitting upright in a snowy pine forest at dawn…"}}` | `Submitted 1 job` — job `d98e3f52-9eb6-471d-927a-b005cd9f6bc6`, status `pending` |
| 2 | `mcp__higgsfield__job_status` `{"jobId":"d98e3f52-…"}` | `in_progress` |
| 3 | same | `in_progress` |
| 4 | same | `completed` + CloudFront URL |
| 5 | `media_import_from_url` with that URL + `filename`/`alt`/`caption`/`credit` | media `c881a51f-…` |

### Evidence, independently verified — not the tools' own say-so

- **Media row** `c881a51f-5b41-4aec-b806-e5624e1e1208`: title `red-fox-snowy-pine-forest-dawn`,
  credit `Generated with Higgsfield (z_image)`, `status = active`, `version = 1`, created
  `2026-09-10T00:58:28.852Z`. Library went **16 → 17** active items.
- **Blob on disk**:
  `sites/tovu-com/uploads/ws/workspace-local/blobs/09/0919769f3d59aa30ca1d6cff0df8c88f585032968ee6cd16cc0c880dd4257fd1`
  — `file` reports `PNG image data, 2048 x 1152, 8-bit/color RGB`, 3,419,670 bytes. `shasum -a 256`
  of the file equals the row's `source_sha256` exactly.
- **Byte-identity with the source**: I fetched the CloudFront URL myself — HTTP 200, 3,419,670
  bytes, sha256 `0919769f…`. Identical. Nothing was re-encoded or truncated on the way in.
- **Public rendition**: `https://localhost:3000/m/c881a51f-…/public.v1/image.webp` → **200
  image/webp**, 168,432 bytes.
- **I opened the PNG.** It is a real photorealistic image of red foxes in snow at dawn — not a
  placeholder, not an error page rendered as an image.

**No code change was required for Phase 1.** The fix had already landed; what was missing was
that nobody had walked the path.

---

## Phase 2 — nothing to build, and I confirmed why

Shipped 2026-09-06 (`0d9e41d5` model half, `37ac1943` operator half). Three sinks now exist:

- `server/inbound/assistant/federation-admissions-route.ts` → admin proxy →
  `ExternalMcpAdmissionsBanner` (Settings → External MCP), with a **"Restart the assistant"**
  button.
- `assistant/mcp-federation/refusal-notice.ts` — refusal text prepended to the system prompt,
  deliberately excluding routine `not-in-operator-allowlist` so the model is not trained to ignore
  the block.
- `assistant/federated-refusal-diagnosis.ts` — per-tool explanation.

I chose **not to build anything here**, because there was nothing left to build, and I verified
the behaviour rather than the code: the live run diagnosed a real vendor-side cause instead of
confabulating one.

---

## A real bug found, deliberately NOT fixed

**`apps/website/src/assistant/mcp-federation/bootstrap.ts:311`** constructs the hosted (HTTP/
streamable) MCP adapter with:

```ts
requestTimeoutMs: connection.config.connectTimeoutMs,   // 15_000
```

The stdio arm, twenty lines below at `:336`, correctly uses `callTimeoutMs` (30_000). But
`adapter.http.ts` applies its single `requestTimeoutMs` as the abort deadline for **every request
on the session** (`:207`), not just the handshake. The file's own comment justifies the choice on
handshake grounds — *"`connectTimeoutMs` is the right bound for it because the handshake IS the
connect"* — which is true of the handshake and false of every tool call after it.

**Consequences:**

- Every federated tool call over a hosted MCP connection is capped at **15 s**, not the configured
  30 s.
- `callTimeoutMs` is **dead configuration** on that transport.
- Higgsfield's `job_status` with `sync: true` — which its own tool description says polls
  server-side "for up to ~25s" — **can never succeed**. 25 > 15, always. Observed live:
  `mcp-federation: the request timed out after 15000ms`.

**Why I did not fix it:** it changes request-timeout behaviour for *every* hosted federated
connection, not just Higgsfield, in a security-adjacent module three other agents are working
around. That is the owner's call, not a side effect of a plugin task. The verified workaround
(poll without `sync`) works and is what the SKILL.md prescribes. The one-line change is
`connectTimeoutMs` → `callTimeoutMs` at `bootstrap.ts:311`, and it would need the handshake bound
kept separate.

**Related, still unowned:** on the delegated-tool path that same timeout surfaces to the model as
`daemon 500 on http://…: INTERNAL_ERROR: an internal error occurred` — the real reason is lost.
`todos.md` already lists this; I hit it again and it is documented in the plugin's failure modes
so the agent does not read a lost error message as a diagnosis.

---

## Phase 3 — the plugin

`content/agent-plugins/higgsfield-media/` — same structure as `tovu-deploy-fly`:

```
plugin.json
mcp.json                                  (mcpServers: {} — see below)
skills/higgsfield-media/SKILL.md
skills/higgsfield-media/references/models-and-plan-gates.md
skills/higgsfield-media/references/failure-modes.md
```

**`mcp.json` declares zero servers on purpose.** `capability-projection.ts` states that a plugin's
own `mcp.json` is not executable in this release, and the real connection is an OAuth-authenticated
row the operator creates in Settings → External MCP. Declaring `higgsfield` here would be inert
decoration that reads like a capability.

### Every claim, and how it was verified

| Claim in SKILL.md | How verified |
|---|---|
| `generate_image` returns a job id, not an image | Observed: `Submitted 1 job`, `status: "pending"` |
| Arguments nest under `params` | Observed call shape + live `describe_tool` schema |
| Poll `job_status` with `{jobId}`; honour `poll_after_seconds` | Observed 3 polls; flag in the live tool description |
| `sync: true` can never complete — ~25 s vs 15,000 ms | Higgsfield's own description ("up to ~25s") + observed `timed out after 15000ms` + `bootstrap.ts:311` read |
| Delegated path shows a bare `INTERNAL_ERROR` | Observed verbatim in the 2026-09-07 transcript |
| `gpt_image_2` / `recraft_v4_1` → `Requires basic plan or higher` | Observed verbatim, both models, 2026-09-09 |
| `z_image` works | Observed — it produced the asset |
| `get_cost: true` prices without submitting | Observed: `Cost preflight for recraft_v4_1: 1.25 credits… No job submitted.` |
| unlim `available: false`; `use_unlim` is not a fallback | Observed in the `models_explore` response |
| Write grant needs BOTH lists; refusal is `remote-declares-not-read-only` | `trust.ts:326` + the live DB row carrying the tool in both lists |
| UI label is a per-tool **"may write"** tick | `ExternalMcpToolPicker.tsx:110` (aria-label `Allow <tool> to make changes`) |
| Config read at daemon start; restart required | `trust.ts` R5 header + `ExternalMcpAdmissionsBanner.tsx:119` "Restart the assistant" |
| OAuth, short-lived; sign-in cannot happen in chat | DB row (`auth_mode: oauth`, ~24 h expiry) + `external_mcp_reauth_prompt`'s live description |
| `media_import_from_url` accepts only PNG/JPEG/GIF/WebP/AVIF/MP4/WebM, sniffed from bytes | Live tool description |
| `publicUrl` is `/m/<id>/public.v1/image.webp` and serves | Observed in the result + `curl` → 200 |
| Only 7 Higgsfield tools allowlisted; `show_plans_and_credits` is not | Live DB row's `allowed_tool_names` |

Nothing in the plugin asserts behaviour I did not observe. Where a fact is about *this account*
rather than Higgsfield in general (the plan gate, `z_image`), the reference file says so.

---

## Phase 4 — it seeds and it loads

- `bundled-inactive-gating.integration.test.ts` — **6/6 pass** with a third bundled plugin present.
  It did not need fixing: its assertions were already plugin-scoped rather than counted, from when
  `tovu-deploy-fly` was added. Its `failures` assertion also means it now proves `higgsfield-media`
  packs and installs cleanly.
- `bundled-higgsfield-media-package.unit.test.ts` — **16/16**. Manifest validity, packing with
  references, the content contract, and a check that **no file in the package carries credential
  material** (bearer tokens, `sk-`/`hf_` keys, `api_key:` assignments, PEM blocks).
- `bundled-higgsfield-media-injection.integration.test.ts` — **3/3**. Seeds INACTIVE with
  `origin: "bundled"`, `updatedBy: "system:seed"`; enabling it injects the **real** SKILL.md
  carrying all eight load-bearing claims; disabling withholds it with "not enabled", not "not
  installed".

Deliberately not a third copy of the gating suite — that mechanism is plugin-agnostic and already
covered. What is new here is that *this package's content* survives packing, content-addressed
install, and injection.

`npx tsc -p tsconfig.json --noEmit` → **exit 0**.

### Confirmed live, not only in tests

The running API rebooted at 01:16Z and seeded the plugin into the real workspace on its own.
`sites/tovu-com/agent-plugins/ws/workspace-local/activations.json` now carries:

```json
"higgsfield-media": {
  "enabled": false,
  "origin": "bundled",
  "updatedAt": "2026-09-10T01:16:38.898Z",
  "updatedBy": "system:seed"
}
```

Inactive, bundled, seeded by the system — identical in shape to how `site-compliance` and
`tovu-deploy-fly` arrived. Nothing was forced; the ordinary boot path did it.

---

## Still open

1. **`bootstrap.ts:311` timeout bug** — above. Not mine to land unilaterally.
2. **The bare `INTERNAL_ERROR` relay** on the delegated-tool path. Unowned, pre-existing.
3. ~~**One red test that is not mine.**~~ **RESOLVED by `fix-red-test-and-stale-docs` while I was
   writing this.** `bundled-tovu-deploy-fly-package.unit.test.ts` was failing on
   `expected: /Not boot-blocking/i` because commit `1ffbbccc` made all three secrets boot-blocking
   in that SKILL.md without updating the assertion. I did not touch it; I passed them the
   diagnosis and they rewrote the assertion to the new invariant rather than relaxing the regex.
   Full agent-plugins suite re-run after their fix: **252 tests, 252 pass, 0 fail.**
4. **The Higgsfield account is plan-limited.** `z_image` works; the better models need an upgrade.
   Nothing in Tovu can change that.

## One thing worth someone owning (not mine — `apps/admin`)

In the `assistant_ask_choice` dialog the assistant raised, the **pre-checked default was the
money-spending option** ("Generate it with Tovu's own `media_generate_asset` instead… costs real
money on that vendor's credential"). A spend-by-default radio is worth a look by whoever owns that
component.
