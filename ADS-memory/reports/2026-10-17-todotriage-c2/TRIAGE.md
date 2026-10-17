# todos.md triage — 2026-10-17 (todotriage-c2)

Source: `development/todos.md` (3,066 lines) at 2026-10-17, triaged by 7 read-only Codex jobs (gpt-6.1-sol, high) against current Tovu + Jini code and git history. Raw shard outputs: `out/s1.md` … `out/s7.md`; prompts: `prompts/`. todos.md was NOT edited.

## Summary

Rows classified: 784 (section rows + inner items).

| class | count |
|---|---|
| DONE | 216 |
| STALE | 35 |
| PARKED | 173 |
| OPEN | 360 |

OPEN split: 158 real backlog items + 202 rows from the 'Master Build Inventory (Everything)' section (lines 1632-2166), which is an aspirational platform checklist, not a worklist — listed separately below. OPEN (non-inventory) by owner: CODEX=90, UI=38, OWNER=30.

Per shard (lines): s1 1-420, s2 421-867, s3 868-1256, s4 1257-1631, s5 1632-2166, s6 2167-2706, s7 2707-3066.

Spot-check: 13 random DONE claims re-verified by hand (s1-08, s1-14, s1-19, s1-29, s1-34, s1-111, s1-164, s2-05, s2-54, s3-14, s3-32, s7-105, s7-139) — all 13 hold (cited commits exist and the cited file:line shows the behavior). charts-recharts (s1-52) re-checked by hand on owner request: npm registry 404 (unpublished), bundled provider fc380214d, admin import dropped 4004ea3f4, no Tovu/lockfile references, Jini source private 55930549 — reclassified OPEN → DONE. Rows whose evidence says 'unverified' are OPEN by rule, not by finding.

Caveat: 'size' and 'who' are Codex guesses. PARKED = owner said later/not now; those stay in todos.md unless the owner drops them.

## OPEN — ranked HIGH → LOW (then S → L)

| pri | size | who | line | section | item | what's left / evidence | id |
|---|---|---|---|---|---|---|---|
| HIGH | S | OWNER | 353 | Worklist/Security | Rotate exposed GitHub and NVIDIA credentials | Unverified external credential rotation; code/git cannot establish provider-side revocation. | s1-162 |
| HIGH | S | CODEX | 1426 | Active / samples | Include meta description in ContentEntryDraft | `packages/sdk/src/index.ts:94` lacks the field; `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/plugin.ts:24` explicitly explains why the check skips. | s4-42 |
| HIGH | S | CODEX | 1534 | Agent capabilities | Reject registrations missing authorization policy at boot | `../Jini/packages/core/src/tool-registry.ts:270` checks duplicate IDs but does not runtime-validate policy presence; TypeScript requirements do not supply the requested boot rejection. | s4-62 |
| HIGH | S | OWNER | 2983 | Hardwiring cleanup | Decide whether public assistant may load React | `82d5b86eb` provides lazy React and vanilla variants; final product choice remains unverified. | s7-96 |
| HIGH | M | UI | 90 | Long-chat memory | Window older messages and verify reduced tab memory | Jini fc592b9f lazily mounts panels and caps collapsed text; MessageList.tsx still renders every message. Browser memory acceptance remains unverified. | s1-36 |
| HIGH | M | CODEX | 355 | Worklist/Security | Provide UI site-key rotation with credential re-encryption | SiteKeyTab.tsx:29 explicitly has no rotate/replace; system/site-key.ts:99 says Generate never rotates or overwrites. | s1-163 |
| HIGH | M | CODEX | 598 | MCP Server | Generate the actual installed MCP launcher command | `apps/admin/src/features/providers/Providers.tsx:274` confirms the fake `/path/to/cli.js` command remains underneath inert presentation; resolve the actual launcher path. | s2-37 |
| HIGH | M | OWNER | 1227 | Fable review handoff | Confirm gateway refund payload contract | Unverified gateway contract. Jini `packages/commerce/src/payments/providers/lipay-gateway.ts:287` forwards charge amount for refund events; owner must confirm real payload semantics. | s3-35 |
| HIGH | M | CODEX | 1398 | Active / samples | Live-verify Tier-3 sample and provide owner commands | `apps/website/src/features/plugins/store/store-plugin.ts:25` remains an unmounted adapter; completed live-verification handoff is unverified. | s4-37 |
| HIGH | M | UI | 1415 | Active / samples | Visually verify Testimonials + FAQ sample | Unverified; `ADS-memory/reports/2026-10-04-aw7-tier1-declarative-plugin-missing-primitives.md` explicitly still owes accordion, carousel, Collections, and install-dialog checks. | s4-38 |
| HIGH | M | UI | 1424 | Active / samples | Verify analyzer editor states, locales, and enable toggle | Unverified; `ADS-memory/reports/2026-10-04-aw7-tier2-dx-pain.md:104` still lists visual checks; no matching journey coverage found. | s4-40 |
| HIGH | M | CODEX | 1540 | Agent capabilities | Generate principal-specific entity enums and permission-version caches | `../Jini/packages/cms/src/entries/agent-tools.ts:103` still publishes a free-string type discriminator; principal-specific enums and permission-version caching remain unverified. | s4-64 |
| HIGH | M | CODEX | 1544 | Agent capabilities | Test read-only tool invisibility and invocation refusal together | Invocation refusal exists at `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts:331`; paired principal-filtered advertisement assertion remains unverified. | s4-65 |
| HIGH | M | UI | 2664 | Deployment | Verify real-host deployment from the admin interface | Unverified: real-host success evidence not found. [adapter.ts:456](/Users/la/Programming/Tovu/apps/website/src/features/deployments/static-publish/adapter.ts:456) implements export/publish, but source existence does not establish a successful deployment. | s6-25 |
| HIGH | M | OWNER | 2885 | EmDash gaps | Decide portable JSON plugin-data contract | `apps/website/src/features/plugins/data-module.ts:344` still constructs per-plugin table names; replacement requires the recorded owner decision. | s7-15 |
| HIGH | M | CODEX | 2986 | Hardwiring cleanup | Confine Fly settings and GitHub-for-Fly configuration to Fly ownership | `apps/website/src/features/deployments/deploy-config.ts:351` still reads Fly configuration into the shared deployment descriptor. | s7-98 |
| HIGH | M | CODEX | 2990 | Hardwiring cleanup | Generate each host configuration independently of fly.toml | CLI `deploy-config.ts:100` calls shared descriptor builder; that builder derives app, volume, and Dockerfile settings from fly.toml. | s7-102 |
| HIGH | L | CODEX | 596 | MCP Server | Wire a real integrations port into settings | `apps/admin/src/features/providers/Providers.tsx:286` still passes no port; replace the fake-backed setup with daemon status and installation data. | s2-36 |
| HIGH | L | CODEX | 1165 | Fable review handoff | Reconcile and review deliberately skipped areas | Unverified checklist closure; `ADS-memory/reports/2026-09-29-opus-review-summary.md:3` documents a bounded review and exclusions, not reconciliation of this list. | s3-34 |
| HIGH | L | CODEX | 1416 | Active / samples | Complete remaining declarative-plugin primitives | Unverified remainder; `ADS-memory/reports/2026-10-04-aw7-tier1-declarative-plugin-missing-primitives.md` lists unresolved primitives #4–11, including media fields and declarative presets. | s4-39 |
| HIGH | L | UI | 1426 | Active / samples | Implement plugin-contributed admin UI surface | ADR-025 defines isolation requirements; completed plugin admin-UI extension surface remains unverified. Existing analyzer card is host-owned. | s4-43 |
| HIGH | L | CODEX | 2882 | EmDash gaps | Harden site plugins with an actual security sandbox | `apps/website/src/features/plugin-runtime/host-binding.ts:50` explicitly states workers remain unsandboxed and can import `node:fs`. | s7-12 |
| HIGH | L | CODEX | 2883 | EmDash gaps | Add publisher signatures and minimum release age | Checksums and consent exist; `host-binding.ts:56` still rejects verified-publisher tier because its sandbox does not exist. Signing remains unverified. | s7-13 |
| HIGH | L | CODEX | 2884 | EmDash gaps | Complete every-suite dialect coverage | Shared migrations exist at `apps/website/src/platform/db/migrations/index.ts:63`; exhaustive suite coverage across dialects remains unverified. | s7-14 |
| HIGH | L | OWNER | 2886 | EmDash gaps | Approve public MCP OAuth and scoped-token design | Public callbacks and MCP clients exist; the requested inbound OAuth server and plugin scopes remain unverified. Security ruling still needed. | s7-16 |
| HIGH | L | CODEX | 2887 | EmDash gaps | Implement database-independent fenced logical site export/import | Complete fenced logical archive remains unverified; `apps/website/src/features/site-backup/sources.ts:330` still limits backup snapshots to SQLite. | s7-17 |
| HIGH | L | CODEX | 2977 | Hardwiring cleanup | Finish replacing remaining global registries with injected ownership | Many ports landed in `aec57932c`; `apps/website/src/features/publish-content/type-registry.ts:658` still holds mutable module-level contributors. | s7-90 |
| MED | S | CODEX | 37 | Next session | Determine how Plannie enabled visitor AI without credentials | Unverified historical cause; 3167afa9b closes enable/render paths, but inspected history does not establish who enabled it. | s1-07 |
| MED | S | UI | 39 | Next session | Verify Plannie widget disappears with toggle off | Unverified live Plannie state; source guards exist, but its rendered public page still needs checking. | s1-09 |
| MED | S | UI | 275 | Chat/landing followups | Replace post-image shimmer with suitable entrance animation | content/themes/static/tovu-theme/render/pages/posts-default.html:42 still applies fade-up 600ms distance:18px to the article. | s1-124 |
| MED | S | UI | 298 | Worklist/Desktop | Measure card-preview settle and debounce timing | apps/desktop/main.ts:902/:908 still uses 1200/1500ms; measured timing justification remains unverified. | s1-131 |
| MED | S | UI | 349 | Worklist/Testing | Verify real provider switching preserves each saved API key | byok.pins.journey.ts:962 tests fake-provider isolation; live Anthropic/OpenAI round-trip switching proof remains unverified. | s1-160 |
| MED | S | OWNER | 360 | Worklist/Owner | Verify Codex GitHub app access to four AINSEP repositories | Unverified external GitHub-app repository permissions; unavailable through the allowed source/history reads. | s1-166 |
| MED | S | UI | 364 | Worklist/Uncertain | Verify three extra demos and live capabilities carousel | README.md:14 now includes four-task capabilities reel; database-backed landing-carousel completion remains unverified. | s1-168 |
| MED | S | UI | 365 | Worklist/Uncertain | Verify gold hovers, lede and FOUC fixes on production | Unverified tovu.dev rendering; tracked source/history cannot establish deployed page, database and CSS state. | s1-169 |
| MED | S | OWNER | 510 | Entry envelopes | Decide cleanup of two production probe rows | unverified production state; `todos.md:485` says rows remain. Decide repair versus deletion; the code fix does not clean existing rows. | s2-24 |
| MED | S | CODEX | 538 | Plugin installation | D5: Verify dev-link gating and integrity requirements | unverified: no current dev-link mode or gate found. Integrity checks exist at `../Jini/packages/plugins/src/host/node/loader.ts:138`; reconcile the old requirement. | s2-29 |
| MED | S | OWNER | 600 | MCP Server | Decide hosted-production behavior for a working server tab | `apps/admin/src/features/providers/Providers.tsx:273` presents the same inert tab everywhere; choose hosted behavior before enabling the live port. | s2-38 |
| MED | S | UI | 889 | Remote media import | Verify Gemini image generation through chat | Unverified live credentials/generation. `apps/website/src/features/media-generation/agent-tools.ts:116` confirms saved-key-first, environment-second resolution; browser generation check remains. | s3-01 |
| MED | S | OWNER | 986 | Unified operator chat | Approve Runner unified-chat architecture | `ADS-memory/reports/architecture/ADR-060-runner-unified-operator-chat.md:3` remains PROPOSED and explicitly requires owner sign-off. | s3-04 |
| MED | S | OWNER | 1094 | SPEC-006 remainder | Approve amended identity specification | `ADS-memory/specs/006-identity-and-authorization/feature.spec.md:14` remains DRAFT; checkpoint still owed despite shipped API-key plumbing. | s3-20 |
| MED | S | OWNER | 1096 | SPEC-006 remainder | Approve API-key issuance architecture | `ADS-memory/reports/architecture/ADR-INDEX.md:62` retains PROPOSED status; implementation exists, but architecture sign-off remains unverified. | s3-22 |
| MED | S | OWNER | 1129 | Embeds formalization | Decide and document Post embedding scope | Unverified formal decision; `ADS-memory/specs/043-widgets/feature.spec.md:233` specifies page resolution, while current rendering supports both Posts and Pages. | s3-26 |
| MED | S | OWNER | 1133 | Embeds formalization | Decide asset-default versus insertion-specific sizing ownership | Unverified ownership ADR; `ADS-memory/specs/021-media-assets/state.spec.md:77` describes transform dimensions, not the per-asset versus insertion policy. | s3-27 |
| MED | S | UI | 1237 | Fable review handoff | Observe attachment modal displaying a decoded image | Browser verification unverified. Jini `packages/chat/src/react/components/AttachmentPreviewModal.tsx:55` renders an image, but source/unit tests do not establish live decoding. | s3-36 |
| MED | S | CODEX | 1562 | Agent capabilities | Return full entity schema on validation errors | Jini registration-kit appends tool inputSchema; `../Jini/packages/cms/src/entries/errors.ts:78` retains field errors without the content type’s complete schema. | s4-70 |
| MED | S | OWNER | 2709 | Footer links | Decide availability policy for raw URL menu items | `../Jini/packages/cms/src/navigation/resolver.ts:213` still marks raw URLs available unconditionally. | s7-01 |
| MED | S | UI | 2834 | Visitor credential bug | Reproduce dock opening without corrupting saved credential form | `852b83c1c`, `275ab4571`, `55ed187a6` address related state issues; exact browser scenario remains unverified. | s7-05 |
| MED | S | UI | 2942 | Chart plugins | Complete owner-requested visual Playground and chat verification | Prototype and extraction landed; exact requested live-chat visual acceptance remains unverified. | s7-64 |
| MED | S | UI | 2991 | Hardwiring cleanup | Visually verify lazy Observability-only devtools | `c348ee3ba` implements lazy tab loading; owner-requested visual acceptance remains unverified. | s7-103 |
| MED | S | UI | 2994 | Subagents | Complete toggle browser verification and queued acceptance checks | Implementation is present; exact danger-dialog, persistence, and dock-indicator browser acceptance remains unverified. | s7-104 |
| MED | M | UI | 50 | Next session | Copy local credentials through registry and secure picker | 9b20083b6/d20760aa8 implement vault copy, tool and Security dialog; requested copy affordance on every key form remains unverified. | s1-17 |
| MED | M | CODEX | 87 | Performance diagnosis | Expose on-demand page heap and DOM diagnostics | Unverified tool implementation; diagnostics web-evidence inspects pages, but requested heap, hidden-panel and long-task report was not established. | s1-35 |
| MED | M | CODEX | 191 | Owner decisions | Show real failure reasons throughout the product | Unverified complete coverage; AgentFailureCard.tsx:9 shows reasons, but publish-content/destination.ts:118 and bundle-create.ts:206 retain generic internal errors. | s1-91 |
| MED | M | CODEX | 200 | Owner decisions | Offer user-configurable public-file protection | Unverified setting; media-rendition.ts:383 intentionally permits unreferenced assets, so the claimed published-referrer-only premise is incomplete. | s1-101 |
| MED | M | UI | 201 | Owner decisions | Complete user-management controls and default-password guidance | Unverified reset explanation/banner details; Jini-backed Users exists, but the complete mixed UI requirement needs browser review. | s1-102 |
| MED | M | UI | 277 | Chat/landing followups | Show thumbnails for generated and imported chat images | Unverified end-to-end behavior; media-generation/tool-registrations.ts:322 returns metadata objects; ToolCard expects renderable image media blocks. | s1-125 |
| MED | M | CODEX | 279 | Chat/landing followups | Replace kUInetic lightbox glyphs with configurable SVG controls | Unverified upstream completion; no kUInetic source change established in Tovu/Jini history; upstream repository work remains. | s1-127 |
| MED | M | CODEX | 281 | Chat/landing followups | Give page tools the active theme’s actual token vocabulary | apps/website/src/features/pages/agent-tools.ts:105 still hardcodes --fg guidance; active-theme token injection remains unverified. | s1-128 |
| MED | M | UI | 299 | Worklist/Desktop | Add first-run agreement screen | Unverified implementation; targeted desktop source/history search found no first-run Agree flow. | s1-132 |
| MED | M | CODEX | 300 | Worklist/Desktop | Ship comprehensive third-party and Electron license notices | Renderer public/THIRD_PARTY_NOTICES.md covers fonts/kUInetic; comprehensive dependency notices and Chromium-license packaging remain unverified. | s1-133 |
| MED | M | UI | 302 | Worklist/Desktop | Perform toolbar/history and restart hand checks | Unverified manual acceptance; automated journeys exist, but source and release tags do not prove the requested click-through. | s1-135 |
| MED | M | UI | 305 | Worklist/Plugins | Replace Installed/Downloaded split with one switchable plugin list | apps/admin/src/features/plugins/AgentPlugins.tsx:410 still renders Downloaded; :195 directs users to assistant for uninstalling added plugins. | s1-136 |
| MED | M | UI | 322 | Worklist/Chat | Refresh posts after assistant edits and follow slug changes | use-post-editor.hooks.ts:1093 now replaces saved-slug URL; assistant-driven editor reload/subscription remains unverified. | s1-140 |
| MED | M | CODEX | 323 | Worklist/Chat | Refresh Theme Explore for external file additions and removals | features/themes/hooks/use-theme-explore.hooks.ts:45 explicitly leaves file-list shape unchanged; :1192 refreshes text/modified state only. | s1-141 |
| MED | M | UI | 324 | Worklist/Chat | Finish whole-admin translation and literal call-site sweep | 7ca31526d/303a9cbd0 translate many gaps; whole-admin literal/call-site closure remains unverified. | s1-142 |
| MED | M | UI | 325 | Worklist/Chat | Resolve 3b footer-fetch, widget-paste and review follow-ups | Unverified mapping/closure; later settings-request coalescing does not prove all three old handoff items resolved. | s1-143 |
| MED | M | CODEX | 326 | Worklist/Chat | Record MCP tool hints when enabling and reapprove drift | Jini mcp/src/federation/tool-approvals.ts:22 stores admitted hints for call approval; enable-time baseline persistence remains unverified. | s1-144 |
| MED | M | CODEX | 327 | Worklist/Chat | Add default-protected public-file setting | Unverified setting; public-http/routes/site/media-rendition.ts:383 currently permits legacy/unreferenced media while checking gated references. | s1-145 |
| MED | M | CODEX | 328 | Worklist/Chat | Prevent Claude interim narration leaking above final answers | Unverified current reproduction/fix; inspected runtime history did not establish a correction; reported history path needs regression proof. | s1-146 |
| MED | M | CODEX | 329 | Worklist/Chat | Deduplicate persisted Claude tool_use events by ID | Unverified current fix; execution is not duplicated, but persisted-event deduplication still needs tracing and regression proof. | s1-147 |
| MED | M | UI | 344 | Worklist/Testing | Hand-check desktop, public site and admin before release | Unverified hand-check completion; apps/desktop/RELEASING.md and packaged journeys prescribe checks without proving their execution. | s1-155 |
| MED | M | UI | 347 | Worklist/Testing | Automate repeatable live Supabase chat-to-card-to-SQL journey | Unverified repeatable real-account journey; targeted inventory/history did not establish the requested live SQL automation. | s1-158 |
| MED | M | UI | 348 | Worklist/Testing | Prove live Supabase DCR, AC-13 and ARIA acceptance | Unverified real-account acceptance; source/configuration tests do not establish a live Supabase run. | s1-159 |
| MED | M | CODEX | 350 | Worklist/Testing | Fix reduced-motion shorten entrance blinking upstream | Unverified kUInetic upstream fix; task belongs in its repository, outside inspected Tovu/Jini source. | s1-161 |
| MED | M | CODEX | 366 | Worklist/Uncertain | Map old admin plan IDs and audit remaining requirements | Unverified acceptance mapping; listed A1/A2/F6/F7/D1 identifiers still need reconciliation with current feature ownership. | s1-170 |
| MED | M | OWNER | 562 | Jini releases | Reconcile owner approvals for every extracted package | unverified approval ledger; Jini `3502d94d` records 28 release bumps and first commerce/plugins publication, but does not establish individual owner approvals. | s2-35 |
| MED | M | UI | 662 | WebMCP | Complete real-Chrome acceptance for the admin prototype | Checkbox overstates completion: `apps/admin/src/features/webmcp/README.md:43` explicitly says Chrome acceptance remains pending; run its six-step acceptance journey. | s2-40 |
| MED | M | CODEX | 670 | WebMCP | Ensure saved assistant-authored pages carry actionable tags | `apps/website/src/features/pages/agent-tools.ts:127` provides prompt guidance; no post-save tagging pass found. Complete the remaining enforcement path. | s2-41 |
| MED | M | UI | 971 | SSE exhaustion | Explain fourteen connections from three tabs | Unverified anomaly remains documented at `ADS-memory/reports/2026-09-03-admin-sse-connection-exhaustion.md:206`; capture browser connections during reproduction. | s3-03 |
| MED | M | CODEX | 1032 | Third-party embeds | Serve page and post previews from separate origin | Separate serving origin unverified/unimplemented; `apps/admin/src/features/pages/rules.ts:617` instead documents opaque sandbox isolation with accepted functionality losses. | s3-13 |
| MED | M | CODEX | 1095 | SPEC-006 remainder | Red-team identity amendments 0.6.0 and 0.7.0 | `ADS-memory/reports/pipeline/006-identity-and-authorization/pipeline-state.md:25` still requires the combined amendment pass; completion unverified. | s3-21 |
| MED | M | CODEX | 1107 | SPEC-003 inspection | Complete CLI Code Inspection and Security gates | `ADS-memory/reports/pipeline/003-site-install-dir/pipeline-state.md:21` ends at Architecture Sign-Off; inspection/security completion unverified. | s3-23 |
| MED | M | CODEX | 1115 | Cross-feature gates | Record feature-specific inspection and security results | All three inspected `003`, `005`, `006` pipeline ledgers lack Code Inspection/Security rows; feature-specific accepted results remain unverified. | s3-25 |
| MED | M | CODEX | 1143 | Embeds formalization | Close ADR-047 audit acceptance gate | `ADS-memory/reports/architecture/ADR-INDEX.md:60` explicitly retains failed audit and NOT Accepted status; rerun and resolve the gate. | s3-30 |
| MED | M | CODEX | 1147 | Embeds formalization | Write one cross-surface Posts-and-Pages embed specification | Unverified unified specification; `ADS-memory/specs/043-widgets/feature.spec.md:233` remains page-focused despite broader current behavior. | s3-33 |
| MED | M | CODEX | 1267 | Admin sweep | Add term reparenting and deprecation controls | `apps/admin/src/features/taxonomy/Taxonomy.tsx:48` discloses missing routes and omitted controls. | s4-03 |
| MED | M | CODEX | 1270 | Admin sweep | Enforce where-used protection during media purge | `apps/website/src/server/inbound/admin-http/routes/media/delete.ts:7` still substitutes trash status for reference protection; where-used reporting exists separately. | s4-07 |
| MED | M | CODEX | 1270 | Admin sweep | Complete shared media ingress policy | Upload sniffing exists at `apps/website/src/server/inbound/admin-http/routes/media/upload.ts:137`; full shared ingress/pixel-bomb policy remains unverified. | s4-08 |
| MED | M | UI | 1275 | Admin sweep | Add admin API-key issuance surface | Backend issuance exists in `apps/website/src/features/identity/api-key-service.ts:9`; admin issuance UI remains unverified. | s4-15 |
| MED | M | CODEX | 1276 | Admin sweep | Implement interrupted-migration unblock route | `apps/admin/src/features/recovery/Recovery.tsx:113` renders a disabled unblock button explicitly stating that no route exists. | s4-18 |
| MED | M | CODEX | 1276 | Admin sweep | Complete discarded-write-window counts | `../Jini/packages/db/src/recovery/disclosure.ts:16` always reports partial coverage; recovery status still hardcodes baseline availability false. | s4-19 |
| MED | M | CODEX | 1288 | Admin sweep | Write Accessibility ADR | Unverified: no dedicated Accessibility ADR found; existing per-feature accessibility requirements do not resolve the requested shared decision. | s4-21 |
| MED | M | CODEX | 1341 | Active / VRT | Reload arbitrary external theme edits automatically | `apps/website/src/features/theme/theme-roster-sync.ts:20` tracks in-app markers and directory mtimes; ordinary external file edits still lack comprehensive watching. | s4-27 |
| MED | M | UI | 1345 | Active / VRT | Exercise true non-post page-shell layout | `development/e2e/journeys/themes.pins.journey.ts:748` confirms `/about` is a post using blog-post.html, leaving page-shell coverage unverified. | s4-29 |
| MED | M | CODEX | 1356 | Active / themes | Write standalone theme-bundle spec | `ADS-memory/specs/004-declarative-theme-system/feature.spec.md:174` still assigns OQ-06 to a future theme-bundle spec slice. | s4-31 |
| MED | M | CODEX | 1356 | Active / themes | Write standalone theme-tier and LiquidJS isolation spec | `ADS-memory/specs/004-declarative-theme-system/feature.spec.md:175` still assigns OQ-07 to a separate theme-tiers/LiquidJS spec slice. | s4-32 |
| MED | M | UI | 1373 | Active / themes | Add render_block visual baseline | Unverified: journey only checks editor source contains render_block at `development/e2e/journeys/themes.pins.journey.ts:458`; no seam-specific visual baseline found. | s4-33 |
| MED | M | CODEX | 1384 | Active / plugins | Benchmark approximately 50,000 faceted products on SQLite | `ADS-memory/reports/architecture/ADR-023-core-mediated-plugin-data-modules.md:393` still requires benchmark evidence; completed benchmark remains unverified. | s4-35 |
| MED | M | CODEX | 1495 | Accomplish | Add request-correlated structured logging | Request IDs exist at `apps/website/src/server/inbound/shared/observability-middleware.ts:47`; Jini Logger exists, but consistent request-correlated logging remains unverified. | s4-56 |
| MED | M | CODEX | 1502 | Accomplish | Implement feature flags for safe rollout | Unverified: no featureFlag/FeatureFlag implementation found across Tovu source or Jini packages; individual subsystem switches are not a shared rollout facility. | s4-57 |
| MED | M | CODEX | 1512 | Accomplish | Define and implement event-handler idempotency strategy | `../Jini/packages/infra/src/events/outbox/worker.ts:181` explicitly requires host idempotency; delivery leases and isolated notification keys do not complete a general strategy. | s4-58 |
| MED | M | CODEX | 1514 | Accomplish | Standardize API error taxonomy and envelopes | `apps/website/src/server/error-mapping/INFO.md:5` remains intended ownership only; `routes/media/delete.ts:54` still uses route-local error mapping. | s4-59 |
| MED | M | CODEX | 1518 | Accomplish | Draft safe-mode boot and rollback policy | Unverified safe-mode concept beyond existing restore ceremonies; architecture chapter 13 still names safe-mode boot as a required capability. | s4-60 |
| MED | M | CODEX | 1546 | Agent capabilities | Test AI kill switch against previously created artifacts | Unverified: no test found that creates an executable artifact, disables AI, and proves the artifact stops executing. | s4-66 |
| MED | M | CODEX | 1549 | Agent capabilities | Preserve human-versus-agent kind in mutation events | `../Jini/packages/cms/src/core/ports.ts:31` carries actorId without actor kind; command event construction likewise omits kind. | s4-67 |
| MED | M | CODEX | 1558 | Agent capabilities | Validate capability output against declared schemas | `../Jini/packages/core/src/agent-tools.ts:24` has inputSchema but no outputSchema; shared output validation remains unverified. | s4-69 |
| MED | M | CODEX | 1610 | Admin IA research | Specify surface descriptors and panel contribution ownership | `ADS-memory/reports/architecture/admin-sitemap.md:55` supplies a sitemap; authoritative surface-descriptor and core/registry/plugin ownership synthesis remains unverified. | s4-75 |
| MED | M | UI | 2424 | Recovery | Obtain an accepted restore-ceremony visual redesign | `7d223af69` changes the design after the rejected passes; owner acceptance remains unverified. Inspect the current ceremony in a browser. | s6-11 |
| MED | M | OWNER | 3004 | Username changes | Resolve persistent owner identity before allowing seeded-owner renames | `apps/website/src/features/identity/username-change-ports.ts:14` explicitly refuses seeded-owner rename until persistent owner identity is configured. | s7-109 |
| MED | M | CODEX | 3027 | Desktop complexity | Reduce accepted desktop functions to the requested complexity ceiling | `apps/desktop/complexity-debt.json` still records SiteCard at 13 and other functions above 10; later releases retained ≤15 debt. | s7-122 |
| MED | L | UI | 48 | Next session | Verify every admin layout with expanded nav and dock | f1b90a335/c2b8096a3 cover chat width and open-dock baselines; exhaustive nav×dock×390px matrix closure remains unverified. | s1-16 |
| MED | L | CODEX | 173 | Cleanup program | Finish and verify remaining cleanup phases | d4e43bd00 landed waves 1–4; full route/dialog/helper cleanup closure remains unverified; outstanding portions are separately listed below. | s1-81 |
| MED | L | CODEX | 176 | Cleanup program | Finish shared route, tool, settings and manifest definitions | d4e43bd00 explicitly lands a settings-route pilot; shared projections exist, but conversion of all intended routes remains unverified. | s1-84 |
| MED | L | CODEX | 179 | Cleanup program | Finish dialog, API-helper, shim and duplicate-helper cleanup | Unverified program closure; d4e43bd00 removes many duplicates but does not establish completion of every Ponytail-ladder follow-up. | s1-86 |
| MED | L | CODEX | 296 | Worklist/Desktop | Restore tabs, add quick open and run-completion notifications | apps/desktop/src/renderer/App.hooks.ts:285 starts tabs in memory; persistence, Cmd+K and notifications remain unverified. | s1-129 |
| MED | L | CODEX | 301 | Worklist/Desktop | Build browser-server ZIP launchers and publish release assets | Unverified launchers/assets; desktop-release.yml produces desktop installers/update ZIPs, not the specified browser-server ZIP distribution. | s1-134 |
| MED | L | CODEX | 311 | Worklist/Publish | Publish installed skills and both kinds of plugin packages | composition/publish-content-manifest.ts:53 registers content/theme/raw handlers; dedicated skills/site-plugin/agent-plugin contributors remain absent. | s1-139 |
| MED | L | CODEX | 339 | Worklist/DB | Complete real-Postgres concurrency and post-extraction acceptance | Unverified Q1/C1–C3 race acceptance; newer vault dialect/parity tests do not prove the named aggregate concurrency requirements. | s1-152 |
| MED | L | CODEX | 342 | Worklist/Testing | Finish unit-test repair across all forty-four briefs | Unverified brief-by-brief closure; ongoing 10-16/17 suite repairs and current FAILURES.md do not establish final completion. | s1-153 |
| MED | L | CODEX | 345 | Worklist/Testing | Complete step-six coverage for all forty-four briefs | Unverified all-brief closure; later coverage/mutation commits do not map every original brief to final acceptance. | s1-156 |
| MED | L | UI | 827 | Desktop shell | Provide one operator chat spanning fleet and site | `apps/desktop/src/renderer/App.tsx:207` documents missing workspace-chat IPC handlers and an unmounted chat pane; implement the fleet-facing conversation surface. | s2-51 |
| MED | L | CODEX | 1266 | Admin sweep | Build Tier-3 database browser | `apps/admin/src/features/database/Database.tsx:40` explicitly omits the browser; current tabs contain only Timeline and Migrate forward. | s4-02 |
| MED | L | CODEX | 1270 | Admin sweep | Complete media origin isolation | `../Jini/packages/cms/src/media/media-service.ts:33` discloses the missing cookie-less media origin/process and signed URLs. | s4-06 |
| MED | L | CODEX | 1270 | Admin sweep | Finish GC reference, snapshot, and scheduling safeguards | `../Jini/packages/cms/src/media/blob-gc.ts:73` and `:85` return false for references/snapshots; no production GC scheduler call found. | s4-09 |
| MED | L | CODEX | 1274 | Admin sweep | Build analytics aggregation, dashboards, goals, and export | `apps/admin/src/features/analytics/Analytics.tsx:8` and `:45` confirm raw hits only; totals, trends, and breakdowns remain absent. | s4-14 |
| MED | L | CODEX | 1276 | Admin sweep | Add Recovery import/export flow | `apps/admin/src/features/recovery/Recovery.tsx:46` exposes restore-point and restore tabs; Recovery import/export completion remains unverified. | s4-17 |
| MED | L | CODEX | 1288 | Admin sweep | Produce authoritative competitor coverage ADR and matrix | `development/tovu-v2-design.md:66` remains a WordPress capability map; unified competitor-to-disposition-and-owning-ADR matrix remains unverified. | s4-22 |
| MED | L | CODEX | 1296 | Admin sweep | Complete commerce write paths and provider adapters | `../Jini/packages/commerce/src/catalog/checkout.ts:12` creates pending orders without payment execution; commerce panels remain placeholders at `apps/admin/src/panels.tsx:756`. | s4-23 |
| MED | L | CODEX | 1299 | Admin sweep | Wire visitor OAuth lifecycle into Tovu | Jini lifecycle exists; no Tovu visitor-auth consumer found. `apps/admin/src/features/authentication/Authentication.tsx:76` confirms no persistence or enable action. | s4-24 |
| MED | L | CODEX | 1303 | Admin sweep | Implement Agent Plugin Marketplace backend and installation | `apps/admin/src/features/plugins/AgentPlugins.tsx:283` explicitly says marketplace packages are neither fetched, installed, nor listed. | s4-25 |
| MED | L | CODEX | 1603 | Admin IA research | Capture five CMS navigation taxonomies and screen inventories | Partial structural research exists in `ADS-memory/reports/architecture/admin-section-architecture-outline.md:9`; complete five-CMS screen/depth/settings comparison remains unverified. | s4-73 |
| MED | L | CODEX | 1607 | Admin IA research | Compare five CMS admin extension patterns | Directus extension research exists at `development/other-repos-specs/directus_specs/extensions/overview.md:24`; complete five-CMS comparison remains unverified. | s4-74 |
| MED | L | CODEX | 1616 | Shopify research | Execute Shopify research TODO before further decomposition | `development/other-repos-specs/shopify_specs/TODO.md:41` retains unchecked acquisition passes, beginning with Storefront schema and checkout-extension evidence. | s4-76 |
| MED | L | CODEX | 1626 | Commerce crosswalk | Synthesize Shopify and Medusa into V1 commerce architecture | Unverified: existing commerce ADRs and payment architecture do not establish the requested combined Shopify/Medusa capability crosswalk. | s4-78 |
| MED | L | CODEX | 2654 | Deployment | Add request-time multi-workspace hosting for hosted SaaS | [resolve-workspace.ts:50](/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/resolve-workspace.ts:50) selects one workspace at boot; simultaneous hostname-based tenant routing remains unverified. | s6-23 |
| MED | L | OWNER | 3021 | CRUD gaps | Define safe Trash ownership for remaining resource types | Updated CRUD coverage report documents unresolved markers, collection scoping, webhook retention, credential teardown, and artifact lifecycle contracts. | s7-120 |
| LOW | S | CODEX | 112 | Reachability | Try remaining deployment candidates after a protected URL | Jini packages/devops/src/deploy/reachability.ts:283 still returns immediately on result.status === 'protected'. | s1-45 |
| LOW | S | OWNER | 209 | Owner decisions | Reconcile historical Zana shell decision with Jini First | Unverified Zana implementation; AGENTS.md Jini First governs generic shared shells, but no Zana source was available in this audit. | s1-110 |
| LOW | S | OWNER | 361 | Worklist/Owner | Dispose of obsolete release clones and scratch artifacts | Unverified retention choices; .local-artifacts contains multiple release/source clones; owner must identify what can be discarded. | s1-167 |
| LOW | S | OWNER | 367 | Worklist/Uncertain | Define acceptance for publish feature-slice colocation cleanup | Unverified original acceptance; source moved, so owner must clarify whether a structural requirement remains. | s1-171 |
| LOW | S | CODEX | 1136 | Embeds formalization | Specify unified Post-editor Embed control | Unverified matching specification; `ADS-memory/specs/043-widgets/ui.spec.md:292` still describes a separate “Insert widget” trigger. | s3-28 |
| LOW | S | OWNER | 1475 | Learn | Understand ports, adapters, and dependency inversion | Unverified personal learning outcome; implementation and architecture documentation cannot establish the owner’s understanding. | s4-46 |
| LOW | S | OWNER | 1476 | Learn | Understand synchronous commands and asynchronous outbox flow | Unverified personal learning outcome; current flow is documented in `apps/website/src/contracts/core/events/outbox-worker.ts:15`. | s4-47 |
| LOW | S | OWNER | 1477 | Learn | Understand vertical-slice architecture | Unverified personal learning outcome; existing feature slices do not prove understanding. | s4-48 |
| LOW | S | OWNER | 1478 | Learn | Understand contract versus integration testing | Unverified personal learning outcome; existing test suites do not establish that this learning task was completed. | s4-49 |
| LOW | S | OWNER | 1481 | Learn | Understand Express, Fastify, and Hono tradeoffs | Unverified learning outcome; current Express usage does not establish completion of the requested tradeoff study. | s4-50 |
| LOW | S | OWNER | 1483 | Learn | Understand retries, backoff, and terminal delivery failures | Unverified learning outcome; implemented retry policy is documented in `apps/website/src/contracts/core/events/outbox-worker.ts:22`. | s4-52 |
| LOW | S | OWNER | 1488 | Learn | Understand spec-first workflow and artifacts | Unverified learning outcome; governing workflow exists in `ADS-memory/docs/architecture/sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md:9`. | s4-55 |
| LOW | S | CODEX | 1621 | Medusa research | Review conditional Medusa research TODO before deeper work | Unverified review completion; `development/other-repos-specs/medusa_specs/TODO.md:3` retains conditional extension, DTO, design-system, telemetry, and cloud research. | s4-77 |
| LOW | M | OWNER | 1267 | Admin sweep | Resolve term-slug contract mismatch | `apps/admin/src/features/taxonomy/Taxonomy.tsx:53`: spec assumes a slug; production Term lacks one. Decide model addition versus spec correction. | s4-04 |
| LOW | M | CODEX | 1343 | Active / VRT | Stabilize visual baselines across operating systems | `development/playwright.journeys.config.ts:48` still separates snapshots by platform; pinned cross-platform rendering environment remains unverified. | s4-28 |
| LOW | M | OWNER | 1486 | Learn | Understand Directus internals and AI layer | Unverified learning outcome; detailed research exists at `development/other-repos-specs/directus_specs/api/ai-and-mcp.md:40`. | s4-53 |
| LOW | M | OWNER | 1487 | Learn | Understand WordPress pain clusters and Tovu mappings | Unverified learning outcome; mappings exist in architecture chapter 13 and `development/tovu-v2-design.md:66`. | s4-54 |
| LOW | M | CODEX | 2180 | Admin skins | Replace literal visual utilities with skin-controlled tokens | [Jini button.tsx:19](/Users/la/Programming/Jini/packages/ui/src/features/interactive-ui/providers/shadcn/button.tsx:19) uses default shadow utilities; the semantic color bridge does not map shadows. | s6-02 |
| LOW | M | CODEX | 2186 | Admin skins | Add translucency, blur, and border-weight token axes | [styles.css:199](/Users/la/Programming/Tovu/apps/admin/src/styles.css:199) has shadow tokens; requested blur/alpha/border-weight axes remain unverified after targeted searches. | s6-03 |
| LOW | L | CODEX | 306 | Worklist/Plugins | Implement remaining plugin-hook stages S2–S6 | packages/sdk/src/hooks.ts:39 still declares only content.entry.beforeSave; ActionHookName has no registered action hooks. | s1-137 |
| LOW | L | UI | 2169 | Admin skins | Build the admin skin selector and switching behavior | [panels.tsx:552](/Users/la/Programming/Tovu/apps/admin/src/panels.tsx:552) still renders an explicit “Planned, not yet built” placeholder. | s6-01 |

