SHEETS EXTRACTION PARTIAL: 20 sheets (9 Jini / 11 Tovu), 20 OPUS-REVIEW, 16 files move

| Status | MOVE rows | Disposition |
|---|---:|---|
| SHEETED | 16 | Portable bodies move. The OIDC provider loader and seal-AAD checker retain substantive Tovu bindings. |
| ALREADY MOVED | 22 | Tovu source is absent and the matching Jini implementation is present. Do not recreate it. |
| ALREADY MOVED, HOST BINDING REMAINS | 14 | Reuse the Jini implementation. Keep the remaining product policy or adapter in Tovu. |
| NOT-SHEETED | 63 | Exact residual list below. No builder instruction is implied. |
| **Ledger total** | **115** | Uses the count report’s `mail`-onward feature-relative cutoff. Its 46 `NOT-CHECKED` files are outside this job. |

Anchors are Tovu `bf1519bba7329e0637eee4a6600dbdaba48f83db` and Jini `ad71bf68dee9907ce4db8fe86dcb8d1ffd06e8ba`, both matching the prefetched merge-23 ref. The dispatch override accounts for the missing `AI-Dev-Shop` bootstrap. The three named `ADS-memory` documents were also absent from this clone. No files changed and no tests, builds, installs, or type-checks ran.

## Build contract

`W/` means Tovu `apps/website/src/`, `F/` means `W/features/`, `R/` means `W/server/runtime/composition/`, and `J/` means Jini `packages/`. `Empty` means `Record<string, never>`. Paths and lines are at the pins above. Recheck each named symbol and its importers at dispatch. If a fix run has already moved it, reconcile against the landed owner instead of reviving the old file.

Build **J01–J09**, then **T01a–T01c, T02–T09**. No sheet depends on an unbuilt Opus sheet. Sol writes the named witness before production edits and records the named mutation. Opus applies and reverts mutations in its verification checkout, runs the witnesses and gates, and regenerates the API baseline. Keep existing tests and why-comments. Rewrite a why-comment only where its product example or path now belongs with the host binding. Keep functions at most 80 lines and complexity at most 10. New or changed public functions take two object arguments and retain the empty second-argument pad. Leave framework callbacks on their existing ABI.

For each new `./x` export listed below, add `types: "./dist/x.d.ts"`, `import: "./dist/x.js"`, and `default: "./dist/x.js"` to the named package’s `package.json`. Exports point at the implementation, not a forwarding file. Each J sheet needs a changeset for the named packages and an API-baseline entry for the named subpaths. Do not hand-edit generated hashes. T01a records the coordinated root `package.json` and lockfile intake for the candidate `@jini-ai/{core,user-management,devops,cms,platform,integrations}` packages. Prepare against those source surfaces without inventing a published version. Opus locks the actual candidate artifacts as part of the combined verification. Later T sheets use that same intake.

Preserve wire and storage values. With `exactOptionalPropertyTypes`, omit absent optional keys unless the destination explicitly permits `undefined`. With `noUncheckedIndexedAccess`, guard an indexed element before using it. No route, screen, theme, schema migration, or provider registration moves in this set.

## Jini sheets

### J01 — Project vault contracts and grant fences · BUILDER: SOL · OPUS-REVIEW

**Sources and destinations**

| Tovu anchor | Jini owner |
|---|---|
| `W/contracts/core/site-granted-vault.ts:1–6` | Add the type verbatim to `J/core/src/contracts/site/project-key-attachments.ts:1–14`. This is a prerequisite contract, not a counted MOVE row. |
| `F/project-keys/attached-vault.ts:11,29–74` | `J/user-management/src/project-keys/attached-vault.ts` |
| `F/project-keys/create-vault.ts:11–27` | `J/user-management/src/project-keys/create-vault.ts` |
| `F/project-keys/site-sealer.ts:9,15–38,46–60` | `J/user-management/src/project-keys/site-sealer.ts` |

Land the core type in this sheet before the three implementations. `KeyAttachments` and `ProjectKeyTransaction` are already on that core subpath. `KeyringPort` and `SecretSealerPort` are on `@jini-ai/core/contracts/vault`. The destination needs no SQL, Node crypto, or integrations package edge.

- `attachedOnlyVault({ vault, siteId, attachments, policy }, _optional: Empty = {}): SiteGrantedVault`. Keep the current three fields and add required `policy: { readonlyMessage: string; report(required: AttachedVaultFailure, optional?: Empty): void }`. Use a discriminated union for failures, `{ kind: "list" } | { kind: "find" | "label"; error: unknown }`. Replace the three `console.warn` sites at `:17,36,57` at those exact catch boundaries. The host owns log formatting and copy. Preserve grant-before-read for both ID and label resolution, scope filtering, `keysFor` traversal, and the single-row fallback only when there is exactly one row and no default. Use the existing conditional spread for `findByLabel`; do not install an undefined method.
- `projectKeyCreateVault({ owner, view, conflictError, replacementRefusedMessage }, { allowReplacement = false, transaction = async ({ run }) => run() } = {}): VaultRepoPort`. Keep the existing option types and use `conflictError: (required: Empty, optional?: Empty) => Error`. Return `owner.put` unchanged on success. Only the existing create-path `VaultError` conflict branch calls `conflictError({})`. Replacement still checks the view **inside** the supplied transaction. Do not add replacement authority to create-only ports.
- `ownerKeyHandleOnly({ keyring, derivationRefusedMessage }, _optional: Empty = {}): KeyringPort` and `siteGrantedSealer({ allowed, sealer, ownerScope, accessRefusedMessage }, _optional: Empty = {}): SecretSealerPort`. `ownerScope` is `{ workspaceId: string; ownerKey: string; kinds: readonly string[] }`. Keep `secrets-vault:v1:` and six-element parsing. Validate that the parsed value is an array, bind its elements as `unknown`, then check the exact workspace, string ID and kind, allowlisted kind, exact owner key, and **both** null tail slots. Pass the original full AAD to `open`. Keep the grant checks on both sides of `open`, and keep `seal` on the trusted write path without a read-grant check. Do not give the narrowed keyring any derivation path.

