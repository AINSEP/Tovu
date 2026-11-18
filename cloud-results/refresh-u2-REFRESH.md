# U2c-1 refresh — execution prepared

Date: 2026-11-18. Scope: U2c-1 only. The supplied sheet and its COMMON rules govern, with the dispatch's explicit overrides: no tests/builds/installs/typechecks/linters, no repo-wide or MCP searches, and read-only `.git`. No bootstrap folder is expected. No Jini changes are part of this section.

Tovu: `codex/refresh-u2` at `2d82735a6767fb8572e6a10bf3be6ee2eb07b8f4`. Jini at `/Users/la/Programming/Jini` reports `main` and was read only. This is a Tovu-only section, so no paired Jini prerequisite is required. The previous refresh established that the planned Tovu base `232764af5` is an ancestor. On this rerun all **71 corrected pre-edit guards** below were re-read with `git hash-object`: no further differences. Only the two existing refresh documents were untracked before implementation.

## Owner decision resolved; execution authorized

The earlier run stopped on the missing `features/member-login/__tests__/link-policy.test.ts`. Read-only `git show b7993547d --stat` confirms commit `b7993547d5b1595e9049ad8d96824d82e760b16c` deleted that 41-line test, its 39-line local owner, and the facade export; the only link-service edit changed the import to `@jini-ai/user-management/server`. Its message is `refactor(member-login): link decision from @jini-ai/user-management/server`; it says the facade export had no importer. The commit did not move the test cases to another file.

**SUBSTANTIVE discrepancy, explicitly resolved by the rerun's owner decision:** drop this deleted path from the gate. Do not restore it or add unrelated policy tests. The corrected gate is 55 surviving facts test/fixture paths plus the two allowed S0 pin test paths (57 paths total). All remaining mismatches are BENIGN. No unresolved decision blocks U2c-1.

## Blob mismatches

All paths in this table are relative to `apps/website/src/`. Each new blob is a corrected guard for the current pre-edit tree, not permission to widen U2c-1.

| Path | Class | Difference and corrected fact |
|---|---|---|
| `features/members/agent-tools.ts` | BENIGN | `members_list.limit` gained `clamp: true`. It changes a roster-read schema unrelated to the write-service split. Still 157 lines; U2c-1 does not edit this file. |
| `assistant/__tests__/tool-registrations.contracts.test.ts` | BENIGN | Other catalogs moved to Jini; host read references are resolved; schema-repair assertions were added. Existing members catalog and registration coverage remains. Now 993 lines. No U2c-1 import rewrite is needed here. |
| `features/members/__tests__/agent-tools.contract.test.ts` | BENIGN | Expected roster-read schema now includes `clamp: true`. Still 35 lines. |
| `features/mail-status/__tests__/mail-status-tool.test.ts` | BENIGN | SMTP construction now uses the Jini adapter plus `toPositionalMailer`; members barrel usage is unchanged. Now 208 lines. |
| `features/mail-status/__tests__/provider-tools.unit.test.ts` | BENIGN | Mail configuration types now come from Jini; members barrel usage is unchanged. Now 160 lines. |
| `features/trash/__tests__/member-adapter.test.ts` | BENIGN | Trash catalog/SQL adapter imports moved to Jini and receive `kernel`/`TRASH_TABLES`. Its `membersWriteService` assembly import is unchanged and remains valid after U2c-1. Now 370 lines. |
| `features/members/__tests__/tool-registrations.model-facing-errors.test.ts` | BENIGN | Roster-read tests now expect declared page-size clamping and normalization notes. Write-service contracts and imports are unchanged. Now 386 lines. |
| `platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts` | BENIGN | Positional mailer types now come directly from Jini. Still 131 lines. The existing source-reader and `requestSignInLink` import must follow group C during execution; assertions must remain intact. |
| `server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts` | BENIGN | The payments migration now receives an explicit `runMigrations` dependency. Members imports are unchanged. Now 235 lines. |
| `features/member-login/__tests__/link-policy.test.ts` | SUBSTANTIVE, RESOLVED | Deleted with its local owner; owner explicitly permits dropping it from the gate if its cases did not move. Confirmed below. |

