# What else in Tovu belongs in Jini: recon (2026-11-07)

Read-only, through git objects. Tovu `b45d2ee75` (T = `apps/website/src/`), Jini `32e9c9c21` (J = `packages/`). No tests, builds or installs. Stopped at the context budget, so read "Not checked".

**Line counts** are non-test lines from git blobs, comments included. Comments are heavy in Tovu: `data-module.ts` is 467 code lines of 1,011, `post.ts` 1,120 of 2,610. The owner's rule moves "why" comments with the code, so these are the right numbers to move, but they overstate logic by about 2x.

**[M]** = measured from code. **[I]** = inferred. **est** = estimate.

## Summary

| # | Candidate | Verdict | Lines moved | Target | Risk | Order |
|---|---|---|---|---|---|---|
| 1 | Plugin dataModule engine, `features/plugins` | MOVE | 1,593 | `@jini-ai/db/data-modules` (new export) | low | B1, any time |
| 2 | SQL repos that J's ports lack | MOVE | 6,118 | `cms/<domain>/sql`, `user-management/server/sql`, `db/settings`, others | low-medium | B2-B5, any time |
| 3 | Regular plugin runtime composition | MOVE | 2,273 | `@jini-ai/plugins/host/node`, `cms/content-types` | medium | B7, after P-C1 |
| 4 | `contracts/core` generic pieces: revert, entry-refs, memory bus | MOVE | 1,312 | `cms/core/commands`, `cms/widgets`, `infra/events` | low | B6 |
| 5 | Boot lifecycle duplicate | Tovu calls Jini | 0 moved, ~190 removed est | `@jini-ai/server/lifecycle` (add export) | low | B6 |
| 6 | CMS tool catalogs: redirects, comments, seo, widgets, taxonomy, trash | MOVE | 3,888 | same `cms/*` domains | medium, golden needed | B9-B11, after B2 |
| 7 | CMS leftover real logic | MOVE | 2,922 est | same `cms/*` domains | low-medium | B8 |
| 8 | Custom credentials. **Disagrees with the plan's cut** | MOVE PART | 2,787 | `@jini-ai/server/agent-plugin-host` | high, sealed rows | after P-C3 |
| 9 | Deploy-ops. **Plan's reason is weaker than stated** | MOVE PART | 880 | `@jini-ai/server/agent-plugin-host` | medium | after #8 |
| 10 | `plugins_*` tools and `plugin-host.ts` | MOVE PART | 1,929 | `@jini-ai/server/plugin-host` (new, L6) | medium, golden needed | after P7b |
| 11 | Identity remainder: API keys, delete user | MOVE PART, scope decision | 1,567 | `user-management/server` | medium-high, `tovu_ak_` | after #2 |
| 12 | Webhook and forms tools | MOVE | 1,593 | `integrations/webhooks`, `cms/forms` | medium | after #6 |
| 13 | Post domain and tools | MOVE, owner decision | 5,606 + 2,801 | `cms/post` (new) | high by size | late |
| 14 | Theme engine | MOVE PART, owner decision | 8,514 est | new `@jini-ai/themes` (L5) | medium-high | late |
| 15 | Members | MOVE, needs consumer call | 3,688 + 482 | `user-management/members` (new export) | medium | after P2c, #2 |
| 16 | Newsletter. Plan says leave | Generic, but no consumer | 5,097 | `cms/newsletter` (new) | medium | last, or never |
| - | `webhooks` site keys, `publish-content`, `publish-trust`, `site-backup`, `deps.ts`, `app.ts`, `platform/site-dir`, tool metadata | LEAVE | 0 | - | - | - |

**Totals [M, sums of file counts]:**

| Tier | Candidates | Lines |
|---|---|---|
| Strong | #1-5 | 11,296 |
| Sound, needs ports or the plan to land | #6-12 | 15,566 |
| Large, needs an owner call | #13-16 | 26,188 |
| **All** | | **53,050** |

**Surprises:**
1. J's `cms/comments` already assumes the dataModule engine (`J cms/src/comments/sql/repo.ts:9`, `sql/repo.rows.ts:7`), but the engine lives only in Tovu. A second host cannot create Jini's own comments tables.
2. Published plugins name `custom_credential_*` 41 times: `github` 36 across its skill, references and `source-control/write-files.mjs`, plus `fly/plugin.json` 3 and others [M]. That contradicts the plan's "later, if a real host asks" cut.
3. J has an unexported, unused copy of Tovu's boot lifecycle.
4. Moving SQL repos does not give a second host its tables. The schema stays in Tovu. See "Decisions".
5. Theme is much less tied to Tovu than its size suggests. 42 of its 61 files have no `Tovu`/`TOVU_` literal, and `static-render.ts`'s 8 hits are mostly comments [M, sampled].

