# ADR-060: Runner's Unified Operator Chat

- Status: PROPOSED — requires owner sign-off before implementation.
- Date: 2026-08-29
- Author: Claude Sonnet 5 / Leon Aburime

## Context

Runner has two chats today, and `sections.ts`'s own header states why they must never
blur: the LEFT chat is Runner's fleet operator agent, every verb declared under a
`runner.` prefix (`Tovu-Runner/src/contracts/sections.ts:1-21`); the RIGHT chat is
Tovu's own admin assistant, arriving inside the embedded admin surface, and it owns one
site's content. `sections.ts:12-16` already fixes the direction of composition — "ADR-014
fixes the direction: Runner composes site tools plus its own; Tovu never imports Runner
tools" — and `Tovu-Runner/AGENTS.md:24` restates it as a hard invariant: "Never add an
unprefixed tool."

The operator wants one chat that can drive both. The motivating cases: push a shared
image library into three sites, and copy a Gemini key across the fleet. Neither is a
single-site operation, so neither chat can do it today — the LEFT chat has no site
tools, the RIGHT chat has no fleet awareness. This ADR decides how one chat gets both
without collapsing the boundary the prefix exists to enforce.

Two things that look like blockers are not. Transport: Runner is already Jini-native
(ADR-052) with its own `ToolExecutor` and allowlist. Auth: `tovu-openapi-mcp.ts:14-18`'s
converter still says Tovu's specs declare cookie auth and that Runner "has no wired auth
story against a live Tovu instance yet" — that comment predates SPEC-006 REQ-08 landing
(dated 2026-08-24 in the same file) and is now stale. Verified in source: `currentCredential()`
in `apps/website/src/server/inbound/admin-http/dev-auth.ts:166-189` tries the `tovu_session`
cookie first, falls through to the `Authorization` header, and calls `authenticateApiKey`
— both paths resolve to the same `PrincipalRecord`, so downstream `authorize()` is
untouched either way. `McpToolContext.authHeaders` was already the right shape once that
code shipped; the converter needs no redesign for auth. So the open question is not
"can Runner authenticate against Tovu" — it is "how does ~400 operations across N sites
become one usable chat, and who is allowed to mint the credential in the first place."

## Decision

**D1 — One chat, one namespace.** Every verb the unified chat can call still begins with
`runner.`. Site reach is delivered by Runner-owned verbs that call Tovu's HTTP API; Tovu
tool definitions are never registered into Runner's allowlist. `runnerToolNames()`
(`sections.ts:221-223`) stays the complete allowlist, unchanged in kind — still the sole
list `registerRunnerTools` iterates (`runner-tools.ts:39`, `~368`) — so "never add an
unprefixed tool" survives verbatim. The payoff is structural, not procedural: because
nothing from a site's OpenAPI catalog is ever registered on Tovu's side, `runner.*`
verbs leaking into Tovu's public visitor widget — the failure mode ADR-054 designed
against with a default-empty tool surface — is not a discipline Runner has to maintain
going forward. It is impossible by construction.

**D2 — The converter's output is a catalog, not a tool registry.** `tovu-openapi-mcp.ts`
is retained, but its product is used for schema validation and discovery, never handed
to the tool executor as registered `McpToolDef`s. That is what keeps Runner's tool count
flat as sites and operations grow. Measured, not estimated, over `Tovu/openapi/*.yaml`
(16 files): naive registration is 132 callable operations / 124 unique operationIds, 7
name collisions across files, and `x-status: planned` currently filters zero operations.
So one chat over 3 sites, composed naively, is 29 declared `runner.*` verbs (of which
only 8 are built — `runner-tools.ts`) plus 3×124 ≈ 400 callable tools, unfiltered,
including `delete_user`, `disable_user`, `delete_policy`, `delete_role`. That is not a
usable tool list for a model or an allowlist review.

