SEC PLAN COMPLETE

# P9-SEC — Security parity plan: build Jini's missing Security pieces, split owner auth, then swap Tovu

Planning only: no code, tests, builds or installs were run. Every reference below was read statically at these SHAs:

| ref | SHA | what was read |
|---|---|---|
| Tovu `integ/merge-12-2026-11-22` | `41e948ee4` | `apps/admin/src/features/security/**` (39 sources, 30 test files), its importers, `panels.tsx`, `panel-pages.ts`, `main.tsx`, `integrations/jini-admin/**`, `lib/owner-*-api.ts`, `features/{sites,deployment,source-control,providers,ai-assistant,media,integrations}/api/*`, `apps/website/src/server/inbound/admin-http/dev-auth.ts` |
| Jini `integ/merge-13-2026-11-22` | `7c4ee7881` | `packages/admin/src/security/**` (22 sources, 11 tests), `packages/admin/src/react/kit.tsx`, `packages/admin/src/comments/react/index.ts`, `packages/user-management/src/react/**`, `packages/core/src/contracts/server{.ts,/json-route.ts}`, `packages/http-kit/src/{adapter,node-bridge}.ts` |
| Jini `codex/ex2-a-k2-0a-jini` (in flight) | `44ee815e` | admin kit `Icon` slot, `useT` facade, injected values (`packages/admin/src/react/kit.tsx`) |
| Jini `codex/ex2-rt-k1-0-jini` (in flight) | `66310ee7` | `RouteRefusalError`/`rejectRoute` at `packages/core/src/errors/route-refusal.ts`; http-kit returned-error parity; `maxBodyBytes` |
| Tovu `plan/whats-left-1122` | `08305adba` | `plans/P9-SEC-0-parity.md`, `plans/P9-extraction.md` §1 + Lane SEC, `plans/P9F-check.md` (Security lane, Users dev-auth gap), `plans/P9-steps/{RT-K1-0,RT-K1-adm-owner-*,A-K2-security-*,A-adm-shell-lib-3,K5-project-keys-1}.md` |

Path shorthand: **T:** = Tovu `apps/admin/src/features/security/`; **J:** = Jini `packages/admin/src/security/`; **UM:** = Jini `packages/user-management/src/`. Other paths are repo-relative. Where SEC-0 cited a comment or `forwardRef` header line, this plan cites the code line.

---

## 0. Decisions this plan makes (Codex: judge these first)

**D1. Jini has one Security implementation.** Jini `admin/security` (`J:security.module.ts:4`) stays the only implementation. The generated sheets `A-K2-security-1/2/3` move Tovu files verbatim into `packages/admin/src/security/host/**`. That would put a second, Tovu-shaped Security beside the neutral one. **Retire those three sheets.** SEC-1…14 replace them.

**D2. Owner controls are injected.** `@jini-ai/admin` does not depend on `@jini-ai/user-management`; `packages/admin/package.json` has no dependency block naming it. TOTP (`UM:react/auth/TotpSettings.tsx:16`) and passkeys (`UM:react/auth/Passkeys.tsx:33`) already exist, and Tovu mounts them with its own ports (`T:Security.tsx:182,184`). Jini Security therefore gets one `ownerControls` slot, which the host fills.
- The only owner UI still missing is the recovery-kit card with desktop reset (`T:RecoveryCodesCard.tsx` + `.hooks.ts`). It moves to Users-owned `UM:react/auth/`, beside the hooks it already calls (`UM:react/auth/OwnerRecovery.hooks.ts:91,115,132`).
- As a result, SEC-0's SEC-2 and SEC-3 merge into **SEC-2**, and SEC-0's SEC-4 and SEC-5 merge into **SEC-3**.

**D3. Tovu's wire contracts stay byte-identical, using fields on existing adapter args.**
- Stock Jini differs from Tovu in three places:
  - root-key path `/system/site-token` vs `/system/site-key` (`J:adapters/http.ts:84`)
  - import body `{ token }` vs `{ siteKey }` (`J:adapters/http.ts:90`)
  - media-map key order (`J:adapters/http.ts:51-57`)
- Each Jini adapter gets one more field on its existing optional args. The current Jini value is the default, and the host passes Tovu's value. This follows the precedent of `createHttpOtherCredentials`'s `{ mediaLabels = {} } = {}` at `J:adapters/http.ts:58`.
- In that pattern a `_optional = {}` pad becomes the optional object at the same position, with default `{}`. The pad is not removed.

**D4. The URL and tab bridge is host composition.** Jini describes page `/secrets` with tab `root-key`. Tovu keeps `/admin/access-tokens?tab=site-key` (`apps/admin/src/panels.tsx:1038-1041`).
- Tovu's `useModulePanel` (`apps/admin/src/integrations/jini-admin/modules.hooks.ts:69-80`) already rewrites the path through `MODULE_PAGE_PATHS` (`:59`).
- SEC-T1 adds `'security.secrets': '/access-tokens'` and a tab alias (`site-key` ↔ `root-key`) in that file.
- Jini needs no route change.

**D5. Additions to port surface: all optional, all on existing ports, and flagged for the owner.**
- `RootKeyPort.reveal?` (SEC-6): `J:ports.ts:21` says "No reveal operation".
- Publish `verify` + snapshot `executionMode` (SEC-8).
- `SecurityApiPort.sharedKeys?` + `useProjectKey?` (SEC-12).
- An optional `SecurityEventsPort` token, shaped like comments' `CommentsEventsPort` (SEC-14).

Each is the smallest surface the missing behaviour needs; none is a new layer. **OWNER-FLAG:** if any of these counts as a "new port" under §1 ("if one is needed, STOP"), that step STOPs at its first commit.

**D6. The host maps grants.**
- Tovu has no `security.read` permission (0 matches under `apps/website/src`).
- Tovu gates the site-key tab on `admin.security.site-key.manage` (`T:rules.ts:60`; server `apps/website/src/features/identity/site-key-permission.ts:56`). Jini gates it on `admin.security.tokens.manage` (`J:rules.ts:4`).
- Host `securitySessionGrants` (SEC-T1; mirrors `commentsSessionGrants`, `integrations/jini-admin/comments-ports.ts`) emits:
  - `security.read` for every authenticated operator, because today's page is visible to all of them;
  - `admin.security.tokens.manage` iff `hasPermission('admin.security.site-key.manage')`;
  - each write grant iff `hasPermission(<same string>)`.
- The write strings already equal the server's checks:
  - `system.publish`: `routes/system/publish-credentials.ts:254`
  - `source-control.credentials.write`: `routes/system/source-control-credentials.ts:54`
  - `custom-credentials.write`: `routes/system/custom-credentials.ts:49`
  - `admin.assistant.manage` and `admin.integrations.manage`, as `J:rules.ts:11-15` expects

**D7. Product copy stays with the host.** Jini's English literals act as translator keys, as in comments (`packages/admin/src/comments/react/index.ts` `englishComments`/`CommentsTranslator`).
- Tovu's `T:security-i18n.ts` (2,394 lines, 5 locales, imports `COMMON_I18N`) is product copy under K3. It survives as the host dictionary.
- SEC-T1 moves it verbatim (`git mv`) to `apps/admin/src/integrations/jini-admin/security-i18n.ts`. It is the one file of the 39 that is relocated rather than deleted.
- A small alias table in `security-ports.ts` maps Jini keys to Tovu keys wherever the English differs, for example `Root key` → `Site key`.

**D8. The owner-auth routes become Users-owned `ServerRoute` factories.** The `dev-auth.ts` split (§3) targets `UM:admin-http/auth/`, new export `@jini-ai/user-management/admin-http/auth`.
- These routes set and clear cookies and write `Retry-After` and `Cache-Control`. That makes them non-JSON under P9K §2.K1: web `Request` → `Response` (core `contracts/server.ts:42`), mounted through `@jini-ai/http-kit/node-bridge` `createNodeDispatcher` (`packages/http-kit/src/node-bridge.ts:387`).
- The host injects session, cookie, local-boot and sign-in policy (owner 11-22).
- The generated `RT-K1-adm-owner-{mfa,passkey,recovery}-routes-1` sheets target `@jini-ai/cms`. I recommend retargeting them to the same Users directory. U-AUTH does not depend on that choice.

**Deliberate changes.** These are UI only and never touch the wire. Each is listed with the Tovu code it replaces.

| DC | change | Tovu today | Repoint |
|---|---|---|---|
| DC-1 | Write affordances hidden without the grant; the server stays the boundary | Controls shown; server 403s (`T:AccessTokensTab.tsx:367-454`) | Host grants (D6) |
| DC-2 | Start-fresh confirmation in kit `ConfirmDialog` with `agentMayConfirm={false}` (`J:react/tabs/RootKeyTab.tsx:19`). Phrase, preview and single POST unchanged | Inline form `T:SiteKeyRecoveryCard.tsx:84-106` | None |
| DC-3 | `jini-*` classes and `data-jini-part` replace `site-key-*`/`access-tokens-*` classes | `T:SiteKeyTab.tsx:67-243`, `T:AccessTokensTab.tsx` | SEC-T1 re-targets `apps/admin/src/styles/{access-tokens,site-key}.css` |

Not a DC: Tovu's **agent-handle names** (`security-*`, e.g. `T:Security.tsx:148,157,168,190`, `T:SiteKeyTab.tsx:68,84,114,132,264`, `T:SiteKeyRecoveryCard.tsx:18,76,101`). Every step carries them into Jini unchanged as kit `agentHandle` values. They are neutral, and agents and WebMCP pin them.

---

## 1. Parity table (behaviour by behaviour)

`MISSING` means Jini Security lacks the behaviour today. "OK" means it matches and only needs a pinning test.