**Duplication scan [M].** Line-matching every Tovu file against all of Jini found little real copying: 23 files, 411 matched lines, mostly SQL repos that resemble J's memory repos. Tovu mostly adapts. The real duplicates:
- `features/webmcp/generated/annotated-actions-script.ts`, a declared generated snapshot, 1 line of diff. Leave.
- The boot lifecycle, #5.

## Per-candidate detail

### 1. Plugin dataModule engine: MOVE

- **Reason [M]:** `features/plugins/data-module.ts:255-271` imports only `kysely`, its siblings and `db/kernel`. No `Tovu` literal in any engine file. Already driver-neutral (`:242-246`, SQLite, PGlite, Postgres).
- **Lines:** moves 1,593 (`data-module` 1,010, `migration-journal` 131, `plugin-identity` 128, `snapshot` 99, `migration-recovery` 65, `disk-headroom` 57, `plugin-store` 50, `restore` 43, `index` 10). Stays 117: `lipay/manifest.ts`, `store/manifest.ts`.
- **Target:** new `@jini-ai/db/data-modules`, L2. `plugins`, `cms` and `commerce` all sit above it. `@jini-ai/db/kernel` is a public self-import, and the new export is its own domain. Not in `plugins`: `cms` is also L4 and could not import it.
- **Ties:** none in code. Importers keep shims: `comments/data-module-install.ts:8`, `comments/types.ts:7`, `newsletter/data-module-manifest.ts:21`, `site-backup/share-database/repo.sqlite.ts:22`, `platform/db/migration/manifest.ts:68`, `composition/data-modules.ts:7`, `deps.ts:191`, `open-site-content-db.ts:1`.
- **Saved data:** `_plugin_migration_journal`, `_plugin_identity`, `_plugin_migrations` and the `p_{id}__` prefix are persisted, so they stay byte-identical. No migration.
- **Trap, if declarations move later:** `plugin-identity.ts:93` compares `sourceUrl` and `publisher`, and the adoption guard fails closed on a mismatch. Comments (`comments/types.ts:18`) and newsletter (`data-module-manifest.ts:42`) hold `publisher: "tovu-core"`. A neutral default would refuse existing tables at boot. This batch doesn't move them; a later one must take provenance as required host input.
- **Consumer:** real for any host using `cms/comments`.
- **Order:** none. No plan batch touches these files.
- **Size:** 1,593 moved, +30 est shims, 11 test files (2,477 lines) unedited, or moved with import edits only.
- **Cost:** recovery once per boot x journal rows. A whole-database snapshot only when DDL is pending, once per plugin change. Unchanged.

### 2. SQL repos: MOVE

- **Reason [M]:** J already has the pattern and Tovu is half way. `redirects`, `comments`, `forms` and `widgets` have `cms/*/sql` with host-owned table names (`J cms/src/redirects/sql/repo.ts`, `RedirectTables`), and Tovu keeps a 32-line binding (`features/redirects/repo.sqlite.ts`). These never got the same move. Their ports are already in Jini, and `J cms/*/repo.memory.ts` is their sibling. Imports are only kysely, generated row types and J's kernel (`features/taxonomy/repo.ts:1-21`). `platform/db/kernel/dialect.ts` is itself a facade over J.

| Group | Files (T) | Lines | Target |
|---|---|---|---|
| CMS tables | taxonomy `repo`, `repo.rows`; navigation `repo`; entries `repo`, `repo.rows`; content-types `repo`, `repo.rows`; presentation; workspace | 1,628 | `cms/<domain>/sql` |
| Trash | `repo`, `table-adapter`, `entry-sql`, `marker-sql`, `not-trashed`, `db-port`. `registry.ts` (365) stays: it names Tovu's tables | 967 | `cms/trash/sql` |
| Identity | `repo`, `mfa.repo`, `passkeys.repo`, `recovery-codes.repo` | 834 | `user-management/server/sql` (new; add optional `db`, `kysely` peers) |
| Settings | `repo` | 423 | `db/settings` (new). `core` is L0 with no peers, so it can't hold Kysely |
| Media | `platform/db/repos/media-repo`, `features/media/versioned-media-repo` | 926 | `cms/media/sql` |
| Other | webhook 380, form-delivery 266, origin 232, change-set 178, outbox 156, gated-token 128 | 1,340 | `integrations/webhooks/sql`, `cms/forms/sql`, `http-kit/verified-origin`, `cms/core`, `infra/events`, `db` |

