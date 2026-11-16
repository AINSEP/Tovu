# Publish engine move: Tovu `publish-content` + `publish-trust` -> `@jini-ai/cms/publish` (hard item #3)

Design only. Written 2026-11-16 against Tovu `integ/wave-b-r2` @ `65302ee5` and Jini `integ/wave-b-r2` @ `02edbb68`.
Inputs re-verified: sheets `move-B01-publish-transfer`, `split-B02-publish-apply-engine`, `split-B03-publish-peers` (branch `plan/audit2-sheets-b`, written against `integ/wave-b` `10378809` / `ab8711ed`).
Paths below are relative to `apps/website/src/` in Tovu and `packages/` in Jini unless they start with a repo name.

**Revision 2 (2026-11-16), after the Codex judgment in `CODEX-JUDGE.md`.** Re-verified against Tovu `refactor/terra` @ `80b00f5b` (wave B included; `git diff --stat 65302ee5 80b00f5b` over both features, the trust middleware and `composition/` is empty, so every line number of the first pass still holds) and Jini `refactor/terra` @ `02edbb68`. All 12 findings were checked in code and all 12 are accepted: section 13. Sections 2.4, 3, 4, 5, 6, 9, 10, 11 and 12 changed. Where an unrevised sentence disagrees with section 13, section 13 wins.

## 0. Summary

1. **The three sheets cover 5,428 lines in 26 files, not about 4k.** They also depend on two things that have not landed: the 12-file publish *framework* (3,224 lines, sheet "row 140") and the 10-file *trust* feature (2,662 lines, audit row A01). Jini has no `cms/src/publish` at all today. The real move is **48 files, 11,314 production lines**, plus 73 test files (about 875 test cases).
2. **Only B01 and two B03 files can move today.** Every B02 slice and the peer transport import `type-registry.ts` or `planner.ts`, which are still Tovu files. `type-registry.ts` is the blocker: it imports port types from nine Tovu features and holds a module-level mutable registry.
3. **Order with no broken middle state (revision 2):** Phase 0 (Tovu-only preparation) -> B01 -> F1 -> F2 -> B02 (S1, S2, S4, S3, S5) -> B03 (P0 `peer-url`, P3, P1, P2, P4), with trust (T1-T3) prepared beside the engine. Tovu takes Jini code only from a published cms version, so the moves ship as four release trains. Section 5 gives the graph.
4. **Four findings the sheets did not have** (all verified in code, section 2):
   - Tovu's HTTP port is `send(request, options)`; Jini core's is `send({ request }, { redirect })`. They are not call-compatible. Six ad-hoc adapters already exist in Tovu and two of them drop the `redirect` option.
   - Jini has two `KeyringPort` declarations with different `activeKey` arity. Publish code uses the one in `integrations`; a cms file may only use the one in `core`.
   - Several strings that look like product branding are **signed, derived or stored values** (`tovu-publish-challenge-v1`, three key-derivation purposes, the vault scope `ownerKey: "tovu"`). Renaming any of them for neutrality breaks every existing connection or sealed credential. They become host-supplied values and keep their bytes.
   - `peers.ts` now value-imports `@jini-ai/platform/secrets/credential-sets`. The peer domain cannot move until that is behind a port.
5. **Estimate (revision 2):** about 3.7M Sonnet tokens and 0.49M Opus tokens: 10 preparation steps in Tovu, then 16 move steps delivered in four cms release trains (sections 5 and 9). The first pass said 2.6M / 0.43M.
6. **I ran no tests.** Neither checkout has `node_modules`. Every count comes from the TypeScript AST or `grep` on the two checkouts. Section 11 lists what I could not verify. Revision 2 also ran none; its numbers come from two regex scripts (U10).

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

Decision: the Jini peer domain declares one consumer-owned port, `PeerStorePort` (section 4.3). The vault-backed implementation, its scope constant and the context check stay in Tovu (`features/publish-content/peer-vault-store.ts`) because they bind platform to a cms port. Q8 says such adapters belong in the host preset later; that is OD-4.

### 2.4 Signatures that must change shape (census redone in revision 2)

Owner practice 2 requires `(required, optional = {})`. The first pass listed 23 functions; that was a hand list and it was incomplete (judge finding 11). A regex census of every `export function` in the 44 in-scope production files gives **128 exported functions, 87 not conforming**:

| Class | Count | Meaning | Examples (file:line) |
|---|---|---|---|
| two required objects `(deps, input)` | 32 | second argument is required, so there is no options boundary | `callPeer`, `planImport` (`planner.ts:491`), `createPublishContentPeer` (`peers.ts:250`), `verifyPublishSession`, `stageBundle`, `connectAndRecordDestination` |
| no options boundary | 35 | one required object or one positional value, no `optional = {}` | `toPeerSummary` (`peers.ts:191`), `selectConnectedDestination` (`peers.ts:503`), `entityDisplayLabel`, `packedEntityLabel` (`planner.ts:239`, `:254`), `buildChallengeMessage` (`challenge.ts:83`), `sha256Hex`, `registerPublishContentContributor` |
| `Record<string, never>` options | 20 | the banned empty-options type | all of `backstop-policy.ts`, `backstop-service.ts`, both raw contributors, `pushBundleToPeer`, `pullBlobsFromPeer`, `verifyPublishSignature`, `backstopGrantAllows` |

Per-file output is reproducible with `sig.cjs` (regex; the executor must regenerate it with the TypeScript AST once dependencies are installed, and must add exported arrow constants and class methods, which the regex does not see). In addition about **39 port-interface methods** are positional (`insert(record)`, `findById(input)`, `send(...)`-style members in `backstop-ports.ts` 9, `type-registry.ts` 5, `peer-transport.ts` 4, `bundle-staging.ts` 3, `backstop-audit.ts` 3, `provisioning.ts` 3 and others). They are part of the contract that moves, so they are converted too (P0.5b), together with every adapter and fake that implements them. Whether port methods are in scope is OD-12.