## OPEN — Master Build Inventory checklist (aspirational; suggest the owner keep, archive, or replace with a short pointer)

| pri | size | who | line | section | item | what's left / evidence | id |
|---|---|---|---|---|---|---|---|
| HIGH | M | CODEX | 2120 | Tool evaluation | Evaluate ArchUnitTS or ts-arch | Unverified; existing architecture checks are real, but evaluation of these candidates was not located. | s5-231 |
| HIGH | M | CODEX | 2121 | Tool evaluation | Evaluate Testcontainers and Pact | Real PostgreSQL tests exist; a Testcontainers/Pact evaluation record remains unverified. | s5-232 |
| HIGH | L | CODEX | 1763 | AI layer | Complete task and capability hardening | Runtime and capability catalogs exist; complete hardened interaction contract remains unverified. | s5-35 |
| HIGH | L | CODEX | 1764 | AI layer | Principal-filtered discovery and safety contract | `apps/website/src/assistant/byok-tool-surface.ts:499` filters discovery by delete policy; complete per-principal discovery filtering remains unverified. | s5-36 |
| MED | S | OWNER | 1928 | Major gaps | RPO and RTO objectives | Restore mechanisms exist; numeric recovery objectives remain unverified. | s5-118 |
| MED | M | CODEX | 1656 | Kernel | Central typed error model | Domain errors exist; centralized taxonomy and implementation remain unverified. `apps/website/src/server/error-mapping/` still contains only INFO.md. | s5-02 |
| MED | M | CODEX | 1679 | Eventing | Handler consumption idempotency support | Some consumers are idempotent; complete consumption support remains unverified. ADR-046 explicitly assigns idempotency to consumers. | s5-08 |
| MED | M | CODEX | 1697 | Search | Search contracts and latency budgets | Adapter and relevance tests exist; explicit latency budgets and their enforcement remain unverified. | s5-13 |
| MED | M | OWNER | 1707 | Themes | Complete template hierarchy and routing | `apps/website/src/features/theme/render-contract.ts:23` covers four route kinds; broader hierarchy/fallback scope remains unresolved. | s5-16 |
| MED | M | CODEX | 1713 | Themes | Theme engine compatibility checks | `apps/website/src/features/theme/validation/manifest-v2.ts:267` explicitly reports engine-object support as unimplemented; compatibility enforcement remains incomplete. | s5-18 |
| MED | M | CODEX | 1721 | Plugins | Complete plugin lifecycle API | Setup, enable, disable and uninstall exist; explicit plugin stop/dispose lifecycle callbacks remain unverified. | s5-21 |
| MED | M | OWNER | 1736 | HTTP | Transport-independent handler contract | Server boundary specifications exist; a concrete shared transport-independent route/handler shape remains unverified. | s5-27 |
| MED | M | CODEX | 1742 | HTTP | Central domain-to-HTTP mapper | Target error-mapping spec exists; shared mapper remains absent from the placeholder directory. | s5-30 |
| MED | M | CODEX | 1744 | HTTP | Global rate limiting and headers | Public security headers and feature limiters ship; app-wide rate-limiting coverage remains unverified. | s5-31 |
| MED | M | OWNER | 1770 | AI layer | Session, episodic, semantic memory policy | Session isolation exists; complete cross-memory retention, consent and boundary policy remains unverified. Jini memory delegates these choices to hosts. | s5-39 |
| MED | M | OWNER | 1790 | Testing | Per-module test pyramid | Test naming conventions exist; module-level unit/integration/browser expectations remain unverified. | s5-46 |
| MED | M | CODEX | 1799 | Testing | Performance smoke tests | `development/performance/README.md:1` documents a manual recipe; automated performance smoke coverage remains unverified. | s5-50 |
| MED | M | CODEX | 1812 | Operations | Structured logging with correlation | JSONL capture and request IDs exist; logger/request correlation remains incomplete. `apps/website/src/platform/server-logs/log-buffer.ts:24` lacks request identifiers. | s5-54 |
| MED | M | OWNER | 1816 | Operations | SLOs and operational dashboards | Observability dashboard exists; numeric service objectives and alert/dashboard requirements remain unverified. | s5-56 |
| MED | M | OWNER | 1817 | Operations | Incident response runbooks | Unverified; no current Tovu-specific incident response runbook set located. | s5-57 |
| MED | M | CODEX | 1820 | Operations | Dependency and supply-chain scanning | Secret/invariant guards exist; dependency-vulnerability and package supply-chain scanning remain unverified in CI. | s5-59 |
| MED | M | OWNER | 1821 | Operations | Vulnerability response policy | Public vulnerability contact exists; response ownership, deadlines and remediation policy remain unverified. | s5-60 |
| MED | M | OWNER | 1840 | Documentation | Product milestone roadmap | Unverified; process milestones exist, but a current product milestone roadmap was not located. | s5-70 |
| MED | M | UI | 1877 | WP plugins | Display plugin conflicts with translations | Backend conflicts/quarantine ship; Plugins rows still do not render conflicts[]. Add translated conflict explanations and verify browser states. | s5-90 |
| MED | M | UI | 1914 | Ghost parity | Publishing performance defaults | SSR/cache defaults exist; measured publishing-surface performance acceptance remains unverified. | s5-108 |
| MED | M | OWNER | 1927 | Major gaps | Portability and exit guarantees | Transfer/export mechanisms exist; completeness guarantees, supported formats and exit contract remain unverified. | s5-117 |
| MED | M | OWNER | 2034 | AI surfaces | User, staff and admin tool tiers | Anonymous/admin boundaries and RBAC exist; explicit three-tier surface contract remains unverified. | s5-181 |
| MED | M | OWNER | 2039 | AI surfaces | Customer versus staff UX contracts | Visitor/admin contracts exist; customer self-service versus employee escalation contract remains unverified. | s5-183 |
| MED | M | CODEX | 2046 | AI mutation | Enforced tool-first structured orchestration | Discovery-first instructions and schemas exist; complete enforced orchestration/output policy remains unverified. | s5-188 |
| MED | M | OWNER | 2066 | Governance | Platform data classification | Site privacy policy lists data categories; platform-wide public/business/PII classification policy remains unverified. | s5-198 |
| MED | M | OWNER | 2067 | Governance | Retention and deletion per data class | Domain TTLs and site retention statements exist; unified platform classification-based policy remains unverified. | s5-199 |
| MED | M | OWNER | 2070 | Governance | GDPR and CCPA product mapping | Screening rulepacks and site policy exist; comprehensive platform requirements-to-product-control matrix remains unverified. | s5-202 |
| MED | M | OWNER | 2076 | Global operations | Disaster failover playbook | Backup/restore tools exist; disaster failover criteria and operational playbook remain unverified. | s5-206 |
| MED | M | OWNER | 2078 | Global operations | Recurring restore drills | Restore tests exist; recurring operational drill schedule and measured RPO/RTO evidence remain unverified. | s5-208 |
| MED | M | OWNER | 2093 | Marketplace trust | Malicious package incident response | Local failure quarantine exists; malicious-package investigation, notification and response workflow remain unverified. | s5-217 |
| MED | M | CODEX | 2097 | Release operations | Rollback playbooks by release type | Plugin reload rollback and restore tools exist; complete application/theme/plugin release playbooks remain unverified. | s5-219 |
| MED | M | CODEX | 2100 | Release operations | Recurring incident runbooks | Unverified; curate current recurring incidents and concrete operator recovery procedures. | s5-222 |
| MED | M | OWNER | 2108 | Growth and safety | UGC moderation policy | Comments moderation/spam controls exist; complete enabled-UGC safety policy and escalation rules remain unverified. | s5-228 |
| MED | M | CODEX | 2144 | Reference studies | Study domain-driven-hexagon | Unverified; no repository-specific study record located. Inspect applicable DDD and hexagonal contracts. | s5-238 |
| MED | M | CODEX | 2148 | Reference studies | Study VS Code extension architecture | Narrow extension-host issue research exists; complete contribution/activation architecture study remains unverified. | s5-240 |
| MED | M | CODEX | 2153 | Reference studies | Study Docusaurus themes and plugins | Unverified; no theme/plugin/preset lifecycle study record located. | s5-243 |
| MED | M | CODEX | 2154 | Reference studies | Study Astro integrations and adapters | Astro-compatible theme build support exists; upstream architecture study remains unverified. | s5-244 |
| MED | L | CODEX | 1659 | Kernel | Typed configuration and environment validation | Unverified; feature-specific configuration exists, but no unified typed environment configuration was located. | s5-03 |
| MED | L | CODEX | 1660 | Kernel | Runtime, environment, workspace feature flags | Unverified; Jini composition activation exists, but runtime/environment/workspace flag resolution remains missing. | s5-04 |
| MED | L | CODEX | 1661 | Kernel | General module loader lifecycle | Plugin setup/loading exists; unified plugin/theme/provider initialization and shutdown contract remains unverified. | s5-05 |
| MED | L | CODEX | 1703 | Features | Multistage publishing workflow | Scheduling exists; draft-to-review workflow and reviewer transitions remain unverified. | s5-15 |
| MED | L | CODEX | 1723 | Plugins | Dependency graph and conflict rules | Conflict arbitration ships; manifest dependencies remain declarations without a verified dependency resolver. `../Jini/packages/plugins/src/host/manifest.ts:93`. | s5-22 |
| MED | L | UI | 1728 | Plugins | Plugin admin extension points | `../Jini/packages/plugins/src/host/manifest.ts:85` marks adminSurfaces unused; implement sandboxed panel mounting and verify browser behavior. | s5-24 |
| MED | L | CODEX | 1740 | HTTP | Request and response schema enforcement | `ADS-memory/reports/2026-08-23-schema-first-migration-proposal.md:4` remains proposal-only; production-wide schema enforcement is unverified. | s5-29 |
| MED | L | UI | 1754 | Admin | Render plugin extension panels | Admin plugin management exists; sandboxed plugin-contributed panel runtime remains unwired. Jini manifest explicitly marks adminSurfaces unused. | s5-33 |
| MED | L | CODEX | 1776 | Protocols | Expose full Tovu MCP server | `apps/desktop/src/sites-mcp-server.ts:113` implements desktop tools; full authenticated content/admin MCP server remains unverified. | s5-42 |
| MED | L | CODEX | 1783 | Protocols | WordPress database ingestion agent | Site-import reads public websites, not WordPress databases; database extraction, resumability and compensation remain unverified. | s5-45 |
| MED | L | CODEX | 1792 | Testing | Specifications baseline across modules | More server specifications and Jini contracts exist, but coverage across every module remains unverified. | s5-47 |
| MED | L | CODEX | 1794 | Testing | Contract tests for every core port | Numerous adapter contracts exist; complete port-to-contract coverage remains unverified. Old claims about absent SQLite adapters are obsolete. | s5-48 |
| MED | L | CODEX | 1824 | Product safety | General update preflight and rollout | DB gating and plugin reload rollback exist; general application/theme preflight and staged rollout remain unverified. | s5-61 |
| MED | L | UI | 1827 | Product safety | Incident analysis and guided remediation | Recovery and recent-error screens exist; complete incident diagnosis/remediation journey remains unverified. | s5-62 |
| MED | L | CODEX | 1830 | Product safety | Performance attribution and budgets | DB/outbound/agent spans exist; explicit attribution budgets and enforcement remain unverified. | s5-64 |
| MED | L | OWNER | 1834 | Product safety | Governance, trust and provenance | Integrity and approval controls exist; complete provenance/governance strategy remains unverified. | s5-67 |
| MED | L | CODEX | 1837 | Documentation | Synchronize module specifications | `apps/website/src/features/post/__specs__/post-editing.spec.md:20` still excludes scheduling, which current code implements. | s5-68 |
| MED | L | CODEX | 1848 | WP publishing | Review and private status parity | `apps/website/src/contracts/core/scheduled-publish.ts:6` supports future publication; review/private status parity remains unverified. | s5-71 |
| MED | L | UI | 1850 | WP publishing | Revision restore and comparison UI | Revision persistence/listing exists; historical restore and comparison views remain unverified. | s5-73 |
| MED | L | CODEX | 1856 | WP navigation | Public taxonomy archives and filters | `apps/website/src/features/taxonomy/html-render.ts:30` explicitly says terms have no public archive URLs. | s5-75 |
| MED | L | CODEX | 1860 | WP editor | Schema-safe block editor alternative | `apps/website/src/features/post/post.ts:1360` explicitly states deeper TipTap schema validation is absent. | s5-77 |
| MED | L | UI | 1864 | WP editor | Editor and published-output parity | Preview paths exist, but complete WYSIWYG parity requires browser verification; unverified in this read-only triage. | s5-81 |
| MED | L | CODEX | 1869 | WP themes | Theme update compatibility and rollback | Original-file reset exists; engine compatibility and versioned theme-update rollback remain incomplete. | s5-84 |
| MED | L | CODEX | 1874 | WP plugins | Plugin dependency compatibility | SDK compatibility is enforced; plugin-to-plugin dependency resolution remains unverified. | s5-87 |
| MED | L | UI | 1876 | WP plugins | Plugin settings and UI mounting | Contribution claims exist; plugin settings registration and sandboxed admin mounting remain unwired. | s5-89 |
| MED | L | UI | 1889 | WP media | Bulk media operations | Multiple-file upload exists; bulk selection, metadata changes and destructive-operation workflows remain unverified. | s5-94 |
| MED | L | CODEX | 1893 | WP infrastructure | Page, data and object caching | Public cache headers and sitemap caching exist; complete invalidation strategy across page/data/object caches remains unverified. | s5-96 |
| MED | L | CODEX | 1894 | WP infrastructure | Safe updates and rollback | Plugin version rollback exists; complete app/theme update rollback and recovery remain unverified. | s5-97 |
| MED | L | CODEX | 1900 | Payload parity | Field-level access control | Collection/document permissions exist; field-level read/write authorization remains unverified. | s5-99 |
| MED | L | UI | 1918 | Strategic parity | Guided incident remediation | Recovery/error surfaces exist; complete guided incident workflow remains unverified. | s5-110 |
| MED | L | CODEX | 1919 | Strategic parity | Preflight, canary and rollback | DB cost gates and plugin reload recovery exist; general canary promotion and rollback remain unverified. | s5-111 |
| MED | L | CODEX | 1920 | Strategic parity | Governance and provenance controls | Integrity/approval controls exist; provenance signing and policy coverage remain unverified. | s5-112 |
| MED | L | CODEX | 1924 | Major gaps | Tenant provisioning lifecycle | Local creation/trash exist; tenant suspend/archive and complete lifecycle semantics remain unverified. | s5-114 |
| MED | L | CODEX | 1925 | Major gaps | Platform abuse prevention | Feature rate limits exist; platform-wide abuse policy, shared enforcement and coverage remain unverified. | s5-115 |
| MED | L | OWNER | 1926 | Major gaps | Unified compliance and retention | Consent, erasure patterns and site policy exist; unified platform compliance/retention requirements remain unverified. | s5-116 |
| MED | L | UI | 1930 | Major gaps | Accessibility baseline and regressions | WCAG screening and chat accessibility regressions exist; a complete platform baseline and coverage remain unverified. | s5-120 |
| MED | L | CODEX | 2027 | Membership | Granular content restriction rules | Entry-level member access exists; per-section restrictions and content-type defaults remain unverified. | s5-176 |
| MED | L | CODEX | 2037 | AI surfaces | General mutation simulation mode | Domain-specific plans/previews exist; common frontend/backend mutation dry-run coverage remains unverified. | s5-182 |
| MED | L | CODEX | 2043 | AI mutation | Backend schema, settings and workflow tools | Content-type and settings tools ship; general workflow mutation tools remain unverified. | s5-185 |
| MED | L | CODEX | 2044 | AI mutation | Migration diff, impact and revert tools | `../Jini/packages/db/src/recovery/migrate-forward-hooks.ts:109` plans restore cost, not schema impact/diff; complete safe migration tool contract remains open. | s5-186 |
| MED | L | CODEX | 2045 | AI mutation | Run checks before applying changes | Validation and evidence tools exist; general test execution and pre-apply verification tooling remain unverified. | s5-187 |
| MED | L | CODEX | 2061 | Agentic web | MCP sandbox permission parity tests | Unverified; no disposable Playground MCP contract suite located for admin-permission and safe-mode equivalence. | s5-197 |
| MED | L | CODEX | 2068 | Governance | Data subject request workflows | `content/legal/tovu-dev/privacy-policy.html:128` explicitly describes manual requests and absent self-service export/deletion UI. | s5-200 |
| MED | L | UI | 2105 | Growth and safety | Migration assistant checkpoints | Site-import and database-transfer workflows exist; complete user-visible success/failure checkpoint journey remains unverified. | s5-225 |
| LOW | S | CODEX | 1672 | Eventing | Event naming and ownership conventions | Unverified; event names are consistent in source, but a written naming/ownership contract was not located. | s5-07 |
| LOW | S | CODEX | 1807 | DevEx | Commit and PR conventions | Unverified; no repository contribution/PR convention document located. | s5-51 |
| LOW | M | OWNER | 1695 | Search | Hybrid keyword and semantic strategy | Keyword FTS ships; semantic-search scope and hybrid strategy remain unverified. Decide whether semantic retrieval is required. | s5-11 |
| LOW | M | OWNER | 1700 | Features | Workspace lifecycle events | `../Jini/packages/cms/src/workspace/update.ts:15` deliberately omits rename events without consumers; reconcile that contract with this request. | s5-14 |
| LOW | M | CODEX | 1715 | Themes | Theme lifecycle hooks | Unverified; activation, duplication and reset exist, but install/enable/disable/update callback contracts were not located. | s5-19 |
| LOW | M | OWNER | 1739 | HTTP | Fastify versus Hono decision | Express remains; no accepted replacement decision located. The schema migration proposal explicitly retains Express. | s5-28 |
| LOW | M | OWNER | 1781 | Protocols | A2A support boundaries | Protocol spec names future A2A support; concrete supported operations and trust boundaries remain unverified. | s5-43 |
| LOW | M | CODEX | 1808 | DevEx | Development, staging, production matrix | Unverified; deployment configuration exists, but a complete environment matrix was not located. | s5-52 |
| LOW | M | OWNER | 1809 | DevEx | Typed client code generation strategy | Plugin SDK exists; HTTP client generation need and strategy remain unverified. | s5-53 |
| LOW | M | CODEX | 1838 | Documentation | Domain glossary | Unverified; terms remain scattered across ADRs and contracts; no maintained standalone glossary located. | s5-69 |
| LOW | M | CODEX | 1853 | WP publishing | Sticky and featured content | Featured images exist; sticky ordering or featured-content selection remains unverified. | s5-74 |
| LOW | M | CODEX | 1857 | WP navigation | Breadcrumb navigation helpers | BreadcrumbList serialization exists; public ancestor resolution and breadcrumb navigation helper remain unverified. | s5-76 |
| LOW | M | OWNER | 1867 | WP themes | Full template fallback hierarchy | Current resolver covers four route kinds; complete hierarchy beyond the spike remains unverified. | s5-82 |
| LOW | M | OWNER | 1868 | WP themes | Child-theme strategy | Theme duplication exists; inheritance, parent updates and override semantics remain unverified. | s5-83 |
| LOW | M | CODEX | 1902 | Payload parity | Focal-point upload transforms | Transform and ACL primitives exist; focal-point storage and cropping behavior remain unverified. | s5-101 |
| LOW | M | OWNER | 1905 | Directus parity | Configurable Data Studio | Collections UI exists; determine required configurability before implementation. Full Directus parity remains unverified. | s5-102 |
| LOW | M | UI | 1912 | Ghost parity | Writer-first quality target | Post editor ships; explicit quality target and browser acceptance remain unverified. | s5-107 |
| LOW | M | OWNER | 1923 | Major gaps | SaaS billing and licensing model | Conditional on SaaS scope; no complete platform billing/licensing decision located. Unverified. | s5-113 |
| LOW | M | OWNER | 1931 | Major gaps | Operations-team support tools | Recovery/observability admin tools exist; staff support scope and remaining workflows remain unverified. | s5-121 |
| LOW | M | OWNER | 1936 | AEO | Answer content model | FAQ rendering exists; canonical answer entities, evidence links and complete AEO model remain unverified. | s5-122 |
| LOW | M | CODEX | 1937 | AEO | Structured answer data validation | Article/WebPage and FAQ JSON-LD exist; complete content-type generation and schema validation remain unverified. | s5-123 |
| LOW | M | OWNER | 1944 | GEO | Public entity graph model | Unverified; define public brand/product/docs entity relationships and ownership. | s5-127 |
| LOW | M | CODEX | 1946 | GEO | AI-readable frontend guide pack | Tovu theme/docs guidance exists; Next.js/Vite-oriented guide and template pack remain unverified. | s5-129 |
| LOW | M | CODEX | 1950 | GEO | Citation-safe canonical source pages | Canonical metadata ships; explicit citation-source mapping and source-of-truth content contract remain unverified. | s5-130 |
| LOW | M | OWNER | 1958 | Knowledge sitemap | Knowledge sitemap schema | XML sitemap exists; entity/answer-anchor/authority declaration schema remains unverified. | s5-133 |
| LOW | M | CODEX | 1961 | Knowledge sitemap | Per-page citability metadata | Author/date/canonical primitives exist; canonical-answer/source-chain metadata remains unverified. | s5-136 |
| LOW | M | CODEX | 1974 | Citation intelligence | Track content staleness | Unverified; implement publication/content freshness signals and decay state. | s5-145 |
| LOW | M | CODEX | 1984 | Provenance | Editorial and authorship signals | Author metadata exists; editorial-process, authorship-chain and source-evidence packaging remain unverified. | s5-151 |
| LOW | M | CODEX | 1991 | AEO outputs | Typed content JSON-LD generation | `../Jini/packages/cms/src/seo/seo.ts:264` generates Article/WebPage metadata; HowTo/Product-specific derivation remains unverified. | s5-153 |
| LOW | M | CODEX | 1993 | AEO outputs | Public markdown page mirrors | llms.txt is an index; public per-page .md routes or content negotiation remain unverified. | s5-155 |
| LOW | M | UI | 1994 | AEO outputs | Editor-controlled nosnippet zones | Unverified; add editor controls and published data-nosnippet preservation. | s5-156 |
| LOW | M | CODEX | 1995 | AEO outputs | Extraction-quality meta descriptions | Plain-text description derivation exists; complete-sentence/factual extraction-quality generation remains unverified. | s5-157 |
| LOW | M | CODEX | 1999 | AEO site outputs | IndexNow publication notifications | Unverified; IndexNow integration was not located in publish/update paths. | s5-158 |
| LOW | M | OWNER | 2003 | Engine optimization | Extractable answer-oriented content structure | Unverified; define editorial structure and acceptance criteria for section-level direct answers. | s5-160 |
| LOW | M | OWNER | 2004 | Engine optimization | Bing discovery and crawler policy | Separate per-bot controls exist; explicit crawler defaults and Bing discovery workflow remain unverified. | s5-161 |
| LOW | M | CODEX | 2006 | Engine optimization | IndexNow and nosnippet integration | Unverified; both IndexNow publication hooks and managed nosnippet zones remain missing. | s5-163 |
| LOW | M | CODEX | 2013 | Content quality | Freshness monitoring alerts | Unverified; implement freshness thresholds and stale-page alerts. | s5-168 |
| LOW | M | OWNER | 2033 | AI surfaces | Employee operations console | Admin operational tools exist; distinct employee/support console scope remains unverified. | s5-180 |
| LOW | M | OWNER | 2054 | Agentic web | Evaluate agentic operating-layer strategy | Existing agent-native architecture is relevant; evaluation against the specific WordPress thesis remains unverified. | s5-190 |
| LOW | M | OWNER | 2071 | Governance | Audit evidence collection workflow | Technical audit logs exist; organizational control/approval evidence collection workflow remains unverified. | s5-203 |
| LOW | M | OWNER | 2074 | Global operations | Multi-region strategy | Unverified; choose active/passive versus active/active topology and required failure behavior. | s5-204 |
| LOW | M | OWNER | 2077 | Global operations | Regional availability and latency SLOs | Unverified; define numeric regional objectives and measurement ownership. | s5-207 |
| LOW | M | OWNER | 2081 | Commercial | Billing domain model | Jini commerce status explicitly marks subscriptions unavailable; SaaS plans/invoices model remains unverified. | s5-209 |
| LOW | M | OWNER | 2082 | Commercial | Plan-based feature entitlements | Member content tiers exist; platform plan-to-feature entitlement model remains unverified. | s5-210 |
| LOW | M | OWNER | 2083 | Commercial | Usage and seat quotas | Unverified; define API/storage/AI/seat quotas and scope. | s5-211 |
| LOW | M | OWNER | 2084 | Commercial | Overage handling and enforcement | Unverified; decide refusal, throttling, billing and recovery behavior when quotas are exceeded. | s5-212 |
| LOW | M | OWNER | 2085 | Commercial | Billing and audit reconciliation | Unverified; no platform invoice/usage/audit reconciliation workflow located. | s5-213 |
| LOW | M | CODEX | 2088 | API lifecycle | SDK generation and releases | Plugin SDK and compatibility promise exist; generated-client and SDK release automation remain unverified. | s5-214 |
| LOW | M | OWNER | 2091 | Marketplace trust | Extension submission and review | Marketplace remains Soon; publisher submission, review and acceptance workflow remains unverified. | s5-215 |
| LOW | M | OWNER | 2096 | Release operations | Stable, beta and canary channels | Desktop latest-release update path exists; multi-channel promotion rules remain unverified. | s5-218 |
| LOW | M | OWNER | 2098 | Release operations | Status page and incident communications | Unverified; customer status-page ownership and communication templates were not located. | s5-220 |
| LOW | M | OWNER | 2107 | Growth and safety | Analytics taxonomy governance | Analytics event infrastructure exists; taxonomy governance and accountable owners remain unverified. | s5-227 |
| LOW | M | CODEX | 2130 | Tool evaluation | Evaluate ts-rest or tRPC | HTTP schema/OpenAPI strategy exists; explicit ts-rest/tRPC evaluation remains unverified. | s5-236 |
| LOW | M | CODEX | 2131 | Tool evaluation | Evaluate diagrams-as-code tooling | ADR prose exists; Structurizr/C4/PlantUML evaluation and adoption remain unverified. | s5-237 |
| LOW | M | CODEX | 2145 | Reference studies | Study typescript-ddd-example | Unverified; no study record located for its DDD/CQRS structure. | s5-239 |
| LOW | M | CODEX | 2149 | Reference studies | Study Backstage plugin architecture | Unverified; no Tovu-specific Backstage study record located. | s5-241 |
| LOW | M | CODEX | 2150 | Reference studies | Study Grafana plugin architecture | Unverified; Grafana monitoring references do not establish a plugin architecture study. | s5-242 |
| LOW | M | CODEX | 2157 | Reference studies | Study Novu provider architecture | Unverified; no notification-provider/modular architecture study record located. | s5-245 |
| LOW | M | CODEX | 2158 | Reference studies | Study Twenty modular monorepo | Unverified; no Tovu-specific Twenty architecture study record located. | s5-246 |
| LOW | M | CODEX | 2159 | Reference studies | Study Cal.com feature modularity | Unverified; no Cal.com monorepo/feature-boundary study record located. | s5-247 |
| LOW | M | CODEX | 2160 | Reference studies | Study NestJS modules and providers | Unverified; no NestJS dependency-injection/module study record located. | s5-248 |
| LOW | M | CODEX | 2163 | Reference studies | Review architecture pattern catalogs | Unverified; no recorded review of awesome-software-architecture or system-design-primer located. | s5-249 |
| LOW | L | UI | 1756 | Admin | Notification center | Unverified; no persistent admin notification-center implementation located. | s5-34 |
| LOW | L | UI | 1861 | WP editor | Reusable blocks and patterns | Widgets/templates exist; reusable editor block/pattern creation and insertion remain unverified. | s5-78 |
| LOW | L | UI | 1862 | WP editor | Full-site editing experience | Theme source editing and partials exist; full-site visual editing contract and journey remain unverified. | s5-79 |
| LOW | L | UI | 1880 | WP operations | Update center and history | Desktop auto-update and deployment history exist; unified application/plugin/theme update center remains unverified. | s5-91 |
| LOW | L | CODEX | 1892 | WP infrastructure | General cron and job scheduler | Outbox/retention timers exist; general durable cron scheduling and catch-up semantics remain unverified. | s5-95 |
| LOW | L | CODEX | 1901 | Payload parity | Full content hook lifecycle | beforeSave filters ship; complete beforeChange/afterRead-style lifecycle coverage remains unverified. | s5-100 |
| LOW | L | UI | 1906 | Directus parity | Automation flow builder | Unverified; no general automation graph editor/runtime located. | s5-103 |
| LOW | L | CODEX | 1907 | Directus parity | Content realtime subscriptions | Agent SSE streams exist; general authenticated content subscriptions remain unverified. | s5-104 |
| LOW | L | OWNER | 1908 | Directus parity | Complete extension type parity | Route/tool/render/hook contributions exist; define needed interface/display/layout/module/operation/panel coverage. Remaining parity is unverified. | s5-105 |
| LOW | L | CODEX | 1909 | Directus parity | Extension marketplace distribution | Marketplace tabs still say Soon (`e20935610`); ADR-024’s amendment also supersedes the cited sandbox forcing-function rationale. | s5-106 |
| LOW | L | CODEX | 1939 | AEO | Answer freshness review workflow | Unverified; implement answer staleness detection and review queue. | s5-124 |
| LOW | L | CODEX | 1940 | AEO | Answer quality scoring | Unverified; accuracy, completeness and citation-confidence scoring were not located. | s5-125 |
| LOW | L | UI | 1941 | AEO | Answer analytics interface | Visitor analytics exists; answer impressions, citations and decay metrics remain unverified. | s5-126 |
| LOW | L | CODEX | 1945 | GEO | Machine-readable knowledge bundles | llms.txt and internal site guides exist; full public knowledge endpoints/bundles remain unverified. | s5-128 |
| LOW | L | CODEX | 1951 | GEO | Model mentions and citation monitoring | Unverified; model mention, citation drift and hallucination-risk monitoring were not located. | s5-131 |
| LOW | L | UI | 1952 | GEO | Entity representation remediation | Unverified; define and expose remediation for weak or missing entity representation. | s5-132 |
| LOW | L | CODEX | 1959 | Knowledge sitemap | Topic, page, evidence relationships | Unverified; implement structured topic-to-page-to-evidence/citation relationships. | s5-134 |
| LOW | L | CODEX | 1960 | Knowledge sitemap | AI crawler sitemap variants | XML sitemap and llms.txt exist; structured entity-bundle sitemap variants remain unverified. | s5-135 |
| LOW | L | CODEX | 1962 | Knowledge sitemap | GEO graph integration | Unverified; requires the currently unverified GEO entity graph and knowledge sitemap contracts. | s5-137 |
| LOW | L | CODEX | 1965 | Sitemap defense | Competing topology monitoring | Unverified; implement external URL-topology comparison and mirror detection. | s5-138 |
| LOW | L | CODEX | 1966 | Sitemap defense | Trusted crawler graph exposure | Robots rules exist; authenticated/trusted crawler-specific sitemap exposure remains unverified. | s5-139 |
| LOW | L | CODEX | 1967 | Sitemap defense | Authorship fingerprints and timestamps | Internal content hashes exist; public authorship evidence and first-publication proof remain unverified. | s5-140 |
| LOW | L | CODEX | 1968 | Sitemap defense | Domain lapse and dormant-page alerts | DNS diagnostics exist; domain expiry/dormant-page alerting remains unverified. | s5-141 |
| LOW | L | CODEX | 1969 | Sitemap defense | Lookalike domain detection | Unverified; implement domain-variation discovery and mirrored-content comparison. | s5-142 |
| LOW | L | CODEX | 1970 | Sitemap defense | Crawler mass-export detection | Unverified; crawler classification and mass-export behavior analysis were not located. | s5-143 |
| LOW | L | CODEX | 1973 | Citation intelligence | Track AI citations | Unverified; citation acquisition and per-page tracking were not located. | s5-144 |
| LOW | L | CODEX | 1975 | Citation intelligence | Competitor topology and overlap drift | Unverified; implement competitor snapshots and overlap/topology comparison. | s5-146 |
| LOW | L | CODEX | 1976 | Citation intelligence | Citation loss alerts | Unverified; requires citation history and decay detection, neither located. | s5-147 |
| LOW | L | UI | 1977 | Citation intelligence | Citation and displacement dashboard | Unverified; implement dashboard after citation, freshness and mirror signals exist. | s5-148 |
| LOW | L | OWNER | 1982 | Provenance | Optional content provenance | Explicitly Optional-Weak; content signing, editorial declarations and publication proof remain unverified. Decide scope. | s5-149 |
| LOW | L | CODEX | 1983 | Provenance | Intelligent crawler policy | Per-bot robots rules ship; scraper throttling and behavioral crawler enforcement remain unverified. | s5-150 |
| LOW | L | CODEX | 1985 | Provenance | Content originality scoring | Content readability analyzer exists; originality/duplication scoring before publication remains unverified. | s5-152 |
| LOW | L | CODEX | 1992 | AEO outputs | Generate direct-answer blocks | Unverified; implement extractable answer generation and page placement. | s5-154 |
| LOW | L | CODEX | 2005 | Engine optimization | Freshness and original research signals | Dates exist; stale-content flagging and research/recency workflow remain unverified. | s5-162 |
| LOW | L | CODEX | 2010 | Content quality | Claim and evidence detection | Unverified; existing analyzer checks readability/structure, not unsupported factual claims and citations. | s5-165 |
| LOW | L | CODEX | 2012 | Content quality | Per-page citability score | Unverified; existing SEO score does not establish extractability/quotation scoring. | s5-167 |
| LOW | L | CODEX | 2016 | Forms | Conditional forms and payment integration | Submission/notification functionality exists in Jini; conditional logic and form payment integration remain unverified. | s5-169 |
| LOW | L | CODEX | 2019 | Multilingual | Content locales and fallback chains | Admin localization exists; per-content-type locale model and fallback resolution remain unverified. | s5-170 |
| LOW | L | CODEX | 2020 | Multilingual | Translation and human review workflow | Unverified; publish-triggered translation and review queue were not located. | s5-171 |
| LOW | L | UI | 2021 | Multilingual | Locale URLs, hreflang and switcher | Head descriptors can carry hreflang; locale routing, generation and switcher workflow remain unverified. | s5-172 |
| LOW | L | CODEX | 2022 | Multilingual | Translation memory and glossary | Unverified; content translation memory/glossary storage and application were not located. | s5-173 |
| LOW | L | UI | 2023 | Multilingual | Translation parity tracking | Unverified; content locale synchronization model and status interface were not located. | s5-174 |
| LOW | L | CODEX | 2028 | Membership | Drip and scheduled releases | UTC scheduled publication ships; membership-relative drip release remains unverified. | s5-177 |
| LOW | L | CODEX | 2057 | Agentic web | Disposable site experimentation sandbox | `apps/admin/src/features/playground/Playground.tsx:7` is an assistant UI canvas, not a disposable site/content/schema sandbox. | s5-193 |
| LOW | L | CODEX | 2058 | Agentic web | Protected local Playground MCP bridge | Desktop sites MCP exists; user-enabled disposable-sandbox bridge with token/origin isolation remains unverified. | s5-194 |
| LOW | L | CODEX | 2059 | Agentic web | Sandbox operations and reset tools | Production/site tools exist; sandbox-bound test/job/reset/export tool suite remains unverified. | s5-195 |
| LOW | L | CODEX | 2060 | Agentic web | Sandbox coding-agent integration contract | Approval/audit/preview pieces exist; complete sandbox creation-to-reviewed-patch contract remains unverified. | s5-196 |
| LOW | L | OWNER | 2069 | Governance | SOC2 control mapping | Unverified; platform audit-readiness control matrix and ownership were not located. | s5-201 |
| LOW | L | CODEX | 2075 | Global operations | Tenant data residency controls | Operator-selected hosting exists; tenant/workspace residency policy and enforcement remain unverified. | s5-205 |
| LOW | L | CODEX | 2092 | Marketplace trust | Extension trust scoring | Integrity/capability checks exist; maintenance/security/quality trust-scoring model remains unverified. | s5-216 |
| LOW | L | CODEX | 2099 | Release operations | Safe impersonation and diagnostic export | Observability and diagnostic primitives exist; complete support impersonation/bundle-export workflow remains unverified. | s5-221 |
| LOW | L | CODEX | 2103 | Growth and safety | A/B experimentation framework | Unverified; experiment assignment, measurement and safety guardrails were not located. | s5-223 |
| LOW | L | UI | 2104 | Growth and safety | Onboarding and activation milestones | Create-site onboarding form exists; complete wizard and activation milestone tracking remain unverified. | s5-224 |
| LOW | L | CODEX | 2106 | Growth and safety | Feature cost telemetry and alerts | Execution spans exist; module/feature cost allocation, budgets and alerting remain unverified. | s5-226 |

