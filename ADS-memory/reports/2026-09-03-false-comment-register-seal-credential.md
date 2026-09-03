# False-Comment Register — Seal / AAD / Credential Surface (2026-09-03)

Audit scope: comments on the seal/AAD/credential/secret-handling surface (`features/webhooks/**`,
`assistant/*credential*`/`*aad*`/`*oauth*`, `features/*credentials*/**`, `platform/connectors/**`)
asserting something that can be verified true or false — gap-closed claims, "only
caller"/"exactly N" counts, file/path citations, `@complexity` claims. Dispatched by the
complexity-refactor coordinator as a follow-on to the `ports.ts` false claim found while auditing
`features/webhooks/**` for complexity (batch C, commit `c7bba21a`).

**Method:** every row below was proved or disproved by running the code, grepping call sites, or
`git log`/`git show` — not by inference. Candidates checked and found accurate (i.e., the comment
holds) are listed at the bottom under "Checked, found accurate" so the negative results aren't lost
and nobody re-derives them.

**Related registers** (broader scope, not seal/credential-specific — cross-referenced, not
duplicated): `ADS-memory/reports/2026-08-20-false-code-comments-register.md`,
`ADS-memory/reports/stale-docs/2026-09-02-tovu.md`. The second one is itself a source for finding #1
below — see that row's provenance.

## Findings

### 1. `apps/website/src/features/webhooks/ports.ts:119-124` — `external_mcp_servers` claim is stale by 13 minutes

**Claim (current text, unchanged since commit `d7ee9a6d`, 2026-09-02 13:16:29):**
> "...the real current total at nine stores passing `aad` at seal time, not five. And
> `assistant/external-mcp-store.ts` — the `external_mcp_servers` table — still seals with NO aad on
> either of its two call sites as of this writing: `deps.sealer.seal(...)` at
> `external-mcp-store.ts:1272` (server env) and `:1421` (OAuth payload); it was never touched by the
> AAD gap closure."

**Evidence it is false:**
- `npm run --silent check:seal-aad` exits 0 today: *"OK: every SecretSealerPort.seal() call site
  under apps/website/src supplies aad."* — this is the live AST-based enforcement check for exactly
  this invariant (`seal-aad-invariant.ts`), and it passes.
- Direct read of `apps/website/src/assistant/external-mcp-store.ts`: the env-seal call (now
  ~line 1346) passes `aad: buildExternalMcpEnvAad(identity)`; the OAuth-seal call (now ~line 1571)
  passes `aad: buildExternalMcpOAuthAad(identity)`. Both call sites pass `aad`.
- `git log --oneline -- apps/website/src/assistant/external-mcp-store.ts` shows commit `e3cb674a`
  **"fix(security): bind AAD to external_mcp_servers, the tenth store that sealed with none"**,
  committed 2026-09-02 **13:29:16** — 13 minutes *after* `d7ee9a6d` (13:16:29), the commit whose own
  message was "docs: fix stale comment/doc claims found in stale-docs audit" and which wrote the
  exact wording quoted above, sourced from `ADS-memory/reports/stale-docs/2026-09-02-tovu.md`. That
  report's own line 23-26 carries the identical now-stale claim — it was accurate when written, and
  went stale in the same session, before the doc-fix commit that recorded it was even a day old.

**Corrected wording proposed** (preserves the rationale — "not every credential-shaped table is
obligated to pass aad, only every one that has an obvious row identity to bind" — updates only the
now-false factual claim):
> "As of the 2026-09-02 AAD gap closure (`ffb5ce44`, five stores) plus the four that already sealed
> with `aad` before that change (`vendor-credentials/store.ts`, `custom-credentials/store.ts`,
> `source-control/store.ts`, `deployments/publish-credentials/store.ts`) plus `external-mcp-store.ts`
> (`e3cb674a`, 2026-09-02), all ten credential-shaped tables in this codebase now seal with an aad.
> `aad` stays optional at the port level regardless: a table with no natural row identity to bind is
> still free to seal with none — this just records that none currently do."

**Status:** FIXED in commit (see below) — `features/webhooks/ports.ts` is mine to fix per dispatch.

### 2. `apps/website/src/features/webhooks/agent-tools.ts:8,12` — two dead path citations, post-restructure

**Claim:** "Every entry maps 1:1 onto a real admin HTTP route already exposed to a human operator
(`server/routes/admin/integrations/*.ts`)" and "`server/routes/admin/integrations/` exposes exactly
5 routes... see `server/http/admin/integrations.ts`'s own header for why there is nothing to redact."

**Evidence it is false:**
- `find apps/website/src -path "*routes/admin/integrations*"` returns nothing at the cited path.
  The real path (confirmed to exist, 5 route files) is
  `apps/website/src/server/inbound/admin-http/routes/integrations/{list,create,pause,delete,deliveries}.ts`
  — moved by the 2026-09-02 `apps/website` restructure (`708e81b2`/`3d73b323`), same trap
  `check-src-complexity-drift.ts`'s own header documents fixing for its `SCOPES` list on the same
  date.