Each conversion is a behaviour-free Tovu commit **before** the move, one file family per commit, and the family's callers and tests change in the same commit.

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
| K4 | Handshake client. **Required** response fields, each refused with the "not a peer site" failure when missing or not a non-empty string: identity `installationId`, `workspaceId` (`handshake-client.ts` `fetchDestinationIdentity`); challenge `nonce`, `targetInstallationId`; session `token` (`openPublishSession`). **Optional fields with a fallback, kept exactly:** identity `origin` -> the base URL; session `expiresAt` -> `""`; session `capabilities` -> the requested list when not an array, non-string members dropped (`sessionFrom`). Timeout `HANDSHAKE_TIMEOUT_MS` | `handshake-client.ts:236`, `:264`, `:54` | Jini `publish/trust/handshake-client.node.ts` | `HttpClientPort` (core), `KeyringPort`; route base and product name are host values | T-K4a: each of the five required fields missing in turn -> typed refusal. T-K4b: each of the three optional fields missing -> the pinned fallback value (this is today's contract, pinned at `handshake-client.unit.test.ts:164-166`, `:242-252`). Making an optional field required is a behaviour change and is **not** part of this move |
| K5 | Destination identity re-check: the workspace the site reports now must equal the one stored at connect time | `destination-credential.ts:87` | Jini `publish/peers/destination-credential.ts` | none | T-K5: `openSession` fake returns a different workspace -> `PublishTrustHandshakeError` with `failure: "refused"`. Existing: `destination-credential.test.ts` |
| K6 | Sealed API key: exactly one function decrypts (`resolvePeerCredential`); fail closed when sealing is unavailable; read paths never touch sealer or keyring; a metadata update keeps the stored envelope without opening it; summaries never carry sealed fields; masked hint only | `peers.ts:378`, `:63`, `:132-141`, `:147`, `:191`, `:293-306`, `:420-425`, `:617-630` | decision and single call site: Jini `publish/peers/credentials.ts`. Sealing, envelope, revision checks, AAD context check (`peers.ts:168`, `:177`) and scope constant: Tovu `peer-vault-store.ts` (also for the in-memory binding) | `PeerStorePort` (section 4.3) | T-K6a (Jini): store fake counts `openCredential` calls -> list/get/summary/update-metadata paths make 0 calls. T-K6b (Jini): `createWithCredential` rejects -> typed `...SecretStoreUnconfiguredError`, nothing else written. T-K6c (Tovu adapter): a record of another kind or owner key -> `VaultError("context")`. T-K6d (Tovu adapter, exists: `peers.test.ts:228-244`, `:331-341`): rename keeps the ciphertext byte-identical and works with a sealer and keyring that throw. T-K6e (Tovu adapter): `updateMetadata` and `remove` with a stale revision -> `VaultError("conflict")` |
| K7 | Credential attached as a bearer header; error messages redacted before they are stored on the error; egress refusal turned into an owner sentence; no redirect hop | `peer-transport.ts:255`, `:69`, `:99-114`, `:46-47` | header + error class: Jini `publish/peers/transport-call.ts`. Redaction, egress sentence, client policy: Tovu | `redact`, `describeEgressRefusal`, `HttpClientPort` | T-K7a: `redact` fake replaces a marker; an error built from text containing the marker carries the replaced text (fails if the constructor stops calling the port). T-K7b (Tovu): the publish client's policy has `maxRedirects: 0`. Existing: `peer-transport.l061.test.ts` |
| K8 | Peer base URL normalisation and refusals | `peer-url.ts:87` | Jini `publish/peers/peer-url.ts` | none | Existing `peer-url.test.ts` (table of refusals); moves unchanged |
| K9 | Blob integrity: pulled bytes must hash to the requested sha256; a peer may only ask for blobs in the selected set; pull cap 2,000 | `peer-transport.ts:873`, `:826`, `:707` | Jini `publish/peers/transport-blobs.ts` | `BlobHashPort`? no: `bytesMatchSha256` stays a direct import of the sibling node leaf | T-K9a: peer returns bytes that do not match -> `PEER_RESPONSE_INVALID`, sink `putIfAbsent` not called. T-K9b: peer lists a hash outside the selection -> refusal, no upload. Existing: `peer-transport-blob-pull.test.ts` |

### 3.2 Destination side (the site that accepts a publish)

| # | Decision | Today | Owner after | Port | Test that fails if removed |
|---|---|---|---|---|---|
| D1 | Nonce issued with TTL, consumed exactly once before any other check | `challenge.ts:107`, `:259` (`takeOnce`), `:40` | Jini `publish/trust/challenge.ts`. Nonce **state** owner: the store the host passes (today in-memory, `composition/modules/core.ts:48`) | `PublishChallengeStorePort` (exists, `challenge.ts:57`) | T-D1: verify the same response twice -> second is refused; expired nonce refused with a pinned clock. Existing: `challenge.unit.test.ts` |
| D2 | Grant active, source matches, requested capabilities within the grant, signature verifies against the key of the claimed generation | `challenge.ts` `grantRefusal` (`:174`), `capabilityRefusal` (`:192`), `signatureRefusal` (`:212`) | Jini `publish/trust/challenge.ts` | none | T-D2: four cases, one per refusal, each with every other input valid; plus one where the signature is over a different capability list. Existing: `challenge.unit.test.ts` |
| D3 | Admission order: revocations unreadable -> refuse; revoked; site configured; grant found; grant active; key not superseded | `revocations.ts:213-234` | Jini `publish/trust/revocations.ts` | `PublishTrustRevocationPort` (exists, `:72`); SQL store stays Tovu | T-D3: `revocations: null` with a valid grant -> `revocations-unreadable` (fails if the null check is dropped); one case per refusal. Existing: `revocations.test.ts` |
| D4 | Session token: MAC verified **before** the payload is parsed; expiry; audience; workspace. The MAC compare is constant time (`timingSafeEqual` after a length guard, `session.ts:129-133`) | `session.ts:82`, `:190`, `macMatches`, `claimRefusal` | Jini `publish/trust/session.node.ts`; purpose `publish-trust-session-key` from `TrustNames` | `KeyringPort` | T-D4a: valid payload with a wrong MAC -> refused; valid MAC with each claim wrong in turn -> refused with that reason; token minted under another workspace's key -> refused. T-D4b: wrong MAC with a payload that would throw on parse -> the MAC reason (proves order). **Constant time is not provable by a result test** (judge finding 9): it is an implementation constraint with its own guard T-D4c, a source-reading test that fails unless `macMatches` calls `timingSafeEqual` on two equal-length buffers and the file contains no `===`/`!==` on a MAC string; plus a named line in the security review checklist of T2 |
| D5 | Grant document parsing and bounds (grant count, document bytes, lifetime) | `grant.ts:210`, `provisioning.ts:49`, `:54`, `:63` | Jini `publish/trust/{grant,provisioning}.ts` | `ProvisioningFileIo` (exists, `provisioning.ts:420`); Node file IO stays in Tovu until OD-4 | Existing: `grant-parse.unit.test.ts`, `provisioning.test.ts` |
| D6 | Which routes a publishing session may call | `grant.ts:57` (`PUBLISH_TRUST_ROUTES`), `:306` (`isPublishTrustRoute`) | matcher: Jini. **Route list: Tovu** (`features/publish-trust/trusted-routes.ts`), passed as `routes` | `routes: readonly TrustedRoute[]` value | T-D6 (Tovu): the list equals the pinned 2026-11-16 set (count and each method+path); a new route cannot join without changing the test |
| D7 | Request middleware and host route gates | `server/inbound/admin-http/publish-trust-auth.ts`, routes | **Tovu** (Express). Unchanged except import lines | calls Jini `verifyPublishSession`, `admitPublish`, `isTrustedRoute` | expanded predicate by predicate in section 3.4 |
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

### 3.4 Host gates, predicate by predicate (added in revision 2)

The first pass gave the middleware one row and "existing route tests". That does not prove each check (judge finding 9, lesson 13). Every predicate below stays in Tovu; the move changes only import lines in these files. Each gets its own mutation: remove or invert that one predicate, run the named file, record red. A predicate with no red test gets a new test in the named file **before any trust file moves** (P0.1).

| # | Predicate | Where | Candidate test file (the mutation proof decides) |
|---|---|---|---|
| H1 | No bearer token, no site key, or a token that does not verify: no publishing context is set and the request falls through to ordinary authentication; it is never accepted here | `requirePublishTrust` (`publish-trust-auth.ts:221`) | `server/__tests__/routes/publish-trust-gate.test.ts`, `admin-http/__tests__/publish-trust-keyless.unit.test.ts` |
| H2 | A verified token on a route outside the trusted list -> 401 | same, after verification | `publish-trust-gate.test.ts` |
| H3 | Revocations or grants cannot be read -> 401 (fail closed) | same, `try` around `deps.revocations()`/`deps.grants()` | `publish-trust-revocation-gate.test.ts` |
| H4 | Admission refused (`admitPublish`, D3) -> 401 | same | `publish-trust-revocation-gate.test.ts` |
| H5 | The public key is the one accepted for the claimed generation | `acceptedKeyFor` (`:191`) | `publish-trust-gate.test.ts` |
| H6 | Token capabilities are intersected again with the grant; an empty result -> 401; the context carries only the intersection | `:308-315` | `publish-trust-gate.test.ts`: a token that claims a capability the grant lacks must not get it |
| H7 | Principal rewrite: system principal with the `pub:` id, `authCredentialKind = "publish_key"` | end of the middleware | `publish-trust-shared-permission.test.ts` |
| H8 | `publishTrustAuthorizeFor`: a permission outside the context's capabilities is denied | `:151` | `publish-trust-shared-permission.test.ts` |
| H9 | Content authorize, three independent conditions: the permission is one the publish type publishes with; the type is registered; and `publish_content.apply` in capabilities **and** type in the grant's entity types **and** (not a raw type **or** the raw grant allows it) | `withPublishTrustContentAuthorize` (`:400`, conjunction at `:417-429`) | `publish-trust-content-authorize.test.ts`, `publish-trust-apply-coverage.test.ts`: one case per conjunct with the other two true |
| H10 | Bundle staging refuses a raw entity type without the raw grant (also when there is no publishing context) and any entity type outside the grant | `routes/publish-content/bundle-create.ts:138-163` | `bundle-create.routes.pins.test.ts`, `backstop.routes.pins.test.ts` |
| H11 | Raw values are disclosed only when `publish.backstop` is allowed for every type in the report | `routes/publish-content/import.ts:122-143` | `backstop-import-ui.routes.test.ts`, `import.routes.pins.test.ts` |
| H12 | The handshake route's own checks (public route) | `server/inbound/public-http/routes/publish-trust/handshake.ts` | `handshake-keyless.unit.test.ts` plus the route's pins; not read line by line (U2) |

H9 and H11 read the per-type permission map from the registry. After P0.4 they read it from the registry instance of the same composition root (section 4.3); T-REG-ROOT proves a second root's types do not leak into the map.

### 3.5 Authorization compensation and blob keys (added in revision 2)

| # | Decision | Today | Owner after | Port | Test that fails if removed |
|---|---|---|---|---|---|
| C1 | Connect: when recording the connection fails after the grant was written, the grant is reversed. If the reversal also fails the failure is dropped today | `connect-destination.ts:108-117` | Jini `publish/peers/connect-destination.ts` | `reverseGrant` (exists), `reportCompensationFailure` (new, section 4.3) | T-C1a: record fails, reversal succeeds -> primary error thrown, reversal called once, reporter not called. T-C1b: record fails, reversal fails -> the **primary** error is thrown and the reporter receives `{ operation: "connect", step: "reverse-grant" }` with both errors |
| C2 | Disconnect: the row is removed, then the grant reversed; when reversal fails the row is restored. If the restore also fails the failure is dropped today | `connect-destination.ts:150-166` | same | same | T-C2a/b: same two cases with `step: "restore-destination"`; plus T-C2c: after a failed restore the store fake holds no row and the reporter payload says so (`state: "destination-row-missing"`), so the split state is recorded, not lost |
| K10 | Blob storage key is derived from workspace id and sha256 (tenant scoping of blobs) | cms `media/blob-key.ts:25`, called at `gated-hooks.ts:263`, `pull.ts:61`, `raw-file-contributor.ts:37` | function stays in cms `media`; the publish domain may not import another isolation domain at run time, so it arrives as the input `blobKeyFor` | `blobKeyFor: (required: { workspaceId; sha256 }) => string` | T-K10 (Tovu): the binding returns exactly `computeBlobStorageKey`'s value for a fixed input and two workspaces give two keys |

The reporter payload carries the operation, the step, the resulting state and the two errors' class names and redacted messages. It carries no grant document, token or credential: redaction is not disclosure permission (lesson 24), so the payload type has no free-form field.

---

## 4. Target shape

### 4.1 Folder tree (Jini `packages/cms/src/publish/`), revision 2

There are **no entry files** (no `index.ts`, no re-export module). Every export-map key points at the implementation file that owns the behaviour, as cms already does for `./media/slug` -> `dist/media/slug.js`. A key exists only for a leaf a host imports; an internal leaf has none. A key is added in the same Jini commit as its file (lesson 25).

Runtime label = the leaf's **run-time import closure**, computed from the code, not from the folder (judge finding 1). `N` = reaches `node:`; `U` = universal. Only a file that itself imports `node:` carries `.node.ts`.

```
publish/
  transfer/   U: apply-errors artifact-format packed-entity baseline-repo bundle-staging
                 file-blob-index backstop-audit backstop-ports
              N: blob-hash.node            (was blob-staging.ts: sha256Hex, bytesMatchSha256)
  registry/   U: types registry catalog precheck-reasons seed-hash
                 content-hash-version      (NEW leaf: the constant CONTENT_HASH_VERSION only)
              N: content-hash.node  repo-handler (+ split files; they call contentHash)
  planning/   U: planner plan-rows run-repo report-contract report-labels ui-contract export-bundle
  files/      U: tree-policy tree-paths tree-secrets
  backstop/   U: policy service
              N: preview.node  raw-row (+ parts; calls contentHash)  raw-file.node (+ parts)
  engine/     U: import-hooks import-steps execute-import
              N: apply-port apply-report apply-row apply-retire apply-failure idempotency
  peers/      U: peer-url records credentials peer-service connected-destination connect-destination
                 transport-errors transport-call transport-bundle
              N: transport-blobs (bytesMatchSha256)  pull  destination-credential (handshake client)
                 composite-blob-source.node
  trust/      U: grant routes revocations provisioning provisioning-status names
              N: keys.node session.node challenge.node handshake-client.node
  testing/    fakes of this domain's ports; each file lands with the first Jini test that uses it
```

Why `planner`, `export-bundle`, `report-labels` and `import-hooks` can be universal: today they reach `node:crypto` only because `planner.ts:1` and `export-bundle.ts:1` value-import the constant `CONTENT_HASH_VERSION` from `content-hash.ts`, whose line 1 imports `node:crypto`. P0.7e moves the constant to its own leaf. If the checker still finds a `node:` edge in a leaf marked `U`, the leaf is **relabelled `N`**; it is never patched to look universal. The checker (`scripts/check-subpath-isolation.ts`) is the authority, the table is the expectation.

**Isolation domains.** `cms/package.json` gains `jini.isolation.domains.publish = ["src/publish"]`. The checker reports any run-time import from one named domain into another, except `core` (`check-subpath-isolation.ts:279-287`; it skips type-only imports at `:310`). cms has no such crossing today. The publish code has four, all resolved before the move:

| Crossing today | Resolution |
|---|---|
| `media-references.ts:1`, `content-references.ts:1` -> `@jini-ai/cms/widgets/markers` | **Both files stay in Tovu.** No moved file imports them (checked by grep: their only in-scope importer is each other). `content-references.ts` also needs Tovu's `extractEntryRefs`. A later lane may give them a home in the cms `widgets` domain; that is not part of this move |
| `gated-hooks.ts:3`, `pull.ts:1`, `raw-file-contributor.ts:3` -> `computeBlobStorageKey` (`@jini-ai/cms/media`) | input `blobKeyFor` (K10), bound in Tovu |
| `raw-file-contributor.ts:3` -> `isDocumentOnlyBlob` (`@jini-ai/cms/media`) | input `isDocumentOnlyBlob`, bound in Tovu |
| type imports (`BlobStorePort` from media, `executeCommand`/`ForbiddenError` from `cms/core`) | type-only imports are written `import type` and are not run-time edges; `cms/core` is the exempt shared domain |

Wildcard export keys are not used: `jini.entries` labels are per key, so a wildcard key would have no label and the universal check would be skipped without notice.

**Compiler settings differ (lesson 22).** Jini sets `verbatimModuleSyntax` and `isolatedModules` (`tsconfig.base.json:16-17`); Tovu's `tsconfig.json` does not. An import that Tovu elides because it is used only as a type is a compile error in Jini and a run-time edge for the checker. P0.9 makes every type import explicit in Tovu before any file moves.

Every proposed file is under 500 lines. The splits that make that true, measured against today's files:

| Today | Lines | Split by responsibility |
|---|---|---|
| `apply-loop.ts` | 996 | `idempotency.ts` (key functions), `apply-failure.ts` (`classifyApplyRowFailure`), `apply-retire.ts` (retire validation and write), `apply-row.ts` (existence/agreement checks, ordinary row), `apply-report.ts` (the run loop, run-row persistence), `apply-port.ts` (factory + deps types). Six files, each about 120-220 lines |
| `peer-transport.ts` | 879 | `transport-errors.ts` (error class, reason tables), `transport-call.ts` (`callPeer`, request payload, refusal classification), `transport-bundle.ts` (push, confirm, execute, pull bundle), `transport-blobs.ts` (push/pull blobs, verified fetch) |
| `type-registry.ts` | 683 | `registry/types.ts`, `registry/registry.ts`, `registry/catalog.ts`; Tovu keeps `tovu-publish-ports.ts` |
| `peers.ts` | 636 | `records.ts` (errors, record/summary types, validation, `PeerStorePort`), `credentials.ts` (`resolvePeerCredential`), `peer-service.ts` (create/update/list/get/delete), `connected-destination.ts`; Tovu keeps `peer-vault-store.ts` (vault adapter, also over the in-memory vault repo) |
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
cms/core only at run time (cms/media and cms/widgets are other isolation domains: types only, functions injected)
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
  readonly outbox?: OutboxPort;
  readonly changeSets?: ChangeSetRepoPort; readonly authorize?: AuthorizeFn;
  readonly backstop?: BackstopPorts;
}
export interface PublishTypeSource<TPorts> { list(): readonly PublishContentContributor<TPorts>[] }

