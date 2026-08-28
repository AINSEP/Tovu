# Schema decision: write-authorization storage shape, and whether it is per-user

- Date: 2026-08-26 · Author: Software Architect (+ Database persona) · Read-only, every claim cites `file:line`
- Governs: `implementation-outline.md` §3.5, §5 File Map, C-005/C-006, INV-002/INV-004, §12 Phase 2A
- Status: DECIDED (schema shape) + RECOMMENDED (attribution) + OWNER CALL (finer capability)

---

## Verdict

1. **Two columns, not a grants table.** `write_allowed_tool_names TEXT` beside `allowed_tool_names`,
   as the outline proposes. The outline reached the right answer with the wrong argument.
2. **C-001's runtime contract does not change either way.** The table shape was never a threat to it.
   The outline's headline defence of the column is therefore void.
3. **Not per-user.** But for a stronger reason than the Coordinator gave — per-user *admission* is
   structurally impossible in this daemon, and per-user *invocation* control **already exists**.
4. **Add attribution: two more plain columns.** `write_grants_updated_by_principal_id` +
   `write_grants_updated_at`. This is the real answer to the owner's audit question.

---

## Part 1 — Columns vs. a grants table

### 1.1 Do §3.5's four arguments survive against a *table*? Three die, one inverts.

§3.5 argued against `[{name, allowWrite}]`. Re-run against a hypothetical `external_mcp_tool_grants`:

| §3.5 argument | Against a table | Why |
|---|---|---|
| 1. "element type is load-bearing across a second consumer" | **DEAD** | See §1.2 — a table resolves into the same `readonly string[]`. |
| 2. "permanent dual-shape `parseJsonArray` reader" | **DEAD, and inverts slightly** | A table has no column to parse, so no dual shape. Absent rows = no writes authorized, which is every pre-existing row's correct value — strictly simpler than the NULL/`'[]'` case at `external-mcp-store.ts:325-333`. |
| 3. "auditability — one column answers 'which writes did this operator enable'" | **INVERTS — the table wins** | The column answers only *current state*. A grant row can carry `granted_by`/`granted_at` **per tool**; a column cannot. This is the one genuine advantage a table has, and §3.5 claimed it backwards. |
| 4. "they are genuinely two decisions" | **DEAD** | A table with independent `enabled` and `write_allowed` booleans does not conflate them either. This was an argument against a *record with one boolean*, and it does not transfer. |

**The Coordinator is right: §3.5 does not defend against a table.** What follows does.

### 1.2 C-001 verification — the runtime contract is unaffected. CONFIRMED.

`FederatedMcpConnectionConfig.writeAllowedToolNames` is **already in the working tree** as
`readonly string[]` (required, not optional) — `mcp-federation/ports.ts:155`, Phase 1 in flight.

The storage shape cannot reach it. The only producer is
`toResolvedFederatedConnections` (`external-mcp-store.ts:723-737`), which builds the config object
literal from `ExternalMcpServerConfig`, whose `allowedToolNames` came from
`parseJsonArray(record.allowedToolNames)` at `:688`. Swapping that expression for a grant-row lookup
changes one line in one function; federation sees an array either way. And presets never touch
storage at all — `supabase-mcp-plugin.ts` resolves from env (`SupabaseMcpEnvDefaults`, `:210-217`),
and `mcp-federation/config.ts:64`'s `parseAllowedToolNames` splits an env string. Neither reads
`external_mcp_servers`. **§3.5's argument 1 is void.**

### 1.3 What actually decides it: the write path has no transaction seam

`saveExternalMcpServer` (`external-mcp-store.ts:1361-1409`) validates everything, builds one
`ExternalMcpServerRecord`, and ends in a single `await deps.repo.upsert(record)` (`:1408`).
`ExternalMcpServerRepoPort` (`external-mcp-store.ts:170-196`) exposes `listByWorkspaceId`,
`findByServerId`, `upsert`, `deleteByServerId`, and the two OAuth-lease methods. **There is no
transaction primitive and no multi-entity write.**

