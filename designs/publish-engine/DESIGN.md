# Publish engine move: Tovu `publish-content` + `publish-trust` -> `@jini-ai/cms/publish` (hard item #3)

Design only. Written 2026-11-16 against Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.
Inputs re-verified: sheets `move-B01-publish-transfer`, `split-B02-publish-apply-engine`, `split-B03-publish-peers` (branch `plan/audit2-sheets-b`, written against `integ/wave-b` `10378809` / `ab8711ed`).
Paths below are relative to `apps/website/src/` in Tovu and `packages/` in Jini unless they start with a repo name.

## 0. Summary

1. **The three sheets cover 5,428 lines in 26 files, not about 4k.** They also depend on two things that have not landed: the 12-file publish *framework* (3,224 lines, sheet "row 140") and the 10-file *trust* feature (2,662 lines, audit row A01). Jini has no `cms/src/publish` at all today. The real move is **48 files, 11,314 production lines**, plus 73 test files (about 875 test cases).
2. **Only B01 and two B03 files can move today.** Every B02 slice and the peer transport import `type-registry.ts` or `planner.ts`, which are still Tovu files. `type-registry.ts` is the blocker: it imports port types from nine Tovu features and holds a module-level mutable registry.
3. **Order with no broken middle state:** Phase 0 (Tovu-only preparation) -> B01 transfer -> framework -> B02 engine -> B03 peers, with the trust lane running beside the engine lane and joining at the last B03 slice. Section 5 gives the commit graph.
4. **Four findings the sheets did not have** (all verified in code, section 2):
   - Tovu's HTTP port is `send(request, options)`; Jini core's is `send({ request }, { redirect })`. They are not call-compatible. Six ad-hoc adapters already exist in Tovu and two of them drop the `redirect` option.
   - Jini has two `KeyringPort` declarations with different `activeKey` arity. Publish code uses the one in `integrations`; a cms file may only use the one in `core`.
   - Several strings that look like product branding are **signed, derived or stored values** (`tovu-publish-challenge-v1`, three key-derivation purposes, the vault scope `ownerKey: "tovu"`). Renaming any of them for neutrality breaks every existing connection or sealed credential. They become host-supplied values and keep their bytes.
   - `peers.ts` now value-imports `@jini-ai/platform/secrets/credential-sets`. The peer domain cannot move until that is behind a port.
5. **Estimate:** about 2.6M Sonnet tokens and 0.43M Opus tokens, over 8 preparation steps in Tovu and 15 Jini+Tovu commit pairs (section 9).
6. **I ran no tests.** Neither checkout has `node_modules`. Every count comes from the TypeScript AST or `grep` on the two checkouts. Section 11 lists what I could not verify.

---

## 1. Verified inventory

Method: `inv.cjs` (TypeScript AST: imports, exports, function code lines without blanks/comments, cyclomatic complexity) and `census.py` (importers by resolved path, split into in-feature, outside, tests). "Importers" are files, written `in/out/tests`.

### 1.1 B01 transfer: 9 files, 692 lines (sheet said ~700: correct)

| File (`features/publish-content/`) | Lines | Imports | Importers | Note |
|---|---|---|---|---|
| `apply-errors.ts` | 67 | none | 4/8/9 | |
| `artifact-format.ts` | 9 | none | 3/3/19 | |
| `backstop-audit.ts` | 48 | `./packed-entity` (type) | 5/4/7 | has a re-export line to delete |
| `backstop-ports.ts` | 38 | `./backstop-audit` (type); inline `import("#src/features/media/index").BlobStorePort` | 7/2/4 | has a re-export line to delete |
| `baseline-repo.ts` | 82 | none | 2/3/7 | in-memory repo used by production composition (`composition/app.ts:98`) |
| `bundle-staging.ts` | 220 | `@jini-ai/core/primitives` | 4/4/13 | workspace + expiry checks (`:109`, `:206`); in-memory repo used by `composition/app.ts:94` |
| `file-blob-index.ts` | 109 | none | 3/5/8 | |
| `packed-entity.ts` | 49 | none | 2/0/0 | |
| `blob-staging.ts` | 70 | `node:crypto` | 1/5/2 | `sha256Hex` is positional: 9 production and 16 test call sites (sheet said 1 and 4) |

No function is over 50 code lines. `stageBundle` has 2 production and 17 test call sites (sheet said 16 by hand).

### 1.2 B02 engine: 10 files, 2,599 lines

| File | Lines | Non-Jini-legal imports today | Importers | Over the limit (code lines / complexity) |
|---|---|---|---|---|
| `backstop-policy.ts` | 121 | `./file-tree-policy` (framework), `#src/features/webhooks/index` (`scanTextForSecrets`) | 6/1/10 | none |
| `backstop-preview.ts` | 75 | `node:crypto`, `#src/contracts/core/model-facing-tool-errors`, `./type-registry` (type) | 0/1/1 | none |
| `backstop-service.ts` | 117 | `@tovu/contracts/secret-redaction`, `./type-registry` (type) | 1/3/4 | none |
| `raw-row-contributor.ts` | 235 | `@jini-ai/cms/core` (own package: becomes a leaf import), `./content-hash`, `./type-registry` | 0/2/7 | `buildRawRowHandler@50` 134 |
| `raw-file-contributor.ts` | 223 | `node:crypto`, `./file-tree-policy`, `./content-hash`, `./type-registry` | 0/2/3 | `contributeRawFilePublish@18` 152 |
| `gated-hooks.ts` | 349 | Tovu `contracts/core/gated-mutations/{gateway,composition}`, `./planner`, `./seed-hash`, `./type-registry` | 3/3/5 | `buildPublishContentImportHooks@211` 102 |
| `execute-import.ts` | 59 | none | 1/2/3 | none |
| `export-bundle.ts` | 346 | `./planner`, `./type-registry`, `./content-hash`, `./ui/contract` | 2/1/7 | none |
| `apply-loop.ts` | 996 | `node:crypto`, Tovu `contracts/core/plugin-hook-failed-error`, `./run-repo`, `./planner`, `./seed-hash`, `./type-registry`, `./content-hash` | 0/2/4 | `applyOneRow@261` 195; `createPublishContentApplyPort@500` 344 (its `applyReport@531` is 312); file is 996 > 500 |
| `content-references.ts` | 78 | `#src/contracts/core/entry-refs/extractor`, `./media-references`, `./type-registry` | 0/3/4 | none |

`GatedMutationHooks` is already a re-export of `@jini-ai/core/gated-mutations` (`contracts/core/gated-mutations/gateway.ts:108`; declared at Jini `core/src/gated-mutations/gateway.ts:18`), so the sheet's STOP condition for S3 does not fire.

### 1.3 B03 peers: 7 files, 2,137 lines

| File | Lines | Non-Jini-legal imports today | Importers | Note |
|---|---|---|---|---|
| `peer-url.ts` | 140 | none (`@jini-ai/core/contracts/server/verified-origin`) | 3/2/1 | movable today |
| `peer-transport.ts` | 879 | `@tovu/contracts/secret-redaction`, `model-facing-tool-errors`, `#src/platform/http/index` (`EgressRefusedError`, `HttpClientPort`), `#src/features/deployments/static-publish/index` (types), `./type-registry`, `./export-bundle`, `./peers` | 5/3/8 | file is 879 > 500; no function over 50 code lines or complexity 10 by my count (the sheet expected `callPeer` and `pushBundleToPeer` to need splitting: confirm with Jini `scripts/check-size.mjs`, which counts differently) |
| `peers.ts` | 636 | `@jini-ai/platform/secrets/credential-sets` (**value**: `InMemoryVaultRepo`, `SecretsVaultService`), `#src/contracts/core/credential-token`, `#src/platform/secrets/vault-kinds`, `#src/features/webhooks/index` (types) | 7/10/29 | file is 636 > 500 |
| `composite-blob-source.ts` | 112 | `node:crypto`, `node:fs/promises` | 3/2/2 | |
| `destination-credential.ts` | 98 | `#src/features/publish-trust/handshake-client`, `#src/platform/http/index`, `#src/features/webhooks/index` | 4/3/2 | |
| `connect-destination.ts` | 185 | `./publish-readiness` (Tovu, `siteLabelFor`) | 2/1/1 | |
| `pull.ts` | 87 | none beyond siblings | 2/1/1 | |

### 1.4 Hidden prerequisite 1: the framework ("row 140"), 12 files, 3,224 lines