| # | Behaviour | Tovu file:line | Jini file:line or MISSING | Build |
|---|---|---|---|---|
| P1 | Panel id `access-tokens`, `?tab` allowed, nav "Secrets" under Operations, lazy target | `panels.tsx:1038-1048`, `panel-pages.ts:54` | `J:security.module.ts:4` (`/secrets`, group `system`), `J:react/index.ts:5-9` | SEC-T1 host bridge (D4) |
| P2 | Tab change replaces the URL | `T:Security.hooks.ts:4-6` | `J:react/hooks/SecurityPage.hooks.ts:13` → host `modules.hooks.ts:73-76` | SEC-T1 alias |
| P3 | Site-key tab hidden while grants are unresolved or absent; deep link falls back | `T:Security.tsx:115-118,151-161`, `T:hooks/use-security-permissions.hooks.ts:31-35` | `J:react/hooks/SecurityPage.hooks.ts:8-9`; tab permission `J:security.module.ts:4` | SEC-1 tests; D6 |
| P4 | Kicker, h1 and description copy | `T:Security.tsx:164-181` | `J:react/pages/SecurityPage.tsx:10` (h1 only) | SEC-1 |
| P5 | Owner TOTP enrol/remove | `T:Security.tsx:182`, `apps/admin/src/lib/owner-mfa-api.ts:12` | MISSING here; `UM:react/auth/TotpSettings.tsx:16` | SEC-2 slot; host fills |
| P6 | Owner passkeys | `T:Security.tsx:184`, `lib/owner-passkey-api.ts:9` | MISSING here; `UM:react/auth/Passkeys.tsx:33` | SEC-2 slot |
| P7 | Recovery kit: owner and availability gate, password + TOTP proof, ten codes, private output, download/dismiss clears | `T:RecoveryCodesCard.tsx:14-69`, `T:RecoveryCodesCard.hooks.ts:7-22`, `lib/owner-recovery-api.ts:8-35` | MISSING card; `UM:react/auth/OwnerRecovery.hooks.ts:91,115` | SEC-3 |
| P8 | Desktop owner reset | `T:RecoveryCodesCard.tsx:35,74-90`, `T:RecoveryCodesCard.hooks.ts:25-36` | MISSING card; `UM:react/auth/OwnerRecovery.hooks.ts:132` | SEC-3 |
| P9 | Session inventory, audit viewer, user API keys | none among the 39 (SEC-0 confirmed) | none | No step. API keys are `RT-K1-adm-api-keys-1/2` |
| P10 | Status fields `envVarName`, `reason` | `features/sites/api/sites-api.types.ts:132-146` | `J:models.ts:39-43` lacks them; `J:adapters/http.ts:88` drops them | SEC-4 |
| P11 | Root-key wire paths and bodies | `features/sites/api/sites-api.ts:59,66,76,82,85,90` | `J:adapters/http.ts:84,88-92` | SEC-4 |
| P12 | Badge label including env var name, fingerprint with title, badge tone | `T:hooks/site-key-status.rules.ts:5-13`, `T:SiteKeyTab.tsx:129-143,154-157` | `J:react/tabs/RootKeyTab.tsx:17` (raw state · fingerprint · source) | SEC-5 |
| P13 | Source notes (env / file path / invalid / none) | `T:SiteKeyTab.tsx:170-191` | MISSING | SEC-5 |
| P14 | Scope warning varies by runtime mode | `T:SiteKeyTab.tsx:112-124` | `J:react/hooks/RootKeyTab.hooks.ts:21` (one string), `J:react/index.ts:5` | SEC-5 |
| P15 | Load error and loading state | `T:SiteKeyTab.tsx:82-91`, `T:hooks/use-site-key.hooks.ts:94-101` | `J:controllers/root-key.controller.ts:21`, `J:react/tabs/RootKeyTab.tsx:6` | SEC-5 |
| P16 | Generate hidden in UI; create-only; typed refusals (locked / refused / already-exists / generic) | `T:SiteKeyTab.tsx:145-149,253-290`, `T:hooks/use-site-key.hooks.ts:71-90,127-141` | `J:controllers/root-key.controller.ts:36-41`, generic message `:28`; shown at `J:react/tabs/RootKeyTab.tsx:17` | SEC-5 |
| P17 | Reveal (active key only, human action, local state, error), hide, cleared on refresh | `T:hooks/use-site-key.hooks.ts:109-125,143-150`, `T:SiteKeyTab.tsx:197-243` | MISSING (`J:ports.ts:21`) | SEC-6 |
| P18 | Clipboard copy, "Copied!" for 1.5 s, silent failure | `T:SiteKeyTab.hooks.tsx:18-31` | MISSING | SEC-6 |
| P19 | Agent-private markers on reveal action, revealed value and pasted-key input | `T:SiteKeyTab.tsx:205,231-232`, `T:SiteKeyRecoveryCard.tsx:55` | `J:react/tabs/RootKeyTab.tsx:9` (input only) | SEC-6, SEC-7 |
| P20 | Locked = status or generate refusal | `T:hooks/use-site-key-recovery.hooks.ts:53-76` | `J:rules.ts:82` (status only) | SEC-7 |
| P21 | Unlock: trim, single send, clear input, resealed-count message, refresh | `T:hooks/use-site-key-recovery.hooks.ts:84-87,119-134` | `J:controllers/root-key.controller.ts:42` (no count) | SEC-7 |
| P22 | Start fresh: preview, exact phrase, receiver list, result, refresh | `T:hooks/use-site-key-recovery.hooks.ts:89-94,136-169`, `T:SiteKeyRecoveryCard.tsx:66-108` | `J:controllers/root-key.controller.ts:5-10,43-54`, `J:react/tabs/RootKeyTab.tsx:11-19` | SEC-7 (+DC-2) |
| P23 | Recovery card stays visible to show the result | `T:SiteKeyTab.tsx:95`, `T:SiteKeyRecoveryCard.tsx:20-21` | `J:react/tabs/RootKeyTab.tsx:6` (notice only) | SEC-7 |
| P24 | Server `detail` shown on refusal | `T:hooks/use-site-key-recovery.hooks.ts:79-82` | generic text `J:controllers/root-key.controller.ts:28` | SEC-7 |
| P25 | Publish store: snapshot `executionMode`, `credentialType`, `worksFor`, `tokenHint`, verification on save, `verify` op; Deployment consumes these | `T:api/security-api.ts:14-52`, `T:api/security-api.types.ts:20-92`; `features/deployment/hooks/publish-credentials-dependencies.hooks.ts:13-19` | `J:models.ts:11-16`, `J:adapters/http.ts:19-30` | SEC-8 |
| P26 | Source-control store CRUD + providers | `features/source-control/api/source-control-api.ts:16-44` via `T:hooks/access-tokens-dependencies.hooks.ts:23-28` | `J:adapters/http.ts:22,36` (same paths) | OK; SEC-8 pins it |
| P27 | Custom store: create `scope`/`worksFor`; update `worksFor`, `username: null`; snapshot `projectKeysAvailable` | `T:api/security-api.ts:71-115`, `T:api/security-api.types.ts:100-147` | `J:models.ts:17-26`, `J:adapters/http.ts:7` (projection drops them) | SEC-11, SEC-12 |
| P28 | Independent publish and source-control catalogs; empty-hosting hint | `T:hooks/use-access-tokens.hooks.ts:387-389`, `T:AccessTokensTab.tsx:190-205` | `J:adapters/http.ts:32-39` (one `Promise.all`) | SEC-9 |
| P29 | Saved rows whose plugin vanished | `T:access-token-providers.ts:130-170` | `J:rules.ts:28-31` (label only) | SEC-9 |
| P30 | Merged ordering (saved first, category rank, label) across all stores | `T:rules.ts:100-177`, `T:AccessTokensTab.hooks.tsx:106-197` | separate lists `J:react/tabs/AccessTokensTab.tsx:11-13` | SEC-9 |
| P31 | Search across provider and row facts; whole-sentence count copy | `T:access-token-rows.ts:166-187`, `T:other-credential-stores.ts:101-119,154`, `T:AccessTokensTab.tsx:260-288` | `J:rules.ts:33-37`, `J:react/hooks/AccessTokensTab.hooks.ts:30-35` | SEC-9 |
| P32 | Numbered legacy sentinel labels | `T:access-token-rows.ts:11-27` | `J:rules.ts:27-31` (single label) | SEC-9 |
| P33 | Not-connected provider rows; "Add another" | `T:AccessTokensTab.tsx:94-102,320-365` | `J:react/hooks/AccessTokensTab.hooks.ts:26-29` | SEC-9 |
| P34 | Vendor form: fields before/after the token, help, scope-guidance disclosure | `T:access-token-providers.ts:192-215`, `T:AccessTokensTab.tsx:486-666` | `J:react/components/CredentialEditor.tsx:7-8`, `J:react/hooks/CredentialEditor.hooks.ts:7` | SEC-10 |
| P35 | Ready-to-save; rename without token; replace | `T:access-token-forms.ts:25-129,157-170` | `J:rules.ts:48-60,75-81` | SEC-10 |
| P36 | Scoped duplicate-name message; classified submit errors | `T:access-token-forms.ts:131-155`, `T:hooks/use-access-tokens.hooks.ts:285-321`, `T:security-i18n.ts:2232` | `J:rules.ts:39-43` | SEC-10 (copy via SEC-14) |
| P37 | Default indicator shown only with a quorum; make default | `T:AccessTokensTab.tsx:456-484`, `T:hooks/use-access-tokens.hooks.ts:701-730` | `J:react/tabs/AccessTokensTab.tsx:12`, `J:controllers/access-tokens.controller.ts:78` | SEC-10 |
| P38 | Remove dialog: "remove from host" consequence, revoke link to `vendorLabel`, last-row note | `T:AccessTokensTab.tsx:828-881`, `T:security-i18n.ts:2243-2300` | static text `J:react/tabs/AccessTokensTab.tsx:16` | SEC-10 |
| P39 | Extra secret fields are agent-private | `T:AccessTokensTab.tsx:635-666` | `J:react/components/CredentialEditor.tsx:8` (password type, no private attr) | SEC-10 |
| P40 | `worksFor` chips that keep disabled-plugin ids | `T:AccessTokensTab.tsx:668-683`, `T:custom-credential-forms.ts:129-137`, `T:hooks/use-access-tokens.hooks.ts:400-407` | MISSING | SEC-10 (publish), SEC-11 (custom) |
| P41 | Custom: per-origin host validation, username clear, metadata-only patch, no top-level `username` on create | `T:custom-credential-forms.ts:30-187`, `T:AccessTokensTab.tsx:896-921`, `T:api/security-api.ts:74-84` | `J:rules.ts:44-47,62-73` (base URL only; `customPatchFields` sends `username` on create) | SEC-11 |
| P42 | Custom storage choice (project vs site) | `T:AccessTokensTab.tsx:923-940` | MISSING | SEC-12 |
| P43 | Shared Keys picker: owner-only metadata inventory, omissions, locked rows, grant results | `T:CopyKeysDialog.tsx:9-34`, `T:hooks/use-copy-keys.hooks.ts:15-83`, `T:api/security-api.ts:55-63` | MISSING | SEC-12 |
| P44 | Project key attach/detach, usage chips, 30-second revoke note | `T:AccessTokensTab.tsx:422-454`, `T:hooks/use-access-tokens.hooks.ts:533-552`, `features/providers/api/providers-api.ts:6-7` | MISSING | SEC-12 |
| P45 | Rotation warning for shared keys | `T:AccessTokensTab.tsx:756-759`, `T:security-i18n.ts:2167-2181` | MISSING | SEC-12 |
| P46 | Masked, server-approved token hints | `T:AccessTokensTab.tsx:399`, `T:api/security-api.types.ts:23,115`, `T:hooks/use-other-credentials.hooks.ts:1` | `J:models.ts:10` ("without a last-4 hint") | SEC-12 (D5 policy flag) |
| P47 | Other stores: placeholders, deep links, per-store consequences, per-row feedback | `T:other-credential-stores.ts:51-91`, `T:OtherCredentialsSection.tsx:49-268` | `J:react/tabs/AccessTokensTab.tsx:13` (configured rows only) | SEC-13 |
| P48 | BYOK stores (masked/hint read, `PUT {apiKey}`, DELETE) | `T:hooks/use-other-credentials.hooks.ts:111-135,388-433` | `J:adapters/http.ts:60-77` | Wire OK; SEC-13 hints |
| P49 | Media whole-map write | `T:hooks/use-other-credentials.hooks.ts:183-211` (replaced id appended last as `{ apiKey, ...kept }`) | `J:adapters/http.ts:51-57` (kept in place as `{ baseUrl, model, apiKey }`) | SEC-13, byte-identical |
| P50 | External MCP: remove-only; env-name count with plural forms | `T:hooks/use-other-credentials.hooks.ts:150-170`, `T:other-credential-stores.ts:139-143` | `J:adapters/http.ts:66,76`, `J:react/tabs/AccessTokensTab.tsx:13` | SEC-13 |
| P51 | Serialized writes | `T:hooks/use-other-credentials.hooks.ts:233` | `J:controllers/other-credentials.controller.ts:18-38` | OK (pin) |
| P52 | Host content-refresh subscription and publication | `T:hooks/use-access-tokens.hooks.ts:488-506`, `T:hooks/use-other-credentials.hooks.ts:234-245`, `T:hooks/use-copy-keys.hooks.ts:65` | MISSING (manual reload only, `J:react/hooks/AccessTokensTab.hooks.ts:58`) | SEC-14 |
| P53 | Settlement generations (stale read never wins) | `T:hooks/use-access-tokens.hooks.ts:452` | `J:controllers/access-tokens.controller.ts:16,35-37` | OK (pin in SEC-14) |
| P54 | Localized, redacted, actionable failure copy | `T:security-i18n.ts:2195-2392`, `T:hooks/use-access-tokens.hooks.ts:1-2` (`@tovu/contracts/credential-copy`, `@/lib/credential-copy`) | `J:messages.en.ts:1` (9 keys); fixed controller strings | SEC-14 |
| P55 | Tab icons | `T:security-visuals.tsx:19-66` | kit `Icon` (A-K2-0a, `44ee815e`) | SEC-1 (kit names; host supplies glyphs) |