**Tests first.** In Jini `project-keys/__tests__/{attached-vault,create-vault,site-sealer}.test.ts`, add `ungranted label never reads the owner vault`, `replacement checks the grant inside the owner transaction`, and `revocation during open withholds plaintext`. Named mutations `PK-LABEL-BYPASS`, `PK-CHECK-OUTSIDE-TXN`, and `PK-SKIP-POST-OPEN`. Also pin wrong scope and the null-tail checks, active-handle forwarding, and no derivation calls.

**Package.** Add `user-management` exports `./project-keys/{attached-vault,create-vault,site-sealer}`. Core’s existing `./contracts/site/project-key-attachments` export stays. One changeset covering `core` and `user-management`. Opus updates both corresponding API baselines.

### J02 — Member login admission, credential checks, and readiness · BUILDER: SOL · OPUS-REVIEW

**Sources.** `F/member-login/providers.ts:24–32,39–66`, `credentials.ts:11–34`, and `ready-providers.ts:11–21`. Add `J/user-management/src/member-login/{providers,credentials,ready-providers}.ts`. The bundled directory, manifest namespace, contribution ABI, and fingerprint remain selected in Tovu. Jini gets the admission decision, not a new filesystem-based loader.

- `loadLoginProviders({ workspaceId, bundledProviders, loadCandidates }, _optional: Empty = {}): Promise<readonly LoginProvider[]>`. Use `LoginProvider` from core’s `contracts/site/user-management-server`. `loadCandidates` takes `{ workspaceId: string; trustedPluginIds: ReadonlySet<string> }` plus the optional empty arg and returns a promise of readonly providers. Move the pin map, trusted plugin IDs, full `configurationVersion` comparison, and duplicate-ID rejection from `:58–65`. Do not substitute an issuer-only or ID-only comparison. The Tovu loader still rejects untrusted packages before contribution parsing.
- `hasLoginCredentials({ deps, workspaceId, provider }, _optional: Empty = {}): Promise<boolean>` and `resolveLoginCredentials({ deps, workspaceId, provider }, _optional: Empty = {}): Promise<OAuthClient>`. The readiness function’s `deps` needs only `describe`. The resolver’s needs only `resolve`. Both take `{ workspaceId: string; label: string }`. `describe` returns a nullable row with `username` and `baseUrl`. `resolve` returns a nullable row with `baseUrl` and `connection.{username,token}`. Use `string | null | undefined` for those readable fields, with optional keys where appropriate, so an existing host row is structurally assignable. Import the existing `MemberLoginError` from `../server/login-types.js:40`. Keep the trim-as-presence test, byte-exact token-endpoint match, pinned authentication method, and fixed `LOGIN_UNAVAILABLE` on resolver failure. Do not trim the outgoing client ID or expose the caught error.
- `createReadyLoginProviderList({ listAdmitted, hasCredentials }, _optional: Empty = {})`. `listAdmitted({ workspaceId }, optional?)` returns readonly providers. `hasCredentials({ workspaceId, provider }, optional?)` returns `Promise<boolean>`. Keep the returned `({ workspaceId }, _optional: Empty = {}) => Promise<readonly LoginProvider[]>` and repeat the two checks on each call. Use the existing `null` sentinel and explicit narrowing when filtering.

**Tests first.** Add `member-login/__tests__/provider-admission.test.ts` with `same ID and a different full preset is not admitted` and `duplicate admitted IDs disappear`. Add `member-login/__tests__/credential-readiness.test.ts` with `readiness never opens a secret and rechecks on the second call` and `different token endpoint returns the fixed refusal`. Mutations `OIDC-ID-ONLY-PIN` and `OIDC-CACHE-READY`. Test both the admission and credential seams with fake ports.

**Package.** `user-management` exports `./member-login/{providers,credentials,ready-providers}`. Changeset and `api-baseline/jini-ai__user-management.json`. No lifecycle package dependency.

### J03 — Mail capture deletion planner · BUILDER: SOL · OPUS-REVIEW

**Source.** `F/mail/capture-clear.ts:15–43` → `J/user-management/src/mail/site/capture-clear.ts`. Keep the proposed user-management destination without importing platform SQL or the platform error class.

`planMailCaptureClear({ principalId, workspaceId, deps }, _optional: Empty = {}): Promise<MailCaptureClearBinding>`. `MailCaptureClearBinding` is the existing structural `{ plan: MailCaptureClearPlan; revision: string; clear: () => Promise<MailCaptureClearResult> }`, not an import from the CMS route. `MailCaptureClearDeps` has:

- `capture.reviewCaptured({ workspaceId })` returning `plan`, `revision`, `captureIds: readonly string[]`, and `attemptIds: readonly string[]`.
- `capture.clearReviewedCaptures({ workspaceId, captureIds, attemptIds })` returning `{ deleted: number }`.
- The existing `checkPermission({ principalId, permission })`.
- `forbidden({ permission }, optional?: Empty): Error`, supplied by Tovu.

Use `MAIL_CAPTURE_CLEAR_PERMISSION` and the result types from core mail. Preserve authorize-before-read, exact reviewed revision, the captured arrays in the closure, and `{ cleared: true, deleted }`. Do not re-read the current set at clear time.

**Tests first.** `mail/site/__tests__/capture-clear.test.ts`, `denied principal never reads captures` and `clear forwards only the reviewed workspace and IDs`. Mutation `MAIL-CLEAR-READ-LIVE-SET`, which replaces the closed-over IDs with a second review. Also check that permission denial uses the injected error object.

**Package.** `user-management` export `./mail/site/capture-clear`, changeset, and user-management API baseline. No route spec or SQL change.

