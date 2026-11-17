# DC, SI, ML: deploy config, site inspection, mail activity — revision 2

Re-verified 2026-11-17 on `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Tovu 232764af5, Jini 65d73b0d5): every guard in this file's `*.files.tsv` and `JINI.blobs.txt` matches and `scripts/sidecars.py` regenerates the sidecars byte-identical. Revision-2 reading: Tovu `integ/merge-a-2026-11-16` e801e9ae (cross-checked with merge-b 450ac748: `deploy-config-registry.ts`, `page-body.ts`, `live-url.ts` differ by a few lines; `deploy-config.ts`, `published-page.ts` and every mail file are identical on both) and Jini `integ/merge-final-2026-11-16` af33fcdb. Inventories `../inventory/{deployments,site-inspection,mail}.tsv`; guards and importer sites `DC-1.*`, `SI-*.*`, `ML-*.*`. Run contract: `../COMMON-LO.md`.

## DC: deploy config
Size now: website `features/deployments` 39 files, 7,158 lines (tests 60 files, 14,300); admin `features/deployment` 29 files, 7,633. "Deploy config" itself is `deploy-config.ts` 374 + `deploy-config-registry.ts` 174. audit2 A19 labels `deploy-config.ts` and `dockerfile.ts` SPLIT with no sheet; DC-1 is that sheet for `deploy-config.ts` only.
Jini already owns the contract (`packages/devops/src/deploy/config-contracts.ts`, `config-descriptors.ts`) and the provider plugins (`packages/agent-plugins/{fly,render,railway}/deploy-configs/*.mjs`).
Split of `deploy-config.ts` (every top-level declaration; blob unchanged since round 1):
| Declaration (lines) | Verdict |
|---|---|
| `assertNoConfigInjection` 289-303 + `containsAnyOf`, `hasLeadingHyphenOrSurroundingWhitespace`, two character lists 276-287 | MOVE -> `@jini-ai/devops/deploy` (generated-file injection guard; security-relevant) |
| `hostNotesFor` 72-83, `appendHostDeployNotes` 98-109, `readOptionalFile` 62-69, `HostDeployNotesPorts` | STAY this round (the pure merge is 12 lines; reading the overlay file from the working directory is host) |
| `createDeployConfigKit` 112-118 | STAY (binds Tovu `ValidationError`) |
| `HOST_DEPLOY_ENV` 49, `REQUIRED_SECRETS` 216-221, `MIGRATIONS_NOTE` 237-238 | STAY (Tovu env policy and secret names) |
| `buildDeploymentDescriptor` 343-374, `extractOrThrow`, `readRepoFile` | STAY (reads Tovu's Dockerfile, package.json and a route source file) |
`deploy-config-registry.ts`: STAY (bindings over the trusted-plugin lifecycle; `DEPLOY_CONFIGS_FILENAME` is a saved-install name, same decision as D-SC2).
### DC-1 (SEAM+MOVE): the injection guard
precondition: none. THIRD_PARTY_ALLOWED: none.
- M1 (Tovu TESTS): table test of `assertNoConfigInjection`, one case per clause so that deleting any single clause turns exactly one case RED: each of the 9 characters (`"`, LF, CR, `:`, `#`, `{`, `[`, `&`, `*`) alone -> refusal naming the right class; leading `-`; leading space; trailing space; accepted values (letters, digits, `_`, `.`, `/`, inner `-`). The thrown error is the host validation error class. The kit passes arguments POSITIONALLY `(fieldLabel, value)`: the plugins call it that way (`fly.mjs:64-66`); the kit signature is a plugin ABI and does not change (owner rule 3 exception).
- M2 (Tovu seam): the local function becomes `assertNoConfigInjection(required: { fieldLabel: string; value: string; fail: (required: { message: string }) => Error }, optional = {})` (two-object signature; the error class is injected); `createDeployConfigKit` binds `(fieldLabel, value) => assertNoConfigInjection({ fieldLabel, value, fail: ({ message }) => new ValidationError({ message }) })`. M1 tests green with only the call shape changed.
- M3 (Jini): `packages/devops/src/deploy/config-injection.ts` + tests; exported from the `./deploy` entry leaf; changeset `minor`.
- M4 (Tovu): delete the local copy; repoint `DC-1.importers.tsv` rows.
STOP: the three plugin test suites are not green in V2 (`npm --prefix packages/agent-plugins run test` in the Jini clone). Never parallel with another sheet editing `packages/devops/package.json` (none is needed here: `./deploy` exists). Estimate: 90k.

## SI: site inspection
Size now: `features/site-inspection` 11 files, 2,707 lines + `features/site-evidence` 3 files, 495; tests 18 files, 4,287.
| File | Lines | Verdict |
|---|---|---|
| `published-page.ts` | 528 | SPLIT: generic path-shape guard, `toCookieShapes`, `readBoundedBody` -> `@jini-ai/diagnostics/web-evidence` (SI-1b); host policy binding, loopback server, fetch STAY |
| `page-body.ts` | 114 | MOVE (pure HTML body shaping, `parse5`): SI-2, gated on D-SI1 only |
| `live-url.ts` 188, `section-collector.ts` 177, `site-profile.ts` 663, `site-capabilities.ts` 316, `deps.ts`, tools, `admin-screens.generated.ts` | STAY (publish peers and history; product inventories; `site-profile.ts` is over the file limit: size lane) |
### What the guard really does (judge finding 6: ACCEPTED; read at `published-page.ts:143-330,484-503`)
- Order in production: `fetchPublishedPage` opens the loopback server FIRST (`:497`), then validates the path against the origin it just minted (`:501-502`). Round 1's "validate BEFORE opening the socket" is wrong and is removed.
- Decoding: ONE percent-decode pass by design (`:144-149`): a double-encoded `%252e%252e` decodes to the literal text `%2e%2e` and is ALLOWED as a filename. Round 1's deny list included double-encoded traversal: removed.
- Host policy: `resolveSameOriginPath` calls `assertNoDisallowedDecodedForm` (`:275-278`), which calls Tovu's `checkSitePathname` (`platform/routing/reserved-paths.ts`) and maps its verdict (`ok` / `malformed-encoding` / `disallowed-character` / `reserved` with the surface name) in `disallowedFormReason` (`:250-264`, exhaustive switch). The reserved surfaces (`/admin`, `/api`) are Tovu routing policy.
- Not the same as Jini `resolveSameOriginUrl` (`diagnostics/src/web-evidence/same-origin.ts`), which only joins a path onto a base. No DEDUPE.
### SI-1a (TESTS, Tovu): characterize the guard as it is
tests: extend `features/site-inspection/__tests__/published-page.unit.test.ts` (report existing cases by name). GREEN on the parent; one V3 mutation per group.
- Path shape: raw `..`, singly encoded `%2e%2e` and `%2E%2E` segments refused; double-encoded `%252e%252e` ACCEPTED (pin, with the source comment quoted); malformed percent-encoding refused; a decoded backslash or control character refused through the host check; absolute URL to another origin and protocol-relative `//host` refused; length 2,047 / 2,048 / 2,049 against `MAX_PATH_LENGTH`; query kept; fragment as today.
- Host policy binding: `/admin`, `/Admin`, `/api`, `/api/x`, and an encoded form of each (`/%61dmin`) are refused with the surface named. Mutation: replace the `checkSitePathname` call with a constant `{ kind: "ok" }` -> these cases are RED (this is the test that fails when the host policy binding disappears).
- Order: with a recording `openLoopbackSiteServer` seam (`FetchPublishedPageDeps`; if no seam exists, report it and skip this one case: do not add `mock.module`), an invalid path still opens and then closes the server exactly once (pins today's order and the cleanup).
- `readBoundedBody`: `maxBytes`-1, `maxBytes`, `maxBytes`+1; stream error; the reader is cancelled on overflow.
- `toCookieShapes` never returns a cookie VALUE (sentinel).
Estimate: 100k.
### SI-1b (SEAM+MOVE): generic guard with an injected policy
precondition: the SI-1a test file contains the policy cases (`rg -n "%61dmin" apps/website/src/features/site-inspection/__tests__/published-page.unit.test.ts`). THIRD_PARTY_ALLOWED: none.
- M2 (Tovu seam, in place): `resolveSameOriginPath(required: { raw: unknown; base: string; checkPathname: (required: { url: URL }) => PathnameVerdict }, optional = {})` where `PathnameVerdict = { kind: "ok" } | { kind: "malformed-encoding" } | { kind: "disallowed-character" } | { kind: "refused"; reason: string }`. A Tovu wrapper `resolveSitePath({ raw, base })` in a new `features/site-inspection/site-path-policy.ts` binds `checkPathname` to `checkSitePathname` and turns the `reserved` verdict into `{ kind: "refused", reason: "path must not target '/<surface>' — that is the authenticated admin/API surface, not a published page." }` (the sentence stays in Tovu, byte-identical). `fetchPublishedPage` and every other caller of `resolveSameOriginPath` call the wrapper (`SI-1b.importers.tsv`). SI-1a tests stay green unedited.
- M3 (Jini): `packages/diagnostics/src/web-evidence/path-guard.ts` (`assertRawPathShape`, `assertNoTraversalSegment`, `resolveWithinOrigin`, the generic `resolveSameOriginPath`, `PublishedPagePathError` renamed neutrally in Jini and imported under an alias in Tovu so every `instanceof` uses the one class), `bounded-body.ts` (`readBoundedBody`), `cookie-shapes.ts` (`toCookieShapes`), with their why-comments; leaf exports from the existing `./web-evidence` entry; changeset `minor`. `hasControlCharacter` already comes from `@jini-ai/core`.
- M4 (Tovu): delete the moved declarations from `published-page.ts`; the wrapper, `openLoopbackSiteServer`, `requestPublishedPage`, `fetchPublishedPage` stay; repoint importers (6 prod importers catch the error class: each imports the Jini class).
STOP: a caller reaches the generic function without the wrapper (`rg -n "resolveSameOriginPath\(" apps/website/src -g '!**/__tests__/**'` prints only `site-path-policy.ts`). Estimate: 140k.
### SI-2 (SEAM+MOVE, after D-SI1): `page-body.ts` -> `@jini-ai/diagnostics/web-evidence`
`manifest:` adds `parse5` to `@jini-ai/diagnostics` exactly as `devops` declares it (`packages/devops/package.json` peer `parse5: 7.3.0`), with the lockfile, in the M3 commit. precondition: `echo "{DECISIONS}" | rg "D-SI1=approved"`. 5 prod / 3 test importers (recount). THIRD_PARTY_ALLOWED: `parse5`. Estimate: 80k.

## ML: mail activity
Size now: `features/mail-status` 13 files, 1,618 lines; `features/mail` 12 files, 813; tests 13 files, 2,186. Jini has `@jini-ai/platform/mail` and `@jini-ai/core/contracts/mail`.
### What the domain really depends on (judge findings 7, 8: ACCEPTED)
- `mail-status/activity.ts:17-19` imports RUNTIME values `MAIL_ACTIVITY_OUTCOMES` and `MAIL_ACTIVITY_USES` (used at `:132-133`) from `mail/activity.repo.ts:25-28`, the SQL file. They are the only two importers of those constants (`rg -l "MAIL_ACTIVITY_OUTCOMES|MAIL_ACTIVITY_USES" apps`). Round 1's "type-only" claim was wrong.
- Two access tiers (`activity.ts:147-155`): the activity-read permission -> `full`; only the Email-page status permission -> `masked`; neither -> `MailActivityForbiddenError`. `requireFull` is set by a recipient filter (`:186`) and by detail lookup (`:219`). Masked items (`:158-161`) carry a masked recipient and NO id, message id, delivery mode, original recipient or provider diagnostics.
- Suppression removal has an independent OWNER gate (`suppressions.ts:74-79`): holding the manage permission is not enough; `principalId` must equal `await deps.ownerPrincipalId` (an optional `Promise<string>` in `MailSuppressionDeps` :24; absent -> everyone is refused). Listing needs the activity-read permission (no masked tier).
### ML-1a (TESTS, Tovu): security acceptance on the unmoved code
tests: new `features/mail-status/__tests__/activity-access.unit.test.ts`, `suppressions-access.unit.test.ts` (extend existing files where they exist). Fakes: recording `authorize`, recording repos. GREEN on the parent; deny tests first; one V3 mutation each.
1. No permission -> `MailActivityForbiddenError`, repo fake records ZERO calls (list, detail, suppression list).
2. Status permission only -> `access: "masked"`; every item has exactly the masked field set (assert the full key list: no `id`, no message id, no delivery mode, no original recipient, no provider diagnostics; the recipient equals `maskRecipient` output). Mutation: return `"full"` from the masked branch -> RED.
3. Status permission only + a recipient filter -> forbidden, zero repo calls. Status permission only + detail lookup -> forbidden, zero repo calls.
4. Activity-read permission -> `full`, ids present; detail returns the feedback timeline.
5. Suppression removal: a NON-owner who holds the manage permission is refused with "Only the site owner may remove a suppression." and zero repo calls; the owner with the permission passes; the owner WITHOUT the permission is refused; `ownerPrincipalId` absent -> refused. Mutation: delete the owner comparison -> RED.
6. Authorization revoked between plan and run: `planMailSuppressionRemoval` succeeds, the `authorize` fake then denies, `runMailSuppressionRemoval` is refused and the repo records no removal (pin today's behaviour; if today's code does not re-check, the case is reported as a requirement, not committed).
7. `maskRecipient` table (1-character local part, no `@`, unicode, long domain); limits 0, 1, 100, 101, non-number; cursor round trip; a tampered cursor refused; a changed entry between plan and run (pin and name today's behaviour).
Estimate: 120k.
### ML-1b (SEAM+MOVE): activity and suppression domain -> `@jini-ai/platform/mail`
precondition: `ls apps/website/src/features/mail-status/__tests__/activity-access.unit.test.ts`. THIRD_PARTY_ALLOWED: none.
- M2a (Tovu seam, own commit): new `features/mail/activity-vocabulary.ts` owns `MAIL_ACTIVITY_OUTCOMES`, `MAIL_ACTIVITY_USES` and their two types; BOTH consumers (`mail/activity.repo.ts`, `mail-status/activity.ts`) import them from it in this commit; the record and port types `activity.ts` and `suppressions.ts` need (`MailActivityFilter`, `MailActivityPosition`, `MailActivityRecord`, `MailActivityRepo`, `MailFeedbackRecord`, `MailSuppressionAdminRepo` and its entry types) move to `features/mail/activity-ports.ts` (types only), imported by the repos and the domain. The complete declaration disposition is `../inventory/mail.decls.tsv` filtered to `activity.repo.ts` and `suppression-admin.repo.ts`: every exported TYPE the domain imports moves to `activity-ports.ts`, every other declaration stays; a name not covered = STOP.
- M2b (Tovu seam, own commit): the domain takes its host inputs as one deps object: `authorize`, `workspaceId`, `permissions: { activityRead: string; status: string; suppressionsManage: string }` (ids stay in Tovu `permissions.ts`), `ownerPrincipalId: Promise<string> | undefined` (kept exactly: absent = refuse), the repos, `fail: (required: { message: string }) => Error` for input errors. The `"… or …"` permission wording in the forbidden error is built from the two passed ids (byte-identical for Tovu's ids: pinned by ML-1a).
- M3 (Jini): `packages/platform/src/mail/activity/{vocabulary,ports,activity,suppressions}.ts` + moved pure tests; leaf exports from the existing `./mail` entry; changeset `minor`.
- M4 (Tovu): delete `mail-status/activity.ts`, `suppressions.ts`, `mail/activity-vocabulary.ts`, `mail/activity-ports.ts`; repoint (`ML-1b.importers.tsv`); `mail/activity.repo.ts` imports the vocabulary and port types from `@jini-ai/platform/mail`. Routes and tool registrations stay in Tovu.
STOP: ML-1a tests need an edit other than the deps-object shape. Estimate: 160k.
### ML-2 (ON HOLD, not dispatchable): mail SQL repos -> `@jini-ai/platform/mail/sql` (judge finding 9: ACCEPTED)
8 files, 631 lines (`ML-2.files.tsv`). Blocked by three things the plan now names instead of assuming:
1. `@jini-ai/platform` does not declare `kysely` (checked: `rg -n kysely packages/platform/package.json` prints nothing on merge-final), and the source uses RUNTIME `sql` (`mail/activity.repo.ts:21`, `mail/retention.ts:3`). Owner decision D-ML1: add `kysely` to `platform` the way `cms` does (optional peer + dev dependency + the `jini` opt-in note: `packages/cms/package.json:128-143,463-490`), in its own JINI-ADD sheet ML-2p with the lockfile (`manifest:` sheet, 40k; precondition `echo "{DECISIONS}" | rg "D-ML1=approved"`; one commit: manifest + lockfile + changeset; V2 for `platform` must stay green with no source edit), serial with xpkg N1 (0b), which also edits `packages/platform/package.json`.
2. Lane S's SQL template is on HOLD (`plan/lanes-s-u-2026-11-16` e20e2955: "every sheet is on HOLD"). When it is released, ML-2 must fill every field of its worksheet: `port_compat`, `split`, `table_types`, `tables_binding`, `lock_keys`, `ports`, `characterization`, `tests_split`, `wiring`, `baselines`, `commits`. None is filled today.
3. `suppression-admin.repo.ts` removal: the ML-2 design must state whether removing a suppression deletes the row or tombstones it; an existing permanent delete is raised with the owner (rule 11), not moved silently.
Migrations `0023_mail_ledgers`, `0025_mail_feedback_processed`, `0029_mail_activity_indexes` are applied history and are never edited. Estimate when unblocked: design 60k Opus + about two runs, 240k.

## Could not verify
- That `maskRecipient` has no Jini twin beyond the name search. The admin Deployment and mail screens. The three plugin generator test suites were not run.
- Whether `runMailSuppressionRemoval` re-checks authorization (ML-1a case 6 decides it).