### Wire contracts (paths under `/workspaces/:ws`; the host passes `workspacePath`)

| # | Call | Tovu | Stock Jini | Step |
|---|---|---|---|---|
| W1 | `GET /system/publish/credentials` → `{ credentials, executionMode }` | `T:api/security-api.ts:14-15` | same path, drops `executionMode` (`J:adapters/http.ts:25`) | SEC-8 |
| W2 | `POST /system/publish/credentials` `{ label, connection, isDefault?, worksFor? }` → `{ credential, verification? }` | `:22-26` | no `worksFor`; drops `verification` | SEC-8, SEC-10 |
| W3 | `PUT …/:id` (same body family) | `:33-37` | same gaps | SEC-8 |
| W4 | `DELETE …/:id` | `:40-41` | same | OK |
| W5 | `POST …/:id/verify` → `{ verification }` | `:49-52` | MISSING | SEC-8 |
| W6 | source-control credential CRUD; `GET /system/source-control/providers` | `source-control-api.ts:16-44` | same (`J:adapters/http.ts:22,36`) | OK |
| W7 | `GET /system/publish-targets` | `deployment-api.ts:57-58` | same (`J:adapters/http.ts:35`) | SEC-9 decouples it |
| W8 | custom credential CRUD; create `{ scope?, worksFor?, label, category, baseUrl, additionalHosts?, connection }`; update adds `username?: string \| null` | `T:api/security-api.ts:71-115` | same path; create also sends top-level `username` (`J:rules.ts:71-73,80`) | SEC-11 |
| W9 | `GET` / `POST /system/credential-copy` | `T:api/security-api.ts:55-63` | MISSING | SEC-12 |
| W10 | `PUT /project-keys/:keyId/use` `{ use }` | `providers-api.ts:6-7` | MISSING | SEC-12 |
| W11 | `/assistant/site-credential`, `/assistant/execution-credential` GET / `PUT { apiKey }` / DELETE | `ai-assistant-api.ts:107-122` | same (`J:adapters/http.ts:60-77`) | OK |
| W12 | `GET` / `PUT /media/providers` | `media-api.ts:13-17` | same path; PUT key order differs | SEC-13 |
| W13 | `GET /mcp-servers`; `DELETE /mcp-servers/:id` | `integrations-api.ts:115-128` | same | OK |
| W14 | `GET /system/site-key` | `sites-api.ts:59` | `/system/site-token` | SEC-4 |
| W15 | `POST /system/site-key/reveal` | `sites-api.ts:65-66` | MISSING | SEC-6 |
| W16 | `POST /system/site-key/generate` | `sites-api.ts:75-76` | path | SEC-4 |
| W17 | `POST /system/site-key/import` `{ siteKey }` | `sites-api.ts:81-82` | path + body `{ token }` | SEC-4 |
| W18 | `GET` / `POST /system/site-key/start-fresh` `{ confirm }` | `sites-api.ts:84-90` | path | SEC-4 |
| W19 | `GET /api/admin/v1/auth/me` (grants) | `T:hooks/security-permissions-dependencies.hooks.ts:11-13` | host session (`comments-ports.ts` uses `/auth/me` too) | SEC-T1, U-AUTH-3 |

---

## 1b. Step contract for every SEC/U-AUTH step (on top of `P9-extraction.md` §1)

- **Branch** `p9/sec-<n>` (or `p9/u-auth-<n>`) from the current Jini integ tip, which is `integ/merge-13-2026-11-22` `7c4ee7881` at plan time. SEC-1/2/5/6/7/9-14 also need A-K2-0a (`44ee815e`) merged first, because they use the kit `Icon`/`useT`.
- **Tests first.** Write the named failing test (or port the named Tovu assertions; only the import line and the injected collaborators change), commit it red, implement, go green. Then apply the **named mutation**, paste red output, revert, paste green.
- **Per-step outputs:** `pnpm api:update` delta (added or changed entries only, listed in the report) and changeset `.changeset/p9-sec-<n>.md`.
- **Gates:** `pnpm guard`, `typecheck`, `check:size`, `check:complexity`, `check:hooks`, `check:cross-package`, `api:check`; none may get worse than baseline. Package tests run as `npm --prefix packages/<pkg> run test`.
- **Owner rules:** inject everything, with hooks as props (`use…Hook = use…` defaults, as `J:react/tabs/*.tsx` already do). Keep every `_optional = {}` pad and the two-object args rule. Functions stay ≤ 80 lines and complexity ≤ 10. Why-comments move with their code; use verbatim moves where code moves. No re-export shells. `jini-*` classes. No vendor or server-framework names. No runtime code under core `src/contracts` (XP4).
- **Never log or display secrets.** Every step that touches a secret field adds a test that the secret is absent from snapshots, error strings and `console` output.
- **One implementer per step.** Commit and push every 5–10 minutes. `git pull --rebase`, no force-push. Report SHAs.
- **Extra STOP conditions:**
  - (a) an optional port method or token from D5 is refused by the owner;
  - (b) a kit component or `KitIconName` the step needs is absent and A-K2-0a did not add it (K2 gap; do not add kit names here);
  - (c) a Tovu assertion cannot be expressed against the Jini controller without weakening it.

---

## 2. Jini steps SEC-1…SEC-14

All files are under `packages/admin/src/security/` unless shown with a package path. "Ports" = Tovu tests whose assertions are copied (vitest) in that step. The Tovu originals are deleted only in SEC-T1.

### SEC-1 — Module on the injected UI, host translator, page header (100 min)

- **Goal:** `security()` adopts comments' module shape so Tovu's `createHostAdminScope` can host it. It takes `security({ ui }, { t?, rootKeyScopeNotice? })` today modelled on `packages/admin/src/comments/react/index.ts`; today it is `security(_required, { rootKeyScopeNotice })` calling `bindReact` directly (`J:react/index.ts:1-9`).
- **Translator:** the host `t` flows through a translation context. A locale change does not remount; see the comments Provider comment in that file.
- **Header and icons:** the header gains kicker and description keys (P4). Tab items use kit `Icon` names (P55).
- **Files:**
  - `react/index.ts`
  - `messages.en.ts`: becomes `englishSecurity: SecurityTranslator`, keeping `securityMessagesEn` for module labels
  - `react/hooks/SecurityPorts.hooks.ts`: + `SecurityTranslationContext`
  - `react/pages/SecurityPage.tsx`
  - `react/hooks/SecurityPage.hooks.ts`
- **Exports / API delta:**
  - `./security/react`: `security` signature changed (breaking; changeset **minor**)
  - `./security/react`: + `SecurityTranslator` (type)
  - `./security`: + `englishSecurity`
  - Update any in-repo caller (`rg "@jini-ai/admin/security/react" examples packages`).
