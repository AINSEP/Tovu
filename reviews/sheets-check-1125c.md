DONE 2/16/10; NEEDS-OPUS 2

# Round-3 build-sheet check (read-only): w3c-w1a, w3c-w1b, w3c-w2 (2026-11-25)

**Input:** Tovu `origin/plan/whats-left-1122:plans/sheets-1125/w3c-{w1a,w1b,w2}.md` at commit `d5b30f30b` (28 sheets; the headers claim 105 MOVE).
**Checked against:** the merge-23 tips Tovu `5ae429b34` and Jini `be24f1189`. The sheets were written on Tovu `c0f1068a59` and Jini `fd06f45b12`. Since then 53 Tovu files and 50 Jini files have changed. Three of the changed files are source files these sheets move: `F/entries/publish-content.ts`, `F/trash/trash-item-tool.ts` and `F/widgets/publish-content.ts`. The Jini changes that matter are in `cms/src/publish/content/{raw-row-contributor,repo-handler}.ts`, `cms/src/core/mutation-actor.ts` and `cms/src/entries/*`. Every anchor into those files was re-checked on the tips (see W1-06, W1b-03 and W1b-08).
**Bootstrap:** I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2, 2026-11-05) first and checked the sheets for boundaries, ownership and implementation constraints. I wrote no ADR, because this is a review, not a design.
**Method:**
- Four read-only Sonnet subagents ran the 7 checks: w1a sheets 01–05, w1a sheets 06–11, w1b, and w2 head-to-head against w1a/w1b.
- I did the cross-set scripts myself: overlap of the classification tables, overlap with the round-1 and round-2 sheet tables, and the move claims.
- I re-checked every load-bearing subagent claim against the code: package dependency lists, the `{ kind: "user" }` guesses, the cms/integrations imports, the root-key code and the share-database code.
- I settled the dedupe and the disagreements between subagents myself, and I wrote the two NEEDS-OPUS sheets.
- Nothing in any repo was changed, built or tested, and no codebase-memory tools were used.
- Round-1 decisions X1–X5 and the round-1 owner answers in `origin/plan/sheets-check-1125:reviews/sheets-check-1125.md` were applied as binding.

## Verdict counts

| set | sheets | APPROVE | FIX | REJECT | NEEDS-OPUS (split-off sub-sheets) |
|---|---:|---:|---:|---:|---:|
| w3c-w1a | 11 | 1 | 8 | 2 | 1 (W1-01B) |
| w3c-w1b | 9 | 1 | 8 | 0 | 1 (W1b-09c) |
| w3c-w2 | 8 | 0 | 0 | 8 | 0 |
| **total** | **28** | **2** | **16** | **10** | **2** |

Each NEEDS-OPUS row is one part split out of a FIX sheet. The rest of that sheet stays SOL. Both replacement sheets are written out in full in Appendix A, so Sol can build them without another design run.

## Cross-set findings (the per-set checks could not see these)

### R3-X1. w3c-w2 is a near-total duplicate of w3c-w1a and w3c-w1b. Reject all eight w2 sheets.
- **Root cause.** `plans/count-1124/count2-w2.md` §4 lists 46 NOT-CHECKED paths. 44 of them are also in `count2-w1.md` §4, which is the same cause as round-1 X3. 43 of w2's 45 table rows are also classified in w1a (rows 108–122) or w1b. The two rows only in w2 are `publish-content/ui/policy.ts` (STAYS-HOST) and `site-backup/static-download-layout.ts` (ALREADY-MOVED). Neither is a MOVE. w2 also leaves out `webhooks/site-key-sources.ts`, which w1b row 240 covers as STAYS-HOST.
- **The real totals.** The 289 files are **245 unique**. The 105 MOVE are **83 unique**: 38 in w1a and 45 in w1b. Of those, 54 are sheeted in round 3: w1a 38 and w1b 16. The other 29 are already sheeted elsewhere: 28 w1a SKIP rows and 21 w1b "R2" rows in round 2 (all 49 are in round-2 tables, checked by script), and 8 w1b "R1" rows in round 1. The w2 header counts 8 STAYS-HOST, but its table has 7.
- **Dedupe: one sheet per file.** The full merge text is under each kept sheet below.

| file group | kept sheet | rejected twin | why |
|---|---|---|---|
| `project-keys/{attachments,shared-oauth-disconnect}.ts` | **w1b-01** (FIX) | w2-01 | w2-01 puts the attachment SQL in `@jini-ai/db`, an infrastructure package, so feature SQL would land in a catch-all. Round-1 X3 makes `user-management/project-keys` the owner. Both sheets must send the disconnect to `integrations` (see the FIX). |
| post files: 8 in w1a 108–122, plus `post/{repo,reverters}.ts` | **W1-11, then w1b-02** (both FIX) | w2-02 | w2-02 does not define `hashState`, leaves out the `notHeldAgentSchedule` seam, and names 3 mutations for 10 files. The fixed W1-11 already carries the round-2 order (61/62/33/34) and the run-actor fix. The order W1-11 → w1b-02 settles who edits `repo.ts`: W1-11 moves the codecs, then w1b-02 moves the class over the Jini codec. |
| `publish-content/{publish-backstop-row.sqlite,tool-registrations}.ts` | **w1b-03** (FIX) | w2-03 | w1b keeps the binder in its current file. w2 renames binders into new `*-binding.ts` files, which means more importer changes and broken round-2 anchors. |
| `site-backup/{tool-registrations,share-database/repo.sqlite}.ts` | **w1b-06** (FIX) | w2-04 | Same reason. |
| `site-export/route-manifest.ts` | **w1b-05** (FIX) | w2-05 | w2-05 splits `readThemeAndPosts`, which changes the call order and the parallel read. |
| `site-inspection/tool-registrations.ts` | **w1b-07** (FIX) | w2-06 | w2-06 renames the binder and breaks the anchors of round-2 sheets 76–77. |
| `trash/adapters/user.ts`, `trash/permissions.ts` | **w1b-08** (FIX) | w2-07 | **Security:** w2-07's store port has no session-revocation operation, so a faithful build could drop "hide revokes all sessions" (`F/trash/adapters/user.ts`, `sessionsRevoked`). It also has no guard-before-write test. |
| `webhooks/{site-key-ensure,secret-scan-guard}.ts` | **w1b-09** (FIX + 09c NEEDS-OPUS) | w2-08 | w2-08 has no test or mutation for "refuse to mint or restamp over key-dependent data". That is the one regression that leaves sealed data undecryptable. |

### R3-X2. Round-3 sheets against round 1 and round 2
- **W1-09 duplicates round-1 `w3-ext-w2` J08/T08** (same source `F/newsletter/http-error-responses.ts:28–111`, same destination, same signature, same mutation). REJECT W1-09 and build J08 then T08. W1-09's extras are folded into T08 (see the w1a table).
- **W1-11 against round-2 `w3b-ext-w2b` sheets 61/62/63 and `w3b-arch` sheet 34.**
  - Sheet 61 already moves `RemovePostFn`/`ForgetRemovedPostFn` to `core:contracts/site/cms-post-tools`. W1-11 must not create `core:contracts/site/post-removal`. The same applies to w1b-02's local `forgetRemoved` type: use `ForgetRemovedPostFn` from `cms/src/widgets/host-ports.ts:41`.
  - Sheet 62 moves `restorePostForward` into the same cms folder.
  - Sheet 34 threads the run actor through `F/post/publish-content.ts`, which W1-11 deletes.
  - **Order:** 61 → 62 → 33 → 34 → W1-11 → w1b-02.
- **Guessed actors (H2).** Jini's `applyRunActor` (`cms/src/publish/content/repo-handler.ts:452`) now refuses a write with no actor. The tips still guess `{ kind: "user" }` at `F/forms/publish-content.ts:60` and `F/post/publish-content.ts:521`, which I checked. Moving either line as written would ship the guess into Jini. The fixes for W1-07 and W1-11 swap in `applyRunActor`, each with a named mutation.
- **W1-01** must follow round-2 `w3b-arch` R03, which edits `exports/source.ts:35` and `install-upload.ts:137,234`. Its Pages importers must take the diagnostic type from core (`core/src/contracts/site/page-html-store.ts:3`, which already exists), because round-2 J19 moves the Pages store into cms.
- **W1-04** must follow round-1 ext-w1 J15, round-1 ext-crp CRP-02 (human confirmation) and the ext-a `publish-history` edit, and must re-check its anchors after round-2 w2b repoints the vendor types.
- **w1b-01** edits four Tovu files that round-1 ext-w1 J05/T04 also edits (`owner-store.ts`, `shared-api.unit.test.ts`, `shared-owner.integration.test.ts`, `shared-oauth-disconnect.unit.test.ts`), plus `a02-credential-contract.pin.unit.test.ts`, which ext-w2 J01 edits. The import lines differ, so apply them one after the other and re-check the line numbers.
- **w1b-07** must follow round-2 sheets 76–77, which edit `F/site-inspection/tool-registrations.ts:14,195`.
- **w1b-08** must follow round-2 sheets 88–89: same core `contracts/site/cms-trash` module, same import blocks in `F/trash/{permissions,trash-item-tool,index}.ts`, and `F/trash/move-to-trash.ts:19` is owned by round 2.
- **W1-08 and w1b-08 against the round-2 `w3b-arch` producer ledger (~406, 451).** Both raw `outbox_events` inserts (`identity/user-purge.ts:87` and `trash/adapters/user.ts:82`) stay raw inserts in a **Tovu** binder. Neither sheet decides producer policy, so only the ledger anchors change.
- I found no other round-3 MOVE claimed by a round-1 or round-2 sheet. I checked every assigned round-3 MOVE path against `→`/`Delete` claims in all 14 round-1/2 sheets.

### R3-X3. Recommended build order for round 3 (after the round-1 order in the round-1 review)
1. Round-1 ext-crp CRP-01/02, round-1 ext-w2 (including J08/T08), and round-1 ext-w1 J05/J15/T04.
2. Round-2 `w3b-arch` R03 and sheet 34. Round-2 `w3b-ext-w2b` sheets 61, 62, 33, 76–77 and 88–89.
3. w1a: W1-10, W1-02, W1-03, W1-06, W1-07, W1-08, then W1-01 (without the automatic row), then W1-04A→D.
4. w1a W1-11, then w1b-02.
5. w1b: 04, 05, 01, 03, 06, 07, 08, then 09a.
6. NEEDS-OPUS sheets, once built and reviewed: W1-01B and W1b-09c.

---

# Set: w3c-w1a (11 sheets; the first 122 paths of `count2-w1` §4)

## Verdict table

The full literal fix text is in Appendix B, sections "w1a part 1" and "w1a part 2", under the same sheet id. The text below is binding where it differs from Appendix B.

| sheet | verdict | exact fix text |
|---|---|---|
| W3C-W1-01 agent-plugin exports/upload/enable/update | **FIX** + split-off **W1-01B NEEDS-OPUS** | Apply Appendix B "w1a part 1" W1-01 items (1)–(n) as written, with these changes:<br>• Take the `automatic-agent-plugins.ts` row, its importer bullet, its test and its export out of this sheet, and build it as W1-01B (Appendix A2).<br>• Take the diagnostic type from core (`core/src/contracts/site/page-html-store.ts:3`, which already exists) and repoint `F/pages/html-document-store{,.memory}.ts` there, not to agent-plugins.<br>• Name the binder `F/agent-plugins/set-enabled-binding.ts`.<br>• Correct the anchor `install-response.unit.test.ts:7` to `:8`.<br>• Add an order line: "Build after round-2 `w3b-arch` R03 (it edits `exports/source.ts:35`, `install-upload.ts:137,234`); re-grep those lines first." |
| W3C-W1-02 API-connection vault records/attempts/archive | **FIX** | Appendix B W1-02 (1)–(n):<br>• The entry is `node`, not universal, because `token-store/vault-token-store.ts:11` imports `node:crypto`.<br>• The expiry sweep has no cap (`vault-stores.ts:86–92`). Do not add one.<br>• Import the token codec directly from Jini; there are no host aliases.<br>• Use the literal `ApiConnectionArchiveEntry` and `ApiConnectionVaultPolicy` types.<br>• Name the binder `F/api-connections/vault-store-binding.ts`.<br>• Add the five extra mutations. Consume-once, CAS and scope-before-parse ordering are kept. |
| W3C-W1-03 custom-credential confirmation + write-files validation | **FIX** | Appendix B W1-03 (1)–(6):<br>• Add the missing Package section. `write-files-validation` is `node` (it uses `Buffer`).<br>• Name the binder `F/custom-credentials/repository-target.ts`.<br>• Rewrite all nine call sites from positional to `{ validateTarget }`.<br>• Add mutations `CRED-WRITE-ALLOW-GIT-DIR`, `CRED-WRITE-ALLOW-DOTDOT`, `CRED-BRANCH-ALLOW-DOTDOT-SEGMENT` and `CRED-DELETE-REVIEW-DANGER-OFF`. |
| W3C-W1-04 deployments (14 files, about 3,500 lines) | **FIX (split into W1-04A–D)** | Appendix B W1-04:<br>• A = registries plus the ops catalog. B = credentials (security-critical). C = adapter, inspection, publish-history and publish-run. D = publish-tool-deps, domain-publish-tool and publish-agent-tools. Build A→B→C→D, each with its own changeset.<br>• Use the literal `PublishCredentialPolicy` with five members, so devops gets no integrations edge.<br>• Inject `catalogModule` and `ui://tovu`.<br>• Rows 46 and 52 become DELETE (re-export shell).<br>• **Package edge (my check):** devops lists `@jini-ai/platform` only as a devDependency (`devops/package.json:740`), and its runtime `dependencies` are `@jini-ai/core` only. The checker's B text imports `normalizeCredentialToken` etc. directly from platform, so W1-04B must also add `"@jini-ai/platform": "workspace:^"` to devops `peerDependencies`, with a `jini.optionalPeers` message in the existing style. devops `src` already value-imports `@jini-ai/platform` today without that declaration, so this also closes an existing gap. Name it in the changeset.<br>• Add mutations `DEPLOY-CHOSEN-ID-IGNORE-PUBLISH-HOSTS`, `DEPLOY-CHOSEN-FALLS-TO-DEFAULT`, `DEPLOY-RESOLVE-CROSS-WORKSPACE-ID` and `DEPLOY-READ-OPENS-VAULT`.<br>• Order: after round-1 ext-w1 J15, ext-crp CRP-02 and the ext-a `publish-history` edit. Re-check anchors after round-2 w2b. |
| W3C-W1-05 email-template storage | **REJECT** | Reclassify row 57 `email-templates/operations.ts` from M to H. It is Tovu's binding of `PostRecord` and the Pages store onto platform's `EmailTemplateStore`. The `rows` port mirrors `PostRepoPort` one to one, so the move leaves an adapter of the same size behind. The destination also implies a new user-management→platform edge: user-management depends only on core (`user-management/package.json:743–748`), which I checked. Nothing replaces this sheet. |
| W3C-W1-06 collection-entry publish | **FIX** | Appendix B W1-06:<br>• Re-anchor on the tip: `:26–38, 40–49, 51–107, 109–115, 117–184`.<br>• Move `actor: applyRunActor({ deps, principalId })` (tip `:90`) verbatim.<br>• Add the test "write outside an apply run throws `MissingMutationActorError` before `importEntry`", with mutation `ENTRY-PUBLISH-GUESS-USER-ACTOR`. |
| W3C-W1-07 form-definition publish | **FIX** | Appendix B W1-07:<br>• Re-anchor: contributor `:29–77`, writer calls `:69,70,73`, `publishableForm` `:83–85`.<br>• Replace the guessed actor at `:60` with `applyRunActor({ deps, principalId })`.<br>• Type `write` from the wrappers at `F/forms/index.ts:98,117`.<br>• Add the test "form publish write outside an apply run is refused before any writer call", with mutation `FORM-PUBLISH-GUESS-USER-ACTOR`. |
| W3C-W1-08 user purge (deletion) | **FIX** | Appendix B W1-08:<br>• Name the binder: `bindSqlUserPurgePorts({ kernel, eventValues }, _optional = {})` in `F/identity/user-purge-sql-binding.ts`.<br>• Rewrite the 12 `new SqlUserPurge(...)` call sites.<br>• Keep the exact eight-step delete order inside one transaction. `appendOutbox` stays a raw insert in Tovu (round-2 producer ledger).<br>• Add mutations `PURGE-OUTBOX-AFTER-COMMIT`, `PURGE-EVENT-BEFORE-DELETES`, `PURGE-REORDER-PRINCIPAL-FIRST`, `PURGE-SKIP-VAULT` and `PURGE-SCOPE-OMIT-WORKSPACE`, plus the two Tovu SQL witnesses (issuer-key row kept, other-workspace row with the same principal id kept). |
| W3C-W1-09 newsletter refusals | **REJECT (duplicate)** | Build round-1 `w3-ext-w2` J08 then T08 instead. Fold W1-09's extras into T08:<br>• the comment rewording at `F/newsletter/tool-registrations.ts:9`, `S/inbound/admin-http/routes/newsletter/__tests__/error-mapping.test.ts:23` and `C/modules/newsletter.ts:109`;<br>• the `S/INFO.md:89` update;<br>• the why-comments-debt entry;<br>• the `jini.entries` line.<br>**Correction to the checker's note:** `@jini-ai/cms` is only a devDependency of user-management (`package.json:758`). J08's type-only structural match needs no runtime cms import, which is correct. |
| W3C-W1-10 plugin widget partials | **APPROVE** | None. Anchors `:3–21` are exact, and the importers (`response.ts:2`, `contribution-runtime.integration.test.ts:20`) are complete. Keep the `plugins:runtime/widget-partials` path. |
| W3C-W1-11 post storage/tools/publish | **FIX** | Appendix B "w1a part 2", W1-11 fix text items 1–6:<br>• Order after round-2 61→62→33→34.<br>• Use sheet 61's `core:contracts/site/cms-post-tools`. Do **not** create `post-removal`.<br>• Import `restorePostForward` from `./post-trash.js`.<br>• Thread `applyRunActor` at tip `:521`, with mutation `POST-PUBLISH-GUESS-USER-ACTOR`.<br>• Use the literal duplicate-handler `selectors` signature.<br>Also merge from the rejected w2-02:<br>• `sha256Hex({ text }, _optional = {})` is the single hash seam.<br>• The memory-repo importers listed in the W1-11 "Memory repo direct" ledger must all be repointed. None may keep importing a deleted `repo.memory.ts`. |

## Classification corrections (w1a)

| file | Codex verdict | correct verdict | why |
|---|---|---|---|
| `email-templates/operations.ts` (57) | M | **H** | See W1-05. |
| `deployments/publish-credentials/index.ts` (46) | H | **DELETE (re-export shell)** | W1-04 deletes it. It is a 29-line barrel, and the owner rule bans keeping one. |
| `deployments/static-publish/index.ts` (52) | H | **DELETE (re-export shell)** | Same, a 56-line barrel. |
| `agent-plugins/soon-lock.ts` (23) | A | **A (source already deleted)** | The file is gone at the tip, which I checked. Jini `agent-plugins/site/soon-lock` owns it. |
| `newsletter/http-error-responses.ts` (80) | M (W1-09) | **M, owned by round-1 J08/T08** | This is a duplicate sheet. |

Spot-checks: 10 H, 9 A and 3 M rows in rows 1–66, and all 8 H, all 10 A and all 28 SKIP rows in rows 67–122, were checked. All 28 SKIP rows appear in round-2 tables (checked by script). I found no other misclassification. The `apply-connect-defaults` and `host-tool-ports` rows were checked by size only.

## Plain words (w1a)
- The classification is sound: one wrong MOVE (the email-template store, which is a host binding) and two barrels that are really deletions.
- Most sheets are correct in intent but leave Sol to invent something: a binder file name, a policy type, a Package section, or an entry classification. The `node` versus `universal` classification was wrong twice. The fix text closes each of those gaps literally.
- Two things are real hazards:
  - **Guessed actors.** The forms and post publish contributors still build `{ kind: "user" }`, which Jini now refuses. Moving them verbatim would ship the guess into Jini.
  - **Missing mutations on deletion and credentials.** User purge, vault records and publish credentials had too few named mutations. Purge regressions in the SQL binder could not be caught by the Jini fake-port tests.
- W1-09 duplicates a round-1 sheet. W1-04 is too large for one Sol run, so it is split in four.

---

# Set: w3c-w1b (9 sheets; paths 123–243 of `count2-w1` §4)

## Verdict table

The full literal text is in Appendix B "w1b" (FIX 01…FIX 09) and Appendix B "w2" ("Fix text (literal)", the merge items for each kept w1b sheet). The text below is binding where it differs.

