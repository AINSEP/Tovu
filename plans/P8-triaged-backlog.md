# P8 · Triaged bug backlog (OPEN items not covered by P1–P7/P10)

**Bases:** Tovu `41e948ee4`, Jini `6b8e0d48a` (triage was against Tovu merge-11 `311d26dfa6`; every row planned below was re-checked on the merge-12 base). `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `D/` = Tovu `apps/desktop/src/`, `J/` = Jini `packages/`.
**Source:** `inputs/bugs-triage.md` (+ part-A/B/C). Owner 11-21: **B213 is NOT a bug** (no plan). **B151 is HIGH** (owner 11-20 rule "only the owner may re-enable an owner-disabled admin").
**Owner rules:** as in P1 (simple; plain words, no generic errors; hooks as props; `_optional = {}` pads and args rule untouched; 50/80; complexity ≤ 10; keep why-comments; Jini neutral; works for every agent CLI).

## Counts (whole triage)
FIXED 395 · FIXED-PENDING 10 · OPEN 95 · OBSOLETE 68 · UNVERIFIABLE 76 · NOT-CHECKED 228 · owner NOT-A-BUG 1 (B213).
OPEN rows owned elsewhere: P1 (C107, C130), P2 (C025, C048-seed part), P4 (C048 rest, C075 model-proxy part, C100, C112, C115, C131), P6 (B192, C065), P7 (C028, C074, C101), P10 (A106, A182, A212, B179-family). Everything else is below.

## Verification done for this plan (on the base)
Re-checked and **confirmed OPEN**: B216 (`J/ui/src/features/execution/react/components/ExecutionTab.hooks.ts:50–53`, effect keyed on `config.byok.baseUrl`, no debounce), B151 (`W/server/inbound/admin-http/routes/users/enable.ts:59–61` only `assertCallerHasAnyPermission`; `disable.ts:84` uses `assertUserAccountAction`), B211 (`W/server/runtime/composition/site-deps/after-assembly-forms-search.ts:125` `workspaceRoot: agentPluginLayout.root` vs `app.ts:211` `forWorkspace(...).root`), B190 (`W/features/post/tiptap-block-schema.ts:204–213` `additionalProperties:false`, no `widgetEntryId`), B217 (`A/features/menus/MenuEditor.tsx:397` only the Back link calls `confirmLeave`), B218 (`A/features/plugins/hooks/use-agent-plugin-memory.hooks.ts:65` `setPath` replaces `text`), B233 (`A/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx:206–214` drops fields/where, keeps sort), B236 (`W/server/inbound/admin-http/routes/integrations/create.ts:52–53` `"user-local"`), C058 (`W/features/members/repo.ts:209` `version <=` vs tiers CAS `:266–270`), C043 (`W/server/runtime/plugin-tier2/worker.ts:36` plain `import(entryPath)`; only SDK specifiers registered via `features/plugin-runtime/sdk-resolver.ts`), C084 (`W/server/inbound/assistant/agent-daemon-scope.ts:188` in-process idle park `exit: () => {}`), B152 (`routes/users/reset-password.ts:65` trash check before `:72` permission), B140 (`modules/assistant-chats.ts:175–180` no redaction), B237 (`W/features/webmcp/published-html.ts:15` index from `html.toLowerCase()`), B146 (`J/integrations/src/webhooks/subscriptions.ts:126`), B166 (`J/db/src/tools/plan-store.ts:59–62`), B060 (`J/cms/src/media/image-transformer.sharp.ts:205–207`), B016 (`J/agent-plugins/resend/adapters/resend.mjs:100` flat shape), B121, B135, B164, B165, B176, B178, B203, B204, B206, B141, B183, B200, B201, B186, B168, B137, B018 (spot-checked at the triage's file:line).
Re-checked and **not reproducible / reclassify**: **B255** — `J/daemon/src/tool-recovery/analytics.ts:41–47` forwards the whole `options` object, and `requireConfirmation` lives in `options` (`tool-executor-types.ts:121`), so it is not dropped → OBSOLETE. **A430** (NOT-CHECKED) — `D/tovu-server.ts:311,478` already split startup secrets out with `splitNodeStartupSecrets` → likely FIXED; P8-V confirms with a test. **B115** (NOT-CHECKED) — `sandbox: false` in `D/main/windows/sites-home-window.ts:123` is deliberate and documented (`:164`); only the IPC sender check remains to verify. **B212** (NOT-CHECKED) — plausible: no leave guard in `A/features/deployment/DockerfileTab.tsx`/`StaticSiteTab.tsx`; P8-V writes the witness.
Every other NOT-CHECKED row stays unplanned as a fix; P8-V is a verify-first sweep that converts guesses into evidence.

## Steps (security and HIGH first; Jini first within a tier)

### Tier 1 — security / HIGH

**P8-J1 · Jini · B216 provider key sent to a half-typed Base URL (~1 h)**
`ExecutionTab.hooks.ts:50–53`: probe only on a **committed** endpoint — commit on blur or Enter (or a 600 ms debounce *and* a syntactically complete `https://host` URL); drop `config.byok.baseUrl` from the auto-probe deps in favour of `committedBaseUrl` state. Never send the key to a URL that is not committed.
Tests first (`ExecutionTab.hooks` test): `typing https://ap, https://api.ex… sends no listModels call`, `blur with a complete URL probes once`. Red now: one probe per keystroke. Mutation: re-add `baseUrl` to the deps. i18n: none.