- `find apps/website/src -ipath "*http/admin/integrations*"` returns **nothing at all** —
  `server/http/admin/integrations.ts` does not exist anywhere in the tree (not just moved; the
  citation itself appears to predate a further rename/split into the per-route files above, since
  there is no single file left holding "one header" for the whole route group).

**What's still true (checked, not just assumed):** the substantive claims hold — exactly 5 route
files exist at the real path (`list.ts`, `create.ts`, `pause.ts`, `delete.ts`, `deliveries.ts`;
`deps.ts` is DI wiring, not a route); `pause.ts` does handle both directions (`{ paused?: boolean }`,
confirmed by reading it); no `update.ts`/PATCH/PUT handler exists anywhere under that directory
(`find` for `*integrations*update*` under `apps/website/src` returns nothing) — the "deliberately
absent: subscription UPDATE" claim is still accurate.

**Corrected wording proposed:** replace both citations with the real path
(`server/inbound/admin-http/routes/integrations/*.ts`) and drop the `server/http/admin/integrations.ts`
citation (point instead at `apps/website/src/features/webhooks/types.ts`'s
`WebhookSubscriptionRecord` — the actual place that documents "no secret field" — since no single
route-group header file exists to cite).

**Status:** FIXED in commit — `features/webhooks/agent-tools.ts` is mine.

### 3. `apps/website/src/features/webhooks/index.ts:39-41,77-80` — three more dead path citations, same restructure

**Claim:** "the first landed consumer is the admin HTTP API (`src/server/routes/admin/integrations`)"
and (twice) "wired into the real composition root at `server/deps.ts`."

**Evidence it is false:** same restructure as finding #2.
- `src/server/routes/admin/integrations` — stale; real path is
  `apps/website/src/server/inbound/admin-http/routes/integrations`.
- `server/deps.ts` (bare) does not exist — `find apps/website/src/server -iname deps.ts` lists 21
  route-scoped `deps.ts` files plus the actual composition root, which is
  `apps/website/src/server/runtime/composition/deps.ts`.

**What's still true:** the substantive wiring claim holds —
`apps/website/src/server/runtime/composition/deps.ts:83,1243-1244` does import and instantiate
`SqliteWebhookSubscriptionRepo`/`SqliteWebhookDeliveryRepo` from `platform/db/sqlite/webhook-repo.sqlite.ts`,
exactly as claimed.

**Corrected wording proposed:** replace `src/server/routes/admin/integrations` with
`apps/website/src/server/inbound/admin-http/routes/integrations`, and both `server/deps.ts`
citations with `apps/website/src/server/runtime/composition/deps.ts`.

**Status:** FIXED in commit — `features/webhooks/index.ts` is mine.

## Checked, found accurate (negative results — do not re-derive)

- `apps/website/src/features/source-control/store.ts:425` — "this feature's only caller runs inside
  `agent-daemon-server.ts`". `agent-daemon-server.ts` exists at
  `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`. `commitSiteToSourceControl` is
  referenced in 6 files, but grepping actual call sites (not comment mentions) shows exactly one
  runtime call: `features/source-control/tool-registrations.ts:462`, an agent-tool handler executed
  by the daemon process. Claim holds.
- `apps/website/src/assistant/external-mcp-store.ts:576` — "`connected` is written by exactly one
  place, `persistTokens`". Confirmed: `oauthStatus: "connected"` is assigned exactly once in the
  whole surface, at `external-mcp-oauth.ts:636`, inside `persistTokens` (`external-mcp-oauth.ts:614`).
  Claim holds.
- `apps/website/src/assistant/external-mcp-store.ts:1292-1294` — `MAX_SERVERS_PER_WORKSPACE` enforced
  "for a NEW server only". Confirmed: `assertUnderExternalMcpServerCap` early-returns when `existing`
  is non-null, only counting/capping on the create path. Claim holds.
- `apps/website/src/platform/connectors/composio-config-store.ts:75-76` —
  `updateAuthConfigIdsIfGenerationMatches`'s "ids belong to a key this workspace no longer has" /
  compare-and-swap description. Read against the implementation; matches exactly (column-scoped
  write, conditional on `expectedGeneration`). Claim holds.

## Not evaluated (out of primary scope, report-only, no other agent currently owns them per the
dispatch's off-limits list, but not exhaustively swept)

`assistant/execution-credential-*.ts`, `assistant/site-credential-*.ts`,
`features/media/provider-credential-store.ts`, `features/deployments/publish-credentials/*.ts`,
`platform/connectors/connector-credential-store.ts` carry many `@complexity O(1)`/`O(n)` and
ADR-citation comments that were grep-surfaced but not individually re-derived — most are simple,
plausible, and not the "asserts a fact about the codebase's own shape" pattern that decays (see
`reference_false_comment_register` memory's taxonomy). If a future audit continues this surface,
start there.

**Tangential, not a code comment, not fixed:** `development/todos.md:1475-1490`'s sealed-credential-
store table still cites pre-restructure `src/platform/db/sqlite/...` paths (same restructure-staleness
pattern as findings #2/#3) alongside its own 2026-09-02 "real total is ten" correction. Out of scope
for this audit (planning doc, not source, not owned by this dispatch) — flagging for whoever next
touches `todos.md`.
