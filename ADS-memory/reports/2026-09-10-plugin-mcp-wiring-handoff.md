## UPDATE 2026-09-10 (later session): Phase 4 completed, branch green

A follow-on session ("plugin-mcp-wiring") completed everything under "What to build next" below,
per the owner's explicit resolution of the open question: **adoption replaces the hash-suffixed
fallback entirely — no fallback id was added.** The connection id is always the plugin's verbatim
sanitized server key.

Commit `e30548ea` ("feat(agent-plugins): implement adoption for MCP-federation id collisions") on
`restructure/apps-website-phased`:

- `federate-mcp.ts`: `provisionAgentPluginMcpServers` now branches an existing row into
  `alreadyProvisioned` (same plugin re-enabling) or `adopted` (operator's row, or a different
  plugin's) via a new `adoptOrRecognizeExistingAgentPluginMcpServer` helper. Adoption calls
  `deps.repo.upsert({ ...existing, provisionedByPluginId })` directly — never
  `saveExternalMcpServer` — so every other field is byte-identical. `ProvisionAgentPluginMcpServersResult`
  gained an `adopted: readonly string[]` bucket. Header doc rewritten to match (rule 1 section).
- `federate-mcp.unit.test.ts`: fully rewritten against the current single-arg
  `deriveAgentPluginConnectionId`/`provisionAgentPluginMcpServers` API. Proven RED-then-GREEN: the
  fix was temporarily reverted to the pre-fix HEAD version, the new tests were confirmed to fail (4
  failures, missing `adopted` semantics), then the fix was restored and all 15 tests passed. Includes
  the explicit regression test the owner asked for (operator's allowlist + write grants survive
  untouched, verified via byte-identical `deepStrictEqual` against the pre-existing raw record) and a
  two-plugins-same-key adoption test.
- `agent-plugin-set-enabled.integration.test.ts`: fixed the `enabled: true` → `enabled: false`
  assertion (rule 2); rewrote the "disabling deactivates..." test into "disabling never touches the
  row" with a byte-identical before/after comparison instead of a renamed copy of a stale assertion;
  added a new end-to-end adoption test driving the real PATCH route against a `saveExternalMcpServer`-
  seeded operator row.

Verified fresh, all commands run from repo root with `env -u TOVU_ADMIN_PASSWORD`:
- `federate-mcp.unit.test.ts`: 15/15 pass.
- `agent-plugin-set-enabled.integration.test.ts`: 11/11 pass.
- Full `agent-plugins` unit+integration suite (29 files): 318/318 pass.
- `external-mcp-store.test.ts` + `tool-registrations.external-mcp.test.ts`: 82/82 pass.
- `bundled-higgsfield-media-package.unit.test.ts`: 19/19 pass — confirms `SKILL.md` needed no edits.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run check:boundaries`: 19 errors / 202 warnings — unchanged baseline.
- `external-mcp-repo.sqlite.test.ts`: still 5/17 failing on the pre-existing `aadVersion`/
  `oauthAadVersion` fixture gap described below — confirmed unrelated and left untouched.

No locked file was touched (`git status` on the three changed paths only: `federate-mcp.ts`, its
unit test, and the set-enabled integration test). `uninstall.ts` and its two tests remain untracked
and untouched. `content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md` was not
edited.

Still open, unchanged from below: `plugins_set_enabled` (in-chat tool) MCP wiring gap, and the
`SKILL.md` Step-B content edit — both explicitly deferred, not part of this task.

---

# Plugin MCP wiring — handoff, 2026-09-10 (session ended mid-refinement)

Session ended on explicit user instruction ("commit what you have, end with a handoff") while
implementing the owner's second round of feedback. This is NOT a rotation-at-context-limit handoff —
it's a deliberate stop. Read this whole file before touching code; the last commit is intentionally
incomplete and its own commit message states that.

## Where things stand

Branch `restructure/apps-website-phased`, 5 commits, newest first:

1. `6c7f3c49` **wip(agent-plugins): rework MCP provisioning per owner's 3 collision rules (incomplete)**
   — the checkpoint this handoff is about. Read its full message; the summary below restates it.
2. `14b049e4` feat(higgsfield-media): declare the real MCP connection in mcp.json — done, solid.
3. `feaf69d0` feat(agent-plugins): wire auto-admitted plugin MCP servers into the external-MCP store
   — the ORIGINAL Phase 4 implementation. Superseded by commit 1's rework; its own tests
   (`federate-mcp.unit.test.ts`, 3 of the 10 tests in
   `agent-plugin-set-enabled.integration.test.ts`) are now STALE against commit 1's code — see below.
4. `58c77814` feat(agent-plugins): drop the unconditional MCP execute:unavailable rule — done, solid.
5. `003c6bed` feat(agent-plugins): parse full mcp.json transport config, not just server ids — done, solid.

Commits 2, 4, 5 (Phases 1, 2, 5 of the original dispatch) are finished and verified; nothing more is
needed there. Everything below is about commits 1 and 3 (Phase 4).

No locked file was touched by any commit (verified via `git log -- <path>` on each of the 8 files
named in the original dispatch's hard-constraint list, immediately after commit 3 and again now).

## The owner's three collision rules (from the team lead's "Phase 4 refinement" message)

1. **Never clobber an existing row.** A hand-created `higgsfield` row already exists on the live dev
   site, with connected OAuth tokens, an allowlist, and write grants earned over real work. Enabling
   the plugin must never overwrite any field of that row.
2. **Seed disabled, like `recordBundledAgentPluginIfAbsent` already does.** Idempotent,
   create-if-absent, and a provisioned row is never auto-enabled by this code — an operator must
   explicitly turn it on in Settings.
3. **Provisioning is not authorization.** `allowedToolNames`/`writeAllowedToolNames` start empty on
   a newly created row regardless of what the plugin's own content suggests. The operator ticks them
   in the existing tool picker.

Then the team lead's own review of commit 3 found two more things (their "Follow-up" message):

4. **The hashed connection id defeats the whole feature.** Federated tool ids are
   `mcp__<connectionId>__<remoteName>` (`mcp-federation/trust.ts:58`). Commit 3's
   `deriveAgentPluginConnectionId(pluginId, serverKey)` produced
   `ap-higgsfield-media-higgsfield-209b48` — so the agent would see
   `mcp__ap-higgsfield-media-higgsfield-209b48__generate_image`, which the plugin's own SKILL.md
   (written independently, ~15+ references) calls `mcp__higgsfield__generate_image`. No vendor could
   ever predict Tovu's hash suffix, so no vendor-authored plugin could document its own tool names —
   exactly the "guessing" problem this whole feature exists to remove. **Fix required:** the
   connection id must be the plugin's OWN declared server key, verbatim (sanitized), so it lines up
   with what a human — or a vendor's own docs — would expect. A hashed id should only ever be a
   FALLBACK, for a genuine conflict (see next item).
5. **Rule 1 needs a real "adoption" path, not just a skip.** If a row already exists at the derived
   id and this plugin did NOT provision it (an operator's own row, or nothing recorded), the correct
   behavior is to ADOPT it: leave every field exactly as it is (url, transport, auth mode, allowlist,
   write grants, every oauth/sealed column) but record that this plugin is now associated with it
   (`provisioned_by_plugin_id`), and report it as `adopted` rather than `applied`/`provisioned`. The
   owner's own configuration and live tokens outrank a package's declaration — that is rule 1, applied
   to the id-collision case specifically.

The team lead was explicit: **do not rewrite `SKILL.md`**. Items 4 and 5 together make its existing
`mcp__higgsfield__*` references and its `id: higgsfield` instruction correct again, with zero content
edits — that was the whole point of raising them. The team lead will route the "Step B is now
partially redundant" content note separately; that is not this task's job.

## What commit `6c7f3c49` actually did (2 of 3 original rules, 0 of 2 follow-up items)

`apps/website/src/features/agent-plugins/federate-mcp.ts` was substantially rewritten:

- `applyAgentPluginMcpFederation(deps, input)` → renamed **`provisionAgentPluginMcpServers(deps, input)`**.
  `input` dropped `enabled` entirely (the function is now only ever called on plugin ENABLE).
  Returns `{ provisioned, alreadyProvisioned, skipped, failed }` (was `{ applied, skipped, failed }`).
- `deriveAgentPluginConnectionId(pluginId, serverKey): string` → **`deriveAgentPluginConnectionId(serverKey): string | null`**
  (single arg, no plugin-id prefix, no hash suffix — just the sanitized server key; `null` when
  sanitization leaves nothing usable). **This is the change item 4 above asks to walk back partially**
  — the verbatim-key part is right, but the hash-suffix FALLBACK for a genuine conflict is gone
  entirely rather than demoted to a fallback. See "What to build next," step 1.
- `planAgentPluginMcpFederation(input)` — dropped `pluginId` from its input (no longer needed once
  the id doesn't depend on it); classification logic (stdio skip, sse skip, trust check) unchanged.
- Provisioning now checks `deps.repo.findByServerId` before ever calling `saveExternalMcpServer`; a
  hit is reported `alreadyProvisioned` and NOTHING is written — this satisfies rule 1's "never
  clobber" half, but not its "adopt and record association" half (item 5 above). A pre-existing
  operator row is currently left alone with NO provenance recorded, silently. That's safe, but
  incomplete against what was asked.
- A newly created row: `enabled: false` (rule 2), `allowedToolNames: ""` /
  `writeAllowedToolNames: ""` (rule 3), `provisionedByPluginId: input.pluginId` (new column, below).
- Full rationale, including the accepted race-condition disclosure (existence-check-then-create is
  not atomic; no compare-and-set primitive exists on `ExternalMcpServerRepoPort` for this, unlike
  `tryClaimOAuthRefreshLease`), is written into the file's own header — read it before changing
  the provisioning loop.

`apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts`: only calls
provisioning when `written.enabled === true`; disabling calls nothing now (previously it called
`applyAgentPluginMcpFederation` with `enabled: false` to deactivate the row — that whole code path is
gone, matching "the row survives disable").

**New DB column**, additive and already migrated:
- `apps/website/src/platform/db/schema.ts`: `externalMcpServers.provisionedByPluginId` (nullable
  `text`).
- Migration `apps/website/src/platform/db/drizzle/0061_aspiring_vulcan.sql`:
  `ALTER TABLE external_mcp_servers ADD provisioned_by_plugin_id text;` — generated via
  `npm run db:generate`, not hand-written. Journal/snapshot meta files committed alongside it.
- `ExternalMcpServerRecord`/`ExternalMcpServerView` (`assistant/external-mcp-store.ts`) both carry
  `provisionedByPluginId: string | null` now — the View exposes it so the admin UI CAN show it (no
  admin UI change was made to actually render it; that's presentational work, not done here).
- `SaveExternalMcpServerInput.provisionedByPluginId?: string` — tri-state like every other
  system-owned column here: absent preserves the existing value, present sets it. Only
  `federate-mcp.ts`'s creation call ever sets it; the admin PUT route and the assistant's
  `external_mcp_save` tool never send it, so an operator's own edits can't touch it.
- `SqliteExternalMcpServerRepo` (`platform/db/sqlite/external-mcp-repo.sqlite.ts`) maps the column
  both directions (`toRecord`, `upsert`'s `values`). `InMemoryExternalMcpServerRepo` needed no change
  (it spreads the whole record).

## What is BROKEN right now — run these before doing anything else

```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts
```
Fails to even IMPORT — `SyntaxError: ... does not provide an export named 'applyAgentPluginMcpFederation'`.
This whole file (committed in `feaf69d0`) still calls the OLD two-arg `deriveAgentPluginConnectionId`
and the OLD `applyAgentPluginMcpFederation` name/shape. It needs a full rewrite against the new API,
NOT a patch — the whole "what does a row look like after enabling" story changed (`enabled: false`
not `true`; `allowedToolNames`/`writeAllowedToolNames` always `""`; no more disable-deactivates path;
new `provisioned`/`alreadyProvisioned` result shape instead of `applied`).

```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts
```
9 of 10 pass. **1 genuinely fails**: "enabling a plugin with a declared remote MCP server federates it
into the external-MCP store" asserts `federated?.enabled === true`; it's `false` now (correct, per
rule 2 — the assertion is what's wrong). **1 passes but is now a false green**: "disabling deactivates
the plugin's federated MCP row without deleting it" still asserts `enabled === false` after a disable
— it passes only because the row was ALREADY `false` from creation, not because disabling did
anything (it does nothing now). Fix the assertion or the test silently stops testing what its name
claims — this is exactly the "green test that tolerates the bug" trap; do not just leave it green
because it happens to pass.

`(env -u TOVU_ADMIN_PASSWORD) TSX_TSCONFIG_PATH=... node --import tsx --test bundled-higgsfield-media-package.unit.test.ts`
— unaffected, still passes (it doesn't touch `federate-mcp.ts`'s changed API).

`npx tsc -p tsconfig.json --noEmit` — clean (tsc excludes test files, which is why the two broken
test files above didn't show up there).

Also **pre-existing, NOT caused by this work** (confirmed by running it before and after this
session's DB-schema change — the failure shape is identical either way):
```
env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  apps/website/src/platform/db/sqlite/__tests__/external-mcp-repo.sqlite.test.ts
```
5 of ~10 tests fail. Root cause: `makeRecord`/`makeOAuthRecord`'s fixture literals never set
`aadVersion`/`oauthAadVersion` (both required, non-optional fields on `ExternalMcpServerRecord`), so
every round-trip `deepStrictEqual` against the fixture fails once the real DB fills those columns
from their schema defaults. `tsc` doesn't check test files, so this was never caught. Worth its own
fix; unrelated to plugin MCP wiring — do not fold it into this task's scope, just don't be surprised
by it.

## What to build next, in order

1. **Add the hash-suffixed fallback to `deriveAgentPluginConnectionId` / the provisioning loop.**
   Try the verbatim sanitized server key first. In `provisionAgentPluginMcpServers`, when
   `findByServerId` finds a row at that id, check its `provisionedByPluginId`:
   - Matches `input.pluginId` already → this IS the row this same plugin provisioned before →
     `alreadyProvisioned` (current behavior is already correct for this case).
   - `null`, or a DIFFERENT plugin id → this is step 2's ADOPTION case (below), not a fallback-id
     case — do NOT mint a second id for it. A hashed fallback id is for the case where you want a
     genuinely SEPARATE row to coexist (e.g., operationally you decide adoption is wrong for some
     reason) — re-read the team lead's message before building this; it's possible items 4 and 5 are
     meant to fully replace the need for a fallback id (adopt instead of shadow), in which case step
     1 here may reduce to just "verbatim id, no fallback, no hash" and the "fallback" language in the
     team lead's message is about the OLD hashed scheme being demoted to unused/removed rather than
     kept as a real second path. Confirm which reading is intended before implementing both a
     fallback AND adoption — implementing both may be redundant.
2. **Implement adoption.** When `findByServerId` finds a row whose `provisionedByPluginId` is `null`
   or a different plugin's id: do NOT call `saveExternalMcpServer` (it doesn't have a way to leave
   literally every field untouched while changing just one — even its tri-state fields have defaults
   the caller must resolve). Instead call `deps.repo.upsert({ ...existing, provisionedByPluginId: input.pluginId })`
   directly against the repo port — the raw record, spread, with only that one field changed. Add a
   new result bucket, `adopted: readonly string[]`, distinct from `provisioned`/`alreadyProvisioned`.
3. **Write the regression test the team lead explicitly asked for**, RED first: seed an
   `ExternalMcpServerRecord` via the real store (not a hand-built literal — use `saveExternalMcpServer`
   itself, the way an operator's PUT route would, with a real allowlist/write-grant/oauth config
   set), then call `provisionAgentPluginMcpServers` for a plugin declaring that same server key, then
   assert every field of the pre-existing row is byte-identical except `provisionedByPluginId`. Put
   this in `federate-mcp.unit.test.ts` alongside the rewrite in step 4.
4. **Rewrite `federate-mcp.unit.test.ts`** against the current API (this file, post steps 1–3):
   `deriveAgentPluginConnectionId(serverKey)` single-arg tests, `provisionAgentPluginMcpServers`
   tests (`provisioned`/`alreadyProvisioned`/`adopted` result shape), the adoption regression test
   from step 3, and a test proving the SAME server key across two different plugins now means the
   SECOND one adopts (or falls back, depending on how step 1 resolves) rather than silently losing
   its association.
5. **Fix the two tests in `agent-plugin-set-enabled.integration.test.ts`** named above under "What is
   BROKEN": the `enabled: true` assertion → `enabled: false`; the disable test → either delete it (if
   there's truly nothing left to test once disable is a no-op) or repoint it at proving explicitly
   that disable does NOT touch the row (read it before disable, disable, read it again, assert byte-
   identical) — that's a real, meaningful assertion, not a renamed copy of the current one. Consider
   adding the adoption case here too, end-to-end through the real route, mirroring how the original
   Phase 4 tests proved federation end-to-end rather than only at the unit level.
6. Re-run every command in "What is BROKEN" above plus `npx tsc -p tsconfig.json --noEmit` and
   `npm run check:boundaries` (expect the same 19-error/202-warning baseline this session already
   confirmed twice; if it changed, something in this file's imports moved outside the existing
   `federate-mcp.ts → assistant/index.ts` exemption — re-verify with the plant/confirm/revert ritual
   this file's own header in `.dependency-cruiser.mjs` documents before adding a second exemption).
7. Commit with `git commit -F <unique-msgfile> -- <explicit paths>` — same shared-tree discipline as
   every commit in this session. Do not touch the locked-file list (unchanged from the original
   dispatch): `apps/website/src/assistant/tool-registrations.ts`,
   `apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts`,
   `apps/website/src/features/agent-plugins/tool-registrations.ts`,
   `apps/website/src/features/agent-plugins/activation.ts`,
   `apps/website/src/features/agent-plugins/__tests__/unit/activation.unit.test.ts`,
   `apps/website/src/features/forms/tool-registrations.ts`,
   `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`, `development/todos.md`.
   Also leave alone (another session's own in-flight, untracked work, unrelated to this task):
   `apps/website/src/features/agent-plugins/uninstall.ts` and its two test files. It does not
   currently touch `external_mcp_servers` at all (checked via grep) — `federate-mcp.ts`'s own header
   already states the "row survives uninstall" position; there's no code there to reconcile with yet.

## Also still open (agreed follow-ups, not this task)

- `plugins_set_enabled` (`features/plugin-runtime/tool-registrations.ts`, the assistant's own in-chat
  enable/disable tool) does not call `provisionAgentPluginMcpServers` at all — only the admin route
  does. Team lead confirmed this is a real, separate follow-up, not to be picked up now.
- `SKILL.md`'s "Connecting from zero" Step B (manually calling `external_mcp_save`) becomes partially
  redundant once provisioning auto-creates the row — the team lead is routing that content edit
  separately. Do not touch `content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md`
  as part of this task.
- Admin UI: `ExternalMcpServerView.provisionedByPluginId` is now in the read model, but nothing
  renders it in the Settings → External MCP tab. Presentational follow-up, not scoped here.