| File | Lines | Blocking imports | Importers | Over the limit |
|---|---|---|---|---|
| `type-registry.ts` | 683 | types from Tovu `features/{post,media,navigation,content-types,taxonomy,entries,theme}`, `#src/contracts/core/entry-refs/ports`, and `@jini-ai/user-management` (a non-base Jini package) | **16/25/65** | file 683 > 500 |
| `planner.ts` | 597 | siblings only | 6/4/21 | file 597 > 500 |
| `file-tree-policy.ts` | 501 | `#src/contracts/core/upload-limits` (`TOVU_MAX_UPLOAD_BYTES`), `#src/features/webhooks/index` (`scanTextForSecrets`) | 4/2/7 | file 501 > 500 |
| `repo-handler.ts` | 349 | `@jini-ai/cms/core` (own) | 0/11/1 | `createRepoPublishHandler@154` 177, its `build@192` 143, `apply@248` 78 |
| `media-references.ts` | 228 | none (`@jini-ai/cms/widgets/markers` is own package) | 1/5/3 | |
| `report-labels.ts` | 185 | siblings | 1/0/1 | |
| `content-hash.ts` | 152 | `node:crypto` | 6/4/34 | `contentHash` has 12 production and 53 test call sites |
| `run-repo.ts` | 142 | siblings | 3/4/9 | |
| `ui/contract.ts` | 135 | `../report-contract` | 7/1/5 | reached by admin through the alias `@tovu/publish-content-ui` -> `ui/index.ts` (a 70-line barrel) |
| `report-contract.ts` | 95 | none | 1/2/0 | |
| `precheck-reasons.ts` | 83 | none | 1/5/2 | |
| `seed-hash.ts` | 74 | siblings | 2/3/2 | |

Two structural facts about `type-registry.ts` decide the design:
- **`PublishContentPorts` (`type-registry.ts:117`) is a Tovu-specific bag.** It names the ports of every Tovu content type. A generic engine cannot own it.
- **The contributor registry is module-level mutable state** (`let contributors`, `type-registry.ts:647`). Production registers only from `server/runtime/composition/publish-content-manifest.ts` (17 calls in that one file). Tests call `registerPublishContentContributor` 144 times and `resetPublishContentContributorsForTests` 85 times.

### 1.5 Hidden prerequisite 2: trust (audit row A01), 10 files, 2,662 lines

| File (`features/publish-trust/`) | Lines | Imports that are not siblings | Importers | Runtime |
|---|---|---|---|---|
| `grant.ts` | 318 | none | 6/4/10 | universal. Holds `PUBLISH_TRUST_ROUTES` (`:57`), a list of Tovu admin routes |
| `revocations.ts` | 304 | none | 1/4/4 | universal |
| `provisioning.ts` | 569 | none | 3/7/10 | universal; file 569 > 500; `createFileProvisioning@509` is 53 code lines |
| `keys.ts` | 205 | `node:crypto`, `KeyringPort` (type) | 3/3/7 | node |
| `session.ts` | 212 | `node:crypto`, `KeyringPort` (type) | 0/2/4 | node |
| `challenge.ts` | 313 | none (uses `keys.ts`) | 1/2/6 | node (through `keys.ts`) |
| `handshake-client.ts` | 320 | `#src/platform/http/index` (types), `KeyringPort` (type) | 1/4/6 | node (through `keys.ts`) |
| `connect.ts` | 197 | `../deployments/index` (`isContainedDeployConfigPath`) | 0/5/3 | reads `TOVU_PUBLIC_URL` (`:58`) |
| `provisioning.node-io.ts` | 83 | `node:fs/promises`, `node:path` | 0/4/2 | node |
| `publish-trust-revocations.ts` | 141 | Tovu `platform/db/content-kernel` | 0/1/2 | SQL adapter: stays in Tovu |

The Express middleware that enforces trust on requests is `server/inbound/admin-http/publish-trust-auth.ts` (443 lines: `requirePublishTrust@221`, `withPublishTrustAuthorize@356`, `withPublishTrustContentAuthorize@400`). The handshake route is `server/inbound/public-http/routes/publish-trust/handshake.ts` (257 lines). Both import Express and stay in Tovu.

### 1.6 Consumers that are not ordinary imports

- **Path-keyed debt and baselines** (Tovu `development/scripts/`): `size-debt.json` has 14 entries for `features/publish-content/*` (apply-loop 4, raw-file 2, repo-handler 2, gated-hooks, peer-transport, publish-backstop-file, publish-tool, raw-row, tool-registrations 1 each); `src-complexity-debt.json` has 2 (file-tree-policy, raw-row); `check-architecture.baseline.json` lists feature -> `publish-content/*` edges (at least 8 seen); `extraction-dossier.mjs:1157` maps the `@tovu/publish-content-ui` alias.
- **Source-reading tests** (they read files by path): `__tests__/file-tree-policy.boundary.test.ts`, `raw-file-contributor.test.ts`, `post-no-direct-registry-import.boundary.test.ts`, `publish-trust/__tests__/provisioning.node-io.test.ts`.
- **Mock factories:** none. `vi.mock`/`vi.doMock` of any in-scope module: 0 hits in `apps/`.
- **In-memory implementations used by production composition:** `InMemoryPublishChallengeStore` (`composition/modules/core.ts:48`; this is the live nonce store), `InMemoryPublishContentBundleRepo`, `InMemoryPublishContentPeerRepo`, `InMemoryPublishContentBaselineRepo`, `createInMemoryRevocations` (`composition/app.ts:94-100`, hermetic composition). They are supported implementations and do **not** go to a `/testing` entry.
- **Tools:** `agent-tools.ts`, `tool-registrations.ts` (488), `publish-tool.ts`, `disconnect-tool.ts`, `tool-deps.ts` import the scope files. They are Tovu tool wiring and stay.

### 1.7 Where the sheets are stale or wrong

| Sheet claim | Verified state |
|---|---|
| "about 4k lines" | 5,428 in the three sheets; 11,314 with the two prerequisites |
| B02 precondition "row 140 already lives in `packages/cms/src/publish/`" | not landed; Jini has no `cms/src/publish` |
| B03 P4 "blocked until A01" | A01 not landed; `publish-trust` is still Tovu |
| "`HttpClientPort` exists in core" (so transport just imports it) | it exists (`core/src/primitives/http.ts:65`) but with a different call shape from the port Tovu passes (section 2.1) |
| P3: "depends only on `clock`/`idGen`/`keyring`/`sealer` from `core/contracts/vault`" | `peers.ts:3` value-imports platform's `SecretsVaultService`; the domain functions call it directly (`peers.ts:160-168`, `:262`, `:312`) |
| "`KeyringPort`: the Tovu `webhooks/index` names are re-exports of the same shapes" | they re-export `@jini-ai/integrations/webhooks` (`features/webhooks/ports.ts:27`), a second declaration with different `activeKey` arity (section 2.2) |
| B01: `sha256Hex` callers "blob-staging.ts:60 only; the moved test, 4 sites" | 9 production, 16 test call sites |
| P1: `callPeer`, `pushBundleToPeer` must be split | not over 50 code lines by AST count; the file (879) is over 500 and must be split by responsibility instead |
| B01/B02/B03: one `./publish` barrel with `export *` | conflicts with owner practice 5; see owner decision OD-3 |
| S1: denied-table list etc. are the only host policy | also `file-tree-policy.ts` carries `TOVU_MAX_UPLOAD_BYTES` and the secret scanner; `grant.ts:57` carries the Tovu route list |

---

## 2. Behavioural port checks (lesson 10)

### 2.1 HTTP client: two shapes, not call-compatible

| | Declared at | Shape |
|---|---|---|
| Tovu | `platform/http/ports.ts` | `send(request: HttpRequest, options?: { redirect? })` |
| Jini core | `core/src/primitives/http.ts:65` | `send(required: { request: HttpRequest }, optional?: { redirect? })` |