// publish/registry/registry.ts - no module-level state
export function createPublishTypeRegistry<TPorts>(
  required: Record<never, never> = {}, optional: { initial?: readonly PublishContentContributor<TPorts>[] } = {},
): PublishTypeRegistry<TPorts>;   // { register({ contributor }), list() }  replace-by-key, order kept
export function buildPublishContentCatalog<TPorts>(required: { deps: PublishContentDeps<TPorts> }, optional?: {}): PublishContentCatalog<TPorts>;
```
**Registry ownership (judge finding 7).** The registry is created **once per composition root, inside the root**, never at module level: `createApp()` and the tool-catalog boot path each call `createPublishTypeRegistry()` and pass the instance to `installFirstPartyPublishContentTypes({ registry })`. Both callers exist today: `composition/modules/publish-content.ts:49` and `composition/tool-catalog-manifest.ts:508`. The instance then travels as a dependency to every reader:

| Reader today | Line | After |
|---|---|---|
| `installFirstPartyPublishContentTypes()` (17 `register` calls) | `publish-content-manifest.ts:52-69` | takes `{ registry }` |
| `listPublishContentContributors()` | `composition/publish-backstop-ports.ts:17` | `registry.list()` from its deps |
| same | `admin-http/routes/publish-content/destination.ts:209` | `deps.publishTypes.list()` |
| same | `features/publish-content/tool-registrations.ts:166`, `:298` | `deps.publishTypes.list()` |
| `registeredPublishTypePermissions(deps)` | `routes/publish-content/import.ts:103`, `:124` | reads `deps.types` |
| `buildPublishContentCatalog(deps)` | `capabilities.ts:50`, `bundle-create.ts:110`, `push-plan.ts:53`, and inside `planner`, `export-bundle`, `seed-hash`, `apply-loop` | reads `deps.types`; the two deps builders (`routes/publish-content/deps.ts`, `tool-deps.ts`) set `types` from the root's instance |

`list()` returns a frozen copy. Today `listPublishContentContributors()` hands out the live internal array behind a `readonly` type (`type-registry.ts:662-664`); a reader with a cast could change the registry (lesson 20). This is a small deliberate hardening and is listed under intended changes (OD-13).

**`beforeSaveHook`: one contract (judge finding 8).** The first pass said two different things. The decision: the generic `PublishContentDeps` has **no** `beforeSaveHook` field. The engine never reads it; one handler does. It moves into the host bag as `TovuPublishPorts.hooks.beforeSave` (type `BeforeSaveHookPort`, Tovu `features/post/post.ts:275`).

| Site | Today | After |
|---|---|---|
| declaration | `type-registry.ts:219` top-level field | `tovu-publish-ports.ts`: `readonly hooks?: { readonly beforeSave?: BeforeSaveHookPort }` |
| producer | `tool-registrations.ts:425` `beforeSaveHook: deps.pluginBeforeSaveHook` | `ports: { ...(deps.publishContentPorts ?? {}), hooks: { beforeSave: deps.pluginBeforeSaveHook } }` |
| producer | `admin-http/routes/publish-content/deps.ts:133` | same shape |
| consumer (the only one) | `features/post/publish-content.ts:389` `deps.beforeSaveHook` | `deps.ports.hooks?.beforeSave` |
| test | `__tests__/execute-pull-tool.plugin-hook-refusal.test.ts` | stays in Tovu, unchanged assertions; plus T-HOOK-ROUTE: a refusing hook passed through the **route** deps builder refuses a post apply (the tool path is already covered) |

Absent hook behaves as today (`undefined`). `stampPublishType` spreads `deps`, so `ports` and the hook survive the per-type stamp (`type-registry.ts:619-624`). This lands in P0.3 with the bag split, in one commit with both producers and the consumer.

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
// publish/peers/records.ts - what the Jini domain sees: never the sealed envelope
export interface PeerRecord {
  readonly workspaceId: string; readonly id: string; readonly label: string;
  readonly baseUrl: string; readonly remoteWorkspaceId: string;
  readonly hasCredential: boolean;          // replaces `sealed !== null` (explicit, lesson 20)
  readonly masked: string | null;           // display hint computed by the store
  readonly createdAt: string; readonly updatedAt: string;
}
export type PeerFields = Pick<PeerRecord, "workspaceId" | "id" | "label" | "baseUrl" | "remoteWorkspaceId" | "createdAt" | "updatedAt">;

// consumer-owned port; the host binds a vault. Complete operation set (judge finding 5).
export interface PeerStorePort {
  find(required: { workspaceId: string; id: string }, optional?: {}): Promise<PeerRecord | null>;
  list(required: { workspaceId: string }, optional?: {}): Promise<readonly PeerRecord[]>;      // label order, as today
  createWithCredential(required: { record: PeerFields; apiKey: string }, optional?: {}): Promise<void>;
  updateMetadata(required: { record: PeerFields }, optional?: {}): Promise<void>;
  replaceCredential(required: { record: PeerFields; apiKey: string }, optional?: {}): Promise<void>;
  saveConnected(required: { record: PeerFields }, optional?: {}): Promise<void>;
  remove(required: { workspaceId: string; id: string }, optional?: {}): Promise<void>;
  openCredential(required: { workspaceId: string; id: string }, optional?: {}): Promise<string>;
}
```

