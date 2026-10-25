Software Architect(Plan): **Software Architect + Security** personas loaded for storage ownership, reusable boundaries, credential isolation, and recovery.

Read-only plan. `T` = `/Users/la/Programming/tovu-integration-clones/tovu-integ`; `J` = `/Users/la/Programming/tovu-integration-clones/jini-int2`. Both report branch `fix/orvellea-chat`. No files changed or tests run.

**1. What exists**

| Capability | Verified owner and reuse decision |
|---|---|
| SQLite already shipped | Root lock pins **better-sqlite3 13.0.3**: [package-lock.json:6259](/Users/la/Programming/tovu-integration-clones/tovu-integ/package-lock.json:6259). Payload dependencies ship outside ASAR: [electron-builder.yml:55](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/desktop/electron-builder.yml:55). |
| Native packaging | Configuration uses Node-API prebuilds, `asarUnpack` for native files, and `npmRebuild: false`: [electron-builder.yml:115](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/desktop/electron-builder.yml:115). Existing smoke opens SQLite inside the packaged executable: [smoke-native.ts:99](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/desktop/src/smoke-native.ts:99). CI targets Mac arm64/x64 and Windows x64: [desktop-release.yml:82](/Users/la/Programming/tovu-integration-clones/tovu-integ/.github/workflows/desktop-release.yml:82). |
| Why tracked sites use JSON | Its header deliberately avoids bringing SQLite into the **shell dependency graph**; it does not establish a native-packaging failure: [tracked-sites.ts:1](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/desktop/src/tracked-sites.ts:1). Leave that registry alone. |
| Database lifecycle and migrations | Jini already owns injected SQLite opening, WAL/locking, and ordered checksum migrations: [open.ts:65](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/db/src/sqlite/open.ts:65), [driver.ts:8](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/db/src/kernel/sqlite/driver.ts:8), [runner.ts:46](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/db/src/migrate/runner.ts:46). |
| Credentials | Reuse `SecretsVaultService` and `SqlSecretsVaultRepo`; they own authorization/context checks, sealing, revisions, defaults, and CAS: [vault.service.ts:105](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/secrets/credential-sets/vault.service.ts:105), [repo.sql.ts:48](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/db/src/secrets-vault/repo.sql.ts:48). |
| Key file and sealer | Existing `generateFileRootKey` creates exclusively; `EnvOrFileKeyring` reads explicit sources; `AesGcmSecretSealer` authenticates context: [keyring.env.ts:345](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/secrets/keyring.env.ts:345), [sealer:17](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/secrets/secret-sealer.aesgcm.ts:17). |
| Runtime seam | Jini’s `CredentialResolverPort` separates metadata from plaintext resolution: [ports.ts:8](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/integrations/src/credentialed-http/ports.ts:8). Tovu already adapts it: [credentialed-request.ts:661](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/features/custom-credentials/credentialed-request.ts:661). |
| Existing UI | Reuse the security credential controller/editor rather than another CRUD lifecycle: [controller:12](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/admin/src/security/controllers/access-tokens.controller.ts:12), [CredentialEditor.tsx:3](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/admin/src/security/react/components/CredentialEditor.tsx:3). |
| Backup boundary | Site backups collect defined site scopes and a content snapshot: [sources.ts:17](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/features/site-backup/sources.ts:17). Owner data must remain outside those sources. |

No owner-store or recoverable encrypted-export implementation was found in the inspected Jini sources. Graph tools were unavailable; Jini’s retained graph was stale. Source reads supplied the evidence. Tovu clone architecture documents were absent, so the required chapters, memory, constitution, ADR-066, and prior design were read from `/Users/la/Programming/Tovu/ADS-memory`.

**2. Design**