### J04 — Publish destination suggestion · BUILDER: SOL · OPUS-REVIEW

**Source.** `F/publish-trust/connect.ts:23–67` → `J/devops/src/deploy/site/publish-candidate.ts`. Existing pure containment owner is `J/devops/src/deploy/config-descriptors.ts:91`. Use that owner directly. Do not move the connect, handshake, or provisioning authorization flow.

`findCandidateDestination({ io, resolvePath, publicOriginKey }, { candidatePaths = ["app.json"] }: { readonly candidatePaths?: readonly string[] } = {}): Promise<string | null>`. The `io` slice is `{ read(required: { path: string }, optional?: Empty): string | null | Promise<string | null> }`. `resolvePath` keeps the current `{ relative }` signature. Compile the same `https` pattern once per call with the injected key escaped as a literal. `TOVU_PUBLIC_URL` never enters Jini. Preserve configured order, `[]` meaning no reads, containment before `resolvePath` or `io.read`, and `exec(contents)?.[1]` with its undefined guard. The result is a suggestion only. Keep that why-comment by the function.

**Tests first.** `deploy/site/__tests__/publish-candidate.test.ts`, `unsafe path never reaches the resolver or reader` and `the first configured file containing the injected key wins`. Mutation `PUBLISH-CANDIDATE-RESOLVE-BEFORE-CONTAINMENT`. Include an empty list and no-match case.

**Package.** `devops` export `./deploy/site/publish-candidate`, changeset and devops API baseline. No CMS dependency.

### J05 — Backup artifact provider selection · BUILDER: SOL · OPUS-REVIEW

**Source.** `F/object-storage/artifact-provider.ts:20–27,37–67` → `J/platform/src/object-store/site/artifact-provider.ts`. `J/platform/src/object-store/site/registry.ts:37–38` owns `LoadedObjectStoreRegistry<Host>`.

Keep `ArtifactStoreCapable` and its core types. Generalize only the host parameter in the existing selector:

```ts
selectArtifactStoreProvider<C, Host>(
  required: {
    readonly loaded: LoadedObjectStoreRegistry<Host>
    readonly preferredId: string
    readonly resolveCredential: (required: { readonly id: string }, optional?: Empty) => Promise<C | undefined>
  },
  optional: { readonly savedProvider?: string } = {},
): Promise<{ readonly id: string; readonly provider: ArtifactStoreCapable; readonly credential: C } | undefined>
```

Use the current runtime `createArtifactStore` capability check before treating the provider as `ArtifactStoreCapable`. Keep registry order and preferred-provider priority, skip unresolved or rejected credentials, and filter by the persisted provider **before** any credential lookup. Keep `artifactStoreTarget({ id }, _optional: Empty = {})` and `artifactStoreBinding({ store, credential }, _optional: Empty = {})` using the same bit-for-bit fallback tuple. A provider’s explicit binding still wins. No named vendor, credential store, or host bucket default.

**Tests first.** `object-store/site/__tests__/artifact-provider.test.ts`, `revoke never looks up a different registered provider` and `rotation keeps the same non-secret storage binding`. Mutation `ARTIFACT-SAVED-PROVIDER-FALLBACK`.

**Package.** `platform` export `./object-store/site/artifact-provider`, changeset and platform API baseline.

### J06 — Static export transformations · BUILDER: SOL · OPUS-REVIEW

**Sources and destinations**

| Tovu anchor | Jini owner |
|---|---|
| `F/site-export/static-security-headers.ts:30–48` | `J/devops/src/static-export/site/static-security-headers.ts` |
| `F/site-export/export-html-policy.ts:5–81` | `J/cms/src/html/site/export-html-policy.ts` |
| `F/site-export/media-original-urls.ts:8–100` | `J/devops/src/static-export/site/media-original-urls.ts` |

- `renderHeadersFile({ headers }: { headers: SecurityHeaderSet }, _optional: Empty = {}): string` and `withSecurityMeta({ html, headers }: { html: string; headers: SecurityHeaderSet }, _optional: Empty = {}): string`. Remove the theme import and implicit host defaults. Preserve `_headers` order and trailing newline. Preserve first-child insertion, escaping, and no report-only or enforced CSP meta. The live public-header factory remains in Tovu’s call sites.
- `exportHtml({ html, publicOrigin, stripNativeFormTools }: { html: string; publicOrigin?: string; stripNativeFormTools: (required: { html: string }, optional?: Empty) => string }, _optional: Empty = {}): string`. Call the injected strip function first. Use `./source-edits.js` in CMS for the existing `attribute`, `editedHtml`, and `elements` behavior and types. This placement avoids adding a devops→CMS parser dependency. Preserve exact source offsets, the root-relative-only identity upgrade, absent-origin link and JSON-LD behavior, and escaped JSON `<`. Do not reserialize HTML.
- Move the media scan and response transform to devops, importing `exportUrlLocations` from `../html-url-locations.js:96`. Use a generic `R extends { status: string; kind: string; source: { sha256: string } }`. The new `ExportMediaUrlDeps<R>` has `workspaceId`, `originRegistry: Pick<OriginRegistryPort, "canonicalOrigin">`, `findMedia({ workspaceId, idOrSlug }) => Promise<R | null>`, `resolveContentTypes({ media: readonly R[] }) => Promise<ReadonlyMap<string, string>>`, and `mediaPublicPath({ key, sha256, variant: { kind: "original", contentType } }) => string`, all callable with an empty optional arg. Keep the signatures `rewriteMediaOriginalUrls<R>({ body, deps }, { contentType = "text/html" } = {}): Promise<string>` and `rewriteExportMediaResponse<R>({ response, deps }, _optional: Empty = {}): Promise<Response>`. Read a capture into a local, guard it before `decodeURIComponent`, and leave malformed escapes unmodified. Preserve same-origin checks, inactive/document exclusions, public path construction, query/fragment handling, binary response identity, and deletion of stale length and encoding **only** on rewritten text. No CMS imports in this module.