- **Tests first** (`react/__tests__/security-module.test.tsx`):
  - empty grants → no `root-key` item, and `requestedTab: 'root-key'` renders access-tokens;
  - `security.read` only → same;
  - with `admin.security.tokens.manage` → items `[access-tokens, root-key]`;
  - swapping `t` relabels the page without disposing the tab controller;
  - `onTabChange({ tab })` fires once per change.
- **Ports:** `T:__tests__/Security.unit.test.tsx` (tab-visibility and deep-link cases); `T:__tests__/use-security-permissions.unit.test.tsx`.
- **Mutation:** drop `permissions: ['admin.security.tokens.manage']` from the `root-key` tab in `J:security.module.ts:4` → the "empty grants" case goes red.
- **Depends:** A-K2-0a. **Files left (Tovu):** 39.

### SEC-2 — Owner-controls slot (60 min)

- **Goal:** the host-supplied `ownerControls?: ReactNode` (Provider prop beside `t`) renders once, above the tab bar, only when the page is visible. Jini passes it no props; the host binds its own ports. This covers SEC-0's SEC-2 and SEC-3 (TOTP and passkeys already live in `UM:`).
- **Files:**
  - `react/index.ts`: Provider prop
  - `react/hooks/SecurityPorts.hooks.ts`: context value
  - `react/hooks/SecurityPage.hooks.ts`: `ownerControls` in the view model
  - `react/pages/SecurityPage.tsx`
- **API delta:** Provider props + `ownerControls`.
- **Tests first** (`react/__tests__/security-owner-controls.test.tsx`):
  - slot rendered once, before `Tabs`;
  - absent when page denied;
  - nothing rendered when not supplied;
  - slot survives a tab change (no remount).
- **Mutation:** stop rendering `vm.ownerControls` in `SecurityPage.tsx` → red.
- **Depends:** SEC-1.

### SEC-3 — Owner recovery card (Users-owned; `@jini-ai/user-management`) (110 min)

- **Goal:** move Tovu's card and its hook wrappers verbatim into user-management, beside `useRecoveryKit` / `createRecoveryKitDownload` / `useOwnerPasswordReset`. Covers SEC-0's SEC-4 and SEC-5.
- **Moves (verbatim):**
  - `T:RecoveryCodesCard.tsx` (90 lines) → `UM:react/auth/RecoveryCodesCard.tsx`
  - `T:RecoveryCodesCard.hooks.ts` (36 lines) → `UM:react/auth/RecoveryCodesCard.hooks.ts`
  - Type-only: `OwnerRecoveryStatus` and `OwnerRecoveryPort` from `apps/admin/src/lib/owner-recovery-api.ts:8-22` → the hooks file. Tovu's lib re-imports them (K4).
- **Allowed edits:**
  - **Imports:** `SecretInput` from `../kit.js` (`UM:react/kit.tsx:88`); the hooks relative `./OwnerRecovery.hooks.js`.
  - **Injected as props (K5):**
    - `port`: was the default `ownerRecoveryPort`; now required.
    - `describeFailure`: was `ownerRecoveryFailure`. Called with the same `{ error, message, action, step, t }` object, so the literal message/action keys stay in Jini.
    - `FailureNotice: ComponentType<{ failure; t }>`: was `ErrorNotice` from `@jini-ai/ui/panel-kit`. User-management has no `ErrorNotice`, and an admin→ui edge is not allowed.
  - **Host copy (K3):** `filename`, replacing `'tovu-owner-recovery-codes.txt'` at `T:RecoveryCodesCard.hooks.ts:17`.
  - **Unchanged:** `saveTextFile` keeps its DOM default verbatim.
- **Exports / API delta:** `@jini-ai/user-management/react` + `RecoveryCodesCard`, `OwnerRecoveryStatus`, `OwnerRecoveryPort`. Changeset user-management patch.
- **Tests first** (`UM:react/auth/__tests__/RecoveryCodesCard.test.tsx`) port `T:__tests__/RecoveryCodesCard.unit.test.tsx` (104 lines) and add:
  - not owner → nothing rendered;
  - unavailable → nothing rendered;
  - load failure → `FailureNotice` receives the described failure and no raw error text;
  - one issue call carrying password and optional code;
  - codes rendered only inside `data-agent-private`;
  - download → `saveTextFile` gets the injected filename, then the list clears;
  - dismiss clears;
  - `desktopOwnerReset: false` → no reset form;
  - mismatch → message and no write;
  - reset success message;
  - autocomplete attributes `current-password` / `one-time-code` / `new-password`. These carry the `credential-input-autocomplete` allow-list assertions at `apps/admin/src/lib/__tests__/credential-input-autocomplete.unit.test.ts:171,211`.
- **Mutation:** pass no `dismiss` to `createJiniRecoveryKitDownload` → the "download clears codes" test goes red.
- **Depends:** none (parallel).

### SEC-4 — Root-key wire parity (70 min)

- **Goal:** the Tovu site-key wire works byte for byte (W14, W16–W18; W15 lands in SEC-6), and status keeps `envVarName` and `reason`.
- **Files:**
  - `models.ts`: `RootKeyStatus` + `envVarName?: string`, `reason?: 'empty' | 'not-hex' | 'odd-length' | 'too-short'`
  - `adapters/http.ts`: `createHttpRootKey({ transport, workspacePath }, { path = '/system/site-token', importField = 'token' } = {})`; the import body is `{ [importField]: token }`; status projection adds the two fields when present
  - `adapters/memory.ts`: accepts them
- **API delta:** `RootKeyStatus` hash; `createHttpRootKey` signature (additive optional).
- **Tests first** (`__tests__/http.test.ts`), with fixtures asserting method, path and `JSON.stringify(body)`:
  - with `{ path: '/system/site-key', importField: 'siteKey' }`: status GET, generate POST, import POST `{"siteKey":"…"}`, preview GET, start-fresh POST `{"confirm":"START FRESH"}`;
  - defaults unchanged;
  - status projection strips an injected `hex` / `token` extra.
- **Ports:** `T:hooks/__tests__/site-key-dependencies.unit.test.ts`.
- **Mutation:** hardcode `{ token }` in `importToken` → red.
- **Depends:** none.

### SEC-5 — Root-key status presentation, generate visibility, typed refusals (110 min)

- **Goal:** P12–P16. A badge key with vars, source notes and the runtime scope paragraphs all go through `t`. The env-var fallback comes from status or the host tab param `defaultEnvVarName`; Jini never contains `TOVU_SITE_KEY`. A host tab param `generate: 'shown' | 'hidden'` defaults to `'shown'`, and Tovu passes `'hidden'` to match `T:SiteKeyTab.tsx:145-149`.
- **Refusal classes:** the controller classifies a generate failure through an injected optional `describeError?: ({ error }) => { code?: string; detail?: string }`, a field on its optional args. The classes are:
  - `locked`: `KEY_DEPENDENT_DATA` | `KEY_MISMATCH`
  - `refused`: `KEY_INVALID` | `SITE_META_UNREADABLE`
  - `already-exists`: `ALREADY_EXISTS`
  - `generic`

  These match `T:hooks/use-site-key.hooks.ts:82-90`.
- **Files:**
  - `controllers/root-key.controller.ts`: `generateFailure` in the snapshot
  - `rules.ts`: `rootKeyBadge`, `rootKeySourceNote`; both pure, return `{ key, vars }`
  - `react/hooks/RootKeyTab.hooks.ts`
  - `react/tabs/RootKeyTab.tsx`: split into `RootKeyStatusCard` / `RootKeyScopeNotice` sub-components to stay ≤ 80 lines
- **Tests first** (`__tests__/root-key.controller.test.ts`, `react/__tests__/RootKeyTab.test.tsx`). Ports:
  - status, badge and note cases of `T:__tests__/SiteKeyTab.unit.test.tsx` (393 lines);
  - `T:__tests__/site-key-status.rules.unit.test.ts`;
  - `T:__tests__/site-key-generate-error.unit.test.ts` (classification table).

  New cases: generate absent when `hidden`; never offered for an active key or source `env` / `file`; a `KEY_DEPENDENT_DATA` refusal sets `locked`; `KEY_INVALID` shows its detail; no key material in any snapshot field.
- **Mutation:** remove `status.active ||` from the guard at `J:controllers/root-key.controller.ts:39` → "never offered for an active key" goes red.
- **Depends:** SEC-1, SEC-4.

### SEC-6 — Human-only reveal and clipboard (95 min)

- **Goal:** P17–P19.
- **Port:** `RootKeyPort` + `reveal?(required: Record<string, never>, optional?: RequestOptions): Promise<{ hex: string }>`. The comment at `J:ports.ts:21` becomes "reveal is optional; absent means no reveal affordance; status, generate and recovery stay secret-free" (D5).
- **HTTP adapter:** `createHttpRootKey` optional `reveal = false`. When true, it adds `reveal` as `POST ${path}/reveal`, projecting only `hex`.
- **Memory adapter:** optional `revealHex`.
- **Controller:**
  - `reveal()` runs only for an active key, with `port.reveal` present, when not already revealing;
  - `revealed` is cleared on `hide`, `load`, any successful write, and `dispose`;
  - `copy()` uses an injected optional `clipboard?: Pick<Clipboard, 'writeText'>`; `copied` reverts after 1,500 ms; failure is silent, as in `T:SiteKeyTab.hooks.tsx:23-28`.
- **UI:** the Reveal control renders only when `port.reveal` exists. The action wrapper and the value element carry `data-agent-private`, as in `T:SiteKeyTab.tsx:205,231-232`. `KitAttrs` (`packages/admin/src/react/kit.tsx:23`) has no `data-agent-private` key, so the marker goes on a plain wrapping element. Never drop it.
- **Files:** `ports.ts`, `adapters/http.ts`, `adapters/memory.ts`, `controllers/root-key.controller.ts`, `react/hooks/RootKeyTab.hooks.ts`, `react/tabs/RootKeyTab.tsx`.
- **API delta:** `RootKeyPort` hash; `createHttpRootKey` optional arg.
- **Tests first.** Ports `T:__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx` (91 lines), plus the reveal cases of `T:__tests__/SiteKeyTab.unit.test.tsx` and `T:__tests__/use-site-key.unit.test.tsx` (201 lines). New cases:
  - no control without `reveal`, and none for an inactive key;
  - one POST per click;
  - hide and refresh clear the value;
  - an error shows no value;
  - copy then revert under fake timers;
  - the value never appears in `error` / `result` or in any `console` call.