- **Visible journey:** Desktop Settings → **Shared keys** → save one named API key → select two local sites → both use it. Replace its value once; both use the new value on their next request. Export; restore into an empty owner store; reauthorize the two sites.
- Store one `owner.db` and separate `owner.key` under the existing resolved desktop `userData`. Existing Site DB placement remains authoritative; do not relocate `content.db`.
- Jini owns three durable concerns: existing `secrets_vault`; `owner_records` for namespaced names, immutable IDs, type/schema version and revision; `owner_grants` for opaque consumer/slot permissions. Credential records reference vault IDs rather than duplicating payloads.
- Preference and other-record payloads use the typed record contract. Existing preference files stay authoritative until an explicit migration; this slice introduces no new inheritance system.
- Create the owner schema through **ADR-066 TypeScript steps**, pinned checksums, and Jini’s migration runner, using an independent `owner_migrations` ledger. No CMS tables or dummy workspace rows in `owner.db`.
- Use Jini’s existing file-key/sealer implementation with an owner-specific derivation salt. Disable implicit key regeneration. Serialize initial creation with Jini’s file lock; ensure durable writes and POSIX permissions/Windows profile ACL protection before storing credentials.
- A missing or invalid key with existing owner data produces recovery guidance, never a replacement key. This respects the OS credential-storage prohibition in [desktop-auth.ts:10](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/desktop/src/desktop-auth.ts:10).
- **Broker authentication:** add a native inherited Node IPC channel to desktop-launched site processes. The desktop binds each channel to the registered site identity; request bodies cannot choose their identity. This uses Node’s existing IPC capability rather than a new HTTP listener or bearer in environment variables. Verify it in packaged Electron on both OSes. [Node IPC](https://nodejs.org/api/child_process.html#optionsstdio), [Electron Node mode](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node)
- Sites receive only granted metadata and resolved values. They cannot enumerate the owner store, alter grants, export, or obtain the master key. Grant validation and value selection share one database transaction.
- Persist each site’s **non-secret binding pointer** in its existing settings ledger: `site`, `owner`, or `disabled`. An owner binding fails explicitly when desktop/grant resolution is unavailable; it never falls back to an older local key.
- Keep names editable and bind by immutable ID. Resolve current values per request; preserve existing origin restrictions and plugin-defined authentication schemes.
- Desktop management IPC accepts only the trusted shell’s main frame. Saved values and recovery passphrases never return through read APIs, logs, or agent results.
- **Export:** take a consistent logical snapshot, open credentials through the existing vault, then encrypt the portable records with the existing sealer under an asynchronous, salted `scrypt`-derived recovery key. Authenticate the format/version/KDF header; bound file sizes and KDF parameters. Use [Node’s existing scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
- Export contains **no master key, wrapped master key, or copied key file**. Write only ciphertext to disk. Restore authenticates and validates everything first, then reseals under the destination owner key in one transaction.
- First-slice restore accepts an **empty store**; nonempty stores receive a clear refusal. Restored grants remain inactive until local sites are confirmed.
- Deployment remains a subsequent slice: explicitly selected runtime values are pinned and materialized on redeploy through existing vault/plugin operations. Never ship a desktop broker dependency. Owner-bound deployment must report unsupported/unmaterialized bindings until that slice lands.

All new public APIs use `(requiredObj, optionalObj = {})`; dependencies enter as ports. CCN ≤ 10. Vendor URLs, fields, schemes, and provider behavior remain plugin-owned.

**3–4. Numbered Codex build shards and tests**

Brace lists below enumerate exact planned files. New files are proposals.

1. **Jini owner service, key bootstrap, and encrypted export.**
   Files: `J/packages/platform/src/owner-store/{contracts.ts,service.ts,key-file.ts,key-file.node.ts,backup.ts,index.ts}`, `J/packages/platform/package.json`.
   Reuse the existing vault, keyring, sealer, atomic filesystem, and file-lock owners; do not copy their implementations.
   Tests: `J/packages/platform/src/owner-store/__tests__/{service,key-file,backup}.test.ts`.
   Cover CAS/name uniqueness, type versions, missing-key refusal, concurrent initialization, key permissions, wrong passphrase/AAD, tampering, bounded KDF inputs, no key material in exports, empty-store restore, and transactional rollback.

2. **Jini SQLite adapter and owner migration history — after 1.**
   Files: `J/packages/db/src/owner-store/{database.ts,repo.sql.ts,index.ts,migrations/0000_owner_store.ts,migrations/index.ts,migrations/checksums.ts}`, `J/packages/db/package.json`.
   Implement the record/grant repository against Jini’s kernel; compose `SqlSecretsVaultRepo`. Owner DDL follows its column/index contract but has independent foreign keys and migration provenance.
   Tests: `J/packages/db/src/owner-store/__tests__/{repo.sql,migrations}.test.ts`.
   Cover real-file reopen, constraints, vault conformance, concurrent desktop processes, grant/revoke ordering, checksum mismatch/newer schema refusal, consistent export, and failed restore leaving data unchanged.

3. **Jini authenticated child broker — after 1.**
   Files: `J/packages/desktop-host/src/owner-store/{broker.ts,client.ts,node-channel.ts,index.ts}`, `J/packages/desktop-host/package.json`.
   Native inherited-channel authentication differs from the existing HTTP capture bridge and socket-framed sidecar; neither transport is copied.
   Tests: `J/packages/desktop-host/src/owner-store/__tests__/{broker,client,node-channel}.test.ts`.
   Cover real parent/child IPC, forged site IDs, ungranted entries, slot restrictions, revoked grants, disconnects/timeouts, bounded messages, cleanup, and secret-free errors.

4. **Jini reusable management panel — after 1.**
   Files: `J/packages/admin/src/security/owner-store.ts`, `J/packages/admin/src/security/index.ts`, `J/packages/admin/src/security/react/components/OwnerStorePanel.tsx`, `J/packages/admin/src/security/react/index.ts`.
   Extend the existing credential controller/editor with consumer grants and export/restore actions; no new admin shell or root-key reveal.
   Test: `J/packages/admin/src/security/react/__tests__/owner-store.test.tsx`.
   Cover save/replace, two consumer selections, blank replacement secrets, pending/error states, keyboard access, passphrase clearing, and nonempty-restore refusal.

5. **Tovu site binding and runtime integration — after Jini publish.**
   Files: `T/apps/website/src/features/settings/owner-credentials.ts`; `T/apps/website/src/features/custom-credentials/{credentialed-request.ts,tool-registrations.ts}`; `T/apps/website/src/server/runtime/composition/{owner-credentials.ts,deps.ts,app.ts}`; `T/apps/website/src/server/routes/types.ts`; `T/apps/website/src/server/inbound/admin-http/routes/system/owner-credentials.ts`; `T/apps/website/src/cli/commands/serve.ts`.
   Store only binding pointers in existing settings. Extend the resolver port and authenticated owner route; keep request execution and origin validation with their existing owners.
   Tests: `T/apps/website/src/server/runtime/composition/__tests__/owner-credentials.integration.test.ts`, `T/apps/website/src/server/inbound/admin-http/routes/system/__tests__/owner-credentials.integration.test.ts`.
   Cover ordinary owner-session/RBAC checks, forged bindings, two sites, fresh resolution after replacement, no local secret copies, disabled mode, desktop absence, revocation, and unchanged site-local behavior.

6. **Tovu desktop composition and visible journey — after Jini publish.**
   Files: `T/apps/desktop/{main.ts,package.json,package-lock.json}`; `T/{package.json,package-lock.json}`; `T/apps/desktop/src/{owner-store-boot.ts,owner-store-ipc.ts,tovu-server.ts}`; `T/apps/desktop/src/contracts/owner-store.ts`; `T/apps/desktop/src/preload/preload.mts`; `T/apps/desktop/src/renderer/{runner-api.ts,App.tsx,OwnerStore.tsx}`.
   Mount Jini’s panel; supply Tovu site choices and plugin metadata. Resolve `better-sqlite3` from the existing payload root and inject its opener; declare the shell’s Jini DB/Kysely dependencies explicitly.
   Grant centrally before committing the site pointer; report partial failure. Revoke centrally first. Independently started sites require an explicit desktop restart to acquire their private channel.
   Tests: `T/apps/desktop/src/{owner-store-boot,owner-store-ipc}.test.ts`, `T/apps/desktop/src/renderer/OwnerStore.hooks.test.ts`; extend `T/apps/desktop/src/tovu-server.test.ts`.
   Cover trusted-frame enforcement, restart persistence, payload-relative loading, cancelled dialogs, secret clearing, partial binding failure, multi-instance startup, and Windows stdin shutdown remaining intact.

7. **Backup separation and packaged acceptance — after 5 and 6.**
   Files: `T/apps/website/src/features/site-backup/sources.ts`; `T/apps/desktop/src/smoke-native.ts`; `T/.github/workflows/desktop-release.yml`; `T/development/e2e/owner-db.spec.ts`.
   Tests: extend `T/apps/website/src/features/site-backup/__tests__/sources-no-follow.unit.test.ts` and `T/apps/desktop/src/smoke-native.test.ts`; run the new E2E.
   Prove owner DB/key/WAL files and owner exports cannot enter site backups, including nested copies and symlink fixtures.
   Packaged acceptance on **Mac arm64, Mac x64, Windows x64**: save once, use from two sites, replace once, restart, export, restore with a different owner key, regrant, and use again. Include Mac↔Windows export fixtures.

**Parallelism and publication:** after 1 lands, **2 / 3 / 4** run concurrently with no file overlap. Publish the completed Jini dependency set, then **5 / 6** run concurrently with no overlap. **7** follows both.

The ongoing **0.6.11 cut stays untouched**. Shards 1–4 require the next Jini release after 0.6.11; coordinate its version with the release owner. Shard 6 owns all Tovu manifest/lockfile updates. Before implementation, record the baseline, approved contract, and initially failing behavior tests; finish with affected tests, builds/typechecks, Jini boundary checks, and measured CCN.

**5. Cut list**

- No new package, second vault/sealer, replacement request engine, SQLite rebuild system, or tracked-sites migration.
- No keychain/DPAPI credential storage, master-key export, plaintext backup files, or whole-userData backup.
- No cloud sync, multiple owners/devices, OAuth/MCP/personal-credential migration, or bulk credential import.
- No preference migration/inheritance UI, arbitrary record editor, key rotation, nonempty restore merge/overwrite, or automatic attachment to independently running sites.
- No deployment projection in this local slice; retain its explicit unsupported boundary rather than silently deploying an unusable binding.

**6. Owner questions**

None needed for this slice. The binding owner decisions resolve the earlier design questions. Next assignee: Coordinator to lock these contracts and dispatch shard 1 after the current release cut.