## Other refreshed facts and scope

- The four production edit targets (`write-service.ts`, `password-auth.ts`, `index.ts`, `tool-registrations.ts`) matched their original guards. All A/B/C/D/E/V/F declarations, dependencies and comments were unchanged. The six destination paths were absent before editing.
- The module-scoped token helper, fallback hasher and per-hasher dummy cache remain owned by group A. B preserves workspace/realm/purpose scope, single-use consumption, attempt reservation and exact known refusal handling. C keeps mail readiness, verified-origin resolution and redirect filtering in Tovu.
- The only additional inspected write-service consumers are the allowed S0 pins: `__tests__/lane-su-pins/p2-member-one-lock.test.ts` and `p5ab-member-bearer-digest.test.ts`. Both now import the owning modules; their assertions and fakes are unchanged. The ten original direct test importers remain. The three production importers remain the barrel, password auth and tool registrations.
- The named purpose-scoped-mailer test also reads the service as source. Its read target follows C to `member-challenge-request.ts`; its existing assertions remain intact.
- `scripts/inv-su.py`, `scripts/rep.py` and `scripts/facts.py` are absent, as recorded in the prior refresh. The explicit guard ledger replaces regeneration for this authorized rerun. No generated facts file was edited and no repo-wide census was attempted.
- S0's `schemaErasedKernel` and P2/P5a/P5b sources were established in the previous refresh. Runtime success remains unverified under the no-execution rule. A07 is not a prerequisite for U2c-1. No later U2 section was executed.

## Baseline reference corrections (BENIGN, pre-edit)

Named baseline files were read directly. The relevant stored member rows are unchanged; references moved because unrelated entries were removed. These are the pre-edit references. Execution later removed only the 22 moved write-site rows and the one obsolete link-service → write-service architecture row. The write inventory's 18 consent, 2 mailer, 2 in-memory repo and 22 write-service entries retain their counts. The architecture baseline still contains the obsolete `member-login/link-policy.ts -> members/types.ts` row; that is pre-existing debt and was not removed.

| Baseline | Planned reference | Current reference |
|---|---|---|
| `development/scripts/write-path-inventory.baseline.json` | consent lines 2120..2273, stride 9 (18 rows) | 2016..2169, stride 9 |
| same | mailer lines 2282, 2291 | 2178, 2187 |
| same | repo.memory lines 2300, 2309 | 2196, 2205 |
| same | write-service lines 2416..2605, stride 9 (22 rows) | 2312..2501, stride 9 |
| `development/scripts/check-architecture.baseline.json` | ports 209; types 208, 210, 368; write-service 211 | ports 199; types 198, 200, 358; write-service 201 |
| same | auth-mail 217; subscriber-directory 218; members barrel 305; access-resolver 370 | 207; 208; 295; 360 respectively |
| `development/scripts/size-debt.json` | tool-registrations 887 | 852 |

## Complete pre-edit guard ledger

Every path below was checked individually. `MATCH` means both blob and line count match the supplied facts. `BENIGN` entries are explained above. Paths are relative to `apps/website/src/`.