| sheet | verdict | exact fix text |
|---|---|---|
| W3C-w1b-01 project-key attachments + shared OAuth disconnect | **FIX** | Apply Appendix B w1b "FIX 01" items 1–3:<br>• **The disconnect moves to `J/integrations/src/api-connections/shared-oauth-disconnect.ts`**, export `./api-connections/shared-oauth-disconnect`, entry `node`. Its source imports `disconnectApiConnection`/`ApiConnectionError` from integrations (`F/project-keys/shared-oauth-disconnect.ts:2`), and user-management depends only on core. I checked both.<br>• **Attachments stay in `J/user-management/src/project-keys/sql/attachments.ts`** (round-1 X3 makes user-management the project-keys owner). Inject `credentialTypeText`, use the literal `AttachmentSqlPort`/`AttachmentPolicy`, and import `RawBuilder` from the `kysely` optional peer.<br>• Drop the "if the owner insists on user-management" fallback.<br>Merge these tests from w2-01:<br>• `retry of an already revocation-pending connection does not advance generation or revision a second time` (mutation `PK-REGENERATE-ON-RETRY`, source `:51–55`);<br>• `inspect reads no token` (the stub `tokensFor` throws);<br>• `grants are removed before any provider call` (mutation `PK-DISCONNECT-REVOKE-BEFORE-GRANT-REMOVAL`);<br>• the over-cap mutation `PK-ATTACH-LIMIT-OFF-BY-ONE`.<br>Order: apply after round-1 ext-w1 J05/T04 and ext-w2 J01, which share edit files, and re-check those import lines. |
| W3C-w1b-02 post repository + reverters | **FIX** | Apply Appendix B w1b "FIX 02":<br>• Move only `F/post/repo.ts:44–369`. `notHeldAgentSchedule` (`:41`, which names `agent_pause_holds`) stays in Tovu and is passed in.<br>• Jini exports only `SqlPostRepo`. Tovu keeps `postRepoFor`.<br>• The PGlite/Postgres parity fixtures stay in Tovu.<br>Also:<br>• Replace the local `forgetRemoved` dependency type with `ForgetRemovedPostFn` from `cms/src/widgets/host-ports.ts:41`.<br>• **Build after W1-11.** The class then imports the Jini codec `./repo.rows.js` relatively.<br>• Add w2-02's mutations `POST-REVISION-READ-BEFORE-LOCK` and `POST-REVERT-FORGET-INDEPENDENT-MARKER` if they are missing. |
| W3C-w1b-03 publish raw-row adapter + tool orchestration | **FIX (narrowed)** | **03a (raw-row SQLite port): as sheeted, plus Appendix B w1b "FIX 03a".**<br>• Add the literal `copy` type.<br>• State the `tableInfo` ABI change and keep the host binder's current outer signature.<br>• Why-comments move.<br>• Add w2-03's mutation `PUBLISH-LOOKUP-BEFORE-POLICY` (a denied table never reaches introspection).<br>• The Jini tip change did not touch `RawRowPort`, and all 7 importers match.<br>**03b (the registrar) is replaced by this narrower move.** Move only the pure, host-free helpers from `F/publish-content/tool-registrations.ts` to `J/cms/src/publish/content/tool-helpers.ts`:<br>• `publishContentDerivedRisk` `:86–104` (with every why-comment; tool ids from `./agent-tools.js`);<br>• `MACHINE_TOKEN` + `plainSentence` `:115–135`;<br>• `acceptedPullReport`, `pullCounts`, `pullTitle`, `requiredPullBundleId` and `pullOverwriteKeys` `:463–496`.<br>Signatures become `acceptedPullReport({ report }, _optional = {})`, `pullCounts({ report }, _optional = {})` and `pullTitle({ row }, _optional = {})`; the others already take objects. Rewrite their call sites in the same file (`:238–328`). Imports: `ToolInputError` from `@jini-ai/core`, and `entityKey`/`PublishContentReport` from `./plan-rows.js`.<br>The orchestration stays in Tovu for this wave: `chooseDestination`, `readReadiness`, `connect*`, `buildPublishContentRegistrations`, `selectPullPeer`, `pullHooks`, `pullToolBoundary` and `modelFacingPullError`. It imports Tovu's gated-mutation gateway errors (`:17`), human confirmation (`:16`, which round-1 CRP-02 moves) and Tovu's `pull.js`/`publish-tool.js`/`type-registry.js`. It will be re-sheeted after CRP-02 on the round-2 recovery-registrar pattern (`w3b-ext-w1`, `F/recovery/tool-host.ts`).<br>Remove `export { publishContentDerivedRisk }` (`:384`). Repoint `F/publish-content/__tests__/backstop-gaps-tool.test.ts:4` (risk) and `publish-agent-tools.test.ts:16` (`plainSentence`) to `@jini-ai/cms/publish/content/tool-helpers`.<br>**Tests first** (`publish/content/__tests__/tool-helpers.test.ts`), each with its mutation:<br>• "a message with an underscore token falls back whole" (`PUB-PLAIN-SENTENCE-PATCH-TOKEN`);<br>• "a refused report throws instead of returning an empty plan" (`PUB-PULL-ACCEPT-REFUSED`);<br>• "1001 overwrite keys are refused" (`PUB-PULL-OVERWRITE-UNBOUNDED`);<br>• "publish, plan, execute and connect are never `none`" (`PUB-RISK-MARK-PUBLISH-READONLY`).<br>**Package:** `./publish/content/tool-helpers` (universal) plus the `jini.entries` line, replacing the sheet's `./publish/content/tool-registrations` export. The changeset stays `.changeset/w3c-w1b-publish-tools.md`.<br>Re-check `F/publish-content/__tests__/publish-tool.test.ts:9`, which changed after the pin. |
| W3C-w1b-04 source-control provider aggregation | **APPROVE** | None. Refusal order is: source refusals in place, then duplicate refusals in the order the duplicates are first detected. |
| W3C-w1b-05 static export route manifest | **FIX** | Merge from w2-05 (Appendix B w2, "KEEP w1b-05" items 1, 2 and 4):<br>• Each invocation copies the seeded route and skip lists before editing them.<br>• Keep `activeTheme`'s absent representation through a conditional spread.<br>• Use one mutation name, `EXPORT-IGNORE-EXPLICIT-THEME-OVERRIDE`.<br>• Update the three comment-only pointers.<br>• Keep w1b's single `readThemeAndPosts` (parallel read). |
| W3C-w1b-06 site-backup projection + tool admission | **FIX (06a only)** | **06a (`F/site-backup/tool-registrations.ts:43–253` → `devops:backup/site/tool-registrations`): as sheeted, plus Appendix B w1b "FIX 06a".**<br>• Add the literal order line: permission before download, upload consumption and registry writes, with no reordering while splitting.<br>• `catalog` is the host-built catalog that is passed in.<br>• From w2-04 item 3: update the dynamic import at `F/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts:40` and the citations at `development/parity/tool-guides.json:2292` and `development/assistant-prompts/capability-prompts.md:719`.<br>**06b (`share-database/repo.sqlite.ts`) is dropped.** Reclassify that file STAYS-HOST (see corrections):<br>• Its code runs on `KyselyKernel`/`listTables`/`declareDataModule` from `@jini-ai/db`, and devops has no db dependency (its only runtime dependency is `@jini-ai/core`; core, daemon and platform appear only as devDependencies at `devops/package.json:738–740`).<br>• About 60% of the file is Tovu-schema projection (`media`, `asset_blobs`, `asset_renditions`, settings), which the sheet itself keeps host-side.<br>• The portable remainder (about 100 lines of sequencing) would need either a new devops→db edge or a port redesign that the checker could not make mechanical.<br>Delete the 06b bullets, its export `./backup/site/share-database/repo.sqlite`, and its `projection.test.ts`. |
| W3C-w1b-07 site-inspection registrar | **FIX** | Apply Appendix B w1b "FIX 07":<br>• The registrar, not the fetchers, keeps the order `requireInputRecord` → path → body options → origin type → `requireToolPermission` → missing-client refusal → injected fetch (`tool-registrations.ts:177–193`).<br>• `toSiteProfileDeps`/`toSiteCapabilitiesDeps` are evaluated per call.<br>• **Build after round-2 sheets 76–77.**<br>From w2-06:<br>• Use conditional spreads for the optional `sections`/`pageLimit`/`origin`.<br>• Use one mutation name, `INSPECTION-FETCH-BEFORE-AUTH`. |
| W3C-w1b-08 trash visibility + user trash adapter | **FIX** | **Replace the user-adapter bullet with w2's store-port text** (Appendix B w2, "KEEP w1b-08" item 1). The Jini adapter takes a transaction-scoped port with `readPrincipal`, `readDisplayUsername`, `compareAndSetStatus` (returns the affected-row count), **`revokeSessions`** (returns the deleted count), `appendEvent` and `underPrincipalLock<T>`.<br>• The raw `outbox_events` insert, the `eventValues` encoder and the `lazyKernel` legacy-handle adaptation all stay in Tovu's `F/trash/adapters/user.ts` binder. user-management imports neither cms nor db; `user.ts:7` imports `lazyKernel` from cms, which I checked.<br>• The trash shapes come from core `contracts/site/cms-trash`.<br>• Add the lock text and the tests `zero-row user CAS emits no identity event` (`TRASH-USER-EVENT-ON-CAS-MISS`) and `purge joins the principal lock` (`TRASH-USER-PURGE-OUTSIDE-LOCK`).<br>• Keep `USER-TRASH-DROP-STATUS-CAS` and `USER-TRASH-GUARD-AFTER-WRITE`. Hide must still revoke every session in the same transaction.<br>• The lock key `trash:user:<ws>:<id>` stays host vocabulary.<br>• **Order after round-2 sheets 88–89.** Re-check `F/trash/{permissions.ts:22–27, trash-item-tool.ts:48–53, index.ts:58,73–85}` and the R2-owned `move-to-trash.ts:19`.<br>• In `J/cms/src/trash/ports.ts`, keep each moved name as `export type { X } from '@jini-ai/core/contracts/site/cms-trash'` in that same file and add no new file (owner question 9).<br>• `trash/permissions.ts` is MOVE (small: `trashPermissionFor`, `mayActOnEntityType`, `filterVisibleTrashItems`, `trashDaysRemaining`). The permission map stays in Tovu.<br>• `trash/adapters/redirect.ts` is not touched. |
| W3C-w1b-09 webhook root keys + repo secret scan | **FIX (09a)** + split-off **09c NEEDS-OPUS** | **09a (scanner): Appendix B w1b "FIX 09", 09a bullet.**<br>• Ranges `172–196, 197–277, 278–404`, so that no function is cut. Git execution and `isAllowlisted` stay in Tovu.<br>• `SecretScanViolation` moves.<br>• Add mutations `REPO-SCAN-REPORT-MATCH-TEXT` (no matched value appears in the serialized violations for the tip or the history), `REPO-SCAN-EXEMPT-BY-TEXT-ONLY` and `REPO-SCAN-RETURN-RAW-MATCH`.<br>• Keep the scanner CLI fixture note (`secret-scan-guard.test.ts:203,205`).<br>**09b (ordered keyring) is dropped.** `keyring.env.ts` is STAYS-HOST. Its two behaviors become Tovu-side pins in the existing keyring tests: `a changed recovery file is read on the next derivation` (`ROOT-KEY-CACHE-LIVE-READ`) and `a present invalid source never falls through` (`ROOT-KEY-SKIP-INVALID`). Remove the `./secrets/root-key/ordered-source-keyring` export.<br>**09c (reconciler): build from Appendix A1 instead of the sheet text.**<br>• The package line becomes `./secrets/root-key/reconcile` = `node`.<br>• The changeset is split: `w3c-w1b-repo-secret-scan.md` (diagnostics) and `w3c-w1b-root-key-reconcile.md` (platform). |

## Classification corrections (w1b, including the disagreements settled against w2)

| file | Codex verdict (w1b / w2) | correct verdict | why |
|---|---|---|---|
| `webhooks/keyring.env.ts` | MOVE·09 / H | **STAYS-HOST** | The portable part is about 17 lines (`:147–157, 221–227`). The ranges the sheet gives for it (`:373–405`) are host inspect/reveal presentation, and w1b's own cutover text keeps the file as "the actual adapter". |
| `trash/trash-item-tool.ts` | A / H | **STAYS-HOST** | A host roster plus copy, and a 35-line bind to CMS derive functions (`:51,53,55`, unchanged by the post-pin edit). |
| `trash/permissions.ts` | MOVE·08 / H | **MOVE (small)** | About 60 lines of kind-agnostic visibility logic are not in Jini. The permission map stays in Tovu. |
| `trash/adapters/redirect.ts` | A / MOVE | **ALREADY-MOVED** | Tovu holds only table names, status literals and a 5-line cascade over Jini `flipMarker`/`compareAndDelete`/`lazyKernel`. |
| `site-backup/import-keep-off.ts` | A / H | **ALREADY-MOVED** | Binding only, over the Jini keep-off flow. |
| `site-backup/sources.ts` | A / H | **ALREADY-MOVED** | Binding only: producer identity and placement. |
| `site-backup/share-database/repo.sqlite.ts` | MOVE·06 / MOVE | **STAYS-HOST (this wave)** | See w1b-06. Owner question 7. |
| `publish-content/tool-registrations.ts` | MOVE·03 / MOVE | **MOVE, partial** | The pure helpers move now. The orchestration is deferred until after CRP-02 (owner question 8). |
| `trash/db-port.ts` | H | H (note) | A 2-line `TrashDb = ContentKernel` alias, a cosmetic shell left for later. |

## Plain words (w1b)
- The table is accurate. Every MOVE row probed still lives in Tovu, every ALREADY-MOVED row opened really imports a Jini export, and all 49 rows deferred to round 1 or round 2 are in those rounds' tables.
- The sheets fail on package boundaries:
  - The OAuth disconnect and the user-trash adapter were sent to user-management, which cannot import the integrations, cms or db code they use.
  - Two sheets (03b and 06b) tried to move host-composed code (the publish registrar and the share-database projection) behind port bags that nobody designed.
- **Narrowing instead of NEEDS-OPUS.** I narrowed those two to what is mechanical now, rather than leaving them as design work:
  - 03b moves only its pure helpers.
  - 06b stays in the host for this wave.
- **Root-key reconciler.** It is the one piece that guards against unrecoverable data loss. Its sheet cut functions in half and had no result type, so I wrote it out in full (Appendix A1).
- **Security ordering is kept and pinned by named mutations:**
  - grant removal before revoke;
  - stamp check before write;
  - status CAS before session revocation;
  - permission before staging.

---

# Set: w3c-w2 (8 sheets; `count2-w2` §4, 46 paths)

## Verdict table

| sheet | verdict | exact fix text |
|---|---|---|
| W3C-w2-01 project keys + OAuth disconnect | **REJECT (duplicate of w1b-01)** | Build w1b-01 as fixed above. Its retry and no-token tests are merged into w1b-01. Do not put feature SQL in `@jini-ai/db`. |
| W3C-w2-02 post repos/tools/publish | **REJECT (duplicate of W1-11 + w1b-02)** | Build W1-11, then w1b-02. The `sha256Hex` seam, the `notHeldAgentSchedule` seam and the extra mutations are merged there. Do not create `core:contracts/site/post-removal`. |
| W3C-w2-03 publish backstop rows + tool ceremony | **REJECT (duplicate of w1b-03)** | `PUBLISH-LOOKUP-BEFORE-POLICY` is merged into w1b-03a. `PUBLISH-DROP-REVIEWED-PLAN-HASH` belongs to the deferred registrar re-sheet. |
| W3C-w2-04 site-backup tools + share projection | **REJECT (duplicate of w1b-06)** | The importer and citation updates are merged into 06a. The projection is not moved this wave. |
| W3C-w2-05 static export route manifest | **REJECT (duplicate of w1b-05)** | Items 1, 2 and 4 are merged into w1b-05. |
| W3C-w2-06 site-inspection registrar | **REJECT (duplicate of w1b-07)** | The conditional-spread rule is merged into w1b-07. |
| W3C-w2-07 redirect + user trash adapters | **REJECT (duplicate of w1b-08; security gap)** | The store-port text, lock text and two tests are merged into w1b-08, together with the session revocation that w2-07 left out. The redirect adapter is ALREADY-MOVED, so nothing replaces that half. |
| W3C-w2-08 root keys + repo secret scan | **REJECT (duplicate of w1b-09)** | Merged into w1b-09a and Appendix A1: `ROOTKEY-RETURN-CANDIDATE`, the production no-source/no-write rule (kept in the Tovu wrapper and pinned by the existing Tovu tests), the "extraction only, do not change race/fsync" rule, and `REPO-SCAN-EXEMPT-BY-TEXT-ONLY`/`REPO-SCAN-RETURN-RAW-MATCH`. |

