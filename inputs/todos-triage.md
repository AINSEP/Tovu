TODOS TRIAGE COMPLETE

# todos.md triage, 2026-11-21 (Pacific)

**Bases (git objects only):**
- Tovu `T` = `origin/integ/merge-11-2026-11-21` @ `311d26dfa6`.
- Jini `J` = `origin/integ/merge-12-2026-11-22` @ `6b8e0d48a`.
- Pending branches checked with `git log T..origin/<b>`:
  - Tovu `codex/tv-err1` `6da5c1455e`, `codex/tv-bugs3a` `5eb72847cd`, `codex/tv-bugs3b` `e73e946464`, `codex/tv-howto2` `c0f70b84c2`, `codex/tv-seed-upgrade` `2ddce9e825`.
  - Jini `codex/jx-chatlinks` `b6e9573f5`.

**Snapshot:** `triage/todos.md`, the same file as `T:development/todos.md` apart from a few wording lines in §1. It has 294 unchecked `- [ ]` items.

**Owner decisions applied** (memory files for 11-17, 11-18 and 11-20):
- The 424 UI functions over 50 lines are tabled for good.
- The args rule and the `_optional = {}` pads stay exactly as they are.
- @tovu/sdk stays in Tovu (rjk T3 dropped).
- The visitor chat stays on React.
- L (desktop general chat) is parked.
- Q2 (restore from an uploaded backup) is not now.
- Workflow from 11-21: an Opus plan, then a Codex 6.2 verify, then Opus implements.

**Scope notes:**
- The 294 checkboxes are classified one row per item, or one row per tight group under one heading that shares one proof.
- The massive-refactor list (lines 2403–2644) is plain bullets, not checkboxes. It is triaged in its own table (Part B).
- Plain-bullet entries in §1–§3 (lines 25–502) have no checkboxes. They were **not** itemized; the open-bugs triage covers most of them.
- **OPEN-backlog** means aspirational roadmap or parity items from the 07-xx/09-xx inventory. No owner priority is set, so no action is proposed for them now.

## Summary counts — checkbox items (294)

| Section (todos.md lines) | items | DONE | DONE-PENDING | DROPPED | OPEN S | OPEN M | OPEN L | of which OPEN-backlog/parked |
|---|---|---|---|---|---|---|---|---|
| §1 Do first (95–260) | 9 | 0 | 0 | 0 | 3 | 4 | 2 | 0 |
| §2 High, not yet (261–312) | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| §3 Next/medium (313–502) | 0 | – | – | – | – | – | – | – |
| §4 Later/parked (503–870) | 18 | 4 | 0 | 0 | 5 | 4 | 5 | 6 (parked by owner) |
| §5 non-inventory (871–1599, 2382–2400) | 31 | 3 | 1 | 4 | 12 | 8 | 3 | 3 (commerce research) |
| §5 Master Build Inventory §1–§25 (1600–2088) | 235 | 2 | 0 | 5 | 7 | 3 | 218 | 218 |
| **Total** | **294** | **10** | **1** | **9** | **27** | **19** | **228** | 227 |

The real "active" OPEN list is **47 items**:
- 9 in §1
- 8 in §4
- 20 in §5 (non-inventory)
- 10 sized inventory rows

The other 227 OPEN items are roadmap backlog or parked by the owner.

## Summary counts — massive-refactor + LATER-extraction bullets (Part B, 90 rows)

| Block (lines) | rows | DONE | DONE-PENDING | DROPPED | OPEN S | OPEN M | OPEN L |
|---|---|---|---|---|---|---|---|
| LATER extraction list + 11-05 adds (2403–2441) | 27 | 10 | 0 | 1 | 1 | 3 | 12 |
| Args rule + A–G (2442–2485) | 17 (+1 referred to open-bugs) | 6 | 0* | 1 | 0 | 5 | 4 |
| H + H2 (2486–2569) | 22 | 8 | 0 | 1 | 8 | 5 | 0 |
| I–N + K-per-CLI (2570–2644) | 24 | 7 | 0 | 1 | 6 | 7 | 3 |
| **Total** | **90** | **31** | **0*** | **4** | **15** | **20** | **19** |

\* One row, C "Tovu 486 hits", is counted as OPEN M. Its error part is DONE-PENDING on `codex/tv-err1`.
Rows are bullet groups. Where one bullet had parts with different statuses, those parts are split into sub-rows.

---

## Part A — checkbox items, one row per item or group

Columns: section | item | status | evidence | size | next step | source line(s)

### §1 Do first

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| §1 .MOV gap | Accept `.mov`/`video/quicktime`/`.m4v` uploads + imports (≤50 MB as-is, owner 10-31) | OPEN | `T:apps/admin/src/features/media/rules.ts:373` `VIDEO_ACCEPT = "video/mp4,video/webm"`; no `quicktime` in admin media/library or in `J:packages/cms/src/media` | S | Add the mime/extension to the Jini media ceiling and the admin accept list, plus a "may not play in Chrome" note for HEVC; test first | 102 |
| §1 .MOV gap | Transcode to web-safe MP4 on import (keep the original, cap size) | OPEN | No transcode path. Jini already has ffmpeg discovery for frame extraction (`J:packages/cms/src/media/node.ts:11-13` `createFfmpegVideoFrameExtractor`, `findVideoBinaries`) to reuse | M | A transcode port beside the frame extractor; only over 50 MB (owner 10-31) | 104 |
| §1 .MOV gap | Conversion as an assistant-callable media tool (ffmpeg server-side/provider plugin, no vendor code in core) | OPEN | No such tool in `J:packages/cms/src/media/agent-tools.ts` | M | Same job as line 104: tool + approval card | 107 |
| §1 .MOV gap | One size limit across Library/Media/chat/assistant imports, stated in the error | OPEN | `T:apps/admin/src/features/library/rules.ts:23` `LIBRARY_MAX_BYTES = 10 MB` vs Media 50 MB | S | One shared constant in Jini media; plain error naming the limit | 108 |
| §1 update deployed site | "Update available" check in production admin | OPEN | `T:apps/admin/src/features/plugins/AgentPluginUpdateControl.tsx:22` states there is no update-available signal; nothing for Tovu itself | M | Version endpoint + release feed compare; plan with the release work | 112 |
| §1 update deployed site | One-click/chat update (bump, deploy, wait, verify, show changes) | OPEN | No code; `deployments/deploy-ops/agent-tools.ts` only redeploys | L | Contract-first plan (Opus plan → Codex verify) reusing deploy adapters | 113 |
| §1 update deployed site | Safety: backup first, migration readiness gate, rollback, never auto-update | OPEN | Pieces exist separately (site-backup, readiness gate), not chained | M | Fold into the line-113 plan | 117 |
| §1 update deployed site | Same path for desktop-made + self-hosted sites | OPEN | Not started | L | Same plan | 122 |
| §1 CRITICAL email | tovu.dev sends NO email (no provider selected) | OPEN (owner/prod action) | This is production config and cannot be proven from git. Tovu mail is generic (Resend overlay `T:content/agent-plugin-overlays/resend`); no commit since 10-22 says tovu.dev mail was configured | S | Owner or coordinator checks tovu.dev Email page; connect Resend on tovu.dev itself (pairs with line 850) | 256 |

