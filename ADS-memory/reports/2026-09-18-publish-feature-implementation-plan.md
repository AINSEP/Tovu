# Publish Content — implementation plan

Architect pass, 2026-09-18. Grounded in `apps/website/src` at `d21d6e7ac` (branch `restructure/apps-website-phased`).
Every path below was opened and read. Anything I could not confirm is marked **UNVERIFIED**.

---

## 0. Corrections to the prior work — read this first

The leading design (`swarm-consensus/runs/2026-09-18-content-transport/fable-51-r3.md`) is sound in shape and
wrong in several load-bearing specifics. These change the task list.

| # | Prior claim | Verdict | What is actually true |
|---|---|---|---|
| 1 | Paths like `routes/posts/create.ts`, `composition/modules/content.ts`, `platform/db/sqlite/change-set-repo.sqlite.ts` | **STALE** | The phased restructure moved everything. Routes are `server/inbound/admin-http/routes/**`; composition is `server/runtime/composition/modules/**`; the post repo moved out of `platform/db/sqlite/` into `features/post/repo.sqlite.ts`. An implementer following r3's paths finds nothing. |
| 2 | "Media is the easy half — `putIfAbsent()` makes it idempotent" | **HALF WRONG, and it is the dangerous half** | Blob *bytes* are easy (content-addressed, `UNIQUE(workspace_id, sha256)`). The media **row** is not: `UploadMediaInput` (`@jini-ai/cms/dist/media/media-service.d.ts:52-62`) has **no `id`**, no `slug`, no `width`/`height`/`cssClass`/`htmlAttributes`. `uploadMedia` mints the id from `deps.idGen`. Post bodies reference assets **by id**, so importing media through the existing domain function re-mints every id and silently breaks every image embed in every imported post. See Task 12. |
| 3 | "`media` has no slug, only a uuid" (also in project memory) | **FALSE as of 2026-09-07** | `media.slug` exists with `uniqueIndex("idx_media_workspace_slug")`. That is a **second uniqueness axis** an importer can violate, exactly like `posts_workspace_slug_unique`. r3's design handles neither. |
| 4 | "A shared transaction is not buildable — Drizzle better-sqlite3 `transaction()` is sync, `mutation.execute()` is async" (`change-set-repo.sqlite.ts:24-37`) | **TRUE for the gateway, FALSE inside a repo** | Eight sqlite adapters already use `this.db.transaction((tx) => {...})` (`outbox-repo`, `gated-mutation-token-repo`, `publish-credential-repo`, `vendor-credential-repo`, `source-control-credential-repo`, `oauth-pending-store`, `content-db`, …). Every `SqlitePostRepo` method body is synchronous `.run()`/`.all()` under an `async` wrapper. A repo-internal transaction spanning the posts write + a ledger insert + the FTS refresh **is** buildable today. The quoted comment is only about threading a handle through the *gateway*. |
| 5 | "Postgres/Supabase/Neon are already targets" (dispatch brief) | **SCHEMA ONLY** | `schema.postgres.ts` is generated and CI-drift-guarded, but the only file that imports it is `platform/db/migration/manifest.ts`. There is **no Postgres runtime adapter for posts, media or anything else** — `platform/db/postgres/` contains one file, `db-ops.ts`. Design dialect-neutrally (cheap), but do not budget for a live pg path. |
| 6 | "UNVERIFIED whether the desktop app copies `siteId` when cloning a site dir" | **RESOLVED — it does not** | `platform/site-dir/duplicate-site.ts:191`: `const siteId = randomUUID(); // NEW identity — never copied from sourceMeta.siteId.` The product's duplicate path is safe. A raw `cp -r` outside the product still clones it, which is why §1.6 keys baselines on the **authenticated principal**, not a self-declared `siteId`. |
| 7 | r3's bespoke `?mode=dry-run` then `?mode=apply` flow | **REINVENTS A BUILT THING** | `contracts/core/gated-mutations/` is a live plan→confirm→execute gateway that already gives: fresh re-authorization at execute, single-redemption tokens, "an agent may never confirm", and **plan-hash re-derivation → `PLAN_STALE`**. That last one is precisely "someone edited the destination between the dry-run and the apply" — the race r3's flow has no answer for. Use it. `features/database/gated-hooks.ts` and `features/recovery/gated-hooks.ts` are the two worked examples. |
| 8 | "Name the feature `publish`" | **COLLIDES** | `publish` is taken by deploy: `publish_credential_sets`, `publish_history` tables, `PublishExecutionMode`, `features/deployments/static-publish/`, `publish-agent-tools.ts`. The feature dir, tables and permissions below are named **`content-transport`**. "Publish Content" stays the UI label only. |

