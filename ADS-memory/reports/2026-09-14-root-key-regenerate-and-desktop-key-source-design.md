# Site token (root key) regenerate + packaged desktop key source — design

- Date: 2026-09-14
- Author: dispatched design agent (coordinator tovu-e6)
- Status: DESIGN ONLY — no code edited, nothing committed, nothing run that decrypts data
- Context estimate at this write: ~165k tokens (facts section written first; designs appended after)

## Summary in plain language

**What.** Two designs:
1. A safe way to replace the site token if it may have leaked.
2. A token source for the packaged desktop app.

**Why.**
- Today there is no way to change the token. Changing it by hand would make every saved password and API key
  unreadable, and the app would call them "not configured".
- The packaged app has no token unless someone clicks Generate. Worse, a newsletter or webhook action can
  quietly create one plain file that every site on the computer then shares.
- An API key, or a custom role that can manage integrations, can currently reveal the token.

**Effect, if the recommendations are taken.**
- **Replace token:** the old and new tokens both stay loaded while each saved credential is re-encrypted. A
  backup is taken first, and the job picks up where it left off after a crash. The old token is removed only
  when you say so and nothing is left locked. A token set as a server environment variable (your install)
  gets exact steps and a `tovu keys` command instead of a button.
- **Desktop:** each site gets its own token file in the app's data folder, handed to that site's server. No
  Keychain (it froze this app before). A site moved to another computer shows "Locked — paste this site's
  token" instead of silently failing.
- **Security fixes that can ship now:** block API keys from Reveal/Generate, stop browsers caching the
  revealed value, record every reveal, and correct stale labels.

**Brief items already settled:**
- The code confirms `03b2912a352b` is a safe fingerprint (first 12 hex characters of SHA-256 of the key).
- The "Root key" card was renamed "Site token" in `27e16a1e`; a few error messages still say "root key".
- The owner has three decisions to make (§7).

## Bootstrap confirmation

Loaded: `AI-Dev-Shop/agents/software-architect/skills.md`, `AI-Dev-Shop/agents/security/skills.md`,
`ADS-memory/governance/constitution.md`. `AI-Dev-Shop/AGENTS.md` skipped per the `<<SUBAGENT_DISPATCH>>`
marker (CLAUDE.md rule). All ten memory files named in the brief exist and were read as claims.

No secret values were read or printed. The only key-related probes were existence checks
(`test -f`) and a count of non-empty `TOVU_INTEGRATIONS_ROOT_KEY=` lines in `.env`.

---

## 1. Facts (verified from code, file:line)

### F1. Where the root key comes from

| Source | Detail | Evidence |
|---|---|---|
| Env var `TOVU_INTEGRATIONS_ROOT_KEY` | Checked first. Hex, even length. **No minimum length** — a 1-byte key is accepted. | `apps/website/src/features/webhooks/keyring.env.ts:50`, `:160-167` |
| Key file, local mode | `~/.tovu/integrations-root-key.hex` | `keyring.env.ts:69-74` |
| Key file, production mode | `<cwd>/sites/.tovu/integrations-root-key.hex` (Fly volume) | `keyring.env.ts:70-72`; mode from `TOVU_RUNTIME_MODE === "production"`, `apps/website/src/contracts/core/runtime-mode.ts` |
| Auto-generated file | 32 random bytes, `0600`, written on first use **only if the instance allows it** | `keyring.env.ts:182-192` |
| Admin "Generate" | Same file, create-only, 409 if file exists or env var active | `keyring.env.ts:333-343`; `server/inbound/admin-http/routes/system/site-token.ts:107-140` |

- The file branch does **no hex validation** when the keyring reads it (`keyring.env.ts:176-179`);
  only the status/boot-gate path validates (`keyring.env.ts:198-200`, `:239-250`). In local mode no
  gate runs, so a corrupt file would silently become a short/empty key (INFERRED: Node's
  `Buffer.from(s, "hex")` stops at the first invalid pair rather than throwing).
- Each `EnvOrFileKeyring` caches the key for the life of the process (`keyring.env.ts:119`, `:158`).
- `keyId` is the constant `"v1"` on every instance (`keyring.env.ts:81`, `:124`, `:129-131`). No rotation
  exists anywhere.

**Three keyring configurations** (all in `apps/website/src/server/runtime/composition/deps.ts`):

| Instance | Options | Effect |
|---|---|---|
| `newsletterKeyring` (webhook signing, newsletter unsubscribe) | `allowFileFallback: runtimeMode !== "production"` | Local mode: reads **or auto-mints** the file. Production: env only. `deps.ts:1169` |
| `siteAssistantSecretKeyring` + `siteAssistantSecretSealer` (every stored credential) | `allowFileFallback: true, allowFileAutoGenerate: false` | Reads env or file, never mints. `deps.ts:1197-1198` |
| Backfill scripts | `allowFileFallback: false` | Env only. `development/scripts/aad-backfill-runner.ts:226`, `:234` |

In-memory composition uses `InMemoryKeyring` (`composition/app.ts:489`, `:499`).

**How each process gets it:**
- Web server: `apps/website/src/index.ts:258` → `createSqliteRouteDeps()` → `deps.ts` keyrings above.
- Agent daemon: `server/inbound/assistant/agent-daemon-server.ts:338` → `composition/agent-daemon-deps.ts:32-33`
  → `createSqliteRouteDepsForWorkspace` → its **own** keyring instances. Spawned with
  `{ ...process.env, ...overrides }` (`server/runtime/lifecycle/daemon-supervisor.ts:457-462`), so it
  inherits the env var. The daemon uses `routeDeps.siteAssistantSecretSealer/Keyring`
  (`agent-daemon-server.ts:1175-1176`, `:1206`).
- So two long-lived processes each hold an independently cached copy.

### F2. Derivation

- HKDF-SHA256, fixed salt `tovu-integrations-root-key-hkdf-v1`, 32-byte output (`keyring.env.ts:43-45`, `:140`, `:148-150`).
- Sealer AES key = `derive({ workspaceId: "secret-sealer", purpose: "secret-sealer.v1", info: keyId })`
  (`features/webhooks/secret-sealer.aesgcm.ts:51-54`, `:138-140`). **One AES key per keyId for the whole install.**
- `open()` re-derives from the row's stored `keyId` (`secret-sealer.aesgcm.ts:121`), but the keyring holds
  exactly one root key, so a stored `keyId` cannot select a *different* root key today. The seam is named
  (`ports.ts:46-50`) but not built.

### F3. Ciphertext format

- `SealedSecret = { keyId, ciphertext: base64(ct || 16-byte tag), nonce: base64(12-byte IV), alg: "aes-256-gcm" }`
  (`features/webhooks/types.ts:187-195`; `secret-sealer.aesgcm.ts:84-99`).
- Stored as four text columns `sealed_key_id / sealed_ciphertext / sealed_nonce / sealed_alg` per table.
- AAD is optional per call, bound via `setAAD`, never stored, re-derived from row identity at open
  (`secret-sealer.aesgcm.ts:88-90`, `:130-132`). Every production `seal()` passes it (`seal-aad-invariant.ts:145-205`).