`HttpRequest`/`HttpResponse` are the same types (Tovu re-exports core's). Only the argument position differs, so a wrong binding is a compile error, not a silent bug. But the adapters that exist today are inconsistent: `composition/modules/site-search.ts:131` (`toProviderHttpClient`), `analytics-providers.ts:57`, `dns-change-deps.ts:22`, `tool-catalog-manifest.ts:547` drop the second argument; `boot/mail-provider-catalog.ts:116` and `deps.ts:2942` forward it.

Decision: moved code is typed against **core's** port. Tovu binds through **one** named adapter, `toJiniHttpClient`, in the new `composition/jini-publish.ts`, which forwards both arguments. The publish code does not pass `redirect` today (checked: `peer-transport.ts:243`, `handshake-client.ts:151`), so behaviour is unchanged; the adapter forwards it anyway so a later use is not dropped. Consolidating the other five adapters is out of scope and listed as a follow-up.

The security property "no redirect hop and no credential on a cross-origin redirect" is **host-owned**: it lives in the egress policy of the client Tovu passes (`peer-transport.ts:46-47` documents `maxRedirects: 0`). The Jini contract states it as a requirement on the injected client and ships a conformance check (section 6, T-K7b).

### 2.2 Keyring: two declarations

| | Declared at | `activeKey` | `derive` |
|---|---|---|---|
| core | `core/src/contracts/vault/ports.ts:10` | `activeKey(_required: Record<string, never>)` | `derive({ workspaceId: string; purpose; info })` |
| integrations | `integrations/src/webhooks/ports.ts:19` | `activeKey()` | `derive({ workspaceId: UUID; purpose; info })` |

Publish code only calls `derive` (`keys.ts:96`, `:140`, `session.ts:64`) with `workspaceId as never` casts. An integrations-typed keyring is assignable to core's port (fewer parameters, method bivariance), and the call at run time is identical. Decision: moved code imports `KeyringPort` and `SecretSealerPort` from `@jini-ai/core/contracts/vault`; the `as never` casts are deleted; Tovu's binding line carries `satisfies`. Merging the two declarations is Jini debt outside this design (follow-up F2). Note for the owner: core's `activeKey(_required: Record<string, never>)` is itself against practice 2.

### 2.3 Vault for peer credentials

`peers.ts` builds a `SecretsVaultService` (platform) inside the domain and checks the vault context there (`peers.ts:168`, `:177`). The scope is `{ kind: "publish-peer", ownerKey: "tovu", principalId: null, provider: null }` (`peers.ts:155`). The scope is bound into the sealed record's authenticated context, so **`ownerKey: "tovu"` is stored data and cannot be renamed**.

Decision: the Jini peer domain declares one consumer-owned port, `PeerCredentialStorePort` (section 4.3). The vault-backed implementation, its scope constant and the context check stay in Tovu (`features/publish-content/peer-vault-store.ts`) because they bind platform to a cms port. Q8 says such adapters belong in the host preset later; that is OD-4.

### 2.4 Positional signatures that must change shape

Owner practice 2 requires `(required, optional = {})`. These exported functions are `(deps, input)` or single positional today (production / test call sites):

`callPeer` 11/16, `pushBundleToPeer` 2/30, `pullBundleFromPeer` 1/8, `pullBlobsFromPeer` 1/11, `executePeerImport` 3/11, `confirmPeerImport` 3/4, `resolvePeerCredential` 1/19, `resolvePublishDestinationCredential` 5/8, `fetchDestinationIdentity` 2/16, `openPublishSession` 0/14 (production reaches it only as a default argument, `destination-credential.ts:65`), `mintPublishSession` 1/14, `verifyPublishSession` 1/22, `verifyChallengeResponse` 1/24, `issuePublishChallenge` 1/10, `derivePublishSigningKey` 2/22, `deriveInstallationId` 5/8, `verifyPublishSignature` 1/15, `admitPublish` 1/2, `stageBundle` 2/17, `sha256Hex` 9/16, `registerPublishContentContributor` 17/144, `buildPublishContentCatalog` 8/25, `registeredPublishTypePermissions` 2/2.

Also to fix on the way: `Record<string, never>` option types at `keys.ts:116`, `:170`, `:194` and `peer-transport.ts:488`, `:761`, `:810`.

Each conversion is a behaviour-free Tovu commit **before** the move (Phase 0), so the move commit is a pure move.

---

## 3. Trust, signing and key ownership

This is the acceptance core of the design. Every row names the check, where it is today, who owns it after the move, the port if it crosses the Jini/Tovu boundary, and the characterization test that must go **red when the check is removed**. "Existing" names the test file that should already cover it; I did not run them, so each one needs the mutation proof in section 6 before its file moves.

Rule for all of it: **the engine never sees a root key.** The only key-material port is `KeyringPort.derive` (derived bytes per purpose) and `SecretSealerPort` (seal/open). The host owns the keyring.

### 3.1 Source side (the computer that publishes)

| # | Decision / key path | Today | Owner after | Port across the boundary | Test that fails if removed |
|---|---|---|---|---|---|
| K1 | Installation id derived from the site key, purpose `publish-trust-installation-id`, 16 bytes | `keys.ts:32`, `:90` | Jini `publish/trust/keys.ts`; purpose strings supplied by host (`TrustNames.installationIdPurpose`) | `KeyringPort` (core) | T-K1: fixed fake keyring -> exact id bytes; changing the purpose or length changes the pinned value. Existing: `keys.test.ts` |
| K2 | Signing key derived per (source installation, target origin, generation), purpose `publish-trust-signing-key` | `keys.ts:35`, `:131-150` | Jini `publish/trust/keys.ts` | `KeyringPort` | T-K2: pinned public key for a fixed seed; a second test asserts a different `targetOrigin` gives a different key (fails if origin is dropped from the derivation input) |
| K3 | Canonical challenge message with domain tag `tovu-publish-challenge-v1` | `challenge.ts:36`, `:83` | Jini `publish/trust/challenge.ts`; the tag is `TrustNames.challengeDomain`, supplied by host | none (pure) | T-K3: byte-exact golden string for a fixed input, with the host value `tovu-publish-challenge-v1`; fails on any reorder, missing field or renamed tag |
| K4 | Handshake client: fetch identity, request nonce, sign, exchange for session; every response field validated; timeout | `handshake-client.ts:236`, `:264`, `:54` | Jini `publish/trust/handshake-client.ts` | `HttpClientPort` (core), `KeyringPort`; route base `PUBLISH_TRUST_HANDSHAKE_BASE` (`:40`) and product name are host values | T-K4: fake HTTP returns a body missing each required field in turn -> typed refusal each time. Existing: `handshake-client.unit.test.ts`, `handshake-client-keyless.unit.test.ts` |
| K5 | Destination identity re-check: the workspace the site reports now must equal the one stored at connect time | `destination-credential.ts:87` | Jini `publish/peers/destination-credential.ts` | none | T-K5: `openSession` fake returns a different workspace -> `PublishTrustHandshakeError` with `failure: "refused"`. Existing: `destination-credential.test.ts` |
| K6 | Sealed API key: exactly one function decrypts (`resolvePeerCredential`); fail closed when sealing is unavailable; read paths never touch sealer/keyring; summaries never carry sealed fields; masked hint only | `peers.ts:378`, `:63`, `:132-141`, `:147`, `:191` | decision and single call site: Jini `publish/peers/credentials.ts`. Sealing, AAD context check (`peers.ts:168`, `:177`) and scope constant: Tovu `peer-vault-store.ts` | `PeerCredentialStorePort` (new, consumer-owned) | T-K6a (Jini): store fake whose `openCredential` counts calls -> list/get/summary paths make 0 calls. T-K6b (Jini): `saveWithCredential` rejects -> no record written, typed `...SecretStoreUnconfiguredError`. T-K6c (Tovu adapter): a record of another kind or owner key -> `VaultError("context")`. Existing: `peers.test.ts`, `peers.l061.test.ts` |
| K7 | Credential attached as a bearer header; error messages redacted before they are stored on the error; egress refusal turned into an owner sentence; no redirect hop | `peer-transport.ts:255`, `:69`, `:99-114`, `:46-47` | header + error class: Jini `publish/peers/transport-call.ts`. Redaction, egress sentence, client policy: Tovu | `redact`, `describeEgressRefusal`, `HttpClientPort` | T-K7a: `redact` fake replaces a marker; an error built from text containing the marker carries the replaced text (fails if the constructor stops calling the port). T-K7b (Tovu): the publish client's policy has `maxRedirects: 0`. Existing: `peer-transport.l061.test.ts` |
| K8 | Peer base URL normalisation and refusals | `peer-url.ts:87` | Jini `publish/peers/peer-url.ts` | none | Existing `peer-url.test.ts` (table of refusals); moves unchanged |
| K9 | Blob integrity: pulled bytes must hash to the requested sha256; a peer may only ask for blobs in the selected set; pull cap 2,000 | `peer-transport.ts:873`, `:826`, `:707` | Jini `publish/peers/transport-blobs.ts` | `BlobHashPort`? no: `bytesMatchSha256` stays a direct import of the sibling node leaf | T-K9a: peer returns bytes that do not match -> `PEER_RESPONSE_INVALID`, sink `putIfAbsent` not called. T-K9b: peer lists a hash outside the selection -> refusal, no upload. Existing: `peer-transport-blob-pull.test.ts` |

### 3.2 Destination side (the site that accepts a publish)

| # | Decision | Today | Owner after | Port | Test that fails if removed |
|---|---|---|---|---|---|
| D1 | Nonce issued with TTL, consumed exactly once before any other check | `challenge.ts:107`, `:259` (`takeOnce`), `:40` | Jini `publish/trust/challenge.ts`. Nonce **state** owner: the store the host passes (today in-memory, `composition/modules/core.ts:48`) | `PublishChallengeStorePort` (exists, `challenge.ts:57`) | T-D1: verify the same response twice -> second is refused; expired nonce refused with a pinned clock. Existing: `challenge.unit.test.ts` |
| D2 | Grant active, source matches, requested capabilities within the grant, signature verifies against the key of the claimed generation | `challenge.ts` `grantRefusal` (`:174`), `capabilityRefusal` (`:192`), `signatureRefusal` (`:212`) | Jini `publish/trust/challenge.ts` | none | T-D2: four cases, one per refusal, each with every other input valid; plus one where the signature is over a different capability list. Existing: `challenge.unit.test.ts` |
| D3 | Admission order: revocations unreadable -> refuse; revoked; site configured; grant found; grant active; key not superseded | `revocations.ts:213-234` | Jini `publish/trust/revocations.ts` | `PublishTrustRevocationPort` (exists, `:72`); SQL store stays Tovu | T-D3: `revocations: null` with a valid grant -> `revocations-unreadable` (fails if the null check is dropped); one case per refusal. Existing: `revocations.test.ts` |
| D4 | Session token: MAC compared in constant time **before** the payload is parsed; expiry; audience; workspace | `session.ts:82`, `:190`, `macMatches`, `claimRefusal` | Jini `publish/trust/session.ts`; purpose `publish-trust-session-key` from `TrustNames` | `KeyringPort` | T-D4: valid payload with a wrong MAC -> refused; valid MAC with each claim wrong in turn -> refused with that reason; a token minted under another workspace's key -> refused. Existing: `session.unit.test.ts` |
| D5 | Grant document parsing and bounds (grant count, document bytes, lifetime) | `grant.ts:210`, `provisioning.ts:49`, `:54`, `:63` | Jini `publish/trust/{grant,provisioning}.ts` | `ProvisioningFileIo` (exists, `provisioning.ts:420`); Node file IO stays in Tovu until OD-4 | Existing: `grant-parse.unit.test.ts`, `provisioning.test.ts` |
| D6 | Which routes a publishing session may call | `grant.ts:57` (`PUBLISH_TRUST_ROUTES`), `:306` (`isPublishTrustRoute`) | matcher: Jini. **Route list: Tovu** (`features/publish-trust/trusted-routes.ts`), passed as `routes` | `routes: readonly TrustedRoute[]` value | T-D6 (Tovu): the list equals the pinned 2026-11-16 set (count and each method+path); a new route cannot join without changing the test |
| D7 | Request middleware: token -> context -> route check -> capability check -> authorize wrapper | `server/inbound/admin-http/publish-trust-auth.ts:221`, `:356`, `:400` | **Tovu** (Express). Unchanged except import lines | calls Jini `verifyPublishSession`, `admitPublish`, `isPublishTrustRoute` | Existing Tovu route tests; listed as a guard, not moved |
| D8 | Publish-type stamp on every `authorize` call; the stamp is spread last so a caller cannot set it; per-type permission map keyed by publish type | `type-registry.ts:619`, `:634`, `:643` | Jini `publish/registry/catalog.ts` | `AuthorizeFn` (core events contract, already used at `type-registry.ts:29`) | T-D8: a handler calls `authorize({ publishType: "other" })` -> the host `authorize` fake receives the registry's type, not `"other"` |
| D9 | Staged bundle is workspace-scoped and expires; body cap 20 MB | `bundle-staging.ts:206`, `:109`, `:87` | Jini `publish/transfer/bundle-staging.ts` | `PublishContentBundleRepoPort` (exists, `:62`) | T-D9: load with another workspace id -> `null`; load one millisecond after expiry -> `null`. Existing: `bundle-staging.test.ts` |
| D10 | Confirmation ceremony: plan hash binds the exact report; actor identity; restore point | `gated-hooks.ts:281`, `:347`, `:293` | Jini `publish/engine/import-hooks.ts` | `planHashOf`, `resolveActorClassIdentity` (Tovu bindings shared by three ceremonies) | T-D10: change one row of the report between plan and execute -> the hash differs. Existing (stays Tovu): `gated-hooks.confirmed-report.test.ts` |
| D11 | Apply requires `authorize` and `changeSets`; a forbidden write downgrades the row instead of being retried or hidden; idempotency keys per item / per run; re-verify "changed since plan" | `apply-loop.ts:127`, `:151`, `:211`, `:360-469` | Jini `publish/engine/apply-*.ts` | `markRefusedItem` (Tovu wraps `PluginHookFailedError`) | T-D11: `authorize` fake throws `ForbiddenError` for one item -> that row is downgraded, the other rows still apply, and the handler's write is not called for the refused item. Existing: `apply-loop.test.ts` (1,640 lines) |
| D12 | Raw ("backstop") transfer: who may use it; denied tables, columns, file roots; secret scan; audit record; grant capability check | `backstop-service.ts:7-9`, `:35`; `backstop-policy.ts:14-40`, `:42-75`; `grant.ts:35` | checks: Jini `publish/backstop/*`. **Lists and scanner: Tovu** `TOVU_BACKSTOP_POLICY` | `BackstopPolicyConfig` (value + `scanForSecrets`), `redact` | T-D12: for each config field, a policy with that field emptied lets through an input the full policy refuses (proves each field is read). Tovu keeps `backstop-policy.private-tables.unit.test.ts` |
| D13 | File-tree policy: path containment, credential file names, secret scan with a byte ceiling, MCP config placeholder check | `file-tree-policy.ts:92`, `:171`, `:205`, `:273`, `:333` | checks: Jini `publish/files/tree-policy.ts`. Upload ceiling and scanner: Tovu values | `FileTreePolicyConfig` (`maxUploadBytes`, `scanForSecrets`) | Existing: `file-tree-policy.boundary.test.ts` (355 lines), `.l044`, `.backup-suffix`. The boundary test reads source by path: rewrite its path in the same commit |
| D14 | Revocation persistence | `publish-trust-revocations.ts:35` | Tovu (SQL adapter) | implements `PublishTrustRevocationPort` | Existing: `revocations-store.unit.test.ts` (stays) |
| D15 | Provisioning file location is contained in the committed config root | `provisioning.node-io.ts:42`, `connect.ts` (`isContainedDeployConfigPath`) | Tovu (Node IO + deploy path rule) | implements `ProvisioningFileIo` | Existing: `provisioning.node-io.test.ts` (stays) |

### 3.3 Values that look like branding but are data: do not rename

| Value | Where | Why it is frozen | Handling |
|---|---|---|---|
| `tovu-publish-challenge-v1` | `challenge.ts:36` | part of the signed message | `TrustNames.challengeDomain`, host-supplied |
| `publish-trust-installation-id`, `publish-trust-signing-key`, `publish-trust-session-key` | `keys.ts:32`, `:35`, `session.ts:26` | key-derivation inputs: a change gives different keys and ids, so every connection breaks | `TrustNames.*Purpose`, host-supplied. They contain no product name, so Jini may also ship them as the defaults: OD-5 |
| `ownerKey: "tovu"`, `kind: "publish-peer"` | `peers.ts:155` | bound into sealed records | stays in Tovu's adapter |
| `pub:` | `keys.ts:56` | principal id prefix stored in audit rows | Jini constant (no product name) |
| `/api/publish-trust/v1` | `handshake-client.ts:40` | wire path both sides must agree on | host value `handshakeBasePath` |
| `"not-a-tovu-site"` | `handshake-client.ts:66` | failure code that callers switch on | renamed to `"not-a-peer-site"` **only** with a census of every consumer in the same commit; otherwise keep. OD-6 |
| `"tovu-peer"` | `peer-transport.ts:611` | history row kind already saved | stays in Tovu's `recordRemoteApply` binding |
| `TOVU_PUBLISH_TRUST`, `deploy/publish-trust.json`, `TOVU_PUBLIC_URL` | `provisioning.ts:38`, `:44`, `connect.ts:58` | environment and file names | host values; `connect.ts` stays in Tovu |

T-FROZEN (Tovu, new): one test pins every value in this table to its literal. It is the guard against a well-meant neutrality rename.

---

## 4. Target shape

### 4.1 Folder tree (Jini `packages/cms/src/publish/`)

```
publish/
  transfer/        # B01                                   entry ./publish/transfer (universal)
    apply-errors.ts  artifact-format.ts  packed-entity.ts  baseline-repo.ts
    bundle-staging.ts  file-blob-index.ts  backstop-audit.ts  backstop-ports.ts
    blob-hash.node.ts            # was blob-staging.ts      entry ./publish/node
  registry/        # framework                              entry ./publish/registry (universal)
    types.ts          # PublishContentDeps<TPorts>, Handler, Contributor, RetireTarget ...
    registry.ts       # createPublishTypeRegistry() - state lives in the returned object
    catalog.ts        # buildPublishContentCatalog, stampPublishType, permission map
    content-hash.node.ts   seed-hash.ts   precheck-reasons.ts   repo-handler.ts (+ split files)
  planning/        # framework                              entry ./publish/planning (universal)
    planner.ts (+ plan-rows.ts split)  run-repo.ts  report-contract.ts  report-labels.ts
    ui-contract.ts  media-references.ts  content-references.ts  export-bundle.ts
  files/           # framework                              entry ./publish/files (universal)
    tree-policy.ts  tree-paths.ts  tree-secrets.ts          # split of file-tree-policy.ts (501)
  backstop/        # B02 S1-S2                              entry ./publish/backstop (universal) + node leaves
    policy.ts  preview.node.ts  service.ts  raw-row.ts (+ parts)  raw-file.node.ts (+ parts)
  engine/          # B02 S3-S5                              entry ./publish/engine (node: uses node:crypto)
    import-hooks.ts  import-steps.ts  execute-import.ts
    apply-port.ts  apply-report.ts  apply-row.ts  apply-retire.ts  apply-failure.ts  idempotency.ts
  peers/           # B03                                    entry ./publish/peers (universal) + ./publish/peers/node
    peer-url.ts  records.ts  credentials.ts  peer-service.ts  connected-destination.ts
    transport-errors.ts  transport-call.ts  transport-bundle.ts  transport-blobs.ts
    destination-credential.ts  connect-destination.ts  pull.ts
    composite-blob-source.node.ts  memory-peer-store.ts
  trust/           # A01                                    entry ./publish/trust (universal) + ./publish/trust/node
    grant.ts  routes.ts  revocations.ts  provisioning.ts  provisioning-status.ts  names.ts
    keys.node.ts  session.node.ts  challenge.node.ts  handshake-client.node.ts
  testing/         # fakes of this domain's ports           entry ./publish/testing
    fake-keyring.ts  fake-http-client.ts  fake-peer-store.ts  recording-authorize.ts  fixed-clock.ts
```

New isolation domains in `cms/package.json` `jini.isolation.domains`: `publish` -> `src/publish`. The `node` entries follow the existing convention (`./media/node`, `./navigation/node`); the universal entries must not reach a `*.node.ts` leaf (the existing `check-subpath-isolation.ts` enforces `forbidden.universal: ["node:", ...]`).

Every proposed file is under 500 lines. The splits that make that true, measured against today's files:

| Today | Lines | Split by responsibility |
|---|---|---|
| `apply-loop.ts` | 996 | `idempotency.ts` (key functions), `apply-failure.ts` (`classifyApplyRowFailure`), `apply-retire.ts` (retire validation and write), `apply-row.ts` (existence/agreement checks, ordinary row), `apply-report.ts` (the run loop, run-row persistence), `apply-port.ts` (factory + deps types). Six files, each about 120-220 lines |
| `peer-transport.ts` | 879 | `transport-errors.ts` (error class, reason tables), `transport-call.ts` (`callPeer`, request payload, refusal classification), `transport-bundle.ts` (push, confirm, execute, pull bundle), `transport-blobs.ts` (push/pull blobs, verified fetch) |
| `type-registry.ts` | 683 | `registry/types.ts`, `registry/registry.ts`, `registry/catalog.ts`; Tovu keeps `tovu-publish-ports.ts` |
| `peers.ts` | 636 | `records.ts` (errors, record/summary types, validation), `credentials.ts` (`resolvePeerCredential`, `maskApiKey` port use), `peer-service.ts` (create/update/list/get/delete), `connected-destination.ts`, `memory-peer-store.ts`; Tovu keeps `peer-vault-store.ts` |
| `planner.ts` | 597 | `planner.ts` (`planImport` and helpers) + `plan-rows.ts` (types, `entityKey`, labels) |
| `provisioning.ts` | 569 | `provisioning.ts` (document parse/merge, file provisioning) + `provisioning-status.ts` (`describePublishTrustState`, `describeConnection`) |
| `file-tree-policy.ts` | 501 | `tree-paths.ts`, `tree-secrets.ts`, `tree-policy.ts` |

Function splits (owner limit 50, CI error at 80; all done in Tovu in Phase 0 so the tests that guard them do not move at the same time):

| Function | Code lines | Split |
|---|---|---|
| `applyReport` (`apply-loop.ts:531`) | 312 | `loadRun` (bundle + report checks), `openRun` (run row), `applyRows` (ordered loop), `recordRowOutcome`, `closeRun`. Mutable state owner: one `RunProgress` object created by `openRun`, passed explicitly; nothing else writes it |
| `applyOneRow` (`:261`) | 195 | lift the five nested closures (`validateRetire`, `applyRetiringRow`, `checkExistence`, `checkAgreement`, `applyOrdinaryRow`) to module functions taking `{ step }`. They close over `row, ctx, key, entity, handler, current` only (per the B02 sheet; **re-verify with the AST before coding**: a closure that reads a variable assigned later would become an eager read, lesson 3) |
| `buildPublishContentImportHooks` (`gated-hooks.ts:211`) | 102 | `planStep`, `executeStep`, `restorePointStep` |
| `contributeRawFilePublish` (`raw-file-contributor.ts:18`) | 152 | `packRawFile`, `inspectRawFile`, `applyRawFile`, `undoRawFile` sharing a `RawFileEnv` value |
| `buildRawRowHandler` (`raw-row-contributor.ts:50`) | 134 | same four-way split with `RawRowEnv` |
| `createRepoPublishHandler` (`repo-handler.ts:154`) | 177 | `packRepoEntity`, `inspectRepoEntity`, `precheckRepoEntity`, `applyRepoEntity` (its 78-line `apply` splits again into write + rollback) |
| `planPublishToPeer` (`push-plan.ts:14`) | 63 | stays in Tovu (imports routing and post contracts); split there, not part of the move |
| `createFileProvisioning` (`provisioning.ts:509`) | 53 | extract `readProvisioned` |

### 4.2 Dependency direction

```
core, protocol
   ^
cms/core, cms/media, cms/widgets (existing leaves)
   ^
publish/transfer  <-  publish/registry  <-  publish/planning  <-  publish/backstop  <-  publish/engine
                                   ^                 ^
publish/files  -------------------/                  |
publish/trust  (imports only core)                   |
publish/peers  ->  transfer, registry(types), planning(export-bundle types), trust(handshake client only in destination-credential)
```

No cycle: `trust` imports nothing from the rest; `peers` is the only slice that knows both. `engine` never imports `peers` or `trust`: the destination's trust checks reach the engine only as the host-supplied `authorize` function (D8, D11).

### 4.3 Contracts (signatures)

```ts
// publish/registry/types.ts - the engine is generic over the host's port bag
export interface PublishContentDeps<TPorts = unknown> {
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly idGen: { newId(): string };
  readonly types: PublishTypeSource<TPorts>;          // read fresh on every catalog build
  readonly ports: Partial<TPorts>;
  readonly outbox?: OutboxPort; readonly beforeSaveHook?: BeforeSavePort;
  readonly changeSets?: ChangeSetRepoPort; readonly authorize?: AuthorizeFn;
  readonly backstop?: BackstopPorts;
}
export interface PublishTypeSource<TPorts> { list(): readonly PublishContentContributor<TPorts>[] }

// publish/registry/registry.ts - no module-level state
export function createPublishTypeRegistry<TPorts>(
  required: Record<never, never> = {}, optional: { initial?: readonly PublishContentContributor<TPorts>[] } = {},
): PublishTypeRegistry<TPorts>;   // { register({ contributor }), list(), }  replace-by-key, order kept
export function buildPublishContentCatalog<TPorts>(required: { deps: PublishContentDeps<TPorts> }, optional?: {}): PublishContentCatalog<TPorts>;
```
`BeforeSavePort` is the one new name: today's `BeforeSaveHookPort` is a Tovu post type (`type-registry.ts:3`). The engine never calls it; it only carries it to handlers. It is therefore typed `unknown`-safe in the engine as a member of the host bag instead: **move `beforeSaveHook` into `TPorts`** (Tovu's `TovuPublishPorts.post.beforeSaveHook`) unless the full read in F2 shows the engine reads it. This is flagged as riskiest call 1.