- **Mutation:** remove the private marker from the revealed-value wrapper → the secrecy test goes red.
- **Depends:** SEC-5.

### SEC-7 — Recovery parity (110 min)

- **Goal:** P20–P24.
- **Locked state:** `isRootKeyLocked({ status, generateFailure })`, as in `T:hooks/use-site-key-recovery.hooks.ts:53-62`. The recovery card opens on a locked generate refusal and stays to show `result`.
- **Messages through `t`:**
  - unlock: base sentence, plus "{count} saved since were moved over." when `resealed > 0` (`:84-87`);
  - start fresh: lists receivers (`:89-94`).
- **Refusals:** show the server `detail` through `describeError` (`:79-82`). The current generic text remains the fallback.
- **Preview failure:** keeps the confirm step and shows the error (`:136-146`).
- **Files:** `rules.ts`, `controllers/root-key.controller.ts`, `react/hooks/RootKeyTab.hooks.ts`, `react/tabs/RootKeyTab.tsx` (`LockedActions`, `StartFreshBody`).
- **Tests first.** Ports `T:__tests__/use-site-key-recovery.unit.test.ts` (255 lines) and `T:__tests__/SiteKeyRecoveryCard.unit.test.tsx`. Cases:
  - a blank or whitespace key sends nothing;
  - a trimmed key is sent once while in flight;
  - success clears the input, shows the count message, and triggers one status reload;
  - confirm is disabled until the exact phrase;
  - preview detail and receivers are listed;
  - refusal shows `detail`;
  - cancel resets the phrase;
  - a locked-by-refusal state shows the card;
  - the pasted-key input is agent-private.
- **Mutation:** delete the `state.confirm !== START_FRESH_CONFIRMATION` clause at `J:controllers/root-key.controller.ts:52` → red.
- **Depends:** SEC-6.

### SEC-8 — Publish credential contract shared with Deployment (105 min)

- **Goal:** P25 and W1–W5. Deployment's five calls can leave Tovu's `T:api/security-api.ts`.
- **Moves:**
  - (a) **Type-only K4, verbatim:** `T:api/security-api.types.ts` (166 lines) → `wire.types.ts`, names unchanged (`AdminPublishCredentialSummary`, `AdminPublishCredentialVerification`, `AdminPublishExecutionMode`, `AdminPublishCredentialsSnapshot`, custom, copy, …).
    - Its `CredentialTokenHint` import (`@jini-ai/platform/secrets/credential-token`, defined at `packages/platform/src/secrets/credential-token.ts:65` as `{ length: number; last4: string | null }`) would be a new admin→platform edge.
    - Use the K4-seam core home if one exists by then. Otherwise STOP and report: no structural copy without owner OK.
  - (b) **Adapter:** `createHttpPublishCredentials({ transport, workspacePath })` returns an object whose method names equal Tovu's: `listPublishCredentials`, `createPublishCredential`, `updatePublishCredential`, `deletePublishCredential`, `verifyPublishCredential`. That keeps the Deployment repoint to a specifier and a binding.
    - Requests are byte-identical to `T:api/security-api.ts:14-52`.
    - Responses are explicitly projected to the declared wire fields, so extras such as `token` or `ciphertext` are dropped, consistent with `J:adapters/http.ts:4`.
  - (c) The screen's `summary()` projection also carries `credentialType` and `worksFor`.
- **Files:** `wire.types.ts` (new), `adapters/http.ts`, `adapters/memory.ts` (publish snapshot + verify), `conformance/security-api.conformance.ts` (publish provider: `executionMode` present; `verify` returns a status in `valid | invalid | unreachable`), `index.ts`.
- **API delta:**
  - `./security`: + the wire types
  - `./security/adapters/http`: + `createHttpPublishCredentials`
  - `./security/adapters/memory`: + `createMemoryPublishCredentials`
- **Tests first:** an HTTP fixture per call (method, path, exact body) and projection stripping. Port the publish cases of:
  - `apps/admin/src/lib/__tests__/api-request-shapes.clients.ts:24` users
  - `api-system-endpoints.unit.test.ts:4`
  - `api-id-url-encoding.unit.test.ts:3` (id encoding)
  - `T:hooks/__tests__/access-tokens-dependencies.unit.test.ts` (publish half)

  Plus a conformance run on the memory adapter.
- **Mutation:** drop `executionMode` from the projected snapshot → red.
- **Depends:** none.

### SEC-9 — Catalog independence, unlisted providers, merged ordering, search, count, legacy labels (110 min; may split 9a rules / 9b view model, same implementer)

- **Port:** `SecurityApiPort.providers(required: { kind?: 'publish' | 'source-control' })`. This widens the existing required arg from `Record<string, never>` (a field, not a method). The adapter serves each kind from its own endpoint; no `kind` still returns both. The controller issues two independent calls, and one failure leaves the other catalog shown (P28).
- **Rules** (`rules.ts`; verbatim logic, Jini names):
  - `providersWithSavedRows` (`T:access-token-providers.ts:130-170`), including the unlisted fallback;
  - `sortCredentialGroups` (`T:rules.ts:113-177`);
  - numbered `legacyCredentialLabel` (`T:access-token-rows.ts:11-27`);
  - `rowMatchesQuery` / `providerMatchesQuery` (`T:access-token-rows.ts:166-187`);
  - the count sentence keys (`T:other-credential-stores.ts:154-169`).
- **View model and UI:** `react/hooks/AccessTokensTab.hooks.ts` builds merged groups (`T:AccessTokensTab.hooks.tsx:106-197`). `react/tabs/AccessTokensTab.tsx` renders groups, not-connected rows and the empty-hosting hint (P33, P28).
- **Files:** `ports.ts`, `adapters/http.ts`, `adapters/memory.ts`, `rules.ts`, `controllers/access-tokens.controller.ts`, the two react files.
- **API delta:** `SecurityApiPort` hash; + 4 rules exports.
- **Tests first** (ports):
  - `T:__tests__/rules.unit.test.ts` (975 lines): the categories, sort, search and legacy-label sections
  - `T:__tests__/AccessTokensTab.unit.test.tsx`: ordering and empty hint
  - `T:hooks/__tests__/use-access-tokens.unit.test.tsx`: the catalog-failure sections
- **Mutation:** filter out saved rows whose provider descriptor is absent → red.
- **Depends:** SEC-1, SEC-8.

### SEC-10 — Vendor token forms, default indicator, removal consequences (105 min)

- **Goal:** P34–P40 for publish and source-control.
- **Editor:** extra fields render before and after the token (`T:access-token-providers.ts:200-215`). Help and scope guidance sit in a disclosure. Secret extra fields carry `data-agent-private`.
- **Draft and patch:** ready-to-save rules follow `T:access-token-forms.ts:25-129,157-170`. A rename without a token sends no `connection`. `worksFor` is sent only when changed (`T:custom-credential-forms.ts:129-137`).
- **`worksFor` chips:** a kit multi-select retains unknown or disabled-plugin ids as removable chips (`T:AccessTokensTab.tsx:668-683`). If the kit has no multi-select, apply STOP (b).
- **Default indicator:** shown only when a provider has more than one row (`T:AccessTokensTab.tsx:456-484`).
- **Remove dialog:** consequence and last-row note keys, plus a revoke link to `tokenPageUrl` labelled with `vendorLabel` (`T:AccessTokensTab.tsx:828-881`). Host copy says "Remove from Tovu"; the Jini key is neutral.
- **Duplicate name:** scoped message with the provider label.
- **Files:** `rules.ts`, `react/components/CredentialEditor.tsx`, `react/hooks/CredentialEditor.hooks.ts`, `react/tabs/AccessTokensTab.tsx`, `react/hooks/AccessTokensTab.hooks.ts`.
- **Tests first** (ports):
  - `T:__tests__/access-tokens-revoke-copy.unit.test.tsx` (128 lines)
  - vendor sections of `T:__tests__/AccessTokensTab.credential-flows.unit.test.tsx` (966 lines)
  - removal-dialog cases of `T:__tests__/AccessTokensTab.hooks.unit.test.tsx` (243 lines)
  - `T:__tests__/access-token-providers.fixture.ts` (fixture)
- **Mutation:** make `buildCredentialPatch` emit `connection` when the token is blank → the "name-only edit" test goes red.
- **Depends:** SEC-9.

### SEC-11 — Custom provider forms and compatibility (110 min)

- **Goal:** P41, P40 (custom) and W8.
- **Validation:** per-origin validation of additional hosts (`T:custom-credential-forms.ts:30-66`); invalid entries are listed (`T:AccessTokensTab.tsx:896-921`).
- **Create:** the body matches `T:api/security-api.ts:74-84`, with **no top-level `username`**; username goes inside `connection`.
- **Update:** only changed fields, with explicit `username: null` to clear (`T:custom-credential-forms.ts:160-183`).
- **Compatibility:** `worksFor` on create and update; the projection carries `worksFor` and `credentialType`.
- **Files:** `rules.ts`, `adapters/http.ts`, `adapters/memory.ts`, `react/components/CredentialEditor.tsx`, `react/hooks/CredentialEditor.hooks.ts`.
- **Tests first:**
  - a W8 HTTP fixture: create body without `username`; clear sends `"username":null`;
  - the custom sections of the credential-flows, rules and use-access-tokens tests above.
- **Mutation:** accept a malformed additional origin → red.
- **Depends:** SEC-10.

### SEC-12 — Shared Keys, project-key use, safe hints, rotation warning (120 min; may split 12a port/adapter/controller, 12b UI)

- **Port (D5):**
  - `SecurityApiPort.sharedKeys?: { list(required, optional): Promise<readonly AdminCredentialCopySource[]>; grant(required: { sourceSiteId; ids; overwrite }, optional): Promise<readonly AdminCredentialCopyResult[]> }`
  - `useProjectKey?(required: { keyId; use })`
  - Adapter routes per W9 and W10, byte-identical.