- **There is a key id column but every value is `"v1"`; there is no per-key version beyond that.**

### F4. Everything encrypted with it (SQLite `schema.ts`; seal/open call sites)

| # | Table (schema.ts line) | What | AAD version column | seal | open |
|---|---|---|---|---|---|
| 1 | `site_assistant_credentials` (1497) | BYOK AI key | `aad_version` 1531 | `assistant/site-credential-store.ts:216` | `:346` |
| 2 | `admin_execution_credentials` (1568) | per-admin AI key | `aad_version` 1598 | `assistant/execution-credential-store.ts:256` | `:398` |
| 3 | `publish_credential_sets` (1661) | publish tokens | born with AAD | `features/deployments/publish-credentials/store.ts:264` | `:544` |
| 4 | `source_control_credential_sets` (1829) | GitHub/GitLab/Bitbucket | born with AAD | `features/source-control/store.ts:231` | `:432` |
| 5 | `custom_credential_sets` (1912) | custom providers, mailer | born with AAD | `features/custom-credentials/store.ts:281` | `:540` |
| 6 | `vendor_credential_sets` (2040) | unified vendor creds | born with AAD | `features/vendor-credentials/store.ts:336` | `:567` |
| 7 | `media_provider_credentials` (2101) | media provider keys | `aad_version` 2128 | `features/media/provider-credential-store.ts:272` | `:442` |
| 8 | `composio_config` (2165) | Composio API key | `aad_version` 2204 | `platform/connectors/composio-config-store.ts:236` | `:162`, `:210` |
| 9 | `external_mcp_servers` (2257) — **two blobs** | MCP env + OAuth client secret/tokens | `aad_version` 2355, `oauth_aad_version` 2362 | `assistant/external-mcp-store.ts:1462`, `:1694` | `:693`, `:1645` |
| 10 | `oauth_pending_authorizations` (2407) | PKCE verifier, TTL-bound | — | `platform/db/sqlite/oauth-pending-store.sqlite.ts:145` | `:194` |
| 11 | `oauth_device_authorizations` (2446) | device code, expiring | — | `oauth-pending-store.sqlite.ts:243` | `:276` |
| 12 | `composio_connector_credentials` (2492) | connector creds | `aad_version` 2514 | `platform/connectors/connector-credential-store.ts:178` | `:113` |

**12 tables, 13 sealed blob kinds, 13 production `seal()` sites.** All use the one
`siteAssistantSecretSealer` (`deps.ts:1198`; passed at `:1210-1211`, `:1229`, `:1257`, `:1310`, `:1332`).
`IntegrationSecretRepoPort` (`ports.ts:192-197`) has no implementation — no `integration_secrets` data.

**Dialects:** SQLite is the only runtime dialect. `schema.postgres.ts` mirrors the sealed columns, but
`platform/db/postgres/db-ops.ts` is evaluation-only ("no live `pg` client") and nothing under
`platform/` imports `pg`. No MySQL schema exists in `platform/db/`.

### F5. Values *derived* from the root key (not stored — they change when the key changes)

| Value | Where | Rotation effect |
|---|---|---|
| Webhook signing secrets | `keyring.env.ts:133-141` via `signing.keyring.ts:29`, wired `deps.ts:1417` | Every receiver's copied secret stops verifying. `types.ts:35`, `:69-70` model a per-subscription overlap window; rotation is not built (`subscriptions.ts:63`, `:126`). |
| Newsletter unsubscribe tokens | `features/newsletter/unsubscribe.ts:53-57` (`purpose: "newsletter-unsubscribe"`) | **Every unsubscribe link already emailed stops working.** |
| Analytics salt | separate `ANALYTICS_ROOT_KEY_SEED` (`boot/boot-readiness-gate.ts:43`; `features/analytics/salt.ts:6-27`) | Not affected. |

### F6. The fingerprint (`03b2912a352b`)

- `sha256(raw key bytes)` hex, first 12 chars = 48 bits (`keyring.env.ts:209-211`). Returned by GET status,
  reveal, and generate (`site-token.ts:95-99`, `:101-105`, `:125-130`). Shown with a "Fingerprint" label and
  tooltip (`apps/admin/src/features/security/SiteTokenTab.tsx:129-134`, added in `27e16a1e`).
- **Safe to show** for a random 32-byte key: a truncated SHA-256 gives nothing usable toward the key.
  Caveat: it confirms a guess. Because F1 allows short or low-entropy operator-chosen env values, a
  fingerprint plus a weak key allows offline guess confirmation. Keep it; enforce key strength (§3.4).

### F7. Routes, Reveal, and real authorization

- Routes: `GET` status, `POST /reveal`, `POST /generate` under
  `/api/admin/v1/workspaces/:workspaceId/system/site-token` (`site-token.ts:76`, `:94-140`), registered at
  `composition/app.ts:1142`.
- Layer 1: blanket `app.use("/api/admin", requireAdminSession(deps))` (`composition/modules/core.ts:43`).
- Layer 2: per-verb `authorize({ permission: "admin.security.tokens.manage" })` (`site-token.ts:81-92`;
  `authorize-guard.ts:39-55`). **Real, not decorative.**
- Who holds the permission:
  - owner, via `*` wildcard (`site-token-permission.ts:38-40`);
  - built-in `admin` role (`site-token-permission.ts:74-83`);
  - **any policy that holds `admin.integrations.manage`**, via a permission migration
    (`site-token-permission.ts:64-72`), so a custom role given integration access also gets Reveal.
  - editor/viewer: no.
- **API keys reach Reveal.** `requireAdminSession` accepts `Authorization: Bearer <api key>`
  (`admin-http/dev-auth.ts:42-58`, `:171-190`, `:244-256`). An API key's snapshot may carry any
  unconstrained permission its issuer holds, and the owner's `*` counts as holding every permission
  (`features/identity/api-key-service.ts:88-92`); only a literal `*` row is refused (`:264-267`). The
  site-token routes never check credential kind; only the api-keys routes do
  (`routes/api-keys/deps.ts:93-100`). **An owner or admin can mint an API key that can `POST /reveal`
  and receive the raw key.** A leaked API key then exposes every stored credential.
- No audit record on reveal (`site-token.ts:60-63`).
- Client gating is UX only: the tab is hidden without the permission (`Security.tsx:79-97`, `:143-155`).
- No assistant tool exposes status or reveal. The only tool text naming the root key is the webhook
  create description (`features/webhooks/agent-tools.ts:29-32`, `:169`).

### F8. What happens today when decryption fails

- **Missing key at write:** typed `*SecretStoreUnconfiguredError` → `503 SECRET_STORE_UNCONFIGURED`
  (e.g. `routes/assistant/put-site-credential.ts:33-40`).