### §2

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| §2 monitoring | Assistant chat fails with Gemini | DONE | `T` commits `9e7b27bc60` fix(assistant): Gemini admin chat replies after describing site_guide; `e862717804` visitor chat with Gemini | – | A live re-check in the owner's localhost would close it for good | 303 |

### §4 Later / parked

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| §4 ui-ux-design shared copy | Review the merged-wording proposal | DONE | `T` `b0d9a85aac` feat(agent-plugins): D-W1 — ui-ux-design ships from `@jini-ai/agent-plugins/ui-ux-design`; Tovu keeps only `content/agent-plugin-overlays/ui-ux-design/GUIDANCE.md` | – | – | 546 |
| §4 ui-ux-design shared copy | Switch Tovu to the shared package, delete the local copy | DONE | `T:content/agent-plugins/` now holds only `how-tovu-works`, `tovu-theme` | – | – | 550 |
| §4 Commerce later | PayPal provider plugin (L6b) | OPEN (parked 10-21) | `J:packages/provider-plugins/src/` has `payments-stripe` only; PayPal appears only as a label in `commerce/src/payments/contract/evidence.ts` | L | Wait for the owner's commerce restart | 826 |
| §4 Commerce later | Donations consumer plugin (L9) | OPEN (parked) | Mentioned only in `J:packages/commerce/src/payments/contract/payments-port.ts` | M | Same | 827 |
| §4 Fast site switching | Fast switching (write-up first) | OPEN (parked 10-22, owner "later") | No change | L | Parked; also §2 line 267 | 830 |
| §4 New-site password | Decide the real flow (require field / force change) | OPEN (decision) | `T:apps/website/src/features/identity/default-credential-exposure.ts:40` still uses `DEFAULT_OWNER_PASSWORD`; same as H2.2 semgrep "needs decision" | S | One owner question (pair with H2.2 decisions) | 833 |
| §4 Commerce risk | Risk scoring / geo / fraud-graph design | OPEN (parked; ask owner first) | Not started | L | Parked | 836 |
| §4 Vendor code out of core | Move the vendor code the 10-22 audit listed into plugins | DONE (one small remainder) | `T:apps/website/src/features/deployments/providers/` is gone; a vendor gate with a reasoned allowlist exists (`T:apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json`). **Left:** LiPay manifest still in core (`T:apps/website/src/features/plugins/lipay/manifest.ts`) | S (remainder) | Move LiPay with the commerce wire-in | 839 |
| §4 Email parked | Email senders phases 2–5 (forms send own mail, Automations page, sign-in secret…) | OPEN (partly) | Forms sender is in Jini (`J:packages/cms/src/forms/email-sender.ts`); admin Email tabs have no Automations page (`T:apps/admin/src/features/email/` = Overview/Provider/Sender/Templates/Activity) | M | Plan phases 3–5 when the owner un-parks email | 844 |
| §4 Email parked | Template `{{fields}}` have no data source until phase 2 | OPEN (verify) | Phase 2 sender exists (above); wiring of template fields not verified | S | Check one form-notification render with real fields | 845 |
| §4 Email parked | Senders phase 1: Jini cloud test + release | DONE | `J` `4723cbe83` (vendor-neutral email sender contract + Forms sender) is an ancestor of merge-12 = shipped in 0.7.3-next.2 | – | – | 846 |
| §4 Email parked | Decide: delete sent-email records after 30 days | OPEN (owner decision) | Implemented 500b5c5bd; owner confirmation not recorded | S | One owner question | 847 |
| §4 Email parked | Decide: auto-delete captured test emails after 24 h + "clear all" | OPEN (owner decision, Q21) | Not decided | S | One owner question | 848 |
| §4 Email parked | Guided "Connect email" flow | OPEN | No guided flow in `T:apps/admin/src/features/email/` | M | UI pass (Opus + Chrome) | 849 |
| §4 Email parked | tovu.dev: save Resend key on tovu.dev, sender address, domain verification | OPEN (owner/prod action) | Production state | S | Owner action; same as line 256 | 850 |
| §4 Email parked | Encrypted key transfer localhost → prod | OPEN (parked, owner "not right now") | – | L | Parked | 851 |
| §4 Media descriptions | Agent writes a plain description for every image (search) | OPEN | Jini media search matches name/title/alt only (`J:packages/cms/src/media/agent-tools.ts:79`); no description field | M | Add a `description` field (migration) + agent-tool write + search | 866 |
| §4 Media descriptions | Videos: describe from key frames/transcript | OPEN (owner "later") | Frame extractor exists (see line 104) | L | After line 866 | 867 |