```ts
// publish/trust/names.ts - frozen values come from the host (section 3.3)
export interface TrustNames {
  readonly challengeDomain: string;            // Tovu: "tovu-publish-challenge-v1"
  readonly installationIdPurpose: string; readonly signingKeyPurpose: string; readonly sessionKeyPurpose: string;
  readonly handshakeBasePath: string;          // Tovu: "/api/publish-trust/v1"
  readonly productName: string;                // Tovu: "Tovu" - owner-facing sentences only
}
// publish/trust/session.node.ts
export function verifyPublishSession(
  required: { keyring: KeyringPort; clock: Clock; names: TrustNames; workspaceId: string; token: string; expectedAudience: string },
  optional?: {},
): Promise<PublishSessionVerification>;
// publish/trust/challenge.node.ts
export function verifyChallengeResponse(
  required: { store: PublishChallengeStorePort; clock: Clock; names: TrustNames; grant: PublishTrustGrant; targetInstallationId: string; response: PublishChallengeResponse },
  optional?: {},
): Promise<ChallengeVerification>;
// publish/trust/routes.ts
export function isTrustedRoute(required: { routes: readonly TrustedRoute[]; method: string; path: string }, optional?: {}): boolean;
```

```ts
// publish/peers/records.ts - consumer-owned port; the host binds a vault
export interface PeerCredentialStorePort {
  find(required: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null>;   // never decrypts
  list(required: { workspaceId: string }): Promise<readonly PublishContentPeerRecord[]>;           // never decrypts
  saveWithCredential(required: { record: PeerRecordFields; apiKey: string }): Promise<void>;       // seals or throws; never writes plaintext
  saveWithoutCredential(required: { record: PeerRecordFields }): Promise<void>;                    // connected destinations
  remove(required: { workspaceId: string; id: string }): Promise<void>;
  openCredential(required: { workspaceId: string; id: string }): Promise<string>;                  // the only decrypting method
  hintFor(required: { apiKey: string }): string;                                                   // display hint
}
// publish/peers/transport-call.ts
export interface PeerCallDeps {
  readonly httpClient: HttpClientPort;                 // core shape; must not follow redirects (conformance T-K7b)
  readonly credential: ResolvedPeerCredential;
  readonly clock: Clock;
  readonly productName: string;
  readonly redact: (required: { text: string }) => string;
  readonly describeEgressRefusal?: (required: { err: unknown; hostname: string }) => string | null;
  readonly report?: (required: { message: string; error: unknown }) => void;
  readonly recordRemoteApply?: (required: RemoteApplyRecord) => Promise<void>;
}
export function callPeer(required: { deps: PeerCallDeps; request: PeerRequest }, optional?: {}): Promise<unknown>;
```
Whether seven methods is the right size for `PeerCredentialStorePort` depends on a full read of `peers.ts:200-636`, which I did not do line by line. An Opus draft owns that (riskiest call 2).