| Path | Planned blob | Current blob | Planned/current lines | Result |
|---|---|---|---|---|
| `features/members/access-resolver.ts` | `00941106f75fb68a0102d3a8547114e45f8148cd` | `00941106f75fb68a0102d3a8547114e45f8148cd` | 237/237 | MATCH |
| `features/members/agent-tools.ts` | `f0f22c026b2fc85b402c91081e03cc3a251b4489` | `7626ce2111943541441f3d900deece210c70d7db` | 157/157 | BENIGN |
| `features/members/auth-mail.ts` | `1f3578a9650cb69ff147d1a3dee38e5175d9857c` | `1f3578a9650cb69ff147d1a3dee38e5175d9857c` | 25/25 | MATCH |
| `features/members/capability-card.ts` | `370d296ce9612c4a155f7c39fcc996a312f15321` | `370d296ce9612c4a155f7c39fcc996a312f15321` | 29/29 | MATCH |
| `features/members/consent-service.ts` | `8fc2d60b80d018c4cdae854c876fe1123c573b6a` | `8fc2d60b80d018c4cdae854c876fe1123c573b6a` | 261/261 | MATCH |
| `features/members/index.ts` | `baba94f173833f504710ba5c0dd5bd965b22d4e7` | `baba94f173833f504710ba5c0dd5bd965b22d4e7` | 134/134 | MATCH |
| `features/members/mailer.console.ts` | `04c24d36b96f92f0d69ed4d5f1e900c1ca73d549` | `04c24d36b96f92f0d69ed4d5f1e900c1ca73d549` | 93/93 | MATCH |
| `features/members/password-auth.ts` | `784c43d36923ecba69e870bbdd55de0014d97804` | `784c43d36923ecba69e870bbdd55de0014d97804` | 204/204 | MATCH |
| `features/members/ports.ts` | `de4363a1a6f7a23a2270deedede16fd94d0bf537` | `de4363a1a6f7a23a2270deedede16fd94d0bf537` | 329/329 | MATCH |
| `features/members/repo.memory.ts` | `e9c47e01cc3a3c82d1d3aa2f1dd53d8b521ffbd7` | `e9c47e01cc3a3c82d1d3aa2f1dd53d8b521ffbd7` | 508/508 | MATCH |
| `features/members/subscriber-directory.ts` | `f427192a652a591cc3240a46e7262f523d5d408d` | `f427192a652a591cc3240a46e7262f523d5d408d` | 133/133 | MATCH |
| `features/members/tool-registrations.ts` | `c0f2f3735168c8f6ce9405c6b2de32a23c85e4d8` | `c0f2f3735168c8f6ce9405c6b2de32a23c85e4d8` | 332/332 | MATCH |
| `features/members/trash-member.ts` | `d5e0b93dd00e589a3df51fe7de447cfed1def707` | `d5e0b93dd00e589a3df51fe7de447cfed1def707` | 24/24 | MATCH |
| `features/members/types.ts` | `d2736f906190684631540dcb8f148448f0055c91` | `d2736f906190684631540dcb8f148448f0055c91` | 326/326 | MATCH |
| `features/members/write-service.ts` | `a149c07c12d9b0365ccafa2998cba72b1e7af9bd` | `a149c07c12d9b0365ccafa2998cba72b1e7af9bd` | 677/677 | MATCH |
| `features/members/__tests__/access-resolver.test.ts` | `89e4f85aa3e91612793805b4051959b5c29ac4db` | `89e4f85aa3e91612793805b4051959b5c29ac4db` | 418/418 | MATCH |
| `features/members/__tests__/restart.integration.test.ts` | `523fedf1b32a1edb481f8c0661abe3008330ffd2` | `523fedf1b32a1edb481f8c0661abe3008330ffd2` | 86/86 | MATCH |
| `features/members/__tests__/write-service.test.ts` | `08702037e2e5d7d783a2ad7397b4dafaea1f6a32` | `08702037e2e5d7d783a2ad7397b4dafaea1f6a32` | 1137/1137 | MATCH |
| `server/inbound/admin-http/routes/members/__tests__/disable.test.ts` | `0224ac4bcb1fa8a476f38bdfecd2b218045c4eee` | `0224ac4bcb1fa8a476f38bdfecd2b218045c4eee` | 217/217 | MATCH |
| `server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts` | `8d05b7d6699ed210aacd3f51e112f25c0a632342` | `8d05b7d6699ed210aacd3f51e112f25c0a632342` | 376/376 | MATCH |
| `assistant/__tests__/tool-registrations.contracts.test.ts` | `ad6d976fa9a8f9ff9a7a6f4a75642af3147a570a` | `65a7c5f03e8c6505392cbe3b577a55fefdc11bf0` | 897/993 | BENIGN |
| `assistant/__tests__/tool-registrations.members.test.ts` | `1a77afccedd7b45e61c009a92a0ebc673bed157b` | `1a77afccedd7b45e61c009a92a0ebc673bed157b` | 451/451 | MATCH |
| `features/members/__tests__/agent-tools.contract.test.ts` | `edd24b618ba280a7daedc5c59455d27f632b75ed` | `63b23f548bb91f0d577a766403f89d83b86e862e` | 35/35 | BENIGN |
| `features/members/__tests__/consent-service.test.ts` | `2af33b12ed4b39b50a8996b458881341ba815e19` | `2af33b12ed4b39b50a8996b458881341ba815e19` | 292/292 | MATCH |
| `assistant/site/__tests__/member-access.fixture.ts` | `f1c85de9c73586cd36c1f93fd6f50af59a2c1b65` | `f1c85de9c73586cd36c1f93fd6f50af59a2c1b65` | 14/14 | MATCH |
| `features/mail-status/__tests__/mail-status-tool.test.ts` | `5a1abb071141aefe7d81a7759d89af31bcf68c4e` | `a5f4250bb398a1a241b5b3cc5e4164cf37c86715` | 206/208 | BENIGN |
| `features/mail-status/__tests__/provider-tools.unit.test.ts` | `d6a25d8cb737a7365a388cb4511a15a6ae2ee1ff` | `a27ff637df92776c53dbbd74d4c1e18b0f363e48` | 159/160 | BENIGN |
| `features/site-backup/__tests__/library-share.integration.test.ts` | `fc14314bfc4bb7915cc7370365ff7b58dc7a69b4` | `fc14314bfc4bb7915cc7370365ff7b58dc7a69b4` | 358/358 | MATCH |
| `server/__tests__/media-original-video-route.test.ts` | `d183e39a6b26a540136d6fa98998850b05ad305c` | `d183e39a6b26a540136d6fa98998850b05ad305c` | 312/312 | MATCH |
| `server/__tests__/media-rendition-gating-bypass.test.ts` | `7f956fb282ffcc32bcc93f61175b7ea4573a8bbc` | `7f956fb282ffcc32bcc93f61175b7ea4573a8bbc` | 798/798 | MATCH |
| `server/__tests__/media-rendition-route.test.ts` | `da3683ba803db4096be131038dd9a00ba9cadd42` | `da3683ba803db4096be131038dd9a00ba9cadd42` | 548/548 | MATCH |
| `server/__tests__/routes/bare-page-site-serving.test.ts` | `35519a538f421cd77864fd47350db05d05b4e5c2` | `35519a538f421cd77864fd47350db05d05b4e5c2` | 266/266 | MATCH |
| `server/__tests__/routes/content-post-get-by-slug.test.ts` | `be5e182c0ac5504e99fb788b7bff5fbb7fd17456` | `be5e182c0ac5504e99fb788b7bff5fbb7fd17456` | 282/282 | MATCH |
| `server/__tests__/routes/member-oidc-auth.test.ts` | `a906a521aa885e64e4920f56fe7c53f7e2155f3e` | `a906a521aa885e64e4920f56fe7c53f7e2155f3e` | 460/460 | MATCH |
| `server/__tests__/routes/member-oidc-callback.unit.test.ts` | `75d2b948ebd57cf019f57c41f254a7922e2e1bac` | `75d2b948ebd57cf019f57c41f254a7922e2e1bac` | 83/83 | MATCH |
| `server/__tests__/routes/member-password-auth.test.ts` | `ccba41091ae080d745d4aae3e3228c6fb632d09a` | `ccba41091ae080d745d4aae3e3228c6fb632d09a` | 587/587 | MATCH |
| `server/__tests__/routes/members-auth.test.ts` | `49f84315cb52975238ae4263dd14d6443ed4b58a` | `49f84315cb52975238ae4263dd14d6443ed4b58a` | 430/430 | MATCH |
| `server/__tests__/routes/members-public-complete-sign-in.test.ts` | `413b8bd41a8e1be568d4af8defd615c44b4837a8` | `413b8bd41a8e1be568d4af8defd615c44b4837a8` | 337/337 | MATCH |
| `server/__tests__/routes/members-public-sign-in.test.ts` | `beb42193d7602326a4d6c1e9b14605d01a2e9e4f` | `beb42193d7602326a4d6c1e9b14605d01a2e9e4f` | 365/365 | MATCH |
| `server/__tests__/unit/server-modules.unit.test.ts` | `655ed4065ffbdf81911ac0fafb0c85d05814ba9d` | `655ed4065ffbdf81911ac0fafb0c85d05814ba9d` | 99/99 | MATCH |
| `server/inbound/admin-http/routes/members/__tests__/disable.unit.test.ts` | `0e3827946573099e858e058f9b5acb6ec8f97c78` | `0e3827946573099e858e058f9b5acb6ec8f97c78` | 40/40 | MATCH |
| `server/inbound/admin-http/routes/members/__tests__/unit/h4-magic-link.unit.test.ts` | `deeba1a69ab48a2453bc633ebf50e847550b6ba1` | `deeba1a69ab48a2453bc633ebf50e847550b6ba1` | 56/56 | MATCH |
| `server/inbound/public-http/routes/members/__tests__/unit/h4-oidc.unit.test.ts` | `fd0bcca830b4d840dbc4d3924fb03924e796229e` | `fd0bcca830b4d840dbc4d3924fb03924e796229e` | 135/135 | MATCH |
| `server/inbound/public-http/routes/site/__tests__/integration/media-replace-cache.integration.test.ts` | `9c2eae529d7089a78d77733b7bce80f03e81c6d9` | `9c2eae529d7089a78d77733b7bce80f03e81c6d9` | 148/148 | MATCH |
| `server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts` | `89766672c3de2f14be94d36d88ff82f2f7b60973` | `89766672c3de2f14be94d36d88ff82f2f7b60973` | 259/259 | MATCH |
| `server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts` | `a8d7073243c64975dd1290ef7e30b4b46c005cc2` | `a8d7073243c64975dd1290ef7e30b4b46c005cc2` | 216/216 | MATCH |
| `server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts` | `011928a79010bc21b8ad22e447c7de27bdb13ac7` | `011928a79010bc21b8ad22e447c7de27bdb13ac7` | 393/393 | MATCH |
| `features/members/__tests__/magic-link-mail-off.test.ts` | `62bc6bd59f2487a73cd8a809a32a52afa219fc72` | `62bc6bd59f2487a73cd8a809a32a52afa219fc72` | 96/96 | MATCH |
| `features/members/__tests__/mailer.console.test.ts` | `e3cb39095b96eb9574694f419d8d5cc498f9060f` | `e3cb39095b96eb9574694f419d8d5cc498f9060f` | 239/239 | MATCH |
| `features/members/__tests__/password-auth.test.ts` | `d5a42e3ecf837ae4adc2ab55cf681f3edf4af814` | `d5a42e3ecf837ae4adc2ab55cf681f3edf4af814` | 401/401 | MATCH |
| `features/members/__tests__/password-lifecycle.dialects.test.ts` | `9d0aeee1cdffa7e1b6921fbbabea2dc335afb3b0` | `9d0aeee1cdffa7e1b6921fbbabea2dc335afb3b0` | 240/240 | MATCH |
| `features/members/__tests__/credentials-revocation.dialects.test.ts` | `9805806144f6df1d35ffdc2847f58b3998447b8e` | `9805806144f6df1d35ffdc2847f58b3998447b8e` | 135/135 | MATCH |
| `features/members/__tests__/member-auth-repo.dialects.test.ts` | `a82c96d9b38e99fe4303557180031620b702980a` | `a82c96d9b38e99fe4303557180031620b702980a` | 140/140 | MATCH |
| `features/members/__tests__/member-external-identities.contract.ts` | `e16b5deaf44d088788c8727c4c8b4c23c44e166e` | `e16b5deaf44d088788c8727c4c8b4c23c44e166e` | 116/116 | MATCH |
| `features/members/__tests__/member-repo.list-cursor.test.ts` | `e50d6485a037c59cda79a05d8c4d51f3bcd6407f` | `e50d6485a037c59cda79a05d8c4d51f3bcd6407f` | 74/74 | MATCH |
| `features/members/__tests__/repo.contract.test.ts` | `a7438828cc2390a151a08a9de87abd7cafae177b` | `a7438828cc2390a151a08a9de87abd7cafae177b` | 464/464 | MATCH |
| `features/members/__tests__/tier-repo.lost-update.test.ts` | `f19e2cb3cb15f3aac479a5ff598e37e536a5fbce` | `f19e2cb3cb15f3aac479a5ff598e37e536a5fbce` | 64/64 | MATCH |
| `features/trash/__tests__/member-adapter.test.ts` | `f2658334970b73a7790ffe38f1f7967fdebbf336` | `2cdb0f86f0938ba210a6fdd7292b06a9556fe680` | 369/370 | BENIGN |
| `features/member-login/__tests__/link-service.dialects.test.ts` | `6b9a5b54d58d5fcb933b28ba13d6d6e21c2ad872` | `6b9a5b54d58d5fcb933b28ba13d6d6e21c2ad872` | 55/55 | MATCH |
| `features/member-login/__tests__/link-service.test.ts` | `6a208ebe6552551e9286c60f187338818e6dcdd3` | `6a208ebe6552551e9286c60f187338818e6dcdd3` | 280/280 | MATCH |
| `features/members/__tests__/member-external-identities.dialects.test.ts` | `d2b3c6f0ec9f59bb55dd73fb63f633751a350245` | `d2b3c6f0ec9f59bb55dd73fb63f633751a350245` | 35/35 | MATCH |
| `features/members/__tests__/repo.memory.test.ts` | `b1842d90c930a26109301a3a14bff35430c6f658` | `b1842d90c930a26109301a3a14bff35430c6f658` | 129/129 | MATCH |
| `features/members/__tests__/subscriber-directory.test.ts` | `2d8654448af675efa977ca2a11980dc300a8a91c` | `2d8654448af675efa977ca2a11980dc300a8a91c` | 146/146 | MATCH |
| `features/members/__tests__/tool-registrations.model-facing-errors.test.ts` | `99a97b1fd7d0af9b0c74ce8901aa43b4d6d80690` | `2246952e8d6d2cb38ed674a087469f81024562f2` | 380/386 | BENIGN |
| `features/members/__tests__/write-service.guards.test.ts` | `874a172fa137869c18d937b108a7d7e4be299199` | `874a172fa137869c18d937b108a7d7e4be299199` | 42/42 | MATCH |
| `platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts` | `c62c73438071c5bef139b8f9065f1545c31a2d74` | `b546f2b4af81e05bfcb8ab4612759ed2b4ef0e4d` | 131/131 | BENIGN |
| `server/inbound/public-http/routes/commerce/__tests__/purchase.integration.test.ts` | `6e537bccff5aa8db329a00f3ead22079f995234a` | `6e537bccff5aa8db329a00f3ead22079f995234a` | 214/214 | MATCH |
| `server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts` | `e4271dfaddd2d34c53ad69595da8e2dc4fa2a5e6` | `a70046284f2afe5a973411a8334659eead55560f` | 234/235 | BENIGN |
| `features/member-login/__tests__/link-policy.test.ts` | `47d6544eddf462edc2c4856b97d3e0699073ab77` | `MISSING` | 41/0 | SUBSTANTIVE — resolved by owner gate removal |
| `features/members/__tests__/invariants.test.ts` | `1b3f0488c6e6a24fe997f7e4402745de2dbed598` | `1b3f0488c6e6a24fe997f7e4402745de2dbed598` | 159/159 | MATCH |
| `features/members/__tests__/repo.dialects.test.ts` | `f114d078a47484db4c2f027c58226d23fbcba23b` | `f114d078a47484db4c2f027c58226d23fbcba23b` | 603/603 | MATCH |