- **Projection:** adds `scope`, `usedBy`, `usedByThisSite` and `tokenHint`. The hint is displayed exactly as the server sent it and is never derived. `J:models.ts:10` changes, which is the D5 policy flag.
- **Controller:** `sharedKeys.controller.ts`, with the logic of `T:hooks/use-copy-keys.hooks.ts:28-77`:
  - open resets state;
  - picks only the `shared-keys` source;
  - locked rows cannot be selected;
  - a busy ref prevents double submit;
  - `P25_KEY_PICKER_LOAD_FAILED` / `P25_KEY_GRANT_FAILED` copy keys;
  - an injected `onGranted` callback, wired to refresh in SEC-14.
- **UI:**
  - kit `Dialog` picker with omissions (P43);
  - storage choice shown when the snapshot has `projectKeysAvailable` (P42);
  - usage chips, attach/detach and the 30-second note (P44);
  - rotation warning (P45).
- **Files:** `ports.ts`, `models.ts`, `adapters/http.ts`, `adapters/memory.ts`, `controllers/shared-keys.controller.ts` (new), `react/components/SharedKeysDialog.tsx` (new) + `react/hooks/SharedKeysDialog.hooks.ts` (new), `react/tabs/AccessTokensTab.tsx`.
- **API delta:** `SecurityApiPort` hash; + `createSharedKeysController`.
- **Tests first** (ports):
  - `T:__tests__/CopyKeysDialog.unit.test.tsx`
  - `T:hooks/__tests__/use-copy-keys.unit.test.tsx`
  - `T:__tests__/copy-keys.fixture.ts`
  - the shared-key sections of credential-flows and use-access-tokens
- **Mutation:** render "Granted to this site" for any result status → red. This is SEC-0's "treat a failed grant as success".
- **Depends:** SEC-11.

### SEC-13 — Other credential stores (110 min)