**P8-T1 · Tovu · account security trio: B151, B152, B236, B140 (~1.5 h)**
- B151: `enable.ts` calls `assertUserAccountAction({ …, action: "enable" }, { callerPrincipalId, seededOwnerPrincipalId })` like `disable.ts:84`; only the owner may re-enable an owner-disabled admin. Words: "Only the site owner can turn this account back on."
- B152: `reset-password.ts` → permission check before the Trash check (as `enable.ts`).
- B236: `integrations/create.ts:52–53` use `getAuthedPrincipal(res).id` for owner/createdBy; keep the why-comment, update it to say dev auth still stamps `user-local` via the session.
- B140: `parseRenameTitle` redacts with the existing `redactUserText` before storing.
Tests first: `a non-owner admin cannot re-enable an owner-disabled admin (403)` (red), `reset-password on a trashed user without permission is 403, not 409` (red), `webhook created from the admin UI is owned by the signed-in user` (red), `renamed title with a token is stored redacted` (red). Mutations: one per bullet (remove the call / swap the order / restore the literal / skip redaction). STOP if `assertUserAccountAction` has no `enable` action — add it in the identity service with the same owner rule, do not inline.
(One-off scrub of old titles: list as owner question 3.)

**P8-T2 · Tovu · data-loss HIGH: B211, B190, C058 (~2 h)**
- B211: `after-assembly-forms-search.ts:125` → `workspaceRoot: agentPluginLayout.forWorkspace({ workspaceId }).root` (same as `app.ts:211`).
- B190: `tiptap-block-schema.ts` `widgetEmbed.attrs` gains `widgetEntryId: { type: "string", description: "Keep it when present." }`.
- C058: `members/repo.ts` save → compare-and-set on the expected version (pattern `:266–270`), surface `VERSION_CONFLICT` with "This member changed since you opened it. Reload and try again."; keep the Trash and credential-cutoff guards.
Tests first: `a disabled search provider plugin gets no writes or queries` (red), `a post with a widgetEmbed carrying widgetEntryId passes strict MCP validation and keeps it` (red), `two saves from the same version: the second is refused` (red). Mutations: restore `.root`; drop the schema property; restore `<=`. STOP for C058 if other `0042` tables share the `<=` pattern — list them (do not fix in this step).