## PARKED by owner (keep unless the owner drops them)

| pri | size | who | line | section | item | what's left / evidence | id |
|---|---|---|---|---|---|---|---|
| HIGH | S | CODEX | 135 | Database review | Read current SQLite migration ledger for schema identity | “after 0.1.14”; apps/website/src/platform/site-dir/read-applied-schema-identity.ts:88 still uses __drizzle_migrations for SQLite. | s1-56 |
| HIGH | M | OWNER | 101 | Full CLI ability | Decide site-key exposure and cross-site Bash write policy | “PARKED for a design talk”; assistant-restrictions-audit/audit.md:221/:226 explicitly leave K3/K4 owner decisions open. | s1-39 |
| HIGH | M | CODEX | 103 | Full CLI ability | Log every Bash or edit fallback | “PARKED for a design talk”; ACP decision logging exists, but all Bash/edit fallback telemetry remains unverified. | s1-41 |
| HIGH | M | OWNER | 133 | Database review | Resume merge debate and settle remaining table/retention decisions | “after 0.1.14”; round-two completion remains unverified; vault migration does not settle unrelated merges or retention. | s1-54 |
| HIGH | M | UI | 169 | Post-0.1.13 | Run real localhost credential-card canary journey | “final E2E batch”; development/e2e/journeys/credential-card-safety.pins.journey.ts:66 still tags the real-Claude canary journey @unrun. | s1-79 |
| HIGH | M | CODEX | 2383 | Instrumentation | Add admin browser request timing and correlation | Owner 10-04: “SKIPPED for now” over legal requirements. [api.ts:2538](/Users/la/Programming/Tovu/apps/admin/src/lib/api.ts:2538) remains a request/reconnection wrapper without timing instrumentation. | s6-09 |
| HIGH | M | OWNER | 2912 | Forms and widgets | Obtain owner critique and resolve design questions | Owner scheduled this “after we finish the 0.1.13 release”; draft approval is not established by inspected implementation history. | s7-32 |
| HIGH | M | CODEX | 2912 | Forms and widgets | Produce specifications and contract tests from approved design | Recorded sequence requires owner critique first; current common-field implementation does not cover the complete proposed widgets design. | s7-33 |
| HIGH | L | CODEX | 117 | Custom TS plugins | Separate marketplace installs and editable custom plugin roots | “start when a real use case appears”; source-tools.ts:12 still uses site-local drafts; separate custom roots remain unverified. | s1-46 |
| HIGH | L | CODEX | 118 | Custom TS plugins | Build typed seal, probe, consent and automatic rollback pipeline | “start when a real use case appears”; source-tools.ts:38 seals JS packages; proposed tsc/esbuild pipeline remains unverified. | s1-47 |
| HIGH | L | CODEX | 119 | Custom TS plugins | Complete custom-plugin routes, widgets, tools, tables and themed pages | “start when a real use case appears”; 0f7305e84 adds contribution surfaces; full custom-TS contract remains unfinished/unverified. | s1-48 |
| HIGH | L | CODEX | 121 | Custom TS plugins | Preserve custom-plugin portability, data and lifecycle edge cases | “start when a real use case appears”; custom-root export/deploy, source snapshots and conflict handling remain unverified. | s1-50 |
| HIGH | L | CODEX | 122 | Custom TS plugins | Prove TS authoring and sealing inside packaged desktop | “Cheapest proof (~1–2 days)”; consent landed, but compilation, probe, rollback and packaged-desktop acceptance remain unverified. | s1-51 |
| HIGH | L | CODEX | 134 | Database review | Require API/repository parity tests before each table merge | “after 0.1.14”; 487e30e96/fe98f45bc cover vault parity; characterization for other proposed merges remains unverified. | s1-55 |
| HIGH | L | UI | 763 | assistant-ui | Add assistant-ui alongside existing Jini chat for comparison | “parked for a while — don't pick up” (`todos.md:802`); no assistant-ui dependency found in current Tovu/admin/chat manifests. | s2-49 |
| HIGH | L | CODEX | 1425 | Active / samples | Implement real sandbox before sideloaded Tier-2 plugins | ADR-024’s “Open — deferred (designed-for, not built now)” retains sandbox mechanics; current analyzer permits built-in worker execution only. | s4-41 |
| HIGH | L | CODEX | 1725 | Plugins | Capability sandbox enforcement | ADR-024:139: “Open — deferred”; current `plugin-runtime.ts:337` explicitly says worker isolation is not a sandbox. | s5-23 |
| HIGH | L | OWNER | 2385 | Instrumentation | Add frontend Web Vitals and decide static-export reporting | Owner 10-04: “SKIPPED for now” pending browser-recording legal requirements; no Web Vitals implementation found. | s6-10 |
| HIGH | L | CODEX | 2486 | Observability page | Wire saved provider settings into real telemetry export | Explicitly “separate, larger, later work.” [Observability.tsx:107](/Users/la/Programming/Tovu/apps/admin/src/features/observability/Observability.tsx:107) remains a placeholder; operator-supplied OTEL environment configuration already works. | s6-17 |
| HIGH | L | CODEX | 2912 | Forms and widgets | Build the three planned widget workstreams | Recorded “after” release sequence; filterable-list and MemberAuthPort implementations were not found. | s7-34 |
| HIGH | L | CODEX | 2913 | Forms and widgets | Finish Forms v2 beyond common fields and single-file uploads | `Jini 20d4e8a2` adds 18 field types; repeating groups, conditional logic, multi-step forms, and complete requested ports remain. | s7-35 |
| MED | S | OWNER | 158 | Post-0.1.13 | Configure npm trusted publishers for protocol and agent-runtime | “parked so it doesn’t delay a downloadable app”; Jini .github/workflows/publish.yml:13 requires npm-side setup; actual configuration unverified. | s1-68 |
| MED | S | OWNER | 164 | Post-0.1.13 | Set real-service and CI policy for consolidated journeys | fe34fe546/a178e4b57 landed migration, scripts and release gate; run-on-request/pre-push/CI policy remains unverified under this parked section. | s1-74 |
| MED | S | UI | 165 | Post-0.1.13 | Verify preview port-following fix in packaged release | “AFTER desktop 0.1.13”; fb6765e95 fixes source; packaged-build confirmation remains unverified. | s1-75 |
| MED | S | OWNER | 221 | 10-05 leftovers | Decide fallback dedupe for forms without attempt tokens | “NOT now”; Jini cms/forms/submission-attempts.ts retains tokenless IP/body fallback; owner must choose its dedupe policy. | s1-112 |
| MED | S | OWNER | 230 | 10-05 leftovers | Decide whether HTML forms preserve authored outer classes | “NOT now”; Jini cms/forms/html/html-authoring.ts:112 still unwraps the outer form and discards its attributes. | s1-114 |
| MED | S | CODEX | 240 | 10-05 leftovers | Queue tombstone event atomically or retry failed index teardown | “NOT now”; Jini cms/src/content-types/lifecycle.ts:239 tears down indexes before enqueueing the event, after the tombstone transaction commits. | s1-116 |
| MED | S | CODEX | 246 | 10-05 leftovers | Register core media transform in memory composition | “NOT now”; composition/app.ts:1360 creates transform registry without ensureCoreMediaTransform; production composition/deps.ts:1356 registers it. | s1-117 |
| MED | S | CODEX | 251 | 10-05 leftovers | CSP-sandbox standalone Theme Explore previews | “NOT now”; server/inbound/public-http/middleware/theme-page-preview.ts has no Content-Security-Policy/sandbox header. | s1-119 |
| MED | S | UI | 253 | 10-05 leftovers | Verify preview sandbox behavior in a browser | “NOT now”; bb1550e78 strengthens browser assertions, but completed live preview/scroll/Escape acceptance remains unverified. | s1-120 |
| MED | S | UI | 357 | Worklist/Security | Finish legal identity/report-link leftovers | 0cb02a716 replaces placeholder in legal copies; desktop report link remains “owner-declined for now”; application to live copies remains unverified. | s1-165 |
| MED | S | CODEX | 425 | Visibility | Rename Jini analytics rootKeySeed to analyticsSeed | “after the 10-04 queue”; `../Jini/packages/analytics/src/salt.ts:6` still declares `rootKeySeed`; Tovu translates it at `features/analytics/jini-adapters.ts:62`. | s2-04 |
| MED | S | CODEX | 461 | Assistant permissions | Require admin.assistant.use when starting runs | “Audit findings parked with it”; `apps/website/src/server/runtime/composition/modules/assistant.ts:525` gates runs with session authentication, without the named permission check. | s2-17 |
| MED | S | OWNER | 1072 | Raw HTML authoring | Decide placement and fallback semantics for authored children | “Still deferred” / “scheduled for later.” Jini `packages/cms/src/widgets/markers/marker.ts:748` still replaces children; placement and fallback semantics need deciding. | s3-18 |
| MED | S | OWNER | 2489 | Observability page | Decide whether provider credentials reuse custom-credentials | Decision belongs to the “SECOND (provider-wiring) pass,” explicitly deferred as “later work”; no implemented Datadog/Grafana credential model found. | s6-18 |
| MED | M | CODEX | 72 | Chat memory | Offer per-chat memory toggle with usable persistence | “Later”; 1c97a4997 disables Claude auto-memory; current dock-header-rules.ts:61 offers display preferences only. | s1-30 |
| MED | M | OWNER | 108 | UI decoupling | Validate typed UI injection with package defaults | “Not decided. Verify the facts and validate the approach before any code”; current Jini packages still declare UI peers. | s1-42 |
| MED | M | OWNER | 110 | UI decoupling | Write component-injection ADR and obtain owner review | “when picked up”; component list, injection contract and migration order still require the stated ADR/review. | s1-44 |
| MED | M | CODEX | 142 | Post-0.1.14 | Follow a running conversation live in a second tab | “AFTER the 0.1.14 release”; d26601e80/Jini c58beff6 supply focus-return refresh; continuous second-tab following remains unverified. | s1-60 |
| MED | M | CODEX | 143 | Post-0.1.14 | Show form-submit results inside sandboxed draft preview | “dropped for now”; opaque-origin sandbox is intentional; owner directs form testing on published pages. | s1-61 |
| MED | M | CODEX | 150 | Plannie pages | Provide category archives and working category menu links | “LATER”; category archive implementation remains unverified; current navigation still carries termRef targets. | s1-65 |
| MED | M | CODEX | 159 | Post-0.1.13 | Persist model and reasoning choices for every agent | “AFTER desktop 0.1.13”; discovery adopted, but apps/admin/src/lib/execution-settings.ts:325 restores only the selected agent’s model/effort. | s1-69 |
| MED | M | CODEX | 160 | Post-0.1.13 | Move agent-failure hints and native failure card into Jini | “parked”; implementation remains Tovu-local in apps/admin/src/components/AssistantDock/agent-failure.ts:4 and AgentFailureCard.tsx:4; Jini parity unverified. | s1-70 |
| MED | M | UI | 163 | Post-0.1.13 | Update zoom-video posters and verify production carousel | “AFTER desktop 0.1.13”; local zoom clips are marked verified, but posters and production verification are explicitly outstanding. | s1-73 |
| MED | M | CODEX | 193 | Owner decisions | Provide explicit combined Deploy then Publish action | “the combined tool itself is parked”; separate deployment and publish paths ship. | s1-93 |
| MED | M | CODEX | 233 | 10-05 leftovers | Expose typed operator import errors without leaking arbitrary errors | “NOT now”; publish-content/backstop.ts:122/:163 returns raw Error.message; destination.ts:118 retains generic internal-error fallback. | s1-115 |
| MED | M | UI | 257 | 10-05 leftovers | Finish RTL logical CSS properties and document direction | “NOT now”; 055e1949e enables document direction; styles.css:763 still uses margin-left; full logical-property sweep remains incomplete. | s1-122 |
| MED | M | CODEX | 338 | Worklist/DB | Remove Drizzle tooling after storage parity | “after parity”; package.json:155/:189 retains drizzle-orm/drizzle-kit; frozen journal remains in use for SQLite schema identity. | s1-151 |
| MED | M | CODEX | 376 | Worklist/Parked | Combine Deploy and Publish as explicit third action | “parked; separate Deploy and Publish ship”; same deferred action as todos.md:193. | s1-178 |
| MED | M | CODEX | 382 | Worklist/Parked | Enable public MCP member magic-link sign-in | “HOLD”; public MCP member /auth/magic rollout remains unverified. | s1-184 |
| MED | M | UI | 385 | Worklist/Parked | Close deferred listener, overflow and SiteGrid deletion test gaps | “later combined batch”; closure of all three named mutant/browser cases remains unverified. | s1-187 |
| MED | M | CODEX | 423 | Visibility | Provide independent SEO and analytics entry points | “after the 10-04 queue”; `../Jini/packages/analytics/package.json:25` exports only its existing package root. | s2-02 |
| MED | M | OWNER | 462 | Assistant permissions | Decide enforcement of federated MCP write declarations | “Audit findings parked with it”; `../Jini/packages/mcp/src/federation/ports.ts:120` explicitly retains the write list for compatibility and reporting, without call enforcement. | s2-18 |
| MED | M | CODEX | 1006 | Third-party embeds | Support generic vendor snippets in widgets | “Scheduled for later” (`todos.md:1034`). Raw HTML exists, but `apps/website/src/features/widgets/media-html.ts:9` excludes script and iframe elements. | s3-06 |
| MED | M | CODEX | 1013 | Third-party embeds | Allow assistant-authored vendor embeds | “Scheduled for later.” `apps/website/src/features/pages/agent-tools.ts:140` still prohibits external scripts and resources. | s3-08 |
| MED | M | CODEX | 2904 | General tools | Prototype per-domain action tables on comments | Owner: “save the chat tool stuff for another time.” Current comments tools retain individual registrations. | s7-27 |
| MED | M | CODEX | 2907 | General tools | Read remote app secrets when vendor APIs cannot | “Another time”; `content/agent-plugins/fly/deploy-ops/fly.mjs:69` still fails when the API does not return the secret value. | s7-30 |
| MED | M | UI | 2908 | General tools | Exercise tools through actual assistant chats | Explicit owner instruction: “NOT now.” | s7-31 |
| MED | M | CODEX | 2939 | Chart plugins | Discover plugin-added chart kinds through search_components | “AFTER 0.1.13”; `apps/website/src/assistant/component-catalog-query.ts:78` maps existing ALL_MANIFESTS rather than adding new provider kinds. | s7-61 |
| MED | M | CODEX | 2946 | Multiple sites | Give agents reversible site Trash and restore tools | “AFTER 0.1.13”; current sites tool catalog exposes create, duplicate, switch, and reads, without site Trash/restore tools. | s7-70 |
| MED | M | CODEX | 3060 | Owner bugs | Close remaining desktop site-switch QA findings | “Don't want stuff restarting.” Core fixes landed, including `8ad67a462` and `b693fbcf0`; remaining report NITs are unverified. | s7-144 |
| MED | L | CODEX | 58 | Next session | Introduce app Keychain key and shared local credential store | “after 10c and item 19”; vault copying exists, but shared Keychain-backed credential storage remains unverified. | s1-22 |
| MED | L | CODEX | 78 | Overbuild cleanup | Review excess code and tests after release | “after the 10-11 round is tested, committed and released”; d4e43bd00 completed earlier cleanup, not this subsequent review. | s1-32 |
| MED | L | UI | 81 | Theme updates | Offer reviewable shipped-theme updates to existing sites | “we’re going to need it, but not now”; ThemeExplore.tsx:42 describes independent copies; update-offer workflow remains unverified. | s1-33 |
| MED | L | CODEX | 109 | UI decoupling | Remove chat’s upward UI dependency through injection | “LATER — VERIFY + VALIDATE FIRST”; Jini packages/chat/package.json:226 still declares @jini-ai/ui. | s1-43 |
| MED | L | CODEX | 141 | Post-0.1.14 | Copy pages and media between running local projects | “Copying pages/media between projects still comes after”; secret copying landed; content-copy workflow remains unverified. | s1-59 |
| MED | L | OWNER | 147 | Plannie pages | Build planner directory, planner signup and account login | “we don’t have the information”; planner/account data and page content remain prerequisites; completion unverified. | s1-62 |
| MED | L | OWNER | 148 | Plannie pages | Build Plus partner directory and signup pages | “LATER”; owner lacks content/data for /plus-partner-directory and /join-plus. | s1-63 |
| MED | L | OWNER | 149 | Plannie pages | Build story submission and newsletter destination pages | “LATER”; owner lacks content/data; newsletter implementation is separately frozen. | s1-64 |
| MED | L | CODEX | 161 | Post-0.1.13 | Complete risky server-route coverage and mutation report | “parked”; ADS-memory/.local-artifacts/integration-quality contains partial results/coverage but no REPORT.md; completion remains unverified. | s1-71 |
| MED | L | UI | 162 | Post-0.1.13 | Close nonblocking web-journey findings | “excluding anything that blocks the desktop release”; later fixes/baselines landed, but complete finding-by-finding closure remains unverified. | s1-72 |
| MED | L | CODEX | 168 | Post-0.1.13 | Design and complete full generic Jini MCP server capabilities | “Not for 0.1.13”; Jini mcp/server/tool-server.ts:150 registers tools/resources; full OAuth, subscriptions, sampling and bundle scope remains unverified. | s1-78 |
| MED | L | CODEX | 183 | OAuth library | Survey maintained OAuth clients and replace handwritten protocol code | “After 0.1.13”; Jini packages/oauth/package.json:63 still depends only on core; maintained OAuth-library adoption remains unverified. | s1-89 |
| MED | L | CODEX | 198 | Owner decisions | Sandbox non-Claude CLI reads of the site key | “non-Claude CLI key-file block is parked”; repeated at todos.md:379 under the owner’s MVP instruction. | s1-99 |
| MED | L | CODEX | 204 | Owner decisions | Complete PGlite parity, creation choice and Drizzle retirement | “PGlite stays hidden until parity”; Sites.hooks.tsx:241 exposes SQLite only; package.json:155/:189 still lists Drizzle. | s1-105 |
| MED | L | CODEX | 226 | 10-05 leftovers | Use a real sandbox before allowing third-party Tier-2 workers | “NOT now”; Jini plugins/host/node/discovery.ts:168 explicitly notes workers can still import node:fs. | s1-113 |
| MED | L | CODEX | 337 | Worklist/DB | Prove PGlite parity and expose creation storage choice | todos.md:204: “PGlite stays hidden until parity”; Sites.hooks.tsx:241 still makes only SQLite available. | s1-150 |
| MED | L | CODEX | 343 | Worklist/Testing | Run nineteen fix checks and eight final security reviews | “after all code changes stop (review LAST)”; final review packet remains unverified while implementation/test repairs continue. | s1-154 |
| MED | L | CODEX | 370 | Worklist/Parked | Build global desktop chat with active-site tools | “NEXT VERSION”; desktop renderer/App.tsx:216 intentionally leaves Sites Home without assistant; use-workspace-chat-pane.hooks.ts:11 has no caller. | s1-172 |
| MED | L | CODEX | 371 | Worklist/Parked | Keep separate persistent admin/site guests with shared history | “owner stopped it; not restarted”; desktop renderer/App.tsx:588 still uses one guest per site, switching admin/public views. | s1-173 |
| MED | L | CODEX | 372 | Worklist/Parked | Build public collection-entry pages G1–G4 | “owner disabled the wave”; collection displays are distinct; public entry-page routing completion remains unverified. | s1-174 |
| MED | L | CODEX | 377 | Worklist/Parked | Add a separate secrets-sync publishing channel | “parked; publish excludes credentials by design”; local vault copying does not implement remote secrets sync. | s1-179 |
| MED | L | CODEX | 379 | Worklist/Parked | Sandbox non-Claude CLI access to the site key | “just do the MVP”; CLI sandboxing remains deferred; K3/K4 audit separately awaits owner decisions. | s1-181 |
| MED | L | CODEX | 422 | Visibility | Combine generic SEO and analytics into Jini visibility | “after the 10-04 queue”; SEO uses `@jini-ai/cms/seo` (`apps/website/src/features/seo/index.ts:9`); analytics remains separate. | s2-01 |
| MED | L | CODEX | 460 | Assistant permissions | Address local CLI tools bypassing application authorization | “Audit findings parked with it”; `apps/website/src/contracts/core/agent-permission-mode.ts:32` still defaults local execution to bypass. | s2-16 |
| MED | L | OWNER | 464 | Assistant permissions | Distinguish AI browser actions from human identity | “Audit findings parked with it”; `apps/admin/src/features/webmcp/admin-page-tools.ts:12` confirms WebMCP supplies no run or principal. | s2-20 |
| MED | L | UI | 2266 | Onboarding | Build reversible feature-guided onboarding and deployment eligibility warnings | “Not being built now.” Current [CreateWebsiteOnboarding.tsx:273](/Users/la/Programming/Tovu/apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx:273) collects website details/database, without the proposed feature-guided eligibility flow. | s6-07 |
| MED | L | CODEX | 2891 | workerd | Run site server functions in workerd | “LATER.” Contribution routes exist, but executable site plugins retain full server authority; workerd is absent from inspected manifests. | s7-18 |
| MED | L | CODEX | 2892 | workerd | Run site plugins inside workerd isolates | “LATER”; `apps/website/src/features/plugin-runtime/host-binding.ts:50` confirms the security sandbox is still missing. | s7-19 |
| MED | L | CODEX | 2897 | workerd | Sandbox executable agent-plugin contributions | “LATER.” Source-control contribution loader documents trusted `.mjs` execution in the host process. | s7-24 |
| MED | L | CODEX | 2905 | General tools | Add action metadata, audit names, descriptions, and accuracy evaluation | Same explicit deferral; no matching per-domain action-table prototype found in the inspected registration owner. | s7-28 |
| MED | L | CODEX | 2914 | Forms and widgets | Build filterable collection list widget | Scheduled after 0.1.13; no CollectionQueryPort or filterable-list implementation found in Jini CMS widgets. | s7-36 |
| MED | L | CODEX | 2915 | Forms and widgets | Build provider-neutral member sign-in widget | Scheduled after 0.1.13; public sign-in links landed, but the requested MemberAuthPort widget was not found. | s7-37 |
| MED | L | CODEX | 2935 | Consent | Add regional policy packs and external CMP adapters | Scheduled “AFTER 0.1.13”; core consent exists, but OneTrust, Cookiebot, and CookieYes adapters were not found. | s7-57 |
| MED | L | CODEX | 2939 | Chart plugins | Add alternative and user-supplied chart provider packs | “AFTER 0.1.13”; current admission supports reviewed bundled providers, with Recharts the shipped pack. | s7-59 |
| MED | L | CODEX | 2943 | Chart plugins | Render public-site charts as server-side SVG | “AFTER 0.1.13.” Current provider is browser-mounted Recharts; proposed ECharts SSR path remains absent. | s7-68 |
| MED | L | CODEX | 2957 | Site guide | Update bundled guide independently through Marketplace | “AFTER 0.1.13”; `apps/admin/src/features/plugins/AgentPlugins.tsx:283` says Marketplace does not fetch, install, or list packages yet. | s7-78 |
| MED | L | CODEX | 2996 | Subagents | Build vendor-neutral delegate tool with visible bounded child runs | “AFTER 0.1.13”; current code implements Claude CLI permission opt-in, without the proposed shared child-run delegation lifecycle. | s7-106 |
| MED | L | OWNER | 3000 | Visitor tool selection | Design and authorize configurable visitor tool grants | “AFTER 0.1.13”; `capability-registry.ts:25` retains fixed default-deny capabilities. ADR replacement and write/private-data warnings remain. | s7-107 |
| LOW | S | CODEX | 255 | 10-05 leftovers | Correct DR-001’s claimed owner-only Roles access | “NOT now”; exact DR-001 mapping unverified; ADS-memory/specs/006-identity-and-authorization/feature.spec.md:287 still names role.manage owner-only. | s1-121 |
| LOW | S | UI | 333 | Worklist/Media | Add sound-on pill to the specific home promo video | “owner killed the writer before it landed”; no later completion established; request remains specific to that video. | s1-148 |
| LOW | S | CODEX | 380 | Worklist/Parked | Purge or reseed removed sample users | “seed regeneration parked”; no later owner direction to purge/reseed established. | s1-182 |
| LOW | S | CODEX | 1019 | Third-party embeds | Add Calendly agent-plugin integration | Explicitly “Vendor side, for later”; hosted transport compatibility remains unverified. | s3-11 |
| LOW | S | OWNER | 2900 | Public search | Choose header, search page, or both | Explicitly “parked”; placement remains an open owner choice in this entry. | s7-26 |
| LOW | S | OWNER | 3062 | Owner bugs | Settle the site-local ops-script convention | Under owner’s “fix LATER” instruction; plugin mechanism exists, while `<site>/ops` remains a proposal requiring convention agreement. | s7-147 |
| LOW | S | CODEX | 3066 | Site-switch speed | Skip three-second delay for admin-triggered restarts | Explicit “LOW PRIORITY / LATER”; `dev-restart.ts:24` still defines 3000ms and activation uses the shared restart request. | s7-148 |
| LOW | M | CODEX | 153 | Editor polish | Preserve untouched source formatting during structural editor saves | “later”; Jini packages/ui/src/features/html-editor/editor-serialization.ts:101 still performs whole-document serialization after structural changes. | s1-66 |
| LOW | M | CODEX | 208 | Owner decisions | Enable opt-in Langfuse prompt telemetry with secret stripping | “Monitoring as a whole is still Later”; Langfuse adapter/configuration remains unverified in current observability code. | s1-109 |
| LOW | M | CODEX | 307 | Worklist/Plugins | Publish plugin-defined namespaced hooks at runtime | “after hooks S2–S6”; packages/sdk/src/hooks.ts:39 still exposes the single typed filter hook. | s1-138 |
| LOW | M | UI | 373 | Worklist/Parked | Build searchable plugin and webhook event list | “build later”; unified event-list implementation remains unverified. | s1-175 |
| LOW | M | OWNER | 374 | Worklist/Parked | Publish Microsoft Store app after business prerequisites | “paused until LLC + DUNS + domain email”; business prerequisites and Store publication remain unverified. | s1-176 |
| LOW | M | CODEX | 378 | Worklist/Parked | Audit all site-folder publication gaps | “parked”; publish-content-manifest.ts covers registered types/raw backstop, not proof of an exhaustive site-folder gap audit. | s1-180 |
| LOW | M | CODEX | 383 | Worklist/Parked | Extract outbox from infra into a separate Jini package | “ON HOLD”; stays in @jini-ai/infra until more event code exists. | s1-185 |
| LOW | M | UI | 445 | HTML embeds | Add optional client inline validation and messages | “NOT now”; no validation enhancement found. `apps/website/src/server/inbound/public-http/http/site/form-render.ts:188` supplies only the range-readout script. | s2-11 |
| LOW | M | CODEX | 449 | HTML embeds | Move menu and taxonomy HTML renderers into Jini | “NOT now”; implementations remain `apps/website/src/features/navigation/html-render.ts:47` and `features/taxonomy/html-render.ts:10`, both explicitly marked Jini candidates. | s2-14 |
| LOW | M | OWNER | 706 | Media provenance | Add producer and model provenance separately from actor | “Decision: not now” (`todos.md:708`); `../Jini/packages/cms/src/media/types.ts:47` defines acting principal independently of producer/model; no producer column found. | s2-43 |
| LOW | M | UI | 740 | Media provenance | Filter or group media by creator | “Decision: not now” (`todos.md:708`); current `../Jini/packages/admin/src/media/react/tabs/LibraryTab.tsx:14` offers ordering and status/search controls, without creator filtering. | s2-48 |
| LOW | M | UI | 850 | Desktop shell | Add a project pop-out window button | “Explicitly deferred”; owner: “let’s just have it all in one window first.” Current workspace controls offer browser opening, without project-window pop-out. | s2-56 |
| LOW | M | CODEX | 1017 | Third-party embeds | Allow embed hosts when enforcing public CSP | “If a public CSP is ever added.” `apps/website/src/server/inbound/public-http/middleware/public-page-security-headers.ts:13` currently specifies report-only CSP. | s3-10 |
| LOW | M | UI | 1271 | Admin sweep | Add menu drag-and-drop | `development/todos.md:1271`: “Drag-and-drop deferred”; current menu implementation retains reorder controls. | s4-10 |
| LOW | M | UI | 1272 | Admin sweep | Add member pagination | “Pagination … deferred”; `../Jini/packages/user-management/src/react/members/Members.tsx:25` confirms explicit ADR deferral. | s4-11 |
| LOW | M | OWNER | 2055 | Agentic web | Future ecosystem risk register | Parking words: “risks to solve later.” Separate evaluated risk register and mitigations remain unverified. | s5-191 |
| LOW | M | CODEX | 2124 | Tool evaluation | Evaluate Nx versus Turborepo | Parking words: “Adopt when splitting src/ into packages/.” Tovu’s packages root still contains only sdk. | s5-233 |
| LOW | M | CODEX | 2126 | Tool evaluation | Evaluate Sheriff or good-fences | Same “Adopt when splitting src/ into packages/” condition; no evaluation record located. | s5-234 |
| LOW | M | UI | 2203 | Tailwind/shadcn | Complete deferred admin adoption and document the styling rule | Owner: “download shadcn and Tailwind later.” Both now exist through Jini (`75c3e2144`); broader adoption and the written rule remain unverified. | s6-05 |
| LOW | M | CODEX | 2874 | PGlite | Measure packaged desktop disk and RAM with PostGIS | “NOT now.” Existing socket-spike report measures Node PGlite; packaged desktop and PostGIS comparison remain. | s7-08 |
| LOW | M | CODEX | 2877 | PGlite | Compare embedded native Postgres | Owner: “NOT now.” Current implementation selects PGlite; no embedded-postgres dependency or comparison implementation found. | s7-11 |
| LOW | M | CODEX | 2899 | Public search | Build static-compatible visitor keyword search | Explicitly “parked”; no minisearch dependency or public search-widget implementation found. | s7-25 |
| LOW | M | CODEX | 2920 | Media storage | Add admin configuration and sealed credential cards | “Not now at all”; `apps/website/src/features/media/blob-store.s3.ts:13` documents environment-only activation. | s7-39 |
| LOW | M | CODEX | 2920 | Media storage | Support optional direct object-storage delivery | “Not now at all”; S3 adapter documentation confirms public media bytes remain proxied through the application. | s7-41 |
| LOW | M | CODEX | 2920 | Media storage | Move generic S3 adapter into Jini | “Not now at all”; full implementation remains in `apps/website/src/features/media/blob-store.s3.ts`. | s7-42 |
| LOW | M | CODEX | 2920 | Media storage | Supply storage-provider setup knowledge through an agent plugin | Owner: “not now at all.” No media-storage agent plugin found among inspected plugin manifests. | s7-43 |
| LOW | M | CODEX | 2924 | Automatic backups | Schedule automatic database backups | “Way too much to do now”; `apps/website/src/features/site-backup/tool-registrations.ts:91` explicitly excludes scheduled backups. | s7-44 |
| LOW | M | CODEX | 2924 | Automatic backups | Add object-storage backup targets | “Way too much to do now.” Current backup tool targets private git-host repositories. | s7-45 |
| LOW | M | CODEX | 2924 | Automatic backups | Apply hourly, daily, and monthly retention policies | “Way too much to do now.” No corresponding scheduled-backup retention lifecycle found. | s7-47 |
| LOW | M | CODEX | 2924 | Automatic backups | Encrypt backup artifacts at rest | “Way too much to do now.” Existing private-repository backup is not whole-artifact encryption. | s7-48 |
| LOW | M | CODEX | 2924 | Automatic backups | Cover object-storage media through versioning or replication | “Way too much to do now”; `site-backup/sources.ts:279` explicitly warns that object-storage media bytes are excluded. | s7-50 |
| LOW | M | CODEX | 2969 | Plannie rebuild | Supply Calendly integration as a plugin | Owner: “not doing anything now.” No Calendly plugin found in inspected plugin manifests. | s7-85 |
| LOW | M | OWNER | 2971 | Plannie rebuild | Resolve the eight owner product questions | Explicitly parked; this entry still delegates profile visibility, payments, migration, membership, and provider choices to the owner. | s7-87 |
| LOW | M | OWNER | 2972 | Plannie rebuild | Critique widgets design draft before implementation | Explicitly “awaiting owner critique,” under “not doing anything now.” | s7-88 |
| LOW | M | CODEX | 3046 | Maps plugin | Add sealed Maps credentials and geocode/place tools | “Later (far off).” No Maps credential intake or corresponding tool registration found. | s7-135 |
| LOW | M | CODEX | 3047 | Maps plugin | Add public map widget and browser-key setup guidance | “Later (far off).” No map widget registration found in Jini CMS widgets. | s7-136 |
| LOW | M | CODEX | 3051 | Disk cleanup | Perform monthly cleanup with approval for large deletions | Reminder is explicitly dated 2026-11-09; today is 2026-10-17. | s7-138 |
| LOW | M | CODEX | 3066 | Site-switch speed | Remove npx/watch startup overhead and shorten shutdown | “LOW PRIORITY / LATER”; `development/scripts/dev.mjs:605` still launches `npx tsx watch`. | s7-150 |
| LOW | M | CODEX | 3066 | Site-switch speed | Skip unchanged plugin seeding and refresh on readiness | “LOW PRIORITY / LATER”; bootstrap still invokes seeding, and local-sites hook retains timer-based refresh. | s7-151 |
| LOW | L | CODEX | 154 | Editor polish | Run animations live without persisting mutated runtime DOM | “LOW PRIORITY (later)”; Jini editor-blocks.ts:163 keeps scripts inert; locked blocks do not implement editable live scripting. | s1-67 |
| LOW | L | CODEX | 206 | Owner decisions | Finish core hooks and namespaced plugin-published hooks | “low priority”; packages/sdk/src/hooks.ts:39 still catalogs only content.entry.beforeSave; namespaced event publication is absent. | s1-107 |
| LOW | L | CODEX | 375 | Worklist/Parked | Add Jev model routing to the assistant | “Later / back of mind”; content/agent-plugins/jev/plugin.json:5 explicitly says its skill-only plugin cannot call Jev directly from chat. | s1-177 |
| LOW | L | CODEX | 381 | Worklist/Parked | Implement newsletter backlog stages | “no newsletter work at all”; explicit owner freeze remains in force. | s1-183 |
| LOW | L | OWNER | 457 | Assistant permissions | Introduce delegated agent principals and intersected permissions | “Possible later work”; owner calls present restrictions “unnecessary and just preemptive” (`todos.md:455`). Current authorization has no delegation intersection. | s2-15 |
| LOW | L | UI | 468 | Admin motifs | Demonstrate whole-admin CSS and token theme swaps | “NOT before the Tovu→Jini re-architecture lands”; `ADS-memory/.local-artifacts/handoffs/2026-10-03-tovu-b3-to-tovu-96-admin-buffet.md:27` repeats “NOT now” for motifs. | s2-21 |
| LOW | L | CODEX | 536 | Plugin installation | D3: Add URL installation | “URL install deferred”; current tools explicitly do not download (`apps/website/src/features/plugin-runtime/install-tool.ts:59`); URL UI remains disabled. | s2-27 |
| LOW | L | CODEX | 694 | WebMCP | Migrate data-agent attributes to WebMCP conventions | “Later… once the spec covers non-form elements”; current page guidance retains editing handles (`apps/website/src/features/pages/agent-tools.ts:122`). | s2-42 |
| LOW | L | CODEX | 1010 | Third-party embeds | Let plugins contribute widget types and renderers | “Scheduled for later.” Jini `packages/cms/src/widgets/resolvers/index.ts:67` retains a closed resolver map; `types.ts:63` retains a closed type union. | s3-07 |
| LOW | L | CODEX | 1272 | Admin sweep | Add member billing | `development/todos.md:1272`: “Pagination and billing deferred”; billing remains a placeholder at `apps/admin/src/panels.tsx:828`. | s4-12 |
| LOW | L | CODEX | 1277 | Admin sweep | Implement Privacy and Memory settings later | Owner: “Build each later.” `apps/admin/src/features/settings/SettingsUi.tsx:492` and `:605` retain inert wrappers. | s4-20 |
| LOW | L | OWNER | 1374 | Active / themes | Build Tier-3 JavaScript theme and isolation design | “LATER”; “Blocked on the Tier-3 isolation design” (`development/todos.md:1374`). `apps/website/src/features/theme/theme.ts:41` still describes code tier as unbuilt. | s4-34 |
| LOW | L | CODEX | 1686 | Eventing | Event replay and backfill | ADR-022:67: “Deferred (designed-for, not built in v1)” includes the full replay engine. | s5-09 |
| LOW | L | CODEX | 2029 | Membership | Stripe payment gateway | `apps/website/src/features/members/ports.ts:18`: payment/billing is a “deferred tier-3 seam”; no Stripe membership integration verified. | s5-178 |
| LOW | L | CODEX | 2869 | PGlite | Enable and validate PostGIS and pgvector | Owner: “NOT now.” PGlite is installed, but inspected manifests contain neither extension integration. | s7-06 |
| LOW | L | CODEX | 2893 | workerd | Add sandboxed assistant code mode | “LATER.” No workerd or codemode dependency found in inspected product manifests. | s7-20 |
| LOW | L | CODEX | 2894 | workerd | Isolate untrusted server-rendered theme and embed code | “LATER.” Current sandbox adapter uses Node workers; workerd integration has not landed. | s7-21 |
| LOW | L | CODEX | 2895 | workerd | Add workerd-equivalent preview and Workers deployment | “LATER.” Existing Cloudflare Pages plugin provides static deployment, without the proposed workerd runtime. | s7-22 |
| LOW | L | CODEX | 2896 | workerd | Host multiple sites as isolates in one process | “LATER”; `apps/website/src/platform/site-dir/local-site-supervisor.ts:126` launches separate site processes. | s7-23 |
| LOW | L | CODEX | 2919 | Media storage | Make storage vendors plugins with active-provider removal protection | Owner: “not now at all.” S3 remains a Tovu adapter selected through environment configuration. | s7-38 |
| LOW | L | CODEX | 2920 | Media storage | Migrate local media with digest verification before switching | “Not now at all.” Existing adapter implements blob operations, without a migration lifecycle. | s7-40 |
| LOW | L | CODEX | 2924 | Automatic backups | Add continuous WAL replication and point-in-time restore | “Way too much to do now.” Current backup source captures discrete SQLite snapshots. | s7-46 |
| LOW | L | CODEX | 2924 | Automatic backups | Add one-click restore and automated restore verification | “Way too much to do now”; `site-backup/tool-registrations.ts:91` explicitly excludes backup restoration. | s7-49 |
| LOW | L | CODEX | 2928 | Playground styling | Add Apache ECharts as another provider | Explicitly “Later”; bundled chart manifest currently declares Recharts only. | s7-53 |
| LOW | L | CODEX | 2970 | Plannie rebuild | Close entry-page, filter-widget, member-widget, and rich-form gaps | “Not doing anything now.” Common form fields and sign-in links exist; complete collection and member widgets remain absent. | s7-86 |
| LOW | L | CODEX | 3045 | Maps plugin | Add generic maps capability with Google adapter | Owner: “Later (far off).” No maps provider manifest found in inspected site or agent plugins. | s7-134 |
| LOW | L | CODEX | 3048 | Maps plugin | Support theme options and chat-driven install plus insertion | “Later (far off)”; depends on the unbuilt maps provider and widget. | s7-137 |
| LOW | L | OWNER | 3066 | Site-switch speed | Decide whether to support site swaps without restarting | Explicit “LOW PRIORITY / LATER”; current activateSite flow persists selection and requests a server restart. | s7-152 |