- **At read, behavior differs per store:**
  - `site-credential-store.ts:341-352`: catches, calls `onDecryptFailure`, returns `null`, so it looks like
    "not configured".
  - vendor / source-control / publish / custom: throw `*SecretStoreUnconfiguredError` with "unconfigured,
    or the stored row is corrupted" (`vendor-credentials/store.ts:563-573`; `source-control/store.ts:432-435`).
  - `external_mcp_servers` env blob: per-server `{ok:false, reason}`, not thrown (`external-mcp-store.ts:684-704`).
    OAuth blob: throws (`:1636-1658`). The admin banner maps this to "site token isn't available"
    (`apps/admin/src/features/settings/external-mcp-admissions-rules.ts:180-181`).
- **"No key", "wrong key" and "tampered row" are indistinguishable**: all are one GCM auth-tag failure
  folded into the same "unconfigured" class. Nothing marks a row as undecryptable, and nothing deletes one.
- Consequence: swapping the key without re-encrypting makes every saved credential silently read as
  "not configured" or "corrupted".

### F9. Existing primitives a rotation can reuse

- Seal → verify → write loop, read-only dry run, and restore point before `--apply`:
  `development/scripts/aad-backfill-runner.ts:3`, `:195`, `:205`, `:226-245`.
- Restore points: `dbOps.captureRestorePoint` (`routes/database/restore-points.ts:189`;
  `features/database/gated-hooks.ts:108`); SQLite online backup (`features/plugins/snapshot.ts:66`);
  files land as `restore-point-*.db` in the site folder (`sites/README.md`).
- SQLite WAL + `busy_timeout = 5000` (`platform/db/sqlite/content-db.ts:78`, `:83`); sync
  `db.transaction(` already used by credential repos (e.g. `publish-credential-repo.sqlite.ts`).
- Migrations auto-apply when any process opens the DB (memory `migrations_auto_apply_live_db`, consistent
  with `content-db.ts`). Any new table reaches the live DB at the next open.
- `seal-aad-invariant.ts` (AST scan of every `.seal()`) is the model for a "every sealed table is
  registered for rotation" check.
- Daemon restart already exists: `POST .../system/assistant-daemon` → `restartAssistantDaemon()`
  (`routes/system/assistant-daemon.ts:77`; `daemon-supervisor.ts:607`).
- Never build one generic cross-table decrypt path: each table's AAD lineage differs
  (`features/vendor-credentials/dual-read.ts` header).

### F10. Desktop app: how the key reaches the server today

- **Dev (`npm run desktop`)**: `development/scripts/dev-desktop.mjs` calls `loadRepoRootEnvFile(REPO_ROOT)`
  before anything reads env (`load-repo-root-env.mjs:36-43`; it never overrides an already-exported
  var), since `2f54011a`. `main.ts:615-622` `startTovuServer` passes no `baseEnv`, so `buildCliEnv` copies
  `process.env` (`apps/desktop/src/tovu-server.ts:263-264`, `:356-358`), dropping only `PORT`,
  `TOVU_CONTENT_DB`, `TOVU_DB` (`:272-274`). `tovu serve` spawns the daemon with `{...process.env}`
  (`daemon-supervisor.ts:457`). The `.env` key therefore reaches every site server and daemon.
- **Packaged**: the payload is only `dist/`, `apps/`, `node_modules/`, `package.json`
  (`apps/desktop/electron-builder.yml` `extraResources`), so no `.env` ships. CLI mode is compiled
  (`apps/desktop/src/packaged-paths.ts`). A Finder-launched app has no `TOVU_INTEGRATIONS_ROOT_KEY`
  (INFERRED: launchd environment). The desktop never sets `TOVU_RUNTIME_MODE` (no hits under
  `apps/desktop/`), so children run in **local** mode.
- **Packaged app with no key, per code (not run):**
  1. Saving any credential → `siteAssistantSecretKeyring` finds no env and no `~/.tovu` file → **fails
     closed with 503**. Existing sealed rows fail to open.
  2. **But** `newsletterKeyring` in local mode auto-mints `~/.tovu/integrations-root-key.hex` the first time
     a webhook is signed or an unsubscribe link is built (`deps.ts:1169` + `keyring.env.ts:182-192`). That
     unattended file then silently becomes the credential-sealing key too, because
     `siteAssistantSecretKeyring` reads the same default path.
  3. The Site Token tab's Generate works in local mode and writes the same `~/.tovu` file.
  4. That one plaintext file is shared by **every site** that OS user opens.
