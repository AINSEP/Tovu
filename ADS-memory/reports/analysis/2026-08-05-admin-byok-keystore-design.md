# Design: server-side storage for the admin's own BYOK credential

- **Status:** DESIGN ONLY — no code, no migration, no commits. Awaiting owner sign-off before Phase 2.
- **Date:** 2026-08-05
- **Author:** Software Architect (design-only dispatch)
- **Relationship to ADR-058:** sibling, not an extension. ADR-058 built the *pattern* (write-only,
  `SecretSealerPort`-backed, single-row-per-scope) for the **visitor** assistant's key. This document
  applies the same pattern to a **different** credential — the admin's own BYOK key — in its own table,
  per the owner's explicit instruction that the two stay separate.

---

## 1. Scope of ownership — per **(workspace, principal)**, not per-workspace-only

**Recommendation: composite key `(workspace_id, principal_id)` — one credential per admin, per
workspace.** Reasoning:

- **What it replaces sets the bar.** Today the key lives in `window.localStorage`, which is scoped to
  one browser. Two admins on the same Tovu install, each on their own machine, each currently have
  their *own* independent key, independent provider choice, and independent saved drafts — nothing
  server-side collapses that. Landing this as workspace-scoped-only (one shared key for the whole
  workspace, like ADR-058's visitor key) would be a **regression**: whichever admin saves first
  silently becomes the key every other admin's dock now uses, and a second admin's own key is
  overwritten with no warning. The owner's own phrasing — "an admin's byok key for **them** to do
  stuff" — reads as per-individual, not per-installation.
- **A precedent for exactly this shape already exists and is load-bearing.** `settingValuesUser`
  (`src/db/schema.ts:219`) is workspace-AND-principal-scoped for exactly this reason: "a value that
  belongs to one admin, in one workspace." Its `uniqueIndex("pk_setting_values_user").on(workspaceId,
  principalId, settingId)` is the direct structural precedent for this table's primary key (minus
  `settingId`, since — like `siteAssistantCredentials` — this is a single-row-per-scope shape, not a
  per-key ledger).
- **Multi-workspace is real, but it doesn't push toward workspace-only scoping here.** Per the
  workspace-multitenancy note, a shared `content.db` can hold rows for multiple workspaces — but
  `RouteDeps.workspaceId` (`src/server/deps.ts:178`) shows each **running server process** is bound to
  exactly one workspace. So workspace-scoping this table doesn't change how requests get routed (that's
  already fixed per-process); it changes what happens on data export/deletion/backup — a workspace
  delete/export should carry or purge its admins' keys with it, not leak them into another workspace's
  view. `workspace_id` in the key gives that for free without complicating the common case.
- **Per-installation (no scoping at all) was considered and rejected.** It's the cheapest option but
  throws away real behavior every current multi-admin install already has, and it's the shape most
  likely to need an undoable migration later if a second admin ever complains their key vanished under
  someone else's.

**One consequence to flag explicitly:** this means N admins now need to enter their key N times (once
each) — expected and consistent with "every admin re-enters their key once" already being the accepted
one-time cost of moving off `localStorage` at all (see §3).

---

## 2. Table shape

Mirrors `siteAssistantCredentials`'s sealed-value convention (`src/db/schema.ts:1279`) — same five
`sealed*`/`masked` columns, same CHECK totality constraint, same "ciphertext discarded on rotation, not
retained" discipline (ADR-058 §8) — with the primary key widened to `(workspace_id, principal_id)` and
the BYOK-specific fields (`protocol`, `provider_id`, `max_tokens`) added to match
`ByokConfig`/`ResolvedByokCredential`'s existing shape (`byok-credential.ts:26-32`).

```ts
/**
 * The ADMIN's own BYOK credential — one row per (workspace, principal), powering the admin
 * assistant dock's BYOK mode (ADR-049, `server/modules/assistant-byok.ts`). NOT the site's
 * credential (ADR-058, `siteAssistantCredentials`) — different table, different scope
 * (per-admin vs per-workspace), different consumer (the admin's own dock vs the public visitor
 * chat). See that table's header for why they must never merge.
 *
 * Sealed via the SAME `AesGcmSecretSealer` instance ADR-058 built (reused, not re-derived —
 * `SecretSealerPort` is a generic seal/open primitive, not a per-consumer-domain-separated one;
 * domain separation lives one level down, inside the sealer's own key derivation, and does not
 * need a second boundary per table). `sealed*`/`masked` totality CHECK copied verbatim from
 * `site_assistant_credentials_sealed_shape`.
 */