## Classification corrections (w2)
- The two rows only in w2 (`publish-content/ui/policy.ts` H and `site-backup/static-download-layout.ts` A) are correct and need no sheet.
- `webhooks/site-key-sources.ts` (in `count2-w2` §4 but missing from w2's table) is STAYS-HOST, as w1b row 240 has it.
- The header's "8 STAYS-HOST" should read 7.
- Its verdicts on `trash/permissions.ts` (H → MOVE) and `trash/adapters/redirect.ts` (MOVE → A) are wrong. See the w1b corrections.
- 13 of the 15 STAYS-HOST/ALREADY-MOVED rows spot-checked held.

## Plain words (w2)
- Two count reports listed the same 44 files, and the sheet writer for this set did not notice that the other two round-3 sets already covered them. So every MOVE in w2 has a twin sheet that would move the same file to a different place or under different binder names.
- The w1a/w1b twins are better, mainly because they keep binders in their current files and carry the sharper security tests. In one case it matters directly: w2's user-trash port left out session revocation.
- So all eight w2 sheets are rejected, and their few good details are merged into the kept sheets.

---

# Owner questions (only new ones; the coordinator applies the recommended answer)

1. **Where does the shared-OAuth disconnect live?** *Recommend `@jini-ai/integrations/api-connections/shared-oauth-disconnect`*, beside `shared-api.ts`. It is typed against integrations, and user-management depends only on core.
2. **Where does the project-key attachment SQL live: user-management `project-keys/sql` with an injected JSON reader, or `@jini-ai/db`?** *Recommend user-management*, which keeps the project-keys feature in one package (round-1 X3). db stays infrastructure-only.
3. **Split W1-04 (deployments, about 3,500 lines) into W1-04A–D?** *Recommend yes*, built A→B→C→D, with B (credentials) reviewed by Opus before merge.
4. **W1-04B: a `PublishCredentialPolicy` interface, or a new devops→integrations edge?** *Recommend the policy interface.* No new package edge.
5. **Does the email-template store stay in Tovu (W1-05 rejected)?** *Recommend yes.* It is a binding, and moving it would leave an adapter of the same size behind.
6. **Should forms publish follow the run-actor rule now (W1-07), instead of carrying the guessed `{ kind: "user" }` into Jini?** *Recommend yes, now.*
7. **Does the share-database projection (`site-backup/share-database/repo.sqlite.ts`) stay in Tovu this wave?** *Recommend yes.* Moving it needs either a devops→db edge or a designed port. Revisit only if a second host needs site sharing.
8. **Should the publish-content registrar orchestration wait until after CRP-02, on the round-2 recovery-registrar pattern?** *Recommend yes.* Only the pure helpers move now (w1b-03b narrowed).
9. **Inside `cms/src/trash/ports.ts`, which still holds real declarations, is `export type { X } from '@jini-ai/core/contracts/site/cms-trash'` allowed for the moved trash shapes?** *Recommend yes.* A file that keeps real declarations is not a re-export shell, and `TrashActor` already follows this pattern.
10. **Split w1b-09 and drop its keyring part (`keyring.env.ts` STAYS-HOST)?** *Recommend yes.* The scanner (09a) is SOL now, and the reconciler (09c) is built from Appendix A1.
11. **Is a core `static-publish-review` contract wanted (W1-04)?** *Recommend no.* Declare the review port once in `devops:deploy/site/publish-tool-deps`.
12. **Count-report hygiene.** *Recommend* that the next count dedupe across all `count2-*` §4 lists before sheeting. 44 of the 289 "never-checked" files were listed twice, and w2 sheeted all of them again.

# Owner safety rules: status in these sheets

| rule | status |
|---|---|
| Logins are never erased | **Kept and pinned.** User trash hide still revokes sessions only inside the status-CAS transaction (`USER-TRASH-DROP-STATUS-CAS`). The guard runs before any write (`USER-TRASH-GUARD-AFTER-WRITE`). w2-07, which lost session revocation, is rejected. |
| Deletion only behind checks | User purge keeps one transaction and the exact delete order, with five named call-order and scope mutations. Root-key move-aside never deletes (`ROOT-KEY-DELETE-INSTEAD-OF-MOVE-ASIDE`). |
| Credentials | Vault consume-once, CAS and scope-before-parse ordering are kept (W1-02). The disconnect checks the revision and digest, then removes grants, then calls the provider; no token is read during inspection (w1b-01). The explicit credential-id grant and cross-workspace checks are pinned (W1-04B). The scanner never returns matched bytes (09a). |
| No VACUUM in a migration / migrations | None of these sheets adds or changes a migration. |
| Share links never break | Untouched. The share projection stays in Tovu this wave. |
| Themes untouched | Kept. No sheet moves a theme or a screen. |
| No re-export shells | The two deployment barrels are deleted. `cms/trash/ports.ts` keeps type re-exports inside a real file (owner question 9). |

---

# Appendix A. NEEDS-OPUS sheets, written for Sol (BUILDER: SOL · OPUS-REVIEW)

## A1. W3C-W1b-09c: root-key reconciler (`F/webhooks/site-key-ensure.ts`)

This sheet replaces the `site-key-ensure` bullet, the `site-key-ensure` cutover text and the reconcile tests of W3C-w1b-09. The keyring piece is dropped, because `keyring.env.ts` is STAYS-HOST (see w1b corrections). The scanner piece stays in W1b-09 as 09a.

**Why it needed Opus.** As sheeted, the ranges `219–255, 278–341, 368–405` cut `adoptSiteKey` (`:320–339`) off from `withFingerprintReconciliation` (`:345–405`). The listed ports (`read({ source })`, `readStamp`, `writeStamp`) do not match the two separate stamp reads the code actually does: `resolveSiteKeyFingerprint` at `:236`, then `readSiteMetaJson` plus a merge-write at `:385–405`. The sheet also has no result type. All of that is now fixed below.

**What moves.** Only the decision-and-effect sequence. All filesystem work, `.site-meta.json` parsing, source enumeration, runtime mode and the production early-return stay in Tovu: `splitPerSiteSource` `:258`, `moveSiteKeyFileAside` `:751`, `atomicCreateSiteKeyFile` `:803`, `findFirstPresentMaterial` `:778`, `readRawSiteKeyMaterial` `:840`, `writeFingerprintStamp` `:603`, `mintSiteKeyHex` `:498`, and everything from `:407` to the end. Jini already has the pure table and helpers: `platform/src/secrets/root-key/decide.ts` exports `decideLocalSiteKeyEnsure` `:67`, `verdictOf` `:91`, `matchesFingerprint` `:102` and `SiteKeyVerdict` `:56`. `platform/src/secrets/keyring.env.ts` exports `parseRootKeyHex` `:211`, `fingerprintRootKeyHex` `:258`, `ParsedRootKeyHex` `:206` and `RootKeyRejection` `:204`. Tovu's `parseSiteKeyHex`/`fingerprintSiteKeyHex` are those same functions, imported under other names (`F/webhooks/keyring.env.ts:4–5`). Do not add a second decision table.

### Types first: new file `J/platform/src/secrets/root-key/reconcile.ts`
```ts
import { decideLocalSiteKeyEnsure, matchesFingerprint, verdictOf, type SiteKeyVerdict } from "./decide.js";
import { fingerprintRootKeyHex, parseRootKeyHex, type ParsedRootKeyHex, type RootKeyRejection } from "../keyring.env.js";

type Empty = Record<string, never>;

/** Reads one key source's raw material, or undefined when absent. Called lazily, in source order. */
export type RootKeyMaterialRead = (required: Empty, _optional?: Empty) => string | undefined;

/** The meta-file stamp as read at reconciliation time. `write` merges into the SAME parsed object. */
export type RootKeyStampRead =
  | { readonly kind: "no-meta" }
  | { readonly kind: "meta"; readonly fingerprint: string | undefined; readonly write: (required: { fingerprint: string }, _optional?: Empty) => void };

export interface RootKeyReconcilePorts {
  /** Raw per-site file material (undefined = absent). Read exactly once, first. */
  readonly readPerSite: RootKeyMaterialRead;
  /** Every OTHER source, in the host's precedence order. */
  readonly others: readonly RootKeyMaterialRead[];
  /** The stamped fingerprint as resolved BEFORE any write (host: resolveSiteKeyFingerprint). */
  readonly stampedFingerprint: string | undefined;
  /** Key-dependent-data scan. The reconciler memoizes it: at most one call per reconcile. */
  readonly hasDependentData: (required: Empty, _optional?: Empty) => Promise<boolean>;
  /** Move the per-site file aside only if it still holds `expectedContent`. Never deletes. */
  readonly moveAside: (required: { expectedContent: string }, _optional?: Empty) => void;
  /** Exclusive create of the per-site file; returns the trimmed bytes actually on disk (race winner). */
  readonly createExclusive: (required: { hex: string }, _optional?: Empty) => string;
  /** Fresh random key hex. */
  readonly mint: (required: Empty, _optional?: Empty) => string;
  /** Read the stamp again AFTER the key file has settled (host: readSiteMetaJson). */
  readonly readStamp: (required: Empty, _optional?: Empty) => RootKeyStampRead;
}

export type RootKeyReconcileResult =
  | { readonly action: "noop" | "adopt" | "mint" | "mismatch"; readonly fingerprint: string }
  | { readonly action: "invalid"; readonly reason: RootKeyRejection }
  | { readonly action: "refuse" };

export function reconcileRootKey(required: { ports: RootKeyReconcilePorts }, _optional: Empty = {}): Promise<RootKeyReconcileResult>;
```

### Mechanical steps
1. **Tests first:** `J/platform/src/secrets/root-key/__tests__/reconcile.test.ts`, with in-memory fake ports that record call order. Each test below is followed by the mutation that must make it fail.
   - `mismatched adoption with dependent data writes and stamps nothing` (no `createExclusive`, no `write`; result `mismatch` with the candidate fingerprint). Mutation **`ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK`**: call `createExclusive` before the stamp comparison in the adopt branch.
   - `a stamp-named key in another source replaces a different per-site file by move-aside, never delete` (`moveAside` called with the exact per-site raw, then `createExclusive` with the stamped hex, then action `adopt` and never re-stamped). Mutation **`ROOT-KEY-DELETE-INSTEAD-OF-MOVE-ASIDE`**: skip `moveAside`.
   - `a differing stamp with dependent data reports mismatch and does not restamp` (mint/adopt path: `write` is not called when `hasDependentData` is true). Mutation **`ROOT-KEY-RESTAMP-WITH-DEPENDENT-DATA`**: make `mayRestamp` always true.
   - `a lost create race returns the winner's fingerprint` (`createExclusive` returns other bytes; the result fingerprint is the fingerprint of those bytes). Mutation **`ROOTKEY-RETURN-CANDIDATE`**: fingerprint the candidate hex instead.
   - `the dependent-data scan runs at most once per reconcile`. Mutation **`ROOT-KEY-UNMEMOIZED-SCAN`**: drop the memo.
   - `absent everywhere with dependent data refuses and writes nothing`. Mutation **`ROOT-KEY-MINT-OVER-DATA`**: treat `siteDbsWithKeyData` as false.
   - `a later source is not read once the stamped key is found` (lazy order). Mutation **`ROOT-KEY-READ-ALL-SOURCES`**: map over every reader eagerly.
   - `no meta file means no stamp write, and the action is unchanged`, and `an unstamped meta file is stamped once`.
2. **Move these bodies into `reconcile.ts`, verbatim, with their why-comments.** Sol renames only the I/O calls to the port calls listed. Each function stays at or under 80 lines and complexity 10, so split as named.
   - `ensureSiteKey` `:227–253` (from the line after the production return through the `settleSiteKey` call) becomes `reconcileRootKey`'s body. Changes:
     - `readRawSiteKeyMaterial(perSiteSource, env)` → `ports.readPerSite({})`.
     - `parseSiteKeyHex` → `parseRootKeyHex`.
     - `resolveSiteKeyFingerprint(...)` → `ports.stampedFingerprint`.
     - `findStampedHex` (`:713–731`, moved as the private `findStampedHex({ others, stampedFingerprint })`) loops `others` in order and calls each reader only until a match.
     - `moveSiteKeyFileAside(...)` → `ports.moveAside({ expectedContent: perSiteRaw })`.
     - `atomicCreateSiteKeyFile(...)` → `ports.createExclusive({ hex: stampedHex })`.
     - `findFirstPresentMaterial(otherSources, env)` → the private `firstPresent({ others })`, the same loop over the readers.
     - Drop `perSiteFilePath` everywhere, because the Tovu wrapper adds it.
   - `settleSiteKey` `:276–318` → private `settle(...)`. Keep the `hasKeyDataMemo` closure exactly; it calls `ports.hasDependentData({})`. Keep the `needsDataCheck` boundary, the exhaustive `switch` and the `never` default. The `mint` branch calls `ports.createExclusive({ hex: ports.mint({}) })`.
   - `adoptSiteKey` `:320–339` **whole** → private `adopt(...)`. The stamp comparison and `await siteHasKeyData()` stay BEFORE `createExclusive`. Keep the comment at `:329–333`.
   - `neverRestamp` `:343`, with its comment `:340–342`.
   - `withFingerprintReconciliation` `:345–405` → private `reconcileStamp({ action, fingerprint, mayRestamp, ports })`.
     - `readSiteMetaJson` → `ports.readStamp({})`.
     - `meta === undefined` → `kind === "no-meta"`.
     - `meta.siteKeyFingerprint` → `.fingerprint`.
     - `writeFingerprintStamp({ siteDir, meta, fingerprint })` → `stamp.write({ fingerprint })`.
     - Keep the doc comment `:344–367`.
   - Use `verdictOf`, `matchesFingerprint` and `decideLocalSiteKeyEnsure` from `./decide.js`. Do not keep local copies; `F/webhooks/site-key-ensure.ts:134–165,695–739` are deleted in Tovu in step 3.
3. **Tovu cutover in `F/webhooks/site-key-ensure.ts`.** `ensureSiteKey` keeps its exported signature `(input: EnsureSiteKeyInput): Promise<EnsureSiteKeyResult>` and the production early-return at `:220–225`. After `splitPerSiteSource`, it builds the ports and returns `{ ...result, perSiteFilePath }`, mapping `invalid` to `{ action, perSiteFilePath, reason }` and `refuse` to `{ action, perSiteFilePath }` exactly as today. The ports:
   - `readPerSite: () => readRawSiteKeyMaterial(perSiteSource, env)`
   - `others: otherSources.map(source => () => readRawSiteKeyMaterial(source, env))`
   - `stampedFingerprint: resolveSiteKeyFingerprint({ siteDir })`
   - `hasDependentData: () => input.findSiteKeyDependentData({ siteDir })`
   - `moveAside: ({ expectedContent }) => { moveSiteKeyFileAside({ filePath: perSiteFilePath, expectedContent }); }`
   - `createExclusive: ({ hex }) => atomicCreateSiteKeyFile({ filePath: perSiteFilePath, hex })`
   - `mint: () => mintSiteKeyHex()`
   - `readStamp: () => { const meta = readSiteMetaJson({ siteDir }); return meta === undefined ? { kind: "no-meta" } : { kind: "meta", fingerprint: meta.siteKeyFingerprint, write: ({ fingerprint }) => writeFingerprintStamp({ siteDir, meta, fingerprint }) }; }`

   Then:
   - Delete `settleSiteKey`, `adoptSiteKey`, `neverRestamp`, `withFingerprintReconciliation`, `findStampedHex`, `matchesFingerprint` and the local `verdictOf`, `SiteKeyVerdict`, `LocalSiteKeyDecision`, `decideLocalSiteKeyEnsure` and `verdictOfCheck`.
   - `planSiteKeyEnsure` (`:120`) stays as long as its test imports exist. Per the original sheet, repoint `F/webhooks/__tests__/site-key-ensure.unit.test.ts:19` to `@jini-ai/platform/secrets/root-key` and then delete it.
   - The existing Tovu tests (`site-key-ensure.unit.test.ts`, `.pins.unit.test.ts`, `.sources-boundary.unit.test.ts`, `fixtures/site-key-ensure-child.ts`) keep importing the Tovu `ensureSiteKey`. They are the parity witnesses for the real filesystem.
4. **Scope.** This is extraction only. Do not change the known recovery-race or directory-fsync behavior, the move-aside naming or the `0600`/`0700` modes, all of which stay in Tovu.
5. **Package.**
   - `platform/package.json`: add `./secrets/root-key/reconcile` (`types`/`import`/`default` → `./dist/secrets/root-key/reconcile.{d.ts,js}`) and the `jini.entries` line `"./secrets/root-key/reconcile": "node"`. It is `node`, not universal, because it imports `../keyring.env.js`, which is in the Node lane like the existing `./secrets/root-key` entry (`platform/package.json:21`).
   - Changeset `.changeset/w3c-w1b-root-key-reconcile.md` (`@jini-ai/platform` minor).
   - Opus regenerates `api-baseline/jini-ai__platform.json`.

## A2. W3C-W1-01B: automatic plugin runs (`F/agent-plugins/automatic-agent-plugins.ts`)

Base this on the checker's draft, reproduced verbatim in Appendix B under "w1a part 1 → Appendix A". Apply these four changes first, and they win over the draft:
1. **`bindAutomaticGuidanceResolver` stays in Tovu.** It is an 8-line binding of Tovu's `resolveAgentPluginGuidance` (`F/agent-plugins/lifecycle.ts`) to the host layout (`automatic-agent-plugins.ts:118–126`). Remove it from the Jini export list and from step 2. Jini's runs receive the already-bound `AutomaticAgentPluginPorts['resolve']` through `deps.ports.resolve`. This also removes the draft's unresolved `W`/`(...) => ...` placeholder.
2. **`OfferLiveness` moves verbatim** (`:77`): `type OfferLiveness = Parameters<ReturnType<typeof createAutomaticAgentPluginUse>['offer']>[0]['isAttemptLive']`. `createAutomaticAgentPluginUse` is already in `agent-plugins/src/lifecycle`, so import it relatively. I checked that every other type the draft names exists in Jini: `AutomaticAgentPluginPorts` (`agent-plugins/src/lifecycle/automatic-use.ts`), `AgentPluginPreferencesPort` (`agent-plugins/src/site/service-ports.ts`), `PrepareToolGuidance`, `AgentPluginGuidanceAttempt` and `AgentPluginGuidanceOffer` (`core/src/contracts/site/daemon.ts`), `PluginMaturity` (`core/src/contracts/site/lifecycle-host-tools.ts`), and `SurfaceEmitter` (`core/src/tool-registry.ts`).
3. **Delete "Sol verifies indexed types by typecheck".** Sol cannot run tools. Use the literal types in the draft. Where the draft says "Opus confirms", it means the Opus review after the build.
4. **Order.** Build after W1-01 (without this row). The draft's `S` generic means Jini never names `ChatDeleteSurfaceDeps`, so the build does not wait for round-1 CRP-02. The Tovu binder `F/agent-plugins/automatic-agent-plugins-binding.ts` imports `ChatDeleteSurfaceDeps` from wherever it lives at build time.

Everything else (tests first with the four `GUIDANCE-*` mutations, the private split files, the host-kept `buildPluginGuidanceRegistration` in `F/agent-plugins/automatic-guidance-registration.ts`, the binder, the 12 importer repoints, and the package line) stands as written in the draft.

---

# Appendix B. Checker reports, verbatim (the literal fix text the tables above point to)

Four read-only Sonnet checkers wrote these. Where they differ from the verdict tables above, the tables win. In particular: the w2 checker's "KEEP w2-01" and "KEEP w2-02" are overruled (see R3-X1); the w1b checker's 03b and 06b NEEDS-OPUS skeletons are replaced by the narrowed w1b-03 and w1b-06 FIX text; its 09c skeleton is replaced by Appendix A1.

## B. w1a part 1

### Round-3 check: w3c-w1a, sheets W1-01 to W1-05 and table rows 1-66

Checked against Tovu/Jini checkouts in the scratchpad (tips newer than the pins). Read-only. 38 tool calls used.
`SCR`-relative paths below. Tovu `F/` = `apps/website/src/features/`.

#### Verdict table

| sheet | verdict | exact fix text (literal) |
|---|---|---|
| W3C-W1-01 | FIX | (1) **Remove the `automatic-agent-plugins.ts` row from this sheet** (table row, importer bullet, test `automatic-runs.cutover.test.ts`, package export `./site/automatic-agent-plugins`) and build it as **W3C-W1-01B** from Appendix A below (the sheet's own text says "Define the portable deps around the actual reads" and never says where `buildPluginGuidanceRegistration`, the `notes` copy, or `loadRegistration` go). Source anchor also wrongly includes lines 15-43, which are the host-owned `load_agent_plugin` catalog text that stays in Tovu. (2) **Diagnostics type:** in the Jini `site/exports/diagnostics.ts` do NOT declare `PluginEmbedDiagnostic`; write `import type { PluginEmbedDiagnostic } from '@jini-ai/core/contracts/site/page-html-store'` (declared at `packages/core/src/contracts/site/page-html-store.ts:3`) and `export type { PluginEmbedDiagnostic }` is NOT allowed (no re-export). Repoint `F/pages/html-document-store.ts:1` and `F/pages/html-document-store.memory.ts:3` to `import type { PluginEmbedDiagnostic } from "@jini-ai/core/contracts/site/page-html-store"` (NOT to `@jini-ai/agent-plugins/...`; round-2 w3b-ext-w2a J19 moves those two files into `@jini-ai/cms`, and cms must not import agent-plugins). Delete the sentence "Keep the error constructor identity across the Pages consumers": Pages only type-imports the diagnostic and never touches `PluginEmbedValidationError` (grep: only `exports/runtime.ts:8,127,135` use it). (3) **Name the set-enabled binder:** create `F/agent-plugins/set-enabled-binding.ts` exporting `setAgentPluginEnabled(input: SetAgentPluginEnabledInput, options: { notifyRosterChanged?; links?; lifecycle?; unlessOperatorDisabled? } = {})` with today's exact signature; body = call Jini `setAgentPluginEnabled({ input, links, assertReady, getLifecycle, linkedError }, { notifyRosterChanged, unlessOperatorDisabled })`, passing `assertReady` = `assertAgentPluginReady` bound to `explicitRootSoonCatalog` + `HOST_SOON_AGENT_PLUGINS`, `getLifecycle` = the existing per-layout `WeakMap` over `createTovuAgentPluginLifecycle`, `linkedError` = `new AgentPluginLinkedError(...)`. Importers (`C/plugin-host.ts:13`, `C/site-mailer.ts:9`, `C/site-deps/mail-http.ts:30`, `C/modules/agent-plugins-routes.ts:15`, `S/routes/types.ts:1292`, `deps.ts:52`, `apply-connect-defaults.ts:14`, tests) repoint to `set-enabled-binding`; `AgentPluginLinkedError` from `./provider-plugin-link.js`, `AgentPluginNotInstalledError` from `@jini-ai/agent-plugins/lifecycle`. Delete the two `export { ... } from` re-export lines of old `set-enabled.ts` (re-export shell). (4) **ORDER line to add:** "Build after round-2 w3b-arch R03 (`TOVU_AGENT_PLUGIN_IDENTITY_READ`). `exports/source.ts:35` and `install-upload.ts:137,234` are edited there; the moved `createPluginExportSource` and `installUploadedAgentPlugin` take that descriptor as a REQUIRED port field `identityRead` (type `Pick<AgentPluginIdentityReadOptions,'legacyIdentity'>`) and pass it to `parseAgentPluginManifest` / `readInstalledAgentPluginIdentity`. If R03 is not yet built, re-read both call sites first." (5) Importer fix: `F/…/install-response.unit.test.ts` import is at `:8`, not `:7` (file changed after the pin). (6) Add mutation `UPLOAD-REPLACE-ENABLED` (replacing an enabled plugin must refuse `PLUGIN_ENABLED`, `install-upload.ts:283-290` `assertReplaceable`). (7) Dependency note: the `exports/diagnostics` move needs core `page-html-store.ts` (already present at the Jini tip); no dependency on W1-02..05. |
| W3C-W1-02 | FIX | (1) Package line: change "Universal `integrations` export" to **`node`**: `jini.entries` `"./api-connections/vault-stores": "node"` plus the same `exports` triple. Reason: the file imports `createVaultOAuthTokenStore` from `token-store/vault-token-store.ts`, which has `import { randomUUID } from "node:crypto"` at line 11, and every sibling `./api-connections*` entry in `packages/integrations/package.json:27-43` is `node`. (2) Replace "capped expiry sweep" with "uncapped expiry sweep over every row (as `vault-stores.ts:86-92` does today); do not add a cap". (3) Delete the sentence "Use the existing token codec's `parseTokenPayload` and `buildTokenPayload` shapes as injected collaborators if the host still holds the byte-identical aliases." and the `tokenCodec` field in `rebindApiConnectionArchive`'s signature. Replace with: "Import `parseTokenPayload`/`buildTokenPayload` directly from `./token-store/record` (`record.ts:103`,`:69`) and `deriveApiConnectionKey` from `./keys` (`keys.ts:13`); Tovu has no host aliases (`vault-stores.ts:12-13` import them from Jini)." Signature becomes `rebindApiConnectionArchive({ entries, workspaceId, policy }, _optional = {})`. (4) Replace "Restate the structural archive entry fields ... if `VaultArchiveEntry` is still only a platform type" with the literal: it IS only in platform (`packages/platform/src/secrets/credential-sets/vault-archive.ts:14`) and integrations has platform only as an optional peer, so declare in the new file `export interface ApiConnectionArchiveEntry { id: string; kind: string; ownerKey: string; binding: string \| null; provider: string \| null; label: string; isDefault: boolean; meta: VaultMeta; payload: VaultMeta \| null }` (`VaultMeta` from `@jini-ai/core/contracts/vault`). (5) Literal policy type: `interface ApiConnectionVaultPolicy { scope({ workspaceId }): VaultContext; recordFormat: string; attemptFormat: string; pluginStateFormat: string; hashState({ state }): string; recordLabel({ key }): string; attemptLabel({ attempt }): string; isOwnerReference({ id }): boolean; omittedNotice({ count }): string }` (the `attempt:` id uses `hashState`; label uses `hashState(...).slice(0,16)` inside the host `attemptLabel`). (6) Name the Tovu binder `F/api-connections/vault-store-binding.ts`: it holds `createApiConnectionVault` (verbatim `:71-83`, scope check BEFORE parsers/crypto, `principalId !== null` and `binding` refusal), `API_CONNECTION_VAULT_POLICY`, and the four host-signature wrappers `createApiConnectionVaultRecordStore({ vault, workspaceId, clock }, _optional = {})`, `createApiConnectionVaultTokenStore({ vault, records, clock, owner }, _optional = {})`, `rebindApiConnectionArchive({ entries, workspaceId }, _optional = {})` that call the Jini functions with `policy` (so the ~25 listed importers repoint module path only). `ApiConnectionVaultRecordStore` (with `peekAttempt`) is exported from Jini. (7) Add mutations to Tests-first: `API-RECORD-SKIP-KEY-BINDING` (read of a row whose `record.key !== key` must throw `invalid-record`), `API-ARCHIVE-SKIP-GENERATION-CHECK` (`parsed.generation !== connection.generation` must omit the pair), `API-ARCHIVE-SKIP-DERIVED-KEY-CHECK` (`deriveApiConnectionKey(connection) !== connection.key` or `row.id !== record:<key>` must omit), `API-SWEEP-DELETE-WITHOUT-REVISION` (expiry sweep must pass `expectedRevision` and swallow only `conflict`), `API-VAULT-SCOPE-CHECK-AFTER-PARSE` (binder test: wrong kind/owner/workspace refused before the meta parser runs). |
| W3C-W1-03 | FIX | (1) **Add the missing "Package" section** (the sheet has none): `integrations` exports `./custom-credentials/delete-request-confirmation-ui` (`universal`, type-only import) and `./custom-credentials/write-files-validation` (**`node`**: `Buffer.byteLength` in `addFileBytesWithinLimits`); add both to `jini.entries` and to the `credentialed-http` lane map next to `./custom-credentials/agent-tools` (`package.json:51,69`). Changeset `w3c-w1-custom-credential-confirmation.md`, update `api-baseline/jini-ai__integrations.json`. (2) `CustomCredentialValidationError` is at `packages/integrations/src/credentialed-http/sets/store.ts:22`; import it from `../../credentialed-http/sets/store` inside the package. (3) **Name the Tovu binder** for the target check: new `F/custom-credentials/repository-target.ts` exporting `validateRepositoryTarget(target: { owner: unknown; repo: unknown }, { validateTarget }: { validateTarget?: RepositoryTargetValidator } = {})`, which calls the Jini `validateRepositoryTarget({ owner, repo, repositoryTargetError }, { validateTarget })` with `repositoryTargetError` from `@jini-ai/devops/source-control`. Repoint all nine `validateRepositoryTarget` importers (`source-control/__tests__/{credential-binding.pin.unit.test.ts:11,write-port.unit.test.ts:10}`, `site-backup/backup-service.ts:26`, `C/credentials-host-ports.ts:3`, and the four `custom-credentials/__tests__` files) to it and change every call from positional `(target, validateTarget)` to `(target, { validateTarget })`. (4) Jini `validateWriteFilesInput({ branch, commitMessage, files }, _optional = {})` replaces the current single positional `input`; `validateRepositoryTarget`'s `owner`/`repo` params stay typed `unknown` (type gate stays inside). (5) Add mutations to Tests-first: `CRED-WRITE-ALLOW-GIT-DIR` (path `.GIT/hooks/x` and `a/.git` refused), `CRED-WRITE-ALLOW-DOTDOT` (`../x` and `a/../b` refused, `\\` normalized first), `CRED-BRANCH-ALLOW-DOTDOT-SEGMENT` (branch `../tags/r` and `a//b` refused), `CRED-DELETE-REVIEW-DANGER-OFF` (`danger: true`, `confirmLabel`, `errorCode: "CUSTOM_CREDENTIALS"` retained). (6) Keep `write-files-confirmation.test.ts` unchanged as the proof that validation still runs before credential resolution and before any dialog. |
| W3C-W1-04 | FIX (split into four sheets; one sheet moves about 3,500 lines across 14 files) | **Split and order:** W1-04A = registries + ops catalog (3 files, A section). W1-04B = credentials: `compatibility-port`, `store`, `static-publish/credentials`, `static-publish/verify` (B section; security-critical, Opus-review before merge). W1-04C = `adapter`, `inspection`, `publish-history`, `publish-run` (C section). W1-04D = `publish-tool-deps`, `domain-publish-tool`, `publish-agent-tools` (D section). Build A, B, C, D in that order; D needs B+C. Each gets its own changeset. **Literal fixes:** (1) Rows 46 and 52 (`publish-credentials/index.ts`, `static-publish/index.ts`) are classed `H` but the sheet deletes them as "retired barrels": reclassify both as `DELETE (re-export shell)`, executed in B and C respectively after all importers are split. (2) B, `createPublishCredentialStore({ policy })`: the sheet never lists the policy members. Use exactly: `interface PublishCredentialPolicy { assertCredentialFreeField(required: { value: string; field: string }): void; parseVaultMeta(required: { kind: string; meta: unknown }): VaultMeta; credentialScopes<D>(required: { deps: D; workspaceId: string }): readonly ScopedDeps<D>[]; credentialCreateTarget<D>(required: { deps: D; workspaceId: string }): ScopedDeps<D>; isProjectConflict(required: { error: unknown }): boolean }` — these map one-to-one to the Tovu-only imports at `store.ts:1,5,8,16`. Import `normalizeCredentialToken`, `CredentialInputError`, `CREDENTIAL_MESSAGES`, `matchingCredentialProviderIds`, `selectCredentialForProvider`, `normalizeCredentialWorksFor` DIRECTLY from `@jini-ai/platform/...` (devops already depends on platform, `devops/package.json:740`); use `SecretSealerPort`/`KeyringPort` from `@jini-ai/core/contracts/vault` (devops does not depend on integrations). `isUniqueViolation` from `@jini-ai/core/contracts/storage`. Drop the `KyselyKernel` `transaction?` field from `deletePublishCredential` deps (unused in the body, `store.ts:623-631`). (3) B: delete the sentence "Read paths must not touch write-only vault/keyring effects" unless you add a test; replace with test "listing and describing a credential never calls `sealer`/`keyring`" and mutation `DEPLOY-READ-OPENS-VAULT`. (4) B mutations to add: `DEPLOY-CHOSEN-ID-IGNORE-PUBLISH-HOSTS` (an explicit `credentialId` whose `publishHosts` excludes the target must refuse, `credentials.ts:~265`), `DEPLOY-CHOSEN-FALLS-TO-DEFAULT` (explicit id never falls back to the provider default), `DEPLOY-RESOLVE-CROSS-WORKSPACE-ID` (another workspace's id resolves to null and never decrypts), `DEPLOY-DECRYPT-ERROR-LEAKS` (any open/payload failure throws `PublishCredentialSecretStoreUnconfiguredError` with `CREDENTIAL_MESSAGES.storage`, `store.ts:633-640`), `DEPLOY-UPDATE-SKIP-EXPECTED-REVISION` (`store.ts:581` passes `expectedRevision: row.revision`). (5) B: `createEnvPublishCredentialSource` `env` becomes a REQUIRED field; the Tovu binder `F/deployments/static-publish/credential-source-binding.ts` passes `process.env` (name this file; the sheet names none). (6) C: name the process-singleton binder `F/deployments/static-publish/publish-run-binding.ts` holding the one `createPublishJobStore({})` + one `createStaticPublishRuns(...)` instance (today a module global at `publish-run.ts:100`); `C/app.ts:21`, `domain-publish-tool` and the route all import `getPublishRunSnapshot`/`startPublishRun` from it. Name the host report-extension/headers/consent binder `F/deployments/static-publish/publish-binding.ts` for `publishStaticSite` ports. (7) D: lines `publish-agent-tools.ts:869-895` (a stray JSDoc for `buildStaticPublishRegistrations`) are in no listed range: move that comment onto `buildStaticPublishRegistrations` with the code. `catalogModule: "features/deployments/publish-agent-tools.ts"` (`:1192`) and `ui://tovu/...` (`:350`) must become REQUIRED host fields `catalogModule: string` and `uriHost: string` in `createStaticPublishTools({ host })`; no `tovu`/`features/deployments` string may appear in the Jini file. (8) D: delete "Use one core `./contracts/site/static-publish-review` contract ... if both Tovu and Jini name them": decision = **do not add a core contract**; declare the review port type once in `devops:deploy/site/publish-tool-deps` and have Tovu import it from there. (9) D ORDER: needs round-1 ext-crp CRP-02 (`approvalToolHandler`/human-confirm used at `domain-publish-tool.ts:6` moves to daemon `surface-exchanges/human-confirm`), the `gateway`/`composition` gated-mutation modules injected as ports (not imported), and round-1 ext-w1 J15 (devops host-kit + `DEPLOY_FETCH_TIMEOUTS`) before C (`adapter.ts:11`, `inspection.ts:4`, `verify.ts:7` import the Tovu host-kit today). Re-anchor C `publish-history.ts:167,230` after round-1 ext-a edits it, and D/B lines `publish-agent-tools.ts:54`, `publish-tool-deps.ts:12`, `credentials.ts:7`, `verify.ts:12` after round-2 w3b-ext-w2b repoints vendor types in them. (10) Also add mutation `DEPLOY-CONFIRM-FROM-MODEL-INPUT` to D (a `confirmed`/`signal` field in model input must be rejected or ignored). |
| W3C-W1-05 | REJECT | Reclassify `email-templates/operations.ts` row 57 from `M` to `H`. The file's own header calls itself "Tovu's storage binding" (`operations.ts:15-25`): it maps `PostRecord` rows of `EMAIL_TEMPLATE_KIND` and the Pages html store onto platform's `EmailTemplateStore` (`platform/src/mail/email-template-operations.ts:57`). The sheet's `rows` port (`findById/saveDraft/transaction/listHtmlByKind/compareAndSetTitle`) is a 1:1 mirror of `PostRepoPort`, so the Tovu side must still write an equal-sized adapter (`store-binding.ts`): net zero reuse, plus a generic `Row extends TemplateStorageRow` and a `isConcurrentEdit` callback for ~110 lines of logic. The destination is also unclear: user-management has only `mail/status/*` today (`package.json:28-32`) and the operations/store port live in platform, so the sheet implies an unverified user-management to platform edge. Round-2 w3b-ext-w2a J19 (`:313`) already repoints `operations.ts:14` to core/CMS. Replacement: nothing for W1-05; leave the file in Tovu. (If the owner wants it moved anyway, the home is `platform:mail/email-template-store` beside the port, not user-management.) |

#### Classification corrections

| file | sheet verdict | correct verdict | why |
|---|---|---|---|
| `email-templates/operations.ts` (row 57) | M | H | See W1-05 above (`operations.ts:15-25,30-36,131`). |
| `deployments/publish-credentials/index.ts` (row 46) | H | DELETE (shell) | W1-04 itself says "Delete ... the two retired barrels"; a 29-line barrel is a re-export shell, owner rule bans keeping it. |
| `deployments/static-publish/index.ts` (row 52) | H | DELETE (shell) | Same; 56-line barrel. |
| `agent-plugins/soon-lock.ts` (row 23) | A | GONE (already deleted) | File does not exist at the Tovu tip (`ls F/agent-plugins`); Jini has `agent-plugins/src/site/soon-lock.ts`, exported `./site/soon-lock` (`package.json:129`). Verdict direction is right, "remainder is a binding" is moot. (Four other `A` rows in the whole table also point at missing files, outside my range.) |
| `agent-plugins/set-enabled.ts` (row 22) | M | M, marginal | Only about 15 lines of orchestration remain (linked-face check, ready assert, conditional write, roster notify) and the injected signature has four callbacks. Acceptable only with the named binder in the W1-01 fix text; otherwise it is a host binding. |
| `agent-plugins/update-effects.ts` (row 27) | M | M, marginal | About 40 real lines; every collaborator is already Jini (`federate-mcp` is row 12 `A`). Fine as a small move. |
| `custom-credentials/delete-request-confirmation-ui.ts` (row 33) | M | M, marginal | 40 lines of dialog copy; precedent exists (`custom-credential-create-ui`, `custom-credential-set-token-ui` already in Jini `package.json:47-48`), so accept. |

#### Classification spot-checks done

STAYS-HOST (H), 10 checked:
- `agent-plugins/layout.ts` OK: 108 lines, resolves the host layout around `AgentPluginLayout` types.
- `agent-plugins/new-site-agent-plugin-tokens.ts` OK (plausible, not exhaustively read): `parsePluginTokenMap` already in Jini; remainder binds `RETIRED_BUNDLED_AGENT_PLUGINS`, `readInstalledMcpServers`, wizard refusal copy (`:5-14,95-138`).
- `agent-plugins/uninstall-confirmation-ui.ts` OK: Tovu tool id and branded copy, builds on Jini `memoryText` (`:1,29`).
- `agent-plugins/customize-tool.ts` OK: 20 lines, Jini owns `site/customize-tool` (`package.json:120`).
- `agent-plugins/provider-plugin-link.ts` OK: 31 lines, Jini has `site/provider-plugin-link`.
- `agent-plugins/memory.ts` OK (91 lines, host paths).
- `deployments/capability-card.ts` OK (34 lines, host card).
- `form-destinations/key-store.ts` OK: Jini cms already owns `forms/destinations/key-store` (`:11`), Tovu is a binding (`randomBytes`, scope label).
- `forms/protect-existing-files.ts` OK: binds `ContentKernel` (`#src/platform/db/content-kernel`) and local fs (`:1-5`).
- `media/index.ts` OK (141 lines, barrel/binding; not opened in detail).
- `apply-connect-defaults.ts`, `host-tool-ports.ts` (78/73 lines) not opened: UNCHECKED beyond size.

ALREADY-MOVED (A), 9 checked:
- `activation-effects.ts` OK: 18 lines, Jini `./site/activation-effects` (`package.json:121`).
- `apply-tool-renames.ts` OK: 36 lines, 3 Jini imports.
- `connect-destination.ts` OK: 20 lines.
- `connect-sign-in-wait.ts` OK: 35 lines, 4 Jini imports.
- `enable-access.ts` OK: 33 lines, 6 Jini imports.
- `federate-mcp.ts` OK: 52 lines, 5 Jini imports.
- `token-sign-in.ts` OK: 29 lines, 4 Jini imports.
- `memory-tools.ts` OK: 17 lines.
- `soon-lock.ts` see corrections (file gone).

MOVE (M), 3 checked as "not already in Jini":
- `automatic-agent-plugins.ts`: OK, not in Jini. `rg createAutomaticPluginRuns` has no hit; Jini only has the controller `lifecycle/automatic-use.ts`.
- `deploy-ops/registry.ts`: OK, no `loadDeployOpsRegistry`/`loadDeployTargetRegistry`/`loadInstalledDeployTargets` in Jini.
- `email-templates/operations.ts`: not in Jini (no `emailTemplateStore`), but wrong classification, see above.
Also confirmed none of these exist in Jini: `createPublishCredentialStore`, `redactDeployTargetMessage`, `createDbPublishCredentialSource`, `verifyPublishCredential` (admin client only), `publishStaticSite`, `inspectStaticPublish`, `createStaticPublishRuns`, `domainPublishTool`, `bindPublishCompatibility`. `createPublishJobStore` does exist (`devops/src/deploy/publish-jobs.ts:43`), which the sheet correctly reuses.

#### Anchors checked

Security-relevant first.
- `api-connections/vault-stores.ts:71-83` scope check, `:85-100` sweep, `:102-155` record store, `:157-170` token store, `:172-255` archive: OK (file is 255 lines; `createApiConnectionVault` at :71, `rebindApiConnectionArchive` at :235).
- sheet "capped expiry sweep" vs `:86-92`: WRONG (sweep iterates all rows, no cap).
- sheet "token codec as injected collaborators if host holds aliases" vs `:12-13`: WRONG (direct Jini imports, no aliases).
- sheet "Universal export" vs `vault-token-store.ts:11` `node:crypto`: WRONG (must be `node`).
- `custom-credentials/write-files-validation.ts:40-66,69-121,127-237`: OK (243 lines; `validateRepositoryTarget` :86, `normalizeWriteFilePath` :133ish, `validateFiles` :199, `validateWriteFilesInput` :237).
- `delete-request-confirmation-ui.ts:19,31-40`: OK (40 lines).
- `tool-registrations.ts:55,59,462` (confirmation and validation imports/use): OK.
- `static-publish/credentials.ts:21` redactor, `:149-195`, `:197-224`, `:226-348`: OK. `redactDeployTargetMessage` already redacts `credential.token` plus every descriptor `secret` field (`:21-31`), matching the sheet's "redact every descriptor-declared secret".
- `static-publish/verify.ts:66,92-131,241,274-358`: OK; plugin throw already maps to `unreachable` (`:219-222`).
- `publish-credentials/store.ts:28,31,36,38` error classes: OK. `:125-138` open/hint: OK. `:451` and `:581` revision CAS: OK. `:623-631` `deletePublishCredential`: OK (scoped via `ownerOf`). `:633-640` `decryptRecord`: OK. `:642-756`: OK.
- `publish-agent-tools.ts` 1206 lines; ranges `197-1206`: file-length consistent; gap `869-895` is a stray JSDoc that no range covers: WRONG (comment would be orphaned). `:350` `ui://tovu`: OK. `:1192` `catalogModule`: OK (host path string must be injected).
- `publish-run.ts:100` module-global `createPublishJobStore({})`: confirms the singleton the sheet means; binder file unnamed in sheet.
- `static-publish/adapter.ts` (697), `inspection.ts` (78), `publish-history.ts` (304), `domain-publish-tool.ts` (131), `publish-tool-deps.ts` (89), `deploy-ops/registry.ts` (112), `deploy-targets/registry.ts` (163), `deploy-ops/agent-tools.ts` (80), `compatibility-port.ts` (27): ranges consistent with file lengths; contents not read line by line.
- W1-01: `exports/source.ts:9-25,31-74` OK (75 lines; `:35` is the `parseAgentPluginManifest` call R03 edits). `exports/diagnostics.ts:7-55` OK (56 lines; interface at :7). `exports/runtime.ts:13-29,42-121,126-217` OK (217 lines). `set-enabled.ts:63-92` OK (92 lines). `update-effects.ts:6-16,22-42,47-76` OK (76 lines). `install-upload.ts:53-158,162-238,250-318,321-385`: OK (385 lines; digest check at :197/:321-329 happens before reader use, matching "verify digest before opening any reader"). `automatic-agent-plugins.ts:15-43,...`: WRONG start (15-43 contains the host catalog).
- `install-response.unit.test.ts:7` claimed vs actual `:8`: WRONG (file in `tdiff`). `install-response.ts:4`: OK.
- Importer spot-check `set-enabled` (rg): all matches appear in the sheet list. `install-upload` (rg): all 8 non-doc importers appear. `update-effects`: all 5 appear. `write-files-validation`: all 11 importers appear. No missed importers found.
- Core `page-html-store.ts:3` `PluginEmbedDiagnostic`: OK.

#### Duplicates/conflicts with round 1/2 or other round-3 sets

- **X3 (static-download-landing / artifact-provider): no collision from W1-04.** Round-1 decision X3 moved those to ext-w2 J05/J07; W1-04 touches neither (grep of `r12` for `static-download-landing` and `artifact-provider` in the W1-04 sources: no importer or move claim). W1-04's own A-D contain no `site-backup/*` file.
- **Round-1 ext-w1 J15 (devops host-kit + `static-publish`):** J15 moves `deploy-targets/host-kit.ts` and repoints `static-publish/{adapter.ts:11,inspection.ts:4,verify.ts:7}` (w3-ext-w1.md:294). W1-04 then moves those three files. Not a duplicate (different files), but ORDER: J15 first, and W1-04C/B must import the Jini host-kit, not the Tovu file.
- **Round-1 ext-w1 `compatibility-port` / `domain-publish-tool` / `adapter` / `inspection` / `verify`:** mentions in `w3-ext-w1.md:12,192,294` are importer or "already moved" lines, not MOVE claims. The compatibility port type is already `@jini-ai/core/contracts/site/custom-credential-publish-compatibility`; W1-04's `bindPublishCompatibility` is the host adapter around it, no overlap.
- **Round-1 ext-a `publish-history` (w3-ext-a.md:197):** edits `publish-history.ts:167,230` (core destination variants). Edit-then-move: build ext-a first and re-anchor W1-04C.
- **Round-2 w3b-ext-w2b:** repoints vendor types in `publish-agent-tools.ts:54`, `publish-tool-deps.ts:12`, `credentials.ts:7`, `verify.ts:12` and the `store.unit.test.ts:28` adapter import; also removes `F/vendor-credentials/index.ts:7` forwarding that `publish-tool-deps.ts` imports `VendorCredentialSetRepoPort` through. W1-04 must follow it or re-anchor.
- **Round-2 w3b-ext-w1 (recovery registrar delete):** edits `publish-agent-tools.ts:872-873` (comment reference), which is inside the uncovered 869-895 gap; re-read after that sheet.
- **Round-2 w3b-arch R03:** edits `exports/source.ts:35`, `install-upload.ts:137,234`, `set-enabled.ts:75-79` (W1-01 files). Dependency stated in the W1-01 fix (4).
- **Round-2 w3b-ext-w2a J19:** moves `F/pages/html-document-store{,.memory}.ts` to cms and takes `PluginEmbedDiagnostic` from core (`:151`); W1-01 must not repoint those two files to agent-plugins (fix (2)). Also J19 repoints `email-templates/operations.ts:14` (W1-05 file).
- **Round-1 ext-crp CRP-01/02:** `approvalToolHandler`/`human-confirm` (used by `domain-publish-tool.ts:6`) and `ChatDeleteSurfaceDeps` (used by `automatic-agent-plugins.ts:6`) move there; W1-01B and W1-04D depend on it.
- **Within-set:** no file is moved twice. W1-02/W1-03 reference first-pass J05/T04 shared-owner seam but do not move it.

#### Security notes

- **W1-02 (vault records / attempts / archive):** order preserved if the binder keeps the scope check before any parser or crypto (`vault-stores.ts:72-81`). Consume-once = read attempt, then `vault.delete` with the read revision, `conflict` returns null (`:141-147`). Named mutation `API-ATTEMPT-DELETE-WITHOUT-REVISION` catches the loss of CAS; I added five more (key binding, generation, derived key, sweep revision, scope-before-parse). CAS on record writes: `expectedRevision === 0 ? null : n` (`:121`); no mutation named for it in the sheet, add `API-RECORD-CAS-IGNORE-REVISION`.
- **W1-03 (credential confirmation):** nothing in the builder creates the exchange, executes the request or resolves the URL; ordering (pre-confirm resolution, then ask, then same request) lives in Jini `credentialed-http/tools` and the Tovu registrar (`tool-registrations.ts:462`), untouched. Missing path-traversal mutations added. `describeDeleteRequestApproval` must keep `danger: true`.
- **W1-04 (publish credentials / secrets):** grant-before-read: `resolveChosenCredential` checks `publishHosts` before decrypt and relies on workspace-scoped `findById` (`credentials.ts:~265-275`); the sheet had no mutation for it (added). Unreadable saved key must not fall to env: composer at `:322`; sheet mutation `DEPLOY-FALLBACK-ON-UNREADABLE` OK. Redaction of secondary secrets: `DEPLOY-REDACT-PRIMARY-ONLY` OK. Reviewed-account freeze before publish: `DEPLOY-SKIP-REVIEWED-ACCOUNT` OK. `DEPLOY-PICK-PROJECT-WRITE-UNCONDITIONALLY` OK for scoped replacement. The default `env = process.env` becomes a required arg (behavior-neutral if the binder passes `process.env`).
- Single-flight and job store are process state: a second `createPublishJobStore` would double-run; `DEPLOY-SECOND-JOB-STORE` is the right mutation, but the binder file must be named (done).
- `publish-agent-tools.ts` `ui://tovu` and `catalogModule` host strings must be injected, not hardcoded.

#### Plain-words summary

W1-01 is mostly buildable, but its largest piece (automatic plugin runs) is underspecified, so I pulled it out as 01B with a full design in Appendix A; the diagnostics move must take the type from core and must not drag cms onto agent-plugins, and the set-enabled and update-effects moves need a named Tovu binder file. W1-02 is a faithful and careful security sheet, but it wrongly makes the export universal (it pulls `node:crypto`), mentions a sweep cap that does not exist, and hides a conditional about token-codec aliases that Sol cannot resolve; I wrote exact text and extra mutations. W1-03 has no package section at all and lacks mutations for the `.git`, `..` and branch dot-segment rules that are its real security value. W1-04 is the right idea but far too big for one Sol sheet; I split it into four ordered sheets, wrote the policy type for the credential store, named the missing binder files, fixed the orphaned lines and host strings, and listed the round-1/2 ordering. W1-05 should not be built: it is Tovu's own storage binding and a move would leave an equal-sized adapter behind. No collision with the round-1 X3 decision. Table rows 1-66 were mostly right; two barrels need reclassifying to delete, one A row points at a file that is gone, and the email-template row is really host code.

#### New owner questions

1. **Split W1-04 into four sheets (A-D)?** Recommend yes; one 3,500-line, 14-file sheet with positional-to-object signature rewrites across about 100 importers is not safely reviewable.
2. **Should W1-04B's store take a `PublishCredentialPolicy` (five members) or should devops gain an `@jini-ai/integrations` dependency and import `credentialScopes`/`credentialCreateTarget` directly?** Recommend the policy interface (no new package edge; integrations does not depend on devops, devops does not depend on integrations today).
3. **W1-05: keep email-template storage binding in Tovu?** Recommend yes (reject the move).
4. **Is adding a core `static-publish-review` contract wanted?** Recommend no; declare the review port once in `devops:deploy/site/publish-tool-deps`.

#### Appendix: NEEDS-OPUS sheets

##### Appendix A: W3C-W1-01B Automatic plugin runs (replaces the `automatic-agent-plugins.ts` row of W1-01)

Source `F/agent-plugins/automatic-agent-plugins.ts:44-280` (functions and types only). Destination `agent-plugins:site/automatic-agent-plugins` (`jini.entries` `node`, lane `lifecycle`, same as `./site/supersession`). Builder SOL, Opus review. Depends on: ext-crp CRP-02 (surface-exchange types), round-2 w3b-arch R03 (no effect here).

**Types first (literal; Sol verifies indexed types by typecheck against `packages/agent-plugins/src/lifecycle/automatic-use.ts`).**
```ts
import type { AutomaticAgentPluginPorts, ChatAgentPlugins, ChatAgentPluginState } from '../lifecycle/index';
export interface AutomaticPluginRun { /* moved verbatim from :44-49 */ }
export type AskAgentPluginChoice<S> = (required: { surfaces: S; principalId: string; emitSurface: SurfaceEmitter; signal: AbortSignal; workspaceId: string; conversationId: string; preferenceRevisionSeq: number; selected: readonly string[]; matches: Parameters<AutomaticAgentPluginPorts['ask']>[0]['matches'] }, optional?: Record<string, never>) => ReturnType<AutomaticAgentPluginPorts['ask']>;
/** Everything the runs read from the host, as named ports. No Tovu type appears. */
export interface AutomaticPluginRunsDeps {
  readonly workspaceId: string;
  readonly siteTitleReady: Promise<void>;
  readonly preferences: Pick<AgentPluginPreferencesPort, 'mode' | 'snapshot' | 'saveAuto'>;
  readonly ports: Pick<AutomaticAgentPluginPorts, 'formatPluginToolPointer' | 'rank' | 'resolve'>;
  /** Tovu: `() => loadAgentPluginSearchCandidates(searchDeps)`. */
  readonly list: AutomaticAgentPluginPorts['list'];
  readonly logWarning: (required: { message: string; error: unknown }, optional?: Record<string, never>) => void;
}
export interface AutomaticPluginRuns {
  start(required: { runId: string; messageId?: string; context: AutomaticPluginRun }, _optional?: Record<string, never>): Promise<string>;
  offer(required: { runId: string; messageId?: string; context: AutomaticPluginRun; scope: AgentPluginGuidanceAttempt; offerId: string; isAttemptLive: OfferLiveness }, _optional?: Record<string, never>): Promise<AgentPluginGuidanceOffer>;
  commit(required: { scope: AgentPluginGuidanceAttempt; offerId: string; deliveredIds: readonly string[] }, optional?: { signal?: AbortSignal }): Promise<{ readonly guidanceIds: readonly string[] }>;
  prepareGuidance: PrepareToolGuidance;
  /** Replaces `loadRegistration`: the host builds the tool registration around this. */
  loadGuidance(required: { runId: string; principalId: string; pluginId: string; signal: AbortSignal }, optional?: { skill?: string; file?: string }): Promise<{ pluginId: string; status: string; maturity?: PluginMaturity }>;
  forget(required: { runId: string }, optional?: { preservePending?: boolean }): void;
  guidanceIds(required: { runId: string }, _optional?: Record<string, never>): readonly string[];
}
export function createAutomaticPluginRuns<S>(required: { deps: AutomaticPluginRunsDeps; surfaces: S; askAgentPluginChoice: AskAgentPluginChoice<S> }, _optional = {}): AutomaticPluginRuns;
export function bindAutomaticGuidanceResolver(required: { workspaceLayout: W; resolveGuidance: (...) => ... }, _optional = {}): AutomaticAgentPluginPorts['resolve'];
```
`S` is generic so Jini never names `ChatDeleteSurfaceDeps`; `W` and the resolver type are structural copies of `Parameters<typeof resolveAgentPluginGuidance>` (read `lifecycle.ts` for the exact shape; if they are already Jini types import them).

**Mechanical steps.**
1. Tests first in `site/__tests__/automatic-runs.cutover.test.ts`: "a stale offer cannot commit to a replacement turn", "a late answer from a detached attempt is folded into the next turn once", "rejoin refuses another principal/chat/turn", "forget aborts only when no attempt remains and nothing is pending", "preference change while the card is open refuses and emits the refusal text". Mutations `GUIDANCE-ACCEPT-RETIRED-OFFER`, `GUIDANCE-REPLAY-LATE-ANSWER-TWICE`, `GUIDANCE-REJOIN-SKIP-PRINCIPAL-CHECK`, `GUIDANCE-SAVE-AUTO-WITHOUT-APPROVED-REVISION`.
2. Move into the Jini file verbatim (comments with them): `chatKey`, `releaseDetached`, `preflight`, `withLateAnswer`, `rejoin`, `attemptKey`, `createPluginChoiceAsk`, `bindAutomaticGuidanceResolver`, `createEntry`, `bind`, `start`, `offer`, `commit`, `prepareGuidance`, `forget`. Split `createPluginChoiceAsk` (about 36 lines) and `createAutomaticPluginRuns` (about 100 lines) into private sibling files `automatic-runs/{ask,entry,bind,registry}.ts` so each function is at most 80 lines and complexity at most 10.
3. `createEntry` replaces `loadAgentPluginSearchCandidates(deps)` with `deps.list`, `rankInstalledAgentPlugins(...)` with `deps.ports.rank`, `formatPluginToolPointer` with `deps.ports.formatPluginToolPointer`, `resolve` with `deps.ports.resolve`; `console.warn(...describeErrorForLog)` in `prepareGuidance` becomes `deps.logWarning`.
4. `buildPluginGuidanceRegistration` (`:152-183`) STAYS in Tovu as `F/agent-plugins/automatic-guidance-registration.ts` together with `agentPluginGuidanceCatalog`, `agentPluginGuidanceRisk`, the `notes` copy, and the `catalogModule` string; its handler validates input exactly as today, then calls `runs.loadGuidance({ runId: run.id, principalId: principal.id, pluginId, signal }, { skill, file })` and adds `maturity`/`note`. `loadGuidance` in Jini does the `runs.get(runId)` principal check (`Error('Agent Plugin run is unavailable')`), calls `controller.load(...)` then `releaseDetached`, and returns `{ pluginId, ...result, maturity? }`.
5. Tovu binder `F/agent-plugins/automatic-agent-plugins-binding.ts`: `createAutomaticPluginRunsForHost({ deps, surfaces, askAgentPluginChoice })` building `AutomaticPluginRunsDeps` from `AutomaticPluginDeps` and returning `{ ...runs, loadRegistration }`. Repoint the 12 importers in the W1-01 bullet list (`A/host-contracts.ts:39`, `C/modules/assistant-*.ts`, tests) to this binder (values) or Jini (types).
6. Package: export `./site/automatic-agent-plugins` (node, lane `lifecycle`), changeset `w3c-w1-automatic-plugin-runs.md`, agent-plugins baseline.

## B. w1a part 2

### Round-3 check: w3c-w1a.md sheets W1-06 .. W1-11 and classification rows 67-122

Paths: `F/`=`apps/website/src/features/`, `S/`=`apps/website/src/server/`, `C/`=`S/runtime/composition/`, `J/`=Jini `packages/`. Checked against the current tips in `$SCR/tovu` and `$SCR/jini`. Read-only.

#### Verdict table

| sheet | verdict | exact fix text (literal) |
|---|---|---|
| W3C-W1-06 collection-entry publish | FIX | Replace the pin lines `:26-43,49-115,117-182` with the tip lines `:26-38 (EntryBag, header), 40-49 (WIDGET_TYPES, widgetTypeRefusal), 51-107 (EntryRow, withTerms, writeCollectionEntry), 109-115 (validateCollectionEntry), 117-184 (policy, contributor)`. Add to **Source**: "The tip's `importEntry` input carries `actor: applyRunActor({ deps, principalId })` (line 90, added after the pin by Jini e00cb9427, FIX 19 / H2). Move it verbatim. In Jini import `applyRunActor` from `../../publish/content/repo-handler.js` (it is already exported there) and import `adaptLegacyAuthorize`, `importEntry`, `toEntryOutbox` and the entry errors by relative path inside cms. Keep both `actorId: principalId` and `actor`; never build the actor from `principalId` or `{ kind: 'user' }`." Add to **Tests first**: "`write outside an apply run (deps.mutationActor absent) throws MissingMutationActorError before importEntry is called`; mutation `ENTRY-PUBLISH-GUESS-USER-ACTOR` (replace `applyRunActor(...)` with `{ id: principalId, kind: 'user' }`)." The Tovu repoints stay as listed. After this change the Tovu file is only the host binding of `{ permission: 'admin.collections.manage', coversTables: ['entries','entry_refs'], reservedTypes: ['widget','widget_area'] }`; keep that call in `C/publish-content-manifest.ts:3`. |
| W3C-W1-07 form-definition publish | FIX | Re-anchor: contributor is `:29-77` (not `29-74`), `FormBag` is `:15`, the writer calls are `:69,70,73` (not `:64-70`), `publishableForm` is `:83-85`. Replace `const actor = { id: principalId, kind: "user" as const }` (`:60`) with `const actor = applyRunActor({ deps, principalId })`, imported from `../../publish/content/repo-handler.js`. The Tovu writers (`createFormDefinition`, `updateFormDefinition`, `setFormDefinitionStatus` in `F/forms/index.ts`) are host wrappers that add `FORMS_PERMISSION`, `RESERVED_SLUGS` and host-worded slug text, so keep them injected through `write` as the sheet says. Type `write` as `{ createFormDefinition(required: { deps: W; input: { workspaceId: string; actor: MutationActor; name: string; slug: string; fields: FieldDescriptor[]; notify: ...; mode?; html?; provider? } }): Promise<{ definition: HtmlFormDefinitionRecord }>; ... }` using the exact parameter types of the Tovu wrappers at `F/forms/index.ts:98` and `:117`, with `W = ReturnType<typeof gatewayDeps> & { repo; executeCommand }`. Add test `form publish write outside an apply run is refused before any writer call`, mutation `FORM-PUBLISH-GUESS-USER-ACTOR`. Add changeset line only; no other change. |
| W3C-W1-08 user purge | FIX | (1) Add the binder signature the sheet omits. In `F/identity/user-purge-sql-binding.ts` export `bindSqlUserPurgePorts({ kernel, eventValues }: { kernel: ContentKernel; eventValues: typeof outboxEventValues }, _optional: Record<string, never> = {}): UserPurgeSqlPorts`. `transaction` = `({ run }) => kernel.transaction(run)`; `deleteCounted` = the current `:54-63` body with `Number(result.numDeletedRows)`; `deletePrincipalVault` = `deleteFrom("secrets_vault")` with both predicates (`:72-76`); `deleteIdentityUser` = `identity_users` with both predicates (`:77-81`); `deletePrincipal` = `principals` with `workspace_id` and `id` (`:82`); `appendOutbox` = `kernel.run((db) => db.insertInto("outbox_events").values(eventValues(event)).execute())` (`:87`, stays a raw insert, do not route it through the change-set outbox). (2) Importer rewrite, same for all 11 listed importers plus `C/site-deps/trash-adapters.ts:106`: replace `new SqlUserPurge({ kernel, eventValues: outboxEventValues })` with `new SqlUserPurge({ ports: bindSqlUserPurgePorts({ kernel, eventValues: outboxEventValues }) })`. The parity harness (`P/db/__tests__/parity/parity-harness.ts:87,494`) loads `features/identity/user-purge-sql-binding.ts` and builds `new SqlUserPurge({ ports: bindSqlUserPurgePorts(...) })`; the `mods.current ? {kernel,eventValues} : ctx.kernel` ternary at `:494` keeps its legacy branch only if the harness still compares an old tip; otherwise delete the legacy branch. (3) Order inside `purgeUser` is exactly: `transaction.run{ deleteCounted(principal_roles) -> principal_policies -> sessions -> api_keys -> setting_values_user -> deletePrincipalVault -> deleteIdentityUser -> deletePrincipal -> build event -> appendOutbox } -> return counts`. `buildEvent` is called after all deletes and inside `run`. (4) Replace the three named mutations with: `PURGE-OUTBOX-AFTER-COMMIT` (move `appendOutbox` outside `transaction.run`; caught by the Jini fake-port test that records `begin/commit` and asserts `appendOutbox` is between them), `PURGE-EVENT-BEFORE-DELETES` (call `buildEvent` with zero counts first; caught by the counts test), `PURGE-REORDER-PRINCIPAL-FIRST` (move `deletePrincipal` before `deleteCounted`; caught by a fake-port call-order assertion of the exact eight-step sequence above), `PURGE-SKIP-VAULT` (omit `deletePrincipalVault`; caught by the same call-order assertion because SQL cascade would hide it), `PURGE-SCOPE-OMIT-WORKSPACE` (class passes `workspaceId: undefined`; caught by a fake-port scope assertion). (5) Two mutations live in the Tovu binder, so their witnesses must be Tovu SQL tests, not Jini fakes: `PURGE-DELETE-ISSUER-KEYS` and `PURGE-BINDER-DROP-WORKSPACE-PREDICATE`. Add to `F/identity/__tests__/user-purge.test.ts`: "an api key ISSUED by the purged principal for another principal survives" (seed an `api_keys` row whose `principal_id` is another principal and whose issuer column names the purged one; assert it remains and `apiKeys` count excludes it) and "same principal id rows in another workspace are untouched" if the schema allows it (it currently only seeds `other-workspace-user`, `user-purge.test.ts:172`; that does not exercise the workspace predicate). Existing rollback test `:183` and vault-cascade test `:209` stay in Tovu. (6) `ADS` note: after this sheet, update the round-2 producer ledger anchor `F/identity/user-purge.ts:87` to `F/identity/user-purge-sql-binding.ts` (`appendOutbox`). |
| W3C-W1-09 newsletter refusals | REJECT (duplicate) | Do not build W1-09. Build round-1 `$SCR/r12/w3-ext-w2.md` J08 then T08 exactly as written (same source `:28-111`, same destination `user-management:newsletter/http-error-responses`, same signature, same tests, same mutation `NEWSLETTER-RETURN-UNKNOWN-MESSAGE`; J08 is the one to build because it already carries the cms-port compatibility test). Fold in the only W1-09 extras: (a) T08 also rewords the comment mentions at `F/newsletter/tool-registrations.ts:9`, `S/inbound/admin-http/routes/newsletter/__tests__/error-mapping.test.ts:23`, `C/modules/newsletter.ts:109` and updates `S/INFO.md:89`; (b) reconcile `development/why-comments-debt.json:4978` if that entry names the deleted file; (c) J08 adds `"./newsletter/http-error-responses": "universal"` to `jini.entries` (review G1) and the changeset is J08's, not `w3c-w1-newsletter-refusals.md`. W1-09's "No import from CMS" is satisfied by J08 (type-only structural match, user-management already depends on cms at `package.json:758`, no new import). |
| W3C-W1-10 plugin widget partials | APPROVE (marginal) | Anchors exact (`:3-21`; importers `response.ts:2` and `contribution-runtime.integration.test.ts:20` are the only two). Optional tightening, not required: place at `plugins:host/widget-partials` (next to `renderPluginWidgetFragments` in `host/contributions.ts:178`) rather than `runtime/`, since `runtime/*` modules only import `host/` types. The sheet's `runtime/widget-partials` is acceptable (`runtime/install-consent.ts:1` already imports `../host/node/index.js`). Note the moved logic is 13 lines; the value is the enabled-before-validate-before-expand ordering, which the three tests pin. |
| W3C-W1-11 post storage/tools/publish | FIX (big, 5 edits) | See "W1-11 fix text" below. Short form: (a) drop `core:contracts/site/post-removal` and use round-2 sheet 61's `core:contracts/site/cms-post-tools`; (b) build after round-2 sheets 61, 62, 33, 34; (c) import `restorePostForward` directly from `./post-trash.js` instead of injecting it; (d) thread the run actor (no `kind: "user"`); (e) specify the duplicate-handler selectors literally. |

### W1-11 fix text (literal, replaces the named passages)

1. **ORDER line (add under the sheet title).** "Build after round-2 sheets 61, 62, 33 and 34. Sheet 61 owns `RemovePostFn`/`ForgetRemovedPostFn` (`core:contracts/site/cms-post-tools`); sheet 62 moves `post-trash.ts` to `cms:posts/post-trash`; sheet 34 threads the run actor through `F/post/publish-content.ts` (its row `W/features/post/publish-content.ts:332-370,422-430,507-535,558-608`), which this sheet then moves. Delete the sentence 'Nothing here requires an implementation from the round-2 post sheets'."
2. **Shared boundary bullet 1.** Replace the whole bullet with: "Do not create a core removal contract here. Import `RemovePostFn` from `@jini-ai/core/contracts/site/cms-post-tools` (round-2 sheet 61). Leave `ForgetRemovedPostFn` where it is (`cms/src/widgets/host-ports.ts:41`, exported; `cms/src/posts/post-publish-ports.ts:1` already imports it). The 'Shared removal types' repoint list is owned by round-2 sheet 63 (same importers: `S/routes/types.ts:33`, `F/publish-content/tovu-publish-ports.ts:2`, `F/widgets/deps.ts:4`, `F/post/{post-retire,post-tool-deps,publish-content,reverters}.ts`), do not repeat it." Remove 'Export `./contracts/site/post-removal` in core' and 'and core' from the changeset line.
3. **Publish contributor (C).** Replace "Use the current `restorePostForward` input/result contract narrowed to the operation at `:331-345,555-566`, injected from Tovu." with "Import `restorePostForward` from `./post-trash.js` (round-2 sheet 62 moves it into this folder). Do not inject it. Keep `RemovePostFn` as an optional `post.remove` on `PostBag` exactly as `:28-34`." Replace "importing operator as command actor" with: "The command actor is the apply run's actor: replace `const actor = { id: input.principalId, kind: 'user' as const }` (tip `:521`) by `const actor = applyRunActor({ deps, principalId: input.principalId })` (import from `../publish/content/repo-handler.js`) and pass the same `actor` to `importPostEntity`, `retirePostForReplacement` and `restorePostForward` inputs wherever sheet 34 added it. `actorId` stays the importing operator's principal; the source author never becomes `actorId` or `actor`." Add tests "post import/retire outside an apply run refuses before any write" with mutation `POST-PUBLISH-GUESS-USER-ACTOR`.
4. **Duplicate row (B).** Replace the `post-tool-duplicate.ts` row with: `contributePostDuplicateHandlers({ deriveDuplicateName, createPost, processOutbox, selectors }: { deriveDuplicateName: DeriveDuplicateName; createPost: (required: { deps: D; input: CreatePostInput }) => Promise<{ post: PostRecord }>; processOutbox: (required: { deps: D }) => Promise<void>; selectors: { repo(deps: D): PostRepoPort; workspaceId(deps: D): string; authorize(deps: D): AuthorizeFn; commandDeps(deps: D): PostCommandDeps; viewDeps(deps: D): PostToolViewDeps; readPermission: string; writePermission: string; attribution(required: { principalId: string }): MutationActor } }, _optional: Record<string, never> = {}): DuplicateResourceHandlerContributor<D>[]` with `D` generic. The tip imports `createPost` from `./post-create.js` and `processOutbox` from `contracts/core/events/outbox-worker.js` (both Tovu-side today), `CONTENT_READ_PERMISSION`/`CONTENT_WRITE_PERMISSION`/`assistantPostAttribution`/`postCommandDeps` from `post-tool-policy.js` (round-2 sheet 64 moves these to `cms:posts/post-tool-policy`; use them through `selectors` so no import of Tovu or of an unbuilt file is needed). Delete the phrases 'small selectors' and 'instead of importing host `PostToolDeps`'. Tovu supplies the selectors from `F/post/post-tool-duplicate.ts` (kept as a ~25-line binding that calls the Jini contributor).
5. **Mutations.** Add `POST-PUBLISH-GUESS-USER-ACTOR` to the publish-retire tests. Existing names stay.
6. **Destination consistency with round-2 sheets 61-67.** All W1-11 destinations are `cms:posts/*` (`repo.memory`, `post-retire`, `post-tool-delete|duplicate|list|update`, `publish-content`, `sql/repo.rows`) and do not collide with round-2's `cms:posts/{post-update,post-trash,post-tool-input,post-tool-policy,post-tool-deps,tool-registrations,preview-tool,search-index.memory}`. No cycle: `post-tool-update` receives its four optional readers by injection (so no import of `post-tool-input`), `post-tool-delete`/`list` need no policy file. Round-2 sheet 64 says the host binds helper groups to "the existing exports listed at `tool-registrations.ts:29-31`" and 65 keeps `F/post/post-tool-{list,update,delete}.ts` in Tovu; once W1-11 lands those three files are gone, so sheet 65's text must read "bind the helper groups from `@jini-ai/cms/posts/post-tool-{list,update,delete}`". Round-2 sheet 67 (Tovu scratch adapter) calls the host row encoder `toRow`; after W1-11 it is `toRow({ record })` from the host binder over `cms:posts/sql/repo.rows`.

#### Classification corrections

| file | sheet verdict | correct verdict | why |
|---|---|---|---|
| `newsletter/http-error-responses.ts` (row 80) | M | M but owned by round-1 J08/T08, not W1-09 | Same move already sheeted in `$SCR/r12/w3-ext-w2.md:139-156,294`. |
| none else | | | All 28 SKIP rows, 10 A rows and 8 H rows in 67-122 checked OK. |

#### Classification spot-checks done

H rows (all 8 in range):
- 79 `newsletter/deps-builders.ts` OK: 85 lines binding origin/sender/transport/consent.
- 86 `pages/index.ts` OK: 34-line barrel/binder.
- 87 `pages/permissions.ts` OK: `registerPagesPermissionGrants` (`:125-154`) registers the product permission `pages.edit_html` and SPEC-047 copy against the injected `PermissionGrantRegistry` from user-management; the mechanism already lives in Jini (`identity/permission-grants`), remainder is policy/copy.
- 88 `pages/skeleton.ts` OK: 61 lines, a re-export of `PAGE_SKELETON_REGIONS` from `contracts/core/page-html.js` plus product starter copy.
- 91 `plugin-runtime/built-ins/content-analyzer/index.ts` OK: `CONTENT_ANALYZER_MANIFEST` product manifest (`:33-103`), imports only Jini types.
- 98 `plugin-runtime/install.ts` OK: 23 lines.
- 100 `plugin-runtime/service-ports.ts` OK: 8 lines.
- 116 `post/post-tool-view-deps.ts` OK: 43 lines, binds routing/runtime mode into `PostToolViewDeps`; Jini `posts/post-tool-views` already owns the view type.

A rows (all 10):
- 74 `media/verify-published-media.ts` OK: source gone; `jini/packages/cms/src/media/site/verify-published-media.ts` exists.
- 76 `newsletter/agent-tools.ts` OK: source gone; `jini/packages/user-management/src/newsletter/agent-tools.ts` exists.
- 90 `analyze-content.ts` OK: source gone.
- 94 `capability-tool-registrations.ts` OK: 127 lines, a binding over `createPluginCapabilityTools` from `@jini-ai/plugins` (`:2,:73`) plus Tovu messages and the `@tovu/sdk` hook constant.
- 95 `declarative-content-types.ts` OK: 87 lines over `createDeclarativeContentTypes` (`:46`); Jini has `plugins/src/runtime/declarative-content-types.ts`.
- 96 `install-archive.ts` OK: 45-line binding.
- 99 `provider-status-tool.ts` OK: 10 lines over `createProviderStatusTools` from `@jini-ai/agent-plugins/lifecycle/host-tools`.
- 101 `source-tools.ts` OK: 15 lines over `buildPluginSourceRegistrations` (`@jini-ai/plugins/host/tools`).
- 102 `plugin-runtime/tool-registrations.ts` OK: 71 lines over `buildPluginManagementRegistrations` etc.
- 104 `post/agent-hold.ts` OK: source gone; `jini/packages/cms/src/posts/agent-hold.ts` exists and is exported (`./posts/agent-hold`).

SKIP rows: all 28 grepped against `$SCR/r12/w3b-*.md`; each is named in `w3b-ext-w2a.md`, `w3b-ext-w2b.md` or `w3b-arch.md` (media 7, newsletter 4, pages 4, plugin-runtime 3, post 10). OK.

MOVE rows sampled (is logic still in Tovu and not in Jini): `post-retire.ts` (`retirePostForReplacement` only at `F/post/post-retire.ts:75`), `repo.memory.ts` (`InMemoryPostRepo` at `:23`, none in `cms/src/posts`), `repo.rows.ts` (`toRecord` at `:71`; `cms/src/posts/sql` holds only search-index files), `post-tool-*` (still Tovu), `widget-partials.ts` (Jini has only `renderPluginWidgetFragments`). OK. `forms/publish-content.ts` and `entries/publish-content.ts` are outside rows 67-122 but both are real MOVE (Jini has no `contributeFormPublish`/`contributeCollectionEntryPublish`).

#### Anchors checked

| anchor | claimed | actual | result |
|---|---|---|---|
| `F/entries/publish-content.ts` | `:26-43,49-115,117-182` | `:26-38` header type, `:40-49` widget guard, `:51-107` write, `:109-115` validate, `:117-184` policy; `importEntry` input now has `actor: applyRunActor(...)` at `:89-90` | DRIFT, re-anchored in fix text |
| `F/entries/publish-content.ts` change since pin | none | one line import + two lines of input added (`git diff c0f1068a59 HEAD`) | sheet still applies once actor line is carried |
| Jini `repo-handler.ts` `applyRunActor` | n/a | exported at `repo-handler.ts:~440-458` (e00cb9427), throws `MissingMutationActorError` | OK |
| `F/forms/publish-content.ts:14,29-74,83-85` | | `:15` FormBag, `:29-77` contributor, `:83-85` publishableForm | WRONG by 1 and 3 lines |
| forms `:64-70` writer signatures | | `:69,70,73` | WRONG |
| `F/forms/publish-content.ts:60` actor | (not mentioned) | `{ id: principalId, kind: "user" }` guessed actor | missed by sheet |
| `F/identity/user-purge.ts:15,38-92` | | `:15` CountedTable, `:38-92` class | OK |
| `user-purge.ts:87` outbox raw insert | in round-2 producer ledger | `db.insertInto("outbox_events").values(this.eventValues(event))` | OK, becomes `appendOutbox` in the binder |
| purge delete order `:66-82` | roles, policies, sessions, api_keys, setting_values_user, vault, identity_users, principals | exactly that | OK |
| purge importers (11 listed + `trash-adapters.ts:106`) | | all 11 present by rg; `vault-cascade-parity.test.ts:7` comment only; constructor today is `{ kernel, eventValues }` | OK, but sheet omits the binder name and the `new SqlUserPurge(...)` rewrite |
| `F/newsletter/http-error-responses.ts:28-111` | | `:28` table start, `:111` end | OK |
| `C/modules/newsletter.ts:28,109`; `tool-registrations.ts:9`; `error-mapping.test.ts:23` | | `:28` import; the other three are comment mentions | OK |
| `S/INFO.md:89` | | mentions the path | OK |
| `development/why-comments-debt.json:4978` | | exists (entry text about Jini shared.ts move) | OK |
| `check-architecture.baseline.json:47,53,90` | | `:47` entries, `:53` forms, `:90` `post/repo.memory.ts` | OK |
| `coverage-integrity-baseline.json:35` | | `src/features/post/repo.memory.ts` | OK |
| `F/plugin-runtime/widget-partials.ts:3-21` | | `:3-21` | OK |
| `P/publish-contracts.ts:26-34` / `:42` | | `RemovePostFn` `:26-34`, `ForgetRemovedPostFn` `:42` | OK |
| `post/tool-registrations.ts:29-31,51,225,283` | | `:29-31` imports; `:51` `matchesPostListFilters`; `:225` `parseUpdatePatch`; `:283` `isPartialPatch` | OK |
| `post/repo.ts:72,85,166,172,190,195,343`; `search-index.memory.ts:87` | | all call `toRecord`/`toRow`/`updatableColumns`/`toRevisionRow` | OK |
| `post/index.ts:9` | | `export { InMemoryPostRepo } from "./repo.memory.js"` | OK |
| `post/publish-content.ts:28-34,...,555-625` | | `:28-34` PostBag, `:393-504` contributor, `:521` guessed actor, `:555-625` retire helpers | OK, but `:521` actor is not addressed |
| post file extents (`post-retire` 153, `delete` 50, `duplicate` 239, `list` 127, `update` 144, `repo.memory` 262, `repo.rows` 253) | | match | OK |

#### Duplicates/conflicts with round 1/2 or other round-3 sets

- **W1-09 duplicates round-1 J08/T08** (see verdict). Reject W1-09.
- **W1-11 vs round-2 sheet 61 (hard conflict).** 61 moves `RemovePostFn` and `ForgetRemovedPostFn` to `core:contracts/site/cms-post-tools`. W1-11 creates `core:contracts/site/post-removal` for `RemovePostFn`, would leave two core contracts for one type, and repeats 63's importer list. Fixed above (use 61).
- **W1-11 vs round-2 sheet 62.** 62 moves `restorePostForward` into `cms:posts/post-trash`; W1-11 injects it from Tovu. Same package after 62, so inject is pointless. Fixed above.
- **W1-11 vs round-2 sheet 34 (order/edit conflict).** 34's row for `F/post/publish-content.ts` threads the required actor through import/retire/compensation; W1-11 deletes that file. If W1-11 is built first, the Tovu file no longer exists to edit and the moved Jini code keeps the guessed `{ kind: "user" }` (tip `:521`). Order: 33 and 34 first, then W1-11, and W1-11 moves the threaded code. (Jini `post-import.ts` still takes only `actorId`, line 51, so 33's post part is not built yet either.)
- **W1-08 vs round-2 `w3b-arch.md` ~397-452.** The producer ledger keeps the raw insert `identity/user-purge.ts:87` as an open owner decision. W1-08 relocates exactly that line into `user-purge-sql-binding.ts:appendOutbox` and leaves it a raw insert with no actor change; there is no build conflict, only a stale anchor (updated in fix item 6). W1-08 does not touch `trash/adapters/user.ts:82`. The purge event's actor comes from the caller-supplied `buildEvent`, which neither sheet changes.
- **W1-11 vs w3c-w2 W3C-w2-02 and w3c-w1b W3C-w1b-02** (same post files, `repo.ts`, `reverters.ts`): left to the head-to-head checker.
- W1-06/W1-07 vs round-2 sheet 34: its table lists post, navigation, theme, widgets, taxonomy, media but not `entries/publish-content.ts` (already threaded at the tip) nor `forms/publish-content.ts` (still guesses `kind: "user"`). W1-07's fix covers forms.

#### Security notes

- **W1-08 deletion.** Transaction boundary, delete order, counts and audit event are preserved by the sheet's text, but it names mutations that can only be caught where they live. `PURGE-DELETE-ISSUER-KEYS` and workspace-predicate mutations live in the Tovu SQL binder; a Jini fake-port test cannot see them, and the existing Tovu `user-purge.test.ts` has no issuer-key row (grep: no `issuer`/`issued`) and its "other workspace" row is a different principal (`:172`). Fix items 4-5 add the call-order mutations (`PURGE-REORDER-PRINCIPAL-FIRST`, `PURGE-SKIP-VAULT`, `PURGE-EVENT-BEFORE-DELETES`) and the two Tovu witnesses. The vault delete is a credential row, so `PURGE-SKIP-VAULT` matters: SQL FK cascade (`user-purge.test.ts:209`) would hide its omission.
- **Atomicity.** A Jini fake `transaction` cannot prove rollback; the sheet correctly keeps the rollback/dialect witnesses (`:183`, `:209`) in Tovu. Keep them unchanged and run them against the binder.
- **Guessed actors (H2).** Jini now refuses an actor-less apply (`applyRunActor`). Moving `forms/publish-content.ts:60` and `post/publish-content.ts:521` as written would ship a guessed `kind: "user"` into a Jini package. Fixed in W1-07 and W1-11 text.
- **W1-06** term preflight before entry write and `terms.apply()` after (`:67-75`, `:105`) is kept by the sheet; the existing pin `ENTRY-PUBLISH-SYNC-AFTER-AUTHORIZED-WRITE` covers it. Widget refusal both directions (`:63`, `:111`) preserved by `ENTRY-PUBLISH-FILTER-EXPORT-ONLY`.
- **W1-10** `isEnabled` check before `validateHtml` before `expand`: tests and `PLUGIN-PARTIAL-ASSUME-ENABLED`, `PLUGIN-PARTIAL-SKIP-VALIDATION` cover it.
- **W1-11 retire/trash**: `POST-PUBLISH-SKIP-COMPENSATION`, `POST-RETIRE-BUMP-TRASH-VERSION` cover compensation and trashed holder. The sheet says a missing apply-only removal port must not skip Trash bookkeeping; the tip enforces that with the thrown wiring error at `:515-520`. Keep it.

#### Plain-words summary

W1-06 and W1-07 move the collection-entry and form-definition publish contributors, but both are stale in a way that matters. A recent Jini change makes publish writes use the apply run's trusted actor and refuse a guessed one. The entry file was already updated for that, and the sheet missed it. The form file still builds a made-up user actor, and W1-07 would copy that into Jini. I wrote the exact actor lines and tests for both. W1-08, the user purge, is sound in structure, but it leaves out the SQL binder's name and the `new SqlUserPurge` rewrite that 12 call sites need, and its named mutations cannot be caught by the Jini fake-port tests for the parts that stay in Tovu SQL. I added the binder signature, the exact delete order, the missing reorder and vault mutations, and two Tovu SQL witnesses. W1-09 is a straight duplicate of round-1 J08/T08, so it should not be built a second time. W1-10 is fine, if thin. W1-11 collides with round-2 sheets 61, 62 and 34: it invents a second core contract for the same removal type, injects a function that sheet 62 moves into the same folder, and moves a file that sheet 34 must edit first. Reordered after 61, 62, 33 and 34, with the duplicate-handler selectors written out, it is buildable. Classification rows 67-122 hold up: all 28 SKIP rows are on the round-2 list, and every A and H row checked is correct.

#### New owner questions

1. Should `forms/publish-content.ts` follow FIX 19 / H2 (refuse a write with no run actor) as part of W1-07, or keep the guessed `user` actor for one more round? Recommended: follow FIX 19 now; moving the guess into Jini would reintroduce what e00cb9427 removed, and round-2 sheet 34 does not cover forms.
2. Should W1-10 land in `plugins:host/widget-partials` (next to `renderPluginWidgetFragments`) or `plugins:runtime/widget-partials`? Recommended: keep the sheet's `runtime/` path; both are legal and it avoids a re-sheet.

#### Appendix: NEEDS-OPUS sheets

None. Every fix above is literal text Sol can follow.

## B. w1b

### Round-3 check: w3c-w1b.md (sheets W3C-w1b-01 .. 09, 121-row table)

Scope notes. Read-only. About 31 tool calls. Verified against Tovu tip `$SCR/tovu` and Jini tip `$SCR/jini`. Items I could not open in the budget are marked UNCHECKED or "not line-verified".

#### Verdict table

| sheet | verdict | exact fix text (literal) |
|---|---|---|
| W3C-w1b-01 | FIX | See "FIX 01" below. Two defects: (a) the disconnect destination package has no `@jini-ai/integrations` dependency, but the moved code needs its types and functions; (b) `createKeyAttachments` has no way to receive `jsonText`. |
| W3C-w1b-02 | FIX | See "FIX 02". Range 41 is the host hold predicate, not class code; a Jini `postRepoFor` collides with the Tovu one. |
| W3C-w1b-03 | SPLIT: 03a FIX, 03b NEEDS-OPUS | 03a (raw-row SQLite port) is buildable with the "FIX 03a" text. 03b (publish tool registrar) has an 11-member `PublishRegistrationPorts` bag with no signatures. Replacement skeleton is in the appendix. Anchors on the Jini tip are fine (see Anchors). |
| W3C-w1b-04 | APPROVE | One optional literal for Sol: refusal order is (source refusals in place), then duplicate refusals in first-duplicate-detected order (the `Set` insertion order of the original). |
| W3C-w1b-05 | APPROVE | Anchors OK (ports.ts:53/85/90; route-manifest.ts:83/107/273). Not line-verified: body 171–339. No overlap with R1 J06/T06 or R2 (`route-manifest` appears in no r12 sheet). |
| W3C-w1b-06 | SPLIT: 06a FIX/UNCHECKED, 06b NEEDS-OPUS | 06b (share-database projection) needs a design of the database/staging ports ("session objects with the exact capabilities used"). Skeleton in the appendix. 06a (tool registrar): see "FIX 06a". |
| W3C-w1b-07 | FIX | See "FIX 07". The order sentence about fetchers is wrong about who does the permission check; the dependency on w3b-ext-w2b sheets 76–77 is unstated. |
| W3C-w1b-08 | FIX | See "FIX 08". The Tovu adapter imports `lazyKernel` from cms; user-management may not. The `eventValues` type comes from `@jini-ai/db`. `move-to-trash.ts` is R2-owned. |
| W3C-w1b-09 | SPLIT: 09a FIX, 09b FIX, 09c NEEDS-OPUS | See "FIX 09". Three unrelated Jini adds in one sheet. Several line ranges cut functions in half. 09c (reconciler) has no result type and no real port signatures. Skeleton in the appendix. |

##### FIX 01
1. Replace the sentence "Put the host digest ... in `F/project-keys/shared-oauth-disconnect-host.ts`" context with a new destination. Disconnect moves to `J/integrations/src/api-connections/shared-oauth-disconnect.ts` (export `./api-connections/shared-oauth-disconnect`, `jini.entries` `"node"`, baseline `jini-ai__integrations.json`, changeset also names `@jini-ai/integrations`). Reason: `SharedOAuthDisconnectStorage` is typed as `Parameters<typeof disconnectApiConnection>[0]['deps']['records'|'descriptor'|'tokens']`, `ApiConnectionError` and `ApiConnectionHooks` come from `@jini-ai/integrations/api-connections`. `@jini-ai/user-management` depends only on `@jini-ai/core` (package.json:743-748), so moving this file there forces an invented structural copy of integrations types or a new user-management to integrations edge. The file is the API-connections shared-OAuth lifecycle (same domain as `shared-api.ts:10-30` `SharedApiOwnerStorage`/`SharedApiKeyAttachments`).
   - `DisconnectOwner` keeps `storage`, `attachments: KeyAttachments`, `transaction: ProjectKeyTransaction`, `clock` and adds `ownerWorkspaceId: string`, `digest: (required: { text: string }, optional?: Empty) => string`, `copy: { changed: string; revocationUnavailable: string }`. Delete the previously proposed `changedError` and `disconnectConnection` injections; `ApiConnectionError({ code: 'storage-conflict', message: copy.changed })` and `disconnectApiConnection` are imported locally.
   - Replace both literal `'project'` (source lines 33 and 62) with `ownerWorkspaceId`.
   - Host binding file stays `F/project-keys/shared-oauth-disconnect-host.ts`; it supplies `digest = text => createHash('sha256').update(text).digest('hex')`, `ownerWorkspaceId: 'project'`, and the two current strings (source lines 25 and 61).
   - If the owner insists on user-management, keep destination but add `"@jini-ai/integrations"` to `peerDependencies` (optional) and `jini.optionalPeers` with the standard message, and import types only.
2. Attachments. Add to `createKeyAttachments` required args: `credentialTypeText: (required: { column: RawBuilder<unknown> }, optional?: Empty) => RawBuilder<string | null>` (host binds `({ column }) => jsonText({ dialect: kernel.dialect, column, path: ["credentialType"] })`). `AttachmentSqlPort` is exactly `{ readonly dialect: string; query<Row>(statement: RawBuilder<unknown>, optional?: Empty): Promise<readonly Row[]>; execute(statement: RawBuilder<unknown>, optional?: Empty): Promise<unknown> }` with `RawBuilder` from `kysely` (already an optional peer of user-management, package.json:129/752). Table names go in via `sql.table(name)` after validating `/^[A-Za-z_]\w*$/` at construction (throw otherwise). `AttachmentPolicy = { ownerWorkspaceId: string; customKind: string; vendorKind: string; vendorCredentialType: string; maxGrants: number; tooManyKeys: string; ambiguousLabel: string; noSiteId: string }` (maps to the literals `'project'`, `'custom'`, `'vendor'`, `'custom'`, `100`, and the three messages at attachments.ts:25-33,36,40). `limit + 1` stays literal in SQL as `LIMIT ${maxGrants + 1}`.
3. Tests. Add mutation `PK-DISCONNECT-REVOKE-BEFORE-GRANT-REMOVAL` (swap `removeKey` and `disconnectApiConnection` order) with test `grants are removed before any provider call`; add mutation `PK-ATTACH-LIMIT-OFF-BY-ONE` (use `maxGrants` instead of `maxGrants + 1`) so over-cap detection is witnessed.

##### FIX 02
- Change "`F/post/repo.ts:41–369` → `J/cms/src/posts/sql/repo.ts`" to "`F/post/repo.ts:44–369` (the `SqlPostRepo` class only). Lines 30–41 (hold predicate `notHeldAgentSchedule` and its comment) stay in Tovu and are passed as `notHeldAgentSchedule`." (Line 41 is the `const notHeldAgentSchedule = sql<boolean>...` declaration, verified.)
- Delete "`postRepoFor(required: SqlPostRepoDeps, _optional: Empty = {}): SqlPostRepo` constructs it" from the Jini side. Jini exports only the class `SqlPostRepo`. Tovu `F/post/repo.ts:371-374` keeps `postRepoFor(kernel, options)` unchanged; no name collision.
- Add to Tests-first: the PGlite/Postgres parity fixtures (`F/post/__tests__/pglite-repo.fixture.ts`, `repo.postgres.test.ts`) stay in Tovu and keep exercising the host-bound class; the new Jini test uses the in-memory SQLite kernel already used by neighbouring `cms/src/posts/sql` tests. State this so Sol does not try to carry PGlite into Jini.
- Importer lists verified complete (see Anchors). Note collision: `w3-p11rest.md:186` (ST-13) changes `post-trash.ts` fence; sheet already says preserve host callable lock. OK.

##### FIX 03a
- Add literal `copy: { notSqlite: string; foreignKeyViolation: (required: { table: string; rowid: unknown; parent: string }, optional?: Empty) => string }`. Values: the strings at publish-backstop-row.sqlite.ts:87 and :98.
- `tableInfo` ABI change must be stated: Jini signature is `tableInfo({ table })` (host closes over the kernel); today's host signature is `tableInfo({ kernel, table })` (file line 24). The host binder `backstop-sqlite-binding.ts` keeps the CURRENT outer signature `{ kernel, tableInfo: typeof sqliteTableInfo, checkedTransaction: typeof sqliteForeignKeyCheckedTransaction }` and builds the closures. Importers (7 listed) verified complete.
- Add: moved `identifier`, `allowed`, `encode`, `decode`, `wherePk` keep their why-comments (lines 15, 19, 24, 35, 58). `allowed` calls injected `checkTable`; denied result throws `BackstopRefusal` (Jini `cms/publish/content/backstop-refusal`).

##### FIX 06a
- UNCHECKED beyond anchor existence (tool-registrations.ts is 253 lines, range 43–253 plausible). Add the literal ordering line: "In the import tool, the permission check precedes download, upload consumption and registry writes; Sol keeps the current statement order and does not reorder while splitting functions to <= 80 lines." Mutation `BACKUP-IMPORT-ADMIT-AFTER-EFFECT` is correct.
- Specify `catalog` argument: `createSiteBackupCatalog` is passed in as `catalog`, not built inside; state "`catalog` is the already-built read-only catalog the host constructed" (the sheet lists both `catalog` in args and `createSiteBackupCatalog` in the same bullet).

##### FIX 07
- Replace "Fetchers keep path/body validation, then permission, and only then loopback or guarded network I/O." with: "The moved registrar keeps this exact order in `fetch_live_url` (tool-registrations.ts:177-186): `requireInputRecord`, `requireString(path)`, `readPageBodyOptions`, origin type check, `requireToolPermission(SITE_INSPECTION_READ_PERMISSION)`, then the missing-guarded-client refusal, then the injected `fetchLiveUrl`. `fetch_published_page` (:187-193) is the same minus the origin and client checks. The injected `fetchPublishedPage` and `fetchLiveUrl` callbacks therefore run only after authorization."
- Add: "`toSiteProfileDeps(routeDeps)` and `toSiteCapabilitiesDeps(routeDeps)` must be called inside each handler invocation (the `profile` and `capabilities` callbacks), not at construction; `withReservedSegments` uses `Object.create(routeDeps, ...)` so lazily computed fields are read at call time."
- Add order line: "Build after `w3b-ext-w2b.md` sheets 76 and 77. Import the catalog from the Tovu `catalog-host.ts` bound catalog after 77; if built first, import `siteInspectionAgentToolCatalog` from `agent-tools.ts` and tell the 76–77 builder to repoint this one import. `CATALOG_BY_ID` (line 58) moves into Jini and is derived from the injected `catalog`."

##### FIX 08
- `F/trash/adapters/user.ts` imports `lazyKernel` from `@jini-ai/cms/trash/site/adapters/marker-sql` (user.ts:6) and uses it to accept a legacy `content.db` handle (deps.db, doc comment at :39). user-management must not import cms. Add: "The Jini adapter takes `kernel: SqlIdentityKernel` (existing `user-management/src/server/sql/kernel.ts`) only; the legacy-handle `lazyKernel(...)` call stays in the Tovu binder, which passes the resulting kernel." Add a line: "`TrashAdapter` and its shapes come from core `contracts/site/cms-trash`, not cms."
- Replace `eventValues: typeof outboxEventValues` (type from `@jini-ai/db/events`, which user-management does not depend on) with `eventValues: (event: DomainEvent) => Readonly<Record<string, unknown>>` (`DomainEvent` from `@jini-ai/core/contracts/events`). Add: the outbox insert uses `db.insertInto("outbox_events")`, so `UserTrashTables` includes `outbox_events` as the loosely typed row `Record<string, unknown>`.
- Ordering to preserve (verified at user.ts:44-58,99,137-144): guard (`assertAccountAction`) runs after the locked read and before the status-CAS `UPDATE`; session delete and outbox insert follow in the same transaction; purge refuses `status === "active"` with `"version-changed"` then calls `purgeUser`. Lock key `trash:user:${workspaceId}:${principalId}` is built by `policy.lockKey` (host vocabulary).
- Add order line: "`F/trash/move-to-trash.ts` is R2-owned (`w3b-ext-w2b.md`, row 225 in the table). The `TrashAuthorizeFn` import repoint at `move-to-trash.ts:19` must land before that sheet builds, or that sheet's builder must be told to take the type from core." Also `TrashAuthorizeFn` currently lives at `permissions.ts:73` and `trash/index.ts:58` forwards it.
- Compat-export wording "Keep compatibility exports on the existing CMS API surface" creates a re-export in `cms/trash/ports.ts`. There is precedent (`TrashActor` re-exported from core, cms-trash.ts header). Accept, but name the exact file: `cms/src/trash/ports.ts`.

##### FIX 09
- Split into 09a (repo secret scan), 09b (ordered keyring), 09c (reconciler). Each gets its own changeset line and test. 09a and 09b have no dependence on each other or on 09c.
- 09b. The sheet's ranges cut functions: "`keyring.env.ts:124–164,201–249,373–405`" becomes "`124–165` (class `EnvOrFileKeyring`), `201–256` (`describeSiteKeySource`, `reportedSourceOf`, `firstPresentSiteKey` at :221, `unusableSiteKeyError` at :232, `sealedWarningSubjectFor` at :249 which ends about :256; Sol confirms the closing brace)". Lines 373–405 are `inspectSiteKeyMaterial`, `readSiteKeyReveal`, `siteKeyRevealOf` and the head of `SiteKeyReveal` (interface at :404): these are host presentation and stay. Replace that range with: "Nothing in 373–405 moves; `readSiteKeyReveal` (:379) and `siteKeyRevealOf` (:389) call `readOrderedRootKey`." Reveal admission is unchanged.
- 09a. Ranges: "`secret-scan-guard.ts:172–194,215–276,390–404`" becomes "`172–196`, `197–277` (so `readScannableFile` at :197 is whole), `278–404`" because the history pipeline (`parseObjectPaths` :278, `filterBlobShas` :292 which holds the dedup the sheet requires to follow path detection, `listHistoricalBlobs` :309, `readBlobContents` :332, `toScannableBlob` :373, `listHistoricalPaths` :381, `scanGitHistoryForSecrets` :390) is only partly in the sheet's ranges. Git command execution (`gitCommand` :161, `listTrackedFiles` :167, the git calls inside :309-:389) stays in Tovu behind the ports. `isAllowlisted` (:154) stays host. Add the literal: "`SecretScanViolation` (:172) moves to Jini; Tovu re-imports the type from `@jini-ai/diagnostics/redaction/repo-secret-scan`." The CLI entry guard at :448 `import.meta.url === pathToFileURL(process.argv[1]).href` already guards `process.argv[1] &&`; the sheet's "capture `const entry = process.argv[1]`" is a style change only, keep.
- 09c is NEEDS-OPUS (appendix). Verified fact the sheet misses: `ensureSiteKey` (:219) first returns `{ action: "production-noop" }` for production (:223-225) before any reads, and `EnsureSiteKeyResult` carries `perSiteFilePath` (host path), not `reason`. Ranges `278–341` cut `adoptSiteKey` (:321–:367) in half.

#### Classification corrections

| file | sheet verdict | correct verdict | why |
|---|---|---|---|
| `trash/db-port.ts` | STAYS-HOST | DELETE-ALIAS (cosmetic) | 2-line `export type TrashDb = ContentKernel` (db-port.ts:1-2) is a re-export shell; importers could use `ContentKernel`. Not worth a sheet; keep STAYS-HOST label but do not describe as a "contract". |
| `site-export/index.ts` | STAYS-HOST | STAYS-HOST (note) | It is a 16-line barrel re-exporting local `route-manifest`/`site-exporter` items (index.ts:1-12). Owner rule "no re-export shells" may apply later; out of w1b scope. |

No MOVE or ALREADY-MOVED row I checked was misclassified.

#### Classification spot-checks done

STAYS-HOST (8 opened, 4 by size/exports only):
- `post/template-options.ts` OK: imports `resolveActiveTheme`, `NO_THEME_ID`, and the Jini `applicableThemeTemplates` (`@jini-ai/cms/themes/template-applicability`); host theme binding.
- `recovery/capability-card.ts` OK: Tovu product copy (`.tovu.zip`, Admin links, tool names).
- `site-export/index.ts` OK (note above): facade of local exporter bindings.
- `settings/visitor-tools-permissions.ts` OK: 14 lines, `registerPermission` with Tovu `VISITOR_TOOLS_PERMISSION` and product reason text.
- `trash/tool-kinds.ts` OK: imports local `./adapters/{comment,media,post,redirect}` entity types and `TRASH_PERMISSION_BY_ENTITY_TYPE`.
- `trash/db-port.ts` OK: alias only.
- `trash/registry.ts` OK by size (265 lines, one export) and sheet reason; not opened.
- `source-control/index.ts`, `settings/index.ts`, `site-inspection/deps.ts`, `widgets/deps.ts`, `webhooks/site-key-sources.ts`: sizes and export counts only (34/152/184/178/296 lines), not opened. UNCHECKED for content.

ALREADY-MOVED (12 checked, all OK):
- `trash/repo.sqlite.ts` (37 lines) imports `@jini-ai/cms/trash/sql`; Jini `trash/sql/repo.ts:86` `SqlTrashRepo`; export `./trash/sql` present.
- `trash/adapters/redirect.ts` imports `compareAndDelete, flipMarker, lazyKernel` from `@jini-ai/cms/trash/site/adapters/marker-sql` (redirect.ts:13); export present.
- `settings/repo.sqlite.ts` (24 lines): `class SqliteSettingsRepo extends SqlSettingsRepo` from `@jini-ai/db/settings`; export `./settings` present.
- `settings/settings-write-policies.ts`: imports `@jini-ai/cms/settings/site/site-title-write`, visitor-tools; exports present.
- `taxonomy/tool-registrations.ts` (179 lines): imports `@jini-ai/cms/taxonomy`; export present.
- `trash/tool-registrations.ts` (76 lines) imports `@jini-ai/cms/trash`.
- `webhooks/tool-registrations.ts` (124 lines) imports core webhook/surface contracts. (Jini webhook-tools export not separately grepped.)
- `publish-content/publish-tool.ts` (29 lines) and `backstop-service.ts` (22 lines) each import the matching `@jini-ai/cms/publish/content/*` entry; exports present.
- `site-backup/sources.ts` (83 lines) imports `@jini-ai/devops/backup/site/sources`; `site-backup/share-zip.ts` (43 lines) imports `.../share-zip`; exports present.
- `site-backup/import-restore.ts` (57 lines) imports `@jini-ai/devops/backup/site/import-restore`.
- "Source absent" rows verified absent in Tovu and present in Jini: `publish-content/{apply-run,planner,permissions}.ts` (Jini `cms/src/publish/content/*.ts`), `site-backup/{saved-keys,static-copy}.ts` (Jini `devops/src/backup/site/*.ts`), `webhooks/http.memory.ts`, `publish-trust/session.ts` (Tovu absent; Jini counterpart not grepped).

MOVE rows (3 + coverage sample):
- `project-keys/attachments.ts` OK: logic present in Tovu; `createKeyAttachments`, `site_key_attachments` appear in Jini only as the core contract (`core/src/contracts/site/project-key-attachments.ts`). Real MOVE.
- `webhooks/site-key-ensure.ts` OK: reconciliation present (`ensureSiteKey` :219, `settleSiteKey` :278, `adoptSiteKey` :321); Jini has only `planSiteKeyEnsure` (`platform/src/secrets/root-key/decide.ts:44`).
- `site-backup/share-database/repo.sqlite.ts` OK: `sanitizeShareDatabase`, `rewriteArchiveMedia`, `prepareSharePluginTables`, `refuseUnknownShareTables` appear in no Jini src.
- Also grepped Jini for `createRawRowSqlitePort`, `buildPublishContentRegistrations`, `collectBundledSourceControlProviders`, `buildSiteInspectionRegistrations`, `buildSiteBackupRegistrations`, `createUserTrashAdapter`, `trashPermissionFor`, `filterVisibleTrashItems`, `createOrderedRootKeyring`, `reconcileRootKey`, `scanTrackedRepo`: zero hits. No MOVE in 01-09 is already in Jini.
- `MOVE · R1/R2` coverage: 25 rows checked by grep of the source path in `r12/*.md`. R1 (`w3-ext-w2.md`): `publish-trust/connect.ts`, `webhooks/seal-aad-invariant.ts`, `site-backup/push-content.ts`, `site-export/{export-html-policy,media-original-urls,static-security-headers}.ts`. R2 (`w3b-ext-w2a/w2b`): `post/{search-index.memory,tool-registrations}`, `project-keys/{service,site-references,tools}`, `taxonomy/{agent-tools,publish-content}`, `trash/adapters/{media,member,post}`, `trash/move-to-trash`, `vendor-credentials/{types,vault-adapter}`, `widgets/publish-content`, `source-control/{store,types,tool-registrations,credential-setup}`, `site-export/site-exporter`, `publish-trust/publish-trust-revocations`. All appear in the claimed sheet. Not verified: that each R1 row's "J04/T04"-style id matches the id text in the file (only file-level hit).

#### Anchors checked

| anchor | result |
|---|---|
| 01 `attachments.ts:5–47` (file 47 lines) | OK |
| 01 `shared-oauth-disconnect.ts:6–64` (file 64 lines) | OK |
| 01 disconnect order: tx re-reads context/record/grants (:48-49), checks revision AND digest (:50), CAS pending only if not already pending (:51-55), `removeKey` (:56), then `disconnectApiConnection` (:59) | OK, matches sheet text; no token read in inspect (:30-38) |
| 01 `R/project-store.ts:6`, `F/project-keys/__tests__/attachments.unit.test.ts:6` | OK (import at :6 in both) |
| 01 `W/cli/commands/owner-store.ts:3`, `shared-api.unit.test.ts:9`, `shared-owner.integration.test.ts:19`, `shared-oauth-disconnect.unit.test.ts:5`, `a02-credential-contract.pin.unit.test.ts:13` | OK, and `rg` finds no other importer (README.md:165 and `external-mcp-shared-oauth.txt` fixture are text only) |
| 02 `repo.rows.ts:71,146,192,218,237` (toRecord, toRow, updatableColumns, toRevisionRecord, toRevisionRow) | OK |
| 02 `content-database.generated.ts:709` PostRevisionsTable, `:724` PostsTable | OK (order is revisions then posts) |
| 02 `repo.ts:41` | WRONG for "moves": it is the host hold predicate const; class starts :44 |
| 02 lock-before-read-before-append `:329–348` | OK (`appendRevision` lock, prior select, insert at ~:331-346) |
| 02 `repo.ts:372–374` postRepoFor | actual :371-374, OK |
| 02 reverter importers (6 post tests, 2 contracts tests, change-sets, trash, 2 composition) | OK, `rg` finds no extra; `F/post/index.ts:13` OK |
| 02 `reverters.ts:9` `ForgetRemovedPostFn` import, `:42` dep | OK |
| 03 `publish-backstop-row.sqlite.ts:8–103` (103 lines) | OK |
| 03 7 importers (4 tests, 2 route tests, `publish-backstop-ports.ts:3`, manifest test `:42`) | OK, complete |
| 03 `tool-registrations.ts:86–106,118–383,405–515` | OK (risk map :86, `CATALOG_BY_ID` :106, `requirePublishTrustProvisioning` :110 kept, `buildPublishContentRegistrations` :342) |
| 03 `:1` type forward; importers `assistant/tool-registrations.ts:60`, `disconnect-tool.ts:3`, tests | OK |
| 03 Jini `raw-row-contributor.ts` / `repo-handler.ts` changes since pin (FIX 19/H2: `applyRunActor`) | Diff is +4/-? in contributor and +25 in repo-handler; does not touch `RawRowPort` (`transfer/backstop-ports.ts:4-17`), so the 03a contract is unchanged. 03b's `PUB-PULL-SKIP-AUDIT-ACTOR` mutation is unaffected, but the builder should note `deps.mutationActor` now goes through `applyRunActor` (repo-handler.ts) |
| 04 `provider-registry.ts:145–175` loop, `:138` binder, Jini `source-control/registry.ts:122` | OK |
| 05 `ports.ts:53,85,90`, `route-manifest.ts:83,107,273` | OK |
| 06 `repo.sqlite.ts` ranges 31–144, 322–372, 399–451 (file 451) | OK on boundaries (`prepareSharePluginTables` :38, `refuseUnknownShareTables` :94, `sanitizeShareDatabase` :322, `rewriteArchiveMedia` :399). Sheet signatures differ from source: `omittedMediaIds` is in `required` today (:322) and the sheet moves it to optional |
| 06 `share-preparation-steps.ts:32` ShareDatabaseProjection | OK (:32) |
| 07 `:58`, `:73`, `:77–148`, `:150–152`, `:154–200`, `:214–227`, `:60` | OK (:73 `withReservedSegments`, :77 risk map, :154 builder, :214 contributor, :60 type forward) |
| 08 `user.ts:33–250` (file 250) | OK |
| 08 `permissions.ts:68–146`, `:27`, `:31–57`, `trash-item-tool.ts:53` (file changed since pin) | OK: :68 `trashPermissionFor`, :73 `TrashAuthorizeFn`, :89, :117, :143; :27 and trash-item-tool.ts:53 both `import { USER_ENTITY_TYPE }` (the "host policy constant") |
| 08 `trash/index.ts:58` | OK (`TrashAuthorizeFn` forward) |
| 08 core `contracts/site/cms-trash.ts` exists (TrashActor), core exports it (`package.json:223,239,1380`) | OK |
| 09 `keyring.env.ts` 124/201/373 starts | boundaries WRONG: 201–249 cuts `sealedWarningSubjectFor` (:249), 373–405 is host inspect/reveal and cuts interface at :404 |
| 09 `site-key-ensure.ts:219`, `:368`, `:803` | OK starts; `:278–341` WRONG (adoptSiteKey :321–367) |
| 09 `secret-scan-guard.ts:172`, `:253`, `:390`, `:448` | starts OK; `215–276` starts mid-function (`readScannableFile` :197–217) |
| 09 Tovu `package.json:64` `check:secret-scan` | OK |
| 09 Jini `decide.ts:44` `planSiteKeyEnsure`; `platform/package.json:21` `./secrets/root-key` node; `keyring.env.ts:47` `EnvOrFileKeyring`; `diagnostics redaction/secret-scan.ts:15` `scanTextForSecrets`, `./redaction/secrets-only` | OK. Sheet cites `decide.ts:44,67,91,102`; only :44 was opened |
| 09 `secret-scan-guard.paths.unit.test.ts:8`, `secret-scan-guard.test.ts:12/203/205`, `site-key-ensure*.test.ts` lines | UNCHECKED |

#### Duplicates/conflicts with round 1/2 or other round-3 sets

- No MOVE in w1b duplicates a source file claimed as MOVE in `w3-*.md` or `w3b-*.md`. Importer mentions only.
- W1b-01 vs R1 ext-w2 J01 (attached-vault, create-vault, site-sealer): same `user-management/src/project-keys/` folder for attachments, no file collision. Shared test file `a02-credential-contract.pin.unit.test.ts` is repointed by both (R1 at :11 to attached-vault, W1b-01 at :13 to shared-oauth-disconnect). Not a conflict but order matters: both edit different import lines of one file, so apply sequentially.
- W1b-01 vs R1 ext-w1 J05/T04 (shared-owner): the same four Tovu files are edited by both for different imports (`owner-store.ts`, `shared-api.unit.test.ts`, `shared-owner.integration.test.ts`, `shared-oauth-disconnect.unit.test.ts`; R1 cites lines :2/:10/:20/:4, current lines :3/:9/:19/:5 for the w1b-owned import). Sequence them; line numbers in whichever lands second will have shifted.
- W1b-01 vs R2 `w3b-ext-w2b` (project-keys service/tools/site-references): no file overlap. `project-keys/service.ts` in R1 is an import repoint only.
- W1b-07 vs R2 sheets 76–77 (`site-inspection/agent-tools.ts` catalog, `catalog-host.ts`): same Jini folder `cms/src/site-inspection/`, no file collision, but W1b-07 needs them first (see FIX 07).
- W1b-08 vs R2 trash adapters media/member/post and `move-to-trash.ts`: W1b-08 touches the `TrashAuthorizeFn` import in `move-to-trash.ts:19`, an R2-owned file (FIX 08). W1b-08 also moves the `TrashAdapter` types to core; the R2 adapters may import them from either path (cms keeps a compat re-export).
- W1b-06 vs R1 J07/T07 (`push-content.ts`) and `w3-arch.md` R03.SHARE-KEY: sheet already says separate.
- W1b-03 vs R1 `w3-ext-w2.md:318` ("publish-content/{backstop-service,destination-credential,disconnect-tool,publish-tool,pull}.ts remain as bindings"): consistent with ALREADY-MOVED rows.
- W1b-09 vs R1 J09/T09 (`seal-aad-invariant.ts`): same `webhooks` folder, different file; sheet says not to duplicate. OK.
- Other round-3 sets: w2 re-sheets the same files; not judged here per instruction.

#### Security notes

- 01: the disconnect ordering text is correct (tx: re-read, revision+digest check, CAS, grants removed; then provider revocation). Retry on an already-pending record must not bump `generation`/`revision` again (source :51-55). Named mutation `PK-DISCONNECT-IGNORE-GRANT-DIGEST` covers the digest; add `PK-DISCONNECT-REVOKE-BEFORE-GRANT-REMOVAL` (FIX 01). The digest input must be byte-identical: `JSON.stringify({ credentialId, revision, sites })` with `sites` in `usersOf` order (`ORDER BY site_name, site_id`).
- 01: the SQL hard-codes workspace `'project'`, kinds and a 100-grant cap; with the injection these become policy values, so a wrong host binding would silently widen eligibility. Test must pin wrong-workspace and non-custom-kind rows are excluded.
- 06: share projection admission must run before any serialization (`BACKUP-COPY-BEFORE-TABLE-ADMISSION`, `BACKUP-PROJECT-PRIVATE-PLUGIN-TABLE` are right). UNCHECKED: body-level ordering inside `sanitizeShareDatabase` (:322-372). That is why 06b is NEEDS-OPUS.
- 08: user trash `hide` repeats the read status in the UPDATE WHERE (0 rows = `version-changed`; source header :18-24), the protected-account guard precedes the UPDATE, purge refuses an active user and delegates to `purgeUser` in the same lock. Sheet preserves all of these; mutations `USER-TRASH-DROP-STATUS-CAS` and `USER-TRASH-GUARD-AFTER-WRITE` are right. Add the lock-key vocabulary to the host (`trash:user:<ws>:<id>`, :179) so a Jini-chosen key cannot silently change Postgres serialization.
- 09: ordered keyring "present invalid stops the walk" and "read on every derive, no cache" are right and each has a mutation. No-secret-logging: the scanner must emit no matched bytes; mutation `REPO-SCAN-FILTER-PATH-BEFORE-SCANNING` covers path-before-filter, but nothing names a mutation for "matched value leaks into a report line". Add `REPO-SCAN-REPORT-MATCH-TEXT` (put the match into `line` text) with a test that asserts no hit value appears in the serialized violations for tip and history.
- 09c reconciler: atomicity points are (a) the stamp check BEFORE the write in `adoptSiteKey` (:321-367, comment at :330), (b) exclusive create via `atomicCreateSiteKeyFile` (:803), (c) move-aside never deletes (`moveSiteKeyFileAside` :751), (d) post-write stamp reconciliation (`withFingerprintReconciliation` :368-406, `mayRestamp` only when no key-dependent data). Named mutation `ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK` covers (a); add `ROOT-KEY-DELETE-INSTEAD-OF-MOVE-ASIDE` and `ROOT-KEY-RESTAMP-WITH-DEPENDENT-DATA`.

#### Plain-words summary

Seven of nine sheets are close to buildable; none is a pure approve except 04 and 05. The classification table holds up: every MOVE row I probed is still in Tovu and not in Jini, every "ALREADY-MOVED" row I opened really imports a Jini export that exists, and all 25 sampled `R1`/`R2` rows are in the sheets they point to. The main defects are structural. Sheet 01 puts the OAuth disconnect into user-management, which cannot see the integrations types the code is typed against. Sheet 08 forgets that the Tovu user-trash adapter imports a cms helper and a db type that user-management may not import. Sheet 09 has several line ranges that cut functions in half and one (373–405) that points at code the sheet itself says stays in the host. Three parts need an Opus-written design before Sol can start: the publish tool registrar's port bag (03b), the share-database projection ports (06b), and the root-key reconciler (09c). Security ordering is preserved in the sheets I read (grants before revoke, check before write, CAS, transaction boundaries) with named mutations; I added three missing mutations. Importer lists for 01, 02 and 03 are complete; I did not verify the importer lists for 04–09. Sheets 07 and 08 must be sequenced against round-2 sheets 76–77 and the R2 `move-to-trash.ts` sheet.

#### New owner questions

1. Should the shared-OAuth disconnect live in `@jini-ai/integrations/api-connections` (recommended, avoids a new user-management to integrations edge and matches J05's shared-owner move) or in user-management `project-keys` as sheeted? Recommend integrations.
2. For 09, may the sheet be split into three sheets (09a scanner, 09b ordered keyring, 09c reconciler)? Recommend yes; 09a and 09b are independently buildable and 09c needs an Opus design first.
3. For 03 and 06, accept splitting off the two design-heavy halves (03b, 06b) to Opus-written sheets while the mechanical halves (03a, 06a) proceed? Recommend yes.

#### Appendix: NEEDS-OPUS sheets

These are skeletons derived from the code I read plus the sheet text. Opus must read the named line ranges and finalize signatures before dispatch. Each is a starting contract, not a finished sheet.

##### 03b — publish-content tool registrar (`F/publish-content/tool-registrations.ts`)

Types first (new file `J/cms/src/publish/content/tool-registrations.ts` plus private `tool-handlers-*.ts` siblings, each function <= 80 lines):
```ts
type Empty = Record<string, never>;
export interface PublishRegistrationDeps {
  readonly workspaceId: string;
  readonly authorize: LegacyAuthorize;                       // adaptLegacyAuthorize wraps it
  readonly clock: Clock;
  readonly listPeers: (required: Empty, optional?: Empty) => Promise<readonly PublishContentPeerRecord[]>;
  readonly activeBundle: (required: { bundleId: string }, optional?: Empty) => Promise<ActiveBundle | null>;
  readonly runAudit: RunAuditSlice;
}
export interface PublishRegistrationPorts {
  readonly findCandidate: (required: Empty, optional?: Empty) => Promise<string | null>;   // source :342-345: routeDeps.findPublishCandidate ?? async () => null
  // Opus: read :143-341 and :405-515 and write the exact signature of each remaining port:
  // countPublishableTypes, connect, grantReverse, publish, stagePull, buildPullHooks, planPull, confirmPull,
  // executePull, confirmedToolHandler, plus isPluginError/projectPluginError/isShapeRejection predicates.
}
export function buildPublishContentRegistrations(required: { deps: PublishRegistrationDeps; ports: PublishRegistrationPorts; copy: PublishRegistrationCopy }, _optional: Empty = {}): ToolRegistration[];
export const publishContentDerivedRisk: DerivedRiskByToolId;   // moves with its why-comments (:86-104)
export function plainSentence(required: { text: string; fallback: string }, _optional: Empty = {}): string; // :131
```
Mechanical steps: (1) move `publishContentDerivedRisk`, `plainSentence`, `MACHINE_TOKEN`, and the six handler bodies in the order they appear; (2) keep `requirePublishTrustProvisioning` (:110) in Tovu; (3) Tovu `buildPublishContentRegistrations` stays as the host binder, closing ports over `routeDeps` and `surfaces`; `contributePublishContentTools` (:395) stays; (4) importers per sheet. Order to preserve: input record, unexpected-key refusal, permission (`requireToolPermission`), abort check, then stage/load; plan then audit write order; overwrite allowlist checked against the fresh report; human confirmation before execute (`createExecutePullHandler`).
Tests first: `publish/content/__tests__/tool-registrations.test.ts`: `another caller cannot prepare execution even with a live reviewed bundle` (mutation `PUB-PULL-SKIP-AUDIT-ACTOR`); three readiness cases (connected / deliberately configured / no peers, only the third reads the suggestion; mutation `PUB-READINESS-READ-SUGGESTION-ALWAYS`); permission-before-stage (mutation `PUB-STAGE-BEFORE-PERMISSION`). Package: `cms/package.json` `./publish/content/tool-registrations` universal, `jini.entries` line, changeset.

##### 06b — share database projection (`F/site-backup/share-database/repo.sqlite.ts`)

Types first (new dir `J/devops/src/backup/site/share-database/`):
```ts
export interface ShareDbSession {                  // exact capabilities the moved code uses; Opus confirms against :124-316,:373-451
  readonly tables: () => Promise<ReadonlySet<string>>;
  readonly columns: (required: { table: string }, optional?: Empty) => Promise<readonly string[]>;
  readonly copyRows: (required: { table: string; columns: readonly string[]; project?: (row: Row) => Row | null }, optional?: Empty) => Promise<number>;
  readonly transaction: <T>(required: { run: () => Promise<T> }, optional?: Empty) => Promise<T>;
  readonly serialize: (required: Empty, optional?: Empty) => Promise<Buffer>;
  readonly close: (required: Empty, optional?: Empty) => Promise<void>;
}
export interface ShareDatabasePorts {
  readonly openSource: (required: { snapshot: Buffer }, optional?: Empty) => Promise<ShareDbSession>;       // read-only
  readonly openFreshTarget: (required: Empty, optional?: { signal?: AbortSignal }) => Promise<ShareDbSession>;
  readonly staging: OwnedStagingPort;                                                                         // free-space check, per-operation temp root, cleanup
}
export function prepareSharePluginTables(required: { target: ShareDbSession; present: ReadonlySet<string>; modules: readonly DataModuleDecl[]; declarePortable: DeclarePortable; report: (required: { message: string }) => void }, _optional: Empty = {}): Promise<{ portable: ReadonlySet<string>; private: ReadonlySet<string> }>;
export function refuseUnknownShareTables(required: { source: ShareDbSession; trusted: ReadonlySet<string>; excludesPrivate: (required: { table: string }) => boolean; reportName: (required: { table: string }) => string }, _optional: Empty = {}): Promise<void>;
export function sanitizeShareDatabase<TMedia>(required: { snapshot: Buffer; modules: readonly DataModuleDecl[]; ports: ShareDatabasePorts; policy: ShareDatabasePolicy }, optional?: { signal?: AbortSignal; omittedMediaIds?: readonly string[] }): Promise<ShareDatabaseProjection<TMedia>>;
```
Mechanical steps: Tovu keeps `SHARE_TABLES`, `ADDITIVE_COLUMN_DEFAULTS`, `PUBLISHABLE_SETTINGS`, disk thresholds, redactor, and projections :145–316 and :373–392 as the `policy`/port implementations. The order inside `sanitizeShareDatabase` must be: open source read-only; `refuseUnknownShareTables` BEFORE any copy or serialize; `prepareSharePluginTables`; `copyPortableTables`; settings; media/document projections; rebuild search; serialize; close/cleanup on every outcome. Opus must read :322–372 and :399–451 to confirm this order and list the exact `Kernel` calls (`run`, `query`, `execute`, `transaction`) before fixing `ShareDbSession`.
Tests first: `projection.test.ts`: `an unknown source table refuses before serializing anything` (`BACKUP-COPY-BEFORE-TABLE-ADMISSION`); `private plugin sidecars do not enter the projection and the source stays read-only` (`BACKUP-PROJECT-PRIVATE-PLUGIN-TABLE`); add abort, insufficient staging, cleanup on failure, rollback of a failed archive rewrite (mutation `BACKUP-REWRITE-OUTSIDE-TRANSACTION`).

##### 09c — root-key reconciler (`F/webhooks/site-key-ensure.ts`)

Types first (`J/platform/src/secrets/root-key/reconcile.ts`), reusing `decide.ts` `planSiteKeyEnsure`/`SiteKeyVerdict` (do not add a second decision table):
```ts
export type RootKeySource = unknown;                     // opaque to Jini; host passes its SiteKeySource
export interface RootKeyReconcilePorts<S> {
  readonly read: (required: { source: S }, optional?: Empty) => string | undefined;
  readonly fingerprint: (required: { hex: string }, optional?: Empty) => string;
  readonly hasDependentData: (required: Empty, optional?: Empty) => Promise<boolean>;
  readonly moveAside: (required: { expectedContent: string }, optional?: Empty) => void;   // never deletes
  readonly createExclusive: (required: { hex: string }, optional?: Empty) => string;        // returns authoritative written hex (re-read)
  readonly readStamp: (required: Empty, optional?: Empty) => { fingerprint: string | undefined; present: boolean };
  readonly writeStamp: (required: { stamp: unknown; fingerprint: string }, optional?: Empty) => void;
  readonly mint: (required: Empty, optional?: Empty) => string;
}
export type RootKeyReconcileOutcome =
  | { readonly action: "noop" | "adopt" | "mint" | "mismatch"; readonly fingerprint: string }
  | { readonly action: "refuse" | "invalid"; readonly reason: string; readonly fingerprint?: undefined };
export function reconcileRootKey<S>(required: { perSite: S; otherSources: readonly S[]; stamp: string | undefined; ports: RootKeyReconcilePorts<S> }, _optional: Empty = {}): Promise<RootKeyReconcileOutcome>;
```
Mechanical steps: the moved body starts AFTER the production no-op (`ensureSiteKey` :223-225 stays in Tovu with `resolveRuntimeMode`, `splitPerSiteSource` :258, `resolveSiteKeyFingerprint`). Move `ensureSiteKey` :227-256 (stamped-source adoption/move-aside branch), `settleSiteKey` :278-320, `adoptSiteKey` :321-367, `withFingerprintReconciliation` :368-406, and the `neverRestamp` const with its comment (:363). Host adds `perSiteFilePath` to the outcome (`EnsureSiteKeyResult`). `siteHasKeyData` memoization (:287-291) moves unchanged. Exhaustive `switch (decision.action)` with a `never` check. Tests: `reconcile.test.ts`: `mismatched adoption with dependent data writes and stamps nothing` (`ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK`), `a stamp-named key replaces a different per-site file by move-aside, never delete` (`ROOT-KEY-DELETE-INSTEAD-OF-MOVE-ASIDE`), `a differing stamp with dependent data reports mismatch and does not restamp` (`ROOT-KEY-RESTAMP-WITH-DEPENDENT-DATA`), racing exclusive-create winner bytes. Package: `platform/package.json` `./secrets/root-key/reconcile` universal, changeset.

## B. w2

### out-w2: dedupe adjudication of w3c-w2 against w3c-w1a / w3c-w1b

SCR = /tmp/claude-0/-home-user/26b43b19-4a5c-5c24-b4b8-32ad2b4dfd68/scratchpad. Read-only; no repo changed. Budget used: about 39 tool calls. Confidence per row is stated where it is not high.

#### 0. Mapping check (coordinator's "all 45 files are twins")

- 43 of the 45 w2 files are classified in w1a (8 post files, `post/*` rows 108-122) or w1b (35 files). **Two are only in w2:** `publish-content/ui/policy.ts` (STAYS-HOST) and `site-backup/static-download-layout.ts` (ALREADY-MOVED). Neither is a MOVE, so no double-move risk. The claim is wrong by two files, harmlessly.
- Twin map, corrected:
  - w2-01 = w1b-01.
  - w2-02 = **w1a-W1-11 (repo.rows, repo.memory, post-retire, post-tool-delete/duplicate/list/update, publish-content) PLUS w1b-02 (repo.ts, reverters)**. w2-02 is the union of two sheets, not a twin of one.
  - w2-03 = w1b-03.
  - w2-04 = w1b-06.
  - w2-05 = w1b-05.
  - w2-06 = w1b-07.
  - w2-07 = w1b-08, minus `trash/permissions.ts` (w1b only). w2 also adds `trash/adapters/redirect.ts` (w1b: ALREADY-MOVED).
  - w2-08 = w1b-09. w1b also moves `webhooks/keyring.env.ts` (w2: STAYS-HOST).
  - w1b-04 (source-control provider registry) has no w2 twin.
- Header defect: w2 line 1 says "8 STAYS-HOST", the table has **7** (`publish-content/ui/policy.ts`, `site-backup/import-keep-off.ts`, `site-backup/sources.ts`, `source-control/source-control-credential-repo.ts`, `trash/permissions.ts`, `trash/trash-item-tool.ts`, `webhooks/keyring.env.ts`). MOVE (22), ALREADY-MOVED (16) and OPUS-REVIEW (7: sheets 01-04, 06-08) counts are right.
- Both sets repoint overlapping importers of the same files with different dest paths, so building both would put one file in two places. Exactly one sheet per file is kept below.

#### 1. Verdict table

KEEP/REJECT is the dedupe decision. Where a kept sheet needs changes, the literal text is under "Fix text".

| w2 sheet | w2 verdict | Twin(s) | Decision |
|---|---|---|---|
| w2-01 project keys + OAuth disconnect | **KEEP, FIX** | w1b-01 | REJECT w1b-01 |
| w2-02 post repos/tools/publish | **KEEP, FIX** | w1a-W1-11 + w1b-02 | REJECT w1a-W1-11 and w1b-02 |
| w2-03 publish backstop row + tool ceremony | **REJECT** | w1b-03 | KEEP w1b-03 (merge text below) |
| w2-04 site backup projection + tools | **REJECT** | w1b-06 | KEEP w1b-06 (merge text below) |
| w2-05 static export route manifest | **REJECT** | w1b-05 | KEEP w1b-05 (merge text below) |
| w2-06 site inspection registrar | **REJECT** | w1b-07 | KEEP w1b-07 (merge text below) |
| w2-07 redirect + user trash adapters | **REJECT** | w1b-08 | KEEP w1b-08, FIX (user adapter + visibility only) |
| w2-08 root keys + repo secret scan | **REJECT** | w1b-09 | KEEP w1b-09, FIX (drop keyring piece) |

Why each pick (the other checkers judge the w1b/w1a sheets on their own merits; these are only dedupe reasons):

- 01: w1b-01 puts both files in `user-management`, which depends on core only (`packages/user-management/package.json` dependencies: core, simplewebauthn, otplib; kysely is a peer). The OAuth disconnect needs runtime `disconnectApiConnection` and `ApiConnectionError` from `@jini-ai/integrations/api-connections` (Tovu `shared-oauth-disconnect.ts:2`). w1b-01 therefore needs an unnamed injected `disconnectConnection` and `changedError`, which is a design gap. The attachments SQL needs `jsonText`/`KyselyKernel`, which only `@jini-ai/db` has. w2-01 puts the SQL in `db` (precedent: `db/src/secrets-vault/repo.sql.ts`, "hosts own DDL") and the disconnect in `integrations` (owner of `ApiConnectionHooks`), so both are mechanical.
- 02: w1b-02 and w1a-11 both edit `repo.ts` call sites for the same codecs. w1a-11 repoints `repo.ts:11,72,85,...` to `cms:posts/sql/repo.rows` while w1b-02 deletes the class, so the order is ambiguous. They also disagree on the removal port: w1a-11 puts `ForgetRemovedPostFn` in core, w1b-02 invents a local `forgetRemoved` dep. w2-02 resolves both (repo.ts moves into Jini and imports the Jini codec internally; one core `post-removal` contract).
- 03-06: w1b keeps the real host binder in its current file (`tool-registrations.ts`, `route-manifest.ts`, `share-database/repo.sqlite.ts`). w2 renames the binders to new `*-binding.ts` files, forcing a dozen extra test repoints and breaking anchors that round-2 sheets use (`$SCR/r12/w3b-ext-w2b.md` sheet 77 anchors `F/site-inspection/tool-registrations.ts:14,195`; sheet 89 anchors `F/trash/*`). w1b also carries the sharper security-ordering tests (below). I did not diff every signature of 03-06 line by line; confidence medium-high.
- 07: w2-07's user-adapter port omits **session revocation** (see section 6). w1b-08 has it and its tests.
- 08: w1b-08's narrower root-key cut (reconcile only, filesystem and install stay host) carries the data-loss guard tests that w2-08 lacks (see section 6).

### Fix text (literal)

**KEEP w2-01 (w1b-01 rejected). Add the following to w2-01:**
1. Replace "Drop the double cast at `project-store.ts:273` by inferring `DB` from `kernel`" with: "Type the `kernel` field of `KeyAttachmentDeps` as `KyselyKernel<unknown>` and keep the existing `kernel as unknown as KyselyKernel<unknown>` cast at `R/project-store.ts:273` unchanged. Do not make `createKeyAttachments` generic." The "infer DB" wording needs a design decision, and the generic removes nothing.
2. Add to tests-first: in DB `project-key-attachments.test.ts`, also `a detached key stops matching its worksFor label on the next lookup` (mutation `PK-CACHE-ATTACHMENTS`), plus duplicate-label, over-cap and wrong-site cases (from w1b-01).
3. Add to the disconnect tests: `retry of an already revocation-pending connection does not advance generation or revision a second time` (mutation `PK-REGENERATE-ON-RETRY`) and `inspect reads no token` (the `tokensFor` stub throws). Source: Tovu `shared-oauth-disconnect.ts:51-55` (the `status !== 'revocation-pending'` guard) and `:30-38` (no token read).
4. Add: "`rows[0]?.key_id ?? null` replaces `rows[0]`-style indexing; no cast" (attachments.ts:23 already does this; keep it).
5. Keep the private note that `K5-project-keys-1` could not be verified (ADS-memory is absent in the checkout).

**KEEP w2-02 (w1a-W1-11 and w1b-02 rejected). Apply these fixes:**
1. Add to `SqlPostRepoDeps` and the repo description: "`notHeldAgentSchedule: Expression<boolean>`, supplied by Tovu's `repo.ts` binder from the existing `sql` template at `F/post/repo.ts:42` (it names the host table `agent_pause_holds`), used unchanged at the two `.where(notHeldAgentSchedule)` call sites now at `repo.ts:127,153`." The w2-02 move range `repo.ts:44-374` uses this constant, which sits outside the range and names a host table; as written Sol must invent the seam. Source of the fix: w1b-02.
2. Replace every occurrence of `hashState` (repo.rows `toRevisionRow`, `SqlPostRepo`, `InMemoryPostRepo`) with `sha256Hex({ text }, _optional = {}): string`, "bound by the host to SHA-256 over the exact `state_json` bytes" (from w1a-11 A). `hashState` is never defined in w2-02.
3. Replace "`DuplicatePostBindings<D>` binds ..." nothing else; but replace "`publish-content.ts` ... `contributePostPublish({ restorePostForward, coverage }, _optional = {})`" with `contributePostPublish({ policy, restorePostForward }, _optional = {})` and the page factory likewise, where `policy` carries `coverage: ["posts", "post_versions"]`, the persisted table values and permission values used at `publish-content.ts:393-419` (from w1a-11 C). This keeps one config object instead of a free-floating `coverage`.
4. Add w1a-W1-11's four tests-first files and mutations to w2-02's list: `POST-ROW-UPDATE-CREATOR`, `POST-ROW-HTML-STORE-PLACEHOLDER`, `POST-MEM-LEAK-REVISION`, `POST-MEM-ROLLBACK-IGNORE-AUTOSAVE`, `POST-DUPE-REUSE-PLACEMENT`, `POST-DELETE-SKIP-VERSION`, `POST-LIST-DROP-ID`, `POST-PATCH-ALLOW-HTML-REPLACE`, `POST-RETIRE-BUMP-TRASH-VERSION`, `POST-PUBLISH-SKIP-COMPENSATION`, `POST-PUBLISH-AUTHOR-AS-PRINCIPAL`; and w1b-02's `POST-REVISION-READ-BEFORE-LOCK` and `POST-REVERT-FORGET-INDEPENDENT-MARKER` (`undo of an earlier already-trashed inverse does not forget the current Trash row`). w2-02 currently names only three mutations for ten files.
5. Add: also repoint `F/navigation/__tests__/footer-page-links.test.ts:17,152` and `F/pages/__tests__/{html-document-store.go-live.test.ts:8,html-document-store.revisions.test.ts:9}` (they import `postRepoFor`/the class; w1b-02 lists them) and the memory-repo direct importers outside `F/post/__tests__` listed in w1a-11 "Memory repo direct" (`A/__tests__/...`, `F/consent`, `F/forms`, `F/pages`, `F/plugin-runtime`, `F/publish-content`, `F/seo`, `F/widgets`, `S/inbound`, `C/__tests__`). w2-02's importer ledger covers only the `repo.ts`/`repo.memory.ts` binder-stays-put case and does not list who must move off `InMemoryPostRepo`. Because w2-02 keeps `repo.memory.ts` as a host binder (same name), those importers do not have to change; state that explicitly: "All `InMemoryPostRepo` importers keep importing the Tovu binder; no repoint". This closes the ambiguity.
6. Split into two build steps (02a codecs/repo/memory/reverters, 02b tool helpers/retire/publish) only if Sol's context cannot hold ten files; keep one sheet id.

**KEEP w1b-03 (w2-03 rejected). Merge into w1b-03:**
1. Add mutations `PUBLISH-LOOKUP-BEFORE-POLICY` (test `a denied table never reaches introspection`, from w2-03) and `PUBLISH-DROP-REVIEWED-PLAN-HASH` (test `a changed plan after review reaches neither confirm nor execute`, from w2-03) to the tests-first list.
2. Replace "The hook and gateway types come from the existing Jini/core contracts or are structural at call sites" with "Use core `AssistantSurfaceDeps` for the surface slice; derive each port's argument and result types from the call sites at `tool-registrations.ts:151-254,259-331,342-380,405-515` and import the existing CMS wire/result and refusal types". Without this Sol picks types.
3. Re-check `F/publish-content/__tests__/publish-tool.test.ts:9` (file changed after the pin; see `$SCR/tdiff`).

**KEEP w1b-06 (w2-04 rejected). Merge into w1b-06:**
1. Add: "Keep the 16 MiB headroom, `wx` exclusive create with mode 0600, trusted-target DDL only, and the close order source then target. Use typed handles `S` and `T`, not `unknown` plus casts." (w2-04)
2. Add mutations `BACKUP-INCLUDE-PRIVATE-TABLE` (Tovu's existing share DB integration: `a declared private table contributes neither schema nor rows`) and rename the admission test's assertion to `unknown populated data is refused before any projection and both handles close` (`BACKUP-PROJECT-BEFORE-ADMISSION`). (w2-04)
3. Add: "Update the dynamic import at `F/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts:40`" and the citations in `development/parity/tool-guides.json:2292` and `development/assistant-prompts/capability-prompts.md:719` (w2-04 lists them, w1b-06 does not).

**KEEP w1b-05 (w2-05 rejected). Merge into w1b-05:**
1. Add: "Each invocation copies the seeded route and skip lists before editing them (policy holds the originals)." and "Keep the `activeTheme` contract's absent representation; if the declared result makes it optional, build it with `...(activeTheme === undefined ? {} : { activeTheme })` and pin JSON parity." (w2-05)
2. Add mutation `MANIFEST-TREAT-ABSENT-AS-FALSE` (test `only an explicit false gives the theme precedence`) beside w1b-05's `EXPORT-IGNORE-EXPLICIT-THEME-OVERRIDE` (they are the same behavior; keep one name, `EXPORT-IGNORE-EXPLICIT-THEME-OVERRIDE`).
3. Keep w1b-05's `readThemeAndPosts` single source (it preserves the parallel read inside the host binding). Do not split it into `resolveActiveThemeId`/`resolveTheme`/`listPublishedPosts` as w2-05 does, which changes call order and parallelism.
4. Add the comment-only pointer updates from w2-05: `F/theme/theme-page-eligibility.ts:49`, `W/server/inbound/public-http/routes/site/pages/handlers/marketing.ts:25`, `apps/admin/src/features/deployment/rules.ts:290`.

**KEEP w1b-07 (w2-06 rejected). Merge into w1b-07:**
1. Add: "Construct the optional section arguments as `{ ...(sections === undefined ? {} : { sections }), ...(pageLimit === undefined ? {} : { pageLimit }) }` and omit an undefined `origin`." (w2-06)
2. Add: "Keep the profile tool's five and the capabilities tool's three per-section gates; neither gets a blanket read permission; both page tools check read permission before any outbound operation." (w1b-07 has this; confirm.) Add mutation `INSPECTION-FETCH-BEFORE-GRANT` as an alias of `INSPECTION-FETCH-BEFORE-AUTH` (keep one name: `INSPECTION-FETCH-BEFORE-AUTH`).
3. ORDER: write "Build after round-2 sheets 76-77 (`$SCR/r12/w3b-ext-w2b.md`: they edit `F/site-inspection/tool-registrations.ts:14,195` to bind the new catalog), or re-grep those line numbers first." w1b-07 already says it does not port the R2 catalog.

**KEEP w1b-08 (w2-07 rejected), user adapter and visibility only. Apply these fixes:**
1. In the user adapter bullet replace "`kernel` is the erased storage view using typed `withTables<UserTrashTables>()` for `principals`, `identity_users`, `sessions`, and the outbox insert" with: "The Jini adapter takes a transaction-scoped store port with `readPrincipal({ workspaceId, principalId })`, `readDisplayUsername({ workspaceId, principalId, fallback })`, `compareAndSetStatus({ workspaceId, principalId, expected, next, disabledAt })` returning the affected-row count, `revokeSessions({ workspaceId, principalId })` returning the deleted count, and `appendEvent({ event })`, plus `underPrincipalLock<T>({ workspaceId, principalId, run })`. The raw `outbox_events` insert and `eventValues` encoder stay in Tovu's `F/trash/adapters/user.ts` binder." Reason: `$SCR/r12/w3b-arch.md` (ledger around lines 406 and 451) keeps the raw insert at `trash/adapters/user.ts:82` (Tovu `appendEvent`) in the producer ledger pending an owner decision on producer policy; moving it into Jini would settle that decision implicitly.
2. Add the lock text from w2-07: "Keep the lock bytes `trash:user:<workspaceId>:<principalId>` (Tovu `adapters/user.ts` `underPrincipalLock`), the status predicate in the UPDATE's WHERE, and append identity events only after a successful status change inside the same transaction." and add tests `zero-row user CAS emits no identity event` (mutation `TRASH-USER-EVENT-ON-CAS-MISS`) and `purge joins the principal lock rather than opening a second transaction` (mutation `TRASH-USER-PURGE-OUTSIDE-LOCK`).
3. Keep w1b-08's `USER-TRASH-DROP-STATUS-CAS` (status race revokes no session and emits no event) and `USER-TRASH-GUARD-AFTER-WRITE` (protected-account guard precedes every durable write).
4. Add: "Order against round-2 sheet 88: it adds `MoveToTrashOutcome` and `TrashKindMover` to the same core `contracts/site/cms-trash` module that this sheet extends with `TrashDisplay`, `TrashMarkerResult`, `TrashPurgeOutcome`, `TrashAdapter`. Whichever lands second appends to the existing file; re-grep `F/trash/{permissions.ts:22-27,trash-item-tool.ts:48-53,index.ts:58,73-85}` before editing (sheet 89 also edits those import blocks)." Replace "Keep compatibility exports on the existing CMS API surface, not a new compatibility module" with "In `J/cms/src/trash/ports.ts` replace each moved declaration by `export type { X } from '@jini-ai/core/contracts/site/cms-trash'` in that same file, and add no other file." (the original wording leaves "compatibility export" to judgment, and the owner rule forbids re-export shells, so the owner should confirm; see section 8).
5. Redirect: delete nothing here; w1b-08 does not touch `trash/adapters/redirect.ts` (correct, see section 2).

**KEEP w1b-09 (w2-08 rejected). Apply these fixes:**
1. Delete the first bullet of "Jini add" (`F/webhooks/keyring.env.ts:124-164,201-249,373-405` to `ordered-source-keyring.ts`), the corresponding Tovu cutover sentence ("Replace the ordered lookup and derive bodies there with the Jini calls"), the `./secrets/root-key/ordered-source-keyring` export, and its two tests/mutations. `keyring.env.ts` is STAYS-HOST (section 2).
2. In place of the deleted tests add Tovu-side pins in the existing keyring tests: `a changed recovery file is read on the next derivation` (mutation `ROOT-KEY-CACHE-LIVE-READ`) and `a present invalid source never falls through to a later source` (mutation `ROOT-KEY-SKIP-INVALID`), run against `F/webhooks/keyring.env.ts` as it stands.
3. Add from w2-08: "A loser of the create race fingerprints the final winning file" (mutation `ROOTKEY-RETURN-CANDIDATE`), "production asks for no sources and performs no writes" (mutation `ROOTKEY-READ-PRODUCTION-SOURCES`), the instruction "Scope this to extraction. Do not silently change the known recovery race or directory-fsync behavior", and the scanner CLI fixture note (`secret-scan-guard.test.ts:203,205` uses the same public CLI filename).
4. Keep w1b-09's `ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK` ("mismatched adoption with dependent data writes and stamps nothing") as the headline test; it is the one regression that would make sealed data undecryptable.
5. Scanner: keep w1b-09's `scanTrackedRepo`/`scanRepoHistory` plus the `REPO-SCAN-FILTER-PATH-BEFORE-SCANNING` test, and add w2-08's `REPO-SCAN-EXEMPT-BY-TEXT-ONLY` (`an exemption for one path does not suppress a finding at another`) and `REPO-SCAN-RETURN-RAW-MATCH`.

#### 2. Classification corrections (the six disagreements, plus two)

| File | w1b / w2 | Correct | Why (evidence) |
|---|---|---|---|
| `site-backup/import-keep-off.ts` | w1b A / w2 H | **ALREADY-MOVED** (binding only) | Tovu file is 53 lines: `contentStore` binds `presentation_settings/posts/menus/form_definitions` (`:17-26`), `KEEP_OFF_HOST` holds copy and `sanitizePageHtml` (`:30-45`), and `keepImportedCodeOff` (`:51-53`) forwards to `@jini-ai/devops/backup/site/import-keep-off` (`devops/package.json:100,627`). By the sheets' own definition (w2 header: "ALREADY-MOVED includes files whose reusable implementation is already exported by Jini and whose remaining Tovu file only binds it"), this is ALREADY-MOVED. No build consequence. |
| `site-backup/sources.ts` | w1b A / w2 H | **ALREADY-MOVED** (binding only) | `SOURCE_DEPS` (`:46-56`) and five wrappers (`:59-83`) bind `@jini-ai/devops/backup/site/sources` (`devops/package.json:91,582`); Tovu owns only caps, manifest name and the media note. No mechanism left. |
| `trash/adapters/redirect.ts` | w1b A / w2 MOVE | **ALREADY-MOVED**; w2-07's redirect half is wrong | The mechanism is `flipMarker`, `compareAndDelete`, `lazyKernel` in `@jini-ai/cms/trash/site/adapters/marker-sql` (`cms/package.json:575`; `marker-sql.ts` `compareAndDelete` runs the version-checked delete and calls `cascade` only after `numDeletedRows > 0`). The Tovu file (74 lines) supplies table names from `@tovu/contracts/redirect-tables` (host contract), two status literals and a 5-line two-table cascade loop. A Jini factory would be the same call with the three values as parameters. Jini's own redirect tests mark the adapter as host-side (`cms/src/redirects/__tests__/support/trash.fixture.ts:1` "Test constant: source features/trash/adapters/redirect.ts:15"). Moving it adds an export and ~25 importer edits for no removed logic. The `TRASH-REDIRECT-CASCADE-BEFORE-COMPARE` mutation targets `compareAndDelete`, which already lives in Jini. |
| `trash/permissions.ts` | w1b MOVE·08 / w2 H | **MOVE, small** (split: map stays) | `trashPermissionFor` (`:68-70`), `mayActOnEntityType` (`:90-110`), `filterVisibleTrashItems` (`:121-137`), `trashDaysRemaining` (`:143-146`) and `TrashAuthorizeFn` (`:73-79`) are ~60 lines of kind-agnostic single-evaluator visibility logic with no Tovu string in them. Not in Jini today: `rg` for the four names in `jini/packages/*/src` finds only a comment at `user-management/src/identity/delete-user-service.ts:146`. `TRASH_PERMISSION_BY_ENTITY_TYPE` (`:50-58`, permission strings such as `"content.write"`, `"*"`) is host policy and stays. |
| `trash/trash-item-tool.ts` | w1b A / w2 H | **STAYS-HOST** (w2 right; w1b's ALREADY-MOVED is also harmless) | File is the host roster `TRASH_ITEM_DELEGATES` (`:126-206`, product tool ids and permission strings), presentation copy (`:208-230`) and a 35-line binding into `deriveCmsTrashItemRegistrations`/`buildTrashItemAgentToolCatalog` (`:256-291`), both already in `@jini-ai/cms/trash`. File changed after the pin (`$SCR/tdiff`, commit dbb9fa5d5, 30-day tool text). Anchors cited by sheets still hold at the tip: `trash-item-tool.ts:51` REDIRECT, `:53` USER, `:55` moveToTrash. |
| `webhooks/keyring.env.ts` | w1b MOVE·09 / w2 H | **STAYS-HOST** (w2 right) | The only portable mechanism is "read sources in order each derive; a present-invalid source stops the walk": `resolveKeyring` (`:147-157`) and `firstPresentSiteKey` (`:221-227`), ~17 lines. The rest is Tovu vocabulary and copy: frozen `HKDF_EXTRACTION_SALT` (`:95`), `SiteKeySource` ordering, `UnusableSiteKeyError` copy (`:301-337`), inspect/reveal presentation (`:345-420`), file generation (`:470-488`). Jini already has `FixedSiteKeyKeyring` (used at `:155`) and a differently cached `EnvOrFileKeyring` (`platform/src/secrets/keyring.env.ts:47`; w1b-09 itself says not to swap it). A new generic export with `read`/`parse`/`errors` ports on a security path costs more than the code it removes. |
| `post/repo.ts` (w2/w1b agree MOVE) | w2-02 omitted a host dep | MOVE with fix | `repo.ts:42` defines `notHeldAgentSchedule` over host table `agent_pause_holds`, used at `:127,153`; outside w2-02's `44-374` range. See fix 1 for w2-02. |
| `site-backup/static-download-layout.ts`, `publish-content/ui/policy.ts` | only in w2 | ALREADY-MOVED / STAYS-HOST (agree) | Source absent at tip; `devops/package.json:95` exports `./backup/site/static-download-layout`. `ui/policy.ts` is 420 lines of this product's reason wording and capability copy (`:1-9` header). |

#### 3. Classification spot-checks done (w2's own table)

STAYS-HOST:
- `publish-content/ui/policy.ts`: OK. 420 lines, header says "everything the neutral `@jini-ai/cms/publish/content/ui` refuses to know".
- `source-control/source-control-credential-repo.ts`: OK. 18 lines, `SqlSourceControlCredentialSetRepo extends TovuCredentialSetVaultAdapter` over `ContentKernel`.
- `trash/trash-item-tool.ts`: OK (host roster/copy, see above).
- `trash/permissions.ts`: **WRONG** (reusable visibility functions remain, see above).
- `webhooks/keyring.env.ts`: OK.
- `site-backup/import-keep-off.ts`, `site-backup/sources.ts`: label should be ALREADY-MOVED (above); no consequence.

ALREADY-MOVED:
- `publish-content/apply-report.ts`, `export-bundle.ts`, `publish-trust/handshake-client.ts`: OK. Tovu sources absent at tip; exports `cms/package.json:563` (`./publish/content/apply-report`), `:551` (`./publish/content/export-bundle`), `:538` (`./publish/trust/handshake-client`).
- `site-backup/saved-keys.ts`, `static-download-layout.ts`, `import-verifier-inventory.ts`: OK. Sources absent; `devops/package.json:74,95,99`.
- `site-backup/share-backend.ts`, `import-database.ts`: OK. Present as bindings (67 lines for share-backend); `devops/package.json:78,81`.
- `publish-content/push-plan.ts` (17 lines): OK. `createPlanPublishToPeer` exists in `cms/src/publish/content/publish-tool.ts`.
- `publish-content/raw-file-contributor.ts` (23 lines): OK. `createRawFileContributor` at `cms/src/publish/content/raw-file-contributor.ts:317`.
- `trash/tool-registrations.ts` (76 lines): OK. Imports `buildTrashToolRegistrations`, `trashDerivedRisk` from `@jini-ai/cms/trash` (`:3`).
- `site-backup/import-keep-off.ts`: OK as a binding (above).

MOVE rows sanity (still in Tovu, not in Jini):
- `project-keys/attachments.ts`, `shared-oauth-disconnect.ts`: OK. Present at tip; `rg` in Jini finds no `createKeyAttachments`/`disconnectSharedOAuth`; core has only the contracts (`core/package.json:210`).
- `post/repo.ts`, `trash/adapters/user.ts`, `webhooks/site-key-ensure.ts` (842 lines, with the duplicate plan table at `:71-164` identical in shape to `platform/src/secrets/root-key/decide.ts`): OK as MOVE.
- `trash/adapters/redirect.ts`: **WRONG** (above).

#### 4. Anchors checked

| Anchor | Claimed | Actual | OK/WRONG |
|---|---|---|---|
| `F/project-keys/attachments.ts:1-47` | whole adapter | 47 lines, ends `:46` `};` `:47` `}` | OK |
| `F/project-keys/shared-oauth-disconnect.ts:6-64` | types + two functions | `:6` report interface through `:64` | OK |
| `R/project-store.ts:6,273` | import and construction | `:6` import; `:273` `createKeyAttachments({ kernel: kernel as unknown as KyselyKernel<unknown> })` | OK |
| `W/cli/commands/owner-store.ts:3,155,167,170` | import + uses | `:3` import; `:155` and `:167` `inspectSharedOAuthDisconnect`; `:170` `disconnectSharedOAuth` | OK |
| `F/api-connections/README.md:165` | mentions attachments path | `:165` "`attachments`/`transaction` (`project-keys/attachments.ts`)" | OK |
| `F/project-keys/__tests__/a02-credential-contract.pin.unit.test.ts:12-13,125,128` | import + calls | import ends `:13`; calls at `:125,128` | OK |
| `shared-oauth-disconnect.ts` OAuth security order | inspect (no token) then in-tx revision+digest CAS and `removeKey`, provider after tx | `:30-38` no token read; `:48-58` CAS and `attachments.removeKey` in `transaction`; `:59-62` `disconnectApiConnection` after | OK |
| `F/post/repo.ts:44-374` | class body | class starts `:44`; `notHeldAgentSchedule` const at `:42` outside range | OK, but misses a dep (fixed) |
| `F/trash/adapters/user.ts:33-250` | adapter | adapter spans `:33-250`; `appendEvent` raw insert at `:82` | OK |
| `F/trash/adapters/user.ts` session revocation | not in w2-07 port list | `hide` does `deleteFrom("sessions")` at `~:147-150` of the file's hide body and reports `sessionsRevoked` in the event | w2-07 incomplete |
| `F/trash/{permissions.ts:25,27}` | REDIRECT / USER imports | `:25` REDIRECT, `:27` USER | OK |
| `F/trash/trash-item-tool.ts:51,53` | REDIRECT / USER imports | `:51`, `:53` (file changed after pin, still correct) | OK |
| `F/trash/index.ts:77,84-85` | redirect and user exports | `:77`, `:84-85` | OK |
| `F/trash/tool-kinds.ts:4` | redirect import | `:4` | OK |
| `F/webhooks/site-key-ensure.ts:71-164` | duplicate plan table | `:71-164` types + `planSiteKeyEnsure` + `decideLocalSiteKeyEnsure` + `verdictOfCheck`; Jini `decide.ts:44,67,83` same | OK |
| `J/platform/src/secrets/root-key/decide.ts:44,67` | `planSiteKeyEnsure`, `decideLocalSiteKeyEnsure` | `:44`, `:67` | OK |
| `F/webhooks/keyring.env.ts` ordered-source mechanism | w1b `124-164,201-249,373-405` | mechanism is `:147-157,221-227`; `373-405` is inspect/reveal presentation | w1b overstates |
| `F/site-backup/import-keep-off.ts` / `sources.ts` | n/a | 53 / 83 lines, bindings | OK |
| `F/publish-content/tool-registrations.ts:86` | `publishContentDerivedRisk` | `:86` const, `:384` `export { publishContentDerivedRisk }` | OK |
| `F/publish-content/__tests__/publish-tool.test.ts:9` | import (both sets) | file in `$SCR/tdiff` (changed after pin) | NOT RE-CHECKED; re-check before build |

#### 5. Duplicates/conflicts with round 1/2 and other round-3 sets

- **w2 vs w1a/w1b (the whole point):** resolved in section 1. `post/repo.rows.ts`, `repo.memory.ts` appear in w1a-11 AND w2-02; `post/repo.ts`, `reverters.ts` in w1b-02 AND w2-02. Only one sheet per file survives.
- **`trash/adapters/user.ts:82` raw insert:** `$SCR/r12/w3b-arch.md` lines ~406 and ~451 keep it in the producer ledger. Compatible with the kept sheet only if the `appendEvent` insert stays host-side (fix 1 for w1b-08). Not an order dependency if that fix is applied; without it, w1b-08 as written moves the raw insert into Jini and contradicts the ledger.
- **`$SCR/r12/w3b-ext-w2b.md` sheet 88/89 (trash adapters media/member/post, `move-to-trash`):** order dependency for w1b-08. Same core module `contracts/site/cms-trash`, and sheet 89 edits the same import lines (`permissions.ts:22-23`, `trash-item-tool.ts:49-50`, `index.ts:73,75-76`). Build 88/89 first, or re-grep and append. Sheet 88 also confirms the CMS adapter pattern (media/post/member adapters live in `cms:trash/site/adapters/*`), which makes leaving the redirect adapter in Tovu a deliberate exception: redirect has no logic of its own, media/post/member do.
- **Sheets 76-77 (site-inspection catalog):** order dependency for w1b-07 (both edit `tool-registrations.ts:14,195`). Not a duplicate; w1b-07 explicitly leaves the catalog to R2.
- **Sheets 68-69 (project-keys service/tools/references to `user-management:project-keys/*`):** no file overlap with w2-01 (attachments goes to `db`, disconnect to `integrations`). They share importer files (`owner-store.ts`, `project-store.ts`) at different import lines; sheet 69 says `grantedVault` comes from "the prior attachment-vault sheet", unrelated. Re-grep before building the later one.
- **Round-1 `w3-ext-w1.md` T04:** edits `owner-store.ts:2`, `shared-api.unit.test.ts:10`, `shared-owner.integration.test.ts:20,191` for the `shared-owner` module, same files as w2-01's disconnect repoints but different import lines. Line numbers there are one lower than the tip (`owner-store.ts:3`), so re-grep.
- **Sheets 33 (`P10-H2.PUBLISH.J`) and the H2 producer policy in `w3b-arch.md`:** no overlap with w2/w1 moves; outbox policy untouched in kept sheets (given fix 1).
- **Round-2 sheet 61-65 (post removal contract, post update/trash/tool inputs):** w2-02 says "Do not assume the round-2 `w3-ext-w2` post handoff has run" and moves `RemovePostFn`/`ForgetRemovedPostFn` into core `post-removal`; sheet 61 ("Post removal and HTML-store contracts") may also create that contract. I did not read sheets 61-65; **UNCHECKED**. Before building w2-02, grep `$SCR/r12/w3b-ext-w2b.md` lines 47-72 for `post-removal` and take the existing one if present.

#### 6. Security notes

- **User trash (w2-07 defect):** Tovu `hide` disables the principal AND deletes all the principal's sessions inside one principal-locked transaction, then appends `identity.user.trashed` carrying `sessionsRevoked`. w2-07's `store` port (`readPrincipal`, `readDisplayUsername`, `compareAndSetStatus`, `appendEvent`) has no session-revocation operation, so a faithful Sol build could silently stop revoking sessions on trash (a trashed user keeps signed-in sessions). w1b-08 keeps "session deletion" in the sequence and tests a status race: `USER-TRASH-DROP-STATUS-CAS`. Fix text 1 for w1b-08 adds `revokeSessions` explicitly.
- **Ordering that must survive (user trash):** read principal, then `assertAccountAction` (before any write), then status CAS (`WHERE status = <read status>`; 0 rows is `version-changed` with no revoke and no event), then sessions delete, then event, all under `trash:user:<ws>:<principal>` lock; `purge` refuses `active`, calls the account guard before the delete, and `purgeUser` joins the same lock. w1b-08's tests cover guard-before-write and CAS miss; w2-07's tests cover CAS-miss event and purge-in-lock; fix text 2 combines them.
- **OAuth disconnect (w2-01):** w2-01 preserves digest field order (`{ credentialId, revision, sites }`), issuer check, in-transaction CAS plus grant removal, and provider calls only after the transaction (`PK-REVOKE-BEFORE-COMMIT`, `PK-IGNORE-REVIEW-DIGEST`). It does not pin "retry of an already `revocation-pending` row must not bump generation again" (`shared-oauth-disconnect.ts:51-55`); fix 3 adds it. Both `PK-*` mutation names are valid targets (digest compare at `:50`, `transaction` at `:48`, provider call at `:59`).
- **Attachments query:** the `limit + 1` bound must be checked before label matching (`attachments.ts:19-21`: `candidates.length > 100` throws before `filter`). w2-01's `PK-LIMIT-BEFORE-DISAMBIGUATION` pins that. Fine.
- **Webhook keys:** the highest-risk regression is adopting or minting a key over existing sealed data (data loss). w1b-09 names it as the headline test (`ROOT-KEY-ADOPT-BEFORE-STAMP-CHECK`: mismatched adoption with dependent data writes and stamps nothing). w2-08 names "refusal to mint over dependent data" in prose but has no test or mutation for it. KEEP w1b-09 for that reason. Neither sheet touches the frozen `HKDF_EXTRACTION_SALT` (`keyring.env.ts:95`) or persisted formats; confirmed.
- **Secret scanner:** both sheets forbid returning raw matches. w1b-09's path-before-content check (`REPO-SCAN-FILTER-PATH-BEFORE-SCANNING`) and w2-08's exemption test (`REPO-SCAN-EXEMPT-BY-TEXT-ONLY`) are complementary; merged by fix 5. Not read in depth: `secret-scan-guard.ts:167-405`, **UNCHECKED**.
- **Trash visibility:** w1b-08's `trashPermissionFor` "map first, then registry; unknown kind denied without an auth call; one authorize per distinct kind after the page is fetched" matches Tovu `permissions.ts:68-70,90-137` exactly (filter after pagination so a cursor still points at the real next row). `TRASH-ALLOW-UNKNOWN-KIND` is a valid mutation target (`:98-101`).
- **w2-07 redirect piece:** the compare-before-cascade ordering lives in `compareAndDelete` (`marker-sql.ts`), already in Jini; no sheet should re-test it as a new adapter.

#### 7. Plain-words summary

The w2 set is not a separate piece of work: 43 of its 45 files are already classified in the w1a and w1b sets, and the other two are not moves. Its eight sheets duplicate round-3 sheets, so building both would move the same files to two places. I kept w2-01 (project keys, with a smaller fix to avoid a generic and a cast, and extra retry and no-token tests), w2-02 (the combined post sheet, which resolves a conflict between the two w1 post sheets, once the missing agent-hold dependency and an undefined `hashState` are fixed), and w1b-03/05/06/07 (they keep the Tovu binder in its current file, which avoids a dozen renames and keeps round-2 anchors valid). I kept w1b-08 for the trash adapters because w2-07 would have dropped session revocation on user trash and omits the guard-before-write test, and w1b-09 for the webhook keys because it names the data-loss test. Of the six verdict disagreements: redirect adapter, `import-keep-off` and `sources` are bindings over Jini mechanisms (ALREADY-MOVED); `trash-item-tool` and `keyring.env` stay in Tovu; `trash/permissions` has about 60 lines of reusable visibility logic that should move while the permission map stays. The w2 header says 8 STAYS-HOST but lists 7. Two round-2 sheets (88/89 trash adapters, 76/77 site-inspection catalog) touch the same files as the kept trash and inspection sheets, so those pairs need a stated build order.

#### 8. New owner questions

1. **Trash adapter contract in core.** w1b-08 moves `TrashAdapter` and related shapes from `cms/src/trash/ports.ts:15-103` into core `contracts/site/cms-trash` so user-management never imports CMS. The owner rule forbids re-export shells, yet CMS callers still import those names from `@jini-ai/cms/trash`. Recommended answer: re-export the types from `ports.ts` as `export type { ... } from "@jini-ai/core/contracts/site/cms-trash"` in that one file (a type-only public-surface alias, not a shell module), and add no other file. This is what fix 4 for w1b-08 says; the owner should confirm it is not a banned "re-export shell".
2. **User trash adapter home.** Place it in `user-management` (identity owner, matches w1b-08; needs the core contract above) rather than CMS (w2-07, needs a structural copy of `UserPurgePort`/`PurgeCounts`). Recommended: user-management.
3. **Redirect trash adapter.** Leave it in Tovu as a binding (classification above). Recommended: yes; revisit only if a second host needs a redirect adapter.

#### 9. Appendix: NEEDS-OPUS sheets

None. Every kept sheet is buildable once the fix text above is applied. Unverified items that would change a decision, for the coordinator: (a) round-2 sheets 61-65 may already define `post-removal` (see section 5); (b) the w1b-09 and w2-08 scanner extraction (`secret-scan-guard.ts:167-405`) was not read line by line; (c) I did not read `site-backup/share-database/repo.sqlite.ts` or `site-inspection/tool-registrations.ts` line by line, so the 03-06 picks rest on structure, importer churn, round-2 anchor safety and test coverage, not on a signature-by-signature diff.