A grants table turns one operator save into two writes — row upsert plus a full replace of that
server's grant set — which must be atomic or row and grants diverge. Divergence in a security
allowlist is the failure mode this whole subtree exists to prevent.

It is solvable — `media-provider-credential-repo.sqlite.ts:152`'s `replaceWorkspace()` and
`vendor-credential-repo.sqlite.ts:58,68,115` already do delete-then-insert inside one
`db.transaction()` — but paying for it means a new port method with transaction semantics, a matching
`external-mcp-store.memory.ts` double that fakes the atomicity (ADR-006 rule-of-two, named in
`external-mcp-repo.sqlite.ts:9-13`), plus a join or second query in `listByWorkspaceId`, today a flat
`select().all().map(toRecord)` (`:66-73`). **The column needs none of it: one field in one record
that is already written atomically.**

### 1.4 The C-006 subset invariant — the premise is wrong

The brief asks whether per-row `enabled` + `write_allowed` flags make "write ⊆ allowlist"
structurally impossible. **They do not.** Two independent booleans on one row express
`enabled=0, write_allowed=1` perfectly well. The forbidden state is still representable; only a
`CHECK (write_allowed = 0 OR enabled = 1)` forbids it — expressible in drizzle
(`schema.ts:2147-2156` has two on this very table), but it is the CHECK doing the work, not the
shape. That distinction matters, because the CHECK is only available if the table subsumes **both**
lists — and moving `allowed_tool_names` out of the column it lives in today is a **destructive**
migration of the one column `schema.ts:2052-2056` calls "a SECURITY column", with a data backfill and
a rollback story, replacing an additive one.

If instead the table holds only write grants and `allowed_tool_names` stays a column, the subset
invariant is **still code-enforced** — you pay for the table and get nothing on the invariant.

And even with the CHECK you keep the code-level check anyway: C-006's contract is an
`ExternalMcpValidationError(field: "writeAllowedToolNames")` naming the offending tool — materially
better than a `SQLITE_CONSTRAINT` surfacing from the repo layer. The CHECK is defence-in-depth, not a
replacement.

**Real but small table advantage:** no CHECK can express a subset relation between two JSON arrays in
SQLite (CHECK cannot contain a subquery), so the column shape can never have a DB-level backstop.
Given `saveExternalMcpServer` is the sole writer (outline §8), that backstop is worth less than the
atomicity it costs.

### 1.5 `schema.ts:2052-2056` — does a table inherit the governing comment?

The comment reads: *"`allowed_tool_names` is a SECURITY column, not a convenience … it is
operator-authored on purpose — a remote server classifying its own tools as safe is precisely what R2
exists to refuse, so this must never be backfilled from what a server advertises about itself."*

**Yes, a table inherits it too — the rule is about provenance, not shape.** "Never backfilled from
what a server advertises" binds a grant row exactly as it binds a column, so this comment does not
discriminate between the options; the outline's §5 claim that the new column "inherits its status
verbatim" is true but is not an argument *for* a column. What it does rule out, on either shape: any
path from the §3.1 probe into storage. D-3 already says no.

### 1.6 Migration mechanics

Latest migration is `0049_common_cammi` (`src/db/drizzle/meta/_journal.json`, idx 49) → next is
`0050_*`. **Generate with drizzle-kit** either way. Difference in kind:

- **Columns:** `ALTER TABLE ... ADD COLUMN` ×3, all nullable, no backfill. NULL and `'[]'` both mean
  "no writes authorized" — every existing row's correct value. Reversible by dropping columns.
- **Table:** `CREATE TABLE` + composite PK + a **compound** FK to `external_mcp_servers`'
  `(workspace_id, server_id)` PK (`schema.ts:2146`), with SQLite FK enforcement being a pragma-level
  concern, plus a cascade decision on server delete (`external-mcp-repo.sqlite.ts:127-133` deletes
  the row only).

### 1.7 Cost of the rejected alternative — stated plainly