### 4.4 What Tovu keeps

```
features/publish-content/
  tovu-publish-ports.ts        # TovuPublishPorts (today's PublishContentPorts) + type TovuPublishDeps
  backstop-policy.ts           # TOVU_BACKSTOP_POLICY (lists + scanner binding) only
  file-tree-config.ts          # TOVU_FILE_TREE_POLICY (upload ceiling + scanner)
  peer-vault-store.ts          # PeerCredentialStorePort over SecretsVaultService; scope constant; context check
  peer-egress.ts               # describePeerEgressRefusal with the TOVU_PUBLISH_CONTENT_DEV_HOSTS wording
  publish-readiness.ts, push-plan.ts, live-site-policy.ts, permissions.ts, publish-backstop-*.ts,
  publish-content-peer-repo*.ts, agent-tools.ts, tool-*.ts, publish-tool.ts, disconnect-tool.ts, ui/*
features/publish-trust/
  trust-names.ts               # TOVU_TRUST_NAMES (section 3.3 literals)
  trusted-routes.ts            # the route list from grant.ts:57
  connect.ts, provisioning.node-io.ts, publish-trust-revocations.ts
server/runtime/composition/
  jini-publish.ts              # NEW: every binding in one place, each line with `satisfies`
  publish-content-manifest.ts  # registers contributors on the registry instance it is given
server/inbound/...             # Express routes and publish-trust-auth.ts: import lines only
```
`composition/jini-publish.ts` follows untangle DESIGN section 3 ("each lane adds one `jini-<topic>.ts`; the coordinator adds the one line in `deps.ts`/`app.ts`"). It exports `toJiniHttpClient`, `publishTypes` (the registry instance), `publishTrustNames`, `peerCallBindings` (`redact`, `describeEgressRefusal`, `report`, `recordRemoteApply`), `backstopBindings`, `importHookBindings` (`planHashOf`, `resolveActorClassIdentity`, `markRefusedItem`).