- **Keychain was tried and banned.** `apps/desktop/src/desktop-auth.ts:10-19`: `safeStorage.isEncryptionAvailable()`
  returned true, then storing failed with a blocking native modal ("A keychain cannot be found to store
  'tovu-desktop Key'"). Its words: "**Do not reintroduce OS credential storage in this shell.**" Commits
  `2aa317ab`, `15548bef`.
- Desktop invariant (memory `desktop_no_site_password`, consistent with `tovu-server.ts:11-14`): the server
  must not learn a desktop shell exists. Env and CLI args set by the shell are the sanctioned seam.
- On this machine: `~/.tovu/integrations-root-key.hex` absent; `sites/.tovu/` absent; repo `.env` has
  one non-empty `TOVU_INTEGRATIONS_ROOT_KEY` line. So the owner's install is env-sourced, which matches
  "Active — environment variable".

### F11. Naming and stale copy

- Tab label "Site Token" (`Security.tsx:149`); card heading "Site token" (`SiteTokenTab.tsx:126`), renamed
  from "Root key" in `27e16a1e`.
- Still inconsistent:
  - error copy says "root key" (`security-i18n.ts:103`, `:123`);
  - AI screens say "encryption master key" + env var name (`apps/admin/src/features/ai-assistant/rules.ts:33`;
    `hooks/use-admin-execution-credential.hooks.ts:99`);
  - server 503 bodies name the env var (`put-site-credential.ts:36-38`).
- **Stale agent label**: `Security.tsx:152` says the tab manages "the root key file that decrypts webhook
  signing and newsletter tokens on a local install". That is wrong: it protects every stored credential.
- **Stale operator copy**: `apps/admin/src/features/deployment/rules.ts:615` says "Not required to boot",
  but the production gate is boot-blocking (`features/deployments/deploy-config.ts:190`;
  `boot-readiness-gate.ts:71`).
- **False code comment**: `composition/app.ts:1138-1141` says the tab "does NOT seal any stored credential,
  and does NOT help a production boot with the env var unset". Both are false since the 2026-09-09 fix
  (`boot-readiness-gate.ts:71`; `deps.ts:1197`).

---

## 2. Premises that were wrong or stale

| # | Premise (brief or memory) | Reality |
|---|---|---|
| P1 | "The tab says 'Site Token' but the card says 'Root key'" | Fixed in `27e16a1e`; card now "Site token" (F11). Other copy is still inconsistent. |
| P2 | "03b2912a352b is probably a fingerprint (unverified)" | Verified: first 12 hex of SHA-256 of the key (F6). Now labelled. |
| P3 | "Confirm only admins can see / Reveal" | Owner, admin, **any custom role holding `admin.integrations.manage`**, and **any API key whose snapshot includes the permission** (F7). |
| P4 | "Packaged desktop app has no root key source" | No env source, but a plaintext `~/.tovu` file source exists, created by Generate or **silently by newsletter/webhook paths**, and shared by all sites (F10). |
| P5 | "A key set by env var can't be changed from the UI" | Correct (`site-token.ts:113-122`). |
| P6 | Memory `aad_sealing_call_site_map`: 10 stores / 11 seal sites | Now 12 tables / 13 seal sites; the OAuth pending and device stores were added (F4). |
| P7 | Memory `deployment_model` (tridialect runtime) | Already marked superseded; confirmed no runtime Postgres driver (F4). |
| P8 | `composition/app.ts:1138-1141` comment | False since 2026-09-09 (F11). |
| P9 | `Security.tsx:152` label, `deployment/rules.ts:615` note | Stale (F11). |
| P10 | `site-token.ts:60-63` "no audit mechanism exists" | Not re-verified in depth. The outbox/events spine (`contracts/core/events/`) exists and fits a domain event (INFERRED; see §3.7). |

---

## 3. Design 1 — Regenerate (rotate) the site token with re-encryption

Context estimate at this write: ~180k.

### 3.1 Options for the key model

| Option | What | Verdict |
|---|---|---|
| **A. Real key ids + active/previous keys + resumable per-row re-seal** | Each ciphertext names the key that sealed it; the keyring loads active and (during rotation) previous; a background job re-seals stale rows. | **Recommended.** |
| B. Envelope data key (DEK) wrapped by the root key | Rotation re-wraps one DEK instead of rows. | Rejected. A leaked root key plus any DB backup unwraps the DEK, so a leak rotation still re-encrypts every row. It adds a key hierarchy no current requirement needs (Art. III). |
| C. Stop-the-world swap, no key ids | Decrypt all, encrypt all, swap. | Rejected. Every row says `"v1"`, so a crash midway leaves rows whose key can only be found by trial. It also needs both processes stopped. |
| D. Change only the `keyId` label on the same root key | New HKDF info, same root. | Rejected. Does nothing against a leak. |

### 3.2 Key ids

- New seals write `sealed_key_id = "fp:" + fingerprint12(active key)`. The sealer's derivation keeps
  `info = keyId` (F2 unchanged), so each key id still has its own AES key.
- **Legacy `"v1"` rule:** `v1` resolves to the *previous* key when one is configured, otherwise the active
  key. It is deterministic, with no trial decryption. It is correct because before any rotation only one
  key exists (today's behavior), and when a rotation starts every `v1` row was sealed under the key that
  just became previous.
- Refuse the configuration (status `misconfigured`, production gate fails) when previous equals active
  (full SHA-256 compare), or when previous is set without active.
- `KeyringPort.derive` gains an optional `keyId` that selects which root key to use (default: active). The
  sealer passes it on `open`; `InMemoryKeyring` gets the same change (rule-of-two). `activeKey()` returns
  the `fp:` id of the material it just resolved.
- Unknown `fp:` id → new `RootKeyNotAvailableError { keyId }`, distinct from an auth-tag failure. For
  new-format rows this fixes F8's "no key / wrong key / tampered" blur: the UI can say "sealed with key
  03b2…, which isn't on this server".
- **v1 stamping:** the same re-seal job (§3.5), run with no previous key, re-seals `v1` rows to `fp:` ids
  under the *same* key. Run once after Phase 1 ships (restore point first). Afterwards every row names its
  key, which Design 2's lost-key and moved-site messages depend on.

### 3.3 Key sources: active and previous

| Family | Active | Previous |
|---|---|---|
| Env | `TOVU_INTEGRATIONS_ROOT_KEY` | `TOVU_INTEGRATIONS_ROOT_KEY_PREVIOUS` |
| File | `integrations-root-key.hex` at the default path, or at `TOVU_INTEGRATIONS_ROOT_KEY_FILE` | `integrations-root-key.previous.hex` in the same directory |

- Precedence for active is unchanged: env wins over file. Previous must come from the **same family** as
  active; a mixed pair is refused, because it is almost always a leftover.
- `TOVU_INTEGRATIONS_ROOT_KEY_FILE` is a generic override in the Docker-secrets `_FILE` style. It exists
  for Design 2 and carries no desktop knowledge.
- One shared resolver feeds the keyring, the status route, and the boot gate (extend today's
  `readActiveRootKeyMaterial`, `keyring.env.ts:239`). It validates hex on **every** branch, which closes
  F1's file-branch gap.
- **Reload:** a file-family keyring re-checks `(ino, size, mtimeMs)` on each resolve and re-reads on
  change. Writes are temp + fsync + rename, so a reader never sees a half file. The env family is
  restart-only.

### 3.4 Key strength

- Generated keys are exactly 32 bytes of `randomBytes`.
- An env or imported key shorter than 32 bytes gets status `weak: true`, a UI warning, and an offer to
  rotate. Boot is not refused, because that would break existing installs without warning (memory
  `no_silent_behavior_changes`). Newly imported keys shorter than 32 bytes are refused. The owner's key is
  32 bytes (length-only check), so this does not affect it.

### 3.5 Rotation flow (file-family key, from the UI or CLI)

**State.** Secrets live only in key files. Non-secret state lives in one new table,
`site_token_rotations`: `id, workspace_id, from_fingerprint, to_fingerprint, status, started_by_principal_id,
started_at, restore_point_ref, rows_resealed, locked_refs_json (table + row id only), lease_owner,
lease_expires_at, finished_at, previous_discarded_at, previous_discarded_by`. The migration is additive
and will auto-apply at the next DB open (F9).

**Steps:**

0. **Preflight (no writes).** For each registered store (below), count rows by key id and try to open every
   row not under the active key. Plaintext stays in memory and is never logged. Report the total, the rows
   to re-seal, and rows that are *already* unopenable. Show those before the owner confirms.
1. **Confirm.** Typed confirmation. The panel says what changes:
   - webhook receivers need the new signing secret;
   - a restored backup made before rotation needs the previous key;
   - **if the key leaked, replace the underlying provider keys too.** Anyone holding the old key and a
     database copy may already have decrypted them. Rotation stops future exposure; it cannot undo past
     exposure.
2. **Backup.** `dbOps.captureRestorePoint` before touching any key file. Record the ref. Abort if capture fails.
3. **Swap, in crash-safe order.** Insert the rotation row (`preparing`) first. Then:
   a. write the current active bytes to `previous.tmp`, fsync, rename to `integrations-root-key.previous.hex`,
      fsync the directory;
   b. generate 32 bytes to `active.tmp`, fsync, rename over `integrations-root-key.hex`, fsync the directory;
   c. set the row to `resealing`.
   - Crash after (a): previous equals active, which counts as no rotation. Boot deletes the redundant file
     after verifying equality and marks the row `abandoned`.
   - Crash after (b): active is new, previous is old. Boot resumes at step 5.
4. **Reload.** Both processes pick up the files through the stat check. The server also calls
   `restartAssistantDaemon()` (F9) so no daemon seal can straddle the swap on stale material.
5. **Re-seal job.** Runs in the web-server process only, under a compare-and-set lease on the rotation row
   (30 s lease, heartbeat). This is the same pattern as `platform/oauth/token-refresh.ts:20-21`, `:45-48`.
   - **Store registry** `ROTATABLE_SEALED_STORES`: 13 adapters (F4; `external_mcp_servers` contributes two).
     Each adapter lives in its own store module and exposes `listStale({ activeKeyId, limit })` and
     `reseal(row, sealer)`. Each uses its store's **own** AAD builder and `aad_version` branch; there is no
     generic cross-table decrypt (F9 `dual-read.ts`). An AST/registry check, modeled on `seal-aad-invariant.ts`,
     fails CI when a table with `sealed_ciphertext` has no adapter.
   - **Per batch (≤ 25 rows):** outside any transaction, open with the resolved key, seal under the active
     key id with the **same** AAD and `aad_version`, then open the new blob to verify (backfill-runner
     pattern). Then one sync `db.transaction` runs, per row:
     `UPDATE <table> SET sealed_key_id=?, sealed_ciphertext=?, sealed_nonce=?, sealed_alg=? WHERE <pk>=? AND sealed_key_id=? AND sealed_ciphertext=?`.
     `changes === 0` means a concurrent save already replaced the row, so skip it.
   - **Progress is the live count of rows whose key id is not active.** Counters are display only, so they
     cannot drift from the truth.
   - **Rows that won't open** are recorded as `{table, rowId, reason: "auth-tag" | "key-not-available"}`
     and left untouched. Ciphertext and plaintext are never logged.
   - **Final sweep:** after the daemon restart, one more pass must find zero stale rows before status becomes
     `resealed`.
   - **Boot resume:** whenever a previous key is present or a row is `resealing`, boot resumes the job in
     the background. This also covers a backup restored while the previous key is still present.
6. **Finish (a separate, explicit action).**
   - Precondition, checked in one transaction: zero rows with a non-active key id, and zero locked rows
     (each was re-entered or discarded, §3.6).
   - Delete `integrations-root-key.previous.hex`. Disclose that APFS/SSD gives no secure erase: rotation
     limits the key's *validity*, not the bytes' lifetime.
   - Offer to delete the pre-rotation restore point. It holds ciphertext under the old key, which is a
     liability after a leak. It is offered, not automatic.
   - Status becomes `completed`; emit the event.

**Derived values during the grace window** (previous key present):
- Newsletter unsubscribe: new links are signed with active; **verification accepts active or previous**.
  Finish warns that links sent before the rotation stop working after it. No forced wait: after a leak,
  speed matters more, and a forged unsubscribe token can only unsubscribe people.
- Webhooks: dual-sign during the grace window, using the existing two-generation header format
  (`types.ts:151`). No route that gives receivers the derived signing secret was found in `routes/webhooks/`
  or `subscriptions.ts` (only the `subscriptions.ts:64` comment), so receivers may not be able to verify
  signatures today at all. INFERRED; confirm at spec time (R11).

### 3.6 Rows that cannot be decrypted

- **Never auto-deleted.** They stay and are listed as "Locked", with non-secret labels (store, name, provider).
- Actions: **Re-enter** (a new value is sealed under active) or **Discard** (typed confirmation, restore
  point already taken). Discard uses each store's own delete semantics.
- Finish stays blocked until every locked row is re-entered or discarded (owner decision D2).
- `fp:` rows can say which key they need; `v1` rows can only say "can't be opened".

### 3.7 Audit record and events

- The `site_token_rotations` row is the durable record: who, when, from/to fingerprint, counts, restore point.
- Outbox domain events carrying `rotationId` as correlation id (Art. VIII):
  `security.site-token.rotation-started`, `.resealed`, `.credential-discarded`, `.previous-discarded`.
  Add **`security.site-token.revealed`** (principal id, credential kind), which closes F7's missing reveal audit.
- Events and logs carry fingerprints only: never key bytes, ciphertext, or plaintext.
- INFERRED: `contracts/core/events/` accepts new topics without schema change. Verify at spec time.

### 3.8 Env-sourced key (the owner's install, Fly production)

**UI:** a badge "Set on the server (environment variable)", with no Rotate button. A "How to change it"
panel shows exact steps and detects live state:

| Detected state | Panel shows |
|---|---|
| no previous var | the steps below |
| previous set, stale rows > 0 | "Re-encrypting saved credentials: 7 of 12 done" |
| previous set, zero stale, zero locked | "Done. Remove `TOVU_INTEGRATIONS_ROOT_KEY_PREVIOUS` from the server and restart." |
| previous set, locked rows | the locked list (§3.6) |

**Operator CLI.** Build it as a `tovu keys` subcommand in `apps/website/src/cli/`, not a dev script, so it
ships in the Docker image and the desktop payload:
- `tovu keys status <siteDir>`: source, fingerprints, stale and locked counts. Never values.
- `tovu keys generate [--out <file>]`: prints one new 64-hex key to the operator's own terminal, or writes a 0600 file.
- `tovu keys reseal <siteDir> [--dry-run]`: steps 0 and 5 offline, restore point first. `--dry-run` uses
  `openContentDbReadOnly`, the only opener that skips migrations (memory `migrations_auto_apply_live_db`).
- `tovu keys finish <siteDir>`: checks the precondition and prints the unset instruction.

**Fly procedure:**
1. `tovu keys generate` locally.
2. `fly secrets set TOVU_INTEGRATIONS_ROOT_KEY_PREVIOUS=<old> TOVU_INTEGRATIONS_ROOT_KEY=<new>` (one restart).
3. The server boots and resumes the re-seal on its own.
4. Watch the Site Token tab or `tovu keys status`.
5. `fly secrets unset TOVU_INTEGRATIONS_ROOT_KEY_PREVIOUS`.

Dev `.env` uses the same two-variable procedure, then a restart of `npm run dev` / `npm run desktop`.
Update the `tovu-deploy-fly` skill's Rule 4 text to match.

### 3.9 Multi-process reload

Key holders: the web server, the agent daemon, and one-shot CLI/backfill processes.

- **File family:** stat check per resolve. A derive already happens once per seal/open, not per request, so
  the cost is one `stat`. Add the daemon restart at swap and the final sweep after it.
  - Rejected: `fs.watch` (event coalescing on macOS, unreliable on mounted volumes).
  - Rejected: a new IPC channel (none exists; restart already does the job).
- **Env family:** both processes restart together (Fly restarts the machine; `serve.ts` restarts its daemon child).
- `seal` always resolves active at call time, and the key id it writes is the id of the material it
  actually used, never a cached id paired with new material.
- **Race:** a seal that loaded old material just before the swap writes an old-id row. The final sweep
  catches it, and Finish's single-transaction zero-stale check is the backstop.
- **One runner:** the CAS lease (§3.5) stops two tabs, or server + CLI, from double-running.

### 3.10 Transactions per dialect

- **SQLite** (the only runtime dialect, F4): crypto runs outside; a sync `db.transaction` per batch uses
  CAS `WHERE`. WAL + `busy_timeout 5000` (F9) tolerates concurrent daemon writes. Batches of ≤ 25 keep
  lock time short.
- **Postgres** (no driver yet): the same statements in `BEGIN … COMMIT` (READ COMMITTED); CAS `WHERE`
  handles concurrent writers; check `rowCount`.
- **MySQL** (no schema yet): the same statements; no `RETURNING`, so use affected rows. The new ciphertext
  always differs from the old, so the unchanged-row edge case does not arise.
- Only portable SQL. The one new table uses text/integer columns only.

### 3.11 Reveal and visibility authorization fix

1. **Refuse API-key credentials** on `POST reveal`, `POST generate`, and every new rotate/import/discard/finish
   verb, reusing the `rejectApiKeyCredential` shape (`routes/api-keys/deps.ts:93-100`). Keep `GET` status
   open to API keys: it returns fingerprint and counts only, which is useful for monitoring.
2. **`Cache-Control: no-store`** on reveal, generate, and import responses. None is set today; under
   `admin-http/` only the media routes set it.
3. **Audit event on reveal** (§3.7).
4. **Grant scope:** stop deriving `admin.security.tokens.manage` from `admin.integrations.manage`; keep owner
   plus built-in admin. Existing grants would change → owner decision D3.
5. Rejected: step-up re-authentication. The desktop app has no password by owner ruling (memory
   `desktop_no_site_password`); session-only plus audit is the proportionate control.
6. Rejected: removing Reveal. The owner asked for it (`site-token.ts:56-59`).

### 3.12 Naming fix

The owner already chose "Site token" (worklist line 341). Use that one term in every user-facing string,
with a gloss where it first appears: "Site token — the encryption key that protects your saved credentials."

- `security-i18n.ts:103`, `:123`: "root key" → "site token".
- `ai-assistant/rules.ts:33`, `hooks/use-admin-execution-credential.hooks.ts:99`: "encryption master key" →
  "site token". The env var name appears only inside the operator instruction.
- `Security.tsx:152`: fix the agent label's wrong scope.
- `deployment/rules.ts:615`: "Not required to boot" → "Required to boot in production".
- `composition/app.ts:1138-1141`: fix the false comment.
- Keep server error bodies (operator-facing) and internal names (`TOVU_INTEGRATIONS_ROOT_KEY`,
  `EnvOrFileKeyring`) unchanged; renaming an env var breaks every deployment.

---

## 4. Design 2 — Where the packaged desktop app gets each site's token

Context estimate at this write: ~205k.

### 4.1 Additional facts

- Every served site has a non-secret random `siteId` in `.site-meta.json`, written at init
  (`apps/website/src/platform/site-dir/init-site.ts:185`, `:220-228`) and required at boot
  (`read-site-dir.ts:84-96`). `sites/tovu-com/.site-meta.json` exists.
- `duplicateSite` mints a **new** `siteId` (`duplicate-site.ts:191`) and writes `content.db` into the copy
  (`:208`). Whether it prunes the sealed tables was **not verified**.
- Permission migrations persist grant rows (`/Users/la/Programming/Jini/packages/cms/src/identity/permission-migrations.ts:109-121`).
  Unregistering one does not revoke grants already written.
- Desktop app data: `~/Library/Application Support/tovu-desktop` (`apps/desktop/src/desktop-user-data-dir.ts`),
  overridable with `TOVU_DESKTOP_USER_DATA_DIR` (`main.ts:183-184`). Packaged sites live by default under
  `~/Documents/Tovu Sites` (`packaged-paths.ts`).
- The shell reads a site's `config.json` (`apps/desktop/src/site-config.ts`), but not `.site-meta.json` today.

### 4.2 Options

| Option | For | Against | Verdict |
|---|---|---|---|
| A. Electron `safeStorage` (Keychain) wraps a generated key in app data | Key encrypted at rest by the login keychain | **Tried in this app and banned**: a blocking native modal despite `isEncryptionAvailable() === true` (`desktop-auth.ts:15-19`), which froze the user and the automation channel. Keychain access is tied to the code signature, so dev, signed, and re-signed builds diverge (INFERRED). The server can't read the Keychain, so the shell must pass the key to each child; env blocks are readable by same-user tools (memory `pgrep_fl_dumps_credentials_like_ps_eww`), so a pipe channel would be needed. | Rejected |
| B. Direct OS keychain (`security` CLI / native module) | Same | Same modal and signature problems, plus a native dependency and per-OS divergence | Rejected |
| **C. One generated key file per site, `0600`, in the app's data folder, passed by path** | No prompts, no native deps; works for existing sites and headless E2E; server stays desktop-agnostic (generic `_FILE` var); **per-site keys keep rotation inside one site server** (no cross-site coordination) and limit a leak to one site; key stays outside the portable site folder (ADR-012/ADR-024, `ports.ts:14-15`) | Plaintext at rest, protected by FileVault and the OS account. A full-machine Time Machine backup holds both key and site. Same tradeoff already accepted for the production volume (`site-token.ts:44-52`) | **Recommended** |
| D. User passphrase (argon2 is already in the payload) | Strongest at rest | A prompt every launch; a forgotten passphrase loses every credential; contradicts the owner's "no password to log in to the desktop app" (memory `desktop_no_site_password`) | Rejected as default; possible opt-in later |
| E. Keep today's shared `~/.tovu/integrations-root-key.hex` | No work | One key for all sites; silent mint by newsletter/webhook paths (F10); hidden dot-folder; rotation must coordinate every site | Rejected |
| F. Key inside the site folder | Site is self-contained | Copying or backing up the site alone hands over key + ciphertext; violates ADR-012/ADR-024 | Rejected |
| G. Packaged shell reads the repo `.env` | Zero migration | Ships dev config into a non-dev boot; `load-repo-root-env.mjs:25-27` forbids it | Rejected |

### 4.3 How option C works

**Shell (`apps/desktop`), for each site it starts:**
1. Read `siteId` from `<siteDir>/.site-meta.json`. If that fails, spawn without the override; `tovu serve`
   reports its own `SITE_DIR_INVALID`, as today.
2. `keyPath = <userData>/site-keys/<siteId>.hex`; create `site-keys/` as `0700` if missing.
3. Spawn with `TOVU_INTEGRATIONS_ROOT_KEY_FILE=<keyPath>` (`buildServeEnv`, `tovu-server.ts:356`). An
   inherited `TOVU_INTEGRATIONS_ROOT_KEY` is left alone. The operator's value wins, matching
   `buildServeEnv`'s existing rule for the daemon token, and the status badge shows "environment variable"
   so it is visible.
4. **Opening an existing site never creates the key file.** The shell creates one only when it
   **creates** a site (init) or **duplicates** one (copies the source key to the new `siteId`). Both are
   attended actions on a store that cannot yet hold anything the new key would orphan.

**Server (desktop-agnostic; builds on Design 1 §3.3):**
- Every keyring uses the one shared resolver and one policy: **no unattended mint anywhere.** Only Generate
  and Import create a key file, which fixes F10's silent mint via newsletter/webhook paths.
- An existing site with no key file:
  - zero sealed rows: the tab shows "Create site token" (today's Generate, pointed at the `_FILE` path);
    saving a credential offers "Create site token and save".
  - sealed rows present: status is **Missing** with Import / Start fresh (§4.6).
- New verbs (session-only, `no-store`, audited):
  - `POST .../site-token/import`: verifies the pasted token by opening a real sealed row with it (`fp:` rows
    by fingerprint match; `v1` rows by one trial open per store), then writes the file (`O_EXCL`, `0600`).
    A wrong token writes nothing.
  - `POST .../site-token/move-env-to-file`: writes the active env key's bytes to the `_FILE` path. Same key,
    same fingerprint, no re-encryption.
- Status adds `lockedCount`, `requiredFingerprints` (from `fp:` ids), `staleCount`, `previousPresent`.

### 4.4 Migration from the dev `.env` key

The owner's sites are sealed under the `.env` key (the UI shows its fingerprint as `03b2912a352b`).
1. In `npm run desktop` (env present), open each site → Site Token → **"Keep this site's token in the app"**
   (`move-env-to-file`). There is no re-encryption and nothing to lose; env still wins while it is set, and
   it is the same key anyway.
2. After every site is moved, remove the line from `.env` (optional for dev; required for the packaged app,
   which never sees `.env`).
3. A site opened in the packaged app before step 1 shows **Missing — paste token 03b2…**. Import verifies and
   unlocks it. CLI equivalent: `tovu keys import <siteDir> --from-env | --from-file <path>`.
4. A machine with an old shared `~/.tovu/integrations-root-key.hex`: the same Import with `--from-file`
   (verified against rows first).

### 4.5 Sites moved, copied, restored

| Case | Result | What the owner sees |
|---|---|---|
| Folder renamed or moved on the same machine | Same `siteId` → same key file | Nothing |
| Duplicated through Tovu | New `siteId`; the duplicate flow copies the key file | Nothing. If a caller of `duplicateSite` skips the copy: Locked + Import |
| Finder copy on the same machine | Same `siteId` → copies **share** a token. After one copy finishes a rotation, the other copy's credentials lock | Sites home warns when two tracked sites share a `siteId` ("use Duplicate instead") |
| Moved to another computer, or restored without app data | No key file for this `siteId` | **"Locked — this site's saved credentials need site token 03b2…"** with *Unlock with token* / *Start fresh* |
| Whole-machine Time Machine restore | Key file comes back too | Nothing |
| Old site backup restored after a rotation | Rows under the old key | Previous key still present: re-seals automatically. After Finish: Locked (intended after a leak) |

The Site Token tab adds one line near Reveal: "Save this token in your password manager — you'll need it to
open this site on another computer."

### 4.6 What the owner sees if the key is lost

- The site opens normally; pages and content are unaffected.
- Secrets → Site Token: **"Missing — 5 saved credentials are locked. They were saved with site token 03b2…."**
  Buttons: *Unlock with token*, *Start fresh* (typed confirmation; restore point first; discards only those
  credentials).
- Access Tokens, AI Assistant, MCP servers: each affected item says **"Locked — needs this site's token"** and
  links to the tab. This replaces today's "not configured" / "corrupted" blur (F8).
- Nothing is deleted automatically.

### 4.7 Multiple sites per install

- One file per `siteId`; each `tovu serve` child gets its own path. Rotate, import, and finish are per site.
- The desktop stops using `~/.tovu` (the `_FILE` override beats the default path).
- E2E runs already isolate app data with `TOVU_DESKTOP_USER_DATA_DIR`, so test key files never touch the real
  folder (memory `electron_userdata_ignores_home_override`).

---

## 5. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Rotating after a leak cannot undo exposure. Credentials already decrypted by an attacker stay compromised. | High (residual) | Rotate panel tells the owner to replace provider keys (§3.5 step 1) |
| R2 | Until Finish, the previous key and pre-rotation restore point stay on disk; a backup taken in that window holds both. | Medium | Finish offers restore-point deletion; show how long the window has been open |
| R3 | Unsubscribe links sent before Finish stop working after it (INFERRED compliance exposure). | Medium | Dual-verify during grace; explicit warning at Finish |
| R4 | Finder copies share a `siteId` and token; Finish in one copy locks the other. | Medium | Duplicate-`siteId` warning in sites home; Duplicate mints a new id |
| R5 | Plaintext key files (desktop and production file family). | Medium, accepted | Owner decision D1; same tradeoff as the production volume |
| R6 | API-key refusal and grant narrowing remove access some principals have today. | Low–Medium | Owner decision D3; release note |
| R7 | Removing the silent newsletter mint changes local dev with no env and no file: signing throws until Generate. | Low | Dev uses `.env`; clear error text |
| R8 | The new table migration auto-applies at the next DB open (F9). | Low (additive) | Ship with the code that reads it |
| R9 | The v1-stamping pass touches every live credential row once; a bug locks credentials. | High if wrong | Restore point, verify-before-write, CAS; tests run on temp DBs only, never live |
| R10 | AES-GCM is not key-committing. | Low | Routine reads never trial-decrypt; trial opens only in owner-driven Import verification |
| R11 | No receiver-facing webhook signing-secret disclosure found, so dual-sign may be moot, and receivers may not be able to verify signatures today. | Unknown (INFERRED) | Confirm at spec time; separate gap if real |
| R12 | `content/agent-plugins/tovu-deploy-fly/skills/tovu-deploy-fly/SKILL.md:125` still says the gate checks only the env var. | Low | Update with Phase 2 |
| R13 | Whether `duplicateSite` carries sealed tables is unverified; the key-copy step assumes it does. | Low | Verify before Phase 4 |

---

## 6. RED test list

Every assertion is exact (memory `assert_exact_error_text`); none runs against the live DB.

**Phase 0 — hardening**
- T01 Reveal with an API key whose snapshot holds `admin.security.tokens.manage` → `403`, `reason: credential_kind_not_permitted`, body has no `hex`.
- T02 Generate with that API key → `403`, no file written.
- T03 GET status with that API key → `200`, `fingerprint` present, no `hex`.
- T04 Reveal and generate responses carry `Cache-Control: no-store`.
- T05 Reveal emits `security.site-token.revealed` with principal id + credential kind; the serialized event contains neither the key hex nor its base64.
- T06 `EnvOrFileKeyring` reading a non-hex key file throws a typed error (today it silently truncates).
- T07 A 2-hex-char env key → status `weak: true`; production boot is **not** refused.
- T08 `Security.tsx` site-token agent label no longer claims "webhook signing and newsletter tokens" scope.
- T09 Deployment overview note for the key reads as required in production (exact string).
- T10 `security-i18n.ts` load/reveal errors say "site token".

**Phase 1 — key ids and sources**
- T11 Every one of the 13 store write paths writes `sealed_key_id = "fp:" + sha256(active)[0..12]` (registry-wide, so no single arm is missed).
- T12 A `v1` row opens under active when no previous key is configured (today's behavior pinned).
- T13 A `v1` row opens under previous when previous is configured, and fails under active-only.
- T14 An `fp:` row matching neither key → `RootKeyNotAvailableError` carrying its key id, not a generic auth error.
- T15 Previous equal to active → status `misconfigured`; production gate fails with a distinct code.
- T16 Env previous + file active (mixed family) → refused.
- T17 A file-family keyring picks up an atomically renamed key file without restart.
- T18 `TOVU_INTEGRATIONS_ROOT_KEY_FILE` is used for read and Generate; the env var still wins.
- T19 Registry invariant: a fixture table with `sealed_ciphertext` and no adapter fails the check.
- T20 The newsletter keyring with no env and no file does **not** create a file.

**Phase 2 — re-seal job and CLI**
- T21 Re-seal converts stale rows across all 13 adapters; each opens with its own AAD; `aad_version` unchanged.
- T22 Job killed after batch k, then rerun → all rows `fp:active`, all open.
- T23 A concurrent save between compute and write → CAS changes 0 rows; the user's value is preserved.
- T24 Crash after previous written, before active swapped → boot removes the redundant previous; row `abandoned`.
- T25 An unopenable row is recorded (table, id, reason) and left byte-identical; other rows finish.
- T26 Finish refuses with stale or locked rows present; at zero it deletes the previous file.
- T27 Restore point captured before any key-file write; a capture failure changes no file.
- T28 A second runner cannot acquire a live lease.
- T29 An unsubscribe token signed under previous verifies during grace, and fails after Finish.
- T30 No log line or event from the job contains key hex, ciphertext, or plaintext.
- T31 `tovu keys reseal --dry-run` leaves `__drizzle_migrations` and the DB file mtime unchanged.
- T32 `tovu keys status` output contains no 64-hex string.

**Phase 3 — admin UI**
- T33 Env source: no Rotate button; the steps panel's state line matches server counts.
- T34 File source: Rotate requires typed confirmation and shows the leak warning (exact copy).
- T35 The locked list shows non-secret labels only; Discard requires typed confirmation.
- T36 Playwright screenshots of every new state before "done" (memory `ui_fix_needs_visual_check_before_done`).

**Phase 4 — desktop**
- T37 `buildServeEnv` sets `TOVU_INTEGRATIONS_ROOT_KEY_FILE` to `<userData>/site-keys/<siteId>.hex`; an inherited `TOVU_INTEGRATIONS_ROOT_KEY` is untouched.
- T38 Opening an existing site creates `site-keys/` as `0700` and never creates the key file.
- T39 Creating a site through the shell mints the key file (`0600`, `O_EXCL`); a second attempt doesn't overwrite.
- T40 Import with a wrong token → refused, nothing written; the right token (verified by opening a real sealed row) → file written, rows open.
- T41 Move-env-to-file writes the same fingerprint; after restart without the env var, credentials open.
- T42 Two tracked sites with the same `siteId` → sites home warning.
- T43 With `TOVU_DESKTOP_USER_DATA_DIR` set, no key file appears under the real app-data folder.

---

## 7. Owner decisions (plain language, max 3)

**D1. Where the desktop app keeps each site's token.**
- *What:* a protected file inside the Tovu app's data folder, one per site, instead of the macOS Keychain.
- *Why:* the Keychain was tried in this app and froze it with a system dialog; the code now forbids it.
- *Effect:* no prompts, and it works offline. A full-computer backup contains both the site and its token,
  the same tradeoff you already accepted for the live server.
- *Recommendation:* **yes, use the file.**

**D2. Saved credentials that can't be unlocked** (after a token change, or when a token is lost).
- *What:* keep them listed as "Locked" until you re-enter or delete each one, or delete them automatically.
- *Why:* automatic deletion can't be undone and hides what went wrong.
- *Effect:* finishing a token change waits until each locked item is handled.
- *Recommendation:* **keep them locked.**

**D3. Who can reveal or change the token.**
- *What:* only people signed in to the admin (not API keys), and only the owner and admin roles. Stop giving
  it automatically to any custom role that can manage integrations.
- *Why:* today an API key or such a custom role can pull the one key that unlocks every saved credential.
- *Effect:* existing API keys and custom roles lose Reveal. The owner and admins keep it.
- *Recommendation:* **yes.**

---

## 8. Phased implementation outline

| Phase | Scope | Tests | Depends on |
|---|---|---|---|
| 0 Hardening | API-key refusal on reveal/generate; `no-store`; reveal audit event; hex validation on the file branch; weak-key status; copy, label, and comment fixes (§3.12) | T01–T10 | D3 for grant narrowing only; the rest can ship now |
| 1 Key ids + sources | `fp:` ids; `v1` rule; previous family; `_FILE`; shared resolver; stat reload; no unattended mint; store registry + invariant check | T11–T20 | — |
| 2 Re-seal job + CLI | `site_token_rotations`; lease; restore point; CAS batches; locked tracking; boot resume; unsubscribe dual-verify; `tovu keys`; one-time `v1` stamping; fly skill Rule 4 update | T21–T32 | 1 |
| 3 Admin UI | Rotate (file); env steps with live state; locked list; Finish; Import; move-env-to-file | T33–T36 | 2 |
| 4 Desktop | `_FILE` per site; mint on create/duplicate; duplicate-`siteId` warning | T37–T43 | 1 (shell parts); 3 (Import UI) |

Parallel lanes: Phase 0 any time. After Phase 1, the Phase 4 shell work (T37–T39, T42–T43) can run alongside Phase 2.

**Constitution check.**

| Article | Result |
|---|---|
| I Library-first | Complies: `node:crypto` HKDF/AES-GCM already standard here; no new library |
| II Test-first | Complies: RED list §6 |
| III Simplicity | Complies: every unit traces to owner worklist §6; envelope DEK rejected |
| IV Rule-of-two | Complies: keyring keeps Env/File + InMemory; registry has 13 adapters |
| V Integration-first | Complies: T01–T04 and T21–T23 at route/real adapter |
| VI Security-by-default | Complies: API-key refusal, `no-store`, audit event |
| VII Spec integrity | N/A yet: pre-spec design; the Spec Agent must hash a spec before TDD |
| VIII Observability | Complies: rotation events carry `rotationId` |

**Critical internal constraints (for the Architect stage to formalize):** the swap order in §3.5 step 3; the
CAS write in step 5; Finish's single-transaction precondition. All are `ESCALATE_SECURITY`.

---

## 9. Handoff contract

- **Inputs used:** the brief; the architect and security persona files; the constitution; the 10 named memory
  files (as claims; P6 and P7 corrected); the source files cited inline.
- **Output:** this document. Summary at the top; facts F1–F11; premises P1–P10; Design 1 §3; Design 2 §4;
  risks; RED tests T01–T43; owner decisions D1–D3; phases.
- **Unverified (INFERRED) items to close at spec time:**
  - Node's hex truncation behavior;
  - a Finder launch carrying no key env var;
  - outbox acceptance of new topics;
  - how webhook receivers get signing secrets;
  - whether `duplicateSite` carries sealed tables;
  - Keychain signature-binding behavior.
- **Suggested next assignee:** the owner answers D1–D3 → Spec Agent writes the spec from §3–§4 → Security Agent
  reviews it (key custody is Critical) → TDD Agent certifies RED → Programmer (Opus). Phase 0 is a
  hardening fix inside the existing ADR-058 scope and can go straight to TDD + Programmer, grant narrowing
  excepted.
- **Context estimate at completion:** ~225k.