Choosing the column gives up **per-tool** attribution. You can record *who last changed the write
list and when*; you cannot record *who authorized `generate_image` specifically*, nor keep history
after a grant is removed. If the owner later wants a per-grant audit trail, that is a genuine
migration to a table — additive at the time (the column stays the enforcement source until cutover),
but real work: a second repo port, two adapters, and the transaction seam from §1.3. My read: for a
handful of admins and a handful of connections, "who last changed the write list on `higgsfield`, and
when" answers the operator question. Buy the cheap 80% now.

---

## Part 2 — Per-user, and audit

### 2.1 Is the external-MCP OAuth token workspace-scoped? CONFIRMED, with the counter-precedent.

- PK is `primaryKey({ columns: [table.workspaceId, table.serverId] })` (`schema.ts:2146`). **No
  principal column exists on the table.**
- The sealed OAuth blob — `{ clientSecret?, tokens? }` — is four columns on that same row
  (`schema.ts:2138-2141`), as is the plaintext `oauth_client_id` (`schema.ts:2113`).
- OAuth `state` is *"single-use, expiring, and BOUND to `${workspaceId}:${serverId}`"*
  (`routes/external-mcp/oauth-callback.ts:21`) — **no principal component**. Whoever completes the
  handshake writes *the workspace's* token.
- `SaveExternalMcpServerInput` (`external-mcp-store.ts:782-801`) carries no `principalId` at all.

**Counter-precedent proving the choice was deliberate, not an oversight:**
`admin_execution_credentials` IS per-principal — PK `(workspaceId, principalId)`,
`schema.ts:1456-1480` — and its header says why: *"two admins on the same install already carry
independent keys, and collapsing to one shared workspace key would let one admin's save silently
overwrite another's"* (`schema.ts:1433-1437`). This codebase knows how to do per-user credentials and
chose not to here. **The Coordinator's premise holds.**

### 2.2 The Coordinator's position is right, but its two best arguments are missing

**(a) Per-user *invocation* control over federated tools ALREADY EXISTS.** Every federated tool
handler runs, per call, before any bytes cross the network
(`mcp-federation/registrations.ts:126-131`):

```ts
await requireToolPermission(deps, {
  principalId: ctx.principal.id,
  permission: FEDERATED_TOOL_PERMISSION,
  entityType: FEDERATED_ENTITY_TYPE,
  entityId: config.connectionId,
});
```

Its own comment: *"`entityId` is the connection, so a deployment can grant per-connection rather than
all-or-nothing."* So "should this be per-user?" already has a partial answer shipped — an admin can be
denied an entire federated connection, per-principal, enforced per call. The only missing granularity
is that `entityId` is a **connection**, not a tool.

**(b) Per-user *admission* is structurally impossible, not merely pointless.**
`agent-daemon-server.ts:342` creates ONE module-level `const registry = createToolRegistry()` per
daemon process; `:927` snapshots it once via `buildToolCatalogQuery(registry)`; and
`registrations.ts:57-63` documents that nothing can be unregistered afterwards because that FTS index
is one-shot. The admitted set is one catalog for the whole process, computed at boot from config that
contains no principal. A per-user write grant could therefore **never** change what is registered —
only add a second call-time check inside the handler, i.e. the permission system with worse
ergonomics and no policy UI. This is the decisive argument: "control in appearance only" is true
about *spend*, this is true about *mechanism*, and no amount of UX defeats it.

### 2.3 Where the Coordinator is incomplete

One real want survives its argument: *"admin A may write via Higgsfield; admin B may only read."*
That is coherent, is not answered by shared-credential reasoning, and is not expressible today
because `entityId` is the connection. The cheap path is **not schema** — it is one additional
`requireToolPermission` call in `registrations.ts`, tool-scoped, beside the existing
connection-scoped one and **added, never substituted** (changing `entityId: config.connectionId` to a
tool id would silently narrow every existing grant). Out of scope here; recorded so nobody solves it
with a table.

### 2.4 Cost of a finer capability string