export const adminExecutionCredentials = sqliteTable(
  "admin_execution_credentials",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    protocol: text("protocol").notNull().default("anthropic"), // "anthropic"|"openai"|"azure"|"google"
    providerId: text("provider_id"), // preset id; NULL = custom endpoint (mirrors ByokConfig.providerId)
    baseUrl: text("base_url"),
    model: text("model"),
    maxTokens: integer("max_tokens"),
    /** `SealedSecret.keyId`. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today. */
    sealedAlg: text("sealed_alg"),
    /** `••••<last 4 chars>`, precomputed at write time — same convention as ADR-058 §3. */
    masked: text("masked"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.principalId] }),
    check(
      "admin_execution_credentials_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL AND ${table.masked} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL AND ${table.masked} IS NOT NULL)`
    ),
  ]
);
```

**One real FK the ADR-058 precedent does *not* have, and could have:** `settingValuesUser`'s comment
(`src/db/schema.ts:209-216`) says `principal_id` carries no FK because "identity has no SQLite adapter
yet... there is no SQL table to reference." **That claim is stale** — `principals`
(`src/db/schema.ts:716`) is a real SQL table with a real SQLite adapter (`src/identity/repo.sqlite.ts`),
landed in a later commit than the comment. This table can and should carry a real
`references(() => principals.id)` FK — cleaner than the precedent it's borrowing its composite-key idea
from. Flagged here rather than silently "fixed" elsewhere, since `settingValuesUser`'s own FK is a
separate, unrelated table this task must not touch.

`providerId`/`maxTokens` are additions beyond ADR-058's shape because `ResolvedByokCredential`
(`byok-credential.ts:26-32`) and `ByokConfig` both carry them — dropping them would silently lose the
active provider preset and the token cap on every save.

**Scoped out of v1, flagged for the owner:** `execution-settings.ts`'s `StoredCredentials` also caches
`savedByProviderId` — draft credentials for *other* providers the admin isn't currently using, so
switching providers doesn't require retyping. This design does **not** replicate that server-side: it
would mean storing N sealed rows per admin instead of one, multiplies the CHECK/mask bookkeeping by N,
and drafts-for-a-provider-you're-not-using is a convenience feature, not the credential this task exists
to secure. Recommend v1 stores only the **active** credential; `savedByProviderId` either becomes
browser-local-only convenience state (non-secret parts only — no keys) or is dropped. This needs an
explicit owner call, not an architect's default.

---

## 3. Migration

- **Next number: `0026`** (`0025_nappy_blacklash.sql` is ADR-058's site-credential migration, already
  generated on this branch — confirmed via `_journal.json`, idx 25).
- Standard `drizzle-kit generate` output: one `CREATE TABLE admin_execution_credentials (...)` with the
  CHECK constraint, matching `0025`'s shape 1:1 except for the composite PK and the extra columns.
- **No data migration.** Confirmed: the only existing source of admin BYOK keys is
  `window.localStorage` in each admin's own browser (`execution-settings.ts:75`,
  `CREDENTIALS_STORAGE_KEY = "tovu:execution-credentials:v1"`), which the server cannot read. **Every
  admin re-enters their key once** after this ships — a known, one-time, unavoidable cost, not an
  oversight. No backfill logic is needed or possible.
- No SQL FK from `siteAssistantCredentials`/other tables changes. `workspaces`/`principals` gain no new
  columns — only new inbound FKs from the new table (`onDelete: "cascade"`: deleting a workspace or a
  principal should take its stored BYOK key with it, not orphan a live encrypted secret).

---

## 4. Route surface

Mirrors ADR-058's write-only three-route shape exactly, with the scope narrowed to "the calling
principal's own row" — there is no cross-admin read/write here, so no `:principalId` path segment is
needed or wanted; the principal always comes from the session (`getAuthedPrincipal`), never from the
request:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential` | `{ data: { isSet, masked, protocol, providerId, baseUrl, model, maxTokens, updatedAt } }`. Pure DB read (`masked` is a plain column, same as ADR-058 §3) — never decrypts, never fails on a misconfigured master secret. |
| `PUT` | same path | Body `{ apiKey?, protocol?, providerId?, baseUrl?, model?, maxTokens? }`. Omitted `apiKey` leaves the stored key untouched; empty string rejected (400) — same contract as `setSiteAssistantCredential`. New key → `503 SECRET_STORE_UNCONFIGURED` if `TOVU_INTEGRATIONS_ROOT_KEY` is absent, before any DB write. Response never echoes the key. |
| `DELETE` | same path | Clears the five sealed-blob columns only; `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens` are left as-is (ADR-058 §8's "deleting the key ≠ resetting the row," applied here too). |

- `:workspaceId` path param kept for consistency with the ADR-058 route family (`get/put/delete-site-
  credential.ts`) even though `RouteDeps.workspaceId` is already fixed per process — same defense-in-
  depth 404-on-mismatch check those routes already do (`String(req.params.workspaceId) !==
  deps.workspaceId`).
- **Auth gate:** `requireAdminSession` (already wraps `BYOK_TURN_PATH` in `assistant-byok.ts:117`) is
  sufficient — the row is inherently self-scoped to `getAuthedPrincipal(res).id`, so there is no second
  admin's data this session could reach even without an extra RBAC permission check. Recommend **not**
  reusing `ADMIN_ASSISTANT_PERMISSION` here (that permission gates the *site's* assistant settings,
  ADR-058's different trust boundary) — if the owner wants to restrict who may configure their own BYOK
  key, that's a new, narrower permission, not this one repurposed.
- Route files: `src/server/routes/admin/assistant/{get,put,delete}-execution-credential.ts`, same
  directory as the ADR-058 trio, same `AssistantSettingsRouteRegistrar` type.

---

## 5. Blast radius (and the header's claim, checked)

`byok-credential.ts`'s header claims: *"When the new table lands, only `ExecutionCredentialPort`'s
implementation needs to change... `assistant-byok.ts` and everything downstream of `resolve()` stays as
written."*

**That claim does not hold as written — the interface itself has to change, not just its
implementation:**

1. **`resolve()`'s signature has no identity in it.** Today: `resolve(input: { requestBody:
   RequestSuppliedByokConfig }): ResolvedByokCredential | null`. A stored-credential implementation has
   to know *which* `(workspaceId, principalId)` row to read — that information exists at the call site
   (`assistant-byok.ts:149-150`, `getAuthedPrincipal(res)` + `routeDeps.workspaceId`) but is never
   passed into `resolve()`. The port's input shape must grow to `{ requestBody, workspaceId,
   principalId }`. This is a contract change, not an implementation swap.
2. **`resolve()` is synchronous today; a DB read + decrypt cannot be.** `createRequestSuppliedExecution
   CredentialPort` returns a plain value because it does no I/O. `createStoredExecutionCredentialPort`
   needs `repo.findBy...()` (async) and `sealer.open()` (async — see `SecretSealerPort.open()`,
   `ports.ts:96`, returns `Promise<string>`). So `ExecutionCredentialPort.resolve()`'s return type must
   become `Promise<ResolvedByokCredential | null>`, and its one call site
   (`assistant-byok.ts:140`, `const credential = credentialPort.resolve(...)`) needs an `await` added.
   That is a one-line change, but it is a change to a file the header says "stays as written."
3. **Fallback semantics need a decision the header doesn't make.** Once a stored credential exists,
   what happens when the browser *also* sends a `requestBody.byok` config on a given turn (e.g. the
   admin is trying a key they haven't saved yet)? Recommend mirroring the pattern
   `execution-settings.ts`'s `CreateExecutionPortOptions.useStoredCredential` already established for
   the sibling test-connection/list-models routes (`execution-settings.ts:376-391`): request-supplied,
   non-empty `apiKey` wins (lets an admin test an unsaved key without saving it first); an omitted/empty
   `apiKey` falls back to the stored row. This needs `resolve()`'s stored-backing implementation to do a
   DB lookup only when the request didn't already supply a usable credential — the same "explicit
   beats implicit" resolution order the existing client-side flag already models, so this is not a new
   pattern, just the same one moved server-side.

**What genuinely does stay contained**, confirming the *spirit* of the header's claim even though its
literal wording is wrong: `byok-provider-turn.ts`, `byok-tool-surface.ts`, the SSE framing, the tool-
execution path, and `SYSTEM_PREAMBLE` are all untouched — none of them see the credential resolution
change at all, only the ~3 lines around `credentialPort.resolve(...)` in `assistant-byok.ts` do. The
seam is real and does contain the blast radius to "one file's edge," it just isn't literally zero
touched lines in that file. Worth fixing the header comment in Phase 2 so the next reader isn't misled
the way this design pass nearly was.

### Full file/module list

1. **`src/db/schema.ts`** — add `adminExecutionCredentials` table (§2).
2. **`src/db/drizzle/0026_*.sql`** — generated migration (§3).
3. **New: `src/assistant/execution-credential-store.ts`** — mirrors `site-credential-store.ts` 1:1:
   `getExecutionCredential` (read model, no decrypt), `setExecutionCredential` (validate-then-seal-then-
   upsert), `deleteExecutionCredential` (clear key only), `resolveExecutionCredential` (runtime read
   path — but unlike ADR-058 §6 there is no env-var fallback to degrade to; "no stored key and no
   request-supplied key" is just `null` → the existing 400 `assistant-byok.ts:141-147` already returns).
4. **New: `src/db/sqlite/execution-credential-repo.sqlite.ts`** + an in-memory counterpart (rule-of-two,
   matching `site-credential-repo.sqlite.ts` / `.memory.ts`).
5. **`src/assistant/byok-credential.ts`** — widen `ExecutionCredentialPort.resolve()`'s input to include
   `workspaceId`/`principalId`, make it `Promise`-returning (§5 above), add
   `createStoredExecutionCredentialPort(deps)` alongside the existing request-supplied one, and correct
   the header's "only the implementation changes" claim.
6. **`src/server/modules/assistant-byok.ts`** — `await credentialPort.resolve({...})`, pass
   `workspaceId`/`principalId` through; swap which port factory is constructed at module-composition
   time (`createStoredExecutionCredentialPort(routeDeps)` in place of
   `createRequestSuppliedExecutionCredentialPort()`).
7. **New: `src/server/routes/admin/assistant/{get,put,delete}-execution-credential.ts`** — the three
   routes (§4), registered alongside the existing site-credential trio.
8. **`src/server/deps.ts`** — construct/wire the new repo adapter; **reuse** the existing
   `AesGcmSecretSealer` + `EnvOrFileKeyring(allowFileFallback:false)` instances ADR-058 wires (do not
   construct a second keyring — see §2's sealer-reuse note).
9. **`apps/admin/src/lib/execution-settings.ts`** — replace `readStoredCredentials`/
   `writeStoredCredentials` (localStorage) with calls to the three new routes; `loadExecutionConfig`/
   `saveExecutionConfig` are already `async`, so the call shape doesn't change, but the **write-only**
   contract means `loadExecutionConfig` can no longer return a real `apiKey` string into React state —
   this is the identical `ByokProviderForm` gap ADR-058 already flagged and deferred
   ("Open item carried to Phase 3" in that ADR) — same fix needed here, same deferral, not a new
   problem to re-solve.
10. **New API client methods** in `apps/admin/src/lib/api.ts` (or wherever `api.getSettingsEffective`/
    `api.setSetting` live) for the three new routes.
11. **Admin UI** (Settings → Execution mode's BYOK card) — swap the plaintext `apiKey` field for a
    masked-placeholder + "isSet" affordance, per the same Phase-3-deferred wrapper ADR-058 already
    specified rather than reusing `ByokProviderForm`'s key field.

---

## 6. Stale `localStorage` key — recommendation

**Do not silently upload or silently clear it.** Two failure modes to avoid: (a) auto-POSTing whatever
is sitting in `localStorage` to the new server route the first time the new code runs — that sends a
secret the admin never took a server-directed action to save, without their in-the-moment consent; (b)
silently deleting it — an admin who hasn't opened Settings since the deploy would find BYOK mode just
stops working, with no explanation.

Recommend: on first load of the reworked Execution-mode screen, if `localStorage` still holds a non-
empty `CREDENTIALS_STORAGE_KEY` value, show a one-time "We found a saved key in this browser — save it
to your account?" prompt. Only on explicit confirm does it PUT to the new route; only after that PUT
succeeds does the code clear the `localStorage` entry. If the admin declines or never revisits the
screen, the stale entry stays inert (dead value, unread by anything once the port is swapped) until they
either confirm the migration or just type a fresh key — either way nothing is sent anywhere without an
explicit action.

---

## 7. Security notes flagged during this pass

- **Fail-closed on PUT, matching ADR-058 §4:** a new key must never be accepted and silently no-op'd or
  written as plaintext if `TOVU_INTEGRATIONS_ROOT_KEY` is absent — the `503
  SECRET_STORE_UNCONFIGURED` branch is not optional, and must be checked *before* touching the DB
  (`setSiteAssistantCredential`'s `try { sealer.seal(...) } catch { throw
  SiteAssistantSecretStoreUnconfiguredError }` pattern, reused verbatim).
- **Never echo, never log.** All three new routes must follow `put-site-credential.ts`'s exact discipline
  — the response body's `{data}` envelope only ever carries `{isSet, masked, ...}`, never `apiKey`, and
  no route handler or error branch should `console.error`/log the request body wholesale (a caught
  validation error today logs `err.message` only, never `req.body` — keep it that way here too).
  Because I read `byok-credential.ts` and the site-credential files for this design, I want to be
  explicit that I encountered no plaintext keys anywhere in the current code — the existing
  `createRequestSuppliedExecutionCredentialPort` correctly treats the key as pass-through-only and never
  persists or logs it.
- **The settings-ledger trap ADR-058 already named applies identically here.** Nothing about this
  credential should ever be registered as a `core.execution.*` `setting_definitions` entry — same
  ADR-028 §6 gate, same append-only-revision-history mismatch for secret material. This design keeps it
  in its own table for exactly that reason; a future contributor "simplifying" by folding it into the
  ledger would reopen the exact problem ADR-058 solved for the sibling credential.
- **Row-level isolation is structural, not just enforced by the route.** Because the composite PK is
  `(workspace_id, principal_id)` and every repo method should require both, there is no query shape that
  can accidentally return admin A's key to admin B's session — worth a repo-level test asserting a
  `findByWorkspaceAndPrincipal` call with the wrong `principalId` returns `null`, not another row.
- **`onDelete: "cascade"` on both FKs is a real deletion of secret material, not a soft state.** Worth a
  test confirming that deleting a `principals` row (an admin account being removed) actually drops the
  sealed row rather than orphaning it — an orphaned sealed row with no owning principal is exactly the
  kind of "half-alive" secret this design otherwise goes out of its way to avoid (cf. the CHECK
  constraint's totality discipline).

---

## Summary for the owner

- **Scope: per `(workspace_id, principal_id)`.** Reasoning in §1 — matches current multi-admin
  `localStorage` behavior, has a direct structural precedent (`settingValuesUser`), and avoids a
  silent-overwrite regression a workspace-only key would introduce.
- **Table DDL:** §2 — same sealed-shape/CHECK convention as `siteAssistantCredentials`, composite PK
  instead of workspace-only, `providerId`/`maxTokens` added to match `ByokConfig`. `savedByProviderId`
  (multi-provider drafts) is explicitly scoped OUT of v1 — flagged for an owner decision, not assumed.
- **Migration:** `0026`, no data to carry forward, confirmed one-time re-entry cost for every admin.
- **Routes:** GET/PUT/DELETE at `/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential`,
  gated by `requireAdminSession` alone (no extra RBAC permission needed — the row is self-scoped).
- **Blast radius:** 11 files/modules (§5) — bigger than "swap one factory function" because
  `ExecutionCredentialPort.resolve()`'s signature (identity-less, synchronous) cannot actually express a
  stored-credential lookup as-is.
- **Contradicts the brief's assumption:** `byok-credential.ts`'s header claim that only the port's
  *implementation* needs to change is **not accurate** — the *interface* needs `workspaceId`/
  `principalId` added and needs to become `Promise`-returning, which touches `assistant-byok.ts` (one
  `await`, one param pass-through) even though the turn-handling logic itself is untouched. The seam
  still successfully contains everything else (tool execution, SSE framing, system prompt) — it just
  isn't the literal zero-touch swap the comment promises.
- **Also found and worth a one-line fix in Phase 2:** `settingValuesUser`'s schema comment says identity
  has no SQL adapter — that's stale; `principals` is a real table with a real SQLite adapter today, and
  this design's table takes a real FK to it that the older table's comment claims isn't possible.
- **No plaintext-key handling issues found** in the code read for this design — the existing
  request-supplied port and ADR-058's write-only routes are both clean on this front; the new design
  copies their discipline rather than inventing anything new.

Awaiting owner sign-off before any implementation begins.