**Tests first.** Under each destination’s `__tests__`, add `static-security-headers.test.ts`, `export-html-policy.test.ts`, and `media-original-urls.test.ts` with `report-only policy is not emitted as meta`, `strip runs before identity edits and unrelated bytes survive`, and `foreign same-shaped media URL is never rewritten`. Mutations `EXPORT-ENFORCE-REPORT-ONLY`, `EXPORT-SKIP-NATIVE-STRIP`, and `EXPORT-SKIP-ORIGIN-CHECK`. Add a binary response identity assertion.

**Package.** `devops` exports `./static-export/site/{static-security-headers,media-original-urls}`. `cms` exports `./html/site/export-html-policy`. One changeset covers both. Regenerate both API baselines.

### J07 — Backup landing and push mechanics · BUILDER: SOL · OPUS-REVIEW

**Sources.** `F/site-backup/static-download-landing.ts:9–62` into the existing `J/devops/src/backup/site/static-download-landing.ts:52–63`. `F/site-backup/push-content.ts:9–83` → `J/devops/src/backup/site/push-content.ts`.

- Append `staticLandingPage(required: LandingPageInput, _optional: Empty = {}): Buffer`, with the existing `STYLE` and `themeCard`. `LandingPageInput` and `LandingTheme` already live in the destination. Keep its existing `LandingRenderer` injection. The host still selects the renderer. Copy markup and CSS byte for byte, including empty and singular cases. This changes no installed theme, page allocation, or theme-selection behavior.
- `initialPushProgress({ plan }: { plan: BackupUploadPlan }, _optional: Empty = {}): SiteBackupPushProgress`. `BackupUploadPlan` reads only `files: readonly PlannedDiskFile[]`, `database: { readonly bytes: Uint8Array } | null`, and `totalBytes`. `PlannedDiskFile` is owned by the adjacent `sources` module.
- `uploadBackupPlan({ plan, uploadBlob, signal, progress, databasePath, readPlannedFile, buildManifest, cancelled }, optional: { inlineTextMaxBytes?: number; concurrency?: number } = {})`. Use `UploadPlannedContentInput["uploadBlob" | "buildManifest" | "cancelled"]` for those respective fields, and `readPlannedFile({ file }: { file: PlannedDiskFile }, optional?: Empty)` returning `Promise<{ ok: true; bytes: Uint8Array } | { ok: false; message: string }>`. Use the existing backup upload engine and its result type. Construct pending inputs with the snapshot first, then deferred disk reads. Keep `PLAN_STALE` on a failed re-read. Pass `optional` through without materializing undefined keys. Tovu supplies the manifest builder, exact paths, and cancellation copy.
- `commitBackupPlan({ provider, target, plan, entries }, _optional: Empty = {})`. Narrow `provider` to `Pick<SourceControlProvider, "commitBackupTree">`; retain `CredentialedRepositoryTarget` and `CommitBackupTreeInput["entries"]`. The structural `plan` slice needs `owner`, `repo`, `folder`, `commitMessage`, `repository: BackupRepositoryState`, and `credentialWarnings?: readonly CredentialWarning[]`, from the existing devops owners. Return the refusal unchanged or `ok: true` and `result.pushed: true` with literal discriminants. Preserve the presented parent/tree and count from committed inputs. The host still resolves credentials, checks branch divergence and unsafe-file warnings, and decides whether commit may be called.

**Tests first.** `backup/site/__tests__/static-download-landing.test.ts`, `escapes site and page labels without changing delivered hrefs`, mutation `BACKUP-LANDING-RAW-TITLE`. `backup/site/__tests__/push-content.test.ts`, `stale deferred input never builds a manifest` and `commit uses the reviewed parent and base tree`, mutation `BACKUP-COMMIT-DROP-REVIEWED-PARENT`. Pin database-first and manifest-last.

**Package.** Extend existing `./backup/site/static-download-landing` declaration. Add `./backup/site/push-content` to `devops`. Changeset and devops API baseline.

### J08 — Newsletter typed admin refusals · BUILDER: SOL · OPUS-REVIEW

**Source.** `F/newsletter/http-error-responses.ts:28–111` → `J/user-management/src/newsletter/http-error-responses.ts`. The ten error classes already live in the adjacent Jini `errors` module. Use that owner so `instanceof` sees the same constructors. The CMS route’s injected port remains at `J/cms/src/admin-http/http/newsletter.ts:17–28`.

```ts
export function newsletterErrorResponse(
  { err }: { err: unknown },
  _optional: Empty = {},
): { status: number; body: Record<string, unknown> } | undefined
```

The result is structurally compatible with the existing CMS port. No new CMS import or duplicate public DTO. Keep the table, order, status, flat body and detail keys byte-compatible. Keep its correlated constructor/mapper pair encapsulated in the existing table traversal. Unknown errors return `undefined` and still go through the host’s redacted 500 path. Do not add a generic `Error` mapper.

**Tests first.** `newsletter/__tests__/http-error-responses.test.ts`, `all ten known classes map to the existing status and flat code` and `an unknown error with a secret-shaped message falls through`. Mutation `NEWSLETTER-RETURN-UNKNOWN-MESSAGE`.

**Package.** `user-management` export `./newsletter/http-error-responses`, changeset and user-management API baseline. No K1 change.

### J09 — Seal-AAD AST rule · BUILDER: SOL · OPUS-REVIEW

**Source.** Move `F/webhooks/seal-aad-invariant.ts:112–207` into `J/integrations/src/webhooks/site/seal-aad-invariant.ts`. The parser, file enumeration, and CLI are different responsibilities. Keep scan root, exact exemptions, reporting and exit code in Tovu.

