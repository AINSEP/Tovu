# Cloud check run 2026-10-24 — REPORT

Append-only run log + per-item verdicts. Brief: BRIEF.md (same dir). Protocol: RUN-PROTOCOL.md.

## 2026-10-25T04:34:29Z — STARTED

Host vm, 4 cores, Linux 6.18. Tovu lane HEAD 5356dce9 (parent a3c40e75) checked out as local `lane` OK.
Jini not yet cloned. Branch per brief = cloud/check-1024-tovu-lane-wip (overrides RUN-PROTOCOL §1 refactor/jini-admin-extraction).
Next: install Node 24, clone Jini WIP, install/build, then items 1–6 in order.

## 2026-10-25T04:48:33Z — FAILURE (Jini push refused) + ASSUMPTION

`git push origin HEAD:cloud/check-1024-jini-wip` in /root/Jini → exit 128:
`remote: access denied by the git proxy: AINSEP/Jini is not in this session's authorized repository set` / `403`.
add_repo(AINSEP/Jini, push) attached it for reads but reported push_check=refused ("Claude doesn't have GitHub access to ainsep/jini for your organization" — install the Claude GitHub App on AINSEP/Jini or reconnect GitHub).
ASSUMPTION: every Jini commit (main WIP, perf, guard) is persisted as `git format-patch` files under
`patches/<branch-slug>/` in this dir on the Tovu lane branch. Apply with `git am patches/<slug>/*.patch` on the named branch.

ENV notes: Node 24.22.0, pnpm 10.33.2. npm ci (root and apps/admin) skipped install scripts (argon2, better-sqlite3, esbuild) under npm allowScripts. apps/admin is NOT a root workspace — needed its own `npm ci`; then re-ran link:jini. apps/admin vitest 4 rejects `--minWorkers` → ran with `--maxWorkers=2` only.

## Item 1 — ask-choice — FIXED