## Execution and read-only review

T0 tests were written on the unsplit service before production edits. The T0-only patch was captured at `/tmp/u2c-1-T0.patch`; it uses the original module paths. The final working tree includes the T1 importer rewrites. See COMMIT-PLAN.md for the intended logical commits and cloud verification handoff.

T1 splits A/B/C/D/E/V into the six named modules and leaves F in `write-service.ts`. `requestPasswordReset` and its why-comment move from password auth into C. Cross-file helpers are exported at their owner, with no forwarding exports. Existing barrel exports are grouped by local owner under U2c-1's explicit barrel allowance. No API behavior was intentionally changed. In particular, U2c-3's observer-reporting change was not applied: the existing observer catch moves verbatim.

Source review compared all 27 original function declarations/bodies against their destinations, allowing the necessary `export` prefixes and `sessionTokens` → `memberSessionTokens` naming. All bodies matched. The four admin exports also gain the unused optional object parameter required by the owner API rule; their required objects and callers are unchanged. The moved `requestPasswordReset` body also matched. All original comments remain present. New file line counts: credentials 70, challenge 93, challenge-request 151, sign-in 151, admin-writes 186, validation 14. Every moved function is at most 50 nonblank, noncomment lines by source reading. No lint/complexity result is claimed.

Explicitly listed consumers were reviewed for moved names and local exports; none still imports a moved function from `write-service`. All seven barrel lines for this split are allowed replacements of the existing U2c-1 surface: admin writes, sign-in completion, credentials, assembly, challenge request, password auth and requestPasswordReset. No new public symbol was added to that barrel. The A ← B ← C/D imports and V ← C/D imports introduce no cycle; E is independent, F composes C/D/E, and password auth no longer imports C.