Instead, two tiers:
- **Tier 1, curated fan-out verbs.** A small hand-picked set of `runner.*` verbs, each
  taking a project selector, owning fan-out and partial-failure reporting ("3 sites, 2
  succeeded, 1 failed"). A media-import verb and a settings/credential-propagation verb
  cover the two motivating cases. Runner owns these because the fan-out and its
  reporting are fleet semantics no single site's API expresses.
- **Tier 2, one generic escape hatch.** A single verb, `{ projectId, operationId, args
  }`, validated against the catalog, plus a companion discovery verb that searches it —
  progressive disclosure instead of registration. Tool count stays flat regardless of N
  sites × M operations, and every call still executes inside the `runner.` allowlist.

Name the cost honestly: Tier 2 is a coarser gate than per-tool registration. The
allowlist entry now reads "may call the Tovu admin API," not "may call `create_post`,"
so the operation-level allowlist has to move *inside* that verb — and because
`x-status: planned` filters nothing (measured above), an explicit deny/allow list of
destructive operations is a hard requirement of shipping Tier 2, not a follow-up.

## Per-project authentication

**D3.** Issuance is deliberately unreachable by an API key: `rejectApiKeyCredential()`
(`apps/website/src/server/inbound/admin-http/routes/api-keys/deps.ts:93`) 403s any
`create_principal`/`issue`/`revoke` call whose credential kind is `api_key`, on exactly
the reasoning Runner needs to inherit — its own doc comment: "any key holding
`apikey.manage` could issue itself a successor, and revoking the original would not end
the caller's access." So bootstrap must go through a real admin session: login → cookie
→ `create_api_key_principal` → `issue_api_key` → store the raw key → `Bearer` thereafter.
Runner never keeps a cookie jar past that exchange.

The trap: `TOVU_ADMIN_PASSWORD` only seeds a *new* database. `seedIdentity` looks up the
owner by username and returns early if it already exists (`@jini-ai/cms`'s
`identity/seed.js:181-190`) — it never re-hashes or updates the password on a later
boot. `wiring.ts:119-120` reads `ownerUsername`/`ownerPassword` from env with a fallback
(`DEFAULT_OWNER_PASSWORD`), but `buildTovuChildEnv()` (`Tovu-Runner/src/main/tovu-cli.ts:243-262`)
sets neither var today — verified in source. So every project Runner has ever created is
seeded `admin`/`tovu-dev`, permanently, exactly as ADR-052 recorded and accepted as a
deliberate v1 posture with a named tripwire. A per-spawn random password, the pattern
Runner already uses for `TOVU_AGENT_DAEMON_TOKEN` (`tovu-cli.ts:312-342`), does not
transfer here: it works exactly once, on first boot, and every later spawn presents a
password the database does not have.

The scheme has to branch on project age. New projects: Runner mints a random owner
password at provision time, sets it via `buildTovuChildEnv()`, and persists it in the
vault keyed by project id — *persisted*, not per-spawn like the daemon token, precisely
because this password has to survive to the next boot. Then the login → issue →
store-Bearer sequence above. Already-seeded projects — every project that exists today —
cannot be re-seeded; Runner adopts them by logging in with `admin`/`tovu-dev`, issuing a
key, and optionally rotating via `reset_user_password` (a live operation in
`openapi/006-identity-and-authorization.yaml`). `runner.apikey.issue`/`.list`/`.revoke`
are already declared and parked at `sections.ts:169`; this ADR is what unparks them —
"unpark" means building three verbs against zero existing implementation, not flipping a
flag, since only 8 of 29 declared `runner.*` verbs exist in `runner-tools.ts` today.

Authority bound, stated because it is easy to assume otherwise: `issue_api_key` snapshots
the requested policies, and INV-07 requires the issuer to hold every snapshotted
permission unconstrained. Runner's key can never exceed the owner it bootstrapped from —
it inherits `admin`'s ceiling, nothing more.

Storage and cleanup are not new work. `Tovu-Runner/src/main/secure-credentials.ts`
already exports `openCredentialVault`/`CredentialVault`, opened with graceful
degradation at `main.ts:212-228` when OS-backed encryption is unavailable (verified:
`main.ts` installs a throwing stub rather than failing boot), and `project-provisioner.ts:476`
already drops a project's vault secret on delete. The per-site API key generalizes an
existing lifecycle rather than inventing one.

## The right-hand chat

**D4.** A previous session left open whether to ask Tovu for a flag to suppress its
admin assistant chat inside the embedded webview; the flag does not exist — `serve`
takes only `--port` and `--workspace`. The agreed shape stands: any such flag must
target the admin assistant only, never the public visitor widget, and must not ship
until Runner's own chat actually has site tools — flip it earlier and Runner has no site
assistant of any kind for the gap between flipping and shipping Tier 1/Tier 2.

This ADR is that milestone's precondition, not its trigger: the tripwire to request the
flag from Tovu is Tier 1 + Tier 2 shipped and verified, not decided here. Runner's own
expand mode already behaves consistently with this — it hides Runner's own chat FAB when
the admin is full-window, deliberately, because two chat entry points with two different
owners is precisely the blur `sections.ts` warns against. The flag itself remains a
Tovu-side dependency this ADR requests, not one it decides unilaterally.

## Consequences

The stale auth-gap comment in `tovu-openapi-mcp.ts:14-18` should be corrected to state
that `McpToolContext.authHeaders` is already the right shape — named here as a
follow-up, not fixed by this ADR. The 7 operationId collisions the catalog measures are
not a Tier 2 blocker: `loadToolsFromOpenApiDirectory` already returns `duplicates`
explicitly (`tovu-openapi-mcp.ts:283-339`) rather than silently dropping them, which is
the groundwork the catalog needs, not new work.

Runner has zero automated test coverage today. A Tier 1 fan-out verb that can act
destructively across N sites lands on a codebase with no regression net for it — that
risk is inherent to this decision, not mitigated by anything in it. Only 8 of 29
declared `runner.*` verbs exist; unparking `runner.apikey.*` and building the two Tier 1
verbs is new implementation, not configuration. And the `admin`/`tovu-dev` default stays
live and reachable on every existing project until Runner's adoption flow actually runs
against it — this ADR does not retire that exposure, it routes around it.

## Open, assumed, or deferred

- Which operations belong on Tier 2's destructive deny-list is not enumerated here — it
  has to be, before Tier 2 ships, and is deferred to implementation rather than decided
  in this document.
- Whether the media-import and credential-propagation Tier 1 verbs need their own
  partial-failure UI in the chat transcript, or can reuse existing tool-result
  rendering, is unaddressed.
- SPEC-006 OQ-05 (cross-site identity federation, owner Leon Aburime, resolve-by
  2026-11-30) is the same open item ADR-052 carried forward. This ADR's Tier 1/Tier 2
  split is a narrower answer to a subset of it — fan-out orchestrated from Runner — not
  a resolution of federation itself.
- Whether BYOK/LLM provider secrets pool or isolate across the fleet — ADR-052 left this
  open with no evidence either way — is unchanged here; D3 covers the Tovu admin API
  key specifically, not provider credentials.
- The exact shape of `reset_user_password`'s rotation flow for adopted projects (who
  triggers it, automatic on first adoption vs. operator-invoked) is assumed but not
  designed here.

## Relates

ADR-052 (Runner is its own desktop product — the topology and Jini-native backend this
ADR builds on); ADR-048 (api-key issuance plumbing, treated here as shipped rather than
proposed); ADR-021 (identity & authorization — INV-07, the principal model); ADR-049
(assistant adopts the Jini kit — the `ToolExecutor`/`ToolPolicy` substrate `runner.*`
verbs run on); ADR-054 (public visitor assistant — the negative case D1's structural
argument contrasts against); ADR-014 (assistant profiles — the composition-direction
rule `sections.ts` implements); SPEC-006 (REQ-08 api-key auth; OQ-05 cross-site
federation).