| Operation | Today (`peers.ts`) | Contract the adapter must keep | Errors |
|---|---|---|---|
| `find`, `list` | `VaultPublishContentPeerRepo.findById`/`listByWorkspace` (`:434-441`) | never open the envelope; refuse a record outside the store's own kind and owner | `VaultError("context")` |
| `createWithCredential` | `createPublishContentPeer` -> vault `put`, `expectedRevision: null` (`:250-268`) | seal or throw; never store the key unsealed; create only | duplicate label -> `PublishContentPeerDuplicateLabelError`; any `VaultError` passes through; anything else -> `...SecretStoreUnconfiguredError` (mapping at `:595-606`, kept in the Jini domain) |
| `updateMetadata` | `repo.update` -> `write({ insert: false })` (`:293-306`, `:420-425`, `:617-630`) | keep the stored envelope, hint (`last4`, `tokenLength`), `isDefault` and unknown metadata keys byte for byte; do **not** touch sealer or keyring; revision-checked; a missing row is a no-op (as today, `:421`) | duplicate label; `VaultError("conflict")` |
| `replaceCredential` | `updatePublishContentPeer` with `apiKey` (`:307-318`) | revision read inside the adapter, checked on write; metadata merged over existing | missing row -> `PublishContentPeerNotFoundError`; as create |
| `saveConnected` | `saveConnectedDestination` -> `insert`/`update` with `sealed: null` (`:514-571`) | create, or **convert** an existing row with the same id to "no credential": envelope and hint are dropped. Today a row with a saved key and the same base URL is converted this way (`:522`, `:551`); that is existing behaviour and is pinned by T-K6f, not changed | duplicate label; conflict |
| `remove` | `delete` (`:442-447`) | revision-checked; missing row is a no-op; context check first | `VaultError("conflict")`, `("context")` |
| `openCredential` | vault `get` in `resolvePeerCredential` (`:393-398`) | the only method that decrypts | any failure -> the Jini domain throws `...SecretStoreUnconfiguredError` with the original as `cause` (today the cause is discarded by a bare `catch`, `:397`) |

Revision handling, the scope constant, the context check and the envelope stay with the vault owner in Tovu, **for the in-memory binding too**: `InMemoryPublishContentPeerRepo` is the same adapter over platform's `InMemoryVaultRepo` (`peers.ts:450-452`) and stays in Tovu. Jini ships no in-memory store; its tests use `testing/fake-peer-store.ts`, a fake of this interface. The multi-row sequence in `saveConnectedDestination` (delete superseded rows, then write) is not atomic today and is not made atomic here; each row write is revision-checked (lesson 16). Other readers of `.sealed` change to `hasCredential` in the same P0.7c commit: `tool-registrations.ts:163`, `:407`, `destination-credential.ts:70`, `features/site-inspection/live-url.ts:45`.

```ts
// publish/peers/connect-destination.ts - compensation has its own reporting contract (judge finding 10)
export interface CompensationFailure {
  readonly operation: "connect" | "disconnect";
  readonly step: "reverse-grant" | "restore-destination";
  readonly state: "grant-may-remain" | "destination-row-missing";
  readonly primary: { readonly name: string; readonly message: string };        // redacted by the caller's `redact`
  readonly compensation: { readonly name: string; readonly message: string };
}
export type ReportCompensationFailure = (required: { failure: CompensationFailure }, optional?: {}) => void;
```
The primary error is still the one thrown, unchanged. The reporter is a **required** dependency of connect and disconnect, must not throw, and is bound in Tovu to the structured logger. If a reporter does throw, that error propagates: nothing is caught around it, so nothing is lost silently. This adds a diagnostic that does not exist today, so it is an intended change that needs the owner's yes (OD-9); if the answer is no, the two suppressions stay and are recorded as approved exceptions in section 12.

```ts
// publish/peers/transport-call.ts
export interface PeerCallDeps {
  readonly httpClient: HttpClientPort;                 // core shape; must not follow redirects (conformance T-K7b)
  readonly credential: ResolvedPeerCredential;
  readonly clock: Clock;
  readonly productName: string;
  readonly redact: (required: { text: string }, optional?: {}) => string;
  readonly describeEgressRefusal?: (required: { err: unknown; hostname: string }, optional?: {}) => string | null;
  readonly report?: (required: { message: string; error: unknown }, optional?: {}) => void;
  readonly recordRemoteApply?: (required: RemoteApplyRecord, optional?: {}) => Promise<void>;
}
export function callPeer(required: { deps: PeerCallDeps; request: PeerRequest }, optional?: {}): Promise<unknown>;
```