Only the 22 old write-service write-site baseline rows and one obsolete architecture edge targeting the moved write-service functions were removed. Neither baseline gained lines. Existing unrelated duplicate-import patterns were observed in listed files and left unchanged. No new import suppressions, casts, dependencies, schema changes, permanent deletes or re-export shells were added.

Reuse: credentials, challenge lifecycle, request, sign-in, admin writes and validation reuse the unchanged sheet-named owners; inspected all 27 functions and their named consumers, then moved them without introducing alternate behavior owners. The sheet authorizes this in-place split before the later Jini moves. No new resource bounds, query fan-out or algorithm was introduced.

Architecture/source review: PASS within U2c-1's specified file map and move-only boundaries. Runtime validation: NOT RUN by explicit machine rule. Test RED/GREEN, typechecks, boundary and numerical complexity gates remain for the cloud runner. No test assertions or injections were removed or weakened. `.git` was not modified; no process remains running.

## Characterization and mutations for cloud verification

| Test/case | Status | Mutation expected to turn it RED |
|---|---|---|
| `U2c-1: dummy credentials cache the same promise per hasher` (password-auth test) | New | Allocate `dummyHashes` inside `dummyPasswordHash`, or cache one promise globally across hashers. |
| `U2c-1: injected hasher wins and the fallback is one stable instance` | New | Always return the fallback; separately create a new fallback per call. |
| `U2c-1: two failed password sign-ins and one unstored code share one dummy hash` | New | Give password and challenge completion separate caches, or skip the unstored-code decoy verify. Expected: one hash and three verifies of that hash. |
| `reset rejects sign-in purpose; no hash write and no consumption` | Existing, strengthened to assert MemberAuthError and the same message | Drop purpose from challenge scope/decision. |
| `U2c-1: challenge consume maps only the known refusal ... to false` (3 cases, guards test) | New | Remove each known-repo-refusal mapping, causing it to throw. |
| `U2c-1: challenge consume propagates an outage unchanged` | New | Catch every consume error and return false. |
| `shard C: ... consumes the shared challenge and prevents both kinds of replay`; `parallel wrong codes spend at most five attempts` | Existing, retained | Skip consumption or attempt reservation/limit. |
| `requestSignInLink carries an encoded redirectPath in the mailed link`; `shard C: unsafe redirect ... is omitted` (8 cases) | Existing, retained | Accept every path in `safeRedirectPath`, or reject the valid local path. |
| `T013: unverified origin refuses before lookup, token storage or sending` | Existing, retained | Skip verified-origin refusal; downstream lookup/save guards or expected refusal fail. |

Seven new runtime test cases (three password/cache cases and four consume cases), plus one strengthened existing purpose case. Mutations were specified, not applied or executed. All existing replay, attempt-limit, redirect, origin and dialect assertions remain intact.
