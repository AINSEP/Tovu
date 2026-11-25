DONE 77/114/6; NEEDS-OPUS 4

# Wave-3 build-sheet check, round 2 (read-only) — 2026-11-25

**Input:** Tovu `origin/plan/whats-left-1122:plans/sheets-1125/w3b-{arch,ext-a1,ext-a2,ext-w1,ext-w2a,ext-w2b,ext-crp}.md` (sheet commit `d01a16fd0`), 201 sheets.
**Checked against:** the merge-23 tips, Tovu `724ddc31a` and Jini `d252dc62b`. The sheets were written on Tovu `c0f1068a5` / Jini `fd06f45b1`. Since then the tips gained **real code**, not only docs:
- FIX 19/H2: `applyRunActor`, `requiredMutationActor`, and the entry/widget publish actor.
- source-control, storage and trash test copy.
- admin request headers.

Every sheet touching those files was re-anchored (see arch 33/34, w2b 92, a1/a2 drift notes).
**Bootstrap:** I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2, 2026-11-05) first. I used its lenses for boundaries, ownership maps, the implementation-constraint layer (coding-foundations, implementation-guardrails) and the design-time security threat surface. This is a review, so no ADR was written.
**Method:**
- I checked **w3b-arch, w3b-ext-w1 and w3b-ext-crp myself**, plus all cross-set duplicate and order findings.
- Four read-only Sonnet subagents checked ext-a1, ext-a2, ext-w2a and ext-w2b against the same 7-check brief.
- I re-verified their load-bearing claims in code, and all held:
  - `page-html-store.ts` already exists in core (73 lines).
  - the daemon owns `.records` (`attachment-persistence.ts:27`).
  - the vault adapter hard-codes kinds plus owner `"tovu"` (`vault-adapter.ts:139–140`).
  - `attachedOnlyVault` is built internally (`project-keys/service.ts:4,84`).
  - the i18n gate scans the `WidgetPickerDialog` folder (`shared-components-i18n.unit.test.ts:264`).
  - `admin:security/react/tabs/AccessTokensTab.tsx` exists.
- No repo was changed, built or tested. No codebase-memory tools were used.
- Round-1 owner decisions (`plan/sheets-check-1125`, all approved) are applied and not re-asked.

**Limits:** 19 places in the subagent sections say UNVERIFIED (mostly long importer line ledgers in T sheets, which were cross-checked by `rg` file lists rather than line by line). Verdicts there assume the builder re-runs the sheet's own `git grep` before deleting, as every sheet already instructs.

**Verdict counts** (APPROVE / FIX / REJECT / NEEDS-OPUS):

| set | sheets | APPROVE | FIX | REJECT | NEEDS-OPUS | checked by |
|---|---:|---:|---:|---:|---:|---|
| w3b-arch | 22 | 8 | 13 | 0 | 1 | coordinator |
| w3b-ext-a1 | 30 | 8 | 20 | 0 | 2 | subagent (spot-verified) |
| w3b-ext-a2 | 36 | 11 | 25 | 0 | 0 | subagent (spot-verified) |
| w3b-ext-w1 | 9 | 2 | 5 | 2 | 0 | coordinator |
| w3b-ext-w2a | 35 | 10 | 21 | 4 | 0 | subagent (spot-verified) |
| w3b-ext-w2b | 33 | 4 | 28 | 0 | 1 | subagent (spot-verified) |
| w3b-ext-crp | 36 | 34 | 2 | 0 | 0 | coordinator |
| **total** | **201** | **77** | **114** | **6** | **4** |  |

**NEEDS-OPUS (4):**
- arch 30 G06.PHYSICAL.J: depends on round-1 G06.RUN.J, which is itself NEEDS-OPUS.
- ext-a1 J25/T25: the AssistantDock `DockStateInput`, its seven collaborator groups and ~45 required hook props have no literal types.
- ext-w2b 83: the source-control secret-card engine host callback types.

**REJECT (6):**
- ext-w1 J24/T20 (recovery): duplicate of w2b 72/73.
- ext-w2a J14/T14 (media import) and J15/T15 (image generation): duplicates of w1 J19/T18 and J23/T19.

The surviving sheets absorb the rejected sheets' unique pins first, so no test is lost.

## Cross-set findings (the per-set checks could not see these)