## DONE — candidates to prune (owner approval)

| line | section | item | evidence | id |
|---|---|---|---|---|
| 26 | Next session | Move subagents icon and replace tooltip | apps/admin/src/components/AssistantDock/AssistantDock.tsx:510 places indicator beside switcher; SubagentsIndicator.tsx:17 uses bottom InfoTip; styles/assistant.css:476 sets normal cursor. | s1-01 |
| 27 | Next session | Attach Done footer to its completed turn | Jini c58beff6; packages/chat/src/react/components/MessageRow.usage.ts:22 suppresses running-turn footer; MessageRow.tsx:413 renders completed reply usage. | s1-02 |
| 29 | Next session | Fix template scrolling and reuse Wrap toggle | 873bf9957; apps/admin/src/components/CodeView/CodeView.tsx:36 shares wrapped/unwrapped rendering and pressed-state toggle. | s1-03 |
| 30 | Next session | Render post authors in core without duplicate bylines | 3f638703c; apps/website/src/features/theme/static-render.ts:740 chooses explicit author placement or core fallback. | s1-04 |
| 33 | Next session | Implement recommended core author header fix | 3f638703c; apps/website/src/features/theme/static-render.ts:744 supplies the missing author marker. | s1-05 |
| 35 | Next session | Require visitor AI credentials and show request errors | 3167afa9b adds server readiness checks, widget gating and visible transport errors. | s1-06 |
| 38 | Next session | Enforce visitor AI readiness on server and widget | 3167afa9b; apps/website/src/assistant/public-assistant-availability.ts:23 rejects missing keys/models. | s1-08 |
| 41 | Next session | Replace taxonomy datalist with shared suggestion input | 873bf9957; apps/admin/src/features/taxonomy/TermPicker.tsx:109 renders Jini SuggestInput. | s1-10 |
| 42 | Next session | Cache CLI probes and refresh detection in background | Jini 05991906; packages/agent-runtime/src/model-discovery.ts:60 coalesces probes; :99 caches results; :105 supports background refresh. | s1-11 |
| 43 | Next session | Skip unchanged saves and warn before saving clean editors | 8ac8ee852; html-document-store.ts:475 skips equal HTML; apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:1323 supplies unchanged-save warning. | s1-12 |
| 44 | Next session | Filter templates by content kind and rename Plannie Landing | 75fcc8ca0; template-applicability.ts:43 filters mappings; /Users/la/Documents/Tovu/plannie/themes/static/plannie/theme.json:19 includes Landing/page mapping. | s1-13 |
| 45 | Next session | Retry failed RemixIcon font loading | Jini a3c1a1fc; packages/ui/src/react/components/RemixIcon.stylesheet.ts:8 starts bounded font recovery. | s1-14 |
| 47 | Next session | Move Theme Explore file list above full-width preview | 0e49c6551; apps/admin/src/features/themes/ThemeExplore.tsx:465 implements the top file tray. | s1-15 |
| 53 | Next session | Move disabled Home publish explanation into tooltip | apps/admin/src/features/themes/ThemeExplore.tsx:1017 uses publishToggleTipLabel; hooks/use-theme-explore.hooks.ts:431 returns the locked reason. | s1-19 |
| 54 | Next session | Add dock Settings gear and header tooltips | d26601e80; AssistantDock.tsx:535 renders Settings menu; dock-header-rules.ts:61 now provides actual display settings. | s1-20 |
| 56 | Next session | Mark unfinished theme tabs Soon while keeping them clickable | 0e49c6551; apps/admin/src/features/themes/Themes.tsx:209 assigns Soon tags through isSoonThemeTabGroup. | s1-21 |
| 60 | Next session | Keep and steer both messages sent during a run | Jini f9d06757 fixes mid-run steering/background stdin; Tovu edd27dbac updates journey assertions for steering. | s1-23 |
| 62 | Next session | Support all form field types and provide demo | 00766e35b; apps/website/src/features/forms/fixtures/all-fields-demo.json:4 covers dropdowns, groups, uploads, dates, consent and validation. | s1-24 |
| 63 | Next session | Add generic media widget and Raw HTML mode | 34311d276; Jini ec6457e2; apps/website/src/features/widgets/media-html.ts:79 resolves image/video/audio slugs for Raw HTML. | s1-25 |
| 64 | Next session | Represent script-driven editor sections as locked blocks | d6b6bbce6; Jini packages/ui/src/features/html-editor/editor-blocks.ts:93 detects Kuinetic, canvas, autoplay and authored blocks. | s1-26 |
| 66 | README videos | Two autoplay README videos | all items done/stale | s1-27 |
| 68 | README videos | Publish standalone hero autoplay clip | 1044b7917; README.md:6 embeds .github/readme/tovu-hero.webp linked to the full video. | s1-28 |
| 69 | README videos | Combine four capability clips into one autoplay reel | efed037e6/6fee34553; README.md:14 embeds tovu-capabilities.webp; capabilities MP4 is retained. | s1-29 |
| 75 | Forms in posts | Require saved form widget in rich-text posts | 13aad022e; apps/website/src/features/forms/agent-tools.ts:216 documents contact-form widget insertion and direct HTML-page markers. | s1-31 |
| 84 | Answered cards | Clear pending-answer footer immediately after Confirm | Jini 0a9796cf; MessageRow.tsx:329 passes answered-card state into waiting detection; :363 marks answered cards. | s1-34 |
| 93 | Themes header | Align View site and theme action buttons | apps/admin/src/features/themes/Themes.tsx:508 places View site separately; :511 groups Rescan, theme-off and Publish. | s1-37 |
| 96 | JSON listings | Add JSON listings and theme-provided client card templates | 95cb29d68; public-http/routes/site/pages.ts:2349 builds JSON batches; site-export/site-exporter.ts:528 discovers JSON next-page exports. | s1-38 |
| 102 | Full CLI ability | Handle ACP permission requests without failing the run | Jini 691451b5; packages/agent-runtime/src/agent-protocol/acp/session.ts:1338 selects policy outcomes when no handler exists. | s1-40 |
| 120 | Custom TS plugins | Require human consent for first enable and capability widening | Jini 2bac9709; packages/plugins/src/host/source-policy.ts:22 requires confirmation for new capabilities even when sealed locally. | s1-49 |
| 124 | Chart plugin | Finish npm removal after bundled Recharts provider | Re-checked by Claude 10-17: `npm view @jini-ai/charts-recharts` and registry.npmjs.org both 404 (unpublished); fc380214d bundles the provider as a site plugin; 4004ea3f4 dropped the admin import; no Tovu file or package-lock.json references it; Jini 55930549 marks the source private. | s1-52 |
| 128 | Deploy plugins | Split deployment platforms into bundled plugins | 4a63e80c5/b497be5ea/f5a509eab/b67447bb9 split contributions; current platform folders contain adapters, manifests and platform-specific skills. | s1-53 |
| 139 | Post-0.1.14 | Move vault and credential copying into 0.1.14 scope | 9b20083b6 implements one vault and generic local credential-copy flow. | s1-57 |
| 140 | Post-0.1.14 | Replace thirteen sealed secret stores with one vault | 9b20083b6; apps/website/src/platform/db/migrations/0012_secrets_vault.ts:258 preserves backups before consolidating legacy rows. | s1-58 |
| 166 | Post-0.1.13 | Close remaining 0.1.12 journey bugs | all items done/stale | s1-76 |
| 167 | Post-0.1.13 | Commit reviewed journey screenshot baselines | 0b179ab97 commits reviewed G3/G4 baselines; 2b8b09072/7479985f0/7c9845389 add and refresh further journey baselines. | s1-77 |
| 171 | Post-0.1.13 | Consolidate credential cards, exchange store and credential_save | d4e43bd00; custom-credentials/tool-registrations.ts:11 imports defineSecretCardTool; :19 imports Jini surface-exchanges. | s1-80 |
| 174 | Cleanup program | Finish duplicated Tovu-to-Jini lifecycle migration | d4e43bd00 moves lifecycle/loaders, surfaces, credentials, settings and commerce; 247feb6fa/5095dcbc9 cover users and federation. | s1-82 |
| 178 | Cleanup program | Extract commerce and remove Tovu payment entry points | d4e43bd00 moves commerce to Jini and unwires Tovu; 57291a25b drops empty core commerce tables. | s1-85 |
| 180 | Cleanup program | Share plugin machinery while preserving separate plugin contracts | d4e43bd00 adopts Jini agent-plugin lifecycle/loaders; site-runtime source-tools.ts:12 retains a distinct site-plugin workflow. | s1-87 |
| 182 | Cleanup bugs | Commit eight already-fixed audit defects | d4e43bd00 commits cleanup/fix rounds; skills/api.ts:9 and themes/theme-preview-refresh.ts:54 now use authenticatedAdminRequest. | s1-88 |
| 192 | Owner decisions | Show redacted BYOK tool errors with copyable error IDs | apps/website/src/assistant/tool-recovery-preset.ts:79 logs correlated IDs, tool/run/principal metadata and redacted messages; failure cards expose details. | s1-92 |
| 194 | Owner decisions | Select individual publish rows and groups | apps/admin/src/features/publish-content/PublishContentDialog.tsx:163 renders row overwrite controls; confirmation retains selected keys. | s1-94 |
| 195 | Owner decisions | Use one grouped alphabetical publish comparator | apps/website/src/features/publish-content/ui/publish-order.ts:55 compares group rank, locale-aware label and tie-break. | s1-95 |
| 196 | Owner decisions | Repoint live menu links and default seed overwrites | apps/website/src/features/publish-content/apply-loop.ts:748 accumulates repointed links; admin confirmation exposes overwrite selection and menu updates. | s1-96 |
| 197 | Owner decisions | Finish site-key naming, automatic creation and hidden Generate | 85b6f39ba removes legacy env name; SiteKeyTab.tsx:146 keeps Generate hidden; keyring.env.ts owns automatic key creation. | s1-97 |
| 199 | Owner decisions | Use slug embed targets and plain marker attributes | apps/website/src/features/pages/agent-tools.ts:159 documents media/widget slugs and plain marker attributes; current parser separates attributes from target configuration. | s1-100 |
| 202 | Owner decisions | Use stripped Tovu Starter as new-site default | content/templates/starter/seed-content.json:1626 selects tovu-starter; platform/site-dir/seed-site-themes.ts:71 seeds only that stock theme. | s1-103 |
| 203 | Owner decisions | Keep kUInetic major-range CDN and local fallback | 5abcd90ba restores kuinetic@0 plus local fallback; current shipped templates retain the major-range URL. | s1-104 |
| 210 | Owner decisions | Retain blocking CI drift checks, RSS and newsletter freeze | package.json:60–72 retains drift checks; public-http/routes/site/feed.ts:24 serves RSS; todos.md:381 preserves the newsletter freeze. | s1-111 |
| 249 | 10-05 leftovers | Make list screenshot baselines deterministic | 80e9045be/c68e1f5d7/04279cff5 add deterministic collection, forms, menu, widget and RTL dashboard fixtures. | s1-118 |
| 265 | Chat cost | Show per-turn cost and cumulative conversation total | Jini 25c79e7f/c58beff6; MessageRow.usage.ts:57 formats reply cost plus total; later owner decision keeps total on every reply. | s1-123 |
| 278 | Chat/landing followups | Keep mobile carousel arrow clear of chat bubble | 6dc559c49 fixes mobile landing-carousel arrow placement around the chat button. | s1-126 |
| 297 | Worklist/Desktop | Provide shared automated desktop launch and teardown harness | 777f6c8c4/a178e4b57; development/e2e/desktop/_fixtures.ts:17 shares isolated Electron launch/teardown; _app-target.ts supports packaged apps. | s1-130 |
| 356 | Worklist/Security | Complete site-key rename and retire legacy env fallback | 85b6f39ba reads only TOVU_SITE_KEY; b475966d4 adds naming guard; 4e44bd789/b2857a721 sweep docs and UI. | s1-164 |
| 384 | Worklist/Parked | Provide optional Composio agent plugin | d85cf7f33; content/agent-plugins/composio/mcp.json:6 declares hosted OAuth MCP; skills/composio/SKILL.md:27 documents disabled-by-default opt-in. | s1-186 |
| 424 | Visibility | Keep observability separate and use standard OTLP configuration | `apps/website/src/platform/observability/index.ts:2` imports diagnostics; `config.ts:19` documents standard OTLP environment variables. | s2-03 |
| 436 | HTML embeds | Resolve form endpoints automatically on the server | `apps/website/src/server/inbound/public-http/http/site/render.ts:2448` supplies `/forms/{slug}/submit` to the renderer. | s2-05 |
| 437 | HTML embeds | Support both form and widget marker spellings | `../Jini/packages/cms/src/widgets/resolver-service.ts:531` resolves form references through the existing contact-form widget pipeline. | s2-06 |
| 442 | HTML embeds | Restore form resolver and validator registration | Resolver registered at `../Jini/packages/cms/src/widgets/resolver-service.ts:1245`; validator accepts form at `apps/website/src/features/theme/validation/markup.ts:26`. | s2-07 |
| 443 | HTML embeds | Support menu and taxonomy HTML embeds | `apps/website/src/features/theme/static-render.ts:392` handles menu HTML mode; `server/inbound/public-http/http/site/render.ts:2803` renders taxonomy output. | s2-08 |
| 445 | HTML embeds | Support plain POST with honeypot and rate limiting | `../Jini/packages/cms/src/forms/html-render.ts:110` emits POST; `submit-service.ts:109` checks honeypot and `:126` enforces rate limiting. | s2-10 |
| 447 | HTML embeds | Add Copy HTML embed controls | Form control: `../Jini/packages/admin/src/forms/react/components/FormEditorFieldsBody.tsx:102`; menus: `apps/admin/src/features/menus/MenuEditor.tsx:444`; taxonomy: `features/taxonomy/Taxonomy.tsx:730`. | s2-12 |
| 449 | HTML embeds | Move framework-free form rendering into Jini | `../Jini/packages/cms/src/forms/html-render.ts:101` implements rendering; Tovu imports it at `apps/website/src/server/inbound/public-http/http/site/render.ts:8`. | s2-13 |
| 475 | Admin buffet | Compose admin pages and tabs from Jini modules | `apps/admin/src/integrations/jini-admin/modules.hooks.ts:41` composes six domain modules; Jini `packages/admin/src/core/module/create-admin.ts:59` implements composition and tab omission. | s2-22 |
| 485 | Entry envelopes | Release and consume content-type envelope ownership fix | Jini `72ca0548`; Tovu adoption `74777c87f`; current `package-lock.json:2816` resolves published cms 0.5.13. | s2-23 |
| 534 | Plugin installation | D1: Support agent-plugin installation | `270a445ec`; `apps/website/src/features/agent-plugins/install-tool.ts:30` supports local folders, ZIPs and bundled plugin IDs. | s2-25 |
| 535 | Plugin installation | D2: Reuse admin.plugins.enable permission | `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts:19` authorizes folder and ZIP installation with `admin.plugins.enable`. | s2-26 |
| 539 | Plugin installation | D6: Review folder and ZIP installs before consent | `apps/admin/src/features/plugins/AddPluginPanel.tsx:69` requires preview before Install; `:94` displays the code warning; server requires the reviewed digest. | s2-30 |
| 542 | Plugin installation | Ship folder CLI installation and deployment-gated admin routes | `fb6189fa6`; CLI implemented at `apps/website/src/cli/commands/plugin/install.ts:30`; current deployment policy at `features/plugin-runtime/install.ts:5` gates hosted installations. | s2-31 |
| 553 | Jini releases | Publish agent-runtime model discovery | Jini `7e688081` implements discovery; `package-lock.json:2642` resolves registry-published agent-runtime 0.4.11. | s2-32 |
| 555 | Jini releases | Publish translated BYOK messages | `74777c87f` adopts the Jini release; `package-lock.json:3280` now resolves registry-published ui 0.5.5. | s2-33 |
| 556 | Jini releases | Publish CMS media upload cap corrections | Jini `754b0ff9`; Tovu adoption `74777c87f`; `package-lock.json:2816` resolves registry-published cms 0.5.13. | s2-34 |
| 609 | MCP Server | Resolve interim hide-versus-label decision | `apps/admin/src/features/providers/Providers.tsx:277` records the later owner decision: retain visible controls inside an inert Coming soon wrapper. | s2-39 |
| 726 | Media provenance | Decide and record the asset’s creating actor | `c321cd0ca`; `../Jini/packages/cms/src/media/media-service.ts:369` sets `createdBy` from `createdByPrincipal`. | s2-44 |
| 730 | Media provenance | Add a deliberate provenance migration | `apps/website/src/platform/db/migrations/0005_media_createdby.ts:6` explicitly adds nullable `created_by`; no regenerated migration bundle required. | s2-45 |
| 733 | Media provenance | Leave existing provenance unknown instead of inferring credit | `apps/website/src/platform/db/migrations/0005_media_createdby.ts:6` adds the nullable column without a default or backfill. | s2-46 |
| 736 | Media provenance | Populate provenance across upload, import and generation paths | `c321cd0ca`; current upload stamps principal at `apps/website/src/server/inbound/admin-http/routes/media/upload.ts:158`; import and generation also pass `createdByPrincipal`. | s2-47 |
| 796 | assistant-ui | Preserve and recover chat runs across daemon failure | `0520d5854`; `apps/website/src/server/runtime/composition/serving-app.ts:47` enables restart recovery; Jini `packages/chat/src/server/durable-runs/recover.ts:93` resumes saved attempts. | s2-50 |
| 841 | Desktop shell | Show permanent All tab and closable project tabs | `apps/desktop/src/renderer/App.tsx:480` implements TabStrip; `:506` renders All; `:519` displays project status/name and `:528` closes tabs. | s2-52 |
| 843 | Desktop shell | Embed selected projects inside the existing window | `apps/desktop/src/renderer/App.tsx:572` mounts SiteWorkspace; `:742` renders its embedded webview. | s2-53 |
| 845 | Desktop shell | Provide project status, view toggle, URL and browser controls | `apps/desktop/src/renderer/App.tsx:675` onward renders status, Admin/Site toggle, current URL, Open in browser and expand; Reload is at `:679`. | s2-54 |
| 848 | Desktop shell | Expand reversibly while hiding toolbar and tab strip | `apps/desktop/src/renderer/expanded-mode.ts:101` hides both chrome areas; `App.tsx:796` provides a reversible ExpandToggle. | s2-55 |
| 909 | MCP refusals | Surface refusals and actionable grants | all items done/stale; `apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx:471` mounts banner; `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:661` installs refusal diagnosis. | s3-02 |
| 1015 | Third-party embeds | Resolve markers across standalone, home, and error pages | `apps/website/src/server/inbound/public-http/routes/site/pages.ts:803` defines shared resolution; calls at `:1920`, `:2142`, `:2644` cover those surfaces. | s3-09 |
| 1028 | Third-party embeds | Resolve preview scripts sharing the admin origin | `f65fb186a` accepts opaque-origin isolation and its costs; `apps/admin/src/features/pages/rules.ts:631` excludes `allow-same-origin`. | s3-12 |
| 1050 | Raw HTML authoring | Author HTML forms using existing submissions backend | `5e9f338f6`; current `apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts:32` saves authoring; Jini `packages/cms/src/forms/html-render.ts:110` supplies submission action. | s3-14 |
| 1056 | Raw HTML authoring | Author and render menu HTML | `ad3d7127e`; `apps/admin/src/features/menus/MenuEditor.tsx:487` exposes HTML editor; Jini `packages/cms/src/widgets/resolvers/menu.ts:83` forwards stored HTML. | s3-15 |
| 1060 | Raw HTML authoring | Author raw widget HTML | `34311d276` ships Media/Raw HTML editor; `apps/website/src/features/widgets/media-html.ts:78` implements rendering, wired at `server/inbound/public-http/http/site/render.ts:2587`. | s3-16 |
| 1067 | Raw HTML authoring | Unify embed configuration and HTML output modes | `5e9f338f6` restores form alias and HTML mode; Jini `packages/cms/src/widgets/html/html-embeds.ts:230` carries canonical `mode:"html"` configuration. | s3-17 |
| 1090 | SPEC-005 remainder | Complete sample plugin, save wiring, and final polish | `ca7a85d2d` completed Phases 2–4; current `apps/website/src/server/runtime/composition/plugin-runtime.ts:613` wires hooks; `post/post.ts:1826` invokes them. | s3-19 |
| 1110 | SPEC-003 inspection | Evaluate source-map-accurate coverage tooling | `8a92a648d` records actual c8 source-mapped measurement, identifies Node coverage’s incorrect line mapping, and adds tests for uncovered branches. | s3-24 |
| 1146 | Embeds formalization | Add substantive embed render-path regression tests | Jini `packages/cms/src/widgets/__tests__/integration/resolver-service.integration.test.ts:205` tests the exact August fix; Tovu `widget-body-embeds.test.ts:58` tests both content kinds. | s3-31 |
| 1146 | Embeds formalization | Test media sizing through public rendering | `apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts:238` asserts actual image width, height, and CSS class; resolver integration asserts metadata at `resolve-html-page-embeds.integration.test.ts:545`. | s3-32 |
| 1266 | Admin sweep | Pending-migration endpoint and banner | `apps/website/src/server/inbound/admin-http/routes/recovery/status.ts:58` reads real status; `apps/admin/src/features/recovery/Recovery.tsx:104` renders the Database link. | s4-01 |
| 1270 | Admin sweep | Allow video in Media file picker | `c55da3e1c`; `apps/admin/src/features/media/Media.tsx:882` includes `video/mp4,video/webm`. The remaining-owner-decision wording is incorrect. | s4-05 |
| 1275 | Admin sweep | Provide outbound credential creation and rotation surfaces | `apps/admin/src/features/security/hooks/access-tokens-dependencies.hooks.ts:16` binds CRUD; `use-access-tokens.hooks.ts:540` and `:570` implement replacement. | s4-16 |
| 1336 | Active / VRT | Review and replace four stale visual baselines | `0b179ab97` (“visual baselines, reviewed”) adds current home-desktop, home-wide, home-mobile-390, and post-welcome journey snapshots. | s4-26 |
| 1348 | Active / VRT | Clip mobile screenshot around closed-drawer overflow | `development/e2e/journeys/themes.pins.journey.ts:651` explicitly clips home-mobile-390 to viewport width. | s4-30 |
| 1428 | Historical record | Completed research and architecture groundwork | all items done/stale | s4-44 |
| 1553 | Agent capabilities | Decide and implement integration credential storage | `apps/website/src/features/vendor-credentials/vault-adapter.ts:26` maps integration credentials into scoped Jini vault records with sealed payloads and safe summaries. | s4-68 |
| 1566 | Agent capabilities | Derive risk independently and require explicit read-only evidence | `../Jini/packages/core/src/registration-kit.ts:405` rejects missing/mismatched derived risk; `tool-registry.ts:93` requires readOnly exactly true. | s4-71 |
| 1586 | Directus research | Complete remaining Directus research section | all items done/stale | s4-72 |
| 1653 | Kernel | Kernel responsibilities | `apps/website/src/server/runtime/lifecycle/boot-lifecycle.ts:22`; `../Jini/packages/core/src/daemon.ts:84`: typed lifecycle, dependency bindings, service composition. | s5-01 |
| 1664 | Kernel | DB, outbound, agent observability | `123f11401`, `6e21d6acd`, `12a88842c`; `apps/website/src/server/runtime/composition/deps.ts:1083` instruments storage; finalizer tracks agent runs. | s5-06 |
| 1696 | Search | Search relevance tuning | `apps/website/src/features/post/search-index.sqlite.ts:126` applies weighted BM25; PostgreSQL uses matching weights; search evaluation fixtures exist. | s5-12 |
| 1710 | Themes | Slots and regions injection | `apps/website/src/features/theme/static-render.ts:801` resolves manifest-declared slots; `theme.ts:163` declares widget regions. | s5-17 |
| 1716 | Themes | Theme safety and recovery strategy | `apps/website/src/features/theme/theme-files.ts:727` atomically restores original files; package validation and reversible activation provide safety gates. | s5-20 |
| 1730 | Plugins | Server extension registries | `apps/website/src/server/inbound/public-http/routes/plugin-contributions.ts:45` dispatches registered plugin routes; Jini owns hook/tool contribution registries. | s5-25 |
| 1733 | Plugins | Observability and fault isolation | `apps/website/src/server/runtime/composition/plugin-runtime.ts:252` persists automatic quarantine; plugin failures carry attribution and logs; Tier-2 calls use workers. | s5-26 |
| 1747 | HTTP | OpenAPI generation strategy | `ADS-memory/reports/2026-08-23-schema-first-migration-proposal.md:6` selects schema-first Zod/OpenAPI generation; implementation remains separately open. | s5-32 |
| 1767 | AI layer | Structured tool-call protocol | `../Jini/packages/daemon/src/tool-executor.ts:156` defines execution results; core tool descriptors publish schemas; MCP transports execute those contracts. | s5-37 |
| 1769 | AI layer | Context assembly pipeline | `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:905` decodes task/page context; subsequent session handling preserves conversation history and plugin instructions. | s5-38 |
| 1771 | AI layer | Guardrails and human checkpoints | `apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:12` defines action classes; `assistant/tool-approval-policy.ts:34` applies human confirmation. | s5-40 |
| 1773 | AI layer | AI audit and explainability trail | `apps/website/src/assistant/tool-audit-preset.ts:32` wraps execution auditing; catalog searches/descriptions are audited through the same adapter. | s5-41 |
| 1782 | Protocols | Interoperable import/export contracts | `apps/website/src/features/publish-content/type-registry.ts:243` defines versioned packed entities and feature-owned pack/precheck/apply contracts. | s5-44 |
| 1797 | Testing | High-risk regression suite | `apps/website/src/features/plugin-runtime/__tests__/integration/plugin-conflicts.integration.test.ts:40` asserts refusal, rollback and quarantine; browser journeys cover critical user flows. | s5-49 |
| 1814 | Operations | Complete metrics and tracing seams | `6e21d6acd`, `369a8f3f2`, `12a88842c`, `c51138e40` wire storage, outbound HTTP, loopback and agent-run tracing. | s5-55 |
| 1818 | Operations | Secrets management policy | ADR-058:71 defines encrypted dedicated storage; `apps/website/src/server/runtime/composition/storage-secret.ts:77` seals secrets; `vault-boot.ts:12` consumes Jini’s vault. | s5-58 |
| 1829 | Product safety | Conflict isolation and quarantine | `apps/website/src/server/runtime/composition/plugin-runtime.ts:295` refuses conflicts; boot handling quarantines losers; hook failures trigger persistent quarantine. | s5-63 |
| 1831 | Product safety | Authoring safety and template recovery | `apps/website/src/features/theme/theme-files.ts:727` restores originals atomically; Theme Explore exposes reset and guarded editing. | s5-65 |
| 1832 | Product safety | Migration and portability strategy | `apps/website/src/features/site-export/site-exporter.ts:505` exports portable sites; publish-content contracts and bundled site-import provide content transfer paths. | s5-66 |
| 1849 | WP publishing | Timezone-correct scheduled publishing | `apps/website/src/features/post/post.ts:1107` requires timezone-bearing timestamps; `contracts/core/scheduled-publish.ts:66` gates public visibility by UTC instant. | s5-72 |
| 1863 | WP editor | Media, quote, code and table blocks | `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:10` imports code, YouTube, tables and media extensions; PostEditor invokes their editing commands. | s5-80 |
| 1870 | WP themes | Preview before theme activation | `apps/admin/src/features/themes/hooks/use-theme-explore-preview.hooks.ts:77` previews selected theme IDs; `Themes.tsx:317` activates separately. | s5-85 |
| 1873 | WP plugins | Install, activate, update and uninstall | `apps/website/src/server/runtime/composition/plugin-runtime.ts:565` reloads versions with rollback; Jini installer and admin controls handle install/enable/disable/remove. | s5-86 |
| 1875 | WP plugins | Hook and filter extension model | `../Jini/packages/plugins/src/host/hook-registry.ts:230` creates the ordered filter registry; Tovu composition attaches plugin filters to live saves. | s5-88 |
| 1881 | WP operations | Built-in health diagnostics | `apps/website/src/server/inbound/admin-http/routes/database/schema-state.ts:38` serves health state; `apps/admin/src/features/database/Database.tsx:472` renders drift alerts. | s5-92 |
| 1882 | WP operations | Import/export and migration helpers | `apps/website/src/features/site-export/site-exporter.ts:505` exports sites; database-transfer delegates copying; publish-content supports planned imports. | s5-93 |
| 1917 | Strategic parity | Safe AI operations assistant | `apps/admin/src/App.tsx:459` mounts AssistantDock; domain tool registry, approval policy and audit wrappers provide real operational tool calling. | s5-109 |
| 1929 | Major gaps | Internationalization strategy | `apps/website/src/contracts/core/admin-locales.ts:6` declares 22 locales; shared translators and persisted admin locale hooks implement the strategy. | s5-119 |
| 2000 | AEO site outputs | Per-bot robots builder | `apps/website/src/features/seo/settings.ts:268` validates per-userAgent rules; `../Jini/packages/cms/src/seo/sitemap.ts:107` returns those configured rules. | s5-159 |
| 2007 | Engine optimization | Semantic HTML without required client JS | `apps/website/src/features/theme/build-conformance.ts:157` rejects empty hydration islands; public content renders server-side for non-JS crawlers. | s5-164 |
| 2011 | Content quality | Heading hierarchy validation | `apps/website/src/features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts:229` flags heading jumps; also checks duplicate body H1s. | s5-166 |
| 2026 | Membership | Subscription tiers and entitlements | `apps/website/src/features/members/types.ts:73` defines tiers/subscriptions; `access-resolver.ts:129` enforces public/member/paid/tier access decisions. | s5-175 |
| 2032 | AI surfaces | End-user site-change assistant | `apps/admin/src/App.tsx:459` mounts AssistantDock; registered page/theme/content mutation tools perform guided site changes. | s5-179 |
| 2042 | AI mutation | Frontend layout, style and content tools | `apps/website/src/features/pages/agent-tools.ts:252` exposes region editing; theme tools write/edit styles and templates through registered handlers. | s5-184 |
| 2047 | AI mutation | Bound mutations and tenant scope | `apps/website/src/assistant/batch-tool-inputs.ts:40` caps batches; `tool-registrations.ts:393` restricts cross-site reads to owner and excludes mutations. | s5-189 |
| 2056 | Agentic web | Reusable agent capability catalog | `apps/website/src/assistant/tool-registrations.ts:168` assembles domain registrations; `tool-catalog-query.ts:12` derives discovery from the same execution registry. | s5-192 |
| 2118 | Tool evaluation | Evaluate knip | `618f9a5d7` removes rg-verified knip findings; `ADS-memory/reports/2026-09-04-metrics-sweep.md:106` records evaluation results and limitations. | s5-229 |
| 2119 | Tool evaluation | Evaluate boundary validation with Zod | `ADS-memory/reports/2026-08-23-schema-first-migration-proposal.md:6` evaluates/selects Zod for HTTP boundaries and explicitly excludes domain coupling. | s5-230 |
| 2129 | Tool evaluation | Evaluate Madge | `9449d74df` records actual Madge cycle detection and before/after results; `composition/app.ts:1637` records Madge cross-validation. | s5-235 |
| 2227 | JSON tripwire | Close the three recorded tripwire/write-gate defects | all items done/stale; `d309da0fe` fixes regex/trailing comments; [theme.ts:797](/Users/la/Programming/Tovu/apps/website/src/features/theme/theme.ts:797) rejects generated-directory sourceDir conflicts. | s6-06 |
| 2296 | Credential inventory | Provide centralized credential inventory with removal and vendor revocation links | `838f1472c`; [AccessTokensTab.tsx:118](/Users/la/Programming/Tovu/apps/admin/src/features/security/AccessTokensTab.tsx:118) combines inventories; [AccessTokensTab.tsx:778](/Users/la/Programming/Tovu/apps/admin/src/features/security/AccessTokensTab.tsx:778) links to vendor revocation. | s6-08 |
| 2445 | Plugins | Re-enable a disabled downloaded plugin | [Plugins.tsx:161](/Users/la/Programming/Tovu/apps/admin/src/features/plugins/Plugins.tsx:161) renders a direct Enable button for disabled rows, calling `onToggleEnabled`. | s6-12 |
| 2480 | Observability page | Use the shared tabbed settings shell | [Observability.tsx:228](/Users/la/Programming/Tovu/apps/admin/src/features/observability/Observability.tsx:228) renders `SettingsDialogShell` with controlled tabs. | s6-14 |
| 2481 | Observability page | Explain telemetry and report actual server configuration | [Observability.tsx:60](/Users/la/Programming/Tovu/apps/admin/src/features/observability/Observability.tsx:60) explains telemetry; [observability-status.ts:46](/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/system/observability-status.ts:46) returns resolved server configuration. | s6-15 |
| 2483 | Observability page | Provide an honest unfinished Providers tab | [Observability.tsx:107](/Users/la/Programming/Tovu/apps/admin/src/features/observability/Observability.tsx:107) renders the explicit “No provider connected yet” state without a pretend connection form. | s6-16 |
| 2497 | Plugin state | Move plugin screen state into its hook | [use-plugins.hooks.ts:141](/Users/la/Programming/Tovu/apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:141) owns expanded rows and pending removal; the component consumes its controller. | s6-19 |
| 2505 | HTML page rendering | Remove the resolved HTML-page rendering backlog section | all items done/stale; public shell selection exists at [pages.ts:2064](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:2064); preview parity and publication controls also exist. | s6-20 |
| 2576 | HTML page rendering | Align untemplated HTML-page preview with public rendering | `fc075e511`; [template-preview-render.ts:176](/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts:176) calls the same `resolveTemplateBranchChoice` used by public rendering. | s6-21 |
| 2606 | Theme publication | Give standalone theme pages a publish/unpublish switch | [theme.ts:670](/Users/la/Programming/Tovu/apps/website/src/features/theme/theme.ts:670) enforces `publishedPages`; [ThemeExplore.tsx:1000](/Users/la/Programming/Tovu/apps/admin/src/features/themes/ThemeExplore.tsx:1000) renders the Publish switch. | s6-22 |
| 2671 | Theme upgrade safety | Preserve installed themes and reconcile shipped theme drift | all items done/stale; `948706418` reconciles stock; [seed-site-themes.ts:131](/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/seed-site-themes.ts:131) preserves existing theme directories; `59a036e49` moves sites outside the installation. | s6-26 |
| 2821 | Footer links | Convert seeded footer links into content references | `apps/website/src/features/navigation/migrate-footer-page-links.ts:48` implements scoped conversion; resolver hides unpublished and trashed targets. | s7-03 |
| 2825 | Footer links | Backport menu-driven footer into shipped themes | `d309da0fe`; `content/themes/static/tovu-theme/render/partials/footer.html` contains both menu embeds with empty fallbacks. | s7-04 |
| 2872 | PGlite | Give each site its own PGlite directory | `7bf139414`, `a483a9ced` implement site-specific ownership and duplication. | s7-07 |
| 2875 | PGlite | Share one PGlite between API and daemon | `e2c8a03f1`, `794078f0a`; current driver delegates shared socket ownership to `@jini-ai/db/pglite`. | s7-09 |
| 2876 | PGlite | Confirm existing Postgres schema works on PGlite | `7bf139414`; socket-spike report records loading the Postgres baseline; current migrations support the Postgres dialect. | s7-10 |
| 2927 | Playground styling | Style data tables and supply sorting and pagination | `Jini 102421da`; inspected shadcn DataTable and shared CSS implement borders, headers, sorting, and paging. | s7-51 |
| 2928 | Playground styling | Theme Recharts using host tokens | `Jini 102421da`, `f51f897b8`; themed provider now lives in `@jini-ai/charts-recharts`. | s7-52 |
| 2930 | Query devtools | Observability devtools tab | all items done/stale | s7-54 |
| 2931 | Query devtools | Embed live QueryClient panel on Observability | `c348ee3ba`; `queries-panel.tsx:8` lazily loads the production panel, with production interaction disabled. | s7-55 |
| 2934 | Consent | Implement shared consent banner, records, policies, and script gating | `6c2a89008`, `Jini eeda9359`; inspected policy and client enforce GPC and Google consent signals. | s7-56 |
| 2939 | Chart plugins | Define provider-neutral ChartSpec | `../Jini/packages/ui/src/features/charts/contract.ts:14` defines data, series, axes, formats, and provider override. | s7-58 |
| 2939 | Chart plugins | Support site default, chart override, and automatic fallback | `chart-providers.ts:31` reads site preference; Jini chart registry applies override ordering and table fallback. | s7-60 |
| 2940 | Chart plugins | Provide vanilla mount, update, destroy, and React host adapter | `Jini 0c93a60b`, `2775f9a5`; inspected chart contract and Recharts mount implement this ABI. | s7-62 |
| 2941 | Chart plugins | Extract Recharts from ui into bundled site plugin | `Jini e51f1688`, `fc380214d`; ui no longer declares Recharts, and the bundled plugin declares browser assets. | s7-63 |
| 2942 | Chart plugins | Prototype chart-provider package and render through admin chat | `71c4bbdf2`, `6e5e7391a` implement the prototype and admitted-provider chat rendering. | s7-65 |
| 2942 | Chart plugins | Complete extraction after the prototype | `Jini e51f1688`, `fc380214d` complete extraction and default plugin bundling. | s7-66 |
| 2946 | Multiple sites | Add Start, Stop, Trash, restore, confirmed purge, and automatic restart | `apps/website/src/server/inbound/admin-http/routes/sites/local-sites.ts:44` registers lifecycle routes; inspected Sites UI exposes matching controls. | s7-69 |
| 2947 | Multiple sites | Automatically sign owners into locally launched sites | `d25dde844`; inspected boot policy supports guarded browser and desktop local-owner bootstrap while refusing deployed origins. | s7-71 |
| 2948 | Multiple sites | Run additional sites in separate processes and ports | `apps/website/src/platform/site-dir/local-site-supervisor.ts:110` starts independently tracked children with allocated ports and readiness checks. | s7-72 |
| 2952 | Site guide | Provide overview and explain operations through site_guide | `83d4dff4f`; inspected `site-guide-tools.ts` validates and registers both operations. | s7-73 |
| 2953 | Site guide | Contribute domain cards and read live registries | `apps/website/src/server/runtime/composition/site-guide.ts:21` composes domain cards; facts reader consults permission-gated registries. | s7-74 |
| 2954 | Site guide | Keep guide engine generic in Jini | `Jini c21900a6`; Tovu composition injects cards, facts, authorization, and plugin contributions into the shared engine. | s7-75 |
| 2956 | Site guide | Add vendor-neutral system-prompt pointer | `assistant-system-overlay.ts:250` and `modules/assistant-byok.ts:88` insert the shared SITE_GUIDE_POINTER. | s7-76 |
| 2957 | Site guide | Ship first-party plugin and topic contribution extension | `83d4dff4f`; inspected how-tovu-works manifest and `plugin-contributions.ts` supply data-only topic contributions. | s7-77 |
| 2958 | Site guide | Preserve core guidance when enrichment plugin is disabled | `site-guide-tools.ts:17` specifies core topics; composition always supplies built-in capability cards independently of plugin contributions. | s7-79 |
| 2959 | Site guide | Filter site facts, expose MCP resource, and add planner evaluation | `83d4dff4f`; inspected facts authorization, Jini `jini://site-guide` resource, and `development/evals/site-guide-planner.ts`. | s7-80 |
| 2961 | Link previews | Fix social sharing image behavior | all items done/stale | s7-81 |
| 2965 | Link previews | Add JPEG og transform and use it for social images | `21e385e7e`; `media/bootstrap.ts:64` defines 1200×630 JPEG; `seo/index.ts:86` selects `og`. | s7-83 |
| 2965 | Link previews | Warn about missing or tiny share images | `../Jini/packages/admin/src/seo/rules.ts:324` checks missing images, dimensions, and byte size; warning hook checks failed image responses. | s7-84 |
| 2976 | Hardwiring cleanup | Replace listed Tovu copies with Jini owners | `aec57932c`; inspected skills installer, source-control registry, package tree, and HTML escaper call Jini implementations. | s7-89 |
| 2978 | Hardwiring cleanup | Adopt shared query cache, injected UI ports, and provider guards | `c348ee3ba`, `Jini 82ed2d32`; inspected controllers, media picker port, explicit Memory ports, provider guard, and Vitest deduplication. | s7-91 |
| 2979 | Hardwiring cleanup | Bind request-time plugin, skill, and filesystem paths at boot | `ac0d0db40`, `aec57932c`; inspected skill installer and route changes consume resolved site layouts. | s7-92 |
| 2980 | Hardwiring cleanup | Move framework-neutral fetch contract and cache into core | `c348ee3ba`, `Jini 82ed2d32` move the shared cache to `@jini-ai/core/fetch`. | s7-93 |
| 2981 | Hardwiring cleanup | Use library HTML conversion and move generic web helpers to Jini | `75dec40c6`; current converter re-exports `@jini-ai/platform/web`, and web reader is a thin host adapter. | s7-94 |
| 2982 | Hardwiring cleanup | Add all nine hardwiring lint and dependency guards | `aec57932c`; Jini hardwiring inspector declares HW1–HW9, and Tovu composes it with a debt baseline. | s7-95 |
| 2985 | Hardwiring cleanup | Keep GitHub as a bundled plugin outside core | Inspected `content/agent-plugins/github/plugin.json` declares source-control and deploy capabilities; core loads providers through contribution registries. | s7-97 |
| 2987 | Hardwiring cleanup | Replace cross-plugin imports with host capability lookup | `apps/website/src/server/runtime/composition/plugin-host.ts:111` constructs shared lookup; HW9 rejects imports crossing plugin identities. | s7-99 |
| 2988 | Hardwiring cleanup | Add stable publisher-qualified IDs and capability metadata | `content/agent-plugins/github/plugin.json:12` declares `tovu/github` and provides; host lookup validates installed identities. | s7-100 |
| 2989 | Hardwiring cleanup | Use manifest identity, version, and searchable keywords across plugin families | Inspected GitHub and Recharts manifests use Tovu extensions; shared plugin-host composition reads both families through one identity lookup. | s7-101 |
| 2995 | Subagents | Add owner-only default-off danger-confirmed Claude subagent toggle | Inspected subagent settings route, danger strings, hook, and daemon restriction resolution implement the opt-in grant. | s7-105 |
| 3004 | Username changes | Rename users through HTTP, admin UI, and assistant tools | `0521daaf3`; inspected PATCH route and Jini-bound username-change port implement permission checks, reserved names, and audit. | s7-108 |
| 3005 | Username changes | Amend SPEC-006 AC-28 for username changes | `0521daaf3`; inspected `006-identity-and-authorization/feature.spec.md` adds REQ-16 and amended AC-28. | s7-110 |
| 3007 | Post author | Add editable author and conditional public byline | all items done/stale | s7-111 |
| 3008 | Post author | Add author input, username default, and visibility toggle | `21e385e7e`; inspected PostEditor bindings and author-aware creation tools expose author and showAuthor. | s7-112 |
| 3009 | Post author | Add migration, rendering, REST/tools, and import mapping | `21e385e7e`, `3f638703c`; migration 0009, conditional renderer, tool inputs, and Site Import content mapping are present. | s7-113 |
| 3012 | Chat usage | Show per-turn cost and conversation total | all items done/stale | s7-114 |
| 3013 | Chat usage | Correct cumulative Claude session cost being reported per turn | `Jini 25c79e7f`; inspected turn-usage projection subtracts session snapshots and handles counter resets. | s7-115 |
| 3014 | Chat usage | Display rounded-up cents and reduce output-token clutter | `Jini 25c79e7f`; current usage summary formats turn/total cost and moves output-token count into the tooltip. | s7-116 |
| 3015 | Chat usage | Publish and adopt shared cost accounting in Tovu | Current Tovu adoption `c9105af5e` includes chat 0.6.6; inspected Jini conversation projection accumulates per-turn charges across sessions. | s7-117 |
| 3019 | CRUD gaps | Add get-by-id behavior to content_read cards | `apps/website/src/assistant/content-read-tool.ts:324` implements existing-handler lookup, including truncated-list uncertainty. | s7-118 |
| 3029 | Shared sites folder | Share site configuration and database placement across launchers | all items done/stale | s7-123 |
| 3031 | Shared sites folder | Share one app-data config, roots, registry, and running locks | `1cffdf3cf`; inspected desktop and website wrappers use Jini directory workspace, shared config.json, registry, and running locks. | s7-125 |
| 3033 | Shared sites folder | Store new in-site SQLite databases under data.nosync | `../Jini/packages/platform/src/fs/directory-user-config.ts:108` resolves in-site databases into data.nosync. | s7-126 |
| 3034 | Shared sites folder | Support app-data database placement | `directory-user-config.ts:113` resolves app-data databases by site ID; Tovu verifies identity ownership before opening. | s7-127 |
| 3035 | Shared sites folder | Detect cloud-sync risk and offer safe placement | Inspected directory-sync detects all four providers; `sites-home.ts:94` reports appData and local-home remedies. | s7-128 |
| 3036 | Shared sites folder | Migrate stopped databases safely while preserving legacy layouts | `b693fbcf0`; inspected mover verifies/checkpoints databases and relocates references; database resolver accepts legacy, nosync, and app-data layouts. | s7-129 |
| 3042 | Permanent deletes | Add owner-only danger-confirmed setting and exact-target confirmation cards | `4c7d1ea20`; inspected settings UI supports per-tool grants, while handlers prepare targets, confirm, and reauthorize before deletion. | s7-133 |
| 3055 | Owner bugs | Persist selected Claude reasoning effort | `85e895f44`; inspected selection-normalization comparison preserves reasoning and avoids persisting default echoes. | s7-139 |
| 3056 | Owner bugs | Restore spacing before user messages following tool rows | `85e895f44`; `apps/admin/src/styles/assistant.css:645` gives nested mid-run user messages 32px separation. | s7-140 |
| 3057 | Owner bugs | Render all user bubbles with consistent dark styling | `85e895f44`; inspected assistant CSS defines dark bubble and white ink tokens for user messages. | s7-141 |
| 3058 | Owner bugs | Strip markdown from derived conversation titles | `85e895f44`; `content-chat-title.ts:15` strips markdown before recognizing named content. | s7-142 |
| 3059 | Owner bugs | Redesign desktop Sites settings dialog | `bdfa0ae1e`, `924f6bdba`; inspected markup/CSS provide labeled controls, path tooltips, aligned rows, footer actions, and responsive layout. | s7-143 |
| 3062 | Owner bugs | Support site-owned executable plugins | `0f7305e84`; composition creates site-scoped source service, and `deps.ts:576` resolves installation under `<site>/plugins`. | s7-146 |
| 3066 | Site-switch speed | Poll restart request file every 100 milliseconds | Current `development/scripts/dev.mjs:407` already uses `watchFile(..., { interval: 100 })`. | s7-149 |