Commits: Jini cloud/check-1024-jini-wip local 933c40c9 (NOT pushed — patch `patches/jini-wip/0001-*.patch`). Tovu: no code change.
Review: receipt path is sound — Tovu emits a resource-bound `user_message` receipt (`id answer:<exchange.id>`, `surfaceUri`, `answerText`, text "Agent plugins: GitHub") via the existing run lifecycle; Jini indexes receipts by surface URI (useAnsweredCards.recordedCardAnswers) and run-activity treats a surface with a receipt as answered; explicit question meta keeps "Waiting for your answer above" until receipt/tool work. daemon emitSurface now spreads payload with `type: channel`; only trusted preflight code calls it and the ask-choice exchange only emits `mcp-ui` (packages/mcp/src/tools/ask-choice/index.ts:60), so no new injection surface.
Fixes:
- McpUiSurfaceCard.tsx SurfaceCardContent cognitive complexity was 13 (Codex's "max 10" claim false; baseline cyclomatic 11) → extracted `answeredSurface()`; both rules now clean.
- surface-question-replay.test.tsx enclosing-call case failed: the enclosing `update` tool row renders its own raw input JSON and an expand button. Test bug, not code bug — scoped raw-value assertions to text outside `.op-card` and button assertions to Use/Don't ask again/Skip.
Tests: Jini chat full suite 3705 pass / 0 fail / 1 skip (256 files); `tsc --noEmit -p packages/chat` 0 errors; chat build OK. Tovu admin agent-plugin-choice-replay 4/4. Tovu automatic-agent-plugin-choice + integration 31/31. Existing ask-choice node tests 67/68 — the 1 failure (mcp-ui-tool-calls-route.ask-choice.integration "real round trip": extra `normalizationNotes: ['singleSelect: options normalized']`) also fails with ask-choice-tool.ts reverted to a3c40e75^ → PRE-EXISTING, Jini mcp normalizer vs Tovu fixture drift.
CCN: Tovu ask-choice-tool.ts / automatic-agent-plugins.ts clean. Pre-existing (untouched functions, listed not fixed): accepted-input.ts collapseDeliveryReceipts (cyclo 11, cognitive 17), question-answer.ts selectedAnswerText (cyclo 11).
Minor (not fixed): automatic-agent-plugins.ts compares `emission.channel === 'user_message'` literal instead of MID_RUN_USER_MESSAGE_EVENT_NAME. Receipt text omits the action ("Don't ask again" reads the same as "Use").
Q "did reload regression exist before e5f49697": Codex says yes (Tovu preflight a813c3828, Jini replay matched tool-bound answers only) — not re-verified (Tovu history at that sha not inspected).

## 2026-10-25T04:51:49Z — Item 2 — template-urls — FIXED (trim)

Commits: Jini cloud/check-1024-jini-wip local ae78e4d6 (NOT pushed — `patches/jini-wip/0002-*.patch`).
Review: `fillSlotText` now requires a URL attribute value to be exactly one `{{host.<name>}}` / `{{host.assets.<name>}}` slot (HOST_URL_SLOT), after which the existing assertLocalUrl still forces the host value to a same-origin path. Literal /path, https://, //, javascript:, mixed literal+slot, double slots, unquoted and entity-encoded values all refused; refusal throws inside resolvePluginExportEmbeds' per-occurrence try → that occurrence keeps the author fallback, next occurrence still renders (tested).
Fix: Codex extended URL_ATTRIBUTES with srcset/formaction/poster/xlink:href — dead code, because fillPluginExportTemplate validates the raw template against server-fragment.ts:5 attribute allowlist first (none of those are allowed). Trimmed back to href/src/action with a why comment; tests for those sinks still pass via the fragment policy.
Refusal reason: CMS deliberately exposes no diagnostics (PluginExportsPort doc + Tovu exports/diagnostics.ts:1 "CMS deliberately exposes only public fallback"); the reason text is the thrown Error message, which the host can surface by calling fillPluginExportTemplate itself. Codex's "unresolved J2 shape" concern → no CMS shape change needed; host side covered in item 4.
Tests: plugin-export.unit 64/64; plugin-export + resolve-html-page-embeds + html widget tests 91/91; full cms suite 4199 pass / 1 fail — subpath-isolation.contract (plugin-export.ts imports ../../consent/types.js across SI-domain) — import exists at 03dec0ae:plugin-export.ts:3 → PRE-EXISTING, not this change. `tsc --noEmit -p packages/cms` 0 errors; CCN clean; cms rebuilt.
Open for owner: the pre-existing SI-domain violation (widgets → consent) in plugin-export.ts.

## 2026-10-25T04:56:14Z — Item 3 — mail-s8 — PASS

Commits: none needed (Tovu WIP a3c40e75 as-is).
Freeze: `git diff c0e4943c5 a3c40e75^ -- <the 5 boot + 6 platform/mail files + mail-provider-catalog.ts>` → empty. Parity goldens: `git diff c0e4943c5 HEAD -- boot/__tests__/mail-engine-parity.unit.test.ts` → empty (byte-identical).
Review: boot/{resolve-mailer,mail-delivery-policy,mail-domain-read,mail-status-cache,sender-domain-verification} and platform/mail/{provider-error,purpose-gate-probe,…} are thin bindings/re-exports of @jini-ai/platform/mail. Plugin HTTP casts kept byte-identical (resolve-mailer.ts:187 matches c0e4943c5:420) per review change 4; resendPolicyFor (members→never) stays in Tovu and is injected; purpose probe calls isPurposeGateOpen and still validates mode at construction; provider-error re-exports Jini's safeMailProviderText/credentialSecrets (redaction tests green). No generic code left in Tovu that belongs in Jini.
Tests (Codex's command, 3 chunks, node --test --test-concurrency=1):
- c1 boot suites incl. parity + new adoption + resolver/lifecycle/policy/status-cache/account-token + sender-domain-verification + site-mailer: 97/97 pass.
- c2 platform/mail/**, mail-status, mail-dns-status, mail-cache-invalidation, resend plugin: 183 pass / 1 fail — purpose-scoped-mailer-call-sites.integration "real call sites use distinct lanes…" (providerSends [] after one setImmediate). Deterministic; ALSO FAILS in a worktree at a3c40e75^ (pre-WIP) with the same linked Jini → PRE-EXISTING (likely an extra async hop in linked Jini's gate vs the test's single setImmediate drain).
- c3 members/**, member routes: 470 pass / 9 fail — all member-external-identities.postgres → ENV (no Postgres server).
- Jini `pnpm --filter @jini-ai/platform exec vitest run src/mail`: 229/229 (18 files).
Typecheck: Tovu `tsc -p tsconfig.json --noEmit` 0 errors (Codex's 6 out-of-scope errors are gone with the ask-choice Jini build). `tsc -p tsconfig.tests.json`: 344 errors repo-wide, none in the cutover files; mail-adjacent ones are in untouched tests (sender-domain-verification.test.ts:58 'restricted_api_key' vs Jini ProviderRejectedCode; mail-cache-invalidation.unit.test.ts:23 'secret' on SettingDefinitionSpec) → pre-existing test-type drift, listed only.
CCN: all 12 cutover files clean (complexity + cognitive ≤10).
Minor (not fixed): SURVEY.md ownership note lives in ADS-memory/.local-artifacts (untracked) — not in this branch; owner to confirm it landed on the Mac clone. Release gate (published-package typecheck) still pending the owner's publish.

## 2026-10-25T05:01:52Z — Item 4 — embeds-t1 — FIXED

Commits (Tovu cloud/check-1024-tovu-lane-wip, pushed): 81a289c7, b6564c7e.
Security review (files read): export-files.ts matches pluginId/component/path against the enabled package's declared styles/assets BEFORE any read; no URL path joins disk; reads go through lifecycle.readTrustedPluginFile / assertContainedOnDisk (same containment owner; package digest gate in findTrustedPluginPackages); responses nosniff + `default-src 'none'; sandbox` CSP + no-referrer; 404 never leaks paths; rate-limited before I/O. runtime.ts: hostLinks only `member-login:<id>` whose provider is ready AND owned by the same plugin, mapped to MEMBER_OIDC_PATH/start (Tovu route), else fallback; static mode honours staticExport (fallback-only → fallback, CSS + artwork still shipped); all failures (unknown/disabled/alias-ambiguous/version/props/host/template read/literal URL) → undefined → CMS keeps author fallback; stamps applied by CMS on the wrapper after fragment validation; consent stamp consumed by cms/consent/html/gate.ts. Save: store seed/write + update-html route validate; invalid props → PluginEmbedValidationError (ToolInputError, code PLUGIN_EMBED_INVALID_PROPS) → 400; unknown/disabled → warnings in response.
Fixes:
- export-files.ts: any declared extension other than .css/.png was served as image/svg+xml → now an explicit {.css,.png,.svg} type map; others 404 without a read (+ new test).
- plugin-embed-source.test.ts + plugin-embed-export.test.ts: fixture manifests lacked the required `$schema`, so parseAgentPluginManifest refused them (source test crashed on packages[0]; export test passed through fallback only by accident). Added $schema. Export test's `/data-embed-config/` no-marker assertion also matched the theme's menu marker → narrowed to `"type":"plugin"`.
- "static template URL refused" test (plugin-embed-render) PASSES now that item 2 is built — no todo needed.
Tests: Codex's T1 set 165/166 pass; the 1 failure (site-exporter "live site: a request carrying the static-export marker … never-store Cache-Control": got 'private, no-store' for /) also fails at a3c40e75^ worktree → PRE-EXISTING. export-files.security 3/3. Tovu `tsc -p tsconfig.json` 0 errors; no tests-project tsc errors in the embed files.
CCN: all touched embed files clean except composition/deps.ts composeSiteRouteDeps (cyclo 13) — WIP only added a const + property there → pre-existing, listed.
Minor (not fixed): runtime.ts collectHead links the stylesheet even when the host link is unavailable (fallback renders with CSS — harmless); html-document-store warnings held on the per-request store instance (fine while the factory is per request); update-html validates twice (route + store), deliberate per comment. Google manifest export stays U1 (per review).