### §5 (non-inventory)

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| §5 UI/UX plugin | kUInetic by default | DONE | `kuinetic` is its own bundled, seeded plugin: `T:apps/website/src/features/agent-plugins/bundled-catalog.ts:24`; companion delivery in `J` `8d9c0e19c` (in merge-12) | – | – | 875 |
| §5 UI/UX plugin | Each theme owns its own `/` layout + Promote | OPEN | `T:content/themes/static/tovu-theme/render/pages/index.html` still embeds `"type":"content"` (same in tovu-starter) | M | Design answer to the two open questions, then one theme-landing job (search existing preview switcher first) | 876 |
| §5 WebMCP | Admin agent tags the HTML pages it creates (post-save pass?) | OPEN (partly) | Prompt guidance only: `T:apps/website/src/contracts/core/page-html.ts:106` | S | Decide: guidance only vs post-save pass | 1080 |
| §5 WebMCP | Migrate `data-agent-*` → WebMCP `tool*` | DONE (actions) | `T:apps/website/src/features/theme/validation/markup.ts:9` "actions now use tool* forms and data-tool* actions, replacing … data-tovu-agent"; region handles kept by design (`page-html.ts:106`) | – | – | 1084 |
| §5 Fable review gap | Review the windows the 09-0x reviews skipped | DROPPED (superseded) | Replaced by the 11-11 full survey (Claude + blind Codex, SURVEY-SUMMARY) and the 11-16 security review (`T:cloud-results/security-fixes.md`) | – | – | 1304 |
| §5 Rescued | Attachment preview modal never seen rendering a decoded image | OPEN (verify) | No live evidence recorded | S | One Chrome look in the owner's localhost | 1329 |
| §5 08-10 slice | Commerce write paths + provider adapters | OPEN | `T:apps/admin/src/panels.tsx` `soon: true` for orders :843, products :861, subscriptions :888, billing :910; Jini commerce kernel + `payments-stripe` exist | L | Commerce wire-in plan when the owner restarts commerce | 1375 |
| §5 08-10 slice | Visitor-auth capability boundary + Tovu wiring | OPEN | `J:packages/capability-providers/src/visitor-auth` exists, but no Tovu import; `panels.tsx:493` `authentication` still `soon: true` | L | Plan after commerce/identity priorities (owner parked Google sign-in 11-13) | 1378 |
| §5 08-10 slice | Agent Plugin Marketplace backend + install flow | OPEN | `T:apps/admin/src/features/plugins/AgentPlugins.tsx:314` "designed empty state, not a mocked store" | L | Owner-prioritized later (plugin catalog work in Jini) | 1382 |
| §5 Reliability | Idempotency strategy for event handlers | OPEN | Per-feature keys exist (`idempotencyKey` in Jini form destinations etc.); no handler-level policy | S | Write the policy into the outbox/change-set docs; test the outbox consumer replays | 1521 |
| §5 Reliability | Error taxonomy + standard API error responses | DONE-PENDING | `T:apps/website/src/server/error-mapping/respond.ts` exists (it was INFO.md only); one error-id format `J:packages/core/src/errors/error-id.ts:2` (`ERR-XXXX…`); err-design T1/T2 on `codex/tv-err1` `6da5c1455e` | – | Merge tv-err1 in combine | 1523 |
| §5 Agent capability | Per-principal enum entity discriminator | OPEN | Not found | M | Fold into the tool-catalog work (plan) | 1535 |
| §5 Agent capability | Two-sided conformance test (read-only principal can't see/invoke write tools) | OPEN | Not found | S | One test in ToolExecutor gating | 1539 |
| §5 Agent capability | Kill-switch completeness test | OPEN | Not found | S | One test | 1541 |
| §5 Agent capability | Actor kind in the event envelope | OPEN (partly) | `principalKind: "user"\|"agent"\|"api_key"` exists for content types (`J:packages/cms/src/content-types/lifecycle.ts`, spec `cms/docs/spec/api.spec.md:374`); not on every mutation/outbox event | M | Extend to change-set/outbox envelopes | 1544 |
| §5 Agent capability | Validate capability OUTPUT schemas | OPEN | No `outputSchema` anywhere in `J:packages` | M | Add an optional output schema to tool registration + validation | 1548 |
| §5 Admin IA research | Capture admin IA of Directus/Ghost/Payload/Strapi/WP; extension patterns; IA spec | DROPPED (superseded) | "Needed before admin build". The admin is built and Jini `@jini-ai/admin` already holds the shell/registry/routing (survey line 2420) | – | – | 1571, 1575, 1578 |
| §5 Commerce research | Execute shopify_specs/TODO.md; medusa_specs/TODO.md; capability crosswalk | OPEN-backlog (parked with commerce) | Jini commerce kernel was built after the 10-21 debate; the research files were never executed | M each | When commerce restarts; also OpenSaaS comparison (§1 line 86) | 1584, 1589, 1594 |
| §5 Small UI leftovers | Email "needs attention" says "See Provider and Sender below" | DONE | `T:apps/admin/src/features/email/Email.tsx:93` now "Check the Provider and Sender & DNS tabs." (only an old-string fixture remains in `__tests__/email-i18n.unit.test.ts:56`) | – | – | 2387 |
| §5 Cookie consent test | Banner on first visit; scripts inert; privacy link | OPEN (verify) | No recorded Chrome pass after Jini 0ca4d2a1 | S | One Opus + Chrome pass on a test site covers lines 2391–2396 together | 2391 |
| §5 Cookie consent test | Reject/Accept/per-category/Do-Not-Sell save from banner UI | OPEN (verify) | Fix in Jini 0ca4d2a1; not verified live | S | Same pass | 2392 |
| §5 Cookie consent test | Persistence, server receipt, GPC | OPEN (verify) | – | S | Same pass | 2393 |
| §5 Cookie consent test | Reopen pill, policy-version re-ask, 180-day expiry | OPEN (verify) | – | S | Same pass | 2394 |
| §5 Cookie consent test | Compact look, Custom CSS allowlist, admin preview | OPEN (verify) | `panels.tsx:1138` consent still `soon: true` | S | Same pass | 2395 |
| §5 Cookie consent test | Default ON; explicit OFF wins; static export rule | OPEN (verify) | – | S | Same pass + one static deploy check | 2396 |
| §5 Cookie consent test | Cached pages from before consent (max-age 60 + swr 300) | OPEN (decision) | – | S | One owner question | 2397 |
| §5 Cookie consent test | Browser-side banner for static sites | OPEN (later) | – | M | Later | 2398 |

### §5 Master Build Inventory (lines 1600–2088), 235 items

Unless a row says otherwise, these are **OPEN-backlog**, size **L**, next step "no action; revisit when the owner prioritizes". The rows below record the exceptions and evidence.

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| §1 Kernel | Kernel responsibilities; module loader contract | OPEN-backlog | Jini composition/registries cover most of it; no written kernel doc | L | – | 1621, 1625 |
| §1 Kernel | Config system with typed schema + env validation | OPEN (in progress) | `T:cloud-results/env-schema-a.md` "PARTIAL" (11-16); owner lifted the env hold 11-20 | M | Finish env-schema (also H "config sprawl", H2.4) | 1624 |
| §2 Eventing | Event naming conventions; handler idempotency; replay strategy | OPEN-backlog | Replay explicitly deferred by ADR-022; idempotency per feature only | S / S / L | Doc the `domain.verb` convention when touching outbox | 1630, 1632, 1635 |
| §6 Search | Hybrid search, relevance tuning, contract tests | OPEN-backlog | – | L | – | 1641–1643 |
| §7 Feature modules | Workspace lifecycle events; publishing workflow module | OPEN-backlog | Scheduled publish now exists (`T:apps/website/src/contracts/core/scheduled-publish.ts:34`) | L | – | 1646, 1649 |
| §8 Theme system | Template hierarchy, slots, versioning, lifecycle hooks, safety/rollback | OPEN-backlog | ADR-017 still Proposed | L | – | 1653–1662 |
| §9 Plugin system | Lifecycle API, dependency graph, sandbox, UI/server extension points, observability | OPEN-backlog | EmDash gaps list (§1 lines 196–203) overlaps | L | – | 1667–1679 |
| §10 HTTP | Decide Fastify vs Hono | DROPPED (superseded) | Owner 11-07: no specific server in Jini; packages take `{app: Server}` (memory `no_specific_server_framework_in_jini`) | – | – | 1682 |
| §10 HTTP | Request validation/response schemas; rate limits + security headers; OpenAPI | OPEN-backlog (partly) | Zod at boundaries (Zod 4.6.7); 6 MiB + 415 compressed-body refusal in `J:packages/core/src/contracts/server/request-body.ts:27`; OpenAPI only for daemon attachments (`J:packages/server/openapi/`) | S / S / M | – | 1683, 1685, 1688 |
| §11 Admin | Extension-point rendering; notification center | OPEN-backlog | – | L | – | 1695, 1697 |
| §12 AI layer | Task/capability contract, tool registry safety, structured outputs, context pipeline, memory policy, HITL, audit trail | OPEN-backlog | Partly superseded by the 11-21 "open protocols" decision (AG-UI/ACP/MCP/A2UI) | L | Feed into r62t-protocols | 1704–1714 |
| §13 Protocols | MCP server for Tovu's own tools | OPEN (parked) | Desktop sites MCP server + hosted MCP lane H done (11-05..11-10); outside-agent steady connection **tabled by owner 11-08** (todos line 508) | L | Parked | 1717 |
| §13 Protocols | A2A boundaries; import/export contracts; WordPress ingestion agent | OPEN-backlog | site-import plugin exists (`T:content/agent-plugin-overlays/wordpress`, `site-import`) | L | – | 1722–1724 |
| §14 Testing | Test pyramid doc, `__specs__` baseline, contract tests per port, regression suite, perf smoke | OPEN-backlog | Combine runs use gates + named mutations; coverage is last (owner) | L | Covered by refactor E/N | 1731–1740 |
| §15 DevEx | Commit/PR conventions | OPEN (small) | `T:CONTRIBUTING.md` exists but covers only the dependency policy | S | Add the commit-message/attribution rules (no PRs: deploy = push to main) | 1748 |
| §15 DevEx | Environment matrix docs; codegen for typed clients | OPEN-backlog | – | S / L | – | 1749, 1750 |
| §16 Ops/Sec | SLOs, runbooks, secrets policy, vuln response policy | OPEN-backlog | Vault exists; no written policy | S–M | – | 1753, 1754, 1755, 1758 |
| §16 Ops/Sec | Dependency + supply-chain scanning | DONE | `T:.github/workflows/semgrep.yml`, `secrets.yml`; `.npmrc` `min-release-age=14` (`T:CONTRIBUTING.md:3-13`); osv/npm audit run 11-11 (`origin/cloud/quality-1111-sec`); deps upgraded (H2.1) | – | – | 1757 |
| §17 Product safety | Preflight/rollout, guided remediation, quarantine, perf budgets, template recovery, portability, provenance | OPEN-backlog | – | L | – | 1761–1771 |
| §18 Docs | `__specs__` sync, glossary, milestone roadmap | OPEN-backlog | – | S–M | – | 1774–1777 |
| §19 WP parity | Content status model (draft/scheduled/private) | OPEN (partly) | Scheduled publish built (`scheduled-publish.ts:34`); private visibility not found | S | – | 1783 |
| §19 WP parity | Revisions restore/compare UI; sticky/featured | OPEN-backlog | – | M | – | 1784, 1785 |
| §19 WP parity | Term archives; breadcrumb helper | OPEN-backlog (verify) | Jini cms has breadcrumb code (13 files mention it); public term archives not verified | S | – | 1788, 1789 |
| §19 WP parity | Editor/blocks/FSE/embeds/WYSIWYG (5) | OPEN-backlog | – | L | – | 1792–1796 |
| §19 WP parity | Theme parity (3), plugin parity (4), admin ops (3), bulk media (1) | OPEN-backlog | – | L | – | 1799–1812, 1819 |
| §19 WP parity | Cron/scheduler equivalent | OPEN (approved 11-21) | Owner approved ROUTINES (Jini daemon routines into Tovu) 11-21 ~7:20 PM; build after combine-12 | M | Routines plan (Codex 6.2) | 1822 |
| §19 WP parity | Caching strategy; safe update/rollback | OPEN-backlog | Rollback overlaps §1 line 117 | L | – | 1823, 1824 |
| §20 Payload/Directus/Ghost/strategic | 14 items | OPEN-backlog | Field-level ACL, flows builder, realtime, extension types, marketplace… none built | L | – | 1829–1848 |
| §21 Big missing | Billing, tenant lifecycle, abuse prevention, compliance, portability, DR targets, i18n strategy, a11y baseline, support tooling (9) | OPEN-backlog | Admin i18n exists for many locales; no content-i18n strategy | L | – | 1851–1859 |
| §22 AEO/GEO | AEO model, GEO graph, knowledge sitemap, anti-heist, citation intelligence, provenance, per-page outputs, IndexNow, robots builder, engine tactics, quality signals (52) | OPEN-backlog | Partial bases: `llms.txt` (`T:apps/website/src/features/site-export/route-manifest.ts`), hreflang in `J:packages/cms/src/seo/types.ts`, generic RobotsPolicy; **IndexNow and `data-nosnippet` absent** (0 hits) | L | Candidate for the "visibility" package (todos line 1016) | 1864–1940 |
| §22 Plugins | Forms conditional logic/payments; multilingual (5); membership/paywall (4) | OPEN-backlog | – | L | – | 1943–1956 |
| §22 AI surfaces/tooling | 10 items | OPEN-backlog | – | L | – | 1959–1970 |
| §22 Agentic web/Playground MCP | 8 items | OPEN-backlog | – | L | – | 1977–1984 |
| §23 Platform gaps | Governance (6), global ops (5), commercial (5), SDK (1), marketplace trust (3), release/support (5), growth/safety (6) | OPEN-backlog | – | L | – | 1989–2031 |
| §24 Tooling eval | Evaluate Zod at all boundaries | DONE | Zod adopted and upgraded to 4.6.7 (`T:package-lock.json`; `J` `673ab1363`) | – | – | 2041 |
| §24 Tooling eval | ArchUnitTS; Sheriff/good-fences; Madge | DROPPED (superseded) | Covered by `T:.dependency-cruiser.mjs`, `J:scripts/check-no-cross-package.ts`, `J:scripts/runtime-cycle-debt.json`, Tovu architecture/boundaries gates | – | – | 2042, 2048, 2051 |
| §24 Tooling eval | Nx vs Turborepo | DROPPED (moot) | pnpm workspace in Jini; Tovu npm apps; no need recorded | – | – | 2046 |
| §24 Tooling eval | Testcontainers/Pact; ts-rest/tRPC; Structurizr/C4 | OPEN-backlog | Combines already run real Postgres | S each | – | 2043, 2052, 2053 |
| §25 Reference codebases | 12 study items | OPEN-backlog | Research only | S each | – | 2066–2085 |

Inventory tally: DONE 2 (1757, 2041), DROPPED 5 (1682, 2042, 2046, 2048, 2051), OPEN 228.
- Active sized items: S ×7 (1630, 1632, 1685, 1748, 1749, 1755, 1783) and M ×3 (1624, 1688, 1822).
- The other 218 are backlog, counted as L. This includes the research items marked "S each".

---

## Part B — massive-refactor list + LATER extraction (plain bullets, lines 2403–2644)

| section | item | status | evidence | size | next step | line(s) |
|---|---|---|---|---|---|---|
| 11-05 adds | Commerce geo + fraud checks | OPEN (parked) | Needs commerce merged | L | Parked | 2404 |
| 11-05 adds | Vibe-coded apps use Tovu as admin/backend | OPEN (owner answers needed) | No `getTovu` client anywhere in `T`; Jini `@jini-ai/vibecoding` is a different thing (artifact edit loop) | L | Owner: which app first; admin address | 2405 |
| LATER extraction | S — database code lane | OPEN (in progress) | S4b, S5a–c, S6a done (`T:cloud-results/su-cms-3.md`, `su-s5-2.md`, `su-s6a.md`); S6b stopped, S7a step 0 only, S7b not started; owner 11-20 lifted the arch-120 holds (S7a/S7b unblocked) | L | Part of the 11-20 "plan ALL remaining extraction" | 2411 |
| LATER extraction | K — CMS tools lane | DONE (residual check) | `T:cloud-results/kt-K-01.md`…`kt-k10.md`: K-01..K-10 done (K-10a/b DONE) | S | Verify no K rows remain in the remaining-extraction plan | 2412 |
| LATER extraction | U — users (members, API keys) | OPEN (in progress) | `codex/tv-ext-u2`, `refresh-u2` merged into `T`; `T:apps/website/src/features/members` still 24 files | M | Re-sheet the remainder | 2413 |
| LATER extraction | T — theme engine, posts, newsletter | OPEN | `T:apps/website/src/features/theme` 85 non-test files, `post` 52, `newsletter` 24 | L | Remaining-extraction plan | 2414 |
| LATER extraction | Not in any lane (rendering/routes, publishing, backups, source control, deploy config…) | OPEN | `publish-content` 58, `site-backup` 43, `deployments` 40 files still in Tovu | L | Remaining-extraction plan | 2415 |
| LATER extraction | A real second app (notes) | DONE | `J` notes-app N2 (`89bc01b54` serves a built admin under /admin/) | – | – | 2416 |
| LATER extraction | The 78 Jini package-to-package imports | OPEN (in progress) | xpkg waves r1c..r13b, C12-OBS done (`T:cloud-results/xpkg-*.md`); incremental gate `J:scripts/check-no-cross-package.ts`; owner picked option C 11-10 | L | Finish option C (last ~16 pairs) | 2417 |
| LATER extraction | Coverage of moved code (81 Jini files <100%, 34 at 0%) | OPEN | Coverage runs last (owner rule) | L | Part of E (end of refactor) | 2418 |
| LATER extraction | Assistant document reading — more formats | OPEN (owner "not now", MEDIUM-HIGH) | `J:packages/cms/src/media/plugins/document-text/` has only `mammoth.ts`, `unpdf.ts` | M | OOXML/ODF/epub/html/eml first (small) | 2419 |
| LATER extraction | ADMIN UI extraction | OPEN (in progress) | admin-a0..j4 reports, `codex/tv-xd2-admin` merged; screens still in `T:apps/admin/src/features/*` (posts, pages, themes, plugins…) | L | Remaining-extraction plan | 2420 |
| LATER extraction | DESKTOP extraction | OPEN (in progress) | `codex/tv-ext-desktop`, `tv-xd5-desktop` merged; `cloud-results/c6.md`, `desktop-d0.md` | L | Remaining-extraction plan | 2421 |
| LATER extraction | @tovu/sdk first → Jini | DROPPED | Owner 11-20: rjk T3 dropped, keep @tovu/sdk in Tovu | – | – | 2423 |
| LATER extraction | site-chat dedupe vs Jini chat embed | OPEN | Visitor chat stays React (owner 11-18); `T:apps/site-chat/src` has no `@ag-ui` import yet (dep added `952864812a`) | M | Do with J item (1) | 2424 |
| LATER extraction | Admin shell → Jini AdminShell; api.ts transport; roles | OPEN (in progress) | admin-j1..j4; Tovu `apps/admin/src/features/roles` still present | L | Remaining-extraction plan | 2425 |
| LATER extraction | Blocker: admin App.hooks.ts imports a website server file | DONE | `T:apps/admin/src/App.hooks.ts:249,658` mention website paths only in comments; no import | – | – | 2426 |
| LATER extraction | Inject the UI kit (owner 11-10) | DONE | J4 inject decision 11-17 (`T:cloud-results/admin-j4-inject.md`) | – | – | 2427 (a) |
| LATER extraction | Tovu uses Jini `admin/security`; retire Tovu's 8k security feature | OPEN | `T:apps/admin/src/features/security` 39 non-test files; no `@jini-ai/admin/security` import in `T:apps/admin/src` | L | Port the Tovu-only behaviour into Jini, then swap | 2427 (b) |
| LATER extraction | Owner decisions (1)(2) about cross-imports and security | DONE (decided) | Decided 11-10 (inject kit; option C) | – | – | 2428 |
| LATER extraction | Extraction inventory method; FULL EXTRACTION SURVEY | DONE | Ran 11-11 (SURVEY-SUMMARY, judge reports; refactor B) | – | – | 2429, 2441 |
| LATER extraction | TOOL-CALL STRUCTURAL FIXES (1)–(7) | DONE (mostly) | tc-wave1..4 merged into Jini integ; unknown tool → 404 `UNKNOWN_TOOL` (`J` `7980239b9`, `c998f9d3e`); call progress keepalive (`47976e0f5` tc-S15). **Not verified:** adaptive screenshot deadline; Chrome tab collisions | S | One check of (6) + tab collisions | 2430 |
| LATER extraction | OPTIONAL lockfile refresh to Jini 0.7.1 | DONE (superseded) | Tovu on `@jini-ai/*` 0.7.3-next.2 (`T:cloud-results/combine-11-tovu.md` merge 11) | – | – | 2431 |
| LATER extraction | Cleanups: retire `@jini-ai/sqlite`, `cms-forms`; drop `infra` db shims; delete `commerce-server.mjs` | OPEN (partly) | `cms-forms` gone; **still present:** `J:packages/sqlite/src/index.ts`, `J:packages/infra/src/db`, `J:packages/agent-plugins/core/commerce-server.mjs`. ui-kit→ui merge DROPPED (Opus review NO) | S | One small Jini cleanup job | 2433 |
| LATER extraction | Types to core; pure helpers in core; Express abstraction | DONE (mostly) | `J:packages/core/src/contracts/` now has events, runtime, server, observability, oauth, mail…; owner 11-10 (a)(b) | – | Remainder sits in the option-C row | 2434–2437 |
| LATER extraction | Formspree parked/retired | DONE | Recorded as retired in the bundled catalog | – | – | 2438 |
| LATER extraction | SOFTWARE FACTORY agent plugin | OPEN (parked, owner "not now") | Placeholder branch only | L | Parked | 2439 |
| Args rule | Convert every touched function; script count = stage gate; framework exemptions | DONE (decision) / ONGOING | Framework signatures exempt (owner 11-20 #11); `codex/args-tv-*` jobs merged into `T`. **Pads and the rule are untouchable** (owner 11-20 ~8 PM) | – | Ratchet only; never plan pad removal | 2442–2444 |
| A Bugs | 8 HIGH + ~120 MEDIUM → open-bugs.md | — (see open-bugs triage) | Tracked in `development/open-bugs.md` | – | Separate triage | 2450 |
| A Bugs | HIGH in-app plugin routing (ui-ux-design not loaded) | DONE | kuinetic as its own seeded plugin + shadcn-ui split (`bundled-catalog.ts:21,24`); companion + top-match delivery `J` `8d9c0e19c`/`96381bc48` (in merge-12) | – | – | 2451 |
| A Bugs | Sub-item (c): render/strip the literal `<<SUBAGENT_DISPATCH>>` in the in-app prompt | DROPPED (kept by design?) | Tests pin it as the prompt prefix (`T:apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-kind-filter.unit.test.ts:151`); it makes spawned CLIs skip the repo bootstrap | S | Confirm with the owner in one line | 2451 (c) |
| B Extraction | 44% leaves / 12% mixed; ~17k over-engineering lines to cut | OPEN (in progress) | See the LATER extraction rows | L | Owner 11-20: plan ALL remaining extraction | 2452–2454 |
| C Owner-rule breaks | Tovu 486 hits (swallowed/generic errors, logic in tsx, lint-disables, process.exit, lazy imports) | OPEN (partly) / DONE-PENDING for errors | err-design: `codex/tv-err1` (plain AG-UI failure words) pending; `J:packages/core/src/errors/error-id.ts` | M | Merge tv-err1, re-run `owner-rules-audit.mjs` for the new baseline | 2457 |
| C Owner-rule breaks | Jini 4,078 hits (jini- prefix, Jini→Jini imports, Tovu IDs in Jini, Express in Jini, hard-coded model ids, per-CLI code) | OPEN (in progress) | Owner 11-21 12:50 "remove tovu from jini totally" (`codex/tv-seed-upgrade` `2ddce9e825` = jini/<id> upgrade, pending); cross-package gate; K per-CLI row below | L | Rename sheet + re-run audit | 2458 |
| D Structure | Import cycles → zero | DONE (mostly) | import-cycle-a COMPLETE for its steps, import-cycle-b-2 redo (`T:cloud-results/import-cycle-*.md`); Jini `runtime-cycle-debt.json` ratchet; combine-11 "worker graph 7 → 0" | S | Confirm S3b–S6/J2 remainder is in the plan | 2460 |
| D Structure | Complexity >10, functions >80, files >500 | DONE (gates) / DROPPED (UI) | Complexity ≤10 = CI error, size warn 50/error 80 (memory 11-13); 71 non-UI >50 done in `codex/tv-fn50-1..5` (merged); 424 UI functions **tabled for good** (11-18); 500-line files not a blocker | – | – | 2461 |
| D Structure | Duplication Tovu 13.7k / Jini 8k / 75 clone pairs | OPEN | Not re-measured | M | Re-run jscpd after extraction | 2462 |
| D Structure | Dead code (knip): unused exports/types/deps | OPEN | `J:knip.json` present; combine-8 ran knip (raw only) | M | One knip cleanup job per repo (unlinked) | 2463 |
| D Structure | Type safety: non-null `!`, ts-ignore, eslint-disable, prod `await import` | OPEN-backlog | Not targeted | L | Ratchet only | 2464 |
| E Coverage | 99% per file all metrics; failing tests; test quality; zero-coverage triage | OPEN | Coverage last (owner rule, 11-20 "100% per file + explained exceptions"); 13 admin base-reds cleared by combine-11 B2 | L | Coverage run at the end | 2466–2470 |
| E Coverage | Mutation pilot → scale Stryker | OPEN | Combines use hand-named mutations only | M | Stryker per slice after the refactor | 2471 |
| E Coverage | End-of-refactor ~10% test-quality sample | OPEN | Due at the end | M | Schedule with coverage | 2472–2473 |
| F Review rules | 16-rule checklist in every refactor review | DONE (standing) | In every brief | – | – | 2475 |
| G Size gates | Exceptions file; 50/80 gate; hooks/components file-by-file | DONE / DROPPED (UI part) | `development/scripts/size-exceptions.json`; UI functions tabled 11-18 | – | – | 2476–2482 |
| H classes | Silent truncation (limits without a cursor) | OPEN (partly) | Members list now a cursor page (`T` `3ece3c049f`); Jini list-page contract `64619ab41`; newsletter 100 / keys 50 / visitor assistant 20 not verified | M | Sweep the listed sites with the `list-cursor.md` pattern | 2486 |
| H classes | Lost updates (no revision check) | OPEN (partly) | S1 (external MCP) done (`T:cloud-results/lu-s1.md`); S3 not started | M | Remaining stages of `designs/lost-updates/DESIGN.md` | 2487 |
| H classes | Stop not reaching writes | OPEN (partly) | `codex/tv-abort` merged (consent draft/publish, `361718ac0b`); pattern `development/refactor-patterns/abort-before-write.md` | M | Sweep the remaining 72/28 sites | 2488 |
| H classes | Declared but unenforced permissions | DONE (Tovu) | `T` `70252d6c6d` withAdminAssistantPermission (A5). Jini agent-plugin search tool not verified | S | Check the Jini search tool | 2489 |
| H classes | Hung Express handlers | DONE | `asyncRoute` (`T` `84c4a9c000`, now in platform/http `7030b5e745`); `T:cloud-results/fix-hang-bugs.md` found the class fixed | – | – | 2490 |
| H classes | `.replace(x, nonFunction)` `$` expansion | OPEN | No fix commit; the Codex verdict also says the audit miscounts (line 2611) | S | Fix the audit check, then a codemod to function replacers | 2491 |
| H classes | Secrets in logs (bootToken behind a flag) | DROPPED | Intentional, behind a flag | – | – | 2492 |
| H classes | Missing translations (ChatFab hi/ur/bn; 27 empty keys; hard-coded JSX English) | OPEN | Not verified fixed | S | i18n sweep job | 2493 |
| H classes | Version-pin drift (charts-recharts) | DONE | Combine-11 B2 (`a9bcf2a9f`) repinned to the 0.7.3-next.2 artifact; Jini plugin folders no longer versioned (`J:packages/provider-plugins/src/charts-recharts/`) | – | – | 2494 |
| H classes | Config sprawl (165 env vars; one env schema per repo) | OPEN (in progress) | `env-schema-a` PARTIAL; `TOVU_DEV_OWNER_SIGNIN` now documented in `T:.env.example` (`ba5956f34f`) | M | Finish env-schema (with H2.4 overlaps) | 2495 |
| H classes | Stale comments citing missing paths | OPEN (partly) | Tovu dead targets cleared: `server/deps.ts` refs 94 → 2 files, `server/app.ts` 105 → 7 (`git grep -l` on `T`); Jini `source-map.md` still cited in 26 `packages/ui` files | S | One search-and-replace job in Jini | 2496 |
| H classes | Runtime dependency vulns; SEC cloud run; osv; semgrep; floating promises | DONE | See the H2.1 row; `T:.github/workflows/semgrep.yml` | – | – | 2497, 2499–2502 |
| H classes | Dead `@jini-ai/ui/lexical-rich-text-editor` | DONE | `J` `0bf610e75` refactor(ui)!: delete the unused lexical-rich-text-editor subpath | – | – | 2498 |
| H classes | a11y lint (admin 74, Jini 65) | OPEN (partly) | See H2.3 | S | – | 2503 |
| H2.1 | Package upgrades (handlebars, nodemailer, drizzle, liquidjs, sharp, undici, body-parser, zod, electron, MCP SDK, proxy-addr, dev criticals) | DONE | `T:package-lock.json`: handlebars 4.7.10, nodemailer 10.3.1, drizzle-orm 0.45.2, liquidjs 10.27.2, sharp 0.35.5, undici 7.30.2, body-parser 1.20.9, zod 4.6.7, astro 7.2.10, shell-quote 1.12.0; `T:apps/desktop/package-lock.json`: electron 43.8.6, MCP SDK 1.32.2, proxy-addr 2.0.8; Jini `fa9864fcb` (undici/sharp/dompurify), vitest 3 (`a1cda3baf`) | – | – | 2512–2523 |
| H2.2 | Semgrep "needs decision": new-site default password; dev CORS in every mode; menu widget html mode | OPEN (3 owner decisions) | `default-credential-exposure.ts:40`; no change commits | S | One owner question set (merge with line 833) | 2526–2529 |
| H2.3 | a11y real: QuestionForm | DONE | `J` `27db3cbd6` fix(chat): QuestionForm controls expose aria-required and help text | – | – | 2532 |
| H2.3 | a11y real: PaletteTweaks keyboard; ResourceCard/AssetTreeRow menus (arrows/Escape); captions decision | OPEN | No fix commits found | S | One Jini ui a11y job + owner question on captions | 2533–2536 |
| H2.4 | Env overlaps to merge/document (STOP_ON_STDIN_EOF, pinned-site trio, parent-pid quartet, site-address quartet, PG styles, unprefixed names) | OPEN | Part of env-schema | M | Same as config sprawl | 2538–2547 |
| H2.6 | Promises: real bugs (auth/me, 37 credential routes, Jini settings wrap, settings feed, newsletter confirm, editor uploads, Discard banners, desktop quit, tracker.metric, folder tab) | DONE | `T:cloud-results/fix-hang-bugs.md`: fixed or already safe, with tests | – | – | 2549–2567 |
| H2.6 | AssistantDock mode/model save failure → 5 s toast (owner decided 11-12) | OPEN (verify) | No matching commit found | S | Check `AssistantDock.hooks.tsx` save paths; add it if missing | 2568 |
| H2.6 | 4 handlers whose catch awaits (users/create.ts:76, commerce purchase.ts 176/190/191) | OPEN (decision) | fix-hang-bugs left them as they are | S | Owner/coordinator decision | 2568 |
| I Performance | Media page: lazy-load the grid + cursor paging | OPEN (partly) | `<img loading="lazy">` (`T:apps/admin/src/features/media/Media.tsx:284,1549`); no cursor/next-page in `T:apps/admin/src/features/media` although Jini media returns `nextCursor`. Owner 11-20 asked for a Codex 6.2 Performance plan | M | Paged fetch + virtualized grid (Opus + Chrome) | 2571 |
| J AG-UI | One chat protocol: site chat on AG-UI, frontend tools, HITL shape, shared state, one adapter in Jini | OPEN (in progress, owner "start now" 11-20) | agui-s1 PARTIAL (`T:cloud-results/agui-s1.md`); tv-ag1 moved the drain to Jini (combine-11 merge 4); Jini `7bfd293f7` phase-1 AG-UI/ACP adapters (in merge-12); `T:.../composition/modules/assistant-ag-ui.ts` still 18.6 KB; site chat not on AG-UI | L | r62t-protocols plan → S2+ | 2573–2581 |
| J AG-UI | Chart pin version-independent (digests, not version folder) | OPEN (partly) | Pin is a 62-file digest map but still keyed by version (`RECHARTS_BROWSER_APPROVAL` 0.7.3-next.2, combine-11 B2) | S | Key the approval on digests only | 2578 |
| J AG-UI | MCP Apps (standard `_meta.ui.resourceUri`, extensions, third-party render, theming…) | OPEN | Not started | L | After AG-UI S2 (protocols plan) | 2581 |
| K ACP | ACP for Jini agent adapters | OPEN (in progress) | Owner 11-20: repair the ACP v1 client + OpenCode-only pilot; `J` `7bfd293f7` ACP-J1/J2 in merge-12 | M | Parity checklist (resume, model/effort, cancel, permissions, real tool call) before enabling OpenCode | 2583–2585 |
| L Desktop general chat | One general desktop chat | OPEN (parked by owner 11-20) | – | L | Parked | 2587–2591 |
| M Observability | trackOperation around tool calls, publish, backup, deploy, import | OPEN (partly) | Tovu uses it only for `site.backup` (`T:apps/website/src/features/site-backup/backup-service.ts:733`); Jini 12 files; tv-po added import verify/restore traces | M | Codex 6.2 Observability plan (owner 11-20) | 2595 |
| M Observability | Metrics: counters/histograms | OPEN (partly) | `J` `9d56ea580` operation + run outcome counters; tool-call failure counts by tool and queue depth not found | M | Same plan | 2597 |
| M Observability | AI usage on agent-run spans (model, tokens, cost) | OPEN | `J:packages/provider-plugins/src/observability-opentelemetry/otel-port.ts:177-178` sets only operation/agent name/conversation id | S | Add `gen_ai.usage.*` + model/provider | 2598 |
| M Observability | traceparent across processes | DONE | `J` `ae8986bd2`/`9d56ea580` engaps J1–J3 (carrier, trusted parentage), in merge-12 | – | – | 2599 |
| M Observability | Browser-side tracing (admin, site chat, public) | OPEN | No browser adapter (0 web-vitals hits) | M | Same plan | 2600 |
| M Observability | Background work gets root traces | DONE | tv-po merged (`T` `3d3a060813`): `serving-app-trash-sweep.test.ts`, `serving-app-domain-binding-sweep.test.ts` | – | Outbox worker not verified | 2601 |
| Open decisions | Args exemptions; permanent-delete tools; publish implies edit_html; owner-only re-enable | DONE (decided) | Owner 11-20 #11, all recommendations accepted | – | – | 2603–2606 |
| Execution model | Fable designs, Sonnet/Codex volume… | DROPPED (superseded) | Owner 11-21 ~7:30 PM: Opus plans (cloud), Codex 6.2 verifies, Opus subagents implement | – | – | 2607 |
| Codex trials | Terra MAX trial; tier verdict | DONE | Verdict 11-13; later Sol-only, never Luna (memory) | – | – | 2609, 2611 |
| Codex trials | Gate gaps: replace-check miscount; root tsconfig skips tests/admin | OPEN (partly) | Combine gate sets now run admin tsc + typecheck:tests (combine-11 Setup); replace check not fixed | S | Fix `bug-class-audit.mjs` replace check | 2611 |
| Repo junk | `apply-loop.test.ts-e` sed backup | DONE | `T` `b0a412fffc` chore: delete stray sed backup apply-loop.test.ts-e | – | – | 2613 |
| Owner decisions 11-14 | Permanent-delete tools, cognitive complexity for components, D6, Q-M1/M3/M4, Q4 6 MiB, D1–D3, Q5 415 | DONE (decided / built) | Q5/Q4: `J:packages/core/src/contracts/server/request-body.ts:3,21,27` (size ceiling + compressed-body refusal) | – | – | 2615–2622 |
| Owner decisions 11-14 | Trash retention: 60 days in code vs owner's 30 | OPEN (decision) | `T:apps/website/src/features/trash/ports.ts:33` `TRASH_RETENTION_DAYS = 60` | S | Ask the owner (one line) | 2616 |
| Owner decisions 11-14 | Q-M2 (can the AI mark image/video/audio itself?) | OPEN (decision) | Still open | S | Owner question | 2620 |
| N Practices | CI gates, failing-test-first, secret scan, changesets, review, observability contract, SAST, supply-chain min age, public API check | DONE | Semgrep/secrets workflows (`T:.github/workflows/`); `.npmrc` min-release-age (`T:CONTRIBUTING.md`); Jini `api-baseline/` + `api:check` (combine-12); C12-OBS (`T:cloud-results/xpkg-c12obs-r12.md`) | – | – | 2625–2638 |
| N Practices | Mutation testing (Stryker) scale-up; property/fuzz tests; performance budgets | OPEN | Not set up | M each | After the refactor | 2632, 2636, 2637 |
| N Practices | Renovate | OPEN (parked: off until ramp-up) | No renovate config in `T` | S | Parked | 2634 |
| K per-CLI folders | Per-CLI executor code → `agent-runtime/src/defs/<cli>/`; xAI vendor code → provider plugin | OPEN | `J:packages/daemon/src/agent-executor/{claude,codex,gemini,antigravity,amr}` still exist; `J:packages/daemon/src/http/xai.ts` 47 KB | M | Fable/Opus design → Codex verify → implement (after R8) | 2641–2644 |

---

## OPEN, grouped for planning

### 1. Finish the Tovu → Jini extraction (owner top priority 11-18/11-20) — L
- Lanes:
  - S remainder: S6b, S7a, S7b.
  - U remainder.
  - T (theme 85 files, post 52, newsletter 24).
  - Left-out survey areas: publish-content 58, site-backup 43, deployments 40, rendering/routes.
- Admin UI screens and admin shell/transport/roles.
- Desktop.
- Tovu security feature → Jini `admin/security`.
- Cross-package option C, last ~16 pairs.
- Small Jini cleanups (S): retire `@jini-ai/sqlite`, the `infra/src/db` shims and `agent-plugins/core/commerce-server.mjs`.
- "Remove Tovu from Jini totally": the rename sheet, after `codex/tv-seed-upgrade` merges.
- Refs: 2411–2437, 2457–2458.

### 2. Open protocols: AG-UI everywhere + ACP + MCP Apps — L
- Site chat onto AG-UI.
- AG-UI human-in-the-loop instead of CUSTOM events.
- Move the remaining `assistant-ag-ui.ts` into Jini.
- ACP client repair + OpenCode parity pilot.
- MCP Apps.
- Chart pin keyed on digests only (S).
- Refs: J, K, 2424, 2573–2585.

### 3. Observability gaps (approved 11-14; plan owed by Codex 6.2) — M
- trackOperation for tool.call, publish, deploy, import.
- Tool failure counters and queue depth.
- `gen_ai.usage` tokens/cost (S).
- Browser adapter, off by default.
- Verify the outbox worker trace.
- Ref: M 2595–2601.

### 4. Bug-class sweeps (scripts already exist) — M
- Silent truncation via list-cursor (newsletter, keys, visitor assistant).
- Lost-updates stages after S1.
- Abort-before-write sweep.
- `$`-replace codemod + fix the audit check.
- Translations sweep (ChatFab hi/ur/bn, empty keys).
- Jini stale `source-map.md` comments (S).
- Jini ui a11y menus/palette.
- Knip dead-code pass.
- Duplication re-measure.
- Refs: H, H2.3, D.

### 5. Env schema (one per repo) + overlapping env names — M
- Refs: 1624, H config sprawl, H2.4.

### 6. Media — S–M
- `.mov`/quicktime accept + HEVC note.
- One size limit (Library 10 MB vs Media 50 MB).
- Transcode tool over 50 MB.
- Media grid cursor paging (Performance I).
- Description field for search.
- Refs: 102–108, 866–867, 2571.

### 7. Owner decision batch (all S, one message)
- New-site password flow (833 + H2.2).
- Dev CORS outside dev.
- Menu-widget HTML mode permissions.
- Trash retention 60 → 30?
- Q-M2.
- Sent-email 30-day delete (847).
- Test-email auto-delete (848).
- Cached pre-consent pages (2397).
- Captions for video/audio.
- 4 catch-await handlers.
- Confirm the `<<SUBAGENT_DISPATCH>>` prompt prefix stays.
- Theme `/` layout design questions (876).
- Tool page-tagging post-save pass (1080).

### 8. Verification passes (Opus + Chrome, owner's localhost) — S each
- Cookie-consent thorough test (2391–2396).
- Attachment preview modal (1329).
- AssistantDock save-failure toast (2568).
- Gemini chat re-check (303).
- Tool-call screenshot deadline / Chrome tab collisions (2430).

### 9. Production email (CRITICAL, owner action) — S
- tovu.dev provider + Resend key + sender/domain (256, 850).
- Later: guided connect flow (849) and email phases 3–5 (844).

### 10. Update a deployed site from production — L
- Contract-first plan: update-available check, one-click/chat update, backup + readiness gate + rollback, same path for desktop/self-hosted.
- Refs: 112–122.

### 11. Agent-capability hardening — S–M
- Output-schema validation.
- Actor kind on every mutation/outbox event.
- Read-only two-sided conformance test.
- Kill-switch completeness test.
- Per-principal discriminator.
- Event-handler idempotency policy.
- Refs: 1521, 1535–1548.

### 12. Per-CLI folders + xAI to a provider plugin — M
- Refs: K 2641–2644.

### 13. End of refactor (owner: last) — L
- Coverage to 100%/99% per file with explained exceptions.
- 10% test-quality sample.
- Stryker scale-up.
- Property/fuzz tests on parsers.
- Performance budgets.
- Refs: E, N.

### 14. Parked or backlog (no action now)
- Commerce: PayPal, donations, risk/geo/fraud, write paths, research.
- Visitor-auth.
- Marketplace backend.
- Fast site switching.
- Vibe-coded apps (needs owner answers).
- Software factory.
- Desktop general chat.
- Document formats (MEDIUM-HIGH, "not now").
- Renovate.
- Outside-agent MCP.
- Encrypted key transfer.
- Theme `/` layout once designed.
- The 228 Master-Inventory backlog items.