- **Layers [M]:** every target is below its owner's limit or inside its own domain. Each new SQL entry must be declared `node`: `cms` forbids `kysely` in universal entries (`J cms/package.json`, `jini.isolation.forbidden`).
- **Ties:** table names become required input, as in `REDIRECT_TABLES`. No permissions, routes or `TOVU_`.
- **Needs care:** `form-delivery-repo` and `change-set-repo` also touch `outbox_events`, so cross-domain table names are inputs. `media-repo` has dynamic `selectFrom` targets my regex showed as blank; read them first [I]. `form-delivery-repo` imports `contracts/headless`.
- **Saved data:** no migration. Query text is unchanged. A wrong table-name binding fails fast at the first query, and existing contract tests run on real SQLite. Identity holds sessions and hashed API keys, moved unchanged. Identity gets its own batch.
- **Consumer:** any host on SQL, which otherwise rewrites 6,000 lines of queries.
- **Order:** B2 to B5. No plan overlap. `trash/repo` before #6. Plan P5m's `mailCredentials` binds a repo that isn't in this list.
- **Size:** 6,118 moved, +500 est row types and tables, +150 est bindings. Tests unedited: taxonomy 11 files, navigation 13, entries 11, trash 35, settings 28, identity 22.
- **Cost:** hot paths, per public request and per admin list, have byte-identical queries. No new reads.

### 3. Regular plugin runtime composition: MOVE

- **Reason [M]:** J holds the pieces (`plugins/host`, `host/node`, `host/worker`), and `composition/plugin-runtime.ts` (758, 524 code) only assembles them: discovery, attachment, quarantine, snapshots, hooks and reload. One `Tovu`-word hit, in a comment. A second host must copy these 758 lines to run a regular plugin. `features/plugin-runtime/host-binding.ts` already separates the product inputs, including `coreOwnerName: "Tovu core"` and `identityNamespace: "tovu"`.
- **Lines:**
  - Moves 2,273: `plugin-runtime.ts` 758, `capability-tool-registrations` 518, `declarative-content-types` 355, `install-archive` 132, `run-in-worker` 127, `sdk-resolver` 124, `admin-response` 94, `invocation-core-deps` 87, `worker` 78.
  - Stays: `host-binding` 123, `install.ts` 23 (`TOVU_DESKTOP_OWNER_PID`), `built-ins/*` 755, `repo.sqlite`.
- **Target:** `@jini-ai/plugins/host/node`. `declarative-content-types` to `cms/content-types`: both are L4 and the `plugins/host` import is type plus `PluginInvalidError`, so use a local type and an error port. The layer check counts type imports across L4 (`check-package-layers.ts` header).
- **Ports:** `createSitePluginPolicy` (`:274`, reads `process.env`), `productTracker` (`:163`, already optional), `createTier2WorkerRunner` (`:283`), `HOOK_CONTENT_ENTRY_BEFORE_SAVE` from `@tovu/sdk` (`:29`), `BeforeSaveHookPort` from `features/post` (`:30`, type), and `requirePermission` for `capability-tool-registrations` (it imports `cms/core`).
- **Trap:** `run-in-worker` resolves a worker file path and `typescript-bootstrap.cjs` by location. Moving to a package changes that. The packaged desktop app must prove it; see the owner's "fixed = packaged" rule.
- **Saved data:** activation rows and `p_<plugin>` tool ids unchanged. `capabilityToolIdFor` is already in J. Tool text needs a golden.
- **Consumer:** real. The plan's fake host proves agent plugins; regular plugins have no equivalent.
- **Order:** after P-C1. P5 moves the sibling `provider-status-tool.ts`, which doesn't collide. Serves as the composition step of B7-B8.
- **Size:** 2,273 moved, +150 est ports. Composition tests stay in `server/runtime/composition/__tests__`.
- **Cost:** per the code's comment, discovery is fresh on each call, and `plugin-host.ts` says O(p log p) per lookup plus I/O. Unchanged by a move, but worth looking at: frequency x installed plugins x manifest read on each lookup. Not measured.

### 4. `contracts/core` generic pieces: MOVE