```ts
import type ts from "typescript"

export function findSealCallsInSource(
  required: {
    sourceText: string
    displayPath: string
    ast: typeof ts
    isExempt: (required: { displayPath: string; text: string }, optional?: Empty) => boolean
  },
  _optional: Empty = {},
): SealViolation[]
```

Move `SealViolation` unchanged. Use `ast` for parser functions and guards and `ts` only for types. Thread `ast` and `isExempt` through the existing private args objects. At source `:197–201`, bind `const first = call.arguments[0]`, then check count, `first === undefined`, and `ast.isObjectLiteralExpression(first)` before `first.properties`. Keep exact text normalization, script-kind selection, exemption timing and existing spread/undefined classification. Do not broaden the rule to `open()` or give the AST check a credential-runtime import.

**Tests first.** `webhooks/site/__tests__/seal-aad-invariant.test.ts`, `an exemption matches one exact path and collapsed call only`, `zero and multiple seal arguments fail closed`, and `literal undefined is distinct from shorthand aad`. Mutation `AAD-ALLOW-UNRESOLVED`.

**Package.** `integrations` export `./webhooks/site/seal-aad-invariant`. The subpath has no runtime TypeScript import. Declare TypeScript as an optional peer for consumers of this tooling subpath and a dev dependency matching Jini root `^5.6.0` for declarations/tests. Opus reconciles the lockfile. Changeset and integrations API baseline. Do not add this module to a general runtime barrel.

## Tovu sheets

### T01a — Bind project vault policy in production · BUILDER: SOL · OPUS-REVIEW

**After J01 and the coordinated package intake.** Add `F/project-keys/vault-policy.ts` with the current messages, logger and owner-scope values from `attached-vault.ts:17,36,46–47,57`, `create-vault.ts:16,22`, and `site-sealer.ts:9–11,25–38`. This is host policy, not an export facade.

Bind the three existing log lines to `report`, including `describeErrorForLog({ err: error })` only where the current find/label catches use it. Bind `conflictError` to `new ProjectKeyCreateConflictError({})` from the existing host credential-store owner. Preserve `workspaceId: "project"`, `ownerKey: "tovu"`, and the `vendor/custom/source-control` kind roster as data in the host policy. Keep the derivation and access messages separate.

Repoint live imports and argument bags:

- `R/site-deps/provider-identity.ts:8,13–14,41–43` → the three J01 subpaths. Pass the host policy in each call. Preserve the distinct create-only and trusted replacement ports and the exact `projectStore.transaction` callback. Preserve the existing `allowed` closure over the site ID.
- `F/project-keys/service.ts:4` → `@jini-ai/user-management/project-keys/attached-vault`. Supply the same host policy at its `attachedOnlyVault` construction.
- `F/custom-credentials/vault-repo.ts:2,33` → `SiteGrantedVault` from core `contracts/site/project-key-attachments`. Do not add a host type alias.

Leave old source files temporarily in place for the test-only repoints in T01b/T01c. **Tests first.** In `R/__tests__/other-site-keys.integration.test.ts`, add `composed owner keyring cannot derive for the site`. Mutation `TOVU-PK-RAW-KEYRING`. The old `attachedOnlyVault` import in that test is repointed in T01c.

### T01b — Repoint the first project vault test batch · BUILDER: SOL · OPUS-REVIEW

**After T01a.** These are `git grep` anchors. Swap `attachedOnlyVault` and, where shown, `projectKeyCreateVault` to J01’s direct exports. Supply the T01a policy and conflict factory, retaining the fixtures’ current `allowReplacement` and transaction options.

- `F/custom-credentials/__tests__/extract-s8-g-cred.integration.test.ts:19`
- `F/custom-credentials/__tests__/project-scope.unit.test.ts:1–2`
- `F/deployments/__tests__/publish-agent-tools.unit.test.ts:30–31`
- `F/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:7–8`
- `F/form-destinations/__tests__/key-store.unit.test.ts:10`
- `F/project-keys/__tests__/a02-credential-contract.pin.unit.test.ts:11`
- `F/project-keys/__tests__/attached-vault.unit.test.ts:4`
- `F/project-keys/__tests__/reference-only.unit.test.ts:4,83,96` including both dynamic `create-vault` imports
- `F/project-keys/__tests__/tools.unit.test.ts:12`

**Tests first.** In `reference-only.unit.test.ts`, add `host create conflict retains the host typed error`. Mutation `TOVU-PK-GENERIC-CONFLICT`. Keep the existing owner/consumer distinction in fixtures.

### T01c — Finish project vault repoints and remove duplicate owners · BUILDER: SOL · OPUS-REVIEW

**After T01b.** Same direct import and host policy changes for:

- `F/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:30`
- `F/source-control/__tests__/canonical-credential-lifecycle.unit.test.ts:8`
- `F/source-control/__tests__/project-scope.unit.test.ts:1,7`
- `W/server/__tests__/routes/mail-providers-route.test.ts:11–12`
- `W/server/inbound/admin-http/routes/system/__tests__/custom-credentials-inventory.unit.test.ts:8`
- `R/__tests__/other-site-keys.integration.test.ts:19`
- `F/project-keys/__tests__/site-sealer.unit.test.ts:4`, including the keyring/sealer constructions at `:15,26,41,51`

Remove `F/project-keys/{attached-vault,create-vault,site-sealer}.ts` and `W/contracts/core/site-granted-vault.ts` after the live and test import sets are empty. No forwarding files. **Tests first.** Add `mail provider primary save never receives a replacement writer` in `mail-providers-route.test.ts`. Mutation `TOVU-PK-MAIL-USE-REPLACE-PORT`. This is a fixture/composition assertion, not a change to provider-save policy.

### T02 — Bind OIDC providers and credentials at the host · BUILDER: SOL · OPUS-REVIEW