**P8-T3 · Tovu · unsaved-work HIGH: B217, B218, B233 (~1.5 h)**
- B217: router-level leave guard for `MenuEditor` (use the admin's existing unsaved-changes blocker if one exists; else `useBlocker` injected as a prop) so sidebar navigation asks too.
- B218: `setPath` keeps the typed `text` when renaming a new note.
- B233: `setCollection` also deletes `sort` when the sort is a field of the old collection.
Tests first: `sidebar navigation with unsaved menu edits asks first` (red), `renaming a new note keeps its text` (red), `changing collection drops a field sort` (red). Mutations: guard only on Back; replace text on rename; keep sort. i18n: reuse the existing "You have unsaved changes…" key.

**P8-T4 · Tovu · C043 tier-2 plugin import allowlist (~1.5 h)**
Recommendation (owner question 1): **SDK-only** — the resolver registered by `registerPluginSdkResolver` refuses any bare specifier that is not one of the two SDK specifiers and any `node:` builtin, and allows relative imports that stay inside the plugin's own folder. Refusal words: "This plugin tried to load '<name>', which plugins cannot use. Ask its author for an update."
Tests first (`plugin-tier2/__tests__`): `a plugin importing 'fs' or 'node:child_process' is refused`, `a relative import outside the plugin folder is refused`, `SDK and in-folder imports work`. Red now. Mutation: allow `node:` builtins. STOP if a bundled tier-2 plugin needs a builtin — list it for the owner.

### Tier 2 — MED

**P8-T5 · Tovu · C084 in-process daemon parks into 503 (~1 h)**
In-process scope (`agent-daemon-scope.ts:188`, `exit: () => {}`): do not create an idle park (pass a no-op park) — there is no process to restart, so parking only strands the scope. Words if parked anyway: "The assistant is waking up. Try again in a moment." Test: `in-process scope never reports AGENT_DAEMON_PARKED after the idle interval` (red). Mutation: restore the park. Interacts with P3-T1 (idle hold) — run P8-T5 first.

**P8-J2 · Jini · small data fixes: B146, B166, B060, B016 (~1.5 h)**
B146 webhook `update` defaults `expectedVersion` to `existing.version`; B166 plan-store caps **per principal**; B060 `withoutEnlargement: true`; B016 Resend sends `{ request: { method, url, … } }` like `lib/domains.mjs:68`. Tests first, one per fix (each red now). Mutations: one per fix. Changesets: integrations patch, db patch, cms patch; Resend plugin version bump + catalog re-pin (`guard:plugins:catalog`).

**P8-J3 · Jini + Tovu · B109 Soon plugins offered by search (~1.5 h; Jini then Tovu)**
Jini: `AutomaticAgentPluginPorts`/search tool takes an optional `hostMaturity({ pluginId })` port; candidates marked `soon` are listed as "coming soon" and never offered for enable. Tovu: pass its maturity map; delete the KNOWN GAP comment at `W/features/agent-plugins/tool-registrations.ts:113` only when the test proves it closed (rewrite the why-comment to the new behaviour). Tests: `a Soon plugin is not offered for enable`. Mutation: ignore the port.

**P8-T6 · Tovu · newsletter: B176, B177, B178 (~1.5 h)**
B176: while consent is unbound, do not create tokens or send confirmation emails; an old link shows a plain page "This subscription link can't be confirmed right now. Ask the site owner." (no 500). B177: refuse archived lists in campaign/subscription writes ("This list is archived."). B178: `preheader: null` clears. Tests first, one each (red). Mutations one each.

**P8-T7 · Tovu · publishing: B203, B204, B164 (~1 h)**
B203: treat a not-live/trashed destination redirect as `blocked` (skip with reason), not a run abort. B204: pass `expectedVersion: existing.version` at `redirects/publish-content.ts:148–152`. B164: `hostsMissingSavedKey` skips disabled and env-configured hosts. Tests one each; mutations one each.

**P8-T8 · Tovu · keys that vanish or will not delete: B121, B135, B136 (~2 h)**
B121: source-control list/update/delete read through `repo.canonical` like describe/resolve (`store.ts:397–400,538,570`); test save→reload→list→update→delete. B135/B136: media providers save becomes per-provider (PATCH one id) with an explicit delete; the legacy whole-map PUT is refused when stale ("Your provider list changed in another window. Reload and try again."). Admin `media-providers-port.ts:45` switches to the per-provider calls. Tests: `saving one provider does not wipe a built-in key saved elsewhere`, `Remove on a plugin-vendor key deletes it`. Mutations: restore whole-map write; tombstone by omission.

**P8-T9 · Tovu · External MCP: B200, B201, A303 (~1.5 h)**
B200: pass `ToolInputError` text through (only the stale-approval case says "no longer current"). B201: link `/addons/integrations?tab=external-mcp&server=<id>`. A303: `external_mcp_save` approval survives until answered — use the run-bound lease (same mechanism P3-T3 relies on); re-issue the card on answer if the old one expired. Tests one each. STOP for A303 if the lease needs a Jini change — move it into P3-T3's Jini follow-up.

**P8-T10 · Tovu · assistant runtime: B141, B206, B186, C095 (~1.5 h)**
B141: arm the BYOK `res.on("close")` listener before the credential/federation awaits (`assistant-byok.ts:~727–763`), or check `res.destroyed` after them. B206: pass `ctx.signal` into the paid media dispatch. B186: inject the live chart/component snapshot into `buildComponentCatalogQuery` (`component-catalog-tool.ts:125`). C095: `agent-daemon-run-start.ts:378` prepends `<<SUBAGENT_DISPATCH>>` only when the site dir has `AI-Dev-Shop/AGENTS.md` (owner question 2 asks whether to keep it at all). Tests one each; for B141 `Stop before the federation await → no paid call`.

**P8-T11 · Tovu · content correctness: C057, C002, B237, B165, B168 (~2 h)**
C057: empty patch does not bump the version (repoint the 4 `l244-characterization` witnesses, which are red today). C002: revert applies all inverses in one transaction (flip the pinned "(reported, not fixed)" test at `W/contracts/core/commands/__tests__/revert.unit.test.ts:608` red-first). B237: case-insensitive search on the original string. B165: validate the derived slug, trim the name. B168: separate the screenshot flag from the visitor preview choice so the cookie banner shows for every real visitor. Tests one each; mutations one each. STOP for C002 if the change-set store cannot share a transaction with entity writes (DR-006) — report.

**P8-T12 · Tovu · admin UI MED: B183, B137, B245, C017 (~1.5 h)**
B183 per-store inline errors in Secrets; B137 backdrop close only when the press **started and ended** on the backdrop (shared dialog helper, hooks as props); B245 enable "View Template" from the displayed picker value; C017 repoint the 26 `.jini-*` selectors in `A/integrations/jini-admin/jini-media.css` to the classes Jini emits (Chrome check owed). Tests one each (C017: class-exists test against Jini components).

**P8-J4 · Jini · composio boot lock (A007) and static export data-* (A011) (~2 h)**
A007: a lock wait at boot never disables the plugin; recovery retries in the background with a named log line (`J/agent-plugins/src/lifecycle/update.ts:310`). A011: static export collects files referenced by `data-*` attributes and JSON manifests listed by the theme (`J/devops/src/static-export/transforms.ts:147–159`); unresolved → warning naming the file. Tests one each.

**P8-T13 · Tovu · run-finalizer duplicate (C063) + ThemePreviewReloadControl (C097) (~1.5 h)**
C063: adopt Jini's exported `chat/src/server/run-finalizer` in place of Tovu's copy (`W/server/runtime/composition/modules/run-finalizer/*`) if its contract matches, re-witness F1–F3; else delete the unused Jini export (changeset). C097: owner decided (11-20 #10) "ThemePreviewReloadControl → admin package": place it in Jini `admin` (React allowed there), not `cms`.

### Tier 3 — LOW (two batches, ~2 h each)
- **P8-L1 Tovu:** A010 (raster `/original` serves bytes), A046 (theme-toggle key from theme id), A196 (show offset/range in read rows), A452 (Activate for quarantined themes), A453 (self-host Google Fonts), B018 (drop overdue site-key aliases once the Jini release has `SiteKey` exports), B159 (CLI built-in ids shared), B280 (remove unused `@mcp-ui/client` from site-chat), C036 (delete two re-export shells), C046 (admin uses a shared slug helper), A382 (dev.mjs forces Vite optimizeDeps when `@jini-ai` versions change).
- **P8-L2 Jini + tests:** C003 (snapshot comment says ROLLED_BACK), C014 (optional-peer stale pin), B257 (`useRunStream` deps include transport), C056 (BM25 tie: reproduce with `tool-search-operator-requests.json:36`, adjust description), C076/C085/C086/C096 (decide and pin the four test-contract rows; make the submit-service timing deterministic).
Each item: one failing test or (for docs/deps) one gate check first; one mutation where it is behaviour.

### P8-V · Verify-first sweep of NOT-CHECKED HIGH/MED/security guesses (~2 h × 2, test-only)
For each row: write the smallest witness on the base; red → open a fix step; green → mark FIXED with the test as evidence. No fixes in this step.
- Batch 1 (security/data): A430, B115 (IPC sender check), B052 (argv budget; overlaps P2-T4), B066/A332 (path-shaped tokens redacted), B123 (>100 grants), B147 (deploy-split migration overwrites "off"), B170 (form-delivery token shapes), B226 (new publish key reuses old verification), B229 (deleting a trashed site leaves DBs), B231 (KEY_IN_USE), B258 (`tovu_ak_` in exceptions), B262 (login writes whole user row), B266 (Jini media trash stale record), B268 (forms own-read CAS / publish drops version), B270, B272.
- Batch 2 (UX/assistant): B073 (streamed replies split mid-sentence), B091/B092 (raw "No such tool"), B116, B117, B122, B162, B173, B174, B179 (→ P10 list-cursor), B193/B196 (English strings), B197, B199, B205, B209, B210, B212, B227, B238, B239, B246, B259; the bundle rows (B104, B207, B220, B223, B228, B230, B232, B234, B235, A383, A413, A420, A435) are split into single claims first.

## Owner questions (recommendations)
1. C043: tier-2 plugins may import **only** the Tovu plugin SDK and their own files? **Recommend yes** (no `node:` builtins).
2. C095: keep sending `<<SUBAGENT_DISPATCH>>` on in-app runs at all? **Recommend** only when the site folder carries AI-Dev-Shop's `AGENTS.md` (todos group 7 asks the same).
3. B140: scrub already-stored chat titles once? **Recommend yes**, one boot-time pass with the existing redactor.
4. C026: vendor names in `bundled-catalog.ts:47,48,57` / `shared-owner.ts:81` — **recommend** allow-listing them as the host's bundled inventory (they are product data, not engine code).
5. A308 lock rule, A310 analytics without consent, A348 export scan of first-party plugin docs, A450 separate origin for themes: **recommend** A308 "never evict a live owner"; A310 keep sending nothing without consent; A348 skip signed first-party plugin files and stop shipping plugin `__tests__`; A450 plan a separate theme origin after P6 (security, L).

## Dependencies / batches
- Batch A (parallel): P8-J1, P8-J2, P8-J4, P8-T1, P8-T2, P8-T3, P8-T4, P8-T5.
- Batch B (parallel): P8-J3 (then its Tovu half), P8-T6 … P8-T13, P8-V.
- Batch C: P8-L1, P8-L2.
P8-T5 before P3-T1. P8-T9's A303 shares the lease work with P3-T3. P8-T12's C017 needs a Chrome look.

## Estimate
Tier 1 ~7.5 h; Tier 2 ~20 h; Tier 3 ~4 h; P8-V ~4 h.