- **`commands/{revert, appliers, repo.memory, index}`, 382 [M]:** no literal, no J equivalent (grep for `RevertRegistry`, `EntityReverter` finds none). Target `cms/core/commands`, beside the existing `change-set.ts`, `command.ts`.
- **`entry-refs/{extractor, ports, repo.memory, types}` + `platform/db/repos/entry-refs-repo`, 688 [M]:** no literal. J only stubs this: `J cms/media/blob-gc.ts:65` says the where-used index is a stub, and `cms/entries/write-service.ts:199` leaves a slot for it.
  - **Domain trap:** the extractor imports `cms/widgets` at runtime. A new domain, or `cms/entries`, would break `SI-domain` (`check-subpath-isolation.ts`, `enqueueTargets`). Place it in the `widgets` domain, or inject the marker parser.
- **`events/memory-bus`, 156:** target `infra/events` or `cms/core`. Needs a choice. `expand-partials`, 86, to `cms/widgets`.
- **Left as adapters [M]:** `gated-mutations/gateway.ts` (45 code lines of 213), `token.ts` (49 of 146), `events/outbox-*`, `rate-limit` (Tovu profiles), `model-facing-tool-errors`.
- **Left:** `tool-metadata/*` (~4,000) is Tovu's search text and approval policy; `credential-copy` (601) is Tovu's words.
- **`human-confirm.ts` (311):** not counted. It's the `approvals` port the plan binds to. Its exports are generic (`:107`, `:216`), but it needs `ui/mcp-ui` (L5) and P0 changes its card text. Revisit after the plan, target `ui` [I].
- **Saved data:** none. **Consumer:** revert, for any host using change sets; entry-refs un-stubs J's own media where-used check. Don't enable that check as part of the move, or blob GC behavior changes.
- **Size:** 1,312 moved, +40 est, contract tests unedited.
- **Cost:** `extractEntryRefs` runs per entry write x body size, in the write transaction. Unchanged.

### 5. Boot lifecycle: call Jini

- **[M]** `J server/src/lifecycle/boot-lifecycle.ts:91` has `runBootLifecycle`, and `readiness-state.ts:10` has `createReadinessStore`. They aren't in `J server/package.json` exports, and no non-test code imports them (grep rerun with a correct pathspec: only their own 3 files).
- **[M]** T `server/runtime/lifecycle/boot-lifecycle.ts:150` is the live version, used by `index.ts:18`, `cli/commands/serve.ts:33`.
- **Not verified:** behavior parity. J takes object args and a reporter, T is positional.
- **Action:** add `@jini-ai/server/lifecycle`, port T's tests against it, keep a T binding with the module-global snapshot and daemon-failure fields (`readiness-state.ts:50-99`, host-specific). If parity fails, delete J's copy instead. It's dead either way.
- **Size:** ~190 lines removed est. Low risk.

### 6. CMS tool catalogs: MOVE

- **Reason [M]:** J already has this for `navigation`, `media`, `entries`, `content-types`, `workspace`, `settings`, `identity`. `features/navigation/tool-registrations.ts` is a 62-line binding, and `withToolMetadata` stays in Tovu. These never moved:

| Feature | `agent-tools` + `tool-registrations` | Tovu-only imports |
|---|---|---|
| redirects | 236 + 282 | metadata |
| comments | 207 + 385 | metadata, `human-confirm`, settings |
| seo | 273 + 252 | metadata, media, post, settings |
| widgets | 341 + 508 | metadata, `plugin-hook-failed-error` |
| taxonomy | 34 + 444 (J already has its catalog) | metadata, `human-confirm`, gated-mutations gateway, slug, post |
| trash | 159 + 250 + `trash-item-tool` 517 | metadata |

- **Ports:** `approvals`, `surfaces`, `requirePermission`, per plan §4. `cms` (L4) cannot import `daemon` (L4), and the plan calls this the known trap. `@jini-ai/daemon/surface-exchanges` is imported at e.g. `redirects/tool-registrations.ts:23`.
- **Saved data:** none. **Tool text:** high stakes. Plan P1b's golden covers only plugin tools, so it needs a new golden for these before the first move: names, descriptions, schemas, approvals. `tool-metadata.baseline.json` isn't enough, as the plan says.
- **Consumer [M]:** overlays name none of `redirects_`, `seo_`, `widgets_`, `trash_`, `taxonomy_`. So the consumer is another CMS host's assistant, not published plugins. Honest label: consistency with six siblings; useful only once a host mounts these domains.
- **Order:** after #2, and after plan P3 proves the shim pattern. Batch by feature.
- **Size:** 3,888 moved, +300 est, tests unedited.
- **Cost:** per-turn catalog x tool count, bytes identical.

