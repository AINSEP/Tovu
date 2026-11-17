# DC, SI, ML: deploy config, site inspection, mail activity

Measured on Tovu merge-b dd70b057, Jini merge-b 674a19ea. Inventories `../inventory/{deployments,site-inspection,mail}.tsv`; guards and importer sites `DC-1.*`, `SI-1.*`, `ML-1.*`, `ML-2.*`.

## DC: deploy config
Size now: website `features/deployments` 39 files, 7,162 lines (tests 60 files, 14,300); admin `features/deployment` 27 files, 7,420. CLASSIFY-files labels 22 website files (5,453 lines); 17 files (1,709 lines) have no label. "Deploy config" itself is `deploy-config.ts` 374 (survey said 449) + `deploy-config-registry.ts` 175. audit2 A19 already labels `deploy-config.ts` and `dockerfile.ts` SPLIT; no A19 sheet exists on any `plan/audit2-sheets-*` branch, so DC-1 is that sheet for `deploy-config.ts` only (`dockerfile.ts` 167 stays with A19's admin source-editing slice).
Jini already owns the contract: `packages/devops/src/deploy/config-contracts.ts` (`DeploymentDescriptor`, `DeploymentSecret`, `RenderedDeployConfig`, `DeployConfigKit`, `DeployConfigGeneratorModule`) and `config-descriptors.ts` (`parseDeployConfigsFile`, containment check). Provider plugins exist: `packages/agent-plugins/{fly,render,railway}/deploy-configs/*.mjs`.
Split of `deploy-config.ts` (every top-level declaration):
| Declaration (lines) | Verdict |
|---|---|
| `assertNoConfigInjection` 289-303 + `containsAnyOf`, `hasLeadingHyphenOrSurroundingWhitespace`, two char lists 276-287 | MOVE -> `@jini-ai/devops/deploy` (generated-file injection guard; security-relevant) |
| `hostNotesFor` 72-83, `appendHostDeployNotes` 98-109, `readOptionalFile` 62-69, `HostDeployNotesPorts` | SPLIT: the merge of extra notes is generic (pure, takes `notesByTarget`); reading `content/agent-plugin-overlays/<plugin>/deploy-notes.json` from `process.cwd()` STAYS |
| `createDeployConfigKit` 112-118 | STAY (binds Tovu `ValidationError`) |
| `HOST_DEPLOY_ENV` 49, `REQUIRED_SECRETS` 216-221, `MIGRATIONS_NOTE` 237-238 | STAY (Tovu env policy and secret names; never in Jini) |
| `buildDeploymentDescriptor` 343-374, `extractOrThrow`, `readRepoFile` | STAY (reads Tovu's Dockerfile, package.json and a Tovu route source file) |
`deploy-config-registry.ts` (14 functions, all <= 14 lines): STAY as bindings over the trusted-plugin lifecycle; `DEPLOY_CONFIGS_FILENAME` is a saved-install name (same decision as D-SC2).
### DC-1 (READY): move the injection guard
1. T0 (Tovu tests, unmoved code): table test of `assertNoConfigInjection`: each of the 9 characters (`"`, LF, CR, `:`, `#`, `{`, `[`, `&`, `*`) alone -> refusal naming the right class; leading `-`; leading and trailing space; accepted values (letters, digits, `_`, `.`, `/`, inner `-`). One case per clause so that deleting any single clause turns exactly one case RED. Also: the thrown error is the host validation error class (HTTP 400 mapping), and the kit passes arguments POSITIONALLY `(fieldLabel, value)`: the plugin modules call it that way (`rg -n "assertNoConfigInjection\(" <jini>/packages/agent-plugins/{fly,render,railway}/deploy-configs/*.mjs`); the kit signature is a plugin ABI and does not change.
2. J1: `packages/devops/src/deploy/config-injection.ts`: `assertNoConfigInjection(required: { fieldLabel; value; fail: (message: string) => Error })` (the error class is injected; Jini cannot import Tovu's). Export from the `./deploy` entry leaf; tests moved with it; changeset `minor`.
3. T1: Tovu `createDeployConfigKit` binds it: `(fieldLabel, value) => assertNoConfigInjection({ fieldLabel, value, fail: m => new ValidationError({ message: m }) })`; delete the local copy; repoint the two test files and `cli/commands/deploy-config.ts` if it imports the function (check `DC-1.importers.tsv`).
STOP: any generator module throws a different error class after the change (run the three plugin test files in the cloud batch). Estimate: 90k tokens.

## SI: site inspection
Size now: `features/site-inspection` 11 files, 2,707 lines + `features/site-evidence` 3 files, 495 lines; tests 18 files, 4,287. (Survey counted only `published-page` 534 + `page-body` 108.)
| File | Lines | Verdict |
|---|---|---|
| `page-body.ts` | 114 | MOVE (pure HTML body shaping, `parse5`). `@jini-ai/diagnostics` does not declare `parse5` (deps: core, js-tokens, jszip): owner decision D-SI1 (add the dep, or home it in `@jini-ai/cms` which has it). Importers: 5 prod (also `features/post`, `features/web`), 3 tests |
| `published-page.ts` | 528 | SPLIT: path guard (`assertRawPathShape`, `assertNoTraversalSegment`, `resolveWithinOrigin`, `disallowedFormReason`, `resolveSameOriginPath` 158-324), `toCookieShapes` 338-349, `readBoundedBody` 364-396 -> `@jini-ai/diagnostics/web-evidence`; `openLoopbackSiteServer` 424-440 + `fetchPublishedPage` 489-528 (serve the Tovu app on a loopback port, `checkSitePathname` from Tovu routing) STAY |
| `live-url.ts` | 188 | STAY mostly: binds publish peers and publish history to list known origins; outbound call through Tovu `HttpClientPort` with `EgressRefusedError` |
| `section-collector.ts` 177 | MOVE (CLASSIFY) | not sheeted: no importer outside the folder besides the profile; move with its first second user |
| `site-profile.ts` 663, `site-capabilities.ts` 316, `deps.ts`, tools, `admin-screens.generated.ts` | STAY | product inventories; `site-profile.ts` is over the 500-line limit (size lane) |
DEDUPE warning (verified by reading both): Tovu `resolveSameOriginPath` rejects traversal segments, control characters and disallowed decoded forms; Jini `resolveSameOriginUrl` (`same-origin.ts:178`) only joins a path onto a base. They are NOT the same behaviour. Jini `normalizeSitePath` (`same-origin.ts:112`) may overlap: diff with one table of inputs run through both before choosing an owner.
### SI-1 (READY after D-SI1)
T0 (Tovu, unmoved code), each a deny test written first: traversal (`..`, encoded, double-encoded, backslash), absolute URL to another origin, protocol-relative `//host`, control character, over `MAX_PATH_LENGTH` (2,048: test 2,047 / 2,048 / 2,049), query kept, fragment handling as today; `readBoundedBody`: at `maxBytes`-1, `maxBytes`, `maxBytes`+1, stream error, reader cancelled on overflow (assert `cancel` called); `toCookieShapes` never returns a cookie VALUE (assert on a sentinel value). J1 moves the three groups with their why-comments; `PublishedPagePathError` moves with the guard (callers use `instanceof`: the class identity must be the one Jini export, imported by every Tovu catcher, 6 prod importers). T1 repoints and deletes. The loopback fetch keeps calling the moved guard BEFORE opening the socket (order test). Estimate: 170k tokens.

## ML: mail activity
Size now: `features/mail-status` 13 files, 1,618 lines; `features/mail` 12 files, 813 lines; tests 13 files, 2,186. Jini has `@jini-ai/platform/mail` (27 files) and `@jini-ai/core/contracts/mail`. audit2 A27 labels five OTHER files (`email-templates/{agent-tools,tool-registrations}`, `mail-status/{provider-tool-registrations,use-readiness}`, `mail/feedback-sources`); no file is shared with ML-1/ML-2. lost-updates SITES rows 36-38 name `mail-status/provider-tool-registrations.ts` and `mail/retention.ts` (no change planned there).
### ML-1 (READY): activity and suppression domain -> `@jini-ai/platform/mail`
`activity.ts` 222 (11 exports: `maskRecipient` 93, limits 25/100, cursor read/next, query parse, access resolve, list, get) and `suppressions.ts` 161 (query parse, list, removal plan/run). Both import only `@jini-ai/core`, `@jini-ai/platform/mail` types, the two repo port TYPES and `permissions.ts`.
- Host passes: `authorize` (`AuthorizeFn`), the three permission ids (values stay in Tovu `permissions.ts`, which imports `@jini-ai/user-management`: the ids go in as strings), the repo ports, the error factory for `ToolInputError`.
- Move the repo port TYPES (`MailActivityPosition`, `MailSuppressionAdminRepo`, entries) to `@jini-ai/core/contracts/mail` first; the SQL classes follow in ML-2.
- T0 deny tests first: a principal without the read permission gets `MailActivityForbiddenError` and the repo fake records ZERO calls; removal requires the manage permission (read alone is refused); `maskRecipient` table (1-char local part, no `@`, unicode, long domain: pin today's output exactly); limit 0, 1, 100, 101, non-number; cursor round trip `nextMailCursor` -> `readMailCursor`; a tampered cursor is refused; `planMailSuppressionRemoval` then `runMailSuppressionRemoval` with a changed entry in between (pin today's behaviour, name it in the report).
- Routes stay in Tovu (`routes/system`), tool registrations too (K-TOOLS-PATTERN later).
Estimate: 150k tokens.
### ML-2 (READY as a T-SQLREPO sheet after ML-1 and lane S0 pins): mail SQL repos -> `@jini-ai/platform/mail/sql` (NEW node subpath)
8 files, 631 lines (`ML-2.files.tsv`); template `lanes-2026-11-16/T-SQLREPO.md` (lane S). Table and index names are passed by Tovu; migrations `0023_mail_ledgers`, `0025_mail_feedback_processed`, `0029_mail_activity_indexes` are applied history and are never edited. `retention.ts` (45) is labelled DEDUPE: diff against `platform/mail` retention before deleting. `ledger.repo.ts` has 8 prod importers: trace each. Owner check: `platform` importing `kysely` types follows the precedent only if `platform/package.json` already lists it (`node -e` check in the sheet's step 0; else STOP, rule 9). Estimate: 180k tokens.

## Could not verify
- That `maskRecipient` has no existing Jini twin beyond the name search (`rg -n "maskRecipient"` in Jini `packages/` found none).
- The admin Deployment and mail screens. The three plugin generator test suites were not run.