- **Y1. Round-1 rejection left an orphan: `refuseUnexpectedKeys`, `approvalToolHandler`, `humanConfirmedToolHandler`.**
  - **The orphan.** Round 1 rejected ext-w1 J01/T01 (X1) and kept ext-crp CRP-02. CRP-02 moves only `contracts/core/human-confirm.ts:66–141`. So these three stay in Tovu (`:252`, `:205`, `:182`). `createHumanConfirmationKit`, which several w3b sheets type against, exists nowhere.
  - **Affected sheets:** ext-w1 J19–J22, T18, J24/T20; ext-w2a J12, J14, J18, T10a, T18; ext-w2b 72 (recovery calls `refuseUnexpectedKeys`).
  - **Decision (overrides w2a's proposed "P0 move to core"):** follow the precedent already in Jini (`cms/src/comments/tool-registrations.ts:258`, `cms/src/taxonomy/tool-handlers.ts:216`). Each CMS/DB deps object takes `readonly refuseUnexpectedKeys: (input: Record<string, unknown>, allowed: readonly string[]) => void`. The T sheet binds it to the Tovu export. Approval handlers are typed structurally in the consuming package (literal type in ext-w1 "G-W1"). CMS and DB keep depending only on `@jini-ai/core`. This is "inject everything", needs no new core API, and has no ordering dependency.
  - **Round 1 too.** The same orphan hits round-1 ext-w1 J12 (permanent-delete registrar), which Sol is building now. Tell that builder to inject `refuseUnexpectedKeys` the same way rather than look for a J01 export.
- **Y2. Recovery is claimed twice** (`features/recovery/tool-registrations.ts` → `db:recovery/tool-registrations`): ext-w1 J24/T20 and ext-w2b 72/73.
  - **Keep 72/73.** 72 uses a host-supplied `confirmedRestore` adapter, so it never touched the rejected J01.
  - **Copy into 72/73 before deleting J24/T20:** J24's port table (as the literal `RecoveryToolHost` signatures), its pins and mutations (`capabilities-before-authorize`, `confirm-different-plan`, `execute-outside-shared-lock`, `wire-duplicate-create`), and T20's held-lock pin, `bind-private-recovery-surface`, `lose-confirm-abort-signal`, and the live-reference cleanups.
  - **72's runtime is `node`** (DB inherits node), not `universal`.
- **Y3. Media import and image generation are claimed twice:** ext-w1 J19/T18 and J23/T19 versus ext-w2a J14/T14 and J15/T15. Same sources, same destinations, incompatible ports.
  - **Keep w1.** Its literal port tables interlock with J20–J22, and it names the duplicate itself.
  - **Before deleting w2a's sheets,** fold their unique pins (e.g. `ignore-content-type-write`) into w1.
  - **Order:** w2a J10/T10b (media credential store) must land **before** w1 J23/T19, which calls those store functions.
- **Y4. Page HTML store.** Core `contracts/site/page-html-store.ts` already exists. w2a J19 extends it (adds `PageHtmlInverse`, `restore?`) and does not create it. w2b 61 imports from it and does not redeclare `DuplicatePagesHtmlStore`. Build w2a J19 before w2b 61.
- **Y5. Publish-actor edits overlap the tip's FIX 19 work.**
  - Tovu `724ddc31a` already threads `applyRunActor(...)` into the entries and widgets publish contributors.
  - arch 33/34 must reuse `applyRunActor` + `checkedMutationActor` (no second mechanism, no CMS major) and drop the widgets row. w2b 92 re-anchors the same way.
  - **Order for the files several sheets touch:**
    - `taxonomy/publish-content.ts`: arch 34 first, then w2b 86 moves the file.
    - `media/publish-content.ts`: arch 33/34, then w2a J16.
    - `post/publish-content.ts`: arch 34, then w2b 62/63.
- **Y6. Admin UI ordering.**
  - a1 J35/T35 (banner, settings hooks) before a2 081–084 (panel, MCP hooks). No file moves twice, but T35 edits `use-external-mcp-admissions.hooks.ts` before 081 moves it.
  - a1 T21 rewrites `execution-config-ledger.hooks.ts`, so a2 114 re-anchors after it.
  - Both a1 and a2 add `@jini-ai/mcp` to `apps/admin/package.json`. The second to build skips that line.
  - mcp and integrations get their first React leaf in a1, so a2 depends on that package prep.
- **Y7. CSS renames reach the public site widget.** arch 17 renames the Jini `ChatFab` classes. `apps/site-chat/src/widget.css` (6 `.chat-fab` selectors) paints the public widget, so arch 18 must name it. Themes stay untouched; the classic admin theme only mentions `.op-card` in comments.
- **Y8. Round-1 cross-set ordering still applies.**
  - w2b 74 comes after round-1 w2 J06/T06 (site-export transforms).
  - w2b 68 builds on round-1 w2 J01 (project-keys vault wrappers / `attachedOnlyVault`).
  - w2b 62 comes after round-1 p11rest's `post-trash.ts` edit.
  - crp builds after round-1 CRP-12.T.

**Recommended build order (round 2, after round 1 lands):**
1. arch 31→32, then 33→34 (actor seams on the tip's `applyRunActor`). Then 25→26→27 and 28→29 (each pair in one integration cut). Then 22→24. The CSS block 13–21 can run any time after round-1 R01.TABLE.
2. ext-crp 13→30, in sheet order.
3. ext-w2a, with J14/T14/J15/T15 removed. J10/T10b first, J19 before w2b 61.
4. ext-w1: J19→J20→J21→J22→T18→J23→T19 (J24/T20 removed).
5. ext-w2b 61→93, with 72/73 carrying the recovery pins.
6. ext-a1, then ext-a2.
7. Opus: arch 30 (with round-1 G06.RUN.J), a1 J25/T25, w2b 83.

## The 7 arch BLOCKED items and what unblocks each

| # | Item | What unblocks it |
|---|---|---|
| B1 | Every new outbox write must carry an actor | Owner decides attribution for anonymous ingress (comments, form submits, redirects, scheduled go-live) and for derived events. Opus then writes a per-producer actor table, and a Sol sheet tightens `OutboxPort.enqueue`. |
| B2 | Direct active-theme writes | Owner picks the durable record: (a) a change-set plus event through the repo handler (recommended), or (b) a settings audit field. Owner also picks whether a failed render-verify records the attempt and its compensation. |
| B3 | Taxonomy merge | B5's storage decision. Then bind admin=`user` and tool=`agent` at the existing `gated-hooks.ts` seams. |
| B4 | Trash ledger kind | Owner decides a nullable `actor_kind` column plus retention/redaction for new rows. Opus writes the migration (no VACUUM). |
| B5 | `taxonomy_revisions` actor-kind storage | Owner decides the schema; legacy null means "unknown", never inferred. Opus writes the migration. |
| B6 | `post_revisions` actor-kind storage | Same as B5, plus how to treat historical rows with synthetic or missing provenance. |
| B7 | Restore-ledger `actor_kind` column | Owner decision. Recommend **no column**, since the typed actor is already in detail JSON. That closes B7 with no work. |

The ext-crp set has one more BLOCKED input, the publish-credentials list route; see owner question 7.

## Owner questions — NEW only (each with a recommended answer)

1. **`chat-fab` rename reaches the public site widget (arch 17/18).** *Recommend:* rename, and repoint `apps/site-chat/src/widget.css` in sheet 18. No dual class.
2. **Publish actor (arch 33/34):** a per-call typed actor on the contributor API (CMS major), or the shipped `applyRunActor` run-deps seam? *Recommend the shipped seam, no major.*
3. **B7 restore-ledger column?** *Recommend no.*
4. **React in `@jini-ai/mcp` (a1 J35, a2 081–084).** It is a node protocol-adapter that was not on round-1's list. *Recommend yes,* via round-1 Q7's optional react peer plus `browser` entries.
5. **Parallel UIs.** Jini `admin` already has media, agent-plugin and Access Tokens screens, and a1/a2 add the live ones in cms, agent-plugins and integrations. *Recommend:* leave the admin ones this wave, record the overlap in the source-maps, and retire them in a separate ticket.
6. **Secrets shell placement (a2 107).** *Recommend `admin:security/react/live/Security.tsx`,* not `integrations:react/credentials`. It composes TOTP, recovery, passkey and Site key slots, which are the security domain.
7. **Publish-credentials list route (crp BLOCKED).** *Recommend:* move it to the shared mount, and change the pin to assert the mounted route's 401/403 for no session. The direct no-principal handler call is test-only.
8. **Chat-attachment owner reader (w2a J11).** *Recommend `@jini-ai/daemon/http`,* which owns the `.records` sidecar format, not CMS.
9. **Project-key grants (w2b 68).** *Recommend:* Jini builds `attachedOnlyVault` itself from a required `attachedPolicy`, instead of trusting a caller-supplied `grantedVault`. This fails closed.
10. **Vault adapter kinds (w2b 79).** *Recommend:* a required `acceptedKinds` list in the host policy, so Jini never hard-codes `vendor`/`custom`/`source-control` or owner `"tovu"`.
11. **Analyzer trust list (w2a T23).** *Recommend:* keep `@jini-ai/cms/html/site/slug` this cut. Opus decides after the built-output specifier test.

## Owner safety rules: status in these sheets

| rule | status |
|---|---|
| Logins are never erased | Kept. No w3b sheet removes a partition or session store. Member hide (w2b 88/89) revokes sessions inside one transaction, with an added mutation. |
| No VACUUM in a migration | Kept. No w3b sheet adds a migration (arch 31/32 explicitly none). B4–B6 would need migrations, and those stay BLOCKED for the owner. |
| Share links never break | Kept. No sheet touches share expiry or share-key matching. |
| No automatic chat delete | Kept. Trash movers (w2b 88/89) only soft-delete behind authorize → expected-version → trash. At the tip the retention copy (30 days) and the stamped-window sweeper pin are untouched. |
| Deletion behind the approval card | Kept. Asset/copy/transform batches are prepared once and written unchanged after the card (w1 J20–J22). Purge stays behind `ConfirmDialog` (a1 J31). Plugin disable/remove stays behind confirm (a1 J32). |
| Credentials | Kept, with added mutations: vault authorize (w2b 79, `VAULT-AUTHORIZE-ACCEPT-ANY-OWNER`); project-key grants (w2b 68); saved credential never falls back to env (w1 J23); no token echoed in admin views (a2 081/089/103); write-only BYOK (a2 109–114). |
| Jini neutral | One leak, fixed: the vault-adapter owner `"tovu"` and its kind list become host policy (w2b 79). `TOVU_*` constants stay in Tovu (arch 27/29, crp 14.T). |
| Themes untouched | Kept. No sheet edits a theme folder. |

---

---

# Set: w3b-arch (22 sheets, 13–34) — checked by the coordinator directly

## Verdict table
| sheet id | verdict | exact fix text |
|---|---|---|
| 13 R01.ADMIN.J | FIX | (1) **Change the witness.** jsdom does not apply stylesheets (round-1 R01.TABLE.J fix), so a "computed-style witness" cannot fail. Replace it with: read `email.css`, `provider-settings-dialog.css`, `install-tab-card.css` and `dashboard.css` with `readFileSync`; render the email tabs, the provider dialog, InstallTabCard (soon + dragging) and Dashboard (collapsed + error); collect every class on rendered nodes that matches the renamed families; assert each appears as a `.`-selector in its CSS text, and that no old token (`.email-`, `.provider-settings-`, `.is-soon`, `.is-dragging`, `.is-collapsed` / `.is-error` paired with `jini-dash-`) remains. `M-admin-markup-with-old-css` then fails. (2) **Delete the open-ended paragraph** "For the rest of the admin census … global rename". This sheet renames only the four table rows. Any other admin family needs a later sheet with an Opus-written token list. Anchors OK: `email.css` (114 lines), `InstallTabCard.tsx:27,147`, `Dashboard.tsx:102,151,184,397`, `admin/package.json:3775,4534,4570`. |
| 14 R01.ADMIN.T | FIX | Same witness swap as 13: read the exported CSS text and assert that each class the host renders is in it. Otherwise OK. |
| 15 R01.UI-WIDGETS.J | FIX | Same witness swap (CSS text from `ui/src/styles/admin.css` and the admin-widgets stylesheet). Anchors OK: `Select.tsx:182–183`, `DockHeaderTip.tsx:22`, `RuntimeDropUp.tsx:37` (an `info-tip-bubble` emitter, correctly listed). |
| 16 R01.UI-FEATURES.J | FIX | (1) Same witness swap. (2) Delete the last table row ("viewer-shell, resource-dashboard … remaining UI census") and the paragraph "For families not on the selector list, use git grep … before editing". Sol renames only a token that appears both in a `.css` file under `packages/ui/src` **and** as a literal `className` in a `.tsx` emitter, for the families named in rows 1–4. Everything else is a later Opus-listed sheet. |
| 17 R01.CHAT.J | FIX | (1) Same witness swap. (2) State the literal result: `chat-fab` becomes `jini-chat-chat-fab`, `chat-fab-open` becomes `jini-chat-chat-fab-open`, and so on (prefix plus the old token, no de-duplication). (3) Note for 18: the PUBLIC site widget paints this button (`apps/site-chat/src/SiteAssistantWidget.tsx` uses Jini `ChatFab`, and `apps/site-chat/src/widget.css` has 6 `.chat-fab` selector lines). Anchors OK: `ChatFab.tsx:28`, admin `ChatFab.tsx:121`, `TodoCard.tsx:30`. |
| 18 R01.UI-CHAT.T | FIX | (1) Add an explicit bullet: "`apps/site-chat/src/widget.css`: rename every `.chat-fab*` selector (6 lines) to the sheet-17 tokens; the public widget otherwise loses its button paint." (2) `apps/admin/src/admin-themes/classic/chat.css:62,78` mention `.op-card` only in comments. Themes stay untouched, so leave them. (3) Same CSS-text witness swap. |
| 19 R01.USER-MANAGEMENT.J | FIX | Replace "such as …" with a closed list: `UserManagementClasses` has exactly `page, pageHeader, pageHeaderText, pageKicker, pageTitle, pageDescription, tableScroll, table, card, empty, notice, error, actions, linkButton, mutedCell, form` plus `statusTone: Readonly<Record<'ok' \| 'warn' \| 'error' \| 'muted', string>>`. Any other literal class in `user-management/src/react` stays as it is in this sheet. The 2-host test works in jsdom because it asserts markup classes, not paint. Anchor OK: `kit.tsx:45–58` (the kit has `components` + `hooks` today). |
| 20 R01.DOMAIN-PAINT.J | FIX | Give SourceControl a literal key list: `classes: { page; pageHeader; pageHeaderText; pageKicker; pageTitle; pageDescription }` (all `string`). Making `usePaymentsHook` required follows the owner rule, and the sheet does it. Anchors OK: `Payments.tsx:26–28` (all props optional today, `= {}` default), `commerce/package.json:73`. |
| 21 R01.DOMAIN-PAINT.T | APPROVE | Anchors OK: `jini-kits.ts:110`, `Deployment.tsx:62`, `StaticSiteTab.tsx:1287`, `source-control-panel.tsx:71`. |
| 22 R02.REASONS.J | FIX | Bound the census row: in this sheet edit only the table rows plus hits under `packages/{cms,user-management,admin}`. Reword why-comments in place; never delete one, and add no rows to `scripts/why-comments-debt.json`. Other packages go in a follow-up. Documentation only, so it stays SOL. |
| 23 R02.LIVE-COPY.J | APPROVE | Anchors exact: `execute-import.ts:54`, `plugins/src/runtime/agent-tools.ts:154,218`, `s3-compatible/jini-deploy-targets.json:62`. The ADR-023 comments at `agent-tools.ts:81–87,261` belong to 22 (comments), not to this sheet. |
| 24 R02.LIVE-COPY.T | APPROVE | `:123` holds the exact old phrase. `descriptor-fields.unit.test.ts:231` pins `mediaKeyPrefix`. |
| 25 R03.IDENTITY.J | APPROVE | Anchors OK: `identity-namespace.ts:36` warning, `:60–71` lifecycle rule, `agent-plugins/package.json:175–179`. Tovu does not import `legacyAgentPluginMetadataWarning`, so removing it breaks no host. The unbound default becomes canonical-only, the major round 1 already accepted. It must land in the same cut as 26–27. |
| 26 R03.PREBOOT.J | FIX | Name the compatibility constant: "keep `export const credentialCardsContribution = createCredentialCardsContribution({})` at `connect/credential-cards.ts:9`, so existing importers are unchanged." Today it is a `const` object, and the sheet's phrase "default canonical contribution as createCredentialCardsContribution({})" leaves the export name to Sol. |
| 27 R03.IDENTITY.T | APPROVE | `identity-read-policy.ts` is new (absent today). Desktop already imports pure website feature modules (`desktop-host-signals.ts:4–5`), so this adds no new kind of edge. `host-binding.ts:77` `identityNamespace: "tovu"` is correctly left alone. |
| 28 R03.FILENAMES.J | APPROVE | Anchors exact: `plugin-format.ts:1–21` (the two legacy constants and lists), `sdk-resolver.ts:92`, allowlist row `scripts/source-neutrality-allowlist.json:3`. Integrity exclusion is by exact name, with mutation `M-snapshot-exempts-arbitrary-file`. An invalid alias is dropped, which fails closed for reading. It must land in the same integration cut as 29, because `worker.ts:18` imports `PLUGIN_SDK_SPECIFIERS`. |
| 29 R03.FILENAMES.T | FIX | (1) Name the file: `W/features/plugin-runtime/site-plugin-vocabulary.ts`, exporting `TOVU_SITE_PLUGIN_MANIFEST_READ`, `TOVU_LEGACY_PLUGIN_SDK_SPECIFIER = "@tovu/sdk"` and `TOVU_SITE_PLUGIN_SDK_SPECIFIERS`. (2) Replace "including the direct telemetry createPluginModuleImporter if it exercises snapshots" with: "At `product-telemetry.ts:147` pass the same read options to `createPluginModuleImporter` through the optional argument sheet 28 adds." |
| 30 G06.PHYSICAL.J | NEEDS-OPUS | It depends on round-1 G06.RUN.J ("after 5–6"), which is itself NEEDS-OPUS. Its map is "by symbol after re-anchoring", with judgment clauses: "can stay in launch.ts as narrow callbacks" and "when a phase approaches 80 lines … extract a leaf". The size-debt row can be retired only after running `check-size.mjs`, which Sol cannot do. Anchors OK: `launch.ts` 1,623 lines, `size-debt.json:213,220`. Recommend Opus does this together with G06.RUN.J. |
| 31 P10-H2.NEW-CHANGE-SET.J | APPROVE | Anchors OK: `change-set.ts:36–41` (optional `actorId`/`actor`), `ports.ts:127–129` (`OutboxPort.enqueue`), `change-set-repo.sql.ts:97–110` (header/event built before the transaction, preparation first). No migration, so the owner rule holds. |
| 32 P10-H2.NEW-CHANGE-SET.T | APPROVE | `change-set-repo.sqlite.ts:52–53` (`actorKindColumn: true`, migration 0047) OK. Raw inserts at `user-purge.ts:87` and `trash/adapters/user.ts:82` are correctly left out. |
| 33 P10-H2.PUBLISH.J | FIX | **The tip moved after the sheets were written.** Jini `d252dc62b` added `applyRunActor({ deps, principalId })` (`repo-handler.ts:451`) and `requiredMutationActor`/`MissingMutationActorError` (`core/mutation-actor.ts:35–60`). Rebase the sheet on them: (1) do NOT add `RepoWriteContext.actor` or required `actor` on `type-registry.ts:223` `apply`/`retire`/`repointReferences` (no CMS major); (2) replace `repo-handler.ts:374` and `raw-row-contributor.ts:188` `deps.mutationActor ?? { id: input.principalId, kind: "user" }` with `checkedMutationActor({ principalId: input.principalId, actor: applyRunActor({ deps, principalId: input.principalId }) })`, and `raw-file-contributor.ts:239` `{ kind: "user", id: input.principalId }` with the same call; (3) keep the post-import and menu-import optional `actor?` parts as written; (4) the tests stay, but "missing provenance" now means `MissingMutationActorError`. Changeset `minor`, not major. |
| 34 P10-H2.PUBLISH.T | FIX | Tovu `724ddc31a` already did the widgets row (`widgets/publish-content.ts:222,259` use `applyRunActor(...).kind`) and entries. **Delete the widgets row.** For post `:521`, navigation `:306` and theme `:774`, replace the invented `kind: "user"` actor with `applyRunActor({ deps: <the contributor's deps>, principalId: input.principalId })`, the same pattern as `entries/publish-content.ts:90`. Taxonomy: pass the same call's result into `importTaxonomy`/`importTerm`. |

## Anchors checked
OK: the arch table above, plus Tovu `publish-content-import-real-composition.unrun.integration.test.ts:123`, `descriptor-fields.unit.test.ts:231`, `user-purge.ts:87`, `trash/adapters/user.ts:82`, `cli/program.ts:77`, `plugin-tier2/worker.ts:18,41`, `host-binding.ts:77`, `lifecycle.ts:159,268`. Changed since the sheets were written (33/34): `repo-handler.ts` (+`applyRunActor`), `widgets/publish-content.ts`, `entries/publish-content.ts`. The other anchors still hold: post `:521`, nav `:306`, theme `:774`, `raw-row:188`, `raw-file:239`, `type-registry:223`.

## Cross-set
- 17/18 also reach the public `apps/site-chat` widget, which the sheet does not name.
- 30 waits on round-1 G06.RUN.J (NEEDS-OPUS).

## The 7 BLOCKED arch items and what unblocks each
| # | Item | Unblocked by |
|---|---|---|
| B1 | Every new outbox write actor-required | Owner picks attribution for anonymous ingress (comments, forms, redirects, go-live) and derived/scheduled events. Then Opus writes a "producer policy" table naming one actor form per producer. Then a Sol sheet tightens `OutboxPort.enqueue`. |
| B2 | Direct active-theme writes | Owner picks the durable record: (a) a change-set plus event through the repo handler, or (b) a settings audit field. Owner also decides whether a failed render-verify records the attempted switch and its compensation. Then a Sol sheet. |
| B3 | Taxonomy merge | B5 decided (the revision-row actor storage). Then bind admin=`user` and tool=`agent` at `gated-hooks.ts` seams. |
| B4 | Trash ledger kind | Owner decides on a nullable `actor_kind` column, plus retention/redaction for new rows. Needs a migration (no VACUUM). Opus writes it. |
| B5 | `taxonomy_revisions` actor-kind storage | Owner decides the schema plus legacy-null meaning ("unknown", never inferred). Migration by Opus. |
| B6 | `post_revisions` actor-kind storage | Same as B5, plus how to show historical rows with synthetic/missing provenance. Migration by Opus. |
| B7 | Restore-ledger `actor_kind` column | Owner decides whether a queryable column is worth a migration, since the typed actor is already in detail JSON. Recommend **no column** (closes B7 with no work). |

## Summary
This set is cleanup, not file moves: (13–21) rename unprefixed CSS classes in Jini admin, ui, chat, user-management, commerce and devops and inject host layout classes; (22–24) replace internal ADR/ID citations with reasons; (25–29) make the legacy "tovu" plugin namespace, manifest filename and SDK alias a host-supplied read policy; (30) the physical launch.ts split; (31–34) require a typed actor on new change-set writes and publish writes. Anchors are accurate. The real problems:
- The CSS sheets repeat round 1's jsdom-cannot-see-CSS test defect and leave an open-ended "rest of the census" to Sol.
- The public site-chat widget's `.chat-fab` paint is not named.
- The tip's newer FIX-19 commits have overtaken part of the publish-actor sheets (`applyRunActor` exists, and widgets and entries are done), so 33/34 must reuse them instead of adding a second, conflicting mechanism.
- G06's physical split needs Opus, like its round-1 parent.

The security- and data-relevant sheets (25–29, 31–34) keep fail-closed defaults: an unbound policy is canonical-only, integrity exclusion is by exact name, and a missing actor is refused. None adds a migration.

## NEW owner questions
1. Renaming `chat-fab` to `jini-chat-chat-fab` also changes the public site widget's DOM class. A customer theme that styles `.chat-fab` would lose that paint. No theme in the repo does. **Recommend: rename, and repoint `apps/site-chat/src/widget.css` in sheet 18 (no dual class).**
2. Sheets 33/34 versus the shipped `applyRunActor`: per-call typed actor (CMS major) or the run-deps seam? **Recommend the shipped seam (`applyRunActor` + `checkedMutationActor`), no major.**
3. B7: add a restore-ledger `actor_kind` column? **Recommend no.** The detail JSON already carries the typed actor.

---

# Set: w3b-ext-a1 (30 sheets: J21-J35, T21-T35)

> Checked by a subagent; the coordinator verified the i18n-gate claim (`shared-components-i18n.unit.test.ts:264`). See Y6 for ordering against ext-a2.
Checked at Tovu 724ddc31a / Jini d252dc62b. Read-only. Counts: APPROVE 8, FIX 20, REJECT 0, NEEDS-OPUS 2.

## Verdict table
| sheet id | verdict | exact fix text |
|---|---|---|
| J21 | FIX | (1) Anchor: `EXECUTION_CONFIG_MAX_AGE_MS` is at `execution-config-ledger.hooks.ts:12`, not :25 (:25 is `refreshExecutionConfigRead`, :61 `subscribeExecutionConfigRefresh`, :101 `useExecutionConfigLedger` are right). (2) `useStoredAdminKey` is a private `function` at `execution-config.hooks.ts:86`; say "export it (new export)". (3) Add mutation `M-collapse-unread-key-to-false`: a failed presence read returns `false` instead of `null`; the test `execution-config.presence-scope` must fail it. Credential hook guard (null vs false, no credential text in loader/logger) is otherwise unwitnessed. |
| T21 | FIX | Replace "Delete the host ledger implementation" with: "Delete `apps/admin/src/components/AssistantDock/hooks/execution-config-ledger.hooks.ts` after repointing `execution-config.hooks.ts:12` and `AssistantDock.execution-refresh.unit.test.tsx:7`." Add: "w3b-ext-a2 sheet 114 cites `execution-config-ledger.hooks.ts:9`, `byok-runtime.hooks.ts:7`, `execution-config.hooks.ts:10`; those lines are rewritten here, so 114 must re-anchor after T21 (no double edit)." Add host test `execution-config.binding.unit.test.tsx` killing `M-bind-credential-load-to-config-loader`. |
| J22 | FIX | Add the missing literal for the two symbols the sheet never places: `readDaemonOnline` (`agents-inventory.hooks.ts:239`) STAYS in Tovu (it is the same-origin health GET, T22 binds it as `probeDaemon`); `getResumeCapableAgentIds` STAYS in Tovu as `() => inventoryState.resumeIds` over one module-level `createAgentInventoryState({})` instance (consumed at `assistant-transport.binding.ts:7,24`). Note `extractResumeCapableAgentIds` today takes a positional `(agents)` at :36; the new `({ agents }, {})` shape is intended, repoint every caller. |
| T22 | FIX | Add: "Create exactly one `const inventoryState = createAgentInventoryState({})` at module scope of `D/hooks/agents-inventory.hooks.ts`; `getResumeCapableAgentIds` returns `inventoryState.resumeIds`; `runtime-access.hooks.ts` and the binding at `assistant-transport.binding.ts:24` use that same instance." Add host test `agents-inventory.binding.unit.test.ts` with mutation `M-new-state-per-mount`. Re-check `lib/admin-http/request.ts` (drifted since the sheet) for the `requireJson`/`ApiError` shapes before binding. |
| J23 | APPROVE | Anchors 14/42/113/148 and composer-files 55-67 OK. |
| T23 | APPROVE | Anchors OK (composer-files :69 `useAttachmentUploader`). |
| J24 | APPROVE | Anchors 29/47/69/130 OK. |
| T24 | APPROVE | Window debug-property mirror correctly stays in Tovu. |
| J25 | NEEDS-OPUS | ~45 required hook-prop types (`DockStateInput` collaborator groups chrome/preferences/execution/transport/agent/composer/run, `DockChatPaneBindings`) are described as "use Jini sibling types where they exist and project host-only returns structurally" and "split the composer helper ... if needed". Sol would have to design them. Opus writes `DockStateInput`, the 7 group interfaces, `DockChatPaneBindings` and the slot types into the sheet first; Sol then moves bodies. Mutations (`M-read-conversation-before-authorized-link`, `M-send-with-saved-mode`, `M-drop-redaction-callback`) are good and stay. |
| T25 | NEEDS-OPUS | Depends on J25 types. Also "keep a real `AssistantDockMount`, OR name its export `AssistantDock` and alias" is a choice: pick the first. The website pin `apps/website/src/assistant/__tests__/mcp-ui-sandbox-proxy-route.test.ts:68` (`dockSource.includes("const renderers = useDockRendererRegistry();")`) reads `AssistantDock.tsx` source text; it must be repointed to the file that now holds that line. `chat-cleanup-kit.tsx` changed since the sheet; re-anchor the cleanup header binding. |
| J26 | FIX | Replace "`rules` picks the current `media-content-rules` exports actually used at :126-314" with: "`rules` has exactly the identifiers that `MediaContentEditor.hooks.ts` and `MediaContentEditor.tsx` import from `./media-content-rules` (list them in the sheet from the import statements; Jini already has `admin/src/shell/components/WidgetConfigFields/media-content-rules.ts`, do not copy it)." Add `.changeset/admin-extraction-26.md` leaf names `./react/widgets/WidgetConfigFields/MediaContentEditor` and `.../MediaContentEditor.hooks`. |
| T26 | APPROVE | Anchors OK (:408 baseline entry is `MediaContentEditor.tsx`). |
| J27 | APPROVE | Anchors OK; `WIDGET_TYPE_OPTIONS:573`, `defaultWidgetConfig:584` verified host-side. |
| T27 | FIX | Replace "Split the following mixed imports into view and policy as applicable" with: "In each listed import line, import `WIDGET_TYPE_OPTIONS`/`defaultWidgetConfig` from `./widget-config-host-policy` (path relative to that file) and `WidgetConfigFields` from the bound mount file; no other symbol moves." |
| J28 | FIX | Replace "a required bound picker component or its `useDialog` and kit props" with: "`WidgetAddControl` and `WidgetSelectionDialog` each require `useAddControl: typeof useWidgetAddControl`, `PickerDialog: ComponentType<WidgetPickerDialogProps>` and `typeOptions`." Add the changeset leaf names `./react/widgets/WidgetPickerDialog/WidgetPickerDialog` and `.../WidgetPickerDialog.hooks`. |
| T28 | FIX | Add the missed gate: `apps/admin/src/components/__tests__/shared-components-i18n.unit.test.ts:264` scans local dirs `WidgetPickerDialog` and `WidgetConfigFields` for literal `t()` keys and asserts `"Place a {typeLabel} widget"` and the `Widget "{title}" was created but not placed...` key are used. Those literals move to Jini, so this test fails. Fix: scan the linked Jini source dirs (`cms/src/react/widgets/WidgetPickerDialog`, `.../WidgetConfigFields`) in addition, keep both `toContain` assertions. Also importer `apps/admin/src/lib/widget-embed-extension.hooks.ts` (imports WidgetPickerDialog) is in the listed `widget-embed-extension{.hooks.ts:9...}` group: keep. |
| J29 | APPROVE | Anchors 53/66/192/301/371/388 OK. |
| T29 | FIX | Replace "reconcile `development/{hook-injection-debt.json:19,133, scripts/size-debt.json:26}` with the actual moved code" with: "delete the three entries whose file is `apps/admin/src/features/collections/CollectionEntryEditor.tsx` (hook-injection-debt.json:19 and :133, size-debt.json:26) because the file is deleted; add an entry for the new mount only if the gate script reports a violation." Same for baseline.json:32 (move to the Jini markup owner, as written). |
| J30 | FIX | Name the two new cms leaves: `./react/media/hooks/use-edit-media-panel.hooks` and `./react/media/hooks/use-media.hooks` (browser). Existing `./react/media` leaf is untouched. Jini `admin/src/media/react/hooks/EditMediaPanel.hooks.ts` already exports a different `useEditMediaPanel`; add one sentence: "Do not touch `packages/admin/src/media/react/**`; the new hooks live only in cms." |
| T30 | FIX | Same debt rule as T29: "remove `error-gate-debt.json:88,93` and `size-debt.json:89,96` entries for the two old files (deleted); re-add per new-file violation only." Add host test `media-binding.purge-ownership.unit.test.tsx` with mutation `M-bind-purge-without-confirm-state` (writes hook bound so purge fires on request). Keep "No write ownership change in `use-media-writes.hooks.ts`". |
| J31 | FIX | Replace "`kit` provides the consumed dialog/field/button/tab/icon/tip/lightbox/truncation subset" with: "`kit` has exactly the identifiers imported at `Media.tsx` lines 1-50 from `@jini-ai/admin/react` (incl. `RowMenu`, `ConfirmDialog`, line 7) and `@jini-ai/ui*`; list them in the sheet." Name leaf `./react/media/Media`. Purge guard (`MediaPurgeDialog` :927 ConfirmDialog, only the dialog confirm purges) is covered by `M-purge-from-row-menu`; keep. |
| T31 | FIX | Same debt rule: remove `hook-injection-debt.json:25,31,121,127,139,145,151,157,163,169` and `size-debt.json:61,68,75,82` (all `Media.tsx`, deleted) and `baseline.json:53,60` (move to Jini markup test); re-add per new-file violation. |
| J32 | FIX | Name leaves: `./react/hooks/use-agent-plugins.hooks`, `./react/AgentPluginDetailsModal`, `./react/AgentPlugins` (browser). `productName: "Tovu"` at `AgentPlugins.tsx:107` must become the `productName` prop; add a Jini-side scan test `agent-plugins.neutrality.unit.test.ts` failing on `/tovu/i` in `src/react/**`. Jini `admin/src/agent-plugins/react/**` and `admin/src/screens/plugins/AgentPlugins.hooks.ts` already exist; do not import them (no cross-feature edge). Confirm-before-disable/remove (AgentPlugins.tsx:422 hook, :508-519 dialog) and `expectedOldDigest` (:98-117) mutations are named: keep. |
| T32 | FIX | Remove `hook-injection-debt.json:49,55,61,67,73,79,85,91` and `size-debt.json:166` for the deleted files. `vendor-neutrality.test.ts:41` lists `AgentPluginDetailsModal.tsx`; replace with the new host mount path and add the Jini inspector path as written. Add host mutation `M-bind-update-without-digest` (binding passes a digest when `updatableAgentPluginDigest` returned undefined). |
| J33 | FIX | Name leaves `./react/PluginProviderSettingsDialog`, `./react/Plugins`. `PLUGINS_TAB_IDS` is a private const at `Plugins.tsx:301`: say "export it" (admin-visual pin reads it). Credential rules verified: `unenteredFieldValue` :72-73 returns `"saved"` only for required calc (:98-100); mutation `M-write-saved-marker-as-secret` is named. Keep. |
| T33 | FIX | Add host test `plugins-panel.provider-credentials.unit.test.tsx` and mutation `M-close-on-failed-save` (binding calls `onSaved`/closes when `save()` resolves false). Debt: remove `hook-injection-debt.json:181,187` (PluginProviderSettingsDialog.tsx, deleted). `focusById` binding `document.getElementById(id)?.focus()` stays in Tovu. |
| J34 | APPROVE | Anchors 94/104/199/219 OK; `PROVIDERS_TAB_IDS` private at :94, sheet exports it. Depends only on round-1 J09/T09. |
| T34 | FIX | Replace "Keep `defaultProvidersHooks` local if still useful to its tests" with: "Move `defaultProvidersHooks` (`Providers.tsx:199`) into `providers-panel.tsx` and repoint `Providers.unit.test.tsx:8,13` to it." Re-check `admin-visual.pins.journey.ts:124` (`tabValues("providers/Providers.tsx","PROVIDERS_TAB_IDS")`) reads the built leaf. a2 sheet 084 mounts the Jini panel inside this file; no double move. |
| J35 | FIX | Banner/hooks anchors all OK (33/80/118/141/151; 31/47/67/82/96/127). Add mutation `M-show-restart-without-permission`: footer (`ExternalMcpAdmissionsBanner.tsx:118-121`, `canRestart` false must render no restart control). Name leaves `./react/external-mcp/ExternalMcpAdmissionsBanner` and `./react/external-mcp/ExternalMcpSettingsPanel.hooks`. `ExternalMcpSettingsPanel.hooks.tsx:6` already imports `grantWriteFieldValue` from Jini admin; keep it injected (do not import admin from mcp). mcp is `runtime: node`; add React `browser` leaves per the CMS precedent (see owner Q1). |
| T35 | FIX | Replace "using the existing root `^0.7.3-next.2` range" with: "`\"@jini-ai/mcp\": \"^0.7.3-next.2\"` in `apps/admin/package.json` dependencies (the range of the other `@jini-ai/*` lines). If w3b-ext-a2 sheet 081 already added it, do not add a second line." Replace "mirror the workspace dependency in `package-lock.json` using its existing MCP resolution" with "copy the `@jini-ai/mcp` entry already present in the lock's other-workspace dependency blocks". Add host test `external-mcp-panel-bindings.unit.test.tsx` with mutations `M-allow-write-bypass-patch-path` and `M-remove-skip-confirmation` (host `onRequestRemove` must still open the existing confirmation). |

## Anchors checked
OK: ledger :61 :101; execution-config :57 :86 :112 :164 :181-182 (keys); byok :25 :57 :83; local-cli :19 :50 :96; agents-inventory :36 :75 :94 :129 :147 :157 :179 :195 :239; runtime-access :29 :64 :73 :83; composer-discovery :14 :42 :113 :148; composer-files :55-69; messages-change :29 :47 :69 :130; AssistantDock.tsx :88 :233 :25 :27 :28 :35-45; DockChatPane :48 :99 :149 :245; state hooks :55 :67 :82 :102 :130 :169 :188 :250 :296; assistant-dock-props :18-112; execution-config-write :31 :50 :72 :87; assistant-transport.binding :7 :24; App.chrome :10 :132; App.tsx :49.
WRONG: execution-config-ledger.hooks.ts:25 (is `refreshExecutionConfigRead`; the exported constant is :12).
OK (CMS/media/plugins): MediaContentEditor.hooks :52 :63 :117 :126 :137 :174 :266; .tsx :65 :80 :97 :347; WidgetConfigFields :85 :106 :173 :345 :522 :528 :573 :584; WidgetPickerDialog.hooks :70 :102 :197 :219 :294; .tsx :76 :93 :128 :300; CollectionEntryEditor :53 :66 :192 :301 :371 :388; use-edit-media-panel :78 :84 :183 :341; use-media :67 :81 :162 :171 :315; Media.tsx :190 :260 :314 :516 :683 :1183 :1447 :1534; Providers :94 :104 :199 :219.
OK (security): AgentPlugins.tsx :98-117 (expectedOldDigest), :365/:422 (confirmation hook), :508-519 (disable confirm); PluginProviderSettingsDialog :72-73 `"saved"` sentinel, :98-100; Plugins.tsx :437-441 (remove confirm); Banner :57-67 (missing-launcher remove, needs-write-grant), :118-121 (canRestart); hooks.tsx :82-92 (`writeAllowedToolNames` only); Media.tsx :927-945 (purge ConfirmDialog).
OK (routing/gates): panel-pages.ts :32 :43 :44 :52 :69; panels.tsx :322 :361 :756 :777 :820; plugins/index.ts :9 :10; media/index.ts :9; collections/index.ts :11; media-panel.ts :1 :4 :21 :31; admin-visual.pins :121 :122 :124; vendor-neutrality.test :41; content-refresh-coverage :57 :58; baseline.json :32 :53 :60 :408; hook-injection-debt :19 :25 :49 :133 :181; size-debt :26 :61 :89 :166; error-gate-debt :88 :93; mcp-ui-sandbox-proxy test :34 :39 :52 :68; fqfix-rationale :19.
MISSING from sheet: `components/__tests__/shared-components-i18n.unit.test.ts:264` (see T28).
UNVERIFIED: `admin/screens/plugins/composer-capabilities` types named in J23; every importer line number in the T sheets was spot-checked, not all; drifted `lib/admin-http/request.ts` and `chat-cleanup-kit.tsx` anchors not re-read.

## Cross-set / duplicate findings
- Importer sweep by `rg` for every moved Tovu module: all production importers and tests are named in the sheet except `shared-components-i18n.unit.test.ts` (above). Other hits were comments only.
- No Jini duplicate of any exported J21-J35 symbol exists (`rg` over packages). Related but different Jini code: `admin/src/shell/components/WidgetConfigFields/{media-content-rules,HtmlAttributeRows.hooks,WidgetConfigFields.hooks}.ts*`, `WidgetPickerDialog/widget-picker-port.hooks.ts` (the new cms leaves inject these, fine); `admin/src/media/react/**` (has its own `useEditMediaPanel`, port-based prototype); `admin/src/agent-plugins/react/**` (own `useAgentPlugins`/AgentPluginsPage). Edge direction is admin -> cms, so cms leaves must not import admin: sheets inject everything, good.
- vs round-1 `w3-ext-a`: J17 (cms `react/widgets/`) and J18 (media picker) are prerequisites for J26-J28; consistent. Nothing here re-moves a round-1 file. Round-1 T08/T07/T09/T19 are used only as bindings.
- vs `w3b-ext-a2` (MCP 081-084): no double move. a1 moves only `ExternalMcpAdmissionsBanner.tsx` and `ExternalMcpSettingsPanel.hooks.tsx`; a2 081 moves `use-external-mcp*.hooks.ts` and 083 moves the panel, injecting the a1 banner/hooks (a2 line 77). Same destination folder `mcp/react/external-mcp/` with disjoint filenames. Overlaps to manage: (a) both add `@jini-ai/mcp` to `apps/admin/package.json` (second must skip, see T35); (b) a2 114 anchors into `execution-config-ledger.hooks.ts`, `byok-runtime.hooks.ts`, `execution-config.hooks.ts` which T21 rewrites/deletes; (c) a2 081 re-anchors `use-external-mcp-admissions.hooks.ts:15,327` after T35 repoints them. Build order a1 before a2 is correct; T35 binding file `external-mcp-panel-bindings.hooks.ts` vs a2 `external-mcp-settings-panel.binding.tsx` are distinct files (a2 should import the a1 one).
- Not touched: no sheet depends on rejected ext-w1 J01/J02/T01/J16/T15.

## Summary
J21-J25 move the assistant dock's execution ledger, BYOK, CLI selection, agent inventory, runtime access, composer discovery, transcript arbitration and the dock composition into the existing `admin` shell, with every hook injected as a required prop and Tovu keeping real binders (no re-export shells). J26-J29 and J30-J31 move widget config/picker, the entry editor and the media screen into `cms` React leaves; J32 goes to `agent-plugins`, J33 to `plugins`, J34 to `integrations`, J35 to `mcp`. Anchors are accurate (one wrong line, ledger constant :12) and the security guards verified in code (confirm before disable/remove, `expectedOldDigest`, saved-key sentinel only in required-field math, write-grant only on `needs-write-grant` with a tool name, purge only behind the dialog) each have a named mutation, though T-sheets mostly lack their own host mutation and I added them. The main risks are J25/T25 (design-heavy types, so NEEDS-OPUS), the missed i18n scan test that breaks when widget picker literals move, vague debt-JSON reconcile wording that Sol cannot execute, and the J22 inventory state/`getResumeCapableAgentIds` placement. The a1/a2 MCP split is clean; only the shared package.json dependency line and a2 114's anchors need care. Drift files (`chat-cleanup-kit.tsx`, `request.ts`) need a re-anchor at build time.

## NEW owner questions
1. J35 and a2 081-084 put React in `@jini-ai/mcp`, which is `domain: integration, kind: protocol-adapter, runtime: node` and was not on the round-1 named list (integrations/db/agentic/agent-plugins/plugins). Recommend: yes, allowed by the settled Q7 (optional react peer, `browser` entries); mcp already owns the `external/` server code so the UI belongs with it.
2. Jini `@jini-ai/admin` already carries parallel React media and agent-plugin screens (`admin/src/media/react`, `admin/src/agent-plugins/react`). After J30-J32 land there are two media/agent-plugin UIs in Jini. Recommend: leave the admin ones untouched in this wave and record the overlap in `packages/cms` and `packages/agent-plugins` source-maps; decide retirement separately.

---

# Set: w3b-ext-a2 (36 sheets, 081-116)

Tips checked: Tovu 724ddc31a (`wt-tovu`), Jini d252dc62b (`wt-jini`). Read-only; no builds/tests. 18 Jini + 18 Tovu pairs. Counts: APPROVE 11 / FIX 25 / REJECT 0 / NEEDS-OPUS 0.

Common FIX (applies to every row marked "C1"): each Jini sheet must also say "add the leaf to `jini.entries` (browser for React/controllers, universal for pure rules) AND `exports`" per its own Conventions block -- the conventions say this once, so it is OK; but sheets with "or"/"if needed"/"as appropriate" wording below need the literal text given.

## Verdict table
| sheet id | verdict | exact fix text |
|---|---|---|
| 081 | FIX | Add to first-tests line: `M-echo-token-in-stored-hint` (a test feeds sentinel `sk-SENTINEL` through `describeStoredCredentials`/`toAccessTokenWriteBody` and asserts the sentinel appears in no returned item, hint or error). Add sentence "Prerequisite: w3b-ext-a1 J35 has created the mcp React setup (optional react peer `^18.3.0 \|\| ^19.0.0`, `jsx: react-jsx`); 081 does not touch `ExternalMcpAdmissionsBanner.tsx` or `ExternalMcpSettingsPanel.hooks.tsx`." |
| 082 | APPROVE | Anchors OK (`use-external-mcp-admissions.hooks.ts:78,324`; `use-external-mcp.hooks.ts:70`). Mutation `M-bind-restart-to-read-permission` kills the owner/permission guard. Runs after a1 T35 (a1 edits `:15,327` of the same file first; it does not move it). |
| 083 | FIX | Replace "adapting the old positional signatures on the binder side if needed" with: "The old positional calls at `ExternalMcpSettingsPanel.tsx` for the wired source-config list and saved-allowed-tool-names hooks are adapted ONLY in 084's binding with closures `(args) => hook(args.sources)` and `(args) => hook(args.savedAllowedToolNamesById)`; the Jini panel calls only the named-object forms." Add third mutation `M-write-patch-wrong-connection` (test: two connections each with a tool; "Allow write" on A must patch only A's tool; mutation applies the patch to the first connection). |
| 084 | FIX | Replace "Use a real component such as `F/settings/external-mcp-settings-panel.binding.tsx` if needed" with "Create `F/settings/external-mcp-settings-panel.binding.tsx` unconditionally and have `Providers.tsx` render it". Delete the clause "The tests for `ExternalMcpSettingsPanel.hooks` at `:5` ... still target the A1/helper owner": a1 T35 deletes that file; write "`ExternalMcpSettingsPanel.hooks.unit.test.tsx:5` was already repointed to the Jini leaf by a1 T35; do not touch it." |
| 085 | FIX | Add third mutation `M-mark-saved-unverified-connected` (test: save succeeds, verify not run -> row status must not be `connected`; the sheet states this rule but names no mutation). Add: "`usePublishCredentials` returns no field containing the submitted token; a test asserts a sentinel typed into the draft is absent from the controller return after save." Replace "Use the J16 descriptor/field shape rather than a new catalog" with "import the J16 types from `./../rules.js` (same package)". |
| 086 | APPROVE | Anchors OK (`use-publish-credentials.hooks.ts:445`; `publish-credentials-dependencies.hooks.ts:13,23`). `M-forward-raw-draft-error` kills the redaction guard; "no client read for submitted secret" is explicit. Note drift: `lib/admin-http/request.ts` gained `requestFailedMessage` (still passes `redactSecretShapes`); no effect on `describeApiError` import. |
| 087 | FIX | Replace "the existing fields from `admin:deployment/api/deployment-api.types.ts`" with "types from `@jini-ai/core` and the J16 descriptor leaf only; devops must NOT import `@jini-ai/admin` (inverted layering)". Replace "`schedule` shape from 081, structurally declared here" with "declare `type Schedule = ({ delayMs, run }: { delayMs: number; run: () => void }, _optional?: Empty) => () => void` locally in `use-static-export.hooks.ts` and re-declare identically in `use-static-publish.hooks.ts`; no import from mcp". |
| 088 | FIX | Replace "Rehome or replace the refresh source pin at `content-refresh-coverage.unit.test.ts:77`" with "Replace it with a behavioural witness: render `useWiredStaticExport` and assert a content-refresh event reseeds from the port without replacing an active run". Anchors `useWiredStaticExport:267`, `useWiredStaticPublish:394` OK. |
| 089 | FIX | (1) Replace "`:379,434–end` and its preceding private view helpers" with "`StaticSiteTab.tsx:1-1422` except the host-only imports (`StaticSiteTab.hooks` translator, host i18n, CSS); file is 1422 lines". (2) Replace "`RenderPublishRunResult` or the same-package existing `PublishRunResult`" with "the existing `devops:deploy/react/PublishRunResult`". (3) Add secret witness + mutation: test types sentinel into the token input and asserts input `type="password"`, no `value` echoed into any `data-*`/aria-label/agent handle, and fact text copy contains no token; mutation `M-render-token-in-copyable-fact`. |
| 090 | APPROVE | Mutation `M-map-static-tab-to-overview` real. `panel-pages.ts:60`, `Deployment.tsx:9,60`, `size-debt.json:40` UNVERIFIED (not opened). |
| 091 | FIX | (1) Before creating `cms:react/pages/rules.ts`: `rg -n "pagePublicPath" packages/admin/src/pages/Pages.tsx`; Jini already has `admin:pages/page-editor-rules.ts` (`THEME_DEFAULT_SENTINEL:98`, `pickerValueToChoice:109`, `buildPageSavePlan`, `pageVersionConflictMessage`, `pageAutosaveStaleBasisMessage`). Add: "Do not re-create `THEME_DEFAULT_SENTINEL`; `pagePickerValue` takes `defaultSentinel` from the caller and the 092 binder passes admin's constant." (2) State where `shellTemplates` comes from: "`shellTemplates: readonly string[]` is the host's two canonical page-shell filenames passed by the 092 binder; Jini hard-codes none." (3) Tovu `pagePickerValue` today is `({ templateChoice, availableTemplates })` (rules.ts:215) -- 092 must repoint every caller to the 4-key form. |
| 092 | FIX | Replace "Move `useWiredPageEditor:1299` there or into a sibling `page-editor.binding.hooks.ts` if needed" with "Move `useWiredPageEditor` (use-page-editor.hooks.ts:1299) into new `F/pages/hooks/page-editor.binding.hooks.ts`". Anchors OK (`rules.ts:97,113,215`; `use-page-editor.hooks.ts:81,1299`). |
| 093 | APPROVE | Mutations `M-mount-before-canvas-ready`, `M-skip-interactive-flush-on-view-switch` real; slots all injected. |
| 094 | FIX | Replace "to the neutral view with explicit collaborators or the bound component when exercising actual Tovu theme wiring" with "`PageEditor.unit.test.tsx`, `PageEditor.preview-remount`, `PageEditor.preview-youtube`, `PageEditor.interactive-flush` import the NEW BOUND `page-editor.binding.tsx`; `theme-preview-dirty.unit.test.tsx:7` imports the bound one too". Replace "Move the lazy witness ... to the new module split" with "change the dynamic import specifiers at `admin-route-lazy-loading.unit.test.tsx:24,62` from `features/pages/PageEditor` to `features/pages/page-editor.binding`". |
| 095 | FIX | Range `:398–565` is wrong: `features/posts/rules.ts` has 563 lines. Write `:398–563`. Add literal signature `postRowMenuItems<Row>({ post, handlers, t }: { post: Row; handlers: PostRowMenuHandlers<Row>; t: Translate }, _optional: Empty = {})`. |
| 096 | FIX | Replace "Retain both code paths when the test at `rules.unit.test.ts:19` covers a mixture" with "Split `rules.unit.test.ts`: assertions on moved rules import the Jini leaf; assertions on toolbar constants, drag/drop, FileReader and theme override select stay importing `../rules`". |
| 097 | FIX | Replace "Inject shared compare/label functions if supplied by the Admin kit today" with "`Posts` takes required props `compareDates({ a, b }, {})` and `labelFor({ key }, {})`; the 098 binder supplies the kit's current functions". Anchors OK (`use-posts.hooks.ts:62`, `Posts.tsx:30`). |
| 098 | FIX | Replace "must target the real enabled module if it was relying on warming the list, not a new barrel" with "change `app-admin-assistant-dock-visibility.unit.test.tsx:14` to `import \"../../features/posts/posts-list.binding\"` (UNVERIFIED path depth: confirm it resolves)". `useWiredPosts:245` OK; `F/posts/index.ts:9` and `panel-pages.ts:23` UNVERIFIED. Mutation `M-bind-trash-as-permanent-delete` kills the deletion guard (trash, not purge). |
| 099 | FIX | Delete "The K5 prerequisite is local to this sheet." (no K5 exists in any sheet). Add mutations `M-proceed-from-superseded-plan` (a response from a superseded request/unmounted dialog reaches `executePublish`) and `M-skip-change-of-plan-refusal`; the sheet requires both fences but only names three other mutations. Anchors OK (`:1` six `@tovu/publish-content-ui` imports verified; `:63`, `:1289`); the six CMS replacements exist (`cms/src/publish/content/ui/{criteria,sections,report-rows,replan}.ts`). `executePublish` fence line UNVERIFIED (hook body not opened). |
| 100 | FIX | Replace "If those values are private there, expose one deliberate host-owned `publishContentDialogPolicy`..." with unconditional text: "Create `F/publish-content/publish-content-dialog-policy.ts` exporting `publishContentDialogPolicy: { policy: PublishReportPolicy; sections: readonly PublishSection[]; typeAliases: Record<string,string>; driftMessage: ... }` built from `@tovu/publish-content-ui`; types come from `@jini-ai/cms/publish/content/ui`." Keep alias entries (`tsconfig.json:17`, `vite.config.ts:168`, `vitest.config.ts:93`) UNVERIFIED. |
| 101 | FIX | Replace "Split any over-cap report group out of `:307–438`" with "Extract `:307–438` into private components `PublishContentReportGroup` and `PublishContentReportRowsList` in the same file (the dialog function is ~360 lines)". Mutations `M-wire-overwrite-checkbox-to-inclusion`, `M-allow-close-while-executing` kill the distinct-consent guard. Anchors OK (`:77`, `:107`, `:121`). |
| 102 | APPROVE | `App.chrome.tsx:12,242-248`, `App.tsx:55` UNVERIFIED but low risk; `M-resolve-request-at-dialog-open` real. |
| 103 | FIX | (1) `source-control-api.types.ts:54` is WRONG: `AdminSourceControlConnectionInput` is now at line 57 (Jini drift +3). (2) Replace "retaining the current query/category defaults in the host or in typed options according to today's caller" with "`useOtherCredentials` options are `{ filter: { query: string; category: AccessTokenCategoryId } }`; defaults live in the 104 binder". (3) Replace "an exhaustive `Record<OtherCredentialStoreId, StoreReader>` only when all four ports are present; otherwise guard" with "always build a `Record<OtherCredentialStoreId, StoreReader>` with all four entries; the host port type requires all four". (4) Add mutations `M-forward-raw-submit-detail` (`classifyAccessTokenSubmitError` `validation.detail` must be passed through `credentialDraftError`/draft-safe copy; test with sentinel token echoed in a server detail) and `M-clear-secret-on-load-failure-of-other-store`. (5) Reuse: `credentialDraftError` already exists at `admin:security/credential-failure.ts` -- inject it, do not copy. |
| 104 | FIX | Replace "Reuse current Jini `access-token-rows`, provider/form, media-catalog, and 'works for' leaves via these collaborators" with a list of exact package leaves: run `rg -n "access-token-rows\|media-catalog" packages/*/src --glob '!**/node_modules/**'` and write the found paths into the sheet before building (UNVERIFIED: not located in this review). Anchors OK (`use-access-tokens.hooks.ts:911`, `use-other-credentials.hooks.ts:412`, `other-credential-stores.ts:51`). Mutation `M-bind-remove-to-another-store` kills the owner/store scope. |
| 105 | FIX | Replace "Use a local DOM ref combined with the forwarded handle, or pass `closeDialog({} , {})` from the actual DOM owner as a required action" with "pass `closeDialog({}, {})` from the DOM owner as a REQUIRED action to `useRemoveConfirmDialog` and `useOtherCredentialRemoveDialog`; no ref cast, no local ref merge". Mutations `M-delete-before-confirm`, `M-render-token-in-agent-label`, `M-discard-other-store-filter` cover confirmation and no-secret handle. |
| 106 | FIX | Replace "follow the responsible owner" (for `F/users/E/Users.autofill.unit.test.tsx:16`, literal-copy pins, hardwiring/size debt) with "repoint `Users.autofill.unit.test.tsx:16` source pin to the Jini `AccessTokensTab.tsx` path (`packages/integrations/src/react/credentials/AccessTokensTab.tsx`); update `admin-literal-copy.baseline.json:288,295,302,309,316` and `hardwiring-debt.json:34`, `size-debt.json:208,215,222` by removing entries whose source moved". |
| 107 | FIX | Move destination from `integrations:react/credentials/Security.tsx` to `admin:security/react/live/Security.tsx` (export `@jini-ai/admin/security/react/live/Security`, `jini.entries` browser): TOTP / recovery codes / passkeys / site-key are the security domain, not vendor integrations, and `admin:security` already owns `SecurityPage`, `security-permissions-port.hooks.ts`. (If owner rejects, see owner Q1.) Anchors OK (`Security.tsx:101,115,140,141,151,196`). Mutation `M-trust-query-over-permission` kills the owner-only guard; also add `M-render-site-key-body-when-denied` (button hidden but body mounted). |
| 108 | APPROVE | Guard order unchanged (permission read at `Security.tsx:140` before tab resolve at `:141`). `M-mount-site-key-for-unprivileged-principal` real. If 107's destination changes, import path in `security.binding.tsx` follows it. |
| 109 | FIX | Add: "After moving, `rg -n resolveByokFooterStatusLine packages/integrations/src/react/admin-credentials`: J04's `AdminByokKeyPanel.tsx` must import it from `./byok-footer-status.js` (or receive it as a required prop) -- J04 does not mention it, and Tovu `components/AdminByokKeyPanel.tsx:6,126` calls it today." Fix anchor in 110: import is at `AdminByokKeyPanel.tsx:6`, call `:126` (not `:9`). Move the doc block at `use-admin-execution-credential.hooks.ts:25-40` with the function. Anchors OK (`:23`, `:39`, `:98`). |
| 110 | APPROVE | `M-clear-legacy-on-refusal` kills the write-only/refusal guard; write-only preserved (no hydration of plaintext). |
| 111 | APPROVE | Order of operations matches Tovu `settings-tabs.ts:306-322` exactly (marker + live withdrawal BEFORE durable write, grant event only after metrics key written, remaining keys afterward); mutations `M-signal-grant-before-ledger-write`, `M-delay-live-withdrawal-until-success` pin it. Neutral: key `jini:metrics-withdrawal` stays host-side. Anchors OK (`:35,173,259,266,308,326`). |
| 112 | APPROVE | `M-treat-denial-marker-as-consent` kills the fail-closed guard; "do not emit a grant because marker could not be read or cleared" explicit. Long importer ledger not fully verified. |
| 113 | FIX | Copy the why-comments in `execution-settings.ts:1-79` (file header items 2 and 3: "Write-only means no read-back" and "The key must survive a RELOAD") into the header of `execution-settings-ledger.ts` in neutral wording (they explain the moved `apiKey: ""` projection at `:257,308` and `reconcileExecutionConfigRefresh:531`). Add `M-persist-api-key-via-previous-config`. Anchors OK (`:80,112,194,214,252,264`). |
| 114 | FIX | Anchor `components/AssistantDock/hooks/execution-config-ledger.hooks.ts:9` may be gone: a1 T21 moved/deleted it ("Delete the host ledger implementation"). Add: "skip any listed file that a1 T21 deleted; repoint its Tovu composer instead". Keep `LEGACY_CREDENTIALS_STORAGE_KEY:118`, `loadAdminExecutionCredential:194`, `DEFAULT_EXECUTION_CONFIG:252`, singleton `:535` in Tovu (verified). ~60 test anchors UNVERIFIED. |
| 115 | APPROVE | No secret/auth surface; mutations real. `SettingsUi.tsx:143` OK. |
| 116 | APPROVE | Legacy redirects `?tab=skills`/`?tab=appearance` stay replace-navigation; no authorization/secret changes. `SettingsUi.tsx:290,294` OK. |

## Anchors checked
OK: `use-external-mcp-admissions.hooks.ts:43,78,110,324`; `use-external-mcp.hooks.ts:70,282`; `use-publish-credentials.hooks.ts:84,121,445`; `use-static-export.hooks.ts:53,267`; `use-static-publish.hooks.ts:56,394`; `publish-credentials-dependencies.hooks.ts:13,23`; `Security.tsx:101,115,116,140,141,151,196` (SECURITY guard `canManageSiteKey`); `use-admin-execution-credential.hooks.ts:23,39,98`; `access-token-forms.ts:21,45,68,82,93,117,125,143`; `other-credential-stores.ts:7,26,51,93,101,121,130,139,154`; `use-access-tokens.hooks.ts:911`; `use-other-credentials.hooks.ts:46,412`; `execution-settings.ts:80,118,194,216,252,264,535,543,547`; `settings-tabs.ts:35,173,259,266,308,326`; `PublishContentDialog.tsx:77,107,121`; `use-publish-content-confirm.hooks.ts:1,63,1289`; `PostEditorNotices.tsx:33,46`; `posts/rules.ts:36,107,398`; `pages/rules.ts:97,113,159,215`; `use-page-editor.hooks.ts:81,1299`; `use-posts.hooks.ts:62,245`; `Posts.tsx:30`; `StaticSiteTab.tsx:379,434`; `AccessTokensTab.tsx:89`; `OtherCredentialsSection.tsx:41`; `SettingsUi.tsx:143,290,294`; `ExternalMcpSettingsPanel.tsx:157,487`.
WRONG: `posts/rules.ts:565` (file has 563 lines); Jini `admin/src/source-control/api/source-control-api.types.ts:54` (now :57); `AdminByokKeyPanel.tsx:9` in sheet 110 (import at :6, call :126).
UNVERIFIED (not opened): the long test/importer ledgers in 082, 084, 090, 098, 100, 102, 104, 106, 112, 114; `panel-pages.ts` line numbers; `development/scripts/*-debt.json` lines; `execution-config-ledger.hooks.ts:9` (probably deleted by a1 T21).
Drift since sheets: Tovu `source-control/hooks/use-source-control-credentials.hooks.ts` gained `providersNotice` (no effect on 085/103 which only cite it as a rationale reference); `lib/admin-http/request.ts` gained `requestFailedMessage` (redaction via `redactSecretShapes` retained); Jini `shell/lib/admin-http/request.ts` and `source-control-api.types.ts` (+3 lines) moved, only the latter affects an anchor.

## Cross-set / duplicate findings
- No overlap with round-1 `w3-ext-a.md` or `w3b-ext-a1.md` on a moved file. 081-084 do NOT move a file J35/T35 moves: J35 moves `ExternalMcpAdmissionsBanner.tsx` and `ExternalMcpSettingsPanel.hooks.tsx`; 081-084 move the two hooks and the panel. a1 T35 edits `use-external-mcp-admissions.hooks.ts:15,327` and `ExternalMcpSettingsPanel.tsx` before 081-084 delete/move them, so order must be a1 first (the sheets say so only implicitly; the FIX for 081 states it).
- `lib/execution-settings.ts`: a1 T21 only binds defaults/namespace and "deletes the host ledger implementation" (ambiguous wording but it refers to dock hooks); 113/114 are the only sheets extracting the ledger from `execution-settings.ts`. No duplicate.
- Existing Jini code already present: `admin:security/react/tabs/AccessTokensTab.tsx` (59 lines, module-kit) and `admin:security/host/hooks/access-tokens-port.hooks.ts`/`other-credentials-port.hooks.ts`; sheets 103/105 knowingly create a second, richer `AccessTokensTab` in integrations (see owner Q2). `admin:pages/page-editor-rules.ts` already has `THEME_DEFAULT_SENTINEL`, `pickerValueToChoice`, save-plan/message helpers (091 must reuse; fix given). `cms:publish/content/ui/*` already exports the six functions 099 needs.
- 109 vs round-1 J04: J04 moves `AdminByokKeyPanel.tsx`, which calls `resolveByokFooterStatusLine` (Tovu `AdminByokKeyPanel.tsx:126`); J04 does not mention where it comes from. 109 fix covers the repoint.
- Layering: 087 as written could import `@jini-ai/admin` types into devops (inverted); fixed in the table.
- Package prep: mcp has no React peer at this tip (`packages/mcp/package.json` has no `peerDependencies`) and integrations has no react peer; a1's convention ("first React leaf in agent-plugins, plugins, integrations, mcp uses the CMS precedent") supplies it, so a2 correctly depends on a1 having built J35 and J04 first.

## Summary
These 18 pairs move Tovu admin's External MCP admissions/connection controllers and panel into `mcp:react/external-mcp`, publish-credential / static-export / static-publish controllers and the Static Site tab into `devops:deploy/react`, page editor rules/controller/view and post rules/notices/list and the publish-confirmation controller/dialog into `cms:react/{pages,posts,publish-content}`, credential rules/controllers/Access Tokens tab/other-credential rows into `integrations:react/credentials`, the BYOK footer rule into `integrations:react/admin-credentials`, and the settings/execution ledgers plus settings page layout into `admin`. Tovu keeps real binders (live ports, query provider, copy, clocks), not re-export shells. The security-critical guards survive: owner-only Site key affordance (permission read before tab resolve), write-only BYOK (api key never persisted/echoed; header why-comments must move with 113), privacy withdrawal ordering, delete-confirmation and publish-confirmation fences; each has a named mutation, with the gaps patched in the table (secret-echo, unverified-saved-row, superseded-plan fences, wrong-connection grant). The sheets are generally precise; the 25 FIX rows are mostly literal-text repairs where Sol would have to choose ("or", "if needed", "any over-cap", a phantom "K5"), three wrong line anchors, one inverted-layering risk (087), one probable stale file (114), and the Security shell's placement. Biggest structural risk is Jini ending up with two Access Tokens implementations (admin module-kit and integrations live port). No REJECTs; all moves are real and not duplicated in Jini or other sheets.

## NEW owner questions
1. Where should the Secrets shell (`Security.tsx`, slots for Access Tokens / Site key / TOTP / recovery codes / passkeys) live? Sheet 107 says `integrations:react/credentials`. Recommend `admin:security/react/live/Security.tsx` (security domain, slot-only, admin already owns the permissions hook and SecurityPage); integrations keeps only vendor-credential tabs.
2. Jini will carry two Access Tokens UIs (admin module-kit 59-line `AccessTokensTab` and the integrations live-port 1070-line one). Recommend yes for now; add a follow-up ticket to retire the admin module-kit variant once Tovu consumes the integrations one.

---

# Set: w3b-ext-w1 (9 sheets) — checked by the coordinator directly

**Set-wide defect (affects J19–J22, J24, T18, T20).** The sheets depend on round-1 ext-w1 **J01/T01, which were REJECTED** (X1). They use "J01's `refuseUnexpectedKeys`", a `createHumanConfirmationKit` type (no such symbol exists anywhere at the tip; it was J01's invention), and "W1 T01's real `approvalToolHandler`". Round 1 kept ext-crp CRP-01/02 instead, and CRP-02 moves only `contracts/core/human-confirm.ts:66–141` to daemon. So `humanConfirmedToolHandler` (`:182`), `approvalToolHandler` (`:205`) and `refuseUnexpectedKeys` (`:252`) **stay in Tovu**, and CMS and DB depend only on `@jini-ai/core`. Jini already shows the right seam: `cms/src/comments/tool-registrations.ts:258` and `cms/src/taxonomy/tool-handlers.ts:216` take `refuseUnexpectedKeys` as an **injected dependency**.

**Global fix G-W1 (add to J19, J20, J21, J22 and T18).** "Every CMS deps object that needs input-key refusal gets `readonly refuseUnexpectedKeys: (input: Record<string, unknown>, allowed: readonly string[]) => void` (the exact shape of `cms/src/comments/tool-registrations.ts:258`), and every call site becomes `deps.refuseUnexpectedKeys(value, [...])`. T18 binds it to `refuseUnexpectedKeys` from `#src/contracts/core/human-confirm`. Replace every `ReturnType<typeof createHumanConfirmationKit>["approvalToolHandler"]` with a CMS-local structural type in `cms:asset-transfer/copy-tool`:
```ts
export type AssetApprovalToolHandler = <TPrepared>(
  required: {
    surfaces: HumanConfirmSurfaceDeps;
    prepare: (required: { ctx: ToolExecutionContext }, optional: ToolExecutionOptions) => Promise<TPrepared>;
    describe: (required: { ctx: ToolExecutionContext; prepared: TPrepared }) => HumanConfirmSpec | Promise<HumanConfirmSpec>;
    run: (required: { ctx: ToolExecutionContext; prepared: TPrepared; confirmer: HumanConfirmer; choice?: string }, optional: ToolExecutionOptions) => Promise<unknown>;
  },
  optional?: { flag?: string; batch?: boolean },
) => ToolHandler;
```
`HumanConfirmSurfaceDeps` comes from core `contracts/site/daemon-surface-exchanges` (CRP-02.J puts it there). Copy `HumanConfirmSpec`/`HumanConfirmer` from wherever CRP-01/02 place them in core. Replace "W1 J01"/"W1 T01" prerequisites with "round-1 ext-crp CRP-01/CRP-02 (J and T)". Keep "W1 J12/T11" (not rejected)."

## Verdict table
| sheet id | verdict | exact fix text |
|---|---|---|
| J19 | FIX | G-W1. Also: (1) **Duplicate of ext-w2a J14** (same source, same destination `cms:media/site-import/tool-registrations`). Keep J19 and reject w2a J14. Fold w2a J14's pin "storage content-type refusal cannot become success" (mutation `ignore-content-type-write`) into J19's test list. (2) `cms/src/media/site-import/agent-tools.ts` (the catalog factory) already exists: the registrar indexes the catalog the host builds from it. Do not create a second catalog file. Anchors OK: `fetch-image.ts:155`, `import-video-conversion.ts:141`, `site-file-request.ts:71`, `fs-files.ts:219`. |
| J20 | FIX | G-W1 (`asset-destinations.ts:47` calls `refuseUnexpectedKeys(value, ["kind","themeId","path"])` before authorization; keep that order). Anchors OK: `:45–54` scope and permission path, including the picked/library/theme mapping. |
| J21 | FIX | G-W1. `AssetBatchApproval.approvalToolHandler: AssetApprovalToolHandler`. Prerequisites "J19–J20, round-1 ext-crp CRP-02, round-1 ext-w1 J12". |
| J22 | FIX | G-W1 ("Use `refuseUnexpectedKeys` from J01" becomes `deps.refuseUnexpectedKeys`). Type-only import of `AssetApprovalToolHandler` from `cms:asset-transfer/copy-tool`. |
| T18 | FIX | G-W1. "Requires J19–J22 and W1 T01/T11" becomes "J19–J22, CRP-02.T and W1 T11". Bind `approvalToolHandler` and `refuseUnexpectedKeys` from `#src/contracts/core/human-confirm` (they stay there after CRP-02.T). Also reject w2a T14 (its cutover of the same file). |
| J23 | APPROVE | **Duplicate of ext-w2a J15** (same `media-generation/tool-registrations.ts`). Keep J23, which has the literal port types and the credential-precedence code, and reject w2a J15/T15. Security is right: a saved-credential read error never falls to env or another provider (`readSavedCredential ?? env` with no catch). Anchors OK: `host-media-providers.ts:20–22`, `tool-registrations.ts:443–448` (the metadata-only fallback). |
| T19 | APPROVE | Keeps the guarded dispatch (`nodeMediaGuardedFetch`) on vendor requests and asset downloads, and the nonconverting upload. Named mutations cover both. |
| J24 | REJECT | **Duplicate of ext-w2b 72** (same `features/recovery/tool-registrations.ts` going to the same `db:recovery/tool-registrations`). J24 is built on the rejected J01 (`createHumanConfirmationKit`). 72 uses a host-supplied `confirmedRestore` adapter instead, so DB needs no daemon or host edge. **Keep 72/73.** Before deleting J24, copy into 72's test list: "denied plan cannot reach the unavailable-capability branch" (`capabilities-before-authorize`), "the card's point and plan pair reach confirm and execution unchanged" (`confirm-different-plan`), `execute-outside-shared-lock`, `wire-duplicate-create`, and J24's port table, as the literal `RecoveryToolHost` signatures. |
| T20 | REJECT | Superseded by ext-w2b 73 (same reason). Copy into 73: "a held migration lock blocks the confirmed restore before redemption, while recovery status reports the held lock", plus mutations `bind-private-recovery-surface` and `lose-confirm-abort-signal`. Also the live-reference cleanups: `F/database/tool-registrations.ts:97`, `F/deployments/{publish-agent-tools.ts:872–873,tool-registrations.ts:37}`, `check-architecture.baseline.json:95`. |

## Anchors checked
OK: `media-import/fetch-image.ts:155`, `media/import-video-conversion.ts:141`, `fs-files/site-file-request.ts:71`, `fs-files/fs-files.ts:219`, `asset-transfer/asset-destinations.ts:45–54`, `recovery/tool-registrations.ts:62–65,124`, `contracts/core/operation-lock.ts:5` (one shared host singleton), `gated-mutations/gateway.ts:171,184`, `media-generation/host-media-providers.ts:20–22`, `media-generation/tool-registrations.ts:443–448`, `contracts/core/human-confirm.ts:182,205,252`. Destinations absent at the tip (no earlier copy): `cms/src/asset-transfer`, `db/src/recovery/tool-registrations.ts`. `cms/src/media/{site-import,site-generation}` exist with catalog files only.

## Summary
This set moves the media import, asset-destination, file-copy and image-transform tool registrars into CMS, image generation into CMS, and recovery into DB. Tovu keeps the guarded HTTP client, roots, conversion, theme writer and archive reader as bindings. The security design is good: authorize before any source I/O, egress refusals reduced to a caller-safe error, saved credentials never silently replaced by env, one batch prepared before the approval card and written unchanged after it, and recovery still planned as the agent, confirmed as the human, and executed under the one shared lock. The blocking defect is the set-wide dependency on round-1 J01/T01, which were rejected. The fix injects `refuseUnexpectedKeys` (as Jini CMS already does) and types the approval handler structurally. Two pairs duplicate other w3b sets: J19/J23 duplicate w2a J14/J15 (keep w1), and J24/T20 duplicate w2b 72/73 (keep w2b).

## NEW owner questions
None beyond the cross-set picks above. Those are mechanical; the recommendation is recorded in the cross-set section of the main report.

---

# Set: w3b-ext-w2a (35 sheets: J10-J26 = 17, T10a/T10b/T11-T26 = 18)

> **Coordinator overrides:** Y1 replaces this set's proposed "P0 move `refuseUnexpectedKeys` into core". Every sheet here that needs it (J12, J14, J18, T10a, T18) injects it as a dependency instead (ext-w1 G-W1 text). J14/T14/J15/T15 REJECT stands (Y3).

Checked read-only against Tovu `724ddc31a` and Jini `d252dc62b`. Counts: APPROVE 10 / FIX 21 / REJECT 4 / NEEDS-OPUS 0.

Drift since the sheets were written:
- No file in the w2a source dirs changed in Tovu (`features/{media,media-import,media-generation,newsletter,pages,post,plugin-runtime}`).
- Only `entries/widgets/trash` `publish-content.ts` and `trash-item-tool.ts` moved, and w2a does not touch them.
- In Jini, `cms/src/core/mutation-actor.ts` gained `requiredMutationActor`/`MissingMutationActorError`.
- In Jini, `cms/src/publish/content/repo-handler.ts` gained `applyRunActor` (appended at ~:441, plus two imports at the top, so earlier line anchors there shift by +2).
- This matters for J16 and J24 (see below).

## Verdict table

| sheet id | verdict | exact fix text |
|---|---|---|
| J10 media credential set / vault adapter / memory writer | FIX | Add tests-first: in `media/site/__tests__/provider-credential-vault.test.ts`, "a row whose kind, ownerKey, principalId or binding differs from the policy is refused with `VaultError({code:'context'})` on list, read, replace and delete, never mapped to a record". Mutation `trust-row-owner-key` (compare against `row.ownerKey` instead of `policy.ownerKey`). The source guard is `provider-credential-vault.ts:59-65` (`ownedProviderId`) plus the `ownerKey` filters at `:16` and `:27`. Add: "`ownerKey` literal `"tovu"` must not appear in any Jini file; it exists only in T10b's `mediaCredentialVaultPolicy`." Add an order line: "J10 and T10b land BEFORE `w3b-ext-w1` J23/T19 (see cross-set)." No overlap with w2b 79 (different file and package; do NOT import `integrations` from `cms`). |
| J11 owner-scoped attachment reader | FIX | Placement: the sidecar format (`SIDECAR_DIRECTORY_NAME = '.records'`) and `isUnchangedAttachment` are owned by Jini daemon (`daemon/src/http/attachment-persistence.ts:27`, `attachment-records.ts`). Tovu's reader re-declares `.records` at `read-chat-attachment.ts:116`. Put the module at `packages/daemon/src/http/attachment-owner-read.ts`, exported from `@jini-ai/daemon/http`, importing `SIDECAR_DIRECTORY_NAME` and `isUnchangedAttachment` directly. Then drop the `sameAttachment` and `AttachmentPathPorts` ports (keep `AttachmentReadPorts` for fs I/O only). CMS J12/J13 keep taking a `readAttachment` port. If the owner insists on CMS, keep the sheet as written but import nothing from the daemon and add a test pinning `".records"` equals the daemon constant. Add mutations: `skip-sidecar-dirname-containment` (the `dirname(sidecarPath) !== sidecarDirectory` check at source `:359`) and `skip-pre-open-observation` (the `observeAttachment` lstat/realpath at `:232-250`). Keep the existing order: ref pattern, upload root, sidecar, owner (`:362`), size cap (`:364`), then lstat/realpath, identity, open with NOFOLLOW, descriptor re-check. |
| J12 promotion and Library save | FIX | Replace "Requires first-pass Website 1 J01's `refuseUnexpectedKeys`" with "Requires prerequisite P0 (core `refuseUnexpectedKeys`, see owner Q2)". ext-w1 J01 is REJECTED (X1), so it never lands. |
| J13 video preview | APPROVE | Anchors OK. Permission-before-lookup and creator-vs-blob mutations are named. Needs T11's reader port by injection only. |
| J14 guarded media import/replace | REJECT | Same source file and same destination subpath (`cms:media/site-import/tool-registrations`) as `w3b-ext-w1` J19/T18, with a different, incompatible port design. w1b says the "media-import row repeated in W2 is the same source and should not be dispatched twice". w1b owns it. Before deleting J14, copy these pins into w1b J19's tests-first if absent: `read-source-before-permission` (denied replacement makes no source call), `return-raw-egress-message` (caller sees only the safe egress message), `ignore-content-type-write`. |
| J15 image generation | REJECT | Same source, same destination subpath and same new Tovu file (`F/media-generation/generation-host.ts`) as `w3b-ext-w1` J23/T19. w1b owns it. Copy these pins into w1b J23/T19 tests-first if absent: `catch-open-as-absent` (an unreadable saved key never tries the environment), `use-built-in-only-model-list`, `skip-post-dispatch-abort`. |
| J16 media publish contributor | FIX | Order: build after `w3b-arch` #33 (P10-H2.PUBLISH.J), which edits `media/publish-content.ts:196-221` to thread the run's actor. Re-anchor the J16 source ranges after it. Add to the contributor: write the actor with `applyRunActor({ deps, principalId })` (`cms/src/publish/content/repo-handler.ts` ~:441) and keep `blobCreatedByPrincipal` attribution unchanged. Add test "an apply with no `mutationActor` refuses before any write", mutation `guess-actor-kind`. |
| J17 newsletter confirmation and subscriptions | FIX | Token entropy and digest are now injected, so Jini must fail closed. In `issueConfirmationToken`, after `deps.mintRawToken({})`, add: `if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error("mintRawToken must return 64 lowercase hex characters")`. Apply the same check to `deps.hashToken({ raw })` output before it is stored. Add tests "a short or non-hex minted token is refused before any row is written" and "a non-64-hex digest is refused", mutation `accept-weak-minted-token`. Keep the order at source `confirmation.ts:81-88`: resolve From, then supersede, then mint (`randomBytes(32)` at `:88`, `hashToken` at `:44`, TTL at `:25`). |
| J18 newsletter management and delivery registrars | FIX | Replace "a bound Website 1 J01 `approvalToolHandler`" with: "`NewsletterDeliveryHost.approvalToolHandler` is a REQUIRED host port whose signature is copied verbatim from the Tovu `approvalToolHandler` in `apps/website/src/contracts/core/human-confirm.ts` (types from `@jini-ai/core/contracts/site/human-confirm`). Nothing is imported from daemon." Replace "Website 1 J01" in the Requires line with "ext-crp CRP-02 (the delete/confirmation owner)". Keep the delivery-owner anchors: `delivery/tool-registrations.ts:33` (`ownerPrincipalId`), `:201` (recipient-field refusal) and `:206` (owner lookup). Add test "a model-supplied recipient field is refused before any lookup", mutation `accept-recipient-field`. |
| J19 page HTML store contracts | FIX | `core/src/contracts/site/page-html-store.ts` ALREADY EXISTS (73 lines; `PagesHtmlDocumentStoreScope`, `PagesHtmlDocumentStorePort`, `PagesHtmlDocumentStoreFactory`, `PluginEmbedDiagnostic`; `jini.entries` line 280 and `exports` line 1665 in `core/package.json`; typecheck test `__tests__/page-html-store.typecheck.ts`). Change "New core `@core/contracts/site/page-html-store` owns ..." to "EXTEND the existing file: add only `PageHtmlInverse` (from `F/pages/html-inverse.ts:16`) and the optional `restore?(required: { inverse: PageHtmlInverse; expectedVersion: number }, optional?: Record<string, never>): Promise<void>` method on the port (the Jini copy lacks it; Tovu's has it at `html-document-store.ts:~220`). Do not re-declare scope, factory or `PluginEmbedDiagnostic`. No new `exports`/`jini.entries` line is needed." In T19, add: "delete the duplicate declarations at `html-document-store.ts:157-229` and import them from `@jini-ai/core/contracts/site/page-html-store`". |
| J20 pages authoring catalog and handlers | FIX | Same correction: `@core/contracts/site/page-html-store` is extended (J19 fix), not created; J20 appends `PageHtmlOperation`, `PageHtmlWriteOutcome`, `RecordedHtmlWrites`, `RecordPageHtmlWritePort` to that existing file. Add a test that a region write and a full write both call the injected `editHtmlPermission` before `openStore` (the sheet's `use-content-write-for-region` covers region only; add `skip-permission-on-full-write`). |
| J21 plugin install source parsing | FIX | Add three mutations to tests-first in `runtime/__tests__/install-source.test.ts`: "a relative `source.path` is refused" (`skip-absolute-path-check`, uses the `isAbsolutePath` port); "`attachmentRef` with `kind: 'folder'` is refused" (`allow-attachment-for-folder`, source `install-source.ts:57`); "a ZIP larger than `maxBytes` is refused from `stat` before any `read`" (`skip-pre-read-ceiling`; the existing `skip-post-read-ceiling` covers only the second check). Note for Sol: this file does NO archive extraction; zip-slip is handled elsewhere and is out of scope here. In T21 add: delete rows `development/scripts/error-gate-debt.json:653` and `:658` (both point at `install-source.ts`). |
| J22 word-count hook | APPROVE | Anchors OK (`index.ts:52-59`; `count-words.ts` already in `packages/plugins/src/runtime/built-ins/word-count/`). Manifest stays in Tovu. |
| J23 content-analyzer worker entry | FIX | (1) Say literally: the new file imports `@jini-ai/plugin-sdk` (canonical; `PLUGIN_SDK_SPECIFIERS` in `plugins/src/host/plugin-format.ts:5-7`), replacing the current `@tovu/sdk` import at source `plugin.ts:15`. (2) Say literally that the executable imports the analysis by the BARE self-reference `import { analyzeContentWithSiteSlug, summarizeReport, tiptapToBlocks } from "@jini-ai/cms/seo/content-analysis";`, not a relative path, because the trusted-import allowlist is keyed on bare specifiers. (3) Add a test over the built output asserting `dist/seo/content-analyzer-plugin/plugin.js` contains exactly two bare specifiers (`@jini-ai/plugin-sdk`, `@jini-ai/cms/seo/content-analysis`). (4) Add to the Package section: "run the repo's undeclared-dependency check and add the narrowest allowlist entry for the virtual `@jini-ai/plugin-sdk` if it flags `cms`" (UNVERIFIED whether the guard flags it). |
| J24 post creation | FIX | Add literally: "`actor` stays OPTIONAL on `CreatePostOptional` (current behavior, source `post-create.ts:52`). Do NOT adopt `requiredMutationActor` or `MissingMutationActorError` from `cms/src/core/mutation-actor.ts` in this move." Keep `postEventActor({ actorId, actor })` at source `:232` before any write; the named mutations already cover it. Order note: build before w2b 64/65 (confirmed w2b 65 binds `create` over this `createPost`). |
| J25 post catalog | APPROVE | No file overlap with w2b 64 (post-tool-input/policy/deps/registrations/preview). Build J25 before w2b 64, because `createPostToolPolicy({ catalog })` consumes this catalog. |
| J26 content statistics | APPROVE | Explicit `content.read` gate before the post list plus separate family checks, with named mutation `count-family-before-auth`. Anchors not spot-checked beyond file length 173 (OK). |
| T10a reconcile Website 1 owners | FIX | Replace every use of "Website 1 J01/J02 host kit" / "Website 1 J01/T01 supplies the confirmation kit" (permanent-delete bullet, build contract) with "ext-crp CRP-02 (daemon `surface-exchanges/human-confirm`, `chat-delete-grant`)", because ext-w1 J01, J02 and T01 were REJECTED. Keep the guard order: post-click fresh delete-grant re-read (`skip-post-click-grant-read` from CRP-02). Add `R/tool-catalog-manifest.ts:718` as already stated. |
| T10b bind media credential policy, cut over stores | FIX | Importer ledger gaps. Add: `development/scripts/check-architecture.baseline.json:64-65` (two edges into `media/provider-credential-*`; delete them), `development/scripts/coverage-integrity-baseline.json:62` (`src/media/provider-credential-store.ts`; repoint or delete row), `features/media/INFO.md` (path text), and have Opus confirm `development/scripts/check-coverage-integrity.ts` and its `lcov` fixtures read no live path. Change "until T15" to "until `w3b-ext-w1` T19" (T15 is rejected). Owner key: define `"tovu"` once in `F/media/provider-credential-host.ts` and export it; if w2b 80's `vendor-credentials/vault-policy.ts` needs the same owner key, import from here (w2b builds later). `server/routes/route-deps/credentials-deps.ts` needs no edit (it imports only the contracts type at `:14`). |
| T11 attachment custody adapter | FIX | Follows the J11 fix: if the reader lands in daemon, T11 imports it from `@jini-ai/daemon/http` and binds only `openFile`/fs. Add to the repoint list: `server/inbound/admin-http/routes/assistant/__tests__/get-chat-attachment-failure.test.ts`, `server/runtime/composition/modules/__tests__/assistant-attachment-read.unit.test.ts`, `features/media/INFO.md`, the comment path at `server/runtime/composition/modules/assistant.ts:719`, and delete row `development/scripts/error-gate-debt.json:603`. |
| T12 promotion/Library binding | APPROVE | Depends on the J12 fix only. |
| T13 video preview binding | APPROVE | Needs T11. |
| T14 media import binding | REJECT | Superseded by `w3b-ext-w1` T18 (same cutover: `asset-destinations`, `copy-tool`, `image-transform`, `import-theme-file-tool`, and the same test repoints, all of which w1b names). Do not run. |
| T15 image runner binding | REJECT | Superseded by `w3b-ext-w1` T19 (same `generation-host.ts`). Do not run. |
| T16 media publish binding | FIX | Add: delete the edge row `development/scripts/check-architecture.baseline.json:74` (`media/publish-content.ts -> publish-content/type-registry...`). Add "requires `w3b-arch` #33 first" (J16 fix). |
| T17 newsletter sender, entropy, digest | FIX | Bind `mintRawToken` as exactly `({}, _optional = {}) => randomBytes(32).toString("hex")` and `hashToken` as exactly `({ raw }, _optional = {}) => createHash("sha256").update(raw).digest("hex")` from `node:crypto`, so J17's 64-hex check passes. Add a witness "the production-bound token is 64 lowercase hex". |
| T18 newsletter management and approval assembly | FIX | Replace "Requires J18, T17 and Website 1 T01" with "J18, T17 and ext-crp CRP-02.T". Bind the approval handler to the existing Tovu `approvalToolHandler` (host `contracts/core/human-confirm.ts`). |
| T19 scoped page statements | FIX | Add: delete duplicate declarations `html-document-store.ts:157-229` and import from core (J19 fix). DROP the bullet "`F/post/post-tool-deps.ts:28-33` derives its narrower duplicate-store shape from the core port" (w2b 61 moves those declarations to `core:contracts/site/cms-post-tools`). Add `development/scripts/check-architecture.baseline.json:82-84` (three edges from `pages/html-document-store(.memory).ts`) to be deleted with the old files. |
| T20 pages authoring binding | APPROVE | Depends on the J19/J20 fixes only. |
| T21 host install-source binding | FIX | Add the `error-gate-debt.json:653,658` row deletions (J21 fix). Otherwise OK. |
| T22 word-count registration | APPROVE | OK. |
| T23 installed analyzer entry and trust | FIX | Literal: in `content-analyzer/index.ts` compute `const ENTRY = realpathSync(fileURLToPath(import.meta.resolve("@jini-ai/cms/seo/content-analyzer-plugin/plugin")))` ONCE and use that same string for `entryPath`, `dirname(ENTRY)` for `sourceDir`, and the `trustedImports[].entryPath` in `worker.ts` (the policy is compared by path string; a pnpm symlink path and its realpath would silently mismatch). Opus check: `worker.ts:44-46` still lists `@jini-ai/cms/html/site/slug`, but the plugin dir at the tip holds only `index.ts`/`plugin.ts` and `plugin.ts` imports only `@jini-ai/cms/seo/content-analysis`. The slug entry looks vestigial; the sheet says keep exact, so keep it and flag it for Opus. Existing mutation `trust-by-package-directory` stays. |
| T24 repoint post creation | FIX | Add "build before w2b 63/65; those sheets re-anchor `post-tool-deps.ts`, `post-tool-duplicate.ts` and `tool-registrations.ts` imports edited here". No other change. |
| T25 post catalog binding | APPROVE | OK. |
| T26 content-stats repoint | APPROVE | OK. |

## Anchors checked

Verified OK:
- File lengths equal the sheets' end lines for every source (22 files): store 507, vault 149, memory 24, read-chat-attachment 369, promote 214, library 85, view-video 223, publish 298, media-import 451, media-generation 508, confirmation 194, subscriptions 182, newsletter/tool-registrations 596, delivery 232, pages/agent-tools 220, pages/tool-registrations 827, install-source 64, word-count 72, content-analyzer 59, post/agent-tools 429, content-stats 173, post-create 315.
- Security anchors OK:
  - `media/provider-credential-vault.ts:15-16,27,59-65` (ownerKey `"tovu"` literal, `ownedProviderId` context breach), `:125-127` (`deleteByProviderIds` calls overridden `replaceWorkspace`), `:139` (cross-workspace refusal).
  - `media/provider-credential-store.memory.ts:6-24` (`TurnLock` write serializer).
  - `media/read-chat-attachment.ts:99-103` (imports incl. `isUnchangedAttachment` from `@jini-ai/daemon/http`), `:116` (`.records`), `:232-250` (lstat/realpath), `:269-283` (`isRecordedOwner`, no-owner means nobody), `:304-325` (identity re-check, `O_NOFOLLOW`), `:341-369` (order: ref pattern, root, sidecar, owner, cap, read).
  - `newsletter/confirmation.ts:25` (72h TTL), `:44` (sha256 hashToken), `:81-88` (sender, supersede, mint order), `randomBytes(32)` at `:88`.
  - `newsletter/delivery/tool-registrations.ts:33,201,206` (owner id, recipient-field refusal, owner lookup).
  - `plugin-runtime/install-source.ts` (size checks before and after read, `Object.hasOwn` exclusivity, `kind !== 'zip'` refusal for attachment refs).
  - `plugin-runtime/built-ins/content-analyzer/plugin.ts:15-59` (imports `@tovu/sdk`, not the canonical specifier).
  - `server/runtime/plugin-tier2/worker.ts` policy block and `main`.
  - Jini `plugins/src/host/plugin-format.ts:5-7`, `plugins/src/runtime/sdk-resolver.ts:~92-105`.
- Jini: `cms/src/routing/site/reserved-paths.ts` exists (J24's `RESERVED_SEGMENTS` claim holds). `cms/src/media/site/provider-credential-contracts.ts` exists (J10). `plugins/src/runtime/built-ins/word-count/count-words.ts` exists (J22). `user-management/src/newsletter/` exists and has no `confirmation.ts`/`subscriptions.ts` yet (J17 is a real move).

WRONG:
- J19 "New core `@core/contracts/site/page-html-store`": the file already exists in Jini core (see table).

MISSING (importers or gate rows not named by any w2a sheet):
- `check-architecture.baseline.json:64,65,74,82,83,84`.
- `coverage-integrity-baseline.json:62`.
- `error-gate-debt.json:603,653,658`.
- `server/inbound/admin-http/routes/assistant/__tests__/get-chat-attachment-failure.test.ts`.
- `server/runtime/composition/modules/__tests__/assistant-attachment-read.unit.test.ts`.
- `features/media/INFO.md`.
- Already named by T23: `hardwiring-debt.json:76` (OK).

UNVERIFIED:
- Most per-test line numbers in the T sheets' repoint lists (T10b-T26): spot-checked only through `rg` file-list comparison for provider-credential, read-chat-attachment and install-source.
- J20 `html-region-ports` shapes (no existing `html-region-ports` in Jini: new, no collision).
- Whether the repo's undeclared-dependency guard flags the virtual `@jini-ai/plugin-sdk` import in `cms`.

## Cross-set / duplicate findings

- **w2a J14/T14 vs `w3b-ext-w1` J19/T18 (media import)**: identical source `media-import/tool-registrations.ts` and identical destination subpath `cms:media/site-import/tool-registrations`. w1b explicitly claims it. Keep w1b; REJECT J14/T14 (answer to the suspected overlap: confirmed).
- **w2a J15/T15 vs `w3b-ext-w1` J23/T19 (image generation)**: identical source, subpath and new file `F/media-generation/generation-host.ts`. Keep w1b; REJECT J15/T15 (confirmed).
- **Order J10/T10b vs w1b J23/T19**: w1b T19 calls `getMediaProviderCredentials`/`resolveMediaProviderCredential` with the "existing repo and sealer". After J10 those become Jini functions with `{ deps, workspaceId, ... }` signatures and a required `vaultPolicy`. Build J10 and T10b BEFORE w1b J23/T19, and rewrite T19's "uses `getMediaProviderCredentials`/`resolveMediaProviderCredential`" bullet to call the J10 shapes. T10b's edit of `media-generation/tool-registrations.ts:195-207,228` is deleted by T19, so T19 re-anchors.
- **w2a J19 vs w2b 61 (HTML-store contracts)**: not a duplicate once J19 is corrected. J19 keeps the full port/factory in `core:contracts/site/page-html-store` (already exists); w2b 61 keeps only the narrow `DuplicatePagesHtmlStore(Factory)` in `core:contracts/site/cms-post-tools`. w2a T19's bullet touching `post-tool-deps.ts:28-33` must go (w2b 61 owns it).
- **w2a J24/J25 vs w2b 64**: no shared file. J24 (`post-create`) and J25 (`post/agent-tools`) are not in 64, which handles input/policy/deps/registrations/preview. w2b 65 already says "bind `create` over the createPost selected by the W2a cutover". Keep both, build w2a first. T24/T25 edit imports in files w2b 65 later deletes, which is fine in that order.
- **w2a J10 vs w2b 79 (vault adapters)**: different files and packages (media provider vault in `cms` vs `vendor-credentials/vault-adapter` in `integrations`). Both host policies bind `createTovuVaultKinds`/ownerKey `"tovu"`; keep the owner key defined once (T10b fix).
- **w2a vs w2b 61-93 other**: `post-tool-deps.ts` and `html-document-store.noop-save.test.ts` repoints appear in both T19/T24 and w2b 63; build order w2a then w2b resolves it.
- **Rejected round-1 dependency**: w2a's "Website 1 J01/T01" (key refusal `refuseUnexpectedKeys`, `approvalToolHandler`, confirmation kit) points at ext-w1 J01/T01, which round 1 REJECTED in favor of ext-crp CRP-01/02. CRP-02 moves `requireHumanConfirm`, `requireAccessApprover` and `HUMAN_CONFIRM_CHOICE_PARAM`, but NOT the pure `refuseUnexpectedKeys` (`apps/website/src/contracts/core/human-confirm.ts:252-257`). So J12, J18, T10a, T18 and `w3b-ext-w1` J19 (`w3b-ext-w1.md:81`) depend on a helper nobody now owns (see owner Q2). The same applies to w3b-ext-w1's `approvalToolHandler` references.
- **Drift vs `w3b-arch` #33**: it edits `media/publish-content.ts:196-221` (the J16 source) to thread the actor; order it first.
- **Round-1 sheets**: no overlap found with `w3-ext-w2` (J01-J09; it lists these files only in its NOT-SHEETED inventory) or `w3-ext-w1` (same, NOT-SHEETED table rows 324/328 for media-import/generation).

## Summary

Seventeen Jini moves and eighteen Tovu bindings take the media credential vault and store, the attachment reader, promotion, video preview, newsletter confirmation and tools, page HTML store and authoring tools, plugin install parsing, the word-count and analyzer plugins, and post create/catalog/stats into `cms`, `user-management`, `plugins` and `core`. Four sheets are duplicates of `w3b-ext-w1` (media import J14/T14, image generation J15/T15). They share the same source files and subpaths with an incompatible design, so they are rejected and the w1b sheets keep them. The biggest correctness error is J19, which says to create a core `page-html-store` contract that already exists; it must extend it and add `PageHtmlInverse` and `restore?`. The biggest dependency error is the reliance on ext-w1 J01/T01 (key refusal, confirmation kit), which round 1 rejected, so a tiny owner for `refuseUnexpectedKeys` is needed. Security guards are all described, but several lack a named mutation: the vault owner/kind row check (J10), the sidecar containment and pre-open lstat/realpath (J11), the plugin absolute-path, attachment-for-folder and pre-read size ceilings (J21), and the newsletter delivery recipient refusal (J18). Token entropy moves from `randomBytes(32)` into a host callback, so Jini must reject anything but 64 lowercase hex (J17 fix). The chat-attachment reader should live beside the daemon code that owns the `.records` sidecar format, not in CMS (J11 fix). Several gate and baseline JSON rows and a few importer tests are missing from the T sheets, which would fail the repo gates once old files are deleted.

## NEW owner questions

1. Where should the owner-scoped chat-attachment reader live? The sidecar format, `SIDECAR_DIRECTORY_NAME` and `isUnchangedAttachment` are daemon-owned (`daemon/src/http/attachment-persistence.ts:27`, `attachment-records.ts`), and the Tovu reader re-declares `.records`. Recommend `@jini-ai/daemon/http` (new `attachment-owner-read.ts`) instead of `cms:media/site`, which also removes the `sameAttachment` and path ports.
2. Who owns the pure `refuseUnexpectedKeys({ input, allowed }, _optional = {})` after ext-w1 J01 was rejected? Recommend a one-function prerequisite P0: add it to `packages/core/src/registration-kit.ts` next to `requireInputRecord` (`:151`), exported from the existing `@jini-ai/core` root (no new subpath), keeping its message and `ToolInputError`. Leave Tovu's copy at `human-confirm.ts:252` until its 17 importers are repointed. Build P0 before w2a J12 and `w3b-ext-w1` J19.
3. May the analyzer trust list in T23 drop `@jini-ai/cms/html/site/slug`? It looks vestigial at the tip (only `plugin.ts` remains in the plugin dir). Recommend keep it unchanged in this cut and have Opus decide after the built-output specifier test passes.

---

# Set: w3b-ext-w2b (33 sheets, ids 61-93)

> **Coordinator overrides:** 72/73 KEEP recovery (Y2). Add to 72: runtime `node` (DB inherits node; not `universal`), Y1 injection of `refuseUnexpectedKeys`, and the pins/mutations copied from ext-w1 J24/T20.

Checked against Tovu 724ddc31a / Jini d252dc62b. Read-only. 4 APPROVE / 28 FIX / 0 REJECT / 1 NEEDS-OPUS. About 40 tool calls were used, so importer lists were only spot-checked (see UNVERIFIED).

Short names: `F/` = Tovu `apps/website/src/features/`, `R/` = `apps/website/src/server/runtime/composition/`, `J/` = Jini `packages/`.

## Global fixes (referenced as G1..G3 in the table)

- **G1. Gate and baseline JSON the sheets never name.** `development/scripts/check-architecture.baseline.json` lists edges to files these sheets delete:
  - lines 61 (`project-keys/service.ts`), 95 (`recovery/tool-registrations.ts`), 106 (`source-control/types.ts`), 130, 133, 134, 135, 136 (`taxonomy/publish-content.ts`), 153, 155 (`widgets/publish-content.ts`).
  - Add this step to every Tovu sheet that deletes a file: "Delete or repoint every line of `development/scripts/check-architecture.baseline.json` whose from-path or to-path is a file this sheet deletes. List them with `rg -n '<old path>' development/scripts/check-architecture.baseline.json`."
  - `development/why-comments-debt.json` has about 55 entries under these feature folders. Sheets 82 and 85 must re-key entries whose `file` is a deleted source, and must not drop any entry. Command: `rg -n 'features/(post|project-keys|publish-trust|recovery|site-export|site-inspection|source-control|vendor-credentials|taxonomy|trash|widgets)/' development/why-comments-debt.json`.
- **G2. Replace "as needed" / "if needed" with named helpers.** These phrases are in 62 (`Extract ... as needed`), 64 (`Extract the update capture/inverse closure`), 72 (`Extract list/capabilities handlers ... if needed`), 74/81/83/84/88 (`split ... if needed`). Each sheet must name the helper and its line range literally. Names are given in the table rows.
- **G3. Mutation-actor drift.** Jini added `applyRunActor` (`J/cms/src/publish/content/repo-handler.ts`, end of file) and `requiredMutationActor` / `MissingMutationActorError` (`J/cms/src/core/mutation-actor.ts`). Tovu `F/widgets/publish-content.ts` and `F/entries/publish-content.ts` already call `applyRunActor`. Moved publish contributors that write content must use it (see 86 and 92).

## Verdict table

| sheet id | verdict | exact fix text |
|---|---|---|
| 61 | FIX | (1) `ForgetRemovedPostFn` is already declared in Jini at `J/cms/src/widgets/host-ports.ts:41`. Delete that declaration and write `import type { ForgetRemovedPostFn } from "@jini-ai/core/contracts/site/cms-post-tools";`. Add `export type { ForgetRemovedPostFn };` only if `rg ForgetRemovedPostFn J/cms/api-baseline/jini-ai__cms.json` hits. (2) Order: build after w3b-ext-w2a J19. If `J/core/src/contracts/site/page-html-store.ts` already exports a scoped store with `ensureHtmlFormat/read/write`, do NOT redeclare `DuplicatePagesHtmlStore`; import it. Otherwise keep it here. Add `After w3b-ext-w2a J19` to the sheet. (3) Add the `jini.entries` line (universal). Anchors OK. |
| 62 | FIX | (1) ORDER: round-1 `w3-p11rest.md:183-186` edits `F/post/post-trash.ts:204-245` (moves the current-row/version/ledger reads into the transaction behind a required host post fence). Add "After w3-p11rest's post-trash edit; re-read `post-trash.ts:204-246` and move the file as it stands then, including the fence." (2) G2 names: `runUpdateDraftHooks({ ... })` for `post-update.ts:265-280`, `commitUpdatedPost({ ... })` for `:290-304`. (3) Add mutation `POST-TRASH-SKIP-ACTOR-CHECK`, pin "an actor naming another principal is refused before any write", for `postEventActor` at `post-update.ts:241` and `post-trash.ts:79`. Anchors OK: `captureSlugChange` at `:297`, `postPublicPath` import at `:8`. |
| 63 | FIX | G1. Importer lists were only partly re-run, see UNVERIFIED. Add one explicit step: `rg -n "post/(post-update|post-trash)" apps development` must return only `update-post-host.ts` and Jini imports after the edit. |
| 64 | FIX | G2 names: `createPostUpdateCapture` (`tool-registrations.ts:265-290`), `createPostSearchHandler`, `createPostGetHandler` (`:420-474`). Add the order in the text: `delete` stays after the shared approval (`:480-482`), `withModelFacingErrors` outermost. Add mutation `POST-DELETE-SKIP-VERSION-CHECK`, pin "delete without a matching expected version never reaches `deletePost`". Check that `ToolContributor` and `AssistantSurfaceDeps` exist in Jini with `rg -n "ToolContributor|AssistantSurfaceDeps" J/*/src`; if missing, stop and report. |
| 65 | FIX | ORDER: add "After 64 and after w3b-ext-w2a T24 (the `createPost` cutover) and J25 (catalog)". 65 binds `create` over W2a's `createPost`, so that dependency must be named, not implied. G1 plus `size-exceptions.json:20-21`. |
| 66 | APPROVE | Anchors OK (`search-index.memory.ts` is 90 lines). Mutation named. |
| 67 | APPROVE | Depends on 66. Importer list was not fully re-run (UNVERIFIED). |
| 68 | FIX | **Grant lifecycle.** (1) Do NOT add `grantedVault: Pick<VaultRepoPort,"list">`. At the tip `createProjectKeys` builds `attachedOnlyVault({ vault, attachments, siteId })` inside itself, and `listGranted` reads only that wrapper. A host that passes the raw owner vault would list ungranted keys as granted. Fix: keep `const granted = attachedOnlyVault(...)` inside Jini `createProjectKeys`, import it from `./attached-vault` (round-1 `w3-ext-w2` J01), and add the required field `attachedPolicy` with the type J01 defines. (2) Hard-coded `"project"` workspace at `service.ts:102,120` becomes `owner.workspaceId`. (3) Write the tool order literally. For `project_key_use`: validate input (only `keyId` and `use`; `use` must be `false`), then `authorize` read, then find the row in `listGranted`, then `authorize` per-kind permission from `permissionFor`, then `signal.throwIfAborted()`, then `use({ use:false })`. (4) Add pins and mutations: "use:true is refused before authorize and never reaches `keys.use`" -> `PK-TOOL-ALLOWS-GRANT`; "the per-kind permission is checked after the granted lookup" -> `PK-REVOKE-SKIP-KIND-PERMISSION`; "`listGranted` never reads the owner vault" -> `PK-LISTGRANTED-USES-OWNER-VAULT`. (5) Add to `host`: `restartReason: "provider-settings-live-apply"` and the `admin.plugins.enable` restart permission. `site_restart` lives in `tools.ts`, so the restart copy moves with it. (6) Anchor `createProjectKeys` is `service.ts:116`, params `:116-129` (sheet says 117). |
| 69 | FIX | G1 (baseline line 61). Keep the `plugin-state:tovu-*` prefixes in Tovu (correct). `host-bindings.ts` must pass `attachedPolicy` (see 68), never a pre-built vault. Add Tovu pin "a key granted to another site is not listed by `project_keys_list`", mutation `PK-BIND-OWNER-VAULT-AS-GRANTED`. |
| 70 | FIX | **Deny store.** Add pin and mutation: "an unreadable store makes `list()` return `{ ok:false }`, never an empty `{ ok:true }`" -> `REVOCATIONS-LIST-FAIL-OPEN`. Add `lockKey` to the narrow kernel contract: `StorageKernel` (`J/core/src/contracts/storage/kernel.ts:64`) has `run`, `transaction`, `lockKey`. Anchors OK; no Jini SQL store exists yet (`rg` for the symbol is empty). Mutation `REVOCATIONS-READ-BEFORE-LOCK` covers both `revoke` and `restore` (both lock first at source lines ~84 and ~114). |
| 71 | FIX | Two source-text pins read the boot call. `R/site-deps/__tests__/root-phases.characterization.unit.test.ts:40` asserts the literal `const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });`. `R/__tests__/unit/composition-boot-order.unit.test.ts` (not under `site-deps`; actual path `server/__tests__/unit/composition-boot-order.unit.test.ts:161`) anchors `await publishTrustRevocationStoreFor(kernel)`. Instruction: keep the local import name and the call text byte-identical (only the module specifier changes), and list both tests as touched. Also name `serve-export-teardown.integration.test.ts:67` (comment only). `R/publish-trust-revocations.ts` (the per-request reader) is a different file and stays; `error-gate-debt.json:1278` is for it, not for this sheet. Add G1. |
| 72 | FIX | **Recovery. DUPLICATE with w3b-ext-w1 J24/T20.** Same file, same destination `db:recovery/tool-registrations`. Keep this pair (72/73). Reject w3b-ext-w1 J24 and T20: J24 "Depends on W1 J01" and T20 "Requires J24 and W1 T01", both round-1 REJECTED. Fold J24's pin "denied plan cannot reach the unavailable-capability branch" into 72. Fixes: (1) G2 names: `createRecoveryListHandler`, `createRecoveryCapabilitiesHandler`, `createRecoveryRestoreHandler` (`:352-377`). (2) Write the execute input literally: `principalId: actorId`, `principalKind: "agent"`, `confirmationToken`, `siteId`, `delegatedByPrincipalId: confirmer.id` (source `:331-336`). (3) Add mutations `RECOVERY-DROP-DELEGATED-BY` and `RECOVERY-UNCHECKED-TOKEN-CAST` (a malformed internal confirm result must not proceed to execute). (4) Anchors OK: `:78-90` deps, `:383` private-surfaces default, `:194` agent actor. |
| 73 | FIX | ORDER: add "After 72 and after w3-ext-crp CRP-02 (the daemon human-confirm/delete-grant owner)". Do not depend on ext-w1 T01. G1 (baseline line 95). Keep the single lock: `acquireOperationLock`/`releaseOperationLock` from `K/operation-lock` must be the same module the admin route uses. The mutation `RECOVERY-BIND-SEPARATE-LOCK` is right. |
| 74 | FIX | ORDER: add "After w3-ext-w2 J06 and T06 (they edit `site-exporter.ts:16,20,22,582-584,597-599`); move the file as it stands after T06." Replace "Split runner-argument assembly from final report logic" with `buildRunnerArgs({ ... })` and `assembleSiteExportReport({ ... })`. Anchors OK (648 lines). |
| 75 | FIX | Add pin and mutation: the Tovu `removeOmitted` joins each file under `outputDir` and refuses `..` or absolute names (`EXPORT-REMOVE-OUTSIDE-OUTPUT`). It deletes files, so this is a deletion guard. G1. |
| 76 | APPROVE | Catalog and schema factory only. Anchors OK (190 lines). Mutation named. |
| 77 | APPROVE | Bound catalog; no permission checks move. Importers not fully re-run (UNVERIFIED). |
| 78 | FIX | Anchor correction: in `J/integrations/src/vendor-credentials/project-scope.ts`, `CredentialScope` is at `:11` (sheet says 12) and `CredentialProjectHalf` starts at `:18` (sheet says 19-26). Move through the closing brace, not to line 26. Everything else OK: `core/contracts/vault/vendor-credential-sets.ts` and `secrets-credential-sets.ts:63` (`SecretsVaultService`) exist. Add the `jini.entries` line for each of the three new core subpaths. |
| 79 | FIX | **Credential authorize.** The sheet says `authorize` keeps "the same accepted credential kinds, owner and principal checks" but the policy has no kinds field, so Sol would hard-code `["vendor","custom","source-control"]` (source `:139-140`) in Jini. Fix: `CredentialVaultAdapterPolicy = { ownerKey: string; acceptedKinds: readonly string[]; metaParsers; openService }`. `authorize` throws `new VaultError({ code: "context" })` unless `acceptedKinds.includes(context.kind) && context.ownerKey === policy.ownerKey && context.principalId === null`. Add pin "a foreign owner, an unlisted kind or a principal id is refused" and mutation `VAULT-AUTHORIZE-ACCEPT-ANY-OWNER`. The two current mutations do not kill an authorize that always allows. Anchors OK (180 lines; owner `"tovu"` at `:43,47,159`). Note: w3b-ext-w2a J10 (media credential vault adapter) builds a similar adapter; J10 should reuse `CredentialSetVaultAdapter` if built after 79. |
| 80 | FIX | G1 (baseline 133, 134, 153). Add to the Tovu pin: the bound `credentialVaultBinding` refuses a context whose owner is not `"tovu"` or whose `principalId` is not null. Mutation `VAULT-AUTHORIZE-ACCEPT-ANY-OWNER`. Keep `VAULT-BIND-OTHER-OWNER`. |
| 81 | FIX | Add mutation `SC-RESOLVE-OPENS-ALL-ROWS`, pin "`resolveDefaultForSourceControl` opens only the selected default row". Add mutation `SC-SITE-LOOKUP-AFTER-LEGACY`, pin "site-first lookup precedes the project half". Keep the other two. The registry gained `refusals` in Jini (`source-control-credentials.ts`); the local read projection here needs only `get` and `list`, so do not add it. Anchors OK (597 lines). |
| 82 | FIX | G1 (baseline lines 106, 133-135) and the why-comments re-key from G1. When Tovu builds `SourceControlProviderRegistry` for `R/modules/system-credentials.ts:144`, it must now supply `refusals: readonly string[]` (Jini route drift). Add that as an explicit line. |
| 83 | NEEDS-OPUS | `host` carries about 15 callbacks including `defineSecretCardTool` and `askThenReport`, and the sheet says "Use structural callback types preserving the current card engine's prepare/form/save/result/outcome and handler option shapes". Sol cannot write those types without design judgment. Opus writes the `SecretCardEngineHost` interface (literal member signatures) into the sheet first; the abort-guard and raw-error pins/mutations then stand. |
| 84 | FIX | Add mutation `SC-COMMIT-SKIP-COMMIT-PERMISSION` with pin "a commit without the commit permission is refused before any adapter is built". Write the order literally: known-host admission, read/commit permission, saved-only host check, then dry-run or commit. G2 names for the two helpers: `projectCapabilitySummary` (`:477-497`) and `runLiveCommand`. |
| 85 | FIX | G1 (baseline 130, 135) and the why-comments re-key. `credential_save` must keep a single registered id; mutation `SC-REGISTER-SECOND-CREDENTIAL-ENTRY` is right. |
| 86 | FIX | G3: Tovu `taxonomy/publish-content.ts:66-69,114-118` must consume the run actor (w3b-arch row 438 edits the same lines, which makes this a duplicate edit). Fix: do it here with `applyRunActor` from `@jini-ai/cms/publish/content/repo-handler` at both import calls, and tell w3b-arch to skip its row 438. Add mutations `TAXONOMY-STAMP-BEFORE-AUTH` and `TAXONOMY-WRITE-WITHOUT-ACTOR`. |
| 87 | FIX | G1 (baseline 136). ORDER: after 86, and note that w3b-arch row 438 must not also edit this file. |
| 88 | FIX | **Trash movers (soft delete only; purge/retention/approval untouched, as written).** Add mutations: `TRASH-MOVE-IGNORE-EXPECTED-VERSION` (pin "a confirmed version that differs from the live row returns `version-changed` before `trash.trash`", from `move-to-trash.ts:134-137`) and `TRASH-HIDE-SKIP-SESSION-REVOKE` (pin "a real hide revokes sessions and consumes sign-in links in the marker transaction"). Hide order stays marker, fence, sessions, links (source `member.ts` hide). G2: `currentVersion` and `flipAndReport` must be named top-level functions. The post adapter's current signature is positional `createPostTrashAdapter(store)`, so list every constructor call (all in 89) as changed. Anchors OK; Jini `cms/trash/site/adapters/marker-sql.ts` exists and no Jini `moveToTrash` or `Create*TrashAdapter` exists. |
| 89 | FIX | The mover chain is correct. Authorize still runs before the snapshot read, and the version check runs before the trash write. Add the `TRASH-HIDE-SKIP-SESSION-REVOKE` pin to the Tovu member test too. Check `ContentKernel.transaction` is reentrant before wiring `transaction`; the source already nests `db.transaction` around `adapter.hide`. Retention drift at tip: `trash-item-tool.ts` description now says "30-day" and `sweeper.test.ts` gained a stamped-`purgeAfter` pin. Neither is touched by this sheet. Add "do not edit the retention text, `TRASH_RETENTION_DAYS` or `sweeper.test.ts`". |
| 90 | FIX | Replace "If T17's move and these call sites are already present, this sheet consists of the parity witness only" with an explicit step: run `rg -n "buildWebRegistrations|contributeWebTools" apps/website/src`; if `F/web/tool-registrations.ts` no longer exists, add only the pin test, else do the repoints. Anchors `R/tool-catalog-manifest.ts:646-679` and `F/web/tool-registrations.ts:25,34,36,38,68` UNVERIFIED. Depends on W1 J18/T17, which are not rejected. |
| 91 | FIX | Same replacement as 90, with `rg -n "buildWebScreenshotRegistrations"`. Anchors UNVERIFIED. |
| 92 | FIX | Drift at tip: Tovu `widgets/publish-content.ts` is now 269 lines and calls `applyRunActor`. Re-anchor all line numbers; the actor edits are at about `:222` and `:258-259`. Literal text: import `applyRunActor` from `../../publish/content/repo-handler.js`; both widget and area writers pass `actor: { principalId, kind: applyRunActor({ deps: ctx.deps, principalId }).kind }`. Add pin "an apply with no run actor throws `MissingMutationActorError` and writes nothing" with mutation `WIDGET-PUBLISH-GUESS-ACTOR-KIND`. Tell w3b-arch to skip its row 437 (already applied at tip). |
| 93 | FIX | G1 (baseline 155). Anchors `R/publish-content-manifest.ts:21,70-71` UNVERIFIED. The binding must keep the actor-bearing deps flow so that `applyRunActor` still receives `mutationActor`. |

## Anchors checked

OK:
- `W/platform/publish-contracts.ts:26` (`RemovePostFn`) and `:42` (`ForgetRemovedPostFn`).
- `F/post/post-tool-deps.ts:28,33` (`DuplicatePagesHtmlStore`, factory).
- `F/post/post-update.ts:297` (`captureSlugChange`) and `:241` (`postEventActor`); `post-trash.ts:79`.
- `F/post/tool-registrations.ts` 510 lines; `post-update.ts` 305; `post-trash.ts` 246; `search-index.memory.ts` 90.
- `F/publish-trust/publish-trust-revocations.ts:26-141` (141 lines), `R/deps.ts:30,122`, `J/core/src/contracts/storage/kernel.ts:64` (`StorageKernel` with `lockKey`).
- `F/recovery/tool-registrations.ts` 453 lines; `:78-90`, `:194`, `:331-336`, `:352-377`, `:383`.
- `F/trash/move-to-trash.ts:28` (outcome), authorize-before-snapshot, expected-version check, `trash-item-tool.ts:278-284`, `J/cms/src/trash/sql/entry-sql.ts:44` (`readLiveSnapshot`).
- `F/trash/adapters/member.ts` hide order (marker, fence, sessions, links) and unhide (fence only).
- `F/vendor-credentials/vault-adapter.ts:139-140` (authorize), `:43,47,159` (owner `"tovu"`); `types.ts` 66 lines; `store.ts` 597; `credential-setup.ts` 271; `source-control/tool-registrations.ts` 527; `taxonomy/agent-tools.ts` 39; `publish-content.ts` 122.
- `J/cms/src/widgets/host-ports.ts:41,82`, `J/cms/src/widgets/embed-service.ts:32,73`, `J/cms/src/posts/post-publish-ports.ts:1,13`.
- `J/core/src/contracts/site/secrets-credential-sets.ts:63`, `J/core/src/contracts/site/cms-trash.ts` (`TrashActor`).

WRONG:
- `J/integrations/src/vendor-credentials/project-scope.ts:12,19-26`: actual `CredentialScope` at `:11`, `CredentialProjectHalf` at `:18` to its closing brace.
- `project-keys/service.ts:117` for `createProjectKeys`: actual `:116`.
- 71's "`R/site-deps/__tests__/...`" vs the boot-order test: that file is `server/__tests__/unit/composition-boot-order.unit.test.ts`, not under composition.
- 92: all line numbers are shifted by the 3-line actor drift (file is 269 lines, sheet cites 268).

MISSING:
- None of the moved sources is missing. No `updatePost`, `deletePost`, `buildPostRegistrations`, `InMemoryPostSearchIndex`, trash adapters, `moveToTrash`, or SQL deny store exists in Jini yet.

UNVERIFIED (budget): anchors for 90/91 (`R/tool-catalog-manifest.ts:646-702`, web and screenshot files), `R/publish-content-manifest.ts:21,67-71`, full importer lists for 63/65/67/77/80/82/85/87/89/93, and the existence of `ToolContributor`, `AssistantSurfaceDeps`, `toPostSearchDocument` in Jini.

Importer scans run with `rg` against Tovu `apps` and `development` (basename match against the sheet text):
- Trash movers and adapters: no unlisted importers.
- Project-keys, source-control and vendor-credentials: the only unlisted hits were `development/scripts/check-architecture.baseline.json`, `development/why-comments-debt.json`, `development/scripts/extraction-dossier.mjs` (G1), plus `./tools`/`./service` noise from `features/site-update` (unrelated).

## Cross-set / duplicate findings

- **Recovery (72/73) vs w3b-ext-w1 J24/T20.** Same source, same destination. Recommendation: keep 72/73. J24/T20 depend on REJECTED W1 J01/T01, and J24 adds a second core port file next to the DB orchestrator's own gateway port types. If the other checker prefers J24, then 72/73 must be deleted instead. One pair only.
- **72/73 vs CRP-02.** The recovery confirmation kit must come from daemon `surface-exchanges/human-confirm` (CRP-02), not from W1 T01.
- **Post update/trash (62) vs w3-p11rest** (`post-trash.ts:204-245` edit). Build p11rest first.
- **HTML store contract (61) vs w3b-ext-w2a J19** (`core:contracts/site/page-html-store`). Possible duplicate type; reuse if J19 already declares the scoped store.
- **Taxonomy and widget publish contributors (86/92) vs w3b-arch rows 437/438.** Row 437 is already applied at the tip; row 438 would double-edit the file that 86 moves. 86/92 own the actor change.
- **Site export (74/75) vs w3-ext-w2 J06/T06.** T06 must land first. Owner decision from round 1 stands: ext-w2 owns site-export transforms.
- **Project-keys (68/69) vs w3-ext-w2 J01.** 68 consumes J01's `attached-vault`, `create-vault`, `site-sealer`; no duplicate move.
- **Web and screenshot (90/91)** are reconciliations of W1 J17/J18 and T16/T17 (not rejected); no second port.
- **Vault adapter (79) vs w3b-ext-w2a J10** (media credential adapter): similar pattern but different files; J10 should reuse after 79.

## Summary

This set moves the post write path, project-key grants, the publish-trust deny store, recovery, site export, source-control credentials, the vendor vault adapter, taxonomy/widget publish contributors, and the Trash movers into cms, user-management, devops, db and integrations. Each Jini sheet is paired with a Tovu binding sheet. Placement is feature-sliced and nothing new inverts layering. Most guards are preserved in order: Trash authorizes before it reads, the stale-version check runs before the trash write, member hide revokes sessions and links in the marker transaction, and recovery plans as the agent, confirms as the human and executes as the agent under the shared lock. The weak spots are credential guards with no killing mutation: the vault `authorize` (79), the project-key `use:false`-only rule and per-kind permission (68), `listGranted` (68, where the sheet would let a host pass the raw owner vault), and the deny store `list()` failing open (70). The recovery registrar is claimed twice (72/73 and w3b-ext-w1 J24/T20). Neither the check-architecture baseline nor the why-comments debt file is named anywhere. Tip drift matters in two places: widget publish now uses `applyRunActor`, and `post-trash.ts` is being edited by w3-p11rest first. Sheet 83 needs Opus to write the card-engine host types. No new Trash hard-delete, retention change, or automatic chat delete appears in any sheet.

## NEW owner questions

1. **Which recovery pair survives, 72/73 or w3b-ext-w1 J24/T20?** Recommend 72/73, with J24's denied-plan pin folded in, because J24/T20 depend on rejected W1 J01/T01.
2. **Project-keys: may Jini `createProjectKeys` build `attachedOnlyVault` itself from a required `attachedPolicy`, instead of taking a prebuilt `grantedVault`?** Recommend yes. A forgotten wrapper then cannot widen the granted list, so it fails closed.
3. **Vault adapter: should the accepted credential kinds be a required `acceptedKinds` list in the host policy?** Recommend yes. Jini then never hard-codes `"custom"` or `"vendor"`.

---

# Set: w3b-ext-crp (36 sheets, CRP-13…CRP-30) — checked by the coordinator directly

## Verdict table
| sheet id | verdict | exact fix text |
|---|---|---|
| CRP-13.J | FIX | (1) **Wrong range.** `site-cookie-consent.ts:137–143` is `pluginRequest`, which CRP-13.T keeps in the host. Move `:39–40,144–216`, not `:137–216`. (2) The sheet gives two `plugins` types. Use only `plugins: (required: Record<string, never>) => readonly ConsentPluginContribution[]`, called after the unsafe-path check. |
| CRP-13.T | APPROVE | Host keeps the 256 KiB parser, GET cache exception, `502` catch and receipt store. Mutation `bind-delivery-to-cookie-only`. |
| CRP-14.J | APPROVE | |
| CRP-14.T | FIX | Write the marker port as a function, called on every render: `newMarkerToken: () => \`DOCMARKER${randomUUID().replace(/-/g, "")}N\``. It must not be a string computed once at instantiation. `TOVU_*` hosts and the `data-tovu-*` attributes stay in Tovu (neutral). |
| CRP-15.J / CRP-15.T | APPROVE / APPROVE | |
| CRP-16.J / CRP-16.T | APPROVE / APPROVE | Visibility is applied before paging, cover, terms and JSON (`page-before-visibility`, `bind-anonymous-listing-as-visible`). |
| CRP-17.J / CRP-17.T | APPROVE / APPROVE | |
| CRP-18.J / CRP-18.T | APPROVE / APPROVE | No theme implementation moves (owner rule). |
| CRP-19.J | APPROVE | Large: six modules, with explicit `SitePageReply` union and six named mutations. Opus should review the wire matrix in 19.T. |
| CRP-19.T | APPROVE | |
| CRP-20.J / CRP-20.T | APPROVE / APPROVE | The authorization preflight at `template-preview.ts:27–58` is untouched. |
| CRP-21.J / CRP-21.T | APPROVE / APPROVE | The account page is marked private before the session check (`defer-private-header-until-after-session`). |
| CRP-22.J | APPROVE | OIDC: the continuation is opened against the proof binding before linking. Unlink re-reads the session after the locks inside one transaction (`unlink-identity.ts:38–46` confirmed), with mutation `use-pre-lock-session`. |
| CRP-22.T | APPROVE | |
| CRP-23.J / CRP-23.T | APPROVE / APPROVE | Durable activation is checked before and after the handler, and generation identity by snapshot (`plugin-contributions.ts:52,58` confirmed), with mutation `skip-post-handler-generation-check`. |
| CRP-24.J / CRP-24.T | APPROVE / APPROVE | Access is checked before validators and bytes, and the denied and missing replies are identical (`evaluate-etag-before-access`). |
| CRP-25.J / CRP-25.T | APPROVE / APPROVE | Admission order workspace → commerce → limiter → buyer → same-origin → checkout origin → activate matches `purchase.ts:97–104`. Mutation `activate-before-origin`. |
| CRP-26.J / CRP-26.T | APPROVE / APPROVE | `admin.integrations.manage` (`oauth.ts:22`) is a direct grant. The limiter stays outside the catch. No token or device code reaches the browser. |
| CRP-27.J / CRP-27.T | APPROVE / APPROVE | `admin.plugins.enable` (`install.ts:87`), then the digest regex `^sha256-[a-f0-9]{64}$` (`:12`), all before any archive read (`read-zip-before-digest-validation`, `mount-zip-parser-before-auth`). |
| CRP-28.J / CRP-28.T | APPROVE / APPROVE | The live-site refusal runs before workspace and grant (`peer-transport.ts:264–273` confirmed). `publish_content.apply` uses the no-entity scope (`:240,261`). The peer is opened only after validation. |
| CRP-29.J / CRP-29.T | APPROVE / APPROVE | Constants confirmed: `events.ts:107` (1 s), `:110` (25 s), `:123` (30 s), `:127` (200). The head is written before the ledger read (`:396`). |
| CRP-30.J / CRP-30.T | APPROVE / APPROVE | Missing peer permission returns `[]` without reading peers. Consent is checked before the one start. |

## Anchors checked
OK: `site-cookie-consent.ts` (462 lines; `:137` is `pluginRequest`, see the 13.J fix), `oidc-callback.ts` (130 lines), `unlink-identity.ts:20–24,38–46`, `media-rendition.ts` (700 lines), `purchase.ts:19–20,97–104`, `plugin-contributions.ts:52,58,124`, `plugins/install.ts:12,87`, `peer-transport.ts:240,261,264–273`, `external-mcp/oauth.ts:22`, `settings/events.ts:107–127,396`, `system/publish-credentials.ts:19–26` (the BLOCKED reason is confirmed in the file's own header).
New destinations are absent at the tip, so nothing is duplicated: `cookie-consent/src/site/http.ts`, `cms/src/public-http/http/site/render/content-html.ts`, `cms/src/public-http/routes/plugin-contributions.ts`, `cms/src/media/site/rendition-access.ts`, `commerce/src/http/purchase.ts`, `cms/src/admin-http/routes/{plugins/install,settings/events}.ts`, `user-management/src/member-login/oidc-request.ts`. The existing dirs `cms/admin-http/routes/external-mcp/` (no `oauth.ts`/`probe.ts`) and `cms/admin-http/routes/system/publish-site/` (no `trigger`/`destinations`) are extended, not duplicated.

## Cross-set
No file in this set is moved by another w3b set:
- CRP-26 moves admin HTTP routes. a2's 081–084 move the admin UI controller and panel.
- CRP-27 moves the install route. w2a J21 moves `plugin-runtime/install-source.ts`.
- CRP-30 moves the server routes. a2's 087–090 move the admin UI.

The set builds after round-1 CRP-12.T, as stated.

## Summary
This set moves the remaining public-page pipeline into CMS as neutral decision functions and specs, leaving Express writes, cookies, themes and copy in Tovu:
- render markers, media metadata, post previews, response policy, static/template finishing and the six page handlers
- member pages and storefront
- OIDC legs and unlink (into user-management)
- live plugin routes
- public media access
- commerce purchase specs (into commerce)
- external-MCP OAuth/probe, plugin install, peer push, the settings SSE stream and the static publish trigger/destinations

The sheets are unusually precise. Every security sheet names its gate order and a mutation that breaks it, and every gate order I checked matches the source. Two small FIXes: CRP-13.J's line range overlaps a function its own Tovu half keeps, and CRP-14.T must keep the marker token per render. One input stays BLOCKED by design (the publish-credentials list route).

## NEW owner questions
1. **Publish-credentials list route (crp BLOCKED).** `publish-credentials-route.test.ts` pins that a direct no-principal handler call is REJECTED. The shared mount answers a redacted 500 instead. **Recommend:** move it to the shared mount, and change the pin to assert what the mounted route does with no session (401/403 from the admin auth gate). The direct no-principal call cannot happen in production, so the pin guards a test-only path.