## STALE / OBSOLETE — candidates to prune (owner approval)

| line | section | item | evidence | id |
|---|---|---|---|---|
| 52 | Next session | Remove Theme Explore file-list scroll trap | 0e49c6551 replaces sidebar scroller with normal-flow top tray; apps/admin/src/features/themes/ThemeExplore.tsx:473 explains the removed trap. | s1-18 |
| 175 | Cleanup program | Make trash and all publishing ask for approval | contracts/headless/assistant-tool-approval-policy.ts:14 records later 10-08 owner rule: reversible trash/local edits run directly; irreversible/external actions ask. | s1-83 |
| 190 | Owner decisions | Keep every delete reversible and prohibit agent purge | features/trash/agent-tools.ts:15 records later owner-acknowledged per-tool permanent-delete opt-in; blanket no-purge-tool rule is superseded. | s1-90 |
| 198 | Owner decisions | Let agents read every file without site-key exceptions | assistant-restrictions-audit/audit.md:221 retains site-key Read protection; K3 explicitly requires a subsequent owner exposure decision. | s1-98 |
| 205 | Owner decisions | Require approval for trash and local publish/unpublish | contracts/headless/assistant-tool-approval-policy.ts:14 names later 10-08 owner rule; read/edit/trash are direct, including local publication. | s1-106 |
| 207 | Owner decisions | Store plugin knowledge in one knowledge folder | Later Layout B decision at todos.md:408 uses per-plugin package/memory/data; 852d711e6 implements the replacement design. | s1-108 |
| 334 | Worklist/Media | Match carousel videos’ zoom style to first clip | todos.md:163 records later verified local zoom V1/V2/V3 playback; remaining posters/production checks are tracked there. | s1-149 |
| 346 | Worklist/Testing | Repeat original Jini guard/count and inline-handler sweep | todos.md:346 explicitly says original counts are obsolete and folds the task into the newer post-extraction audit. | s1-157 |
| 445 | HTML embeds | Emit forms without theme classes or styling | Later owner decision explicitly makes HTML mode inherit theme styling: `apps/website/src/server/inbound/public-http/http/site/render.ts:2443`. | s2-09 |
| 463 | Assistant permissions | Add promised confirmation before credential-backed file commits | `apps/website/src/features/custom-credentials/tool-registrations.ts:96` now explicitly documents direct file edits under owner policy; the promised-card premise was removed. | s2-19 |
| 537 | Plugin installation | D4: Omit an assistant installation tool | `apps/website/src/features/plugin-runtime/install-tool.ts:49` defines `plugins_install`; `:32` records the later owner policy permitting ordinary installs directly. | s2-28 |
| 989 | Unified operator chat | Maintain narrow Runner tool allowlist | `ADS-memory/reports/architecture/ADR-061-runner-tools-for-tovu-site-assistant.md:20` records owner reversal: Runner `ba2e8ea` mirrors the full eligible surface. | s3-05 |
| 1137 | Embeds formalization | Specify taxonomy watermark-stamping obligation | Already specified at `ADS-memory/specs/018-categories-and-tags/SPEC-018-behavior.spec.md:52`; `b4c76b4` repairs wiring to that existing obligation. | s3-29 |
| 1273 | Admin sweep | Build newsletter admin screens | Owner explicitly says “no newsletter work at all” at `development/todos.md:1273`; placeholder remains at `apps/admin/src/panels.tsx:1138`. | s4-13 |
| 1393 | Active / samples | Build contact form as Tier-1 sample plugin | Owner replaced contact form with Testimonials + FAQ at `development/todos.md:1411`; missing-primitives report confirms forms are now core. | s4-36 |
| 1437 | Canonical ADRs | Retire duplicated ADR reference backlog | all items done/stale | s4-45 |
| 1482 | Learn | Research outbox implementations under in-memory-now premise | `apps/website/src/server/runtime/composition/deps.ts:1399` binds durable SqliteOutboxAdapter; “in-memory now” no longer describes production. | s4-51 |
| 1529 | Agent capabilities | Use one registry for control and retrieval planes | Accepted ADR-054 separates public and admin products; `apps/website/src/assistant/site/capability-registry.ts:24` deliberately uses a fixed public registry. | s4-61 |
| 1537 | Agent capabilities | Collapse every entity into operation-level tools | `fca1f97f6` adopted Option A resource-specific content_read cards; `apps/website/src/assistant/content-read-tool.ts:11` fixes resource at registration instead. | s4-63 |
| 1693 | Search | Event-driven indexing triggers | `apps/website/src/features/post/repo.ts:110`: search projection updates within the post transaction, replacing asynchronous event-driven indexing. | s5-10 |
| 1899 | Payload parity | Deep nested document modeling | ADR-022:25 deliberately chooses typed universal columns, validated namespaced extensions and real relation tables instead of Payload’s nested-document design. | s5-98 |
| 2195 | Theme marketplace | Restore or build the deleted marketplace | Owner chose deletion; `8c1780077` removes backend marketplace code. Current [Themes.tsx:162](/Users/la/Programming/Tovu/apps/admin/src/features/themes/Themes.tsx:162) handles obsolete marketplace links. | s6-04 |
| 2478 | Observability page | Remove the Soon badge from the Operations entry | Owner reversed this requirement on 09-13; `3e2f912ba`. [panels.tsx:969](/Users/la/Programming/Tovu/apps/admin/src/panels.tsx:969) documents a clickable Soon preview. | s6-13 |
| 2659 | Deployment | Decide whether self-hosting or hosted SaaS ships first | `4315a0641`; [Deployment.tsx:17](/Users/la/Programming/Tovu/apps/admin/src/features/deployment/Deployment.tsx:17) records the owner’s decision: self-hosted for developers ships first. | s6-24 |
| 2817 | Footer links | Publish linked standalone theme pages | `2e733c6a5` chose content-page references for seeded footer links instead. | s7-02 |
| 2906 | General tools | Keep parity-gap tools blocked on the prototype | `f1b968fef`, `cb853933a` added tools directly; line 3023 records the later decision dropping the generic pilot. | s7-29 |
| 2943 | Chart plugins | Choose runtime component-loading and trust mechanism | `018f26b53` amends ADR-025; reviewed bundled vanilla browser providers replace the earlier unresolved loading alternatives. | s7-67 |
| 2965 | Link previews | Change canonical host from tovu.fly.dev | Owner explicitly said “DROP”; current `fly.toml:97` also already sets `https://tovu.dev`. | s7-82 |
| 3020 | CRUD gaps | Build generic create/update facade and absorb individual tools | Line 3023 explicitly records “PILOT DROPPED”; owner chose direct gap tools instead. | s7-119 |
| 3024 | CRUD gaps | Ask owner to scope a generic CRUD pilot | Superseded by the explicitly later decision at line 3023 dropping the pilot. | s7-121 |
| 3030 | Shared sites folder | Default sites home to Documents/Tovu/sites | `2ffba0dd3` explicitly reverts the nested default to `Documents/Tovu` and migrates stopped nested sites upward. | s7-124 |
| 3039 | Permanent deletes | Blanket prohibition on permanent-delete chat tools | all items done/stale | s7-130 |
| 3040 | Permanent deletes | Keep all permanent-delete tools unavailable unconditionally | Later owner setting supersedes the blanket ban; `4c7d1ea20` adds guarded opt-in exposure. | s7-131 |
| 3041 | Permanent deletes | Remove contributor and rewrite tests around unconditional prohibition | `4c7d1ea20` intentionally restores the contributor; current tests check default-hidden behavior and explicit grants instead. | s7-132 |
| 3061 | Owner bugs | Move sites into nested Documents/Tovu/sites by default | `2ffba0dd3` explicitly reverses this decision and removes the manual nested-move action. | s7-145 |