- **Goal:** P47–P50.
- **Placeholders:** the controller keeps an empty or unconfigured store as a placeholder row.
- **Deep links:** host-injected `otherStores?: Partial<Record<OtherStoreId, { href: string; label: string }>>` on the module options. Tovu passes `T:other-credential-stores.ts:59-86`.
- **Hints and counts:** masked hint per store (`T:hooks/use-other-credentials.hooks.ts:111-150`). MCP env-name plural keys (`T:other-credential-stores.ts:139-143`).
- **Remove dialogs:** per-store consequences (`T:OtherCredentialsSection.tsx:223-268`). Per-row saving and error state.
- **Media PUT** (byte-identical to Tovu; adopted as Jini's own order):
  - the replaced id is removed from its position and appended last as `{ apiKey, ...kept }`;
  - a removed id is dropped;
  - siblings are `{ baseUrl?, model? }` only.
- **Files:** `adapters/http.ts` (`rebuildMedia`), `controllers/other-credentials.controller.ts`, `react/hooks/AccessTokensTab.hooks.ts`, `react/components/OtherCredentialRow.tsx` (new).
- **Tests first:**
  - a W12 fixture comparing `JSON.stringify(body)` with Tovu's for replace and remove;
  - the sibling secret is never echoed.
  - Ports:
    - `T:__tests__/OtherCredentialsSection.unit.test.tsx` (318 lines)
    - `T:hooks/__tests__/use-other-credentials.unit.test.tsx` (676 lines)
    - `T:hooks/__tests__/other-credentials-dependencies.unit.test.ts`
- **Mutation:** skip the unrelated sibling in `rebuildMedia` → red.
- **Depends:** SEC-12.

### SEC-14 — Host refresh, locale, redacted actionable failures (95 min)

- **Goal:** P52–P54.
- **Events port:** optional `securityEventsToken: SecurityEventsPort { subscribe({ onRefresh }): () => void }`, the same shape as comments' `CommentsEventsPort` (D5). Both credential controllers subscribe on start and unsubscribe on dispose. SEC-12's `onGranted` publishes.
- **Copy and errors:**
  - every controller message is a key through `t`;
  - an optional `describeError` produces actionable, redacted text, as in Tovu's `describeApiError` + `translateCredentialMessage`;
  - an optional `draftError` reproduces Tovu's `credentialDraftError` (`apps/admin/src/lib/credential-copy`).

  These are fields on the controllers' optional args (K3/K5).
- **Generation guards:** kept; this step pins them.
- **Files:** `ports.ts`, `security.module.ts` (optional token), both credential controllers, `react/hooks/AccessTokensTab.hooks.ts`, `messages.en.ts`.
- **Tests first:**
  - a refresh event reloads every store;
  - an older overlapping read that resolves last is ignored;
  - a locale switch relabels without disposing controllers;
  - no draft token in any error;
  - a refusal's detail reaches the screen only through `describeError`.
- **Ports:** the reload sections of `T:hooks/__tests__/use-access-tokens.unit.test.tsx` (1,824 lines). `T:__tests__/security-i18n.unit.test.ts` becomes a host translator test in SEC-T1.
- **Mutation:** remove `isCurrent(ticket)` from the success branch at `J:controllers/access-tokens.controller.ts:24` → red.
- **Depends:** SEC-13, SEC-2.

---

## 3. Users-owned owner-auth split (`dev-auth.ts`) — U-AUTH-1…3, U-AUTH-T1

### Where things are today

`apps/website/src/server/inbound/admin-http/dev-auth.ts` (876 lines) is mounted at `server/runtime/composition/modules/core.ts:78`, **before** the publish-trust and session gates. The comment at `:75-77` says that order is load-bearing.

**Live routes (move):**

| route | lines | notes |
|---|---|---|
| `POST /api/admin/v1/auth/login` | `:641-692` | 429 body `{ error: "too many login attempts", code: "RATE_LIMIT_EXCEEDED", details: { retryAfterSeconds } }` + `Retry-After`; `Cache-Control: no-store` after success (`:675`); 401 `invalid username or password` |
| `POST /auth/mfa/login` | `:696-718` | `no-store` first; 429 has different text and no `details`; 400 `MFA_REFUSED` |
| `POST /auth/logout` | `:723-735` | awaits `identityReady`; revoke, clear cookie, `{ ok: true }` |
| `POST /auth/boot-session` | `:762-775` | why-comment `:739-761`; loopback check before the token is read; 403 `FORBIDDEN`; `next(error)` |
| `POST /auth/local-boot-session` | `:783-810` | why-comment `:779-782`; 404 when disabled or capability refused; 403 for same-origin loopback; keeps an existing session |
| `GET /auth/me` | `:814-855` | `user`, `effectivePermissions`, `canManageUserTrash`, `canPublishToLive` |
| `GET /auth/me/password-status` | `:858-876` | memo `:617-637` (cap 256, cleared wholesale; why-comment `:611-626`) |

**Stays in Tovu (host session/cookie/local-boot/sign-in policy):**

- `SESSION_COOKIE "tovu_session"` (`:90`), `sessionTokens` / TTL (`:94-96`)
- cookie read/set/clear (`:204-243`)
- `currentCredential` / `currentPrincipal` (`:269-311`)
- `getAuthed*` (`:313-343`), `rejectUnlessSessionCredential` (`:366`), `requireAdminSession` (`:393`)
- `isLoopbackPeer` (`:429-450`)
- boot-owner minting and `redeemOwnerBootSession` (`:463-547`)
- `AdminSignInPort` / `signalAdminSignIn` (`:549-572`)
- `sendAuthFailure` → `sendAdminFailure` product copy (`:494-511`)
- `registerAuthRoutes` (`:585`), which becomes the mount list
- the owner MFA, passkey and recovery registrations (`:592-609`; their own `RT-K1-adm-owner-*` sheets)

### Destination

- **Path:** `UM:admin-http/auth/{password-login,mfa-login,logout,boot-session,local-boot-session,current-user,password-status}.ts` and `UM:admin-http/auth/deps.ts`.
- **Export:** `@jini-ai/user-management/admin-http/auth`, runtime **node**, same as `./server`, because the files call `UM:server` services relatively (no new cross-package edge).
- **Factories:** each file exports a factory `xRoute({ deps }) : ServerRoute` (core `contracts/server.ts:86`).

### `AuthRoutesDeps`

Each file takes its own `Pick` of these fields; they are host-injected.

- **`identity`:**
  - `identityReady`, `workspaceId`
  - `userRepo.findByPrincipalId`
  - `mfaStore?`, `passwordHasher.verify`
  - `authServiceDeps`, `ownerMfaDeps()`, `identityRepos`
- **`session`** (host policy):
  - `currentPrincipal({ request })`
  - `revokeRequestSessions({ request })`
  - `setCookieHeader({ rawToken, expiresAtIso }, { name? })` and `clearCookieHeader()`, each returning a header value
  - `localSessionCookieName({ request })`
  - `requestOptions({ request })`
- **`signIn`:**
  - `signal({ principalId })`
  - `redeemOwnerBootSession({ token }, { redeem?, cookieName? })` → `{ principal, setCookie } | { status, body }`. This needs a T-side refactor of `:513-547`, which writes `res` today.
  - `mintBootToken()`
- **`localOwnerSignIn`:** `enabled`, `acceptsCapability?`, `allowsRequest`, and `capabilityHeader`. The header name `x-tovu-desktop-owner-signin` (`:784`) is host copy.
- **`loopback({ client, request })`.**
- **`rateLimiter.check({ key })` and `clientIp({ request, client })`:** `resolveClientIp` is Express-based, so the host supplies it.
- **`/me` affordance flags:** `callerMayManageUserTrash`, `canPublishToLive()`.
- **`defaultOwnerPassword`:** K3; was `DEFAULT_OWNER_PASSWORD`.
- **`onFailure({ error, operation }) → Response`:** wraps `sendAuthFailure`. The default Express error path behind `next(error)` is reproduced by the dispatcher's error port.

### Steps

| step | repo | content | tests first + mutation | est |
|---|---|---|---|---|
| **U-AUTH-1** | Jini user-management | login, mfa/login, logout factories + `deps.ts` + export entry (`jini.entries`, dist triple) + api-baseline + changeset | One `Request` → `Response` test per status branch, asserting exact status, headers (`Retry-After`, `Cache-Control`, `Set-Cookie` from the injected port) and `JSON.stringify(body)` against the Tovu bodies above. **Mutation:** drop `details.retryAfterSeconds` from the login 429 → red | 110 |
| **U-AUTH-2** | Jini user-management | boot-session + local-boot-session; why-comments verbatim | Loopback refused before any token read (spy); unarmed, wrong and spent tokens give an identical 401; capability check before header admission; existing session kept; never promotes a non-owner. **Mutation:** allow a non-loopback boot-session → red | 90 |
| **U-AUTH-3** | Jini user-management | `/me` + password-status + the memo with its why-comment | Exact `/me` body keys and 401 body; memo is keyed by hash, so a new hash re-verifies; cap 256 clears wholesale. **Mutation:** key the memo by principal id → the "password change re-verifies" test goes red | 80 |
| **U-AUTH-T1** | Tovu | `registerAuthRoutes` keeps the owner-* registrations, then mounts the 7 factories through `createNodeDispatcher` at the same position (before `requirePublishTrust`, `core.ts:78-86`). Build `AuthRoutesDeps` from `RouteDeps` + the helpers above. Delete the 7 `register…Route` functions (`:639-876`, about 238 lines); `dev-auth.ts` drops to about 640 lines. | Must stay green with zero assertion edits: `apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts`, `dev-auth-failures.unit.test.ts`, `apps/website/src/server/__tests__/admin-boot-session-route.test.ts`, `admin-local-boot-session-route.test.ts`, `admin-password-status-route.test.ts`, `platform/routing/__tests__/reserved-paths.test.ts`, `routes/system/__tests__/user-facing-failure.test.ts`, `shared/__tests__/observability-error-report.test.ts`, `shared/__tests__/json-body-parsers.test.ts`, `runtime/composition/__tests__/fixtures/create-app-route-table.snapshot.json`. STOP if the route-table snapshot records Express layer identity, or if body-parse/size errors differ from the Express JSON parser. **Mutation:** mount the auth routes after the session gate → login tests go red (401) | 110 |

**Dependencies:**
- RT-K1-0.J is merged (`66310ee7`), and http-kit's returned-error parity is required for `onFailure` semantics.
- U-AUTH-1 → 2 → 3 run as one chain because they share `package.json`, the api-baseline and `deps.ts`. U-AUTH-T1 follows.
- The `RT-K1-adm-owner-*` sheets are independent. If they are retargeted per D8, they share `deps.ts`; run them after U-AUTH-3.

---

## 4. SEC-T1 — Tovu swaps Security onto `@jini-ai/admin/security` (Tovu, 120 min, one implementer)

**Pre:**
- SEC-1…14 merged into Jini integ and rebuilt.
- U-AUTH-T1 merged: the owner's prerequisite. The `/auth/me` contract (W19) is the one SEC-T1 consumes.
- A-adm-shell-lib-3 (router), A-K2-0a merged.
- Linked Jini (`JINI_PACKAGES_DIR=<Jini>/packages node development/scripts/link-jini.mjs`).

### New host composition (stays in Tovu)

1. **`apps/admin/src/integrations/jini-admin/security-ports.ts`.** Uses the `mediaTransport` like `comments-ports.ts`.
   - **`createSecurityHostPorts({ transport }, { workspaceId = WORKSPACE_ID })`** provides:
     - `securityApi`: `createHttpSecurityApi`
     - `otherCredentials`: `createHttpOtherCredentials`, with `mediaLabels` from `features/media/media-provider-catalog`
     - `rootKey`: `createHttpRootKey(…, { path: '/system/site-key', importField: 'siteKey', reveal: true })`
     - `securityEvents`: content-refresh bus, resource `'access-tokens'` (`T:rules.ts:53`)
   - **`publishCredentialsClient`:** `createHttpPublishCredentials`, used by Deployment.
   - **`securitySessionGrants`:** per D6.
   - **`createSecurityTranslator({ locale })`:** relocated dictionary + alias table + `interpolate`, as `createCommentsTranslator` does.
   - **`describeSecurityError`:** `ApiError` → `{ code, detail }` using `describeApiError` and `translateCredentialMessage`.
2. **`apps/admin/src/integrations/jini-admin/security-module.hooks.ts`.**
   - **`createHostSecurityModule({}, { useAdminLocaleHook })`:** the `comments-module.hooks.ts` pattern. Its Provider passes:
     - `t`;
     - `ownerControls`, keeping today's order from `T:Security.tsx:182-184`:
       - `<TotpSettings port={ownerMfaPort} translate/>`
       - `<RecoveryCodesCard port={ownerRecoveryPort} describeFailure={ownerRecoveryFailure} FailureNotice={ErrorNotice} filename="tovu-owner-recovery-codes.txt" t/>`
       - `<PasskeySettings port={ownerPasskeySettingsPort} translate/>`
     - tab params `{ generate: 'hidden', defaultEnvVarName: 'TOVU_SITE_KEY' }`;
     - `otherStores` deep links.
   - **`SecurityModulePanel({ route })`:** `useModulePanel({ moduleId: 'security', pageId: 'secrets', route }, { loadingContent })`.
3. **`apps/admin/src/integrations/jini-admin/security-i18n.ts`:** `git mv` from `T:security-i18n.ts`, verbatim, except one type-only line. `T:security-i18n.ts:3` imports `OtherCredentialStoreInfo` from a deleted file; retype `otherCredentialRemoveDialogBody`'s `store` as `{ id: OtherStoreId; purposeLabel: string }` from `@jini-ai/admin/security`.
4. **Stylesheets:** `apps/admin/src/styles/{access-tokens,site-key}.css` are re-targeted to `jini-*` / `data-jini-part` selectors (still imported at `main.tsx:29-30`). STOP if a selector has no Jini DOM equivalent.

### Edits

- **`integrations/jini-admin/modules.hooks.ts`:**
  - register the security module in `createHostAdminScope`: the `modules` and `bindings` lists (`:39-47`) and an optional `securityPorts` / `useSecurityLocaleHook` DI seam;
  - `MODULE_PAGE_PATHS['security.secrets'] = '/access-tokens'` (`:59`);
  - add `MODULE_TAB_ALIASES = { 'security.secrets': { 'site-key': 'root-key' } }`, mapped inward for `requestedTab` and outward in `onTabChange` (`:73-79`).
- **Grants:** compose `securitySessionGrants` wherever `commentsSessionGrants` is composed (`rg -n commentsSessionGrants apps/admin/src`).
- **`apps/admin/src/panel-pages.ts:54`** →
  ```ts
  export const Security = lazy(() => import("./integrations/jini-admin/security-module.hooks").then(module => ({ default: module.SecurityModulePanel })));
  ```
- **`apps/admin/src/panels.tsx:1041`** → `render: (ctx, _options = {}) => <Security route={ctx} />`. Unchanged:
  - `id: "access-tokens"` (`:1038`)
  - `allowedQueryParams: {"tab": null}` (`:1040`)
  - `nav` "Secrets" / Operations / shield icon (`:1042-1048`)
- **Deployment source repoints (7 lines):**
  - types → `@jini-ai/admin/security`:
    - `features/deployment/StaticSiteTab.tsx:13`
    - `features/deployment/api/deployment-api.types.ts:1`
    - `features/deployment/hooks/publish-credentials-dependencies.hooks.ts:1`
    - `features/deployment/hooks/publish-credentials-port.hooks.ts:1`
    - `features/deployment/hooks/use-publish-credentials.hooks.ts:6`
    - `features/deployment/rules.ts:2`
  - `features/deployment/hooks/publish-credentials-dependencies.hooks.ts:2`: `securityApi` → `publishCredentialsClient` from `../../../integrations/jini-admin/security-ports`. Method names are identical (SEC-8), so the change is a specifier plus a binding name, pre-declared here (§1 STOP 6).
- **Test importers (15 lines in 11 files)**, assertions unchanged:
  - **deployment (8 lines):**
    - `__tests__/StaticSiteTab.unit.test.tsx:9`
    - `__tests__/rules.unit.test.ts:3`
    - `hooks/__tests__/publish-credentials-dependencies.unit.test.ts:3,20,21` (`vi.mock` path → `security-ports`)
    - `hooks/__tests__/use-publish-credentials-wired.unit.test.tsx:16,17`
    - `hooks/__tests__/use-publish-credentials.unit.test.tsx:5`
  - **settings (3):**
    - `__tests__/ai-agent-locales.unit.test.ts:5` (dictionary path)
    - `__tests__/built-in-mcp.unit.test.tsx:7,8`: `useOtherCredentials` / `createFakeOtherCredentialsPort` → Jini `createOtherCredentialsController` + `createMemoryOtherCredentials`. This is more than a specifier and is pre-declared; STOP if any assertion must change.
  - **lib (3):** `lib/__tests__/api-id-url-encoding.unit.test.ts:3`, `api-request-shapes.clients.ts:24`, `api-system-endpoints.unit.test.ts:4`: `securityApi` → the host clients from `security-ports`. The request-shape assertions must pass unchanged, which proves W1–W10.
  - **plugins (1):** `features/plugins/__tests__/surface-copy.contract.test.ts:4` (dictionary path).
- **Path-string fixtures and ledgers:**
  - `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx:44` → `{ modulePath: "../../integrations/jini-admin/security-module.hooks", moduleId: "security", exports: ["SecurityModulePanel"] }`
  - `hooks/__tests__/content-refresh-coverage.unit.test.ts:59` → `integrations/jini-admin/security-ports.ts`
  - `lib/__tests__/credential-input-autocomplete.unit.test.ts:171,211`: the card left Tovu; its assertions are carried by SEC-3. Drop the two entries only.
  - `lib/__tests__/fixtures/admin-literal-copy.baseline.json:328-356` (5 stale entries)
  - `development/scripts/error-gate-debt.json:173-213` (9 entries)
  - `development/scripts/hardwiring-debt.json:34`
  - `development/scripts/size-debt.json:222-250` (5 entries)
  - `apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json:44`: drop the `features/security/**` segment
  - CSS tests `apps/admin/src/__tests__/unit/access-tokens-chips-css.unit.test.ts:12` and `selection-ring-css.unit.test.ts:106` keep their assertions against the re-targeted selectors.
  - Comment-only mentions are re-pointed in the same commit: `features/deployment/rules.ts:78`, `features/settings/SettingsUi.tsx:52`, `apps/website/src/contracts/core/custom-credential-categories.ts:2`, `apps/website/src/features/custom-credentials/custom-credential-create-ui.ts:61`, `development/e2e/journeys/deployment.pins.journey.ts:276`.
- **Delete (38 sources):**
  - pages and tabs: `T:AccessTokensTab.hooks.tsx`, `AccessTokensTab.tsx`, `CopyKeysDialog.tsx`, `OtherCredentialsSection.hooks.tsx`, `OtherCredentialsSection.tsx`, `RecoveryCodesCard.hooks.ts`, `RecoveryCodesCard.tsx`, `Security.hooks.ts`, `Security.tsx`, `SiteKeyRecoveryCard.tsx`, `SiteKeyTab.hooks.tsx`, `SiteKeyTab.tsx`
  - rules and forms: `access-token-forms.ts`, `access-token-providers.ts`, `access-token-rows.ts`, `custom-credential-forms.ts`, `other-credential-stores.ts`, `rules.ts`, `security-visuals.tsx`, `copy-keys-dialog.css`, `index.ts`
  - API: `api/security-api.ts`, `api/security-api.types.ts`
  - hooks: `hooks/{access-tokens-dependencies,access-tokens-port,other-credentials-dependencies,other-credentials-port,security-permissions-dependencies,security-permissions-port,site-key-dependencies,site-key-port}.hooks.ts`, `hooks/site-key-status.rules.ts`, `hooks/{use-access-tokens,use-copy-keys,use-other-credentials,use-security-permissions,use-site-key-recovery,use-site-key}.hooks.ts`
  - Plus `T:security-i18n.ts`, which is relocated rather than deleted: 39 total. No re-export shell is left.
- **Delete (30 tests):** each was ported in the step named in the test map below.

### Test map (30 Tovu tests → where their assertions live)

| Tovu test | → |
|---|---|
| `Security.unit.test.tsx`, `use-security-permissions.unit.test.tsx` | SEC-1 + host panel test |
| `security-permissions-dependencies.unit.test.tsx` | host `security-ports.test.ts` (`/auth/me` grants) |
| `RecoveryCodesCard.unit.test.tsx` | SEC-3 |
| `site-key-dependencies.unit.test.ts` | SEC-4 |
| `SiteKeyTab.unit.test.tsx`, `site-key-status.rules.unit.test.ts`, `site-key-generate-error.unit.test.ts` | SEC-5 / SEC-6 |
| `SiteKeyTab.agent-secrecy.unit.test.tsx`, `use-site-key.unit.test.tsx` | SEC-6 |
| `use-site-key-recovery.unit.test.ts`, `SiteKeyRecoveryCard.unit.test.tsx` | SEC-7 |
| `access-tokens-dependencies.unit.test.ts` | SEC-8 / SEC-9 |
| `rules.unit.test.ts`, `AccessTokensTab.unit.test.tsx`, `security-visuals.unit.test.tsx` | SEC-9 (icons → SEC-1) |
| `AccessTokensTab.credential-flows.unit.test.tsx`, `AccessTokensTab.hooks.unit.test.tsx`, `access-tokens-revoke-copy.unit.test.tsx`, `access-token-providers.fixture.ts` | SEC-10 / SEC-11 / SEC-12 |
| `CopyKeysDialog.unit.test.tsx`, `use-copy-keys.unit.test.tsx`, `copy-keys.fixture.ts` | SEC-12 |
| `OtherCredentialsSection.unit.test.tsx`, `use-other-credentials.unit.test.tsx`, `other-credentials-dependencies.unit.test.ts` | SEC-13 |
| `use-access-tokens.unit.test.tsx` | SEC-9 / SEC-11 / SEC-12 / SEC-14 by section |
| `security-i18n.unit.test.ts`, `site-key-copy.i18n.unit.test.tsx` | host translator test (SEC-T1; dictionary stays in Tovu) |

### SEC-T1 tests

- **New host tests:**
  - `integrations/jini-admin/__tests__/security-ports.test.ts`:
    - grants: `['*']` → all;
    - an editor without the site-key grant → no `admin.security.tokens.manage`;
    - unresolved `[]` → `security.read` only after session resolves, nothing before;
    - translator alias and locale;
    - `rootKey` options produce the `/system/site-key` paths.
  - `security-panel.test.tsx`:
    - `/access-tokens?tab=site-key` opens `root-key`;
    - a tab change writes `?tab=site-key` with replace;
    - an unknown tab → access-tokens;
    - owner controls appear in Tovu's order.
- **Live check (sidekick):** linked Jini, both tabs and owner controls render, and network capture shows the same method/path/body as a baseline capture on the unmodified tree for W1–W19.
- **Mutation:** remove the `site-key` alias → `security-panel.test.tsx` goes red.
- **Gates:** §1 T-step gates. No new boundary, size, complexity or hooks lines.

---

## 5. Order and parallelism

```
Lane A  root key   : SEC-4 ──► SEC-5* ──► SEC-6 ──► SEC-7
Lane B  credentials: SEC-8 ──► SEC-9* ──► SEC-10 ──► SEC-11 ──► SEC-12 ──► SEC-13 ──┐
Lane C  page       : SEC-1 ──► SEC-2 ─────────────────────────────────────────────── SEC-14 ──► SEC-T1
Lane D  users      : SEC-3 ; U-AUTH-1 ──► U-AUTH-2 ──► U-AUTH-3 ──► U-AUTH-T1 ─────────────────┘
* SEC-5 and SEC-9 also wait for SEC-1 (translator/UI shape) and A-K2-0a.
```

- **Start immediately, in parallel (4 implementers):** SEC-1, SEC-3, SEC-4, SEC-8. U-AUTH-1 follows SEC-3 in lane D, or runs beside it with a 5th implementer.
- **Why lanes are serial inside:**
  - Lane A shares `controllers/root-key.controller.ts` and `react/tabs/RootKeyTab.tsx`.
  - Lane B shares `adapters/http.ts`, `rules.ts`, `ports.ts` and `controllers/access-tokens.controller.ts`.
  - Lane D shares user-management `package.json`, the api-baseline and `deps.ts`.
  - SEC-14 touches both credential controllers and the module token, so it runs after SEC-13 and SEC-2.
- **Critical path (lane B + SEC-14 + SEC-T1):** 105 + 110 + 105 + 110 + 120 + 110 + 95 + 120 ≈ **875 min**.
  - Lane A: ≈ 385 min.
  - Lane D: ≈ 500 min (SEC-3 110 + U-AUTH 390).
  - Lane C before SEC-14: 160 min.
- **Outside this plan:** the Security lane's other 18 files (P9F: `K5-project-keys-1`, BYOK key panel, credential hint/copy/guidance, secret-scan contract, credential-copy route `RT-K1-adm-system-1`) keep their own sheets. They run independently because W9 and W10 are unchanged by those moves.

## 6. Files left after each step

Tovu `features/security` sources are untouched by every Jini step, because this is a swap, not a move.

| after | Tovu `features/security` sources / tests | Tovu `dev-auth.ts` lines | Jini `admin/security` sources (22 today) | new Jini files |
|---|---|---|---|---|
| SEC-1 | 39 / 30 | 876 | 22 | — |
| SEC-2 | 39 / 30 | 876 | 22 | — |
| SEC-3 | 39 / 30 | 876 | 22 | `UM:react/auth/RecoveryCodesCard.tsx`, `UM:react/auth/RecoveryCodesCard.hooks.ts` |
| SEC-4 | 39 / 30 | 876 | 22 | — |
| SEC-5 | 39 / 30 | 876 | 22 | — |
| SEC-6 | 39 / 30 | 876 | 22 | — |
| SEC-7 | 39 / 30 | 876 | 22 | — |
| SEC-8 | 39 / 30 | 876 | 23 | `wire.types.ts` |
| SEC-9 | 39 / 30 | 876 | 23 | — |
| SEC-10 | 39 / 30 | 876 | 23 | — |
| SEC-11 | 39 / 30 | 876 | 23 | — |
| SEC-12 | 39 / 30 | 876 | 26 | `controllers/shared-keys.controller.ts`, `react/components/SharedKeysDialog.tsx`, `react/hooks/SharedKeysDialog.hooks.ts` |
| SEC-13 | 39 / 30 | 876 | 27 | `react/components/OtherCredentialRow.tsx` |
| SEC-14 | 39 / 30 | 876 | 27 | — |
| U-AUTH-1…3 | 39 / 30 | 876 | 27 | `UM:admin-http/auth/*.ts` (8) |
| U-AUTH-T1 | 39 / 30 | ≈ 640 | 27 | — |
| **SEC-T1** | **0 / 0** (38 deleted, `security-i18n.ts` relocated to `integrations/jini-admin/`) | ≈ 640 | 27 | — |

New Tovu host files at SEC-T1: `integrations/jini-admin/{security-ports.ts, security-module.hooks.ts, security-i18n.ts (relocated)}` plus two tests.

## 7. Codex verification checklist

1. **D1–D8:** especially the D5 port-surface flags (reveal, sharedKeys/useProjectKey, publish verify/snapshot, events token) and D8's destination for the owner-* sheets.
2. **Wire table W1–W19** against Tovu's `api/*` and Jini's `adapters/http.ts`, especially:
   - W8: Jini sends a top-level `username` on custom create (`J:rules.ts:71-73,80`);
   - W12: media key order;
   - W17: `{ siteKey }`.
3. **The 7 Deployment and 15 test importer lines** (§4) against `rg -n "features/security|\.\./security/|security-i18n" apps scripts development` at `41e948ee4`.
4. **No step crosses a forbidden edge:**
   - admin → user-management: D2;
   - admin → platform: SEC-8 STOP;
   - user-management `admin-http/auth` uses only core contracts and its own `server`.
5. **Every step has one implementer, ≤ 120 min, a tests-first file and a single named mutation.** SEC-9 and SEC-12 may split within one implementer.
6. **The test map covers all 30 Tovu test files**, with no assertion dropped.