**After J02.** Keep `F/member-login/providers.ts:24–47` as the concrete bundled loader and contribution definition. At `:6,19–22,29`, import the existing `parseLoginProviders` directly from `@jini-ai/user-management/server` and remove the local parser shim. At `:55–65`, keep a host `loadLoginProviders` binding with its current caller signature. It calls the new Jini function with `loadCandidates`, which invokes the current `required.loadContributions` with the same definition, `requireActive: true`, `orderByPluginId: true`, and the same `"LOGIN_PROVIDER_UNTRUSTED"` refusal against `trustedPluginIds`. Return `loaded.items`. Do not change the trusted bundled namespace check, fingerprinting, or contained source reader.

Add `F/member-login/bindings.ts` with two host collaborators:

- `loginCredentialPorts({ credentials }, _optional: Empty = {})` binds `describeCredentialByLabel(credentials, input)` and `resolveCustomCredentialByLabel(credentials, input)` under J02’s `describe` and `resolve` names. Do not read or open anything at construction.
- `createTovuReadyLoginProviderList({ sourceRoot, loadContributions, credentials }, _optional: Empty = {})` binds J02 readiness. `listAdmitted` reloads the shipped pins and calls the host provider binding for the requested workspace. `hasCredentials` calls J02’s metadata-only function with `loginCredentialPorts`. No boot-time caching.

Repoints:

- `R/modules/members.ts:1,37,152–159` imports the two host binders and Jini `resolveLoginCredentials`. Pass the bound credential ports in `resolveClient`. Keep `resolveProvider` on the same fresh list. 
- `R/site-deps/pre-assembly.ts:23,74` uses `createTovuReadyLoginProviderList` with its existing root, lifecycle callback and credential deps.
- `F/member-login/__tests__/credentials.test.ts:5` imports J02 and adapts `f.input.deps`, including the `noOpen` fixture at `:31–32`, through `loginCredentialPorts`.
- `F/member-login/__tests__/providers.test.ts:7` keeps bundled/admission imports from the concrete provider binding and imports parse from the Jini server owner.
- `F/member-login/__tests__/ready-providers.test.ts:7–8,31` keeps the bundled import and exercises the new host binder.

Delete `F/member-login/{credentials,ready-providers,index}.ts`; the index’s three forwarding edges are replaced above. **Tests first.** `ready-providers.test.ts`, `a second host readiness call re-admits the installed provider`. Mutation `TOVU-OIDC-REUSE-FIRST-PROJECTION`. Keep route and plugin export surfaces unchanged.

### T03 — Repoint mail capture clear · BUILDER: SOL · OPUS-REVIEW

**After J03.** Update `R/mail-capture-clear-planner.ts:3,17`, `R/modules/system-mail.ts:17,254`, and `F/mail/__tests__/capture-clear-retention.dialects.test.ts:10,161` to `@jini-ai/user-management/mail/site/capture-clear`. Pass `{ principalId, workspaceId, deps: { capture, checkPermission, forbidden } }` at each call, with the existing repo and check function. Bind `forbidden` to `new MailActivityForbiddenError({ permission, message: "Only the site owner can clear captured test emails." })` from `@jini-ai/platform/mail`. Remove `F/mail/capture-clear.ts`. Update the stale source-path reference in `system-mail.ts:220`, not the behavior it describes.

**Tests first.** In the dialect test add `a capture arriving after preview survives the confirmed clear` if not already independently pinned at the planner boundary. Mutation `TOVU-MAIL-CLEAR-REBIND-LIVE-PLAN`. Keep the HTTP revision gate, wire statuses, and transaction owner.

### T04 — Supply the product’s publish candidate key · BUILDER: SOL · OPUS-REVIEW

**After J04.** Put `PUBLISH_CANDIDATE_ORIGIN_KEY = "TOVU_PUBLIC_URL"` in `F/publish-trust/candidate-policy.ts`. Move the host-specific reason at `connect.ts:33–47` there. Repoint these imports to `@jini-ai/devops/deploy/site/publish-candidate` and pass `publicOriginKey: PUBLISH_CANDIDATE_ORIGIN_KEY` in the first object. Preserve the second arg, including deliberately empty lists.

- `R/modules/publish-content.ts:12,66`
- `R/tool-catalog-manifest.ts:11,444,468` including the `typeof` reference
- `F/publish-trust/__tests__/candidate-declarations.contract.test.ts:6,35,50,84,87`
- `F/publish-trust/__tests__/grant-backstop.test.ts:7,76`
- `W/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts:20,265,271,274`
- `content/agent-plugin-overlays/fly/__tests__/publish-candidates.test.mjs:5,22` with a relative import to the Tovu policy constant from the same test directory

Delete `F/publish-trust/connect.ts`. Do not touch callers of the *different* `@jini-ai/cms/publish/trust/connect` owner. **Tests first.** In the zero-setup test, pin `candidate reads the committed destination rather than the current process origin`. Mutation `TOVU-PUBLISH-CANDIDATE-ENV-OVERRIDE`. Existing confirmation and grant checks remain separate.

### T05 — Repoint artifact selection and store identity · BUILDER: SOL · OPUS-REVIEW

**After J05.** Switch `R/site-deps/site-sharing.ts:11–12,32`, `F/object-storage/__tests__/artifact-provider.unit.test.ts:7`, and `content/agent-plugin-overlays/vercel/__tests__/blob-share.test.mjs:16` to `@jini-ai/platform/object-store/site/artifact-provider`. Keep repo and connection lookups in `site-sharing.ts`. Let `Host` infer from `loaded`; if a caller supplies only the old explicit `<C>`, supply `<C, ObjectStoreHost>` or remove the explicit type args and let both infer. Delete `F/object-storage/artifact-provider.ts`. Do not change `F/object-storage/media-store.ts` or the provider overlays’ implementations.

**Tests first.** Extend the artifact fixture with `a newly configured store cannot revoke a share saved on another binding`. Mutation `TOVU-SHARE-REVOKE-IGNORE-RECORDED-PROVIDER`.

### T06 — Repoint static export transforms · BUILDER: SOL · OPUS-REVIEW