Claims from the brief I **confirmed** unchanged: `change_set_items` shape and its NULL `before_revision_id`/`after_revision_id` (no domain-level writer exists — only the repo passthrough at `change-set-repo.sqlite.ts:105`); the strict-equality revert guard (`contracts/core/commands/revert.ts:99-105`); post ids preservable at create (`routes/posts/create.ts:72` mints, `:104` passes into `createPost`); `asset_blobs` UNIQUE(workspace_id, sha256); registries are append-only/read-once **only in some places** — see §3.

---

## 1. The seam

### 1.1 HTTP routes
- Handlers: `apps/website/src/server/inbound/admin-http/routes/<domain>/<verb>.ts`, each exporting a `registerAdmin*Route` registrar.
- Registration: `apps/website/src/server/runtime/composition/modules/content.ts` (and siblings). Add a new module `content-transport.ts` rather than widening `content.ts`.
- Deps narrowing: each module has its own slice type, e.g. `routes/content/deps.ts`'s `ContentRouteDeps`. Write `routes/content-transport/deps.ts` the same way — a genuine narrowing, not a widening of `RouteDeps`.
- Mount path convention: `/api/admin/v1/workspaces/:workspaceId/...`, with the handler 404ing when `req.params.workspaceId !== deps.workspaceId`.

### 1.2 Auth and permissions (this already exists — do not build one)
- `server/inbound/admin-http/dev-auth.ts` — `requireAdminSession` accepts **two** credentials: the `tovu_session` cookie, and `Authorization: Bearer <raw-key>` / `ApiKey <raw-key>` (`API_KEY_AUTHORIZATION_PATTERN`). Both resolve to a `PrincipalRecord` on `res.locals`, read via `getAuthedPrincipal(res)`. An API key's grants come from its issuance snapshot and go through the same `authorize()`.
- **This is the transport credential.** A peer instance authenticates as an ordinary API-key principal. No new auth mechanism.
- Per-route gate: `authorizeOrRespond(res, deps.authorize, {principalId, permission, workspaceId, entityType?, entityId?})` in `server/inbound/admin-http/authorize-guard.ts`.
- Adding a new permission string: `registerBuiltinRoleGrant({role, permission, reason})` (`features/identity/builtin-role-grants.ts`) — additive-only, idempotent, runs every boot, and is the **only** mechanism that reaches an already-seeded workspace. `features/pages/permissions.ts` is the worked example; copy its structure. Do not put the string in the `@jini-ai/cms` seed list: `seedIdentity` early-returns once an owner exists, so it would provably never reach this repo's own `content.db`.

### 1.3 Domain write functions (apply through these, never the repo)
| Entity | Function | File | Preserves caller id? |
|---|---|---|---|
| post / page | `createPost`, `updatePost`, `deletePost` | `features/post/post.ts` | **Yes** — `input.id` |
| page HTML body | `PagesHtmlDocumentStore` | `features/pages/html-document-store.sqlite.ts` | separate chokepoint from `updatePost`; CIC-3 invariant, keep them separate |
| media row | `uploadMedia`, `updateMediaMetadata` | `@jini-ai/cms/media` | **No** — see §0 #2 and Task 12 |
| blob bytes | `BlobStorePort.putIfAbsent` | `features/media/blob-store.*` | n/a, content-addressed |
| entry↔term | `assignTerms` (upsert on `entry_terms_unique`) | `@jini-ai/cms` taxonomy | by natural key, never carry `entry_terms.id` |
| entry refs | `EntryRefsRepoPort.replaceForSource` | `contracts/core/entry-refs/ports.ts:29` | **derived — never transport; rebuild for every written entry** |

Optimistic concurrency: `updatePost` honours `expectedVersion` and returns early when it is `undefined` (opt-in). `SqlitePostRepo.saveIfVersion` is one atomic `UPDATE … WHERE version = ?` (fixed in `13d642f2e`). **The importer must always pass `expectedVersion`.**