### 7. CMS leftover real logic: MOVE

For the rest of each CMS feature:
- **Moves [M lines, I verdict: headers read, not bodies]:**
  - `seo/settings` 409, `cover-image` 96
  - `comments/settings` 286, `provider-selection` 111, `builtin-provider` 123, `ip-hash-salt` 75, declarations 88 (provenance trap in #1)
  - `entries/public-list` 360 (pure, says so in its header; needs `SYSTEM_CONTENT_TYPES`)
  - `navigation/import-menu` 260, `repoint-menu-refs` 138, `menu-trash-follow-ups` 96, `trash-menu` 62, `reverters` 93
  - `taxonomy/trash-term` 116, `taxonomy-trash-follow-ups` 182, `collection-term-policy` 76
  - `trash/move-to-trash` 167, `remove-without-blocker` 37, `permissions` 147
- **Stays, for all features:** `publish-content.ts` files (tied to the publish engine), `repo.sqlite.ts` bindings, `index.ts` barrels, `media/provider-credential-*` (vault), chat attachment files.
- **`pages` (2,250):** leave for now. `html-document-store` shares the `posts` table, so it follows #13.
- **`forms`, `widgets`, `redirects`, `settings`:** the remainder is already host wiring.

Size 2,922 est. Low-medium risk. `comments/ip-hash-salt` needs a read first: a changed salt derivation would break visitor hash matching [I].

### 8. Custom credentials: MOVE PART. Disagrees with plan

- **Plan says:** cut, later if a real host asks.
- **Evidence against [M]:** `custom_credential_make_request` 19 mentions, `custom_credential_write_files` 15, in `github`, `fly`, `railway`. `github/source-control/write-files.mjs` is executable. A second host running `github` follows a skill naming tools it doesn't have.
- **Moves:** `store` 562, `tool-registrations` 1,245, `agent-tools` 190, `types` 134, `vault-repo` 129, `credential-copy-tool` 130, UI cards 333, small 64.
- **Already an adapter [M]:** `credentialed-request.ts` is 131 code lines of 769. Leave it.
- **Stays:** `write-files-validation` (needs source-control) unless a port is drawn.
- **Target:** `@jini-ai/server/agent-plugin-host`, since it shows cards (plan §3 rule).
- **Ties:** `TOVU_SITE_KEY` in errors (`store.ts`), `createTovuStoreVault` (`#src/platform/secrets/vault-kinds`), `project-keys`, `vendor-credentials`, `webhooks` keyring ports.
- **Risk: high.** Sealed rows depend on vault kind, scope and AAD. They need a pinned test, like P6a's `pluginStateFormat`, before moving. No reconnect is acceptable.
- **Order:** after P5, P5m (binds `customCredentialRepo`), P6a (`byoCredentials`), P-C3. Those batches create shims on neighboring paths and use this as a port.
- **Size:** 2,787 moved, +250 est. Test group: `custom-credentials/__tests__`, 7,987 lines. Cost: one credential decrypt per tool call, unchanged.

### 9. Deploy-ops: MOVE PART

- **Plan's reason:** tied to publish history and the site key, with one consumer.
- **Evidence [M]:** both are already optional seams: `run-ops.ts:21` `publishHistoryStore?`, guarded at `:248`, and `:39` `readSiteKey?`. Real blockers: `secrets.ts` default reader imports `#src/features/webhooks/index`, and `run-ops.ts` calls `makeCredentialedRequest`.
- **Consumer [M]:** `deploy_ops` has 0 overlay mentions, but `fly/plugin.json` names `custom_credential_*`, and P2a already publishes the module contract with no runner. A plugin's deploy-ops module is unusable elsewhere.
- **Moves:** `run-ops` 336, `secrets` 245, `tool-registrations` 152, `agent-tools` 80, `typed-secret-card` 67. **Size:** 880, +100 est. **Order:** after #8. **Risk:** medium, secret values never reach the model; golden needed.

### 10. `plugins_*` tools and `plugin-host.ts`: MOVE PART

- `tool-registrations` 1,093, `agent-tools` 299, `install-tool` 163, `source-tools` 133, `uninstall-confirmation-ui` 43, `composition/plugin-host.ts` 198.
- **Crosses** both plugin families (`tool-registrations.ts:246`), so L6: new entry `@jini-ai/server/plugin-host`. `plugins_set_enabled` has 9 overlay mentions, so the consumer is real.
- **Ties [M]:** 15 `Tovu` words in that file, many in model text (`:288`, `:431`, `:437`, `:593-610`, `:650`). Each becomes a `messages` input and a golden entry.
- **Order:** after P7b: `plugin-host.ts` imports `federate-mcp`, `apply-connect-defaults`, `enable-access`, `grant-signed-in-defaults`, which P7 moves. `tool-registrations.ts` is in the plan's combine collision list, so P0 must land first.
- **Size:** 1,929, +150 est. Risk medium. Cost: per-call activation reads, unchanged.

### 11. Identity remainder: MOVE PART

- **API keys** `api-key-service` 471, `api-key-secret` 235, `api-key-types` 67. **Delete user** `delete-user-service` 355, `user-purge*` 184. **Grants** `builtin-role-grants` 199, `*-manage-permission` 56.
- **Decision needed [M]:** `api-key-service.ts` header quotes J's own `INFO.md`: API keys are out of `user-management` scope. Moving reverses that.
- **Credential trap [M]:** `api-key-secret.ts:45,57` `KEY_SCHEME_PREFIX = "tovu_ak_"`, `PREFIX_PATTERN`, and the prefix persisted in `api_keys.prefix`. Required host input, no default, or every existing key is rejected. Scrypt digest format stays.
- **Stays:** `wiring.ts`, `tool-registrations.ts` (already a host adapter), `site-key-permission`, `boot-session-token`, `owner-reset-env`, `default-credential-exposure`.
- **Duplicate check:** `delete-user-service` shares only 21 of 102 lines with `J admin-crud-service`, so it's related, not a copy.
- **Size:** 1,567, +80 est. **Order:** after identity SQL.

### 12. Webhook and forms tools: MOVE

`webhooks` 585: `integrations` (L4) cannot import `cms/core` or `daemon`, so it takes ports. `forms` 1,008: `cms/forms`, 7 overlay mentions, but imports `assistant/tool-contributions`, `content-duplication`. Same golden as #6. Risk medium.

### 13. Post domain: MOVE, owner decision

- **[M]** `post.ts` (2,609) has 1 `Tovu` hit and imports only `platform/routing` and two tiny contracts. `search-index*`, `repo*`, `reverters`, `go-live` are similar. J has no post domain. `J cms/routing/ports.ts:6` cites `src/features/post/post.ts` by path. 10 J files refer to `PostRepoPort`.
- **Moves:** domain 5,606, tools 2,801. **Stays:** `publish-content.ts` 577, `template-options` 31.
- **Decision:** `J cms/entries/agent-tools.ts:~20` calls post "legacy", a separate model from entries. Moving it freezes two content models in Jini. Move as is, or unify first? I recommend moving as is: unifying is a data migration and should be its own project.
- **Layers [M]:** a new `cms/post` domain may not reach `widgets`, `media` at runtime (`cover-image`, `featured-image`), so ports or `isolation.shared`. Importers: 138 Tovu files, so the barrel shim is needed.
- **Ties:** `RESERVED_SEGMENTS`, `postPublicPath`, FTS objects per dialect (`search-index.sqlite.ts`, `.postgres.ts`).
- **Risk:** no schema change, but the write path is the busiest in the product. 81 test files.
- **Order:** after #2, #4. Before `pages`.
- **Cost:** public read per request, search index update per write. Unchanged. `listAdminPosts` not read for size.

### 14. Theme engine: MOVE PART, owner decision

- **[M]** No `J` theme code at all: `theme.json` appears once, in a comment.
- **Moves est 8,514:** `validation/*` 1,613, `handlebars-allowlist` + `liquid-allowlist` 727, `migration/*` 662, `static-render` 1,392, `render-contract` 361, `entry-list-render` 375, `theme-files` 1,345, `file-identity-lock` 296, `theme.ts` 1,180, small 563.
- **Stays:** tools 1,469+, `publish-content` 826, previews, `code-tier-asset-normalizer` (10 literals), `build-conformance`.
- **Target:** new `@jini-ai/themes`, L5. It reads `cms/widgets/markers`, `cms/listing`, `cms/navigation/dropdown`, `cookie-consent`, `agentic/core`. Inside `cms` that would break `SI-domain`; as a separate package it doesn't. **Needs a row in the reviewed layer table.** `handlebars` and `liquidjs` become peers. They're libraries, not vendors.
- **Ties:** `theme.ts` imports `platform/site-dir/product-root.js`; `render-contract` uses `theme-slots`.
- **Risk:** rendered HTML must be byte-identical. Build a render golden first. 108 test files. Per the owner's rule, kUInetic and Tovu Starter aren't touched.
- **Consumer:** any host that serves sites. Inferred; none exists now.
- **Cost:** per public page x template and file reads. I didn't read the caching. **Check this before moving.**

### 15. Members: MOVE, needs a consumer call

- **[M]** 1 `Tovu` hit in 4,426 lines. Uses `user-management`, `platform/mail`, `http-kit`, `db/kernel`, all legal from L4.
- **Stays:** `auth-mail` (templates), `subscriber-directory` (newsletter), `repo.sqlite`, `capability-card`.
- **Moves:** 3,688 + tools 482, as new `user-management/members`. Tools need ports for `cms/trash`, `cms/core`.
- **Saved data:** 8 `member_*` tables, hashed sessions and tokens, no migration.
- **Order:** after P2c, since it adds login-provider parsing to the same package, and after #2.
- **Consumer:** none named. Generic by content, tidier today.

### 16. Newsletter: agree with the plan, for a different reason

The plan calls it site tables. **[M]** it's self-contained, 3 `Tovu` hits in 5,157 lines. Tied only by `plugins` data module (#1), `platform/mail`, keyring. It could move, but no plugin or host needs it. Lowest value. Listed for honesty, not recommended now.

## Leave

| Area | Verdict | Reason |
|---|---|---|
| `webhooks/site-key-ensure` (807), `site-key-sources` (299), `keyring.env` (477) | SITE-SPECIFIC | Tovu's key file layout, `TOVU_SITE_KEY`, `buildSiteMetaForNewKey`. Generic parts are already `J platform/secrets`. The real problem is a Tovu one: site keys live under `features/webhooks`, imported by 64 files. Tidy in Tovu, not a Jini move |
| `webhooks/secret-scan-guard` (427), `seal-aad-invariant` (234) | Leave | Repo-scanning checks, not runtime. J already owns the patterns (`diagnostics/core/secrets-only.ts:472`) |
| `publish-content` (11,762), `publish-trust` (2,666) | SITE-SPECIFIC | `type-registry.ts` binds nearly every Tovu repo port. One consumer. Peer wire format. Moving needs #2, #6, #13 first anyway |
| `site-backup` | Agree with plan | |
| `source-control`, `mail*`, DNS | Agree with plan | |
| `external-mcp` `tool-registrations`, `save-form`, `agent-tools` | Agree with plan | 15 literals, settings and locale. 13 overlay mentions of `external_mcp_` is a soft signal to revisit after P8 |
| `deps.ts` (3,118), `app.ts` (2,675) | Host wiring | Tovu's composition root, by definition. `tool-catalog-manifest`, `vault-boot`, `vault-legacy-codecs` likewise |
| `platform/site-dir`, `platform/db` schema and migrations | SITE-SPECIFIC | Tovu's disk layout and database |
| `platform/{http, oauth, secrets, mail, routing, observability, markdown, html}` | ADAPTER | Thin bindings to J, sizes 66-530 |
| `assistant/ask-choice-tool`, `mcp-federation/*`, `tool-catalog-query`, `byok-*` | ADAPTER or host | `ask-choice` header says it adapts `J mcp/tools/ask-choice`; federation says the same. BYOK composes 15+ Tovu assistant files |
| `assistant/demo-*` | Leave | Demos |
| `lifecycle/daemon-supervisor` (776) | ADAPTER | Header: Tovu wiring over `J sidecar/supervisor` |
| `web-screenshot`, `site-evidence`, `site-search`, `analytics`, `consent`, `skills`, `database`, `recovery`, `database-transfer`, `domain-dns`, `tool-audit`, `presentation`, `workspace` non-repo | ADAPTER [I] | From import counts: mostly J imports. Bodies not read |

## Suggested batches (~1,500 lines)

Every batch: one package at a time, Jini first, shims in Tovu, listed tests unedited. Landing order is the plan's: Jini, publish, Tovu pin, Tovu merge.

| Batch | Contents | Lines | Blocked by |
|---|---|---|---|
| B1 | dataModule engine | 1,593 | - |
| B2 | SQL: CMS tables | 1,628 | - |
| B3 | SQL: trash, settings | 1,390 | - |
| B4 | SQL: identity, origin, gated-token, change-set | 1,372 | - |
| B5 | SQL: media, webhook, form-delivery, outbox | 1,728 | - |
| B6 | Commands, entry-refs, memory bus, expand-partials, lifecycle | 1,312 | - |
| B7 | Plugin runtime composition, worker, SDK resolver, archive | ~1,300 | P-C1 |
| B8 | Capability tools, declarative content types, admin response, invocation deps; CMS logic part 1 | ~1,500 | P-C1 |
| B9-B11 | New CMS golden, then tool catalogs by feature; CMS logic part 2 | ~1,500 each | B2, P3 |
| B12-B13 | Custom credentials: pin sealed format, then move | ~1,400 each | P-C3 |
| B14 | Deploy-ops | 880 | B13 |
| B15 | `plugins_*` tools, plugin-host | 1,929, split if needed | P7b, P0 |
| B16 | Identity remainder | 1,567 | B4, scope decision |
| B17 | Webhook, forms tools | 1,593 | B9 |
| Later | Post, theme, members, newsletter | 26,188 | Owner calls |

**Today's realistic set:** B1-B6 touch no file in plan v5 and are mechanical: 9,023 lines moved. **Conflict risk with the running session [I]:** Jini `package.json` exports and the lockfile. Plan P1a edits `server`, `agent-plugins`, and possibly `plugins`, `user-management`; B1-B6 edit `db`, `cms`, `user-management`, `integrations`, `infra`, `http-kit`, `server`. Land one side first and regenerate the lockfile. B5's `integrations` and `B4`'s `user-management` overlap P2c's manifest declarations.

## Decisions for the owner

1. **Who owns the schema?** Jini's precedent is "tables belong to the host", so after #2 a second host still writes its own DDL for about 40 tables. It's fast to read, but the host still can't boot from Jini alone. Options: leave as is, or ship declarations through the dataModule engine later. Recommend leaving it until a host exists.
2. **API keys in `user-management`?** Reverses that package's stated scope.
3. **Post as is, or unify with entries?** Recommend as is.
4. **New `@jini-ai/themes` package?** Needs a layer table row.
5. **Reverse the plan's custom-credentials cut?** Recommend yes, after P-C3.

## Noticed in passing, nothing changed

- `features/webhooks/keyring.env.ts:1-6` has a dated marker, "remove on/after 2026-11-01". It's overdue.
- `J server/src/lifecycle/*` is unreachable; see #5.
- J source comments cite Tovu paths as if they were local: `cms/routing/ports.ts:6`, `cms/entries/agent-tools.ts:~20`.
- `features/plugins/lipay`, `store` manifests exist only to claim namespaces (`composition/data-modules.ts:9`). Not read for whether those tables are ever used.

## Not checked

- **`server/inbound/*` (admin and public routes, roughly 55,000 lines est), `apps/admin`, `cli`, `packages/sdk`, `packages/contracts`.** Not in the survey, but routes may hold logic that moved tools would duplicate. `J cms/*/express` shows some routes already moved, so this is likely a real further candidate list.
- **Bodies, for adapter verdicts.** I read headers, imports and counts for `site-inspection` (2,717, `Tovu` 3), `site-export` (1,647), `fs-files`, `sites`, `change-sets`, `media-generation`, `media-import`, `asset-transfer`, `image-transform`, `analytics`, `consent`, `skills`, `database*`, `recovery`, `domain-dns`, `form-destinations`, `object-storage`, `project-keys`, `vendor-credentials`, `api-connections` remainder, and most of `theme` and `post`.
- **`site-inspection`** in particular looks generic but depends on `features/theme`. Revisit after #14.
- **Parity of #5**, and whether every #2 repo runs on all three dialects as its header says.
- **`composition/modules/*`, `peer-site-reads`, `open-site-store`, `provider-plugins`:** treated as host wiring from names and imports.
- **Layer and isolation checks:** read from the scripts, not run. Target layers are by reasoning.
- **The `isolation` rule for self-imports inside `cms`** is read from `enqueueTargets`; not tested with a real case.
- **Plan batches P2a, P5m, P8 and P10:** read only from the section extract or by grep.
- **Method trap:** several early greps used `-- 'packages/*/src'`, which matches nothing with git's pathspec rules. I reran the Jini absence claims used above with `-- packages`. A missed J duplicate outside those reruns is possible.