### 4.4 What Tovu keeps

```
features/publish-content/
  tovu-publish-ports.ts        # TovuPublishPorts (today's PublishContentPorts) + type TovuPublishDeps
  backstop-policy.ts           # TOVU_BACKSTOP_POLICY (lists + scanner binding) only
  file-tree-config.ts          # TOVU_FILE_TREE_POLICY (upload ceiling + scanner)
  peer-vault-store.ts          # PeerStorePort over SecretsVaultService; scope constant; context check
  peer-egress.ts               # describePeerEgressRefusal with the TOVU_PUBLISH_CONTENT_DEV_HOSTS wording
  publish-readiness.ts, push-plan.ts, media-references.ts, content-references.ts, live-site-policy.ts, permissions.ts, publish-backstop-*.ts,
  publish-content-peer-repo*.ts, agent-tools.ts, tool-*.ts, publish-tool.ts, disconnect-tool.ts, ui/*
features/publish-trust/
  trust-names.ts               # TOVU_TRUST_NAMES (section 3.3 literals)
  trusted-routes.ts            # the route list from grant.ts:57
  connect.ts, provisioning.node-io.ts, publish-trust-revocations.ts
server/runtime/composition/
  jini-publish.ts              # NEW: every binding in one place, each line with `satisfies`
  publish-content-manifest.ts  # installFirstPartyPublishContentTypes({ registry }): registers on the instance its root created
server/inbound/...             # Express routes and publish-trust-auth.ts: import lines only
```
`composition/jini-publish.ts` follows untangle DESIGN section 3 ("each lane adds one `jini-<topic>.ts`; the coordinator adds the one line in `deps.ts`/`app.ts`"). It exports **functions and constants only, no constructed instance**: `toJiniHttpClient`, `createPublishTypes()` (returns a new registry with the first-party types installed; each composition root calls it once), `publishTrustNames`, `peerCallBindings` (`redact`, `describeEgressRefusal`, `report`, `recordRemoteApply`), `backstopBindings`, `importHookBindings` (`planHashOf`, `resolveActorClassIdentity`, `markRefusedItem`), `blobBindings` (`blobKeyFor`, `isDocumentOnlyBlob`), `reportCompensationFailure`. The first pass exported a registry instance from this module; that would have been the same shared state under a new name (judge finding 7).

---

## 5. Migration graph (rebuilt in revision 2 from the real imports)

### 5.0 How a Tovu commit gets Jini code (judge finding 4)