The permission catalog is **not in Tovu**. `registerPermission({ id, owner, description })` lives in
`Jini/packages/cms/src/identity/permissions.ts` (`admin.integrations.manage` at `:284`), and the
built-in admin role's grants are `BUILTIN_ADMIN_PERMISSIONS` in
`Jini/packages/cms/src/identity/seed.ts:30+`. Tovu consumes the built package —
`"@jini-ai/cms": "file:../Jini/packages/cms"` (`package.json:81`).

Adding one string costs: edit `permissions.ts`; add it to `seed.ts`'s built-in list so fresh installs
do not depend on the fan-out; add `registerPermissionMigration({ from, to })` if existing policies
must not be narrowed (precedent `permissions.ts:288-292`); **rebuild Jini**; then Tovu's boot fan-out
`migrateDeprecatedPermissionGrants` (`src/identity/wiring.ts:129-141`) reaches already-seeded
installs. Well-trodden — done twice already.

**Recommendation: do not add one in this slice.** `admin.integrations.manage` is already the
site-owner-level gate whose own doc says whoever can write here *"can execute arbitrary code as the
Tovu process"* (`routes/admin/external-mcp/guard.ts:9-14`). A principal who can already spawn a
process on this box gains no meaningful power from ticking "may write".

### 2.5 Attribution precedent — it exists. Follow it.

Not invented — four in this schema: `created_by_principal` (`schema.ts:425`, redirects),
`created_by_principal_id` (`:709`; `:2610` releases), `requested_by_principal_id` (`:2659`,
deployment runs), `owner_principal_id` (`:702`).

**Recommended:** two more nullable TEXT columns on `external_mcp_servers`,
`write_grants_updated_by_principal_id` and `write_grants_updated_at`, written by
`saveExternalMcpServer` **only when the write list actually changes** (so a rename or an
enable-toggle does not rewrite the attribution). Cost: `SaveExternalMcpServerInput` gains
`principalId` (it has none today, `external-mcp-store.ts:782-801`), supplied by the route from
`getAuthedPrincipal(res)` — already called at `guard.ts:42`. Nullable and FK-free, following
`settingValuesUser`'s `principal_id` (`schema.ts:245`); a pre-existing row has no author to name.

---

## Part 3 — Impact on §12 Phase 2A

**The phase list changes in one way and gains one file the outline missed.**

Unchanged from §12 2A: `db/schema.ts`, new drizzle migration + `meta/`,
`db/sqlite/external-mcp-repo.sqlite.ts`, `assistant/external-mcp-store.ts`,
`assistant/external-mcp-store.memory.ts`, and the two test files. No new port, no new adapter, no
transaction seam, no second repo — the whole point of choosing the column.

**Changes:**

1. **THREE columns, not one:** `write_allowed_tool_names`,
   `write_grants_updated_by_principal_id`, `write_grants_updated_at`. Same migration, same files.
2. **`SaveExternalMcpServerInput` gains `principalId`** — a source-compatible required field on an
   input that today has none.
3. **ADD `src/server/routes/admin/external-mcp/put.ts` to the file map.** *It is absent from §5 and
   from every phase, and without it the column can never be set by any route.* `put.ts:79` is
   `allowedToolNames: asStringField(body.allowedToolNames)`; the new field needs a sibling line, and
   `principalId` must be threaded from `getAuthedPrincipal(res)`. Put it in **2A** (it is the save
   contract, not the probe) — it collides with nothing in 2B or 2C.
4. **R-3 extends to the new field, and fails safe.** `asStringField` (`put.ts:11-14`) collapses a
   non-string — e.g. an array — to `""`, which for `writeAllowedToolNames` silently clears every
   write grant. Undesirable, but it fails **closed**. Same known bug, one more field; not a blocker.

**Unchanged elsewhere:** C-001 (`ports.ts:155`) already landed and needs no edit from this decision;
Phases 1, 2B, 2C, 3A, 3B and 4 are untouched. The admin read model gains the two attribution values
so the tab can render "authorized by X on Y" — a `toView` (`external-mcp-store.ts:464-487`) addition
inside 2A, rendered in Phase 4 with no new route.