**After J06.** Add `F/site-export/media-url-bindings.ts`. Keep the old host input slice, `ContentTypeDeps & { mediaRepo: MediaRepoPort; originRegistry: OriginRegistryPort }`. Export `bindExportMediaUrls({ deps }, _optional: Empty = {})` that binds `findMediaByIdOrSlug({ deps, input })`, `resolveContentTypes({ deps, media })`, and `mediaPublicPath` from their current CMS owners. Use inference for the media record parameter, not a cast. The first two closures preserve the route’s workspace and current read-path content-type behavior. Update `ExportSiteRouteDeps` at `site-exporter.ts:488` to continue extending this **host** input slice, not the new Jini callback type.

- `F/site-export/site-exporter.ts:16,20,22,582–584,597–599` imports J06’s three owners. Bind the media callbacks from `routeDeps` and pass them to the fetch transform. Inject `withoutNativeFormTools` from `#src/platform/html/published-webmcp-strip`. Pass `publicOrigin` only when present. Pass `publicPageSecurityHeaders({})` to `withSecurityMeta` after the existing preflight observation and HTML rewrite.
- `F/site-export/__tests__/{export-html-webmcp.unit.test.ts:3,hosted-forms-static.unit.test.ts:12,static-copy-policy.unit.test.ts:21}` imports CMS `exportHtml` and supplies the same host strip function.
- `F/site-export/__tests__/media-original-urls.test.ts:11,29,43–50,57,63–82,133–135` uses the Jini import and the binding helper for each direct rewrite. Keep the unverified-origin fixture distinct by passing that fixture to the binder. The `exportSite` integration in the same file still gets its original host `routeDeps`.
- `F/site-export/__tests__/static-security-headers.test.ts:12,52–80`, `F/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts:22,162,192`, and `W/contracts/core/__tests__/unit/form-provider-security-headers.contract.test.ts:8,40` import devops headers and supply `{ headers }`. Replace implicit defaults with the existing live-header selection, custom overrides with their existing test value.

Delete `F/site-export/{export-html-policy,media-original-urls,static-security-headers}.ts`. This sheet does not move `site-exporter.ts`. **Tests first.** In the security header test pin `export headers still derive from the live public-page policy`. Mutation `TOVU-EXPORT-FIXED-HEADER-SET`. Keep the media and native-form wire parity fixtures.

### T07 — Repoint backup landing and push · BUILDER: SOL · OPUS-REVIEW

**After J07.** Keep `STATIC_DOWNLOAD_HOST` in Tovu. Repoint `F/site-backup/static-download-host.ts:12,19` and `F/site-backup/__tests__/static-download-landing.pin.test.ts:17` to `@jini-ai/devops/backup/site/static-download-landing`. In `F/site-backup/__tests__/share-backend-static-limits.unit.test.ts:19,22`, change both the dynamic import and the mock key to that exact subpath. Spread the real namespace into the mock before substituting `staticLandingPage`, so the layout’s other imports still work. Keep the mock installed before importing the host binding. Remove the old renderer file.

Add `F/site-backup/push-manifest.ts` as a host binding. `backupPushUploadPolicy({ plan }: { plan: SiteBackupPlan }, _optional: Empty = {})` returns `{ databasePath, readPlannedFile, buildManifest, cancelled }` for J07. Use the existing `SITE_BACKUP_DATABASE_PATH`, `SITE_BACKUP_MANIFEST_PATH`, `readPlannedFile`, and `buildSiteBackupManifest` owners. Move the policy out of `push-content.ts:9,37–50` verbatim, including `tovuVersion`, watermark, schema and scope notes in the manifest. Export the same `CANCELLED` refusal from this host binding for the post-upload check.

- `F/site-backup/backup-service.ts:39,688–699` imports three functions from `@jini-ai/devops/backup/site/push-content` and `CANCELLED` and `backupPushUploadPolicy` from the new host file. Spread policy at `:688`. At `:694`, pass `{ inlineTextMaxBytes }` only when defined. Keep the abort check before `commitBackupPlan` and all credential, branch and unsafe-input refusals in their current order.
- `F/site-backup/__tests__/share.integration.test.ts:14,97–106` uses the same package import and host policy. Keep the exact `database/content.db` and `tovu-backup.json` assertions and the repository-versus-ZIP manifest distinction.

Remove `F/site-backup/push-content.ts`. **Tests first.** `static-download-landing.pin.test.ts`, `host chooses the same byte-pinned landing`, mutation `TOVU-BACKUP-LANDING-RENAME-CLASS`. In the share integration test, pin `repository push manifest remains last and keeps its host name`, mutation `TOVU-BACKUP-GENERIC-MANIFEST-PATH`.

### T08 — Repoint newsletter admin failure mapping · BUILDER: SOL · OPUS-REVIEW

**After J08.** Change `R/modules/newsletter.ts:28` to `@jini-ai/user-management/newsletter/http-error-responses`. Keep the same value passed as `mapNewsletterError` to the mounted route specs. Delete `F/newsletter/http-error-responses.ts`. Do not change public confirmation or unsubscribe behavior.

**Tests first.** Add `F/newsletter/__tests__/http-error-responses.cutover.test.ts` to pass representative host-used newsletter error instances through the same mapper. Pin the flat 409 shape and `unknown failure is left to the route failure reporter`. Mutation `TOVU-NEWSLETTER-MAP-UNKNOWN`. Use the existing CMS mapper type for a compile-time compatibility assignment in the test, not a production adapter.

### T09 — Keep the seal-AAD CLI and exclusions in Tovu · BUILDER: SOL · OPUS-REVIEW