Tovu resolves `@jini-ai/cms` from the npm registry: `package.json:139` is `^0.7.0` and the lockfile pins `0.7.0` from `registry.npmjs.org`. A Jini commit therefore changes nothing in Tovu. `npm run link:jini` (`development/scripts/link-jini.mjs`) is for local iteration only, and `check-no-linked-jini.mjs`, wired into every `build`, refuses linked or `file:` installs. (Jini's own guide says hosts use `file:../Jini/packages/*`; for Tovu that is out of date. Conflict flagged.)

So the unit of delivery is a **release train**, not a commit pair:

1. Jini commits of the train land. Each adds files, their export keys and their tests, and nothing imports them yet, so Jini is green alone.
2. Verify the artifact before publishing: `pnpm --filter @jini-ai/cms build`, `npm pack`, install the tarball into a throwaway Tovu worktree with `--no-save`, run `npm run typecheck` and the train's test files there. Nothing from this worktree is committed.
3. A changeset publishes `@jini-ai/cms` (minor bump: new export keys). Publishing is an owner or CI action, never an executor's.
4. First Tovu commit of the train changes only the dependency: range and lockfile for the published version in every package that lists cms. Gates: `npm ci` on a clean tree, `npm run typecheck`, `node development/scripts/check-no-linked-jini.mjs`, `npm run build`.
5. Then one Tovu commit per step: delete the Tovu implementation, repoint every importer, bind the ports. A Tovu implementation is deleted only against the installed registry artifact.

Rollback: revert the Tovu commits of the train (old files and importers return); the dependency bump may stay because the new version only adds keys. No data or wire format changes at any step, so there is no point of no return.

Gates for every Jini commit: `npm --prefix packages/cms run typecheck`, `npm --prefix packages/cms run test`, `npm --prefix packages/cms run check:packaging`, `node --import tsx scripts/check-subpath-isolation.ts`, `pnpm guard`. Gates for every Tovu commit: `npm run typecheck`, `npm run typecheck:tests`, and the named test files through the root `npm run test` script.

### 5.1 Tests: two runners, two kinds of suite (judge finding 3)

Tovu runs `node --test` through tsx; 71 of the 73 test files in the two features import `node:test`. cms runs `vitest run` (`packages/cms/package.json` `scripts.test`). A moved test file does not run in cms as it is. Rules:

| Kind | How to recognise it | What happens |
|---|---|---|
| A. unit suite | imports only in-scope files, `node:assert`, `node:test` and Node built-ins | converted to vitest **in the Jini commit that adds its subject**: `test`/`describe` from `vitest`; `t.after`/`test.after` -> `afterEach`/`afterAll` or `onTestFinished`; `t.mock` -> `vi.fn` on a fake of the port (never `vi.mock` of a module); subtests -> `describe` blocks; temp-dir cleanup stays in a hook. `node:assert/strict` may stay. The Tovu file is deleted in the Tovu commit |
| B. host-bound suite | imports `#src/...` adapters, SQLite, Express, platform's vault, the composition root | **stays in Tovu** as an integration test of the real adapters; only its import specifiers change. Examples: `raw-file-contributor.test.ts` (Tovu filesystem adapter, media and command in-memory implementations, lines 8-14), `raw-row-contributor.test.ts` (`better-sqlite3`, `createRawRowSqlitePort`, `contentKernel`, lines 1-10), `peers.test.ts` (real vault), every `routes/` suite |
| C. new Jini unit suite | for each kind-B suite whose subject moves | written in vitest against fakes of the port interfaces, covering the same decisions; these are added tests |

Before each step the executor classifies the step's test files by their imports (one `rg` per file) and records the list in the commit message. Counts are **executed** counts from runner output (`node --test` summary line; vitest summary), per file, before and after; a grep of `it(`/`test(` is not accepted as evidence. A converted trust or peer suite is a new artifact, so the section 6 mutation proof is run again on the converted file for at least one mutation per row it guards.

### Phase 0: Tovu-only preparation (no file leaves Tovu)

Tests added in Phase 0 use Tovu-local fakes in `features/publish-{content,trust}/__tests__/support/`. They do not import `@jini-ai/cms/publish/testing`, which does not exist yet (the first pass required it before it was created).

| Step | Change | Prerequisites | Callers / tests touched | Green alone because |
|---|---|---|---|---|
| P0.0 | R-BARRELS has run (OD-8); line numbers re-taken | none | none | no change |
| P0.1 | Characterization tests of section 6 and the mutation proof for K1-K10, D1-D13, H1-H12, C1-C2 | P0.0 | new test files and new cases in the files named in 3.4 | adds tests |
| P0.2 | `T-FROZEN` | none | new test | adds a test |
| P0.3 | Split `type-registry.ts`: bag -> `tovu-publish-ports.ts`; generic types with default `TPorts = TovuPublishPorts` for this phase only; `beforeSaveHook` -> `ports.hooks.beforeSave` (section 4.3) | P0.1 | 16 + 25 importers compile unchanged; two producers, one consumer, T-HOOK-ROUTE | types plus one renamed field with all three sites in the commit |
| P0.4 | Registry instance per composition root (section 4.3 table) | P0.3 | both install callers, 4 direct readers, 2 permission-map readers, catalog callers, both deps builders; tests: 144 register + 85 reset sites by codemod to a per-test registry | one commit; codemod reviewed by count; T-REG, T-REG-ROOT |
| P0.5a | Exported functions -> `(required, optional = {})`: 87 functions (section 2.4), one commit per file family | none | every caller and test of the family | behaviour-free; typecheck finds every miss |
| P0.5b | Port-interface methods (about 39) with their adapters and fakes (OD-12) | P0.5a | Tovu adapters (SQL, filesystem, vault), in-memory implementations, test fakes | same |
| P0.6 | Function splits of section 4.1 in place, one commit per function | P0.1 | existing suites; matching `size-debt.json` entries deleted in the same commit | pure refactor under tests |
| P0.7 | Ports in place, one commit each: (a) `redact`, `report`, `describeEgressRefusal`, `recordRemoteApply`, `productName`, `markRefusedItem`, `planHashOf`/`resolveActorClassIdentity`, policy configs, `TrustNames`, `routes`; (b) `blobKeyFor`, `isDocumentOnlyBlob`; (c) `PeerStorePort` with `peer-vault-store.ts` and `hasCredential`; (d) `reportCompensationFailure` (only after OD-9); (e) `content-hash-version.ts`; then `composition/jini-publish.ts` | P0.5 | files of sections 1.2-1.5; coordinator adds the use lines in `deps.ts`/`app.ts` | every binding passes today's value; T-PORTS, T-K6d-f, T-K10, T-C1/C2 |
| P0.8 | File splits of section 4.1 in place, same names as the Jini targets | P0.6, P0.7 | importers repointed by script; `check-architecture.baseline.json` edges rewritten | pure move inside Tovu |
| P0.9 | Every type import written `import type`; exit gates | P0.8 | scope files only | no run-time change |

Exit gates of Phase 0, all scripted: (1) `rg -n "#src/|@tovu/|\.\./\.\./" <scope files>` prints nothing; (2) the closure script (`closure.cjs`, the one used for section 4.1) prints no `node:` for a leaf marked `U` and no `@jini-ai/cms/` specifier other than `cms/core`; (3) `tsc --noEmit --verbatimModuleSyntax --isolatedModules` over the scope files is clean; (4) the 87-function census prints zero.

### Moves

Every Jini step adds: the source leaves, their export keys and `jini.entries` labels, the converted kind-A tests, any new kind-C tests, and the `testing/` fakes those tests need. No key is added before its file.

| Train | Jini step: files | Imports it needs (already published or earlier in the same train) | Tovu commit also does |
|---|---|---|---|
| **R1** | J-ISO: `jini.isolation.domains.publish`, no export key | none | nothing |
| | **B01**: `transfer/*` (9 files) | `@jini-ai/core/primitives` | repoint the importers of section 1.1; `backstop-ports.ts` takes `BlobStorePort` as `import type` from the cms media leaf |
| | F1: `registry/{content-hash-version,content-hash.node,precheck-reasons,seed-hash,types,registry,catalog}`, `planning/{report-contract,ui-contract,plan-rows,planner,run-repo,report-labels}` | B01 | remove the P0.3 default (`TPorts` explicit at about 41 importers); `ui/index.ts` loses the moved names |
| | F2: `registry/repo-handler*`, `files/tree-*` | F1, B01 | 11 outside importers of `repo-handler`; `file-tree-policy.boundary.test.ts` path rewrite. `media-references.ts` stays |
| **R2** | **B02-S1**: `backstop/{policy,preview.node,service}` | F2 (`tree-policy`), B01 | import repoint only |
| | **B02-S2**: `backstop/{raw-row*,raw-file.node*}` | S1, F2, F1 | `publish-content-manifest.ts`; both raw suites stay in Tovu (kind B); kind-C suites added in Jini |
| | **B02-S4**: `planning/export-bundle` | F1 only (`content-hash-version`, `planner`, `ui-contract`) | `push-plan.ts`, export route. `content-references.ts` stays |
| | **B02-S3**: `engine/{import-hooks,import-steps,execute-import}` | B01, F1 | `gated-hooks.confirmed-report.test.ts` stays, imports repointed |
| | **B02-S5**: `engine/apply-*`, `idempotency` | S1 (`readBackstopMetadata`), S3 (`PublishContentBundleNotFoundError`, apply port type), F1 | composition use lines (coordinator) |
| **R3** | T1: `trust/{grant,routes,revocations,provisioning,provisioning-status,names}` | core only | `publish-trust-auth.ts`, `handshake.ts` route, composition: import lines |
| | T2: `trust/{keys,session,challenge}.node` | T1; mutation proof green | same importers |
| | T3: `trust/handshake-client.node` | T2 (`keys`, `buildChallengeMessage`), T1 | `connect.ts` |
| | **B03-P0**: `peers/peer-url` | `@jini-ai/core/contracts/server/verified-origin` | 3 + 2 importers |
| | **B03-P3**: `peers/{records,credentials,peer-service,connected-destination}` | **B03-P0** (`normalizePeerBaseUrl`, `peers.ts:7`, `:225-229`) | 7 + 10 importers; `peers.test.ts` stays (kind B) |
| **R4** | **B03-P1**: `peers/transport-*` | P3 (`ResolvedPeerCredential`), P0, R1 (`blob-hash.node`, `artifact-format`, `packed-entity`), R2-S4 (`PublishContentExportEnvelope`) | routes and tools of the B03 sheet; Tovu-wording tests stay |
| | **B03-P2**: `peers/composite-blob-source.node` | P1 (`PeerBlobSource`), B01 (`file-blob-index`) | `push-plan.ts` |
| | **B03-P4**: `peers/{destination-credential,connect-destination,pull}` | P1, P3, T3, B01 (`bundle-staging`) | `siteLabelFor`, `blobKeyFor`, `reportCompensationFailure` passed as inputs |

Order of the three sheets: **B01 -> F1 -> F2 -> B02 (S1, S2, S4, S3, S5) -> B03 (P0, P3, P1, P2, P4)**. Train R3 has no source dependency on R1 or R2 and may be prepared beside them; it is published as its own version. R4 needs R1, R2 and R3 published. The number of trains is OD-11.

---

## 6. Characterization tests first

Rules: fakes of interfaces only. In Phase 0 (Tovu) the fakes are Tovu-local files under `__tests__/support/`; after a move, Jini tests use `publish/testing/*` leaves and core's testing entry. No `vi.mock` or `mock.module` of an in-scope module; clock and ids pinned; each test names the check it guards.

**Mutation proof (P0.1, required before any trust or peer file moves).** For each row K1-K10, D1-D13, H1-H12 and C1-C2: delete or invert the named check in a scratch commit, run the named test, record red, restore. Deliver a table `check -> test -> red output line`. A check whose removal leaves the suite green gets a new test first. This is the only evidence that satisfies "fails if the check is removed"; reading the tests does not.

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
| T-K4a/b | five required handshake fields each refuse; three optional fields each take the pinned fallback | a "validate everything" tightening, or a dropped fallback |
| T-K6d/e/f | rename keeps the envelope byte-identical with a throwing sealer and keyring; stale revision -> conflict; converting a keyed row to connected drops envelope and hint | an adapter that reseals, skips the revision check, or keeps a stale hint |
| T-K10 | blob key binding equals cms media's function; two workspaces -> two keys | a binding that ignores the workspace |
| T-D4c | source guard: `macMatches` uses `timingSafeEqual` on equal-length buffers | a plain string compare that still returns the right answers |
| T-C1a/b, T-C2a/b/c | primary error is thrown; a failed compensation reaches the reporter with step and state | a compensation failure that leaves no trace |
| T-HOOK-ROUTE | a refusing before-save hook passed through the route deps builder refuses a post apply | a producer that drops the hook after the move into `ports.hooks` |
| T-REG-ROOT | two `createApp()` instances in one process: a type registered in one root is absent from the other's catalog, permission map and the four direct readers | a module-level instance, or a reader still on a global |
| T-H1..H12 | section 3.4, one mutation each | a host gate removed while the engine tests stay green |

Test-count guard (honest-testing rule): before Phase 0 the two features have 73 top-level test files and about 875 `it`/`test` cases by `grep` (551 + 324). The grep number is only a starting estimate. Every commit reports **executed** files and cases from runner output, before and after, per repo (section 5.1); the sum across both repos never drops, and a converted file must execute the same number of cases as its `node:test` original.

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

## 9. Estimate (tokens), revision 2

| Step | Sonnet | Opus | Change from the first pass |
|---|---|---|---|
| P0.1-P0.2 tests + mutation proof (now 37 rows: K1-K10, D1-D13, H1-H12, C1-C2) | 250k | 50k | +host gates, compensation |
| P0.3 generic types + hook move | 80k | 40k | +hook |
| P0.4 registry per root + codemod | 210k | 25k | +2 boot paths, 6 readers |
| P0.5a 87 exported functions | 480k | 0 | was 23 functions |
| P0.5b about 39 port methods + adapters | 160k | 10k | new |
| P0.6 function splits (8) | 260k | 110k | same |
| P0.7 ports in place (a-e) + `jini-publish.ts` | 300k | 70k | +`PeerStorePort` complete, blob key, compensation |
| P0.8 file splits, P0.9 type imports + gates | 190k | 0 | +P0.9 |
| R1: B01, F1, F2 (+ test conversion) | 560k | 50k | +vitest conversion |
| R2: B02 S1-S5 (+ conversion, kind-C suites) | 500k | 45k | same reason |
| R3: T1-T3, B03-P0, P3 | 400k | 60k | security review includes T-D4c |
| R4: B03 P1, P2, P4 | 280k | 25k | |
| Release trains: 4 artifact checks + 4 dependency commits | 60k | 0 | new |
| **Total** | **about 3.7M** | **about 0.49M** | was 2.6M / 0.43M |

The increase is real work the first pass did not count: 64 more signature conversions, the port methods, converting about 60 test files between runners, and proving the host gates. Dropping OD-12 saves about 170k; one release train instead of four saves about 45k but makes the Tovu side one large step.

---

## 10. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| OD-1 | The contributor registry is module-level state today. Make it an instance the host owns (229 test call sites change by codemod), or keep module state in Jini as a recorded exception to practice 1? | Instance. It is the only way two hosts, or two tests, do not share state |
| OD-2 | Trust code lives in `cms/publish/trust`, or in its own package? | In cms. It has one consumer (publish) and imports only core; a new package is an abstraction with one user. Revisit if a second feature needs install-to-install trust |
| OD-3 | Entry points. Revised: the first pass recommended one entry file per slice with named re-exports. That is still a re-export shell and the practice forbids it (judge finding 12) | **Export-map keys point straight at the owning implementation files; no entry file exists.** Specifier form: `@jini-ai/cms/publish/<slice>/<leaf>`. A key exists only for a leaf a host imports. The only thing left to rule on is the specifier naming, before P0.8 fixes the file names |
| OD-4 | Where do the three platform-binding adapters go (`peer-vault-store`, `provisioning.node-io`, SQL revocations)? | Tovu now; host preset `@jini-ai/server` after Q8's lane exists |
| OD-5 | Key-derivation purpose strings contain no product name. May Jini ship them as defaults, or must every host pass them? | Host passes them (no default). A default hides a value that must never change |
| OD-6 | Rename the failure code `"not-a-tovu-site"`? | Keep the literal in the type as a host-supplied code set is over-engineering; rename to `"not-a-peer-site"` in P0.5 with its consumers, since it is not stored or sent on the wire (**verify first**: section 11, U6) |
| OD-7 | `KeyringPort` is declared twice in Jini (core and integrations) | Separate Jini lane: integrations imports core's. Not part of this move |
| OD-8 | Run order against R-BARRELS | R-BARRELS first (section 8) |
| OD-9 | Compensation failures in connect/disconnect are dropped today (`connect-destination.ts:108-117`, `:150-166`). Add the reporting contract of section 4.3? It adds a diagnostic and changes no thrown error | Yes. If no: the two suppressions are kept and recorded as approved exceptions |
| OD-10 | Six places turn a read **error** into "absent": `raw-file-contributor.ts:129`, `raw-row-contributor.ts:25`, `:141`, `composite-blob-source.ts:72`, `seed-hash.ts:54`, `:70`. The raw-file adapter already returns `null` for a missing file and throws only for refusals and real IO errors (`publish-backstop-file.ts:20-21`, `:59`, `:66-67`) | Keep the behaviour in this move (no silent change) but send the caught error to the `report` port, so absence and failure are distinguishable in diagnostics. Narrowing the catches is a separate, tested behaviour change |
| OD-11 | Release trains: four cms versions (R1-R4), or fewer | Four. Each Tovu step then deletes code against a published artifact that was tested from a tarball first |
| OD-12 | Convert about 39 port-interface methods to `(required, optional = {})` too | Yes, before the move: the ports are the public contract of the package. Cost about 170k |
| OD-13 | `registry.list()` returns a frozen copy instead of the live array | Yes |
| OD-14 | `publish-trust-auth.ts` answers 401 with no diagnostic when revocations or grants cannot be read (bare `catch`), and logs with `console.error` in two places. The file stays in Tovu and this move changes only its imports | Leave it in this move; open a Tovu follow-up to route these through the logger. Listed so the exception is recorded, not hidden |

---

## 11. What I could not verify

- **U1.** No test was run and no typecheck was run (no `node_modules` in either checkout). All "existing test covers it" statements come from file names and sizes.
- **U2.** I read `type-registry.ts`, `destination-credential.ts`, `keys.ts`, `session.ts`, `challenge.ts`, `revocations.ts` (admission part) and grep extracts of the rest. I did not read `apply-loop.ts`, `peers.ts:200-636`, `peer-transport.ts:300-880`, `planner.ts`, `provisioning.ts`, `grant.ts`, `handshake-client.ts`, `connect.ts` or `publish-trust-auth.ts` line by line. The port shapes in 4.3 for peers and the engine are drafts.
- **U3.** Resolved in revision 2: Tovu uses the registry (`package.json:139`, lockfile `0.7.0`); see section 5.0.
- **U4.** Function sizes are my AST count (non-blank, non-comment lines). Jini's ESLint `max-lines-per-function` may count differently; `callPeer` and `pushBundleToPeer` are the cases to re-check.
- **U5.** Resolved: `content-references.ts` and `media-references.ts` stay in Tovu (section 4.1).
- **U6.** Whether `"not-a-tovu-site"` is persisted or sent to the admin UI as a code.
- **U7.** Resolved by reading the checker: a named domain may not import another named domain at run time except `core` (`check-subpath-isolation.ts:279-287`). Section 4.1 lists the four crossings and their resolution.
- **U8.** The count of `check-architecture.baseline.json` edges naming scope files (I saw the first 8 of the output).
- **U9.** `ADS-memory/.../untangle/LANES-files.tsv` and `EDGES-sites.tsv` contain no publish rows (0 matches) because they scan Jini only; I did not check wave C's Tovu-side lane sheets beyond R-BARRELS.
- **U10 (new).** The closure and signature numbers come from regex scripts (`closure.cjs`, `sig.cjs`), not the compiler: no dependencies are installed. Exported arrow constants and class methods are not in the 87.
- **U11 (new).** Which existing test goes red for each row of 3.4 is unproven; the candidate files exist, the mutation proof decides.
- **U12 (new).** Whether `pnpm guard` already runs `check-subpath-isolation.ts`; the gate list names the script directly so it does not matter.
- **U13 (new).** Per-file classification of the 73 test files into kind A or B was done for five files only (the three B01 suites and the two raw suites).

Follow-ups outside this design: F1 consolidate the six Tovu HTTP adapters onto `toJiniHttpClient`; F2 merge the two `KeyringPort` declarations; F3 streamed blob transfer with explicit backpressure and cleanup.

---

## 12. Owner practices check

| # | Practice | Status | Note |
|---|---|---|---|
| 1 | DI through typed ports; no global or singleton | Met after P0.4 and P0.7 | Exception recorded: `*.node.ts` leaves call `node:crypto` directly (a platform built-in, one implementation). Key material still arrives only through `KeyringPort` |
| 2 | `(required, optional = {})`; never `?: Record<string, never>` | Met after P0.5a and P0.5b | 87 of 128 exported functions and about 39 port methods converted (section 2.4). Conflict flagged: core's own `KeyringPort.activeKey(_required: Record<string, never>)` |
| 3 | Functions <= 50, files <= 500, complexity <= 10 | Met after P0.6 and P0.8 | 8 functions and 7 files split; measured inside each proposed file (4.1). U4 applies |
| 4 | Feature slicing by responsibility | Met | eight slices, dependency direction in 4.2 |
| 5 | No barrels, forwarders or aliases | Met | No entry files: export keys point at implementation files (OD-3 revised). Every step deletes the old path and repoints callers. The two re-export lines in `backstop-ports.ts:2` and `backstop-audit.ts`, and `type-registry.ts:1`, are deleted |
| 6 | Why-comments move with the code | Met | header comments move; plan/task references are reworded neutrally, the reasoning stays |
| 7 | Generic -> Jini, one-site -> Tovu; cms imports only itself + core + protocol; no server framework in Jini | Met | Express middleware and routes stay in Tovu; route list, table lists, env names, vault scope stay in Tovu |
| 8 | Tests use fakes of interfaces via `/testing`; no real implementations of other packages; characterization first; mutate | Met by design | section 6. Conflict flagged: today's peer tests use platform's real vault; they are rewritten for Jini and the originals stay in Tovu as adapter tests |
| 9 | Errors never swallowed or generic; redacted; cleanup failures included | **Not met today; met after OD-9 and OD-10, else recorded exceptions** | Inventory of every `catch` in scope that does not rethrow (41 sites, by script). (a) Parse or probe turned into a typed result, fine: `peer-url.ts:97`, `:137`, `revocations.ts:103`, `provisioning.ts:107`, `session.ts:146`, `handshake-client.ts:115`, `:127`, `file-tree-policy.ts:337`, `peer-transport.ts:162`, `:298`, `:418`, `:856`. (b) Deliberate fail-closed verification: `keys.ts:202`, kept with its guard test. (c) Cleanup failures collected and recorded, the good pattern: `apply-loop.ts:817-819`. (d) `console.warn` diagnostics that become the `report` port: `backstop-preview.ts:40`, `peer-transport.ts:615`, `apply-loop.ts:744`. (e) **Compensation failures dropped: `connect-destination.ts:108-117`, `:150-166` (OD-9).** (f) **Errors read as absence: six sites (OD-10).** (g) Cause discarded by a bare `catch`: `peers.ts:397`; the typed error gains `cause`. (h) Host middleware: OD-14 |
| 10 | No new `eslint-disable`/`@ts-ignore`; no silent behaviour change | Met | the `as never` casts on `workspaceId` are removed, not replaced |
| 11 | Smallest change; reuse first; no abstraction with one user; reversible | Met with two noted choices | no crypto port (one implementation); `PeerStorePort` has two implementations (vault, in-memory) used by production composition. Reuse checked: `registry/src/trust.ts` (registry signature verification over certificates) is a different mechanism and is not reused; `core/src/records.ts:170` `canonicalJson` is a candidate owner for `content-hash.ts`'s canonical form, but the hash output is persisted in baselines, so it is **not** merged in this move (a different key order or omission rule would change every stored hash) |
| 12 | Memory / IO cost on hot paths | Unchanged, recorded | section 7 buffering row; registry `list()` is O(types) per catalog build as today |


---

## 13. Judge response

Judge: Codex gpt-6.1-sol HIGH, `CODEX-JUDGE.md`, verdict "needs rework" (3 blockers, 9 majors). Each finding was checked in the code at Tovu `80b00f5b` and Jini `02edbb68` before it was accepted. **Accepted: 12. Rebutted: 0.** Two findings were wider than the judge said (3 and 11) and one had one more site (7).

| # | Finding | Verified at | Verdict | Fix in this revision |
|---|---|---|---|---|
| 1 | Universal entries load Node code and cross isolation domains | `planner.ts:1` and `export-bundle.ts:1` value-import `CONTENT_HASH_VERSION` from `content-hash.ts`, whose line 1 imports `node:crypto`; `repo-handler.ts:5`; `peer-transport.ts:3` -> `blob-staging.ts:1`; `destination-credential.ts:1` -> handshake client -> `keys.ts:1`. Domain rule: `check-subpath-isolation.ts:279-287`; cms has no cross-domain run-time import today. Extra crossings the judge did not list: `computeBlobStorageKey` at `gated-hooks.ts:3`, `pull.ts:1`, `raw-file-contributor.ts:3`, and `isDocumentOnlyBlob` | **Accepted (blocker)** | 4.1: labels by closure per leaf; constant split; two reference files stay in Tovu; blob functions injected (K10); P0.9 and four exit gates |
| 2 | Migration graph has unavailable prerequisites | checker reports "no source file" for a key without a file (`:327-329`); `peers.ts:7`, `:225-229` need `normalizePeerBaseUrl`; the old Phase 0 tests imported an entry created after Phase 0 | **Accepted (blocker)** | section 5 rebuilt from the import list of every file: keys land with files; `peer-url` is B03-P0 before P3; Phase 0 tests use Tovu-local fakes; S4 needs F1 only |
| 3 | Test moves do not fit the runner or host boundaries | cms `test` = `vitest run`; the three B01 suites import `node:test` (`blob-staging.test.ts:3`, `bundle-staging.test.ts:2`, `file-blob-index.test.ts:6`). Wider than stated: 71 of 73 test files in the two features use `node:test`. `raw-file-contributor.test.ts:8-14` and `raw-row-contributor.test.ts:1-10` import Tovu adapters | **Accepted (blocker), wider** | 5.1: kinds A, B, C; conversion rules; executed counts; mutation proof re-run on converted trust and peer suites |
| 4 | No reproducible package delivery | `package.json:139` `^0.7.0`; lockfile `0.7.0` from the registry; `link-jini.mjs`; `check-no-linked-jini.mjs` | **Accepted** | 5.0: release trains, tarball check before publish, dependency commit, delete only against the published artifact |
| 5 | Credential-store contract incomplete | `peers.ts:293-306`, `:420-425`, `:617-630`; also the conversion path at `:522`, `:551` | **Accepted** | 4.3: `PeerStorePort` with eight operations and an error table; envelope never enters Jini; revision handling and in-memory binding stay with the vault owner; K6 row and T-K6d-f |
| 6 | K4 assertions contradict behaviour | `fetchDestinationIdentity` (origin fallback), `sessionFrom` (`expiresAt`, `capabilities` fallbacks); pinned at `handshake-client.unit.test.ts:164-166`, `:242-252` | **Accepted** | K4 row: five required fields, three optional with fallbacks; T-K4a/b |
| 7 | Registry recreated as shared state; readers missed | `modules/publish-content.ts:37-49`; readers `tool-registrations.ts:166`, `:298`, `destination.ts:209`, plus one more: `composition/publish-backstop-ports.ts:17`; second install caller `tool-catalog-manifest.ts:508` | **Accepted, one more site** | 4.3 table of every reader; registry built inside each root; `jini-publish.ts` exports a factory; T-REG-ROOT |
| 8 | `beforeSaveHook` contradictory | `type-registry.ts:219`; `features/post/publish-content.ts:389`; `tool-registrations.ts:425`; also `routes/publish-content/deps.ts:133` | **Accepted** | one contract: `ports.hooks.beforeSave`; site table; refusal test kept; T-HOOK-ROUTE |
| 9 | Trust table does not prove every property | `session.ts:129-133`; `publish-trust-auth.ts:308-315`, `:417-429`; `bundle-create.ts:138-163`; `import.ts:122-143` | **Accepted** | D4 row split, T-D4c source guard; section 3.4 with H1-H12 and named files |
| 10 | Compensation failures and read errors swallowed | `connect-destination.ts:108-117`, `:150-166`; `raw-file-contributor.ts:129`. A script found 41 non-rethrowing catches in scope | **Accepted** | 3.5 (C1, C2), 4.3 reporting contract, section 12 row 9 inventory, OD-9, OD-10, OD-14 |
| 11 | Signature census incomplete | every example checked (`peers.ts:191`, `:250`, `:503`; `planner.ts:239`, `:254`, `:491`; `challenge.ts:83`). Real size: 87 of 128 exported functions, not 23 | **Accepted, much wider** | 2.4 redone; P0.5a, P0.5b; estimate raised |
| 12 | OD-3 recommended a forbidden target | named re-export files are shells; cms already has leaf keys (`./media/slug`) | **Accepted** | no entry files; OD-3 revised; `INDEX.md` corrected |

### Lessons file (26 rules) applied

The first pass used 11. Rules that changed this revision: 3 (closure lift, kept), 5 and 25 (graph and export keys, section 5), 6 and 21 (each guard tested at an outcome only it protects: 3.4, T-D4c), 7 (K4 fallbacks, OD-10 absence vs error), 12 (HTTP and keyring shapes, kept; port methods P0.5b), 13 (whole middleware chain, 3.4, including the principal rewrite H7), 15 (OD-9, OD-10, OD-14 recorded before their cost is left out), 16 (peer writes are revision-checked per row; the multi-row connect sequence is not atomic today and stays so, stated in 4.3), 17 (a no-op `updateMetadata` on a missing row writes nothing, T-K6e), 20 (`hasCredential` instead of `sealed !== null`; frozen `list()`), 22 (compiler settings, P0.9), 24 (reporter payload has no free-form field; cardinality: one registry per root, many readers). Rules with nothing to apply here: 14 and 18 (no streaming), 19 (no quotas), 23 (no adapter executables), 26 (no env rename: the three names stay host values, section 3.3).

### Owner practices: conflicts flagged in this revision

- Practice 9 is **not met by today's code** (41 catch sites inventoried); two fixes need a decision because they add behaviour (OD-9, OD-10).
- "No silent behaviour change" against three small hardenings: frozen `list()` (OD-13), `cause` on the credential error, the compensation diagnostic (OD-9). Each is listed, none is silent.
- "Tests use fakes of interfaces" against the kind-B suites: they stay in Tovu because they test real adapters; Jini gets fakes-only suites.
- Jini's guide says hosts depend on `file:../Jini/packages/*`; Tovu depends on the registry. The design follows Tovu's actual manifest.
- Smallest change against practice 2: 87 functions and about 39 port methods is a large mechanical change. It is kept because the convention is an acceptance criterion (lesson 15), and split out as OD-12 for the port methods.