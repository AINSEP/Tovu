# SP-A07: members server domain -> `@jini-ai/user-management/members` (template T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A07` (6 files, 1,785 lines). Row `CLASSIFY` 54 (`website/features/members`, the OTHER files: `write-service` 677, `access-resolver`, `password-auth`, `consent-service`, `trash-member`, `mailer.console`, `auth-mail`, `repo.sqlite/rows/ts`) keeps its own sheets; these six files are the part it never classified (`CLASSIFY-files.tsv` has no row for them) and the part row 54's files import (`./types.js`, `./ports.js`). **Order: A07 S1 -> S2 before row 54's write-service/access-resolver slices**, so they repoint to the Jini names once.

Tier: S1 Sonnet, S2 Sonnet, S3 Sonnet + Opus review (tool authorization). est. executor tokens ≈ 115k (S1 40k, S2 30k, S3 45k).

## Findings that change the audit row
1. The Jini domain barrel name to import in Tovu is `@jini-ai/user-management/members` (new subpath, universal: pure types/ports/in-memory repos). The existing `./server` entry is `node`; `server/repo.memory.ts:42` `InMemoryIdentityRows<Row>` (the base class S2 extends) imports nothing from `node:` (checked: its imports are `@jini-ai/core/records` and `../core/types.js`), so S2 imports that LEAF file, not the `./server` barrel (rule 5).
2. The `ports.ts` foreign imports all have a core home on `integ/wave-b` now: `MailerPort`/`MailStatus` -> `@jini-ai/core/contracts/mail` (`core/src/contracts/mail/{ports,provider}.ts`), `OriginRegistryPort` -> `@jini-ai/core/contracts/server/verified-origin` (C4), `KyselyKernel<unknown>` (only `transaction`/`lockKey` are used, `ports.ts:235`) -> `StorageKernel` from `@jini-ai/core/contracts/storage` (`storage/kernel.ts:64`, `lockKey` :83). **Two names have no core home:** `MailSenderIdentityPort` (only `platform/src/mail/sender-identity.ts:39`; R-BARRELS row 846 repoints Tovu to `@jini-ai/platform/mail`) and `PasswordHasherPort`/`PrincipalRepoPort` (user-management's own server leafs: legal for S1 as own-package leaf imports). `MailSenderIdentityPort` becomes a local structural port in `members/ports.ts` (the members use only what `write-service.ts` reads: step 0 greps `senderIdentity\.` in write-service/auth-mail to write the exact shape; STOP if it needs more than 2 methods).
3. Untangle already edits these files (Tovu side): `R-BARRELS.repoint.tsv:846` (ports.ts `MailSenderIdentityPort`) and `:2058` (agent-tools.ts `export type { AgentToolActorClassRule } from "@jini-ai/core"` DROP), `C4.repoint.tsv:196` (`OriginRegistryPort` -> core server contract), `C3.repoint.tsv:388-389` (tool-registrations `AuthorizeFn` -> core events; ports.ts `StorageKernel` still from `@jini-ai/db/kernel`: S1 re-maps it to `@jini-ai/core/contracts/storage` because user-management may not import `db`), `C3t.repoint.tsv` (2 rows). **Run after the wave-B applier passes**; blobs below are taken before them and WILL differ: S1/S3 are guarded by TEXT (each OLD import line occurs exactly once) not blob.
4. `tool-registrations.ts` imports `@jini-ai/cms/core` for `adaptLegacyAuthorize`, `requireToolPermission`, `ForbiddenError`: all three exist in `@jini-ai/core` (`core/src/tool-permissions.ts:23,75,87`), so the move rewrites them to core. `buildDomainRegistrations`, `indexCatalogById`, `readToolLimit`, `requireInputRecord`, `requireString`, `optionalString` are in `core/src/registration-kit.ts`. Remaining foreign pieces become injected: `Tracker` (`tracker?.capture({ name: "member_registered", ... })`, tool-registrations.ts:204) -> structural `MembersTelemetryPort { capture(required: { name: string; userId: string }, optional?: { properties?: Record<string, unknown> }): void }`; `RemoveEntity` from `@jini-ai/cms/trash` -> local `RemoveMemberFn` type taken from `trash-member.ts`'s call (`remove: deps.removeMember`, tool-registrations.ts:257); `toolMetadata` (Tovu `contracts/core/tool-metadata/members.js`: risk/permission metadata table) stays Tovu and is passed in as `metadata` (it is what `buildDomainRegistrations({ metadata: toolMetadata, ... })` already takes, :311).
5. `subscriber-directory.ts` implements Tovu's `SubscriberDirectoryPort` (`../newsletter/index.js`); `rg -l SubscriberDirectoryPort packages` in Jini prints nothing: the port type is a Tovu newsletter contract. The Jini file declares structural `SubscriberContact` and `SubscriberDirectory` in `members/subscribers.ts` (the fields `members/subscriber-directory.ts:87-133` actually return); Tovu's port is assignable (type assertion in S3). The N+1 note in the header moves with the code.

## Guards (blobs at integ/wave-b BEFORE the applier passes; see finding 3)
```
tovu_files:
  - apps/website/src/features/members/agent-tools.ts | blob f0f22c026b2fc85b402c91081e03cc3a251b4489
  - apps/website/src/features/members/ports.ts | blob de4363a1a6f7a23a2270deedede16fd94d0bf537
  - apps/website/src/features/members/repo.memory.ts | blob 8e7301b497725ae4c6c8e95008070ba88e3f81a1
  - apps/website/src/features/members/tool-registrations.ts | blob c0f2f3735168c8f6ce9405c6b2de32a23c85e4d8
  - apps/website/src/features/members/types.ts | blob d2736f906190684631540dcb8f148448f0055c91
  - apps/website/src/features/members/subscriber-directory.ts | blob f427192a652a591cc3240a46e7262f523d5d408d
tovu_tests (move or repoint):
  - apps/website/src/features/members/__tests__/repo.memory.test.ts | blob b1842d90c930a26109301a3a14bff35430c6f658
  - apps/website/src/features/members/__tests__/repo.contract.test.ts | blob c05bd943d95002ca040bcde472b76f8bd8b896bc
  - apps/website/src/features/members/__tests__/agent-tools.contract.test.ts | blob edd24b618ba280a7daedc5c59455d27f632b75ed
  - apps/website/src/features/members/__tests__/tool-registrations.model-facing-errors.test.ts | blob 07f70782ac66ca39c1631dddd29b6a64a20088bc
  - apps/website/src/features/members/__tests__/subscriber-directory.test.ts | blob 2d8654448af675efa977ca2a11980dc300a8a91c
  - apps/website/src/features/members/__tests__/invariants.test.ts | blob 1b3f0488c6e6a24fe997f7e4402745de2dbed598
  - apps/website/src/features/members/__tests__/member-repo.list-cursor.test.ts | blob e50d6485a037c59cda79a05d8c4d51f3bcd6407f
  - apps/website/src/features/members/__tests__/tier-repo.lost-update.test.ts | blob f19e2cb3cb15f3aac479a5ff598e37e536a5fbce
jini_guards:
  - packages/user-management/package.json | blob 441edd24c2eaea5777b43becdfc23c0ffb94230e
  - packages/user-management/src/server/repo.memory.ts | blob 20c0629adcc6c6b01cb5b43147a5abd38ad50ed0
  - packages/core/src/tool-permissions.ts | blob 5854ba2d0bad4f750042e8242da48a4a0b5272b3
  - packages/core/src/registration-kit.ts | blob 93850493f8ae264ac502ce20573abf959107cf27
  - packages/core/src/contracts/storage/kernel.ts | blob a8a3d42b4b2caa402ced6ab426b8c4ae37e36b72
  - packages/core/src/contracts/mail/ports.ts | blob 7bdaf4038a6d794ae2f1abb30da47b58cbec21e5
  - packages/user-management/src/members/** must not exist; `rg -n "MemberRepoPort|InMemoryMemberRepo|membersAgentToolCatalog" packages/*/src` prints nothing
```

## Census (importers, resolved 2026-11-16; `scripts/census.py` at run time; allowed = these)
- `types.ts`: 12 prod files inside `features/members/` (`ports, repo.memory, repo.rows, repo.sqlite, repo.ts, write-service, access-resolver, consent-service, password-auth, tool-registrations, subscriber-directory, trash-member`), 3 outside (incl. `server/runtime/composition/modules/...` and `features/trash/__tests__`).
- `ports.ts`: 10 inside, 1 outside (`composition/modules/...`).
- `repo.memory.ts`: 1 inside, 7 outside (composition + tests).
- `agent-tools.ts`: 1 inside (`tool-registrations.ts`), 2 outside (`assistant/tool-registrations*`, the catalog contract test).
- `tool-registrations.ts`: 0 inside, 5 outside (assistant registry composition and tests).
- `subscriber-directory.ts`: 1 inside (`index.ts`), 0 outside.
The ~25 repoint sites outside this slice (row 54 files, composition, tests) are all single-line import edits `./types.js` -> `@jini-ai/user-management/members`; a scripted REPOINT pass (`apply-repoint.mjs`, template T-REPOINT) with a Sonnet check, ~3k tokens per file. List them with `rg -n "members/(types|ports|repo\.memory|agent-tools|tool-registrations|subscriber-directory)|from \"\./(types|ports|repo\.memory|agent-tools)\.js\"" apps/website/src`.

```
id: SP-A07-1 .. SP-A07-3
feature: website/features/members (server domain types, ports, memory repos, agent tools, subscriber reader)
jini_target: user-management src/members/{types.ts,ports.ts,repo.memory.ts,agent-tools.ts,tool-registrations.ts,subscribers.ts,subscriber-directory.ts,index.ts}; package.json: "./members": "universal" in jini.entries + exports + README row
stays_tovu: SQL/schema adapters (`repo.sqlite.ts`, `repo.rows.ts`, `repo.ts`), product grants and tool metadata table, copy, analytics event names, composition, `write-service.ts`/`access-resolver.ts`/`password-auth.ts`/`consent-service.ts` (row 54), the `SubscriberDirectoryPort` newsletter contract
changeset: @jini-ai/user-management: minor | "members: server domain types, ports, in-memory repos, agent tools, subscriber directory"
```

## SP-A07-1 — types + ports (Jini commit 1, then Tovu commit)
0. Branch rule; text guards (each OLD occurs once): `ports.ts` lines 24-31 import block; `types.ts:20-21`; Jini guard paths absent. Verify `rg -n "senderIdentity\\." apps/website/src/features/members/*.ts` to write `MailSenderIdentityPort` (finding 2).
1. Jini: `members/types.ts` = Tovu `types.ts` verbatim except line 21 `import type { PrincipalKind } from "../core/types.js"` (own package leaf; confirm `PrincipalKind` is exported there, `rg -n "export type PrincipalKind" packages/user-management/src`; STOP if not), plus the error classes unchanged. `members/ports.ts` = Tovu `ports.ts` with the import block replaced exactly:
   - `MailerPort, MailSenderIdentityPort` (`../../platform/mail/index.js`) -> `MailerPort` from `@jini-ai/core/contracts/mail`, `MailSenderIdentityPort` declared locally (finding 2);
   - `MailStatus` (`@jini-ai/platform/mail`) -> `@jini-ai/core/contracts/mail`;
   - `OriginRegistryPort` stays `@jini-ai/core/contracts/server/verified-origin`;
   - `PasswordHasherPort, PrincipalRepoPort` (`@jini-ai/user-management` barrel) -> own leaf files (`../server/hasher.js`, `../core/ports...`: use `rg -n "export (interface|type) (PasswordHasherPort|PrincipalRepoPort)" packages/user-management/src` to name them);
   - `KyselyKernel<unknown>` -> `Pick<StorageKernel<unknown>, "transaction" | "lockKey">` from `@jini-ai/core/contracts/storage` (`MembersWriteServiceDeps.credentialLifecycle`, ports.ts:235). Kysely never enters Jini (owner 11-15).
   The "ADR-037/ADR-049" comments are Tovu history: reword neutral; the shape docs stay.
2. Failing tests first: none are behaviour changes; the type move is verified by `members/__tests__/types.test.ts` (error class hierarchy: `MemberReauthenticationRequiredError instanceof MemberAuthError`, the four status/visibility unions via `satisfies` fixtures copied from `invariants.test.ts`). Add the subpath + export + README + changeset.
3. Tovu commit 2: `git rm` `types.ts`, `ports.ts`; repoint every importer (census) with the scripted pass; `index.ts` exports of those names come from the Jini subpath (no forwarding file: `index.ts` re-exports are deleted, importers repointed, owner rule 19). eslint; commit.

## SP-A07-2 — memory repos (Jini commit, then Tovu commit)
1. Source `repo.memory.ts` (508 lines, 7 classes: `InMemoryMemberExternalIdentityRepo`, `InMemoryMemberRepo`, `InMemoryMemberTierRepo`, `InMemoryMemberSubscriptionRepo`, `InMemoryMemberSessionRepo`, `InMemoryMagicLinkTokenRepo`, `InMemoryMemberConsentRepo` + `createInMemoryCredentialLifecycle`). Rewrite each to `extends InMemoryIdentityRows<Row>` (import from `../server/repo.memory.js`) when the class holds a plain `rows: Row[]` array; the base gives `snapshotRows/restoreRows` (transaction rollback) which `createInMemoryCredentialLifecycle` already needs: read the file, and for each class state in the commit body whether it was converted or why not (STOP if a class mutates rows through a different structure, e.g. a Map: leave that class as is, do not force the base).
2. Failing tests first: `members/__tests__/repo.memory.test.ts` = the moved `repo.memory.test.ts` + `repo.contract.test.ts` + `member-repo.list-cursor.test.ts` + `tier-repo.lost-update.test.ts` (all pure memory; the `*.dialects.test.ts` SQL ones STAY Tovu). New behaviour (rollback via the base class): a `credentialLifecycle.transaction` that throws after a member row change restores the snapshot (RED on a naive copy, GREEN with the base).
3. `core` imports (`assertVersionedWrite`, `matchesRecordFields`, `upsertRecord`, `pageFromArray`) stay core. Positional-arg check: `rg -n "function .*\\(\\w+: " repo.memory.ts` for exported positional functions (e.g. `createInMemoryCredentialLifecycle(_options = {})` is fine); convert any exported positional public API to `(required, optional = {})` in the move and all callers in the same commit.
4. Tovu: delete `repo.memory.ts`; repoint 8 sites (composition + tests); the Tovu dialect tests that import the in-memory repo as the oracle (`rg -n "repo.memory" apps/website/src/features/members/__tests__`) repoint too. Commit.

## SP-A07-3 — agent tools, registrations, subscriber reader (Jini commit, then Tovu commit; Opus review)
1. `members/agent-tools.ts` = Tovu `agent-tools.ts` (the six-entry `membersAgentToolCatalog`, `AgentToolSideEffect`, `DURABLE_MUTATION` import): `AgentToolDefinition` is `@jini-ai/core`'s; drop the `export type { AgentToolActorClassRule }` re-export line (R-BARRELS :2058 already DROPs it on Tovu: re-take the text).
2. `members/tool-registrations.ts` = Tovu `tool-registrations.ts` with: imports re-pointed per finding 4; `MembersToolDeps` loses `tracker?: Tracker` (-> `telemetry?: MembersTelemetryPort`) and `removeMember` (-> `RemoveMemberFn`), and `metadata` becomes a REQUIRED option of `buildMembersRegistrations(deps, { metadata })` / `contributeMembersTools({ metadata })` (it was a module import: it is product risk metadata and stays in Tovu); the analytic event name `member_registered` and its `properties` stay in the code path but are emitted through `telemetry.capture`, and the event NAME becomes `deps.telemetryEvents?.registered ?? "member_registered"`? NO: product naming stays host: pass `onMemberRegistered` callback instead (S3 test pins that the callback gets `{ workspaceId, memberId, source }` and the Tovu binding calls `tracker.capture({ name: "member_registered", ... })` with today's exact properties). `MagicLinkRateLimiter` interface moves as is.
3. `members/subscribers.ts` (structural port, finding 5) + `members/subscriber-directory.ts` (Tovu file, import of the Tovu newsletter types replaced by `./subscribers.js`).
4. Failing tests first (authorization is the review target): from `tool-registrations.model-facing-errors.test.ts` and `agent-tools.contract.test.ts` (the contract test enumerates the catalog against registrations: keep it as the parity oracle, it must pass with `metadata` injected from a fixture identical to Tovu's table), plus NEW: every one of the six registrations calls `requireToolPermission` BEFORE any repo access (a spy repo that throws on first touch with a denying `authorize` -> `ForbiddenError`-shaped model-facing error; six cases, one per tool), `magicLinkPerEmailLimiter` denial surfaces `retryAfterSeconds` without sending mail, `onMemberRegistered` fires once per creation. `subscriber-directory.test.ts` moves unchanged (pure).
5. Tovu: `tool-registrations.ts` becomes the binding of the moved builder: `contributeMembersTools({ metadata: toolMetadata })` is called where `contributeMembersTools()` is today (`rg -n "contributeMembersTools" apps/website/src`: STOP if more than the registry composition and its tests); the file keeps only `membersTelemetry = (tracker) => ({ capture })` and the `removeMember` adapter, ≤ 40 lines (it is a binding, not a forwarder: it adds the product metadata and telemetry). `agent-tools.ts` and `subscriber-directory.ts` are deleted and repointed. Commit.

## Opus review points
1. `requireToolPermission` precedes every repo/service call in all six handlers (S3 step 4 test), and no handler reads `workspaceId` from input instead of deps.
2. `metadata` required: a missing table must fail at registration, not default to permissive risk.
3. Rollback base class: transactions restore row snapshots on throw (S2 step 2).
4. Mail/origin ports remain optional exactly where they were (`origin?`, `mailStatus?`, `senderIdentity?`); `magicLinkPerEmailLimiter` stays required.
5. No `@jini-ai/cms`, `@jini-ai/db`, `@jini-ai/platform`, `@jini-ai/diagnostics` import in `members/**` (`rg` gate).

## untangle overlap (execute after wave B merge)
- C3 (`C3.repoint.tsv:388-389`), C4 (`:196`), R-BARRELS (`:846`, `:2058`): see finding 3; text guards.
- C5 owns `core/contracts/mail`, landed on wave B (this sheet reads it from `integ/wave-b`).
- CLASSIFY row 54's `write-service.ts` etc. and row 82 (`admin/features/members`): independent files; row 54 depends on S1/S2 (order above).
- A27 (`platform/mail`: email-templates, mail-status, feedback-sources) touches `mailStatus`; disjoint from these six.

## STOP specific to this sheet
- `MailSenderIdentityPort` needs more than two members.
- A memory repo class cannot extend the base without behaviour change (leave it, report).
- `contributeMembersTools` has callers beyond the registry composition and its tests.
- Any `members/**` import outside core/protocol/own package.