### 1.4 The command gateway (audit + inverse, for free)
`executeCommand` from `@jini-ai/cms/core`, as used verbatim in `routes/posts/create.ts:79-113`. Gives an authorize call, a `change_sets` header, a `change_set_items` row with `inverse_payload_json` and `entity_version_at_apply`, and `Idempotency-Key` de-duplication. **Every import write goes through it**, with `actor: {id: principal.id, kind: "api_key"}` and `summary: "Import from <peer label>"`.

This is why v1 does **not** need `post_revisions`: the operator-forced overwrite path captures the destination's pre-image as a change-set inverse, exactly as an ordinary admin edit does. The ledger (another agent's in-flight work — **nothing is in the tree yet**, `grep post_revisions` = 0 hits) is an upgrade of that recovery floor, not a prerequisite.

### 1.5 Gated mutations (the dry-run→apply flow, already built)
`contracts/core/gated-mutations/{gateway,ports,composition}.ts`. A feature declares `GatedMutationHooks`:
`domain`, `readPermission`, `mutatePermission`, `scopeId`, `scopeKind`, `computePlan()`, `executeMutation()`, `resolveActorIdentity()`. `features/database/gated-hooks.ts:97-99` is the naming precedent (`domain: "database.migrate"`, `readPermission: "database.read"`, `mutatePermission: "database.migrate"`).
`execute()`'s fixed check-sequence: fresh `authorize()` → token lookup → redemption/expiry → confirmer-identity → **`computePlan()` re-run and hash-compared → `PlanStaleError`**.
`DbOpsPort.captureRestorePoint({scopeId})` and `getCapabilities()` (cost class `cheap`/`expensive`/`unavailable`) are on the same port. `features/recovery/restore-points.ts` + `features/database/restore-points.ts` own the persisted rows and the idempotency key.

### 1.6 Outbound HTTP (the push/pull leg) — and its trap
`platform/http/ports.ts`'s `HttpClientPort.send` is checked against an `EgressPolicy` (ADR-038): `denyPrivateAddresses`, IPv6/loopback/link-local/metadata deny, credentials-in-URL rejection, **auth-header stripping on cross-origin redirect**, decompressed-byte cap.
- local → `https://tovu.fly.dev` works.
- local → `http://localhost:4321` (a second local site, or a staging container) is **denied by default**. The named capability is `EgressPolicy.devHostAllowlist`, matched against the bracket-stripped hostname. A peer pointing at a private address must be explicitly allowlisted; the failure must say so rather than reading as a network error.

### 1.7 Admin UI
`apps/admin/src/features/dashboard/PublishContentDialog.tsx` already exists (in-flight, untracked) with `TODO(publish): there is no publish API yet … Confirm is wired to nothing but is left VISIBLE and disabled`. Its `onConfirm` and the paired `hooks/use-publish-content-confirm.hooks.ts` are the exact wiring point for Task 11. API client: `apps/admin/src/lib/api.ts`. Per project convention, component logic goes in the `.hooks.ts`, not the `.tsx`.

---

## 2. Schema additions — migration 0064 (all additive; no existing contract changes)

Next migration number is **0064** (`platform/db/drizzle/` ends at `0063_site_title_preexisting_workspaces.sql`). All four tables are new; **no column is added to, and no constraint is changed on, any existing table.** Drizzle conventions copied from `publishCredentialSets` / `entryRevisions` in `platform/db/schema.ts`.