---

## 5. Migration graph

Each step is one Jini commit then one Tovu commit, except Phase 0 (Tovu only). A Jini commit adds files that nothing imports yet, so Jini is green alone. The Tovu commit deletes the old file, repoints every importer and binds the ports; it needs the Jini commit to be resolvable by Tovu (section 11, U3). No forwarder or alias is left behind in either repo.

Gates for every Jini commit: `npm --prefix packages/cms run typecheck`, `npm --prefix packages/cms run test`, `npm --prefix packages/cms run check:packaging`, `pnpm guard` (root). Gates for every Tovu commit: `npm run typecheck`, `npm run typecheck:tests`, and the named test files through `npm run test` (root script; there is no `apps/website/package.json`).

### Phase 0: Tovu-only preparation (no file leaves Tovu)

| Step | Change | Prerequisites | Callers / tests touched | Green alone because |
|---|---|---|---|---|
| P0.1 | Add the trust characterization tests of section 6 and run the mutation proof | none | new test files only | adds tests |
| P0.2 | `T-FROZEN` test for section 3.3 values | none | new test | adds a test |
| P0.3 | Split `type-registry.ts`: `PublishContentPorts` -> `tovu-publish-ports.ts`; make `PublishContentDeps`, `Handler`, `Contributor`, `Catalog` generic with default `TPorts = TovuPublishPorts` **for this step only** so no call site changes | none | 16 in-feature + 25 outside importers compile unchanged; type-only | types only; default keeps every existing reference valid |
| P0.4 | Registry instance: `createPublishTypeRegistry()`; `deps.types`; `buildPublishContentCatalog({ deps })` | P0.3 | production: `publish-content-manifest.ts` (17 register calls), 8 catalog sites, the deps builders (`admin-http/routes/publish-content/deps.ts`, `tool-deps.ts`, composition); tests: 144 register + 85 reset sites through a codemod to a per-test registry | one commit; codemod output is reviewed by diff count (144 + 85) |
| P0.5 | Positional -> `(required, optional = {})` for section 2.4, one commit per file family (transfer, registry, peers, transport, trust) | none | call-site counts in section 2.4 | behaviour-free; typecheck finds every miss |
| P0.6 | Function splits of section 4.1 in place, one commit per function | P0.1 for trust-adjacent ones | existing tests: `apply-loop.test.ts`, `backstop-batch.apply-loop.test.ts`, `backstop.l061.test.ts`, `gated-hooks.confirmed-report.test.ts`, `raw-row-contributor.test.ts`, `raw-file-contributor.test.ts`; delete the matching `size-debt.json` entries in the same commit | pure refactor under existing tests |
| P0.7 | Ports in place: `redact`, `report`, `describeEgressRefusal`, `recordRemoteApply`, `productName`, `markRefusedItem`, `planHashOf`/`resolveActorClassIdentity` as inputs, `BackstopPolicyConfig`, `FileTreePolicyConfig`, `TrustNames`, `routes`, `PeerCredentialStorePort`; add `composition/jini-publish.ts` | P0.5 | the files of sections 1.2, 1.3, 1.5; coordinator adds the use lines in `deps.ts`/`app.ts` | every binding passes today's value; T-FROZEN and section 6 tests prove equality |
| P0.8 | File splits of section 4.1 in place (same names as the Jini targets) | P0.6, P0.7 | importers repointed by script; `check-architecture.baseline.json` edges rewritten | pure move inside Tovu |

After Phase 0 every in-scope file imports only: siblings, `@jini-ai/core/*`, `@jini-ai/cms/*` (own package after the move), and `node:` where its entry is a node entry. A script check (`rg -n "#src/|@tovu/|\.\./\.\./" <scope files>` prints nothing) is the exit gate.

### Phase 1 to 5: moves