**After J09.** `F/webhooks/seal-aad-invariant.ts:1–4,82–110,209–246` keeps Node filesystem enumeration, the same root, exclusions, CLI text and exit status. Import J09 directly and pass `ast: ts` where the filesystem scan invokes it. Keep the exact policy at `:85–90` in the host and bind `isExempt({ displayPath, text })` as the equality check against that map. This file still performs real host work, so it is not a forwarding shell. When touching the entry guard, bind `const entry = process.argv[1]` and check it before `pathToFileURL(entry)`.

`F/webhooks/__tests__/seal-aad-invariant.test.ts:9` imports the pure scanner from Jini and the filesystem scan from Tovu. Bind `ts` and the exact host exemption predicate in the host-policy fixtures. Keep direct CLI fixture references at `:171,190`, root script `package.json:63`, `tsconfig.json:24` exclusion, and CI path unchanged. Do not move the TypeScript runtime import into the shipped app graph.

**Tests first.** In the existing test file pin `the CLI refuses a matching call text in a different path`. Mutation `TOVU-AAD-EXEMPT-BY-TEXT-ONLY`. Keep the real-repo and temporary-file subprocess cases.

## Merge-23 exclusions

**Already moved, source absent (22).** These paths are relative to `F/`. The matching tracked implementations exist at the count ledger’s Jini destinations.

- `media/verify-published-media.ts`, `newsletter/agent-tools.ts`, `post/agent-hold.ts`
- `publish-content/{apply-failure,apply-run,backstop-preview,connect-destination,content-references,file-tree-policy,idempotency,peer-transport,planner,publish-backstop-file,report-labels}.ts`
- `publish-trust/{challenge,session}.ts`
- `site-backup/{import-backend-steps,import-registry,share-preparation-steps,static-copy}.ts`
- `site-export/export-preflight.ts`, `webhooks/http.memory.ts`

**Jini owns the portable behavior, Tovu still binds it (14).**

- `publish-content/{backstop-service,destination-credential,disconnect-tool,publish-tool,pull}.ts`. Host policy and redaction, handshake/protocol inputs, grant reversal, tool catalog and peer transport bindings remain. Each imports the corresponding Jini `cms/publish/content` implementation.
- `site-backup/{archive-manifest,import-restore,package-file-inventory,share-hosting,share-registry,share-zip,static-site-packager}.ts`. Keep the product archive/file policy, restore/theme bindings, bundled source selection, share IDs and peer transport. These use their corresponding `devops/backup/site` implementations, including the merged expiry and temp-root behavior.
- `plugin-runtime/install-archive.ts`. Jini owns bounded archive reading and the current `agent-plugins` yauzl reader covers special Unix entries, including slash-suffixed cases. Tovu still selects yauzl and carries its existing compatibility guard. This plan neither ports the guard a second time nor deletes it against an unverified release.
- `web/agent-tools.ts`. `webFetchPageToolDefinition` already lives on `@jini-ai/platform/web`. The residual file binds the assistant grant and the product’s destination and sibling-tool wording.

## NOT-SHEETED (63)

These are **exact** residual MOVE rows, relative to `F/`. They were not assigned to a builder. In particular, the existing post, publish-contributor, and archive prerequisites in the older plans are not assumed to have landed just because their step numbers precede these files.

| Area | Files |
|---|---|
| `mail-status` | `delivery-tool-registrations.ts`, `provider-operations.ts`, `provider-tool-registrations.ts` |
| `media` | `library-save-attachment.ts`, `promote-chat-attachment.ts`, `provider-credential-store.memory.ts`, `provider-credential-store.ts`, `provider-credential-vault.ts`, `publish-content.ts`, `read-chat-attachment.ts`, `view-video-tool.ts` |
| `media-generation` | `provider-credential-save.ts`, `providers-tools.ts`, `tool-registrations.ts` |
| `media-import` | `tool-registrations.ts` |
| `members` | `tool-registrations.ts` |
| `navigation` | `publish-content.ts` |
| `newsletter` | `confirmation.ts`, `delivery/tool-registrations.ts`, `subscriptions.ts`, `tool-registrations.ts` |
| `pages` | `agent-tools.ts`, `html-document-store.memory.ts`, `html-document-store.ts`, `tool-registrations.ts` |
| `permanent-delete` | `tool-registrations.ts` |
| `plugin-runtime` | `built-ins/content-analyzer/plugin.ts`, `built-ins/word-count/index.ts`, `install-source.ts` |
| `post` | `agent-tools.ts`, `content-stats-tool.ts`, `post-create.ts`, `post-tool-input.ts`, `post-tool-policy.ts`, `post-trash.ts`, `post-update.ts`, `preview-tool.ts`, `search-index.memory.ts`, `tool-registrations.ts`, `post-tool-deps.ts` |
| `project-keys` | `service.ts`, `site-references.ts`, `tools.ts` |
| `publish-trust` | `publish-trust-revocations.ts` |
| `recovery` | `tool-registrations.ts` |
| `site-export` | `site-exporter.ts` |
| `site-inspection` | `agent-tools.ts` |
| `source-control` | `credential-setup.ts`, `store.ts`, `tool-registrations.ts`, `types.ts` |
| `taxonomy` | `agent-tools.ts`, `publish-content.ts` |
| `trash` | `adapters/media.ts`, `adapters/member.ts`, `adapters/post.ts`, `move-to-trash.ts` |
| `vendor-credentials` | `vault-adapter.ts`, `types.ts` |
| `web` | `tool-registrations.ts` |
| `web-screenshot` | `agent-tools.ts`, `tool-registrations.ts` |
| `widgets` | `publish-content.ts` |

For the next pass, close the K4 seams before batching registrars. The highest-leverage cuts are the credential repo/wire types in `source-control` and `vendor-credentials`, the HTML-store and remove/forget ports for posts/pages/trash, and the publish contributor ports. Keep the plugin worker’s SDK and trusted-import change in its own reviewed cut. Word-count tokenization is already in Jini, but the executable hook is not. The remaining site exporter is also not a second copy of Jini’s run loop. Its response, manifest and preflight composition needs its own split.