```ts
/**
 * Per-peer sync memory: the content hash of each entity as last exchanged with that peer.
 * This — not a version number — is what tells "unchanged since we last spoke" from "edited
 * on the far side". Each instance keeps its OWN table; the design is symmetric.
 *
 * `peerPrincipalId` is the AUTHENTICATED principal of the request that recorded the row
 * (an API-key principal for an inbound import, the local peer record's id for an outbound
 * pull). Deliberately NOT a self-declared siteId from the bundle: a bundle field is
 * attacker-chosen, and keying on it would let any key-holder poison another peer's
 * baselines into "safe to overwrite".
 */
export const contentTransportBaselines = sqliteTable(
  "content_transport_baselines",
  {
    workspaceId: text("workspace_id").notNull(),
    peerPrincipalId: text("peer_principal_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    hashAtLastSync: text("hash_at_last_sync").notNull(),
    /** Which canonicalization produced `hashAtLastSync`. A baseline written by an older
     *  algorithm is NOT comparable; the run refuses rather than treating it as a mismatch. */
    hashVersion: integer("hash_version").notNull(),
    syncedAt: text("synced_at").notNull(),
    runId: text("run_id").notNull(),
  },
  (t) => [
    uniqueIndex("content_transport_baselines_unique").on(
      t.workspaceId, t.peerPrincipalId, t.entityType, t.entityId
    ),
  ]
);

/** One row per export/import run — the audit trail and the report the operator acted on. */
export const contentTransportRuns = sqliteTable(
  "content_transport_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    direction: text("direction").notNull(),        // 'export' | 'import'
    peerPrincipalId: text("peer_principal_id").notNull(),
    peerLabel: text("peer_label"),                 // display only; never a key
    phase: text("phase").notNull(),                // 'planned' | 'applied' | 'failed' | 'abandoned'
    restorePointId: text("restore_point_id"),      // apply only
    changeSetIds: text("change_set_ids_json"),     // the writes this run produced
    actorId: text("actor_id").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    /** Per-entity outcomes: created | unchanged | applied | forced | conflict | blocked | refused. */
    reportJson: text("report_json"),
  },
  (t) => [index("idx_content_transport_runs_workspace").on(t.workspaceId, t.startedAt)]
);

/**
 * A received bundle, staged between plan() and execute() so the plan hash has a stable input
 * and large media bytes are uploaded once. Bytes are NOT stored here — they go to the blob
 * store by sha256 (see Task 6), so a re-push of unchanged media costs nothing.
 */
export const contentTransportBundles = sqliteTable(
  "content_transport_bundles",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    sourcePrincipalId: text("source_principal_id").notNull(),
    hashVersion: integer("hash_version").notNull(),
    entitiesJson: text("entities_json").notNull(),
    blobManifestJson: text("blob_manifest_json").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    receivedAt: text("received_at").notNull(),
    /** Hard TTL. A bundle past it is refused by plan/execute and swept; staged bytes are
     *  ordinary blobs and are left to the existing blob GC. */
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("idx_content_transport_bundles_workspace").on(t.workspaceId, t.expiresAt)]
);

/**
 * An outbound peer this instance can push to or pull from. Sealed-secret shape copied from
 * `publishCredentialSets` (sealedKeyId/sealedCiphertext/sealedNonce/sealedAlg/masked +
 * aadVersion) — same KeyringPort/SecretSealerPort, same AAD discipline, no new crypto.
 */
export const contentTransportPeers = sqliteTable(
  "content_transport_peers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url").notNull(),
    remoteWorkspaceId: text("remote_workspace_id").notNull(),
    sealedKeyId: text("sealed_key_id"),
    sealedCiphertext: text("sealed_ciphertext"),
    sealedNonce: text("sealed_nonce"),
    sealedAlg: text("sealed_alg"),
    masked: text("masked"),
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_transport_peers_workspace_label_unique").on(t.workspaceId, t.label)]
);
```

**Manifest obligations** (enforced by `migration-manifest.test.ts`, `platform/db/migration/manifest.ts`): none of these four has an autoincrement primary key, so `REVIEWED_INTEGER_ID_COLUMNS` needs no entry. Register `report_json`, `entities_json`, `blob_manifest_json`, `change_set_ids_json` in `REVIEWED_JSON_COLUMNS` (the `*_json` naming already matches `isJsonColumnName`, but the map is the review, so add the rationale rows). Regenerate `schema.postgres.ts` via `development/scripts/generate-postgres-schema.ts` in the same commit or CI drift fails.

**Additive vs contract change:** all four tables are purely additive. The only change to an existing contract in this whole plan is Task 14's `expectedVersion`-always on the admin post update client, and Task 14b's opt-in `force` on `revertChangeSet` — both called out there, both behind their own tasks.

---

## 3. The publishable-type registry

**The trap, stated precisely.** This codebase has two registry shapes, and only one of them is safe here:
- Append-only + read-once-at-startup: `ToolRegistry`, routing's `phaseRegistry`. A filter applied at registration time runs once, ever.
- Register-by-key, replace-on-duplicate, **listed fresh at every consumption**: `assistant/tool-contribution-registry.ts` and `assistant/duplicate-resource-registry.ts`. `tool-registrations.ts:579` says so explicitly — *"Computed fresh on every call rather than once at module load."*

Use the second, and copy `duplicate-resource-registry.ts` almost verbatim — it is the same problem (one generic operation over a growing set of resources, each contributing its own implementation) and it already solved the module-cycle problem this would otherwise reopen.

```ts
// apps/website/src/features/content-transport/type-registry.ts

/** One content type's contract for participating in Publish Content. */
export interface ContentTransportHandler {
  /** Stable wire discriminator. Appears in bundles and in baselines; never renamed. */
  readonly entityType: string;
  /** The resource's OWN existing write permission (e.g. "content.write" for post/page,
   *  "media.upload" for media). NOT a flat transport-wide permission: a principal allowed
   *  posts but not media must be refused media by construction, exactly as
   *  DuplicateResourceHandler.permission achieves it. */
  readonly permission: string;
  /** Types that must be applied BEFORE this one, by entityType. post -> ["media","term"]. */
  readonly dependsOn: readonly string[];

  /** Export side: every transportable entity, already canonicalized + hashed. */
  pack(): AsyncIterable<PackedEntity>;
  /** Import side: what the destination currently holds, or null. */
  inspect(id: string): Promise<{ version: number; hash: string } | null>;
  /** Import side: a pure precondition check that never writes — slug availability,
   *  CHECK-constraint shape, referenced-blob presence. Returns a blocking reason or null. */
  precheck(entity: PackedEntity): Promise<string | null>;
  /** Import side: applies ONE entity through the real domain function, inside the caller's
   *  executeCommand. Receives expectedVersion; must fail (not overwrite) when it does not match. */
  apply(input: {
    entity: PackedEntity;
    expectedVersion: number | undefined;
    principalId: string;
  }): Promise<{ changeSetId: string }>;
}

export interface PackedEntity {
  readonly entityType: string;
  readonly id: string;
  readonly contentHash: string;
  readonly hashVersion: number;
  /** Blob sha256s this entity needs present before it can be applied. */
  readonly requiredBlobs: readonly string[];
  readonly state: Record<string, unknown>;
}

/** Deferred like ToolContributor.build: registration happens once at boot, before any real
 *  deps bag exists; the handler is resolved per composition, later. */
export interface ContentTransportContributor {
  readonly entityType: string;
  readonly build: (deps: ContentTransportDeps) => ContentTransportHandler;
}

export function registerContentTransportContributor(c: ContentTransportContributor): void;
export function listContentTransportContributors(): readonly ContentTransportContributor[];
export function resetContentTransportContributorsForTests(): void;
```

Rules that make it actually extensible:
1. **Registration happens at the composition root only** — `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors` (or a sibling `installFirstPartyTransportTypes`). A feature returns *data* (`contributePostTransport(): ContentTransportContributor`) and imports only the `type`. `features/post -> assistant/server` value edges previously closed a real module cycle and had to be removed; do not reopen it.
2. **`listContentTransportContributors()` is called at publish time**, inside the planner, never captured at module load. A type registered later is picked up on the next run.
3. **Never `register on import`.** No module-evaluation side effects.
4. **Apply order is derived from `dependsOn` at publish time** (topological sort), not hardcoded. Adding media-before-post is then a property of the media contributor, not an edit to the planner.
5. **A type absent from the registry is absent from the bundle and from the report.** Silence is never "nothing changed" — the report lists the types it covered, so an operator can see that, say, forms were not included.

Adding a type later = one new `contribute<X>Transport()` in that feature + one line at the composition root. No publish-code change.

---

## 4. Tasks

Each is independently committable with its own test. Every prefix of this list is a working state.
Prereqs in brackets. Tasks 1–5 write nothing to any database and cannot break an install.