| Step | Moves (Jini target) | Prerequisites | Tovu commit also does |
|---|---|---|---|
| J0 | `cms/package.json`: isolation domain `publish`, entries (OD-3), changeset; empty `publish/testing` with `fixed-clock`, `fake-keyring`, `fake-http-client` | P0 done | nothing |
| **B01** | `transfer/*` (9 files) + 3 tests (`blob-staging`, `bundle-staging`, `file-blob-index`) | J0 | repoint 4+8, 3+3, 5+4, 7+2, 2+3, 4+4, 3+5, 2+0, 1+5 production importers and the listed tests; `backstop-ports.ts` takes `BlobStorePort` from the cms leaf `media/ports.ts:115` |
| F1 | `registry/{content-hash.node,precheck-reasons,seed-hash,types,registry,catalog}`, `planning/{report-contract,ui-contract,plan-rows,planner,run-repo,report-labels}` | B01 | remove the P0.3 default (`TPorts` now explicit `TovuPublishPorts` at Tovu's ~41 importers); `ui/index.ts` keeps exporting its own Tovu names and loses the moved ones (R-BARRELS rule: importers go straight to Jini) |
| F2 | `registry/repo-handler*`, `planning/media-references`, `files/tree-*` | F1 | 11 outside importers of `repo-handler` (the content-type features); `file-tree-policy.boundary.test.ts` path rewrite |
| **B02-S1** | `backstop/{policy,preview.node,service}` + 3 tests | F2 | 51 policy call sites already pass `policy` since P0.7: import repoint only |
| **B02-S2** | `backstop/{raw-row*,raw-file.node*}` + 2 tests | S1 | `publish-content-manifest.ts`, composition module |
| **B02-S4** | `planning/{export-bundle,content-references}` + export tests | F2 (and `extractEntryRefs` reachable from cms: section 11, U5) | `push-plan.ts`, export route |
| **B02-S3** | `engine/{import-hooks,import-steps,execute-import}` + `execute-import.test.ts` | S4 | `gated-hooks.confirmed-report.test.ts` stays, imports repointed |
| **B02-S5** | `engine/apply-*`, `idempotency` + apply tests | S1, S3 | composition `deps.ts`/`app.ts` use lines (coordinator) |
| T1 | `trust/{grant,routes,revocations,provisioning,provisioning-status,names}` + tests | J0 (independent of B01-B02) | `publish-trust-auth.ts`, `handshake.ts` route, composition files import lines |
| T2 | `trust/{keys,session,challenge}.node` + tests | T1, P0.1 green | same importers |
| T3 | `trust/handshake-client.node` + tests | T2 | `connect.ts`, `destination-credential.ts` |
| **B03-P3** | `peers/{records,credentials,peer-service,connected-destination,memory-peer-store}` + rewritten peer tests | J0 | 7+10 importers of `peers.ts`; Tovu keeps adapter tests against the real vault |
| **B03-P1** | `peers/{peer-url,transport-*}` + 4 tests | P3, S4 (`PublishContentExportEnvelope`), F1 (`PackedEntity`) | routes and tools listed in the B03 sheet; Tovu-wording tests stay |
| **B03-P2** | `peers/composite-blob-source.node` + test | P1, B01 | `push-plan.ts` |
| **B03-P4** | `peers/{destination-credential,connect-destination,pull}` + tests | P1, T3 | `siteLabelFor` passed as a function input |

So the three sheets land as **B01 -> (F1, F2) -> B02 (S1, S2, S4, S3, S5) -> B03 (P3, P1, P2, P4)**. The trust lane (T1-T3) and B03-P3 need only J0 and can run in parallel with the engine lane. They are file-disjoint from it except for `composition/jini-publish.ts`, which Phase 0 already wrote.

Rollback for any step: revert the Tovu commit (old files return, importers return), then the Jini commit. No data or wire format changes at any step, so there is no point of no return.

---

## 6. Characterization tests first

Rules: fakes of interfaces from `@jini-ai/cms/publish/testing` and core `/testing` only; no `vi.mock`; clock and ids pinned; each test names the check it guards.

**Mutation proof (P0.1, required before any trust or peer file moves).** For each row K1-K9 and D1-D13: delete or invert the named check in a scratch commit, run the named test, record red, restore. Deliver a table `check -> test -> red output line`. A check whose removal leaves the suite green gets a new test first. This is the only evidence that satisfies "fails if the check is removed"; reading the tests does not.

New tests this design adds (the rest are the existing files named in section 3):

| Id | Asserts | How it fails on the named risk |
|---|---|---|
| T-K1/K2 | pinned installation id and public key for a fixed fake keyring; different target origin -> different key | a changed purpose, length or derivation input changes the pinned bytes |
| T-K3 | byte-exact challenge message | field order, separator or domain tag drift |
| T-K6a | read paths call `openCredential` 0 times | a summary path that starts decrypting |
| T-K6b | failed seal writes nothing | a fallback that stores the key unsealed |
| T-K7a | error text goes through `redact` | a constructor that stops calling the port |
| T-K7b | Tovu's publish HTTP policy has no redirect hop | a policy change that would forward the bearer header |
| T-K9a/b | hash mismatch and out-of-selection blob both refuse before any write | storing unverified bytes; serving blobs the plan did not select |
| T-D4 | wrong MAC refused even when every claim is valid, and the payload parser is not reached (a spy on a `parse` seam is **not** used: assert by passing a payload that would throw on parse and expecting the MAC reason) | parse-before-verify reordering |
| T-D6 | pinned trusted-route set | a route silently added to what a session may call |
| T-D8 | registry stamp overrides a caller-supplied `publishType` | spread order reversed |
| T-D12 | each policy config field is read | an injected policy whose field is ignored after the port conversion |
| T-FROZEN | section 3.3 literals | a neutrality rename |
| T-HTTP | `toJiniHttpClient` forwards `request` and `redirect` unchanged | an adapter that drops the option |
| T-REG | two registries do not see each other's contributors; `list()` is read fresh after a late `register` | reintroduced module state; a snapshot taken at build time |
| T-PORTS | `jini-publish.ts` bindings `satisfies` their port types (compile-time) and the policy/trust values equal the pre-move constants (`toBe`) | a binding that compiles but passes a different value |

Test-count guard (honest-testing rule): before Phase 0 the two features have 73 top-level test files and about 875 `it`/`test` cases (551 + 324, by `grep`). Every commit reports files and cases before/after per repo; the sum across both repos never drops.

---

## 7. Risks and guards

| Risk | Guard |
|---|---|
| A neutrality rename changes a signed, derived or stored value | section 3.3 table; T-FROZEN; T-K1/K2/K3 pinned bytes |
| A port conversion compiles but the host passes a different value | T-PORTS `toBe` checks; T-D12 per-field tests |
| Lifting closures in `applyOneRow` turns a late read into an eager one | AST check of each closure's free variables before coding; existing `apply-loop.test.ts`; one commit per function |
| The registry instance changes "read fresh at every use" | T-REG; `deps.types.list()` is called inside `buildPublishContentCatalog`, never cached |
| The 144 + 85 test call-site codemod hides a deleted test | test-count guard per commit |
| The generic `TPorts` leaks Tovu shapes back into Jini | `pnpm guard` product-string and boundary checks; `registry/types.ts` imports only core |
| `peers` tests in Jini would need platform's real vault | Jini tests use `fake-peer-store`; Tovu keeps the vault adapter tests (hosts may import anything, B6) |
| Blob transfer buffers whole blobs as base64 inside JSON (`peer-transport.ts:864`) | unchanged by this move (no silent behaviour change). Bounds that exist today and must be kept: pull cap 2,000 blobs (`:707`), bundle body cap 20 MB (`bundle-staging.ts:87`), per-request timeout (`:202`), client `maxResponseBytes` policy (host). Listed as follow-up F3 |
| Hot composition files (`deps.ts`, `app.ts`) are edited by other lanes | this design adds one file; the coordinator adds the use lines; importer edits are text-guarded |
| Path-keyed debt silently follows nothing | `size-debt.json`/`src-complexity-debt.json` entries are deleted by the P0.6 split commits; Jini gets **no** new debt entries (its gate is `max-lines` 500, function 80 error / 50 warn, complexity 10: `scripts/check-size.mjs:15`, `check-complexity.mjs:16`) |

Streaming (lesson 12): there is no streaming in this code. Commitment, production, backpressure and cleanup do not apply; the single related cost is the buffering row above.

---

## 8. Interaction with untangle lanes, waves and the size designs

| Lane / design | Interaction | Rule |
|---|---|---|
| C3 `core/contracts/events` | landed in wave B: `type-registry.ts:29` already imports `AuthorizeFn`, `ChangeSetRepoPort`, `OutboxPort` from core | none |
| C5 `core/contracts/vault`, HTTP port | landed: `peers.ts:4` uses core's vault contract; `HttpClientPort` is in `core/primitives/http.ts` | section 2.1, 2.2 |
| C4 server route vocabulary | publish routes stay Express in Tovu until C4/C11b convert them | this design does not touch route bodies |
| **R-BARRELS (wave C)** | repoints `#src/features/webhooks/index` (`KeyringPort`, `SecretSealerPort`, `SealedSecret`), `#src/platform/http/index`, `contracts/core/gated-mutations/gateway`, `@tovu/publish-content-ui` in every in-scope file | **prerequisite of Phase 0**: run R-BARRELS first, then re-take line numbers. If it has not run, P0.7 must not also repoint those imports (one change type per commit) |
| Q8 / host preset (`server`) | `peer-vault-store.ts`, `provisioning.node-io.ts`, `publish-trust-revocations.ts` are "platform bound to a domain port" adapters | stay in Tovu now; OD-4 |
| Q5 tests | Jini tests import only cms, core, protocol and `/testing` entries; cross-package behaviour tests stay in Tovu | section 6 |
| Size design 01 (`composition/deps.ts`), 02 (`composition/app.ts`) | both files import in-scope modules (`app.ts:94-100`, `deps.ts:2731-2942`) | whichever lands second re-takes its text guards; this design's only edits there are import lines and the coordinator's use lines |
| Size designs 03-10 | no file overlap found (`rg publish-content` over the design list: none of 03-10 name a scope file) | none |
| `L5-injected-edge` gate | new cms files import only cms, core, protocol | `scripts/injection-debt.json` gains no entry |

---

## 9. Estimate (tokens)

| Step | Sonnet | Opus |
|---|---|---|
| P0.1-P0.2 trust tests + mutation proof | 160k | 30k (review of the proof table) |
| P0.3 generic types | 60k | 40k (draft) |
| P0.4 registry instance + codemod | 170k | 20k |
| P0.5 signature conversions (5 families) | 220k | 0 |
| P0.6 function splits (8 functions) | 260k | 110k (drafts for `applyReport`, `applyOneRow`, import hooks, repo handler) |
| P0.7 ports in place + `jini-publish.ts` | 200k | 60k (`PeerCredentialStorePort`, `TrustNames`, policy configs) |
| P0.8 file splits in place | 150k | 0 |
| J0 + B01 | 150k | 15k |
| F1 + F2 framework | 330k | 40k |
| B02 S1-S5 | 380k | 40k |
| T1-T3 trust | 240k | 40k (security review) |
| B03 P3, P1, P2, P4 | 300k | 30k |
| **Total** | **about 2.6M** | **about 0.43M** |

The sheets' own estimates (B01 140k; B02 490k + 90k Opus; B03 350k) assumed the framework and trust had landed and that splits happened during the move. Doing the shape changes first in Tovu is more commits but keeps every move a pure move.

---

## 10. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| OD-1 | The contributor registry is module-level state today. Make it an instance the host owns (229 test call sites change by codemod), or keep module state in Jini as a recorded exception to practice 1? | Instance. It is the only way two hosts, or two tests, do not share state |
| OD-2 | Trust code lives in `cms/publish/trust`, or in its own package? | In cms. It has one consumer (publish) and imports only core; a new package is an abstraction with one user. Revisit if a second feature needs install-to-install trust |
| OD-3 | Entry points. cms has 51 `index.ts` entries today, but practice 5 says no barrels | One entry file per slice with **explicit named exports** (no `export *`), eight entries: `./publish/{transfer,registry,planning,files,backstop,engine,peers,trust}` plus `/node` and `./publish/testing`. The alternative, one exports-map key per leaf file (about 60 keys), follows practice 5 literally. Needs a ruling because it sets the import specifier for about 300 Tovu import lines |
| OD-4 | Where do the three platform-binding adapters go (`peer-vault-store`, `provisioning.node-io`, SQL revocations)? | Tovu now; host preset `@jini-ai/server` after Q8's lane exists |
| OD-5 | Key-derivation purpose strings contain no product name. May Jini ship them as defaults, or must every host pass them? | Host passes them (no default). A default hides a value that must never change |
| OD-6 | Rename the failure code `"not-a-tovu-site"`? | Keep the literal in the type as a host-supplied code set is over-engineering; rename to `"not-a-peer-site"` in P0.5 with its consumers, since it is not stored or sent on the wire (**verify first**: section 11, U6) |
| OD-7 | `KeyringPort` is declared twice in Jini (core and integrations) | Separate Jini lane: integrations imports core's. Not part of this move |
| OD-8 | Run order against R-BARRELS | R-BARRELS first (section 8) |

---

## 11. What I could not verify

- **U1.** No test was run and no typecheck was run (no `node_modules` in either checkout). All "existing test covers it" statements come from file names and sizes.
- **U2.** I read `type-registry.ts`, `destination-credential.ts`, `keys.ts`, `session.ts`, `challenge.ts`, `revocations.ts` (admission part) and grep extracts of the rest. I did not read `apply-loop.ts`, `peers.ts:200-636`, `peer-transport.ts:300-880`, `planner.ts`, `provisioning.ts`, `grant.ts`, `handshake-client.ts`, `connect.ts` or `publish-trust-auth.ts` line by line. The port shapes in 4.3 for peers and the engine are drafts.
- **U3.** How a Tovu commit resolves an unpublished Jini commit. Tovu's root `package.json` pins `@jini-ai/cms` as `^0.7.0`; the Jini repo guide says hosts use `file:../Jini/packages/*`. I did not find which applies on `integ/wave-b-r2`.
- **U4.** Function sizes are my AST count (non-blank, non-comment lines). Jini's ESLint `max-lines-per-function` may count differently; `callPeer` and `pushBundleToPeer` are the cases to re-check.
- **U5.** Whether `extractEntryRefs` (Tovu `contracts/core/entry-refs/extractor`) has a Jini owner. `content-references.ts` cannot move in S4 without it; if absent it stays in Tovu and S4 moves `export-bundle.ts` alone.
- **U6.** Whether `"not-a-tovu-site"` is persisted or sent to the admin UI as a code.
- **U7.** Whether cross-domain leaf imports inside cms (`publish` -> `media/blob-key.ts`, `core/commands/*`, `widgets/markers`) pass `check-subpath-isolation.ts`, and whether a universal publish entry may import from the `media` domain, whose `./media` entry is marked `node`.
- **U8.** The count of `check-architecture.baseline.json` edges naming scope files (I saw the first 8 of the output).
- **U9.** `ADS-memory/.../untangle/LANES-files.tsv` and `EDGES-sites.tsv` contain no publish rows (0 matches) because they scan Jini only; I did not check wave C's Tovu-side lane sheets beyond R-BARRELS.

Follow-ups outside this design: F1 consolidate the six Tovu HTTP adapters onto `toJiniHttpClient`; F2 merge the two `KeyringPort` declarations; F3 streamed blob transfer with explicit backpressure and cleanup.

---

## 12. Owner practices check

| # | Practice | Status | Note |
|---|---|---|---|
| 1 | DI through typed ports; no global or singleton | Met after P0.4 and P0.7 | Exception recorded: `*.node.ts` leaves call `node:crypto` directly (a platform built-in, one implementation). Key material still arrives only through `KeyringPort` |
| 2 | `(required, optional = {})`; never `?: Record<string, never>` | Met after P0.5 | 23 exported functions converted; 6 `Record<string, never>` sites removed. Conflict flagged: core's own `KeyringPort.activeKey(_required: Record<string, never>)` |
| 3 | Functions <= 50, files <= 500, complexity <= 10 | Met after P0.6 and P0.8 | 8 functions and 7 files split; measured inside each proposed file (4.1). U4 applies |
| 4 | Feature slicing by responsibility | Met | eight slices, dependency direction in 4.2 |
| 5 | No barrels, forwarders or aliases | **Open: OD-3** | No forwarders anywhere: every step deletes the old path and repoints callers. The two re-export lines in `backstop-ports.ts` and `backstop-audit.ts`, and `type-registry.ts:1`, are deleted |
| 6 | Why-comments move with the code | Met | header comments move; plan/task references are reworded neutrally, the reasoning stays |
| 7 | Generic -> Jini, one-site -> Tovu; cms imports only itself + core + protocol; no server framework in Jini | Met | Express middleware and routes stay in Tovu; route list, table lists, env names, vault scope stay in Tovu |
| 8 | Tests use fakes of interfaces via `/testing`; no real implementations of other packages; characterization first; mutate | Met by design | section 6. Conflict flagged: today's peer tests use platform's real vault; they are rewritten for Jini and the originals stay in Tovu as adapter tests |
| 9 | Errors never swallowed or generic; redacted | Met, one recorded exception | `verifyPublishSignature` returns `false` on a thrown crypto error (`keys.ts:202`). That is a deliberate fail-closed verification result, guarded by `keys-fail-closed-guard.unit.test.ts`; keep it and keep the comment. `console.warn` sites become the `report` port |
| 10 | No new `eslint-disable`/`@ts-ignore`; no silent behaviour change | Met | the `as never` casts on `workspaceId` are removed, not replaced |
| 11 | Smallest change; reuse first; no abstraction with one user; reversible | Met with two noted choices | no crypto port (one implementation); `PeerCredentialStorePort` has two implementations (vault, in-memory) used by production composition. Reuse checked: `registry/src/trust.ts` (registry signature verification over certificates) is a different mechanism and is not reused; `core/src/records.ts:170` `canonicalJson` is a candidate owner for `content-hash.ts`'s canonical form, but the hash output is persisted in baselines, so it is **not** merged in this move (a different key order or omission rule would change every stored hash) |
| 12 | Memory / IO cost on hot paths | Unchanged, recorded | section 7 buffering row; registry `list()` is O(types) per catalog build as today |