## Removed from todos.md on 2026-10-17 (verbatim, so nothing is lost)

Prune by one Codex workspace-write job using `prune-manifest.md` (210 REMOVE rows; Master Build Inventory untouched). Result: 3,066 → 2,346 lines, 720 lines deleted, 0 added, 25 whole sections removed, 186 items removed. 24 REMOVE rows were deliberately kept because they share a paragraph/table row with an OPEN/PARKED item (see `out-prune/prune.md`). Line numbers below are pre-prune.

````diff
@@ -26,4 +25,0 @@
-1. **Assistant dock subagents icon:** move the two-people icon out of its own row under the title and put it next to the chat (speech-bubble) button in the header. Hovering it now shows a question-mark cursor and a dark native-looking tooltip. Use a white-background, black-text tooltip shown UNDER the icon that says "This chat can use subagents", with a normal cursor. Narrow change only. Screenshot: `ADS-memory/.local-artifacts/owner-shots-2026-10-09/6-subagents-icon-tooltip.png` (the same shot still shows raw markdown in the title: "Page: Plannie at **plannie").
-2. **Dock turn footer in the wrong place (investigate first):** the previous turn's "Done · 16s · $3.18 (Total: $3.95)" footer renders at the bottom, under the CURRENT turn's still-running tool rows (two web_fetch_page spinners), directly above "Running Web Fetch Page… 0 s". The Done footer should stay attached to the turn it belongs to, and the running status should belong only to the live turn. Likely a per-turn grouping/ordering bug in the chat pane (Jini chat-pane, or the Tovu dock's status-line placement). Tonight's chatui jobs touched the mid-run margin in chat-pane/styles.ts, so check whether they caused it. Screenshot: `ADS-memory/.local-artifacts/owner-shots-2026-10-09/7-done-footer-wrong-turn.png`.
-   **Owner's diagnosis (00:05):** there's ONE "Done" footer for the whole conversation, pinned at the bottom, and it shows a running total whether or not a turn is still going. **Wanted:** each turn gets its own "Done · time · cost" line, printed under that turn's reply when the turn finishes, and it stays there. The owner thinks the running "(Total: $X)" is wrong; confirm with them whether to drop it or show it only once at the conversation level. Not fixing now.
-3. **Read-only theme template viewer is broken on horizontal scroll** (Edit post → template, e.g. `posts-default.html` from the plannie theme): when scrolled sideways, the code slides LEFT of the line-number gutter (text shows to the left of the numbers), long lines run past the right edge of the code pane, and there's an empty right column with only an expand icon. Fix: keep the gutter pinned and clip the code to its own pane. **Also add a Wrap toggle like the one that already exists:** `apps/admin/src/features/plugins/PackageFilesModal.tsx:225` ("Wrap: on" / "Wrap: off", aria-pressed, i18n keys in `plugins-i18n.ts`; its comment at :164 explains how it keeps line numbers aligned when lines wrap). Reuse/extract that, don't rebuild it. Screenshot: `ADS-memory/.local-artifacts/owner-shots-2026-10-09/8-template-viewer-scroll-bleed.png`.
@@ -33 +28,0 @@
-   - **Fix (recommend):** have core's title/date header for posts add "By <name>" when Show author is on. Every theme gets it with no template edits, and the explicit `post-author` marker stays for themes that want custom placement (don't print the byline twice when a template has both). Alternative: add the marker to plannie's and Starter's post templates. Confirm with the owner which one.
@@ -38 +32,0 @@
-   - **Rules:** the server must refuse enable=true unless a key AND a model are saved. The public widget must not render when there's no usable key/model, even if the stored flag says on. If a visitor request still fails, show a short error in the panel, never a silent hang.
@@ -41,5 +34,0 @@
-6. **Categories & Tags add box uses the browser's native `<datalist>`** (`apps/admin/src/features/taxonomy/TermPicker.tsx:108-122`): Chrome on macOS draws the suggestions as a black bubble with a pointer and puts a big ▼ in the box, so it matches nothing else in the admin (owner, 2026-10-10: "why does the dropdown look so funny?"). Replace it with our own suggestion list: white like the admin's dropdowns, opens right under the box, filters as you type, no ▼. Check Jini for an existing combobox first (`Jini/packages/ui/src/features/admin-widgets/components/Select`, `mention-autocomplete`) and reuse it rather than building a new one.
-7. **Opening the admin spikes the machine:** on a page load (10-10 08:39) the server was spawning CLI probes (`opencode run --help`, `opencode models`, `claude -p … stream-json`) at the same time. Load went to 13 and a plain post GET took 12 s, so Categories & Tags sat on "Loading…" for ~40 s and editor images didn't render. Find what triggers the probes on page load (agent detection / model discovery / Rescan PATH), cache the results, and run them once in the background rather than on every admin open.
-8. **Save with no changes still writes a new version** (checked 10-10): post update (`apps/website/src/features/post/post.ts` ~:1795) always bumps `version` and appends a full `post_revisions` snapshot (`state_json`, plannie avg 3.6 KB, max 14 KB); the admin Save button isn't disabled when clean either. Harmless in size (1,000 empty saves of the biggest post ≈ 14 MB) but it clutters version history. Fix: server skips the write + revision when nothing changed (compare with the latest revision's `content_hash`, return the current version), and the admin greys out Save while clean. Same for html pages (`features/pages/html-document-store.ts`). **Owner's UI (10-10), supersedes "grey out Save":** Save is NEVER greyed out (a missed change must still be savable). When the editor thinks nothing changed, hovering Save shows a tooltip ("No changes yet") and clicking it opens a warning modal "Nothing changed. Save anyway?"; "Save anyway" sends the content, the server compares with what's stored and either saves (it really changed) or answers "No changes found — nothing new saved". Server part = Codex job noopsave (10-10); the modal/tooltip are built + checked in Chrome by the coordinator.
-9. **Theme says which templates are for posts vs pages** (owner design, 2026-10-10): today `theme.json` has one flat `templates` list, so the page template dropdown offers post templates (posts-default/posts-sidebar) and vice versa. Add an optional manifest field, e.g. `"templateFor": { "posts-default.html": ["post"], "pages-default.html": ["page"], "index": ["page"] }`; a template not listed applies to BOTH ("some people are just going to forget"), so existing themes behave exactly as now. The server's template list for an editor filters by kind; the post and page pickers show only matching ones. Fill it in for plannie (and the Starter theme). UI to verify in Chrome: both dropdowns. Related open owner question: rename plannie's "index" template to "Landing" (full-width, no title header) so any page can use it.
-10. **(small) Icon font self-heal:** on 10-10 the chat dock's subagents icon showed as a □ (missing glyph) after an agent's save restarted the dev server; it came back after the server did. Likely the remixicon font/CSS request failed during the restart and the page kept the □ until reload. Nice-to-have: retry/re-inject the font stylesheet when it fails to load (apps/admin/src/main.tsx remixicon loader, Jini RemixIcon `ensureRemixIconStylesheet`) + a guard test. Not urgent; a reload fixes it.
@@ -47 +35,0 @@
-10a. **Theme explore layout (owner 2026-10-10 11:49):** move the file list from the left column to the top; Preview/HTML + content full-width under it, so the preview isn't a thumbnail when the assistant dock is open.
@@ -52,6 +39,0 @@
-10d. **Theme explore file list scroll (owner 2026-10-10):** at the bottom of the left file list, scrolling gets stuck instead of continuing to scroll the page.
-10e. **Theme explore "Not shown — Home is your home page" text:** owner asks if needed; proposal: tooltip only on the disabled Publish toggle.
-10f. **Assistant dock header (owner 2026-10-10):** gear icon right of the new-chat bubble → dropdown "Settings — coming soon"; tooltips like the subagents one: X "Close AI chat", bubble "New chat", gear "Settings".
-
-10g. **Themes tabs (owner 2026-10-10):** Declarative, Templated, Code get a "Soon" pill + greyed text, still clickable; Static unchanged.
-
@@ -60,12 +41,0 @@
-10i. **Chat: mid-run message queued instead of sent, maybe lost (owner 2026-10-10 12:2x):** a message typed while a run is going sits in the browser queue (not steered into the run as built 10-09); owner suspects a message gets lost. Check today's per-turn footer changes first; add a guard test (two messages while running: both kept, both reach the agent), then fix.
-
-10j. **Forms: every field type + an "All fields" demo form (owner 2026-10-10):** native forms have no dropdown (plannie Contact "Topic" became a text box). Audit field types vs a full set (dropdown single/multi, radio, checkbox group, toggle, file upload, date, number/range, phone/URL, hidden, consent, validation), build the missing ones, add a demo form using all of them.
-10k. **Generic media widget (owner 2026-10-10, design proposed):** one media embed/widget for images/videos/audio by slug with layouts and free data-* attributes (data-kui), inline in HTML or saved; gallery becomes a preset; plus a Raw HTML widget with {{media:slug}} tokens. The current Gallery widget editor is unstyled and never got its visual check.
-10l. **Script-driven blocks in the Interactive editor (owner 2026-10-11, building now):** anything that needs a page script to look right (Kuinetic `data-kui*`, canvas, autoplay video, author opt-in `data-editor="block"`) shows as a sized, labelled, locked block in the Interactive editor, edited via HTML/code and played live in Preview. Extends the existing embed placeholder (`canvas-embed-placeholders.ts`), no second mechanism. Why: the editor canvas runs no page scripts, so tovu.dev Landing's Kuinetic ring spilled 19 cards over the Proof section (fixed for that page with a no-JS CSS fallback, which doesn't scale).
-
-## LATER (owner 2026-10-16): two autoplay videos for the AINSEP/Tovu GitHub README
-So people landing on github.com/AINSEP/Tovu see what Tovu is. Source videos are already in Tovu, on the tovu-dev landing page:
-1. **Hero video:** the landing page's hero video, as its own clip.
-2. **Capabilities video:** combine the 4 landing-carousel videos (each pans/zooms to the chat input, shows the prompt, then what the AI does) into ONE video.
-Format note: in a README only an animated GIF/APNG/WebP truly autoplays. An MP4 uploaded to GitHub (user-attachments URL) shows an inline player, but the viewer has to click play. Likely answer: a short autoplay GIF/WebP loop that links to the full MP4. Verify GitHub's current behaviour when building it. Keep each ~30 s with no dead time ([[demo_videos_30s_no_dead_time]]); find the source files in tovu-dev media (blobs have no extension, so use `file`). Owner will say when.
-
@@ -75,3 +44,0 @@
-## Note: a form inside a POST needs a widget (owner 2026-10-16 — "makes perfect sense, leave it")
-Posts are TipTap rich text and can only embed saved widgets, so a form in a post = a contact-form widget (config key `formDefinitionId`) inserted into the post. HTML pages and theme templates can embed a form directly with a `data-embed-config` `{type:"form"}` marker, no widget. A generic TipTap "embed" node (posts take the same data-embed-config) was considered and NOT built. Details: chat audit F1 (path above).
-
@@ -84,3 +50,0 @@
-## Assistant chat: "Waiting for your answer above" stays after Confirm (owner 2026-10-11, screenshot ~20:52)
-After the owner clicked Confirm on a "Confirm action?" card (deployment_execute_static_publish), the card showed "Done." but the footer kept "Expires in 4:14 · Waiting for your answer above" until it later went away. Bad UX; reproducibility unknown. The pending-answer footer must clear the moment the card is answered (likely the exchange-answered event vs the footer's countdown state).
-
@@ -93,6 +56,0 @@
-## SOON — owner will say when (2026-10-11 ~20:30): Themes page header layout
-Admin → Studio → Themes (owner screenshot): move "View site ↗" to the TOP-RIGHT corner of the page header; put "Rescan themes" and "Turn the theme off" on the SAME line as "Publish themes" (flush, one button row). Narrow change only. Owner: "don't do that now… in a little bit, I'm still working on some stuff" — wait for the go.
-
-## LATER (owner 2026-10-11): JSON listing API + client-side card templates
-"See more" ships first as server-rendered HTML snippets (core listing function → next-batch HTML). Later: a public JSON listing API on the same core function (`items + nextCursor`; title, href, date, excerpt, cover, terms, author) and client-side rendering from a theme-provided `<template>` card (data-field placeholders) filled by one generic Jini script; static export writes the same JSON as files. Owner: "doesn't seem scalable to have the server draw the card" — JSON is the target; HTML now because themes have no card template yet. Designs: ADS-memory/.local-artifacts/pagination-design-2026-10-11/{opus.md,codex run output}.
-
@@ -102 +59,0 @@
-- Bug to fix regardless: an ACP permission request fails the whole run, because there is no `acpPermissionHandler` (Jini agent-runtime acp/session.ts ~1320).
@@ -120 +76,0 @@
-- **Security gap to fix even before this ships:** `confirmEnable = !sealedHere` (Jini packages/plugins/src/host/source-policy.ts:16) lets an assistant-sealed plugin enable with NO human confirm → one consent card at first enable + capability widening ("full server authority").
@@ -123,4 +78,0 @@
-
-## HIGH (after 0.1.14, owner 2026-10-12): convert @jini-ai/charts-recharts into the bundled chart-provider plugin, then REMOVE it from npm
-@jini-ai/charts-recharts@0.1.0 was published to npm on 2026-10-12 15:34 UTC only because Tovu admin imports it (apps/admin/src/components/AssistantDock/chart-provider.ts). Owner: "I don't want recharts on npm" — keep it for 0.1.14, then: (1) do step 2 of the chart-provider plan (LATER section "Bring-your-own chart library"): the Recharts provider becomes a bundled-by-default chart-provider plugin (site/UI plugin, not an npm package), and drop the admin's npm import; (2) `npm unpublish @jini-ai/charts-recharts --force` from the Jini root. npm policy: free within 72 h (until 2026-10-15 15:34 UTC) if no other npm package depends on it (none do — checked 10-12); after that only if <300 downloads in the last week, no dependents, single maintainer (ai-oss) — downloads alone don't block it. Never add it as a dependency of any other published @jini-ai package, or it can't be removed. Fallback if unpublish is refused: `npm deprecate`.
-- 2026-10-12: Tovu admin's import is GONE (owner: drop it before 0.1.14 so the package can be unpublished now). Removed the Vite-dev-only wiring `apps/admin/src/components/AssistantDock/chart-provider.ts` (+ its contract test, the `styles.css` import in `RoutedA2uiSurfaceCard.tsx`, the `VITE_CHART_PLUGIN` flag, the package.json dep); the card is back on `@jini-ai/ui`'s `DEFAULT_INTERACTIVE_UI_REGISTRY`, which prod already used. Jini source `packages/charts-recharts` is untouched. The root package-lock.json still lists it until the release range-bump regenerates lockfiles. Notes from the removed wiring for the plugin step: (a) the backend's `search_components` catalog still advertises the built-in chart wire IDs, so the plugin must keep those IDs and route them to the preferred capability entry (resolve entries with the `chart` capability by their other capability via `resolveByCapability`, then copy the built-in `id`) for BOTH validation and rendering; (b) build one stable registry snapshot at boot, shared by the transcript and Playground-portal render paths; (c) the plugin's `styles.css` must load at the `RoutedA2uiSurfaceCard` boundary because it renders both inline and into the Playground portal. To restore the prototype: `git show 71c4bbdf2` plus the removed files at this commit's parent.
@@ -128,3 +79,0 @@
-## HIGH (after 0.1.14, owner 2026-10-11): split the deploy agent plugin into one plugin per platform
-Today `content/agent-plugins/deploy/` holds 5 targets (vercel, netlify, cloudflare-pages, github-pages, s3-compatible). Owner: make each its own agent plugin, like a marketplace — the plugin list shows the PLATFORM NAME ("Vercel", "Netlify", "Cloudflare Pages", "GitHub Pages", "S3"), not "deploy-vercel". Each carries its adapter, credential scheme, and its own notes/skill with the platform's idiosyncrasies (limits, naming, gotchas — e.g. Vercel's 10 MB per-request cap), so an agent searching "vercel" finds the Vercel plugin and its notes. Owner: plugins will NOT stay generic — they'll grow highly platform-specific behaviour. Keep one generic publish entry point in core that installed platform plugins register into; shared plumbing comes from the host kit (plugins never import each other); ship bundled + enabled by default so existing sites keep working.
-
@@ -139,2 +87,0 @@
-- **MOVED INTO 0.1.14 (owner 10-11): the secrets vault + copying secrets between local projects.** Plan/review: `ADS-memory/.local-artifacts/vault-impl-2026-10-11/`. Copying pages/media between projects still comes after.
-- **(was) FIRST: one secrets vault instead of 13 sealed tables** (owner 2026-10-11: "can't we just have one table that's encrypted… with the appropriate labels and the actual values?"). Today every feature that needed a secret added its own sealed table (13 — see `server/runtime/composition/sealed-credential-descriptors.ts`), so save/seal/open/recovery/copy/rotate exist 13 times. Target: one vault table (id, workspace, kind, owner ref, label, last4, sealed value, AAD bound to the vault row id) — features keep only a vault id. One ADR-066 TS migration moves the 13 tables (it auto-applies to every live site DB: back up first, rehearse on copies). Build on Jini `platform/secrets/credential-sets`. Plan → owner review → build. Makes copy-between-projects keys, rotation, the Tovu app key and the shared local key store (10h) one operation each.
@@ -166,2 +112,0 @@
-15. **Web-journey bugs found vs 0.1.12, not 0.1.13 blockers** (owner triage 10-06 ~21:45; evidence `ADS-memory/.local-artifacts/web-journeys-0112/`, handoff `ADS-memory/.local-artifacts/handoffs/2026-10-06-web-journeys-0112.md`):
-    f. [OPEN 10-07 22:20: new baselines exist but are untracked and unreviewed (journeys/composer.pins 3, site-chat.pins 3, themes.pins 7, mobile-visual 70 PNGs); nothing under journeys/ is committed] No journey screenshot baselines are committed (~10 `toHaveScreenshot` tests fail "snapshot doesn't exist"). Generate them on source, review, then commit.
@@ -171,2 +115,0 @@
-19. **Collapse the secret/credential cards (owner APPROVED 2026-10-07, first set for right after the 0.1.13 tag, then MOVED BEFORE 0.1.13 later the same day; IN PROGRESS 22:20: cleanup phases 5-9 (engine, exchange store to Jini, the cards) are coded, UNCOMMITTED, tests pending; phase 10 `credential_save` + the tool-search gate is being coded):** ONE card engine (Jini `defineSecretCardTool`) renders every secret form from a field spec, and the 6 save-a-credential tools MERGE into one `credential_save` tool over a credential-kind registry (owner: "lets merge the 6 save tools"; the 2026-09-08 parent-tool eval risk is accepted: run the tool-search eval after the merge and fix descriptions if top-1 drops). Tovu switches to Jini's exchange store (deletes the 597-line duplicate). Old paths are absorbed, not kept in parallel. No migrations; the store merge waits until after 0.1.14. Design + phases: `ADS-memory/.local-artifacts/credential-cards-collapse/DESIGN.md`. Claude plans, Codex implements; P0 needs the owner's `!` Jini publish.
-
@@ -174,2 +116,0 @@
-   - Finish the half-done Tovu→Jini move (42 files / 8.5k lines; Jini has a zip-cap safety fix Tovu lacks, Tovu has 3 owner-account fixes Jini lacks), first.
-   - ONE approval mechanism: the policy table decides; trash/delete/purge/restore-over-existing/publish ask (+ the 10-05 host-secret replace/unset confirm). Fold the 18 extra "safety" handler confirms and the 6 parallel mechanisms into it, keeping only confirms that protect against real data loss (owner: "do what you think is best; if it's unnecessary, consolidate it").
@@ -178 +118,0 @@
-   - Commerce stays OFF "for the foreseeable future": move it out of Tovu core into Jini (unwired: no webhook route, status tool or Payments panel in Tovu).
@@ -180 +119,0 @@
-   - Plugins: site plugins (WordPress-style) and agent plugins (teach the agent outside vendors) are DIFFERENT concepts and stay separate. Only share the generic machinery (package install/uninstall/files/confirm) and the duplicated admin components.
@@ -182 +120,0 @@
-21. **[8 fixes: tests PASS, awaiting commit]** **Real bugs found by the 10-07 audits (fix right after the E2E batch, small Codex job, before the clean-up refactors):** zip entry cap checked inside the extraction loop instead of before (agent-plugins/install.ts:416-419; Jini 78d4b60b has the fix); 4 hand-written cookie readers call decodeURIComponent unguarded (malformed cookie → 500) and 5 setHeader("Set-Cookie") calls overwrite each other (use cookie.parse + res.cookie); settings/migration.ts re-copies the active theme every boot, so the assistant's site summary shows the old theme after a switch (site-profile should call resolveActiveThemeId()); features/skills/api.ts, installed-skills-composer-source.ts:80 and theme-preview-refresh.ts:54 bypass authenticatedAdminRequest (no session-expiry handling); the default agent prompt says Bash is available while Claude has Bash disallowed; content-analyzer slugifyHeading ≠ toSlug (non-ASCII TOC anchors break); migrateFooterPageLinks runs every boot with no done-marker and rewrites operator links. FIXED 10-07 ~17:50 by Codex: all 8; their tests PASS in the queue (b4--bugs-web-final, b4--bugs-admin) but the fixes are still UNCOMMITTED. Sources: `ADS-memory/.local-artifacts/overengineering-audit-2026-10-07/REPORT.md`, `ADS-memory/.local-artifacts/cleanup-program/ponytail-ladder-audit-tovu.md`.
@@ -190 +127,0 @@
-- **Delete = Trash (09-20).** Every delete goes to Trash; permanent delete only from the Trash screen (checkbox + confirm modal); agents get trash/restore/list-trash and NO purge tool; 60-day purge is a backstop. Forms are deletable to Trash too, overriding INV-08 (09-21); plugins go to Trash (09-21).
@@ -192 +128,0 @@
-- **BYOK tool errors: "hide secrets only" (09-16).** Errors stay visible with a copyable error ID; secret-shaped values blanked; full (redacted) error kept server-side.
@@ -194,4 +129,0 @@
-- **Publish selection (09-19):** "we should have the ability to push a select group of things and not all of it". Per-row/per-group selection is a requirement.
-- **Publish list order (09-26):** to-publish first A–Z, then up-to-date A–Z, one shared comparator.
-- **Publish replacing a live page repoints live menu links (09-24).** Overwrite of seed-untouched rows is pre-ticked (09-24). A chat without admin rights cannot publish: "OK for now", owner unsure, revisit.
-- **Site key (09-24, supersedes the 09-19 "Site Token" name):** call it "site key" EVERYWHERE (copy, code, env var, file names, routes, i18n, tests) in one job, with only a temporary old-name fallback so prod and existing installs still decrypt (fallback removed 10-05, owner: "remove the legacy site stuff" — only `TOVU_SITE_KEY` is read); auto-create it (no banner, no Generate click); keep the Generate button but hidden. The site-key decision for desktop 0.1.8 is still the owner's. <!-- site-key-legacy: historical September 19 label; rephrase after 2026-11-01 closeout -->
@@ -199 +130,0 @@
-- **Embeds (09-16):** JSON picks only WHAT to embed (type + slug); every option is a plain attribute on the marker (e.g. `controls="false"`); page-HTML security stays as is. Docs use slugs, never long UUIDs (09-23).
@@ -202,2 +132,0 @@
-- **Tovu Starter (09-27):** a copy of Tovu Theme with all Tovu stuff stripped; default for every desktop app and zip; never touch the active Tovu theme.
-- **kUInetic CDN (09-27):** "NO exact pin (no hand bumps); use major range kuinetic@0 + local fallback". Reconfirmed 10-04; the exact-pin change in `c91d9849f` is reverted in the theme sources.
@@ -205 +133,0 @@
-- **Approvals (10-07, supersedes 09-28):** trash/delete/permanent delete, restore-over-existing and publish/unpublish/deploy ask for human approval. Ordinary create/edit writes run directly; query/sql input names alone never require approval. Keep tool-specific safety confirmations.
@@ -207 +134,0 @@
-- **Agent-plugin knowledge (09-14):** ONE per-plugin `knowledge` folder holding both plugin-learned and user project knowledge; a Tovu-only extension (the public Agent Plugins standard is not changed).
@@ -210 +136,0 @@
-- **Local CI drift gate stays blocking (09-15).** RSS feed stays (09-28). No newsletter work at all.
@@ -249,2 +174,0 @@
-- **E2E screenshot baselines** still pick up random rows from earlier journeys: collections list/entries, forms list,
-  widgets library, menus list, media library, dashboard-ar-rtl. Each needs a GET stub like `stubPostsListForBaseline`.
@@ -265,9 +188,0 @@
-The assistant chat's run footer reads `Done · 34s · 1155 out · $1.2561`; the owner reads that $ as the running
-conversation total. Wanted: `Done · 34s · 1155 out · $0.43 (Session: $1.2561)` — this message's cost, then the
-conversation total. Owner screenshot: `ADS-memory/.local-artifacts/chat-cost-per-message/owner-footer.png`.
-Not investigated yet (a read-only plan was started and cancelled). First answer: where the footer renders (likely
-Jini `packages/chat`), whether the shown $ is per-run or cumulative, and whether per-run cost exists on both the
-daemon and BYOK paths or must be a delta between totals. Cover reloaded conversations, runs with no cost data, and
-failed/cancelled runs; add the "Session" label to translations. Server or Jini dist edits restart/reload the admin,
-so don't run it while the owner is mid-chat.
-
@@ -278 +192,0 @@
-- Landing carousel on phones: the site-chat bubble can sit over the deck's right arrow.
@@ -297 +210,0 @@
-- **Committed desktop UI test harness** (09-19, L2474): owner: "this needs to be automatic for testing later! completely automated". Per-feature `apps/desktop/scripts/verify-*.ts` launch Electron; no generic launch-with-CDP + Playwright + teardown harness any agent can use.
@@ -334 +246,0 @@
-- **Landing-page carousel videos: match the zoom style of the first video** (owner, 2026-10-06; LATER, not now — likely a subagent job). The first landing video zooms in on the text the AI agent types into the chat input (so viewers can read it), zooms out to the whole screen, then zooms in on the result on the page. The three newer carousel videos (made 10-05) don't zoom; they probably need re-recording with the same in/out/in zooms. That first (older) video is the reference. Keep ~30s, no dead time ([[demo_videos_30s_no_dead_time]]).
@@ -346 +257,0 @@
-- **Jini guard/architecture/coverage sweep + inline-handler cleanup** (09-12, L116/L1359): original counts obsolete; fold into the post-extraction audit.
@@ -356 +266,0 @@
-- **Finish the site-key rename** (09-19/09-24, L2412/L3240): jobs 1–2 (2026-10-04) committed dual env reads, conflict refusal, site-key copy, identifiers, files, routes, and permission migration. Job 3 swept prose, added the name guard and missing tab translations, and prepared Jini canonical exports; two schema comments await the staged comment-only patch. Coordinator verification, the Jini release/import update, owner secret-name migration, and legacy retirement remain. Keep the existing key bytes; do not rotate during the rename.
@@ -384 +293,0 @@
-- **Composio as an optional small Agent Plugin** (10-02, L3732): only if wanted again.
@@ -424 +332,0 @@
-- Observability (OpenTelemetry tracing, already in `@jini-ai/diagnostics/observability`, used by `apps/website/src/platform/observability`) stays out of it: operator-facing, not site-owner marketing. Datadog/Grafana need no adapters — both accept OTLP; set the endpoint env vars. Owner may still choose otherwise.
@@ -436,2 +343,0 @@
-- **The server resolves it as it does today.** A form submits to OUR backend automatically, because the server fills in the action and endpoint. The author never writes an endpoint.
-- **Owner decision (2026-10-03): BOTH `{"type":"form",…}` and `{"type":"widget",…}` must work. Make it as flexible as possible for users; it must not be widget-only.**
@@ -442,2 +347,0 @@
-- **Work:** re-add `form` as a known type that resolves through the same form or widget renderer (one code path, two spellings), and add it to the resolver and to the validator's known types.
-- **Same mode for:** `menu`, which already exists as a type, and a categories/tags type.
@@ -447,2 +350,0 @@
-**Admin:** a "Copy HTML embed" button on forms, menus and taxonomy, the same idea as the media embed/clipboard control.
-
@@ -463 +364,0 @@
-- `custom_credential_write_files` commits to a third-party repo without the confirmation its comment promises
@@ -475,8 +375,0 @@
-## Admin "buffet": compose an admin from Jini modules (owner idea, 2026-10-02; still being thought through)
-
-`createAdmin({ modules: [...] })` builds the pages from per-package admin modules. Each tab is its own feature slice,
-so a host can take one tab and not another. UI bindings stay out of the domain packages (e.g. `@jini-ai/admin/react`
-or `@jini-ai/admin/vue`), so cms and the rest stay frontend-agnostic. Today only user-management ships admin panels.
-Open question (owner): how much of this belongs in Jini at all.
-
-
@@ -485,2 +377,0 @@
-**DONE 10-04** — UX half `be7c233d6`; core fix Jini `72ca0548` (`ContentTypeRecord.owner`, entry writers read it off the type, `input.owner` removed) + Tovu (the commit that marked this done; widgets register with owner; `content-types/declared-owners.ts` restores it on SQL reads, no column/migration). Needs a `@jini-ai/cms` release. The two existing production probe rows are still not cleaned.
-
@@ -534,2 +424,0 @@
-- **D1** — agent plugins install deferred (per-workspace store conflicts with install-once-per-site).
-- **D2** — reuse `admin.plugins.enable` rather than a new permission.
@@ -537 +425,0 @@
-- **D4** — no assistant install tool.
@@ -539,2 +426,0 @@
-- **D6** — local folder and zip installs allowed, behind a consent screen (plugin code runs
-  in-process with full machine access — ADR-024 Tier-3).
@@ -542,3 +427,0 @@
-**First milestone:** local folder install — `tovu plugin install <dir>` CLI command plus an
-env-gated admin route. Depends on Plugin Trash (shipped 2026-09-22).
-
@@ -553,4 +435,0 @@
-- **`@jini-ai/agent-runtime`** — live Claude model discovery without an API key
-  (`claude-code-models.ts`, `probeAgentModels`). Tovu's live model picker depends on this.
-- **`@jini-ai/ui`** — BYOK connection-test/discovery messages translated (commit `d5ae98d7`).
-- **`@jini-ai/cms`** — media upload cap, commits `23d652a4`, `754b0ff9`.
@@ -609,4 +487,0 @@
-**Open owner question (parked 2026-09-19):** until step 1 lands, should the tab be hidden everywhere,
-or shown with a "not wired up yet" label? Hiding it on production ALONE is the one option to avoid —
-it leaves the fake command visible on desktop and local, which is the worse failure.
-
@@ -726,14 +600,0 @@
-1. **What is being recorded — actor or producer?** "Created by Leona" and "created by
-   `higgsfield/z_image`" are different questions. An upload has a human actor and no model; an agent
-   generation has both (the principal who asked, and the tool that made it). Decide whether this is
-   one column or two before writing either.
-2. **Migration risk.** A new column means a Drizzle migration, and regenerating migrations in this
-   repo has broken migration hashes and caused partial applies before. Write the migration
-   deliberately; do not let it fall out of a schema regen.
-3. **Existing rows.** Leave them NULL (honest "unknown"), or backfill by parsing `credit` where it
-   matches a known shape? Backfill invents structured data from prose and will be wrong for
-   hand-edited rows. NULL is the safer default; decide explicitly rather than by accident.
-4. **Every write path must populate it or it is worthless.** At minimum `media_import_from_url`,
-   the admin upload path, and any seed/import path. A provenance column that is NULL for half the
-   library cannot be filtered on — this repo's recurring failure is exactly this: the right
-   primitive with an unwired call site. Audit the sinks before shipping.
@@ -796,6 +656,0 @@
-**Separately, and NOT deferred:** run durability. A daemon respawn kills every in-flight run and the
-result is indistinguishable from a chat that "just stopped answering" — the supervisor's own comment
-at `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts:216-222` says so, from the
-2026-09-06 chat-death investigation. No library choice fixes that; it needs process-group
-detachment or run-state checkpointing. Tracked separately.
-
@@ -841,9 +695,0 @@
-1. **Tab strip** under the top toolbar — a permanent `All` tab plus one tab per opened project, each
-   with a status dot, its display name, and an `×` to close.
-2. Selecting a project tab shows that site **embedded in the same window**. No `BrowserWindow` per
-   project.
-3. **Per-project bar** above the embedded view: status dot, a **View admin** / **View site**
-   segmented toggle, the current URL as plain text (`http://127.0.0.1:3001/admin/`), then
-   **Reload**, **Open in browser**, and an **expand** icon button on the right.
-4. **Expand** gives the embedded site the whole window (tab strip and toolbar hidden), reversibly.
-
@@ -906,29 +751,0 @@
-
----
-
-## Surface federated-MCP tool refusals in the UI, not only the daemon log (found live, 2026-09-06)
-
-**DONE** — `37ac1943c`, `0d9e41d5c`, `c5d10181a`, `d22319d62`.
-
-**DONE 2026-09-22: `37ac1943c`, `0d9e41d5c`; `apps/admin/src/features/settings/ExternalMcpAdmissionsBanner.tsx`. The delegated-call `INTERNAL_ERROR` collapse is also closed by `c5d10181a`, `d22319d62`, and `apps/website/src/assistant/federated-refusal-diagnosis.ts`.**
-
-**Historical investigation:** the stated cause was half wrong, and finding out changed the fix. Refusals did not reach only the
-log. The chain already existed end to end — `bootstrap.ts` -> `GET /api/federation/admissions` ->
-the admin proxy -> `api.getExternalMcpAdmissions()` — and stopped ONE function call short of a
-screen: nothing in `apps/admin/src` ever called that client. This is Phase 4 of
-`ADS-memory/reports/pipeline/external-mcp-write-tools/implementation-outline.md`, specced and never
-built; Phase 2C had already translated its copy into 21 locales for a UI that did not exist. So the
-work was wiring, not plumbing.
-
-Operator half: `ExternalMcpAdmissionsBanner` in Settings -> External MCP, silent when live and saved
-agree, otherwise naming each tool, the exact fix, and saved-vs-live counts, with a "may write" tick
-that writes `writeAllowedToolNames` through the same `updateSource` port the edit form uses.
-
-Model half: prompt text through the existing `assemblePromptWithPluginPrefix` seam — deliberately not
-a tool, because a model that does not know it is missing something never calls the tool that would
-tell it. `not-in-operator-allowlist` is excluded on purpose (a real server advertises tens of tools
-against an allowlist of three, so reporting those teaches the model to ignore the block), and every
-remote name is re-checked against the gate's own pattern before it can reach the system prompt.
-
-`trust.ts` was deliberately NOT modified — filtering on the refusal reason gets the same answer
-without changing a security-critical module.
@@ -936,33 +752,0 @@
-**The restart round trip STAYS, and the reason is not the one assumed.** It is not R5. It is that
-`buildToolCatalogQuery` snapshots `registry.list()` into a one-shot FTS index at boot, so nothing can
-be unregistered — a hot-reloaded allowlist could only ever widen, never narrow, which is a worse
-security mechanism than a restart. The banner therefore offers the existing
-`POST .../system/assistant-daemon/restart` as a button, hidden with the already-translated
-explanation when the principal lacks `system.write`.
-
-**DONE 2026-09-22:** the related delegated-tool call path no longer collapses refusals to a bare
-`INTERNAL_ERROR`; see `apps/website/src/assistant/federated-refusal-diagnosis.ts` (`c5d10181a`,
-`d22319d62`).
-
-`mcp-federation/trust.ts` refuses a remote tool that declares `readOnlyHint: false` unless the
-operator has ALSO named it in `writeAllowedToolNames` — a second list beyond `allowedToolNames`.
-Every refusal reaches only `development/.dev-server.log`:
-
-```
-mcp-federation: 'higgsfield' refused remote tool 'generate_image' — remote-declares-not-read-only
-```
-
-Nothing surfaces in the admin UI, and nothing reaches the model — asked in-chat why it could not
-generate, the assistant invented a wrong cause. Two sessions lost time to this before the log was
-read. The write-grant field itself was unreachable in the UI until `ae13e739`.
-
-The codebase already has the right instinct — `allowlistedButAbsent` and
-`writeAllowedButNotAllowlisted` exist so a config that can never take effect is reported rather than
-inert. Finish it: render refusals where the operator can see and fix them ("3 tools refused:
-`generate_image` needs *Allowed to make changes*"), with a one-click grant. On a desktop app nobody
-can SSH into, this is also the support tool.
-
-Related: federation config is read at **daemon start**, so a saved grant does nothing until the
-daemon restarts. The Settings UI says "Changes apply when Tovu restarts" — that round trip is itself
-worth removing.
-
@@ -989,3 +772,0 @@
-- **ADR-061** (`runner-tools-for-tovu-site-assistant`) — the narrow `runner.*` surface Tovu's
-  admin-context assistant may invoke. **ACCEPTED 2026-08-29**; supersedes ADR-014 §3's capability
-  clause only.
@@ -1015,2 +795,0 @@
-- **Gap 4: markers don't resolve everywhere.** A static theme's standalone pages, the static-tier home page and the
-  404 page go through `renderStaticPage` (`pages.ts:1193-1198`, `render.ts:3121`, `pages.ts:1357`).
@@ -1050,12 +828,0 @@
-- **Gap — Forms:** `FieldType` is a closed 4-value union (`text`/`email`/`textarea`/`checkbox`,
-  `features/forms/types.ts:18`); no raw-HTML field or raw-HTML form body. A form is embedded on a page as a WIDGET
-  (`{"type":"widget","id":"<contact-form widget entry id>"}`, `resolver-service.ts:1070-1072`), so `src/forms/` itself
-  is untouched by this ask. Open question: if the form's markup is hand-written, how does it still route submissions
-  through the existing Forms backend (`submit-service.ts`) without the structured `FieldDescriptor` list generating
-  the field names/`action`?
-- **Gap — Menus:** `AdminMenuItem` is a structured tree (link/label/target/children, edited via `MenuEditor.tsx`); no
-  raw-HTML item kind. Menus render through their own reserved marker type, deliberately excluded from the generic
-  resolver map and handled separately by `injectMenuEmbeds` (`features/theme/static-render.ts:355,642`) — a raw-HTML
-  menu would need a new authoring/render path, not just a new resolver registration.
-- **Gap — Widgets:** already tracked above (Gap 1) — `WidgetTypeKey` closed union of 5 (`features/widgets/types.ts:63`),
-  no kind emits raw/script HTML. The generic embed widget type proposed there would likely cover this ask too.
@@ -1067,5 +833,0 @@
-- **One config shape for every embeddable block.** Owner's sketch: `data-embed-config={type="form|widget|menu"
-  render="json|html" ...other args}`. `data-embed-config` holding JSON is already the single live marker
-  (`contracts/core/embeds/marker.ts:20-23`, `type` + `id`), so what's new is a `render: "json" | "html"` key plus
-  per-type extra args. The sketch's `type="form"` conflicts with the 2026-08-31 decision above (`form` removed,
-  forms stay `{"type":"widget","id":"<contact-form widget entry id>"}`) — open, not resolved here.
@@ -1090,4 +851,0 @@
-- **SPEC-005 plugin system**: Phase 1 (loader/SDK/hook core + HTTP routes + `Plugins.tsx`) is built
-  and test-verified. Phase 2 (sample plugin), Phase 3 (wiring into the real post-save flow — carries
-  a proven security finding that needs deliberate handling, not a drive-by fix), and Phase 4 (polish)
-  have not started. `ADS-memory/reports/pipeline/005-plugin-system/pipeline-state.md`.
@@ -1110,2 +867,0 @@
-- Non-blocking follow-up: evaluate a source-map-accurate coverage tool (c8/istanbul) so measured
-  numbers match real numbers, instead of re-litigating the real-arms argument once per feature.
@@ -1137,2 +892,0 @@
-- **Taxonomy watermark stamping fix** (`b4c76b4`) — same session, same "just fix it" instruction,
-  also never spec'd.
@@ -1273 +1026,0 @@
-| Newsletter | ⬜ | **STALE:** owner: no newsletter work at all. No admin screen — `panels.tsx:984` renders `<Placeholder sectionId="newsletter">`. Backend is substantial (campaign/list/subscriber/send-log routes, ADR-034). Build the admin client/types plus campaigns, lists, subscribers, and send-log screens. |
@@ -1336,5 +1088,0 @@
-- The 4 original baselines (`home-desktop`, `home-wide`, `home-mobile-390`, `post-welcome`, all
-  captured 2026-07-15) **fail against fresh renders** — real content/CSS drift since capture,
-  deliberately NOT regenerated. Needs its own look: decide per baseline whether the drift is the
-  intended design or a regression, then re-approve. (`home-mobile-390-drawer-open`, added 2026-08-30
-  with the AW-1 guard, is current.)
@@ -1348,4 +1095,0 @@
-- **Mobile horizontal-overflow quirk** (test-infra only, previously undocumented): the *closed*
-  drawer (`position:fixed; transform:translateX(110%)`) still contributes to
-  `document.documentElement.scrollWidth` at mobile widths (742px vs 390px clientWidth), so the
-  mobile baseline needs `clip` rather than a bare `fullPage` shot.
@@ -1393 +1136,0 @@
-| **1 — declarative** | **Contact form** (submissions as core entries; email/webhook on submit) | forms = top-3 install category | the zero-code surface **and** ADR-024 audit-condition #1: it cannot send/notify until core ships the **core-mediated primitives** (mail adapter, webhook dispatch, form-submission sink) |
@@ -1428,44 +1170,0 @@
-## Completed — historical record (pointers only)
-
-- **WordPress spec library** — complete, now at `development/other-repos-specs/wordpress_specs/`
-  (**78** `.md` files; this entry used to say 53): wp-includes, wp-content, wp-admin, wp-root, plugin
-  & theme authoring structure, headless-CMS paradigm.
-- **Architecture groundwork** — `ADS-memory/docs/architecture/tovu-architecture.md` and
-  `ADS-memory/docs/research/competitor-analysis.md` (Ghost/Payload/Directus); the `tovu/` scaffold and
-  its conventions. Prioritization source: `tovu-architecture.md` §13 (User Friction Coverage).
-
-## Canonical Architecture Decisions (ADRs)
-
-This checklist is the **capability backlog**, not the decision record. Where an ADR exists it is the
-source of truth and supersedes the loose wording below. Index:
-`ADS-memory/reports/architecture/ADR-INDEX.md` — **note: 7 ADRs on disk (053, 055, 056, 057, 059,
-063, 064) have no row in that index**, so it is not a complete list.
-
-Which ADR owns which inventory area:
-- **§1 Kernel / §10 Server** — ADR-001 (agent-native modular monolith), ADR-009 (decoupling: sync
-  calls + outbox + hooks).
-- **§3 Data Layer** — ADR-006 (ports need two adapters), ADR-007 (`workspaceId` everywhere). Site
-  content lives in a per-site `content.db` behind `SiteStorePort` — ADR-012 + ADR-013.
-- **§5 Storage/Media** — media blobs under the site folder's `uploads/`, metadata rows in that site's
-  `content.db` (ADR-012).
-- **§7 Feature Modules** — the `features/*` slices are the site content model
-  (post/page/media/presentation), scoped per ADR-007/012.
-- **§8 Theme System** — ADR-010 (declarative themes by default; code = trusted mode), ADR-002 (React
-  blessed renderer). Two planes: site theme vs app chrome — see
-  `ADS-memory/reports/architecture/admin-sitemap.md` §1.
-- **§9 Plugin System** — ADR-003 (plugins never run DDL), ADR-004 (prebuilt ESM + signed manifest),
-  ADR-005 (SDK compatibility), ADR-023 (core-mediated plugin data modules).
-- **§11 Admin UI** — IA in `ADS-memory/reports/architecture/admin-sitemap.md`. **The two per-screen
-  UI briefs this section used to cite (`docs/design/admin-sections-ui-brief.md`,
-  `docs/design/rail-pages-ui-brief.md`) no longer exist anywhere in the repo** — the live registry is
-  `apps/admin/src/panels.tsx`.
-- **§12 Agentic UI / AI Layer** — **ADR-059 is current** (assistant transport, AG-UI canary,
-  Accepted 2026-08-18). It supersedes ADR-049's rejection of AG-UI, which had itself superseded
-  ADR-013's original CopilotKit + AG-UI choice. Paradigm note:
-  `ADS-memory/docs/architecture/appendices/A12-tool-use-first-architecture.md`.
-- **§13 Protocols** — ADR-011 (two deployment topologies; open-design desktop host), ADR-013 (AG-UI /
-  MCP surface, tool exposure).
-
-A "site" everywhere below = **a folder (install dir) with its own `content.db` + `uploads/` +
-themes/plugins**, instantiated from a versioned template (ADR-012).
-
@@ -1482 +1180,0 @@
-- Outbox implementations (in-memory now, Postgres later)
@@ -1529,5 +1226,0 @@
-- [ ] **Split control plane from retrieval plane.** One capability registry, two postures: agent/admin
-      writes go through authorize → confirm → execute → audit; end-user search runs as the *user*,
-      read-only, no confirmation. A retrieval-plane capability must be structurally incapable of
-      holding a write handler. (Directus shares 12 tools across both and the weaker path — a
-      client-declared, server-trusted approval — defines the security of both.)
@@ -1537,3 +1229,0 @@
-- [ ] **Entity as a parameter, not tool-per-entity.** One tool per *operation* with the entity slug
-      as an argument — `findDocuments({ collectionSlug })` rather than `findPosts`/`findProducts`.
-      Keeps the tool count flat as content types grow. (Payload, `buildMcpServer.ts:126-151`.)
@@ -1553,5 +1242,0 @@
-- [ ] **Decide per-integration credential storage.** Nothing in the current design covers it. Two
-      shipped references: WordPress's Connectors API (env → constant → DB precedence,
-      validate-before-persist, mask-on-every-read) and Directus's inversion where the *absence* of a
-      principal is the read capability, so admins cannot read provider keys through the API at all
-      (`api/src/services/payload.ts:169-195`). Multi-tenant makes this load-bearing early.
@@ -1566,5 +1250,0 @@
-- [ ] **Derive risk independently of the tool author's declaration.** Treat `requiresConfirmation`
-      and `readonly` as *claims*, not facts: require `readonly === true` explicitly (absent ⇒
-      confirmation required) and OR in danger flags derived from the capability's own service
-      binding and risk class. Matters most for plugin-contributed capabilities, where the registrant
-      is not you.
@@ -1585,9 +1264,0 @@
-
-## Backlog: Directus Research (Still Needed)
-
-Directus is still valuable for reference and can run in parallel with implementation. Existing
-material: `development/other-repos-specs/directus_specs/`.
-
-- [x] General Directus architecture map (`development/other-repos-specs/directus_specs/overview.md`, `monorepo-map.md`)
-- [x] Directus AI layer deep spec (priority) (`directus_specs/api/ai-and-mcp.md`)
-- [x] Directus admin UI extension model spec (`directus_specs/extensions/`)
@@ -2194,8 +1864,0 @@
-
-## Theme marketplace — DELETED 2026-10-04
-
-Owner: delete the dead code rather than restore a fixture. Removed (`8c1780077` + the follow-up commit): `features/theme/marketplace.ts`,
-`theme-lineage.ts`, `routes/marketplace/{list,download}.ts`, the `marketplace_list_themes`/`theme_install_from_marketplace` agent
-tools, the admin Themes Marketplace tab/API/port, the Explore "Copied from" lineage tooltip, and their tests/i18n. Discovery still
-skips a leftover `__marketplace__` folder in old sites, and `.tovu-lineage.json` stays an allowed install-local file. A real
-marketplace (network, search, publisher identity, versioning, signing, stable upstream ids) is unbuilt.
@@ -2226,26 +1888,0 @@
-
-## JSON-column tripwire + theme write-gate — 3 known-open items (2026-08-12 external audit)
-
-**DONE (re-audit 10-04):** #1 and #2 — `d309da0fe` (`jsonMentionInOwnComment`, trailing-comment scan in `migration-manifest.test.ts`); #3 was already closed by `45f5e2195` (08-17, `isSourceDirGeneratedConflict`).
-
-All three are **latent and non-blocking**, recorded here so they are not rediscovered from scratch.
-Context: a 4-auditor panel (Terra `gpt-5.6-terra`@xhigh, Gemini 3.1 Pro, Gemini 3.6 Flash, Sonnet)
-reviewed the session diff over two rounds. Everything blocking was fixed and mutation-proven —
-commits `3cd312d`, `57d5d65`, `697d97e`, `f763bb9`, `3fead5a`, `169b74a`. These three were
-deliberately deferred.
-
-**1. The JSON-mention regex fires on phrasing that means "not JSON."**
-`/(?<!\.)\bjson\b(?!\.(?:stringify|parse)\b)/i` in
-`apps/website/src/platform/db/__tests__/migration-manifest.test.ts`
-matches `"non-JSON"`, `"JSON Web Token (JWT)"`, `"JSON:API"`, `"GeoJSON-style … NOT parsed JSON"`.
-No such phrasing exists in `schema.sqlite.ts` today (grep-confirmed). It fails **loud** — the suite breaks
-and someone rewords a comment or adds a `REVIEWED_JSON_COLUMNS` entry — so it cannot pass bad data
-silently. Same accepted risk class as the `theme.json` filename false positive the `(?<!\.)`
-lookbehind already handles. *Fix only if actually hit*, with a narrow `(?<!non-)` exclusion.
-
-**2. A trailing same-line comment is invisible to the tripwire.**
-`col: text("x"), // JSON blob` attaches to neither column — `ts.getLeadingCommentRanges` does not
-see it. **Pre-existing, not a regression**: the auditor traced the old regex scanner and confirmed
-identical behaviour (its backward walk never inspected same-line trailing text either). A column
-documented *only* that way carries a JSON signal the tripwire cannot read. Same applies to a shared
-section-header comment above a group of columns — only the immediately-following column inherits it.
@@ -2253,13 +1889,0 @@
-**3. No install-time rule forbids a theme declaring `build.sourceDir: "preview"`.**
-That manifest is what made `preview/` paths resolve `"editable"` and sent PUT down the sourceDir
-branch (fixed in `9e75c4a`). The narrow fix is in place; the deeper one — a `build-conformance.ts`
-check refusing a `sourceDir` that names a `GENERATED_THEME_DIRS` entry — was not attempted.
-Unreachable today: no theme on disk sets `build.source: "compiled"`. Noted in `explore.ts` where a
-maintainer would look.
-
-**The lesson worth keeping, above any of the three:** a gate and the writer it guards must resolve a
-name the same way. `isGeneratedThemePath()` compared paths as spelled while `resolveThemeFilePath()`
-normalized them, so `PUT {"path":"css/../preview/app.css"}` returned 200 and overwrote generated
-output — walking around the rule on every route. Two resolvers for one string is a bypass waiting to
-be spelled differently.
-
@@ -2296,66 +1919,0 @@
-## Security page (credential inventory) under Operations — owner wants this, deliberately deferred (2026-08-15)
-
-**DONE, shape changed** — `838f1472c`: "Secrets" at `/admin/access-tokens` lists the stores (`features/security/rules.ts`), Remove + "Revoke it on <vendor>" link; Connect/Replace also allowed per the 08-16 owner ruling. Only the store table below is stale.
-
-Owner's question, verbatim: *"Should we have, like, a Security tab under Operations and then an Access
-Tokens tab? In case we need it in more than one place, or is that too messy?"* Answer: not messy, and
-not speculative — the scattering already exists. Owner asked for it to be recorded and revisited, not
-built now.
-
-**The measured state.** Eight sealed-credential stores exist (or are landing) in this repo:
-
-| Store | Repo file |
-|---|---|
-| Site / BYOK credentials | `apps/website/src/platform/db/sqlite/site-credential-repo.sqlite.ts` |
-| Publish targets | `apps/website/src/platform/db/sqlite/publish-credential-repo.sqlite.ts` |
-| Composio connector credentials (removed 2026-09-27, migration 0075) | `apps/website/src/platform/db/sqlite/composio-connector-credential-repo.sqlite.ts` |
-| Composio config (removed 2026-09-27, migration 0075) | `apps/website/src/platform/db/sqlite/composio-config-repo.sqlite.ts` |
-| Admin execution credentials | `apps/website/src/platform/db/sqlite/execution-credential-repo.sqlite.ts` |
-| External MCP servers | `apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts` |
-| Media provider credentials | `apps/website/src/platform/db/sqlite/media-provider-credential-repo.sqlite.ts` |
-| Source control (in flight this session) | `source_control_credential_sets` |
-
-**Table is stale as a current count (CORRECTED 2026-09-02):** two more sealed-credential stores
-landed 2026-08-28, after this table was written — `platform/db/sqlite/vendor-credential-repo.sqlite.ts`
-(`features/vendor-credentials/store.ts`) and `platform/db/sqlite/custom-credential-repo.sqlite.ts`
-(`features/custom-credentials/store.ts`), both first committed in `708e81b2`. The real current total
-is **ten**, not eight (verified by grepping every `deps.sealer.seal(` call site outside tests). Keep
-this table's shape and 2026-08-15 snapshot for history, but do not quote "eight" as today's count.
-
-And five admin screens already accept a token: `features/settings/SettingsUi.tsx`,
-`features/settings/ComposioKeyField.tsx` (removed 2026-09-27), `features/ai-assistant/AiAssistant.tsx` (BYOK),
-`features/deployment/StaticSiteTab.tsx`, `features/source-control/SourceControl.tsx`.
-
-**Scope it to READ + REMOVE. Never a second place to enter a token.** Two entry points for one secret
-is the "which row is authoritative" bug, and it would also undo work already paid for: the Static Site
-tab's redesign specifically pulled the credential OUT of an "Advanced" disclosure to make it Step 1
-inline, on the owner's own direct read that hiding a mandatory first step was backwards
-(`PublishCredentialsSection`'s header comment records the three passes it took). A Security page that
-re-hosts the connect form re-hides that step one room further away.
-
-The two jobs are genuinely different, and only one of them is built:
-- **Connect** — task-shaped, belongs in the flow that needs it. Already correct on Static Site.
-- **Inventory** — "what secrets does this install hold, when were they saved, kill that one."
-  Cross-cutting. **Nothing does this today.** That is the entire gap this page exists to close.
-
-**The load-bearing constraint — do not get this wrong.** A button that deletes Tovu's row does NOT
-revoke the credential at the provider. It stays live on GitHub/Vercel/Cloudflare until someone revokes
-it there. Label it **"Remove from Tovu"**, never "Revoke", and link out to the provider's own
-revocation page. Calling it "Revoke" ships exactly the defect the owner caught on the connected-
-credential row the same day — copy asserting an action the system never performed (see U3 in
-`ADS-memory/reports/continuity/2026-08-15-session-4-handoff.md`, and `CredentialStepDone`'s doc
-comment for why that timestamp says "saved" and not "updated"). Same family of bug, higher stakes.
-
-**Shape.** One plain page under Operations, no tab bar — a tab bar with a single tab in it is noise.
-Add tabs when a second concern actually arrives; obvious candidates already exist (Activity Log is a
-`soon: true` placeholder in this same group, and Roles & Permissions sits over in People). One row per
-stored credential: provider, what it is for, when it was saved, and a deep link back to the screen
-that owns it.
-
-**Known cost when someone picks this up:** a complete inventory means reading from all eight stores,
-and two of those surfaces — BYOK and Composio (Composio removed 2026-09-27) — were flagged as broken or unfinished elsewhere
-in the backlog. Either confront them or scope the first pass to the stores that are healthy and say so
-on screen, rather than silently listing a subset as if it were everything.
-
----
-
@@ -2445,23 +2002,0 @@
-## Plugins screen has no way back to Enabled once a plugin is disabled — RESOLVED (found live, 2026-09-10)
-
-**DONE 2026-09-22: `apps/admin/src/features/plugins/Plugins.tsx` has the disabled-row re-enable path.**
-
-Before the resolution, both `Plugins.tsx` (`.tovu-plugin` family, `b4f2c40d`) and the earlier `AgentPlugins.tsx` correction
-hit the identical shape of gap from the same owner instruction ("Downloaded should have Remove, not
-Enabled/Disabled"). `AgentPlugins.tsx` was fixed to be context-sensitive: Remove on an enabled row,
-Enable (direct, no confirm) on a disabled row — see `9eb2b4ab`/`b65d1695`. **`Plugins.tsx` was NOT
-given this same fix** — its dispatch predated that correction, so Downloaded's action there is an
-unconditional Remove. With Installed pre-filtered to `enabled: true` and Downloaded's slot fully given
-to Remove, there is currently no control anywhere on this screen to re-enable a plugin once disabled
-(including a quarantined one) short of removing and reinstalling it. The rebuild agent flagged this
-itself, correctly, as a direct consequence of the instruction rather than a bug it introduced — it did
-not invent a workaround.
-
-**Fix**: apply the exact same context-sensitive split `AgentPlugins.tsx`/`AgentPluginRow.tsx` already
-has to `Plugins.tsx`/`PluginRow.tsx` — Remove (confirm-gated, real DELETE) on an enabled row, Enable
-(direct `onToggleEnabled`, no confirm) on a disabled row. The underlying `onToggleEnabled(enabled:
-true)` codepath is untouched and already covered in `use-plugins.hooks.unit.test.ts` — this is a UI
-wiring fix on `PluginRow.tsx`'s action slot, not new plumbing.
-
----
-
@@ -2478,5 +2012,0 @@
-- A real (not `soon:true`), clickable Operations nav entry, same enabled shape the `agent-plugins` row
-  just moved to tonight (`panels.tsx`) — not a disabled preview.
-- A tabbed page matching the `SettingsDialogShell` shape `AgentPlugins.tsx`/`Plugins.tsx` already use.
-- One tab that honestly reports current state by reading the existing port/config (is
-  `OTEL_EXPORTER_OTLP_ENDPOINT` set right now — yes/no — and what that means), in plain language.
@@ -2497,127 +2026,0 @@
-## `Plugins.tsx` needs its state moved into a hook — RESOLVED (caught live, 2026-09-10)
-
-**DONE 2026-09-22: `apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts` owns the screen state.**
-
-Owner, watching the `/admin/plugins` rebuild live: "already see apps/admin/src/features/plugins/Plugins.tsx has state and hooks in the code. should be in hooks.tsx." At the time, `useState` for `expandedIds` and `pendingRemoveId` sat directly in the component (~line 170-171), violating this admin's own rule — component logic belongs in `hooks/`, not `.tsx` — that the sibling `AgentPlugins.tsx`/`use-agent-plugins.hooks.ts` split already follows correctly.
-
----
-
-## HTML-format Pages render in the fallback shell, not the theme — RESOLVED (re-measured 2026-09-06)
-
-Filed 2026-08-30 from a live admin-assistant session auditing tovu-com. **Re-measured 2026-09-06
-against the running dev site with `curl -sk https://localhost:3000/<path>` (HTTPS, self-signed cert)
-plus read-only SQLite (`file:sites/tovu-com/content.db?mode=ro`). The symptom is gone on the live
-server render path.** Both of this entry's original claims — the symptom AND its stated cause — were
-false by the time anyone re-checked.
-
-**What was claimed.** Five authored pages (`/quickstart`, `/documentation`, `/faq`,
-`/how-tovu-works`, `/about`) came back cream-and-peach while Posts rendered in the full Basic theme,
-because those pages were served by Tovu's built-in fallback shell (`SITE_TITLE = "Tovu Demo Site"`,
-`server/inbound/public-http/routes/site/pages.ts`) — no theme CSS requested, so the author's own
-`var(--accent, #8a4b2a)` / `var(--surface-2, #f6f2ef)` fallbacks (from `pages_write_html`'s contract)
-won and produced the peach. The stated cause was **"there is no per-page template selection anywhere
-in the system"**.
-
-**The stated cause was already false when written, and is verified false today.** A `templateChoice`
-column exists and is threaded end to end — all five citations confirmed by line 2026-09-06:
-`platform/db/schema.sqlite.ts:107` (`templateChoice: text("template_choice")`), mirrored at
-`schema.postgres.ts:871`; threaded through `features/post/post.ts` (`:101`, `:332`, `:958`); exposed
-on the headless contract at `contracts/headless/contracts.ts:53`; resolved by
-`features/theme/static-render.ts` (`resolveTemplate`, `isEligibleForTemplateBranch`,
-`resolveStaticTierPageShellFallback`). Not one citation had drifted.
-
-**What actually fixed the symptom: `ed1dd2e9`, "give untemplated static-tier html Pages the theme's
-real shell"** (2026-09-02), hardened by `e7715996` and renamed by `38e022fc`. It added
-`resolveStaticTierPageShellFallback` (`static-render.ts:1043`), wired at
-`routes/site/pages.ts:1116-1117` — when `isEligibleForTemplateBranch` refuses an untemplated Page,
-the route now renders it through the theme's own canonical page shell
-(`STATIC_TIER_PAGE_SHELL_IDS = ["pages-default", "page-shell"]`) instead of `pageShell()`'s generic
-chrome. The choice is applied to a shallow clone for that one render only; nothing is written back.
-
-### Evidence, measured 2026-09-06
-
-| Path | Code | `kind`/`body_format` | `template_choice` | `data-theme` | `/theme-assets/` refs | `"Tovu Demo Site"` |
-| --- | --- | --- | --- | --- | --- | --- |
-| `/quickstart` | 200 | page / html | `blog-post.html` | yes | 11 | 0 |
-| `/documentation` | 301 | — | — | — | — | — |
-| `/faq` | 200 | page / html | `page-shell.html` | yes | 11 | 0 |
-| `/how-tovu-works` | 200 | page / html | `blog-sidebar-template.html` | yes | 11 | 0 |
-| `/about` | 200 | page / **doc** | `pages-default.html` | yes | 11 | 0 |
-| `/catalog` | 200 | page / html | **NULL** | yes | 11 | 0 |
-
-Two corrections to the original five-page list: `/documentation` is now a 301 to `/docs`, and
-`/about` is `doc`-format, not `html`, so only three of the five are the shape this entry describes.
-
-**`/catalog` is the load-bearing row, not the original five.** The four surviving originals all
-carry an explicit `template_choice` now, so they prove only that *someone set the column* — data, not
-code. `/catalog` is the one published `html`-format Page still at `template_choice = NULL`, i.e. the
-exact never-chosen state every Page starts in and the exact state the bug was filed about. It renders
-the theme's real document, and a comment string unique to
-`sites/tovu-com/themes/static/basic/render/pages/pages-default.html` appears verbatim in its response
-body. That is `resolveStaticTierPageShellFallback` firing live, on the untested state.
-
-**The peach is gone for a second, independent reason worth recording.** `theme-assets/basic/css/
-theme.css` (44,049 bytes) defines only two custom properties, `--header-h` and `--kui-pin-offset` —
-it does NOT define `--accent`, `--fg`, `--surface`, `--surface-2` or `--border`. Those come from an
-inline `<style>` token block in the theme's own page shell (`--accent: oklch(82.1% 0.153 80.1)` dark
-/ `#f8b838` light). So the fix works by supplying the shell that carries the tokens, not by making
-the stylesheet define them — a page reaching a theme's *stylesheet* without its *shell* would still
-go peach. Note the tokens are `oklch`, so an `rgb()`-shaped grep will not find them.
-
-### Which render paths this was measured on
-
-- **Live server render — EXERCISED.** All six routes above, over real HTTPS against the running dev
-  app. This is where the verdict comes from.
-- **Static publish — NOT separately exercised, and does not need to be.** `platform/export/site-
-  exporter.ts` boots the real app and fetches every route over real loopback HTTP; its own header
-  states there is "exactly one way to boot the real app and fetch it — no second implementation is
-  ever expected", precisely so exported bytes are identical to a live visitor's. It therefore runs
-  the same `pages.ts` handler and inherits the fix by construction. No export was run.
-- **Template preview — NOT exercised, and it DOES diverge. New finding, code-traced only.**
-  `server/inbound/admin-http/routes/posts/template-preview.ts:194` calls `renderViaTemplate`
-  **directly**, bypassing `renderTemplateBranchIfEligible` and therefore never consulting
-  `resolveStaticTierPageShellFallback`. With no `?templateChoice` query param it passes
-  `templateChoice: null` (`resolveOverrideTemplateChoice`, `:132`), which `resolveTemplate` resolves
-  to `theme.manifest.templates[0]` — a Post-shaped template. So an untemplated `html` Page previews
-  under a *different* template than the public site serves it with. This is not the filed symptom
-  (the preview still renders theme chrome, not the generic shell) and is not this entry's bug, but it
-  is a real preview-vs-public divergence in the third render path and is unverified live.
-
-### Status
-
-**Closed as fixed for the live server and static-publish paths.** Do not reopen from the original
-symptom description; reopen only against a fresh measurement.
-
-**OUT OF SCOPE (Leona, 2026-09-06): only `basic` is in use. Do not spend time on the other
-themes.** The paragraph below is retained as an accurate record of why the degrade exists, not as
-work to schedule. It becomes live again only if a tailark theme is ever activated.
-
-**One live degrade stays, by design, and is the thing to watch.** The fix resolves only against a
-small closed vocabulary of Tovu-owned filenames. Of the five static themes installed under
-`sites/tovu-com/themes/static/`, only `basic` (as `pages-default.html`) and `basic-2` (still
-`page-shell.html`) ship one at all — `tailark-dusk`, `tailark-quartz-dark` and
-`tailark-quartz-libre` ship neither. **Switching the active theme to any tailark theme reopens this
-exact bug at HTTP 200.** That degrade is deliberate (guessing at another template is what once put
-`terms-of-service` under a Post-shaped template), and `e7715996` made the miss observable — it emits
-a `[theme] static theme '<id>' ships none of 'pages-default.html', 'page-shell.html'; untemplated
-html Pages render in Tovu's generic chrome instead of this theme's own document` warning, once per
-process per distinct message, so it now shows up in the server log rather than only in the pixels.
-
-**Second finding — theme pages have no "don't publish" switch.** Public routing for a static theme is
-driven purely by file presence: any `.html` under the theme's `render/pages/` not declared as a
-template shell becomes a public URL automatically (`isStandaloneThemePage`,
-`apps/website/src/features/theme/theme.ts`). There is no draft/unpublished state for a theme page.
-The assistant worked around this for `/pricing` by moving `pricing.html` into `_unpublished/` and
-dropping it from `theme.json` — reversible, bytes intact, but a convention it invented, not a
-feature. **Decide whether that convention becomes real** (an ignore rule or a declared `unpublished`
-list) or whether theme pages get a genuine publish flag. Until then `_unpublished/` is undocumented
-and the next person to touch that theme will not know it means anything.
-
-**Smaller, independent:**
-- ~~Footer menu still links `/team`~~ **STALE 10-04:** no footer item links `/team`; footer items are page links (`3872c6727`).
-- **STALE 10-04** (peach rendering gone). Open question the owner has not answered: re-skin those five pages to a neutral white/grey fallback
-  palette as a stopgap. That hides the peach where it is visible but does not fix the shell problem.
-  Do it only if the real fix is not being picked up now.
-
----
-
@@ -2659,5 +2061,0 @@
-- **§9 — the product question is still unanswered**: hosted SaaS (Deploy panel nearly empty:
-  Publish/domain/status) vs self-hosted (Providers tab with credentials) serve different users, and
-  the doc says the existing stub was shaped for the wrong one. Whether the *current* `Deployment.tsx`
-  UI (Overview/StaticSite/Docker/FullSite/History tabs) resolved this question one way or just built
-  through it was not checked in this pass — worth a direct look before assuming it's settled.
@@ -2671,36 +2068,0 @@
-## `content/themes/` vs `sites/` have drifted in load-bearing ways — an upgrade would silently break the live site
-
-**DONE for the shipped theme (re-audit 10-04)** — `948706418` synced tovu-theme with `sites/tovu-dev`; drift canary `shipped-site-theme-drift.canary.test.ts`; doc `development/docs/themes/shipped-theme-sync.md`. `tovu-com`/`basic` below are gone. Open: the wider "upgrade overwrites a user's sites/ themes" problem.
-
-**This is the gap `[[project_tovu_upgrade_destroys_themes]]` describes from the other direction**
-(upgrading Tovu destroys live theme edits because `sites/` is gitignored and themes live inside the
-install dir). This entry documents the concrete drift on `tovu-com`'s `basic` theme.
-
-**Re-measured 2026-09-06** with `diff -rq content/themes/static/basic sites/tovu-com/themes/static/basic`
-— the drift is now **wider than when this was filed**, and its shape changed:
-
-- **The template files have been renamed on the live side only.** Tracked still ships
-  `blog-post.html`, `blog-sidebar-template.html`, `page-shell.html` and `blog.html`; live instead has
-  `listing-default.html`, `pages-default.html`, `posts-default.html` and `posts-sidebar.html` — i.e.
-  **ADR-065's content-template naming convention (Accepted 2026-09-03) was applied to `sites/` and
-  never back to `content/themes/`.** An upgrade would restore the old names under a resolver that
-  now expects the new ones.
-- **`theme.json` disagrees on both keys**: tracked lists nine `pages` and has **no `publishedPages`
-  key at all**; live lists eight `pages` (no `blog`) and an **empty** `publishedPages: []`.
-- Also differing: `css/theme.css`, `render/pages/{404,index,pricing}.html`,
-  `render/partials/{footer,footer-minimal,nav}.html`.
-
-The originally-recorded load-bearing case still stands and is worth keeping: `render/partials/nav.html`
-live carries `data-embed-config='{"type":"menu","id":"menu-header-nav","variant":"tree"}'` while
-tracked omits `"variant":"tree"`. `static-render.ts` picks `renderMenuTree` only when
-`marker.config.variant === "tree"`, else the flat `renderMenuLinks`, whose own doc says it drops every
-nested-menu hook "on the floor". **An upgrade copying tracked over live would silently delete the
-nested menu** — the flat renderer degrades gracefully, so nothing breaks loudly.
-
-`sites/` is gitignored, so **the tracked copy under `content/themes/` is what any future
-`tovu init` / theme-reinstall / upgrade path would deploy**, reverting these live fixes with no
-warning. No fix attempted here; flagging so the next theme-sync or upgrade-safety pass knows this
-drift exists, is growing, and is not cosmetic.
-
----
-
@@ -2817,11 +2178,0 @@
-1. **Publish what is linked.** Add the linked ids to `publishedPages` (admin publish toggle →
-   `registerAdminThemePagePublishRoute`). Makes theme pages the source of truth again, but collides
-   with the content rows now serving `/about`, `/docs` and `/download`; the slug-collision default is
-   post-wins (2026-08-15), so those theme pages would stay shadowed anyway.
-2. **Stop linking what is not published.** Keep the menu-driven footer, treat the content rows as
-   canonical, leave `publishedPages` empty and let the theme's `.html` files be inert templates.
-   This is effectively the current live state; making it a rule means requiring menu items to be
-   authored as content refs (which get the availability filter) rather than raw URLs (which do not).
-3. **Independent of 1 and 2:** back-port the live footer and whichever `publishedPages` decision is
-   taken to `content/themes/static/basic/`, or the next reinstall silently reverts to the filed bug.
-
@@ -2872 +2222,0 @@
-- One PGlite per site: each is its own data directory, so multiple sites = multiple instances.
@@ -2875,2 +2224,0 @@
-  - PGlite is single-process, but Tovu's API and the agent daemon are separate processes. How do they share one PGlite (pglite-socket / a small bridge)?
-  - Does Tovu's existing Postgres dialect (schema.postgres.ts) run on it unchanged?
@@ -2906 +2253,0 @@
-- The **31 parity-gap tools stay ON HOLD** until the prototype lands; the Claude proposal maps them to ~25 table rows (6 closable today). Includes publish "send by hand" send/status/undo for chat (the admin section was removed 2026-10-05).
@@ -2927 +2273,0 @@
-- Table: assistant_render_ui produced an unstyled table (no borders/header styling). Jini ui interactive-ui has providers `shadcn.data-table` (preferred) and `native.data-table` (plain HTML fallback). Find out which rendered and why (agent picked native, or shadcn rendered without interactive-ui.css on the canvas). Fix so canvases always get the styled table; consider TanStack Table (sort/filter/paging/resize) under the shadcn data table; AG Grid Community only if editable spreadsheet cells are needed.
@@ -2930,3 +2275,0 @@
-## AFTER 0.1.13 — TanStack Query devtools as a tab on the Observability page (owner, 2026-10-08)
-- The floating TanStack devtools button is hidden by default (apps/admin/src/lib/fetch-query/provider.tsx; opt in with VITE_TANSTACK_DEVTOOLS=1). Owner idea: move it into https://localhost:5173/admin/observability as a tab ("not sure it fits neatly"). Investigate: TanStack exposes an embeddable panel (`ReactQueryDevtoolsPanel`) that reads the live QueryClient in-process (no extra queries needed) vs a custom tab built from QueryCache events; dev-only or also production (read-only, redacted)?
-
@@ -2934 +2276,0 @@
-- Split: CORE consent mechanism (generic, Jini + Tovu host): server-rendered banner + preferences widget (vanilla JS, jini- classes, theme CSS); categories (necessary/functional/analytics/marketing); SCRIPT GATING (theme/plugin scripts declare a category and run only after consent; nothing loads before the click); honour Global Privacy Control; "Do Not Sell or Share" link; region rules (opt-in EU/UK GDPR, opt-out California CCPA); consent record for proof; Google Consent Mode v2 signals.
@@ -2940,2 +2281,0 @@
-- Owner 10-08: plugins should be NON-React (framework-neutral). Contract = vanilla `mount(element, spec, theme) → { update(spec, theme), destroy() }` (fits ECharts/Chart.js/D3/uPlot/Plotly natively), or a web component `<jini-chart>`; works in the React admin, public pages (progressive enhancement, no React), Vue/Angular/Zana hosts. Core ships ONE small React host adapter (~50–80 LOC + tests; ~1 day incl. vanilla public loader). React-based libs (Recharts/Nivo) as plugins: own React root inside the element (own React copy ~45 KB gz) — fine; shared-React via import map only if many React plugins appear (~2–3 days, couples to our React version).
-- Owner 10-08 decision: EXTRACT charts out of @jini-ai/ui. Core keeps only the chart contract (ChartSpec, provider registry, vanilla mount contract, React host adapter) + a no-plugin fallback (render the data as a clean table). The Recharts provider (incl. the 10-08 shadcn-style theme) becomes a bundled-by-default chart-provider PLUGIN (a UI/site plugin, not an agent plugin; an optional agent plugin can teach chart choice); ECharts etc. are alternatives. Removes recharts from @jini-ai/ui's deps. Two steps: (1) move into its own Jini package (e.g. @jini-ai/charts-recharts), statically bundled; (2) when plugin component loading lands, it becomes the default bundled plugin.
@@ -2947,2 +2286,0 @@
-- Owner 10-08: NO per-site login locally. Owner ruling 2026-09-06 ("no password to login to the Tovu desktop app; maybe one per individual admin, not for the site"). Desktop uses the loopback boot-token auto sign-in (verify in the 0.1.13 smoke: switching sites must not prompt). Local `npm run dev` in the browser still shows each site's login (each site's content.db has its own identity_users): give dev the same boot-token sign-in so switching local sites never asks. Deployed sites keep per-site accounts (owner/editors/members).
-- Local/desktop opt-in "run this site too": each site its own server process + port (CLI already supports `tovu serve <dir> --port`), separate cookies per port; production stays one site per deployment. Today the Sites screen switches with "Serve after restart" (one site at a time). Tie-in: Codex widgets design draft said simultaneous multi-site is a separate decision.
@@ -2952,3 +2289,0 @@
-- Shape: agent plugin = short skill ("consult before designing/building") + one read-only tool: `overview` (map: content, forms, widgets, themes, members, SEO, deploy, plugins, Jini packages) and `explain(topic)` (details + which tools/docs next).
-- Accurate by construction: each domain module contributes a capability card declared next to its code; live facts (widget types, form field types, markers/layouts) come from the running registries. No hand-maintained mega doc; CAPABILITIES.md is developer-level and drifts.
-- Generic in Jini, content injected by the host (Tovu cards; Zana its own).
@@ -2956 +2290,0 @@
-- Owner Q 10-08: system prompt? → put a POINTER in every agent's system prompt (vendor-neutral: Claude/OpenAI/Gemini/OpenCode/DeepSeek): "before planning/building, call site_guide"; the content lives in the tool (tokens, staleness, small models). Nothing equivalent exists today (search_tools/describe_tool = actions; search_components = chat UI catalog; custom instructions = owner text; get_active_context = focus).
@@ -2958,2 +2291,0 @@
-- Owner 10-08: cover BOTH cases so one failing doesn't leave agents blind: core `site_guide` works on its own with built-in minimal topics + live facts; the first-party "How Tovu works" plugin enriches/updates topics; plus the system-prompt pointer.
-- Must: describe THIS site (installed/enabled plugins, theme, widgets, members on/off), filter by the caller's permissions, expose also as an MCP resource/prompt for external agents, and add an eval (cheap model + "design a planner directory site" → calls site_guide first, uses forms/widgets).
@@ -2961,6 +2292,0 @@
-## AFTER 0.1.13 — tovu.dev link previews show no picture (found 2026-10-08)
-- og:image = /m/testing-page/public.v1/image.webp is a 66-byte placeholder; WebP is unreliable in iMessage/SMS previews; og:url + image point at tovu.fly.dev, not tovu.dev.
-- DONE 2026-10-08 15:25: SEO → Site defaults share image set to ai-provider-keycaps on tovu.dev (live og:image now /m/ai-provider-keycaps/public.v1/image.webp, 89 KB).
-- OWNER 10-09: DROP item (1) below (tovu.fly.dev vs tovu.dev): tovu.dev is set up to mirror the site; do nothing there.
-- Still open: (1) og:url/og:image host is tovu.fly.dev because fly.toml TOVU_PUBLIC_URL="https://tovu.fly.dev" (also drives OAuth callback URLs): switching to https://tovu.dev needs a Fly deploy + updating OAuth callbacks; owner call. (2) Media only has the `public` named transform (webp); add an `og` transform (jpeg, 1200 wide) and use it for og:image/twitter:image so SMS/iMessage/LinkedIn previews get JPEG. (3) Product guard: warn in SEO when the share image is tiny or missing.
-
@@ -2976 +2301,0 @@
-- Tovu copies of Jini → import Jini, delete copies: skills installer (#1), source-control registry/kit (#2), MCP presets (two registries, #3), package file tree (#10), desktop build checks (#11), site-glue (#12), CMS routing (#18), html escape (extras).
@@ -2978,5 +2302,0 @@
-- Fetch-query NICE items: move ~30 Tovu hooks + Jini admin controllers (SEO, widgets, media, comments load-more) + Members to useFetchQuery; replace 2 hand-rolled in-flight dedupers (admin-locale, AssistantDock); JiniMediaPicker raw transport → port; Jini ui memory feature hardwired `/api/memory*` ports → host ports; nothing yet bans a second mount of Tovu's own lib/fetch-query/provider; apps/admin/vitest.config.ts doesn't dedupe @jini-ai/ui.
-- 31 more request-time handlers resolve the site from env/cwd instead of the booted site binding (22 agent-plugin, 7 skills, 2 fs-files): list + suggested fix (resolve plugin/skill layouts once onto RouteDeps) in `ADS-memory/.local-artifacts/handoffs/2026-10-08-site-binding-fix.md`. Safe today only because each local site runs in its own process with its own env/cwd.
-- Move fetch-query's framework-neutral contract + cache from @jini-ai/ui to @jini-ai/core/fetch (owner agreed direction; recommended after 0.1.13).
-- web_fetch_page: replace the hand-written HTML→markdown converter (apps/website/src/features/web/html-to-markdown.ts, behind the injected htmlToMarkdown port) with hast-util-to-mdast + mdast-util-to-markdown + mdast-util-gfm-table (approved 10-08; steps in ADS-memory/.local-artifacts/handoffs/2026-10-08-web-fetch-tool.md); and move features/web's generic files (web-page, html-document, html-to-markdown) to Jini.
-- Lint/guards to add (audit part 3, 9 items): process.env only as `?? process.env` default in Jini src; driver/vendor imports only in adapters; module-level mutable state; bare global fetch in Jini server packages; Tovu fn duplicating a Jini export; `?? "dev-only-insecure-*"` not covered by the boot gate; react in the public-site bundle; `https://api.*` literals outside providers; plugin-runtime ↔ agent-plugins cross-imports.
@@ -2985 +2304,0 @@
-  - #22 GitHub stays OUT of core. It's a plugin bundled with Tovu (ships by default), not a core deploy provider.
@@ -2987,3 +2305,0 @@
-  - #25 NO imports between plugins (site ↔ agent, or plugin ↔ plugin). A plugin asks the host at runtime whether another plugin is installed/enabled ("is X here? then use it this way") through a capability/registry lookup port, and degrades gracefully when it's absent.
-    - Owner Q 10-09: plugins need a stable ID, separate from version and display name (e.g. GitHub ships its own plugin into our marketplace). Proposal: (1) a permanent publisher-namespaced ID `<publisher>/<name>` (e.g. `tovu/github` vs `github/github`), like VS Code's `publisher.name` and npm's `@scope/name`; it never changes across versions, and publishers are verified in the marketplace so nobody can squat an ID; (2) semver `version` stays separate; (3) each plugin declares CAPABILITIES it provides (e.g. `source-control`, `deploy-target:fly`), and a plugin looks up by capability first ("anything that provides source-control?"), by ID only when it needs a specific one, optionally with a version range. The lookup returns the installed+enabled match with its id + version. Today the manifest only has `name: "github"` + `version` (agent-plugins.org schema) plus provider ids inside extension files, so namespaced IDs + capabilities are a manifest change (extension field `tovu.id` / `tovu.provides`). Design with the owner first.
-    - Owner 10-09 direction: put it in the plugin manifest (plugin.json / manifest.json): a Tovu ID (e.g. "github"), the version, and keywords so the agent can search plugins. Coordinator suggestion to settle: make the ID publisher-qualified (`tovu/github`, so a vendor's own `github/github` can't collide), reuse the existing `keywords` field, and add `provides` capabilities. One shape for site plugins AND agent plugins.
@@ -2995 +2310,0 @@
-- Owner: a toggle/button on Overview → AI Assistant → Admin AI Assistant (/admin/ai-assistant?tab=admin) that allows subagents. Turning it on shows a pop-up listing the dangers: security risk; subagents inherit the assistant's bypassed permissions; you may not see what they're doing (the chat UI doesn't show subagent tool calls); cost and machine load multiply. Off by default.
@@ -3005 +2319,0 @@
-- Spec change: update SPEC-006 AC-28.
@@ -3007,10 +2320,0 @@
-## Post author field with a "Show post author" toggle (owner, 2026-10-08; release TBD — needs a DB migration)
-- Posts have no author today (Site import puts authors only in its report). Owner: each post gets an Author input plus a per-post "Show post author" toggle; the author defaults to the signed-in account's username (e.g. "admin"), editable to any name.
-- Needs: content schema + migration (journal "when" = prev+1), editor field + toggle, theme template variable (author shown only when toggled on), REST/agent tools (content_post_create/update accept author + showAuthor), Site import maps source authors into it, excerpt field considered alongside.
-- Excerpt note: a dedicated editable excerpt is deferred; Site import preserves the source excerpt in SEO description. This author change does not add an excerpt field.
-
-## LATER (Jini change) — Chat usage line: per-turn cost + running chat total (owner, 2026-10-08)
-- BUG in today's number: the "$X" on each reply ("Done · 2m 49s · 2597 out · $2.5005") is NOT that reply's cost. It is Claude Code's `total_cost_usd`, which is CUMULATIVE across `--resume` of the same agent session, and Jini (agent-runtime/src/claude-stream.ts `costUsd: obj.total_cost_usd`) passes it through as if per-run. Evidence (sites/luvira/chat.db conv ceb2c0a6): $1.8721 → $2.5005 → $2.6759 while a 745-token, 12 s reply "cost" $2.68; tovu-dev conv fdfde658 climbs $1.08 → $2.11 with 289–4680 out per turn. Duration and "out" tokens ARE per-run.
-- Owner wants: "$0.45 (Total: $2.50)" — this turn's cost + the chat's running total, both rounded UP to cents. Reconsider whether "2597 out" (output tokens) stays; it confuses.
-- Jini change: per-turn cost = this run's cumulative minus the previous run's cumulative for the same agent session (reset when the session id changes); total = sum of per-turn costs across the conversation (covers session switches and non-Claude agents, whose cost may already be per-run — check each def). Format in `Jini/packages/chat/src/react/components/MessageRow.tsx` `UsageSummary`. Then publish Jini and bump it in Tovu; no Tovu code change expected.
-
@@ -3019,2 +2322,0 @@
-- Step 1 (~0.5 day): get-by-id on the existing `content_read` cards → closes most of the 18 read-one gaps.
-- Step 2 (~1–1.5 days): write-handler registry modelled on duplicate-resource-registry; derived `content_create.<resource>` / `content_update.<resource>` over each resource's existing handlers. Must ABSORB the old per-resource tools (alias/retire), not sit beside them.
@@ -3024 +2325,0 @@
-- OWNER 2026-10-09: do NOT convert all of them. First a PILOT on a small set of tools: does the generic create/update layer actually work as well as today's hand-written tools (agent tool choice, descriptions, permissions, errors)? Compare, then decide. **Remind the owner and ask them to guide the pilot scope before starting.**
@@ -3029,15 +2329,0 @@
-## 0.1.14 — One shared sites folder for web dev + desktop (owner, 2026-10-09)
-- Sites live in `Documents/Tovu/sites` (OS documents dir; same on Mac/Windows), used by both `npm run dev` and the desktop app; shared registry + per-site running locks in OS app-data (Application Support / %APPDATA%). Job `home` built the mechanism with default `~/Tovu Sites`: change the default to Documents/Tovu/sites. Migration: `npm run sites:move-home` (dry run; `--apply`), run with the owner.
-- Owner 10-09 (revised): ONE user config file in OS app-data (Mac `~/Library/Application Support/Tovu/config.json`, Windows `%APPDATA%\Tovu\config.json`) with `sitesHome` (default Documents/Tovu/sites) and `siteRoots` (array; `~` expanded; dedupe by real path). Read by `npm run dev`, `npm run desktop`, the installed desktop app and the CLI; edited from Settings in both apps. Precedence: env vars `TOVU_SITES_HOME` / `TOVU_SITE_ROOTS` (overrides for tests/CI) > config.json > defaults (Documents/Tovu/sites + the repo sites/ when running from source). The shared sites registry + running locks live in the same app-data folder.
-- SQLite placement (owner 10-09: "add that also"), as config.json `databases` setting:
-  - DEFAULT `"inSite"`: each site keeps its databases in a `data.nosync/` subfolder (content.db, chat.db + -wal/-shm). iCloud never syncs `*.nosync` folders, so the site folder stays self-contained, portable and backed up, minus live DB files. Tovu's own backup (consistent SQLite snapshot via the online backup API) covers the DB; the "Automatic database backups" item makes that scheduled.
-  - OPTION `"appData"`: databases live under OS app-data (`Application Support/Tovu/databases/<site-id>/`), never synced by anything. For people whose whole Documents folder is synced by OneDrive/Dropbox/Google Drive, which ignore `.nosync`.
-  - Startup check: detect Documents synced by iCloud/OneDrive/Dropbox/Google Drive. With `inSite` + a non-iCloud sync tool, warn and offer `appData` or `~/Tovu`.
-  - Migration: move existing content.db/chat.db (+ -wal/-shm) into `data.nosync/` with the site stopped, verify, keep a backup copy; the CLI/site-dir resolver must accept both layouts (old sites keep working).
-- RISK (owner worried): SQLite in an iCloud ("Desktop & Documents") or OneDrive-synced Documents folder can corrupt live databases. Now: detect a synced Documents folder and warn, offering `~/Tovu`. Later: a real fix (e.g. keep each site's DB files in a `*.nosync` subfolder that iCloud skips; check OneDrive's equivalent).
-
-## Owner decision 2026-10-09: NO permanent deletes from the chat (for now)
-- The assistant gets no permanent-delete tool of any kind, not even behind a confirm card (supersedes the 10-01 decision). Removed by job gapb and kept removed: trash_empty, trash_purge_item, media_purge_asset, comments_purge_comment, identity_user_delete, deployment_ops_unset_secret, external_mcp_delete, custom_credential_delete, deployment_delete_provider_credential, source_control_delete_credential, webhooks_delete_subscription, identity_role_delete, identity_policy_delete.
-- Follow-up (Codex): update the 6 suites still expecting them (identity-authorization, identity-contracts, permanent-delete-search-discoverability, tool-registrations.webhooks, deploy-ops search-discoverability, assistant-byok-routes); delete the dead permanent-delete contributor; fix descriptions naming removed tools (comments/agent-tools.ts:188, theme/trash-theme-tool.ts:50); when asked to delete one of these, the assistant replies with a direct link to the admin screen where the human does it.
-- Owner 2026-10-09 (later): make it a SETTING instead: "Allow permanent deletes from chat" on /admin/ai-assistant → Admin AI Assistant tab (next to the subagents toggle; reuse that pattern: owner-only, OFF by default, danger confirm dialog listing what it unlocks, audit-logged with the acknowledgment, per site). When ON, the 13 tools come back, each behind a confirm card that names EXACTLY what will be deleted (item names, counts, and for trash_empty the full list) so nobody deletes blind. When OFF (default), the assistant links to the admin screen instead. Coordinator suggestion to confirm: two levels (settings deletes vs content purges) or one toggle.
-
@@ -3055,5 +2340,0 @@
-1. Chat dock agent picker (Use Local CLI → Claude Code): choosing a Reasoning effort doesn't stick — it snaps back to "Default" (1-reasoning-effort-resets.png).
-2. Chat thread: a user message right after tool-call rows has no vertical gap above it (2-…png).
-3. User message bubble colour is inconsistent: a short one renders light grey with dark text, a long one black with white text (2 vs 3). Owner: user bubbles should be black consistently.
-4. (seen in 2/3) The chat panel title shows raw markdown: "Page: **Plannie** at **plannie" — strip markdown when deriving the conversation title.
-5. Desktop "Sites settings" dialog looks horrible (owner 19:41, 5-desktop-sites-settings.png): unstyled browser-default buttons and select, loose explanatory paragraphs, raw bullet list with Remove buttons glued to the path, path text wrapping mid-folder, a single "Sites" nav item wasting a column, Save far from the fields. Redesign to the admin's look per the design checklist: labeled rows (label + compact control on one line, ⓘ tooltips for the explanations), a folder list as rows with truncated paths + tooltip and an aligned Remove icon button, Add/Choose buttons under their field, primary Save in a footer, no nav column when there's one section; check 375px + nav collapsed/expanded + empty/many folders + long paths. Route: Opus subagent + Claude-in-Chrome/Electron screenshot loop (UI redesign rule), not Codex.
@@ -3061 +2341,0 @@
-7. Sites home moves one level deeper: ~/Documents/Tovu/sites/<site>/ (owner 10-09 ~20:40; room for siblings like shared plugins/templates/backups, keeps the sites/ name). Change the default sites home, teach sites:move-home the new target (verified relocation, one backup, rollback), auto-update desktop registry paths (sites.json, desktop-projects.json) so the owner fixes nothing. Start after deskfx2 lands. Moving needs each site stopped ~1 min: ask the owner before moving plannie.
````