| # | Task | Prereq | Test |
|---|---|---|---|
| 1 | `content-hash.ts`: `canonicalize(entityType, state)` + `contentHash()` + exported `CONTENT_HASH_VERSION`. Excludes `id`, `workspaceId`, `version`, `updatedAt`, `autosaveJson`. Stable key order, no whitespace, explicit `null` for absent. | — | Same content on two DBs with different `version`/`updated_at` hashes equal; changing any content field changes it; a snapshot test pins the algorithm so a change to it is a deliberate `CONTENT_HASH_VERSION` bump. |
| 2 | `type-registry.ts` per §3, plus `contributePostTransport()` / `contributePageTransport()` returning data only, wired at the composition root. | 1 | Fresh-read (a contributor registered after the first `list()` is seen by the second); replace-by-key on double registration; `resetForTests`; no runtime import edge from `features/post` into the registry module (architecture check). |
| 3 | Migration 0064 + the four tables + `REVIEWED_JSON_COLUMNS` entries + regenerated `schema.postgres.ts`. | — | `migration-manifest.test.ts` green; pg drift check green; migration applies to a copy of `sites/tovu-com/content.db` and to an empty DB. |
| 4 | `GET /api/admin/v1/workspaces/:ws/content-transport/export` — `content.transport.read`, read-only, streams `{hashVersion, sourceLabel, entities[], blobManifest[]}`. Deny-list is an **allowlist of registered types**, so operational data cannot leak by omission. | 2 | Returns registered types only; a principal without the type's own permission gets that type omitted, not a 500; no row from `sessions`/`principals`/`api_keys`/`*credential*`/`change_sets`/`outbox_events`/`analytics_events`/`commerce_*`/`member*`/`form_submissions`/`content_transport_*` appears in any bundle. |
| 5 | `planImport(bundle, deps) -> TransportReport`. **Pure planning, zero writes.** Produces one outcome per entity. | 2,3 | The seven outcomes (below) each produced from a constructed fixture; a `conflict` or `blocked` row leaves the destination byte-identical. |
| 6 | Blob pre-flight: `POST .../content-transport/blobs/probe` (which shas do you have?) then `PUT .../content-transport/blobs/:sha` → `putIfAbsent`. Bundle staging route `POST .../content-transport/bundles` → `{bundleId}`. | 3 | Probe short-circuits an already-present sha; a re-uploaded sha writes nothing and reports `written: false`; a sha whose bytes do not hash to it is refused; bundle past `expiresAt` is refused. |
| 7 | `gated-hooks.ts`: `domain: "content.transport"`, `readPermission: "content.transport.read"`, `mutatePermission: "content.transport.apply"`, `scopeKind: "workspace"`, `computePlan()` = `planImport` hashed, `executeMutation()` = apply. Routes `plan`/`confirm`/`execute`. Restore point captured in `executeMutation` before the first write, via `DbOpsPort.captureRestorePoint`. | 5,6 | `PLAN_STALE` when the destination row changes between plan and execute; an agent principal cannot `confirm`; a redeemed token cannot be redeemed twice; a `restorePoint` cost class of `unavailable` refuses with no override. |
| 8 | The apply loop: per type in `dependsOn` order, chunks of ~200 entities, each chunk one transaction, each write through `executeCommand` + the type's `apply()` with `expectedVersion`. Baseline upserted for `created`/`unchanged`/`applied`/`forced` only. | 7 | A concurrent local edit during a chunk produces `conflict`, not an overwrite; baselines written only for the four outcomes; the run row records every `changeSetId`. |
| 9 | Permission registration: `registerBuiltinRoleGrant` for `content.transport.read` (admin) and `content.transport.apply` (admin), modelled on `features/pages/permissions.ts`. | 7 | An already-seeded `content.db` (copy of `sites/tovu-com/content.db`) gains both grants at boot; `editor` and `viewer` do not; re-running boot adds nothing. |
| 10 | Peers: CRUD route + sealed key (copy `publishCredentialSets`' sealing), outbound push driver over `HttpClientPort`, and the `devHostAllowlist` diagnosis. Then pull: call the peer's export route and run the **same** `planImport` locally. | 8,9 | Pull and push exercise one importer; a private-address peer without an allowlist entry fails with a message naming `devHostAllowlist`, not a generic network error; the sealed key never appears in a log, a report, or an error body. |
| 11 | Wire `PublishContentDialog.tsx`'s `onConfirm` → plan → report table (per-entity outcome, with the skip reasons visible) → confirm → execute. Drop its `notice.warning` block. Logic in `use-publish-content-confirm.hooks.ts`. | 10 | Playwright: a conflict row renders its reason and is not selectable for silent apply; the dialog cannot fire execute without a confirmed plan. Screenshot before "done". |
| 12 | **Media.** New host-owned `importMediaEntity()` in `features/media/` composing `blobStore.putIfAbsent` + `blobRepo` + `mediaRepo.save(record)` (which *does* take a full record including `id`), deliberately bypassing `uploadMedia` — with a file header saying why (§0 #2). Then `contributeMediaTransport()`. | 6,8 | Imported media keeps its source `id`; a post importing alongside it renders its embed; a `media.slug` already held by a *different* id reports `blocked:slug-taken` and writes nothing; `sourceSha256` of an existing row is never rewritten (`resolveWriteOnceSource`'s invariant). |
| 13 | "Deploy + Publish" combined action: deploy, wait for the deployment to report healthy, **then** publish. Never the default button. | 11 | Publish does not start when deploy fails; the combined action is not the primary/default control. |
| 14 | Multi-author hardening. (a) The admin post update client always sends `expectedVersion`. (b) `revertChangeSet`'s strict guard gains an explicit `force` the route only honours with an operator confirmation, and the conflict error names the newer version and actor. | — (independent) | (a) a second author's save makes the first author's save 409, not silently win; (b) an older change set is still revertable with `force`, and the default path still refuses. |

**Critical path to a usable feature:** 1 → 2 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Task 4 (export) can land any time after 2 and is worth landing early: it is read-only, it is the pull half, and it makes the bundle format real before anything can write. Task 12 is the one that must not be skipped before real use — without it, imported posts render broken images. Tasks 13 and 14 are independent.

**The seven outcomes** (Task 5's contract — this table *is* the safety property):

| Outcome | Condition | Writes? |
|---|---|---|
| `created` | no destination row with this id | yes |
| `unchanged` | destination hash == source hash | no |
| `applied` | destination hash == recorded baseline (it was untouched since we last spoke) | yes |
| `conflict` | destination hash differs from both source and baseline — it was edited there | **no** |
| `conflict` | no baseline exists at all for this peer+entity | **no** |
| `blocked` | a precondition fails: slug taken by a different id, `posts_body_format_shape` violated, a required blob absent | **no** |
| `refused` | `bundle.hashVersion != CONTENT_HASH_VERSION`, or a baseline's `hashVersion` differs | **no — the whole run refuses** |
| `forced` | outcome was `conflict` and the operator explicitly chose this row | yes, pre-image captured as a change-set inverse |

Absence from a bundle produces **no outcome and no write**. There is no delete path at all.

---

## 5. Risks, and the specific guard

| # | What destroys data | Guard |
|---|---|---|
| 1 | Overwriting an edit made on the destination | Hash-vs-baseline comparison (Task 5). **No baseline == conflict**, so the first-ever run against prod can only create, never overwrite. Fail closed, never open. |
| 2 | An edit landing on the destination *between* the dry-run and the apply | The gated gateway re-runs `computePlan()` at execute and compares the hash → `PLAN_STALE` (Task 7). This is the guard r3's design does not have. |
| 3 | An edit landing *during* the apply, after the plan hash matched | Every write carries `expectedVersion` into `saveIfVersion`'s atomic `UPDATE … WHERE version = ?`. A losing write reports `conflict` and moves on; it never retries with a stale record. |
| 4 | A slug collision silently renaming or clobbering content | `posts_workspace_slug_unique` **and** `idx_media_workspace_slug` are checked in `precheck()` before any write. A slug held by a different id is `blocked`, reported, never auto-renamed. Never rely on catching the constraint violation — that kills the whole chunk transaction. |
| 5 | Imported posts rendering broken images | Task 12 preserves media ids. Until Task 12 lands, media is **not** a registered type, so a bundle simply contains no media and the report says so. It must never contain media that `uploadMedia` re-ids. |
| 6 | A bad apply with no way back | Restore point captured in `executeMutation` before the first write (Task 7), with the existing cost-class attestation. Plus every write is a `change_sets` row with an inverse, so a single bad entity is revertable without a whole-DB restore. |
| 7 | A partially-applied run leaving a mixed state | Chunked transactions (~200) so SQLite's single writer does not block admin writes for seconds. Partial application is safe because nothing is deleted and the restore point exists; the run row records exactly which change sets landed. |
| 8 | Operational data leaking to a peer | The bundle is built from an **allowlist** (registered types only), not a deny-list. A new table is invisible to transport by default. Task 4's test asserts absence of each sensitive table by name. |
| 9 | A peer poisoning another peer's baselines | Baselines are keyed by the **authenticated principal id**, never by a `siteId` the bundle declares. A self-declared identity is display-only. |
| 10 | An algorithm change silently turning every row into a conflict | `CONTENT_HASH_VERSION` travels in the bundle and is stored on each baseline. A mismatch **refuses the run** with "these two instances are on different content-hash versions; upgrade the older one", rather than producing an all-conflicts report an operator might force through. |
| 11 | The transport API key becoming a general-purpose admin key | The key's grants come from its issuance snapshot and are evaluated by the same `authorize()`. Issue transport keys holding only `content.transport.*` plus the per-type write permissions. Each type's own `permission` is checked separately (§3), so a posts-only key cannot write media. |
| 12 | A peer secret leaking through a report or a log | Sealed at rest with the same `KeyringPort`/`SecretSealerPort`/AAD discipline as `publish_credential_sets`; only `masked` is ever rendered. `HttpClientPort` already strips auth headers on cross-origin redirect and rejects credentials-in-URL. |
| 13 | A staged bundle accumulating unbounded | `expiresAt` TTL + a sweep; staged bytes are ordinary content-addressed blobs and fall to the existing blob GC. Size cap on the staging route, mirroring `rejectOversizedJsonBody`'s use at `routes/posts/create.ts:64`. |
| 14 | Two authors making an old change set permanently unrevertable | Known live defect (`revert.ts:99-105`, strict equality). Task 14b. Not caused by this feature — but it is the first thing a second author hits, so it ships with it. |

---

## 6. Deliberately out of v1

1. **Body-level merge — permanently, not just in v1.** Row-level `mine / theirs / skip` is the ceiling. Every product researched (Strapi, WordPress, Ghost, Directus) reached the same conclusion; two divergent TipTap documents have no sound automatic resolution.
2. **Delete propagation.** Absence from a bundle means nothing. A deletion travels only as a tombstone (`deletedAt` set) on an entity that is *present*, applied as an ordinary update. There is no code path in this design that issues a `DELETE`.
3. **`post_revisions` / finishing ADR-008.** v1's recovery floor is the change-set inverse (already captured by `executeCommand`) plus the restore point (already built). The ledger is a strictly better floor, it is another agent's in-flight work, and **nothing in this plan blocks on it or duplicates it.** When it lands, the `forced` path gains a richer pre-image for free.
4. **Theme files.** Themes are per-site *file* copies (`theme_copy_model`), not DB rows, and they already travel with the site dir and with deploy. `presentation_settings.activeThemeId` is a DB row and is a trivial later type; the files are a separate transport with a different failure mode (a half-copied theme breaks rendering, where a skipped post does not).
5. **Content types / collections schema.** Directus's split is right: schema and content move separately, and moving a content type under live entries is a migration, not a copy. Entries can be added as a type later via §3 with no publish-code change.
6. **Scheduling, cron, auto-publish-on-deploy.** Publish is an explicit operator action. "Deploy + Publish" (Task 13) is the only composition, and it is never the default.
7. **Hash dedupe and ledger pruning.** Bodies are ~1 KB average, 115 KB total across 54 live posts locally. Revisit when a real site shows growth that matters.
8. **A live Postgres runtime.** The schema stays dialect-neutral and CI-drift-guarded (§0 #5), but there is no pg adapter to test against and building one is a different project.
9. **Rescuing the three prod-only posts as a special case.** The owner said not to. They are handled by construction anyway: with no baselines, the first pull `create`s them locally and the first push never touches them.

---

## 7. What I could not verify

- **UNVERIFIED**: the exact `BlobStorePort.putIfAbsent` body and its concurrency guarantee. The interface is used by `hydrate-blob-store-from-seed.ts` and both adapters, and `{written: boolean}` is its documented return, but I did not read the `@jini-ai/cms` implementation.
- **UNVERIFIED**: whether `restoreFromArtifact`'s `restartRequired: true` (SQLite file swap) is acceptable inside an admin request, or whether the recovery UI already handles that. It matters only for the panic path, not the apply path.
- **UNVERIFIED**: whether the in-flight `post_revisions` agent intends to change `PostRepoPort`. If it adds `saveWithRevision`, Task 12's `mediaRepo.save` analogue and Task 8's apply loop should use it rather than `updatePost`'s current path. Coordinate before Task 8.
- **UNVERIFIED**: the current prod instance's `content.db` — whether it has an owner principal able to hold `content.transport.apply`, and whether its API-key issuance path is reachable. Task 9's grant is additive and idempotent, so it is safe either way, but the first real push needs a key issued *on prod*.
