P9F PARTIAL: Lane ownership covers the indexed work and audit additions. Shared route and kit cutovers, the final non-theme STAYS review, and exhaustive theme-edge verification remain NOT-CHECKED.

## Files left

**2,479 files remain in the measured extraction inventory.** The combined plan starts at 2,626. Remove 147 theme files: 111 in the original Themes area, 25 in other theme-only index sheets, seven theme-only files in mixed sheets, and four desktop theme-preview files from the audit. The total includes the three held credential shells and files whose cutover was deferred by the B1–B3 corrections.

| Lane | Files left | Est. implementer hours |
|---|---:|---:|
| FOUNDATION | 1,115 | 551 |
| Pages | 17 | 8 |
| Users, Roles, Authentication | 68 | 40 |
| Members, Newsletter | 78 | 43 |
| Commerce | 2 | 3 |
| Integrations, Providers, Email, Notifications | 114 | 66 |
| Settings, Consent, SEO, Redirects, Analytics | 131 | 55 |
| Dashboard, Activity Log, Observability | 28 | 12 |
| Deployment, Source Control, Database, Recovery, Trash, Site Backup and Export | 264 | 148 |
| Posts | 66 | 18 |
| Library, Media | 47 | 24 |
| Collections, Taxonomy | 66 | 23 |
| Menus | 28 | 10 |
| Widgets | 25 | 15 |
| Forms | 33 | 15 |
| Comments | 19 | 8 |
| Add-ons | 144 | 68 |
| Security | 40 | 30 |
| Sites, Workspace, AI Assistant | 74 | 67 |
| Desktop shell | 107 | 122 |
| Visitor chat | 13 | 28 |
| **Total** | **2,479** | **≈1,354** |

Estimates sum the surviving index rows, AX/BX estimates, SEC parity work, and the B2 work estimates. They use the original estimate for a mixed sheet with theme files removed. B3 gives ranges for proposed batches, so the hours exclude any B3 effort beyond the existing steps it amends. File counts use the plan’s production-source convention. Tests, importer edits, and the S-lane SQL moves outside the measured areas add work without adding to the file total.

## How to execute the lane lists

The source of record is `origin/plan/whats-left-1122` at `95485f9520`. Tovu is `41e948ee4a` with `ex-sh-tovu`, `ex-core-tovu`, and `ex-export-tovu` credited. Jini is READY `e4e3bf175`. Its merge-13 branch tip is `7c4ee7881`.

- A step name selects both `.J` and `.T` rows where present. Ranges select existing IDs only. The lists are ownership selectors. **Within each lane, run the selected rows in `INDEX-EXTRACTION.md` order after applying the corrections below.** Read each row’s `depends on` and its sheet’s cycle notes. Complete each Jini prerequisite before its linked Tovu repoint. For AX/BX, use the dependencies and inserted-batch order in `P9K-combined.md`, treating repeated appearances of `AX-128` and `AX-132` as single steps.
- `plans/P9-data/k-work.json` gives the exact production files by step. `plans/P9-steps/<step>.md` gives the destinations, tests, importers and repoints. Use the combined audit’s finding table for AX/BX file lists and the SEC report for the swap. The file summaries below identify those sets without reproducing the ledgers.
- The ownership rule is deterministic. Drop the theme-only steps listed below, apply the FOUNDATION shared-step overrides, and assign the remaining IDs to the feature lists. FOUNDATION owns the remaining index rows. This assigns all **955 surviving index rows, 130 AX steps and 61 BX steps**. Superseded work retains an owner and carries no second execution.
- Every feature has the same final gate. Its existing screen renders from the Jini Admin or feature entry, its routes use the feature’s Jini specs with small injected deps, and its services, contracts and feature tests live with their owners. Tovu owns the panel mount, runtime and host adapters, product copy supplied through args, and DB schema. Keep the existing Tovu route and host-binding parity tests. Delete the measured feature implementations and forwarding shells.
- Apply P9 §1 and the K recipes throughout. Move verbatim where possible, preserve why-comments and existing `_optional = {}` pads, and use the required and optional args objects for public functions. Inject custom hooks as props and cross-package implementation values through host bindings. Keep Jini server-framework- and vendor-neutral, keep shared contracts in core, and use `jini-*` classes. Function size is 50 lines warn and 80 error, with complexity ≤10.

## FOUNDATION

**Files:** Core and headless contracts, tool-metadata aggregation, common i18n, AdminKit and shell, shared HTTP and routing helpers, public rendering, composer and runtime ports, change sets, content duplication, file and asset transfer, and shared storage. The host files include `apps/admin/src/integrations/jini-kits.ts`, route mounts, and `server/runtime/**` composition.

### Order and corrected gates

| When | Existing steps and cutover |
|---|---|
| **Landed inputs** | Credit the shipped parts of `T-post-1.J` and `C-platform-html-1.J`, plus `C-contracts-core-2`, `C-presentation-1`, `D-site-export-1`, `RT-3`, and the completed SH work. Keep their outstanding callers and residual slices with the lanes below. |
| **B1 READY** | `K4-i18n-common.J` exports the common dictionary with its `typesVersions` entry. Keep the branded extras row aligned across all 21 locales. The narrowed `T-post-1.T` runs in Posts and goes before the Foundation HTML repoint. |
| **B2 READY** | Add the approval and daemon surface contracts in `K4-seam-1.J`. Run `C-platform-html-1.T` after Posts’ repoint. Delete `slug.ts` and `source-edits.ts` and their duplicate slug test. Leave the `escape.ts` slice for its compatible Jini export. Run `K4-i18n-common.T` with the original dictionary precedence and locale coverage. |
| **B3 READY** | `K4-seam-1.T` repoints approval types only. The six-rule union stays with the host evaluator. Repoint the catalog and assistant consumers and remove the moved-type shells. |
| **Route base** | Apply the `RT-K1-0.J` range correction, `settings/shared.ts:156–174`. Preserve `response.status`, `response.body`, inherited `Error.name`, and the pad. Its T half initially repoints refusal and cap users, including the Express 413 test. The deferred B8 mount cutover belongs to `RT-K1-0.T`. The exact adapter supplier for flat **returned** parse and handler errors is NOT-CHECKED. The existing `onError` path covers thrown errors. Coordinate with `BX-53/54` and gate mounts on all three error paths and the 413 response. |
| **AdminKit** | `A-K2-0a.J` and its host assignment precede `0b.J` and its host assignment. Check `Icon.name` against UI `IconName`. Gate `TabBarTab` repoints on `disabled`, `dot`, and `dotLabel`. Preserve the dock’s call-time dictionary lookup. Keep UI and chat translators distinct, pass the hook as an injected prop, preserve both factory args, and keep A2UI `path`, `fetch`, and `reportFailure` required. Finish `A-K2-0.J/.T` in the B5 slice after the structural and CSS inventories clear. |
| **Corrected shared moves** | `K4-contracts-core-5` follows approval K4 and moves the nine cleared declarations: `files-copy`, `forms`, `identity`, `mail-status`, `media`, `media-import`, `navigation`, `observability`, `pages`. Hold the six excluded declarations plus `media-generation` and its three repoints. For `A-adm-other-1`, retain the auth provider catalog and the theme CSS. Gate the collections hook on the injected prop and args pad, and preserve the email locale mutation and B5 CSS gate. |
| **Deferred seams** | `K4-seam-3` uses the B4 paired diagnostics cutover, including the diagnostics API baseline, `run-finalizer/entry.ts`, and `provider-plugins.ts`. B6 completes the paired surface and vault cutovers under `K4-seam-1`. Check the whole importer set, `activeKey()` versus `activeKey({})`, sealed records and AAD before removing old exports. Then B7 runs `K4-seam-2`, using existing core HTTP types and preserving redirects, refusal identity, DNS pinning, limits and observation. Its positional `send` caller and fake inventory is NOT-CHECKED. |
| **Remaining shared work** | Follow index order for `K4-seam-4–23`, the remaining C and contract sheets, shell/K2 sheets, mixed admin batches, and shared rendering. Run `XC-1–5`, `XC-6a–d`, and the dependent BX composer/runtime work when their prerequisites are available. `C-contracts-core-1` remains owner-held on the guard regex. `RT-1/2` remain next-major holds. Foundation owns `RN-J3/4` in the existing final-night sequence. |

### Feature steps with shared consumers

These override the feature selectors below. They move once under FOUNDATION and are prerequisites for the affected feature’s completion. Shared render and mixed screen steps can follow their feature-service prerequisites, so Foundation runs in waves.

| Feature area | FOUNDATION owns |
|---|---|
| Pages and Posts | `A-K2-pages-1–3`, `K5-pages-1`, `A-adm-posts-1`, `A-K2-posts-1`, `K5-post-1/3`, `V-post-5`, `RT-K1-adm-posts-1` |
| Identity, Members and Newsletter | `X-identity-1/2`, `A-K2-auth-1`, `A-adm-users-1`, `A-K2-users-1`, `RT-K1-pub-oauth-1`, `K5-members-1`, `K5-newsletter-2`, `V-members-3`, `RT-K1-pub-members-1/3` |
| Media, Collections and Forms | `X-media-1`, `A-K2-media-1`, `K5-media-1`, `V-media-3`, `RT-K1-adm-media-1`, `X-content-types-1`, `K5-taxonomy-1`, `A-K2-taxonomy-2`, `K5-form-destinations-1` |
| Integrations and project keys | `K5-api-connections-1/2`, `K5-custom-credentials-1–3`, `X-vendor-credentials-1`, `K5-vendor-credentials-1`, `K5-platform-mail-2`, `K5-webhooks-4`, `A-K2-integrations-1`, `A-K2-providers-1`, `K5-project-keys-1` |
| Add-ons | `X-agent-plugins-1`, `V-agent-plugins-2`, `K5-agent-plugins-4/5/6/8`, `A-K2-plugins-2`, `RT-K1-adm-plugin-hook-error-1` |
| Settings and Sites | `K5-settings-3`, `A-K2-content-analysis-1`, `K5-consent-1`, `RT-K1-pub-visitor-analytics-1`, `A-K2-webmcp-1`, `X-webmcp-1`, `K5-site-inspection-1` |
| Operations and Publishing | `K5-deployments-1/5`, `A-K2-deployment-1`, `K5-source-control-1/2`, `A-K2-source-control-1`, `K4-publish-content-2`, `K5-publish-content-1/3/4`, `A-K2-publish-content-1`, `K4-trash-2`, `A-K2-trash-1` |

Shared route sheets include `R-admin-http-1`, `R-public-http-1`, `RT-K1-adm-content-1`, `RT-K1-adm-system-1/2/3/5/6/7/10`, `RT-K1-pub-middleware-1`, `RT-K1-pub-site-1/2/4–11`, and the shared `RT-K1-pub-site-{bare-page,render,render-context,render-site,seo-render-context,site-chat-markup}*` sheets. `RT-K1-pub-site-3` is the newsletter slice.

**Audit additions.** `AX-28–34` owns common voice UI, `AX-38–41` site-create token state for admin and desktop, and `AX-81–88` shared website and desktop site preview. `BX-6`, `BX-19–23`, `BX-27`, `BX-30`, `BX-32`, and `BX-34–61` cover shared embed and composer ports, daemon/host contracts, shared user-management kit for both Users and Members, and kernel, surface, HTTP and daemon bindings. Preserve `BX-31 → BX-32`, `XC-6d → BX-43`, and the caller gates for `BX-37/38/61`.

**B2 amendments.** FOUNDATION owns the common escape/trim, error/record and manifest/i18n batches (`01/02/05/06/07/13`), dock retry and terminal scanning (`09/10`), shared controlled-dialog lifecycle and three repoints (`12`), and raw stdout for the file chooser (`15`). Replace the planned standalone dialog hook moves in `A-K2-shell-components-2`, `A-K2-media-1`, and `A-K2-pages-1`. Reuse retry and abort predicates in the dock and remove the wrapper move in `A-K2-shell-lib-5`. Preserve each dialog’s focus and dismiss behavior.

**B3 amendments.** FOUNDATION owns `J01–04`, `J06–11`, and `T02–09`, `T11–16`, `T18`, `T22`, `T24–25`, `T28`, `T32–37`. Extend `XC-3` for lazy provider catalog injection. Keep shared catalog/event types and wire identities canonical. Use existing Tovu repoint owners for the secret-pattern and guarded-reader bindings in `K5-webhooks-1` and `K5-fs-files-1`. Pair the terminal/error changes with `BX-53/54`. For other B3 groups, the audit’s proposed allowances are typically 60–110 minutes per Jini batch and 45–110 minutes per Tovu batch. The unresolved Tovu candidate inventory remains a dispatch gap.

**Done when:** the shared kit, contracts, transport, and composers bind through the host, downstream lanes can render and mount through their normal entries, and every retained shared-file edit is composition, product policy, or a documented hold.

## Pages — `pages`

**Steps:** `A-adm-pages-1`, `X-pages-1`, `RT-K1-adm-pages-1/2`. Files include `A/features/pages`, `W/features/pages`, and the Pages admin routes. Needs the shared Pages editor/controller sheets, post editor and slug helpers, admin content route deps, AdminKit, and B2 dialog lifecycle. **Done when:** the Pages list and editor render from Jini, including body editing and theme-backed template selection and preview through host props.

## Users, Roles, Authentication — `users`, `roles`, `authentication`

**Steps:** `K5-identity-1/2`, `A-adm-roles-1`, `A-K2-roles-1/2`, `A-K2-authentication-1`, `RT-K1-adm-{api-keys-1/2,users-1–9,owner-mfa-deps-1,owner-mfa-routes-1,owner-passkey-routes-1,owner-recovery-routes-1}`. Files cover admin auth and role UI, identity services, user/key routes, and owner sign-in endpoints. Needs the shared login, users, OAuth and identity rows, `BX-39–42`, K1/K2, and approval contracts. **Done when:** the screens and sign-in flows use the injected Jini user-management kit, with permission, issuer and owner-auth parity. The Tovu provider catalog is supplied by the host.

## Members, Newsletter — `members`, `newsletter`

**Steps:** `K5-members-2`, `K5-member-login-1`, `K5-newsletter-1/3`, `A-adm-members-1`, `A-K2-members-1`, `RT-K1-adm-members-1/2`, `RT-K1-adm-newsletter-1–7`, `RT-K1-pub-members-2/4–6`, `RT-K1-pub-site-3`. Files include `A/features/members`, `W/features/{members,member-login,newsletter}` and their admin/public routes. Needs shared members and newsletter rows, user-management kit, mail contracts, credential bindings and the shared visitor analytics route. **Done when:** Members mounts from Jini, member login and newsletter confirmation/unsubscribe use injected routes and mail services, and the existing Newsletter placeholder still routes correctly.

## Commerce — `orders`, `products`, `subscriptions`, `billing`

**Steps:** `RT-K1-adm-commerce-1` and `RT-K1-pub-commerce-1`. The planned files are the admin status and public purchase handlers. Needs shared member ports, the product checkout and storefront slices in Foundation’s public renderer, and `K4-seam-22`. **Done when:** Jini’s existing commerce runtime serves the host-mounted status, purchase and storefront flows with settlement parity. All four panel IDs currently render placeholders. Screen creation has no extraction step.

## Integrations, Providers, Email, Notifications — `integrations`, `providers`, `email`, `notifications`

**Steps:** `SH-3`, `S6b`, `A-K2-email-1/2`, `K5-platform-mail-1`, `K5-custom-credentials-4`, `K5-mail-1`, `K5-mail-status-1/2`, `K5-email-templates-1`, `X-mail-status-1`, `X-external-mcp-1`, `K5-external-mcp-1–4`, `X-webhooks-1`, `K5-webhooks-1–3`, `RT-K1-adm-{integrations-1/2,external-mcp-1–5,email-templates-1,system-9}`, `RT-K1-pub-{api-connections-1,external-mcp-1,mail-feedback-1}`. Files cover providers and mail UI, webhook SQL and services, credential integrations, external MCP and mail routes. Needs the shared Providers and Integrations screens, API connections, credential and vault seams, and shared system route batches.

B2-11 binds email debounce through the kit. B3 `T26/27/29` owns MCP confirmation, registration, federation/reload, and OAuth endpoint/error injection. `SH-3` waits on the owner’s test-block decision, then repoints the test’s direct store and vault imports and deletes the three shells. **Done when:** provider and email flows render from Jini, retired integration and notification links still resolve, and credential/webhook/MCP and delivery behavior are preserved through host bindings.

## Settings, Consent, SEO, Redirects, Analytics — `settings`, `admin-ui`, `admin-appearance`, `design-system`, `consent`, `seo`, `redirects`, `analytics`

**Steps:** `X-settings-1`, `K5-settings-1/2/4`, `A-K2-settings-1–4`, `A-K2-consent-1`, `A-K2-seo-1`, `A-K2-redirects-1`, `A-K2-analytics-1`, `X-analytics-1`, `K5-analytics-1`, `X-site-search-1`, `K5-site-search-1`, `X-redirects-1`, `K5-redirects-1`, `X-seo-1`, `K5-seo-1`, `RT-K1-adm-{settings-1/2,consent-1,seo-1/2,redirects-1/2,analytics-1}`, `RT-K1-pub-middleware-2`. Files cover admin settings and privacy controls, search and SEO helpers, redirect tables/adapters, and analytics. Needs K1 settings parity, K2 appearance and locale slots, shared settings/consent and public render sheets, workspace and browser-agent settings slots. B3 `J05` injects XML escaping for feed and sitemap rendering. **Done when:** the settings and marketing screens render from Jini and retain settings readiness, event-stream behavior, privacy gating, and deep links. The existing `AdminUi` wrapper has no complete extraction sheet. Its generic remainder is NOT-CHECKED.

## Dashboard, Activity Log, Observability — `dashboard`, `activity-log`, `observability`

**Steps:** `AX-12–14`, `A-K2-observability-1`, `K5-observability-1`, `K5-server-logs-1`, `K5-tool-audit-1`, `RT-K1-pub-ops-1`. Files include Dashboard views/rules/hooks, observability tabs and server-log and tool-audit implementations. Needs `K4-seam-3`, the shared system telemetry/status routes, AdminKit, and B3 disclosure binding. **Done when:** stats, activity ordering, health and recent errors render from Jini with host readers and links. Activity Log retains its existing placeholder route.

## Deployment, Source Control, Database, Recovery, Trash, Site Backup and Export — `deployment`, `source-control`, `database`, `recovery`, `trash`, `import-export`

**Steps:** `A-adm-{deployment,publish-content,recovery,source-control}-1`, `A-K2-{import-export-1,database-1,deployment-2,recovery-1}`, `K5-deployments-2/3/4/6/7`, `K5-source-control-3`, `K5-domain-dns-1`, `K5-database-1`, `X-database-transfer-1`, `K5-database-transfer-1/2`, `K5-recovery-1`, `X-trash-1`, `K5-trash-1`, `X-permanent-delete-1`, `K5-permanent-delete-1`, `K5-site-backup-1–8`, `K5-site-export-1/2`, `K5-publish-content-5/6`, `K5-publish-content-ui-1`, `P-publish-trust-1`, `K5-publish-trust-1`, `RT-K1-adm-{publish-content-1–6,database-1/2,database-recovery-1,recovery-1/2,trash-1,system-8/11/12/13/15}`, `RT-K1-pub-{publish-trust-1,site-share-1}`, and `AX-15–25`.

Files include deployment and database screens, publish UI and trust, site-transfer forms/controllers, backup/export/share and recovery services, and operation routes. Needs the shared deployment and source-control API slices, publish contracts, trash contracts and screen, mail/credential/vault seams, and media ports. B2 `03/04/08` binds compatible byte formatting, hashing and traced fetch. B3 `T17/21` binds transfer/schema operations and DNS/export operations. **Done when:** all six panels render Jini features, and publish, transfer, and restore preserve operation settlement and host credential behavior. The exporter accepts theme data and preview operations through injected ports.

## Posts — `posts`

**Steps:** early `T-post-1.T`, then remaining `T-post-1` scope at the corrected B9 gate, `A-adm-posts-2`, `A-K2-posts-2/3`, `K5-post-2/4/6`, `RT-K1-adm-posts-2`. The early cutover deletes the landed hook/slug/rendering copies and duplicate slug test. The schema and metadata tail waits on its Jini exports and the approval seam. Files include `W/features/post`, `A/features/posts`, and post editor routes. Needs shared post and page editor bits, HTML source edits, publish metadata and public render helpers. **Done when:** the Posts list, editor and preview use Jini and preserve template choice, autosave and post URL behavior.

## Library, Media — `library`, `media`

**Steps:** `K5-media-2/4`, `K5-media-generation-1`, `K5-media-import-1`, `X-image-transform-1`, `K4-image-transform-1`, `A-K2-media-2`, `A-K2-library-1`, `RT-K1-adm-media-2–4`, and off-index `S7b.J/.T` after `X-media-1`. Files include the asset library and document UI, upload, rendition, generation/import and transform services, and `platform/db/repos/media-repo.ts`. Needs shared media/API/modal work, asset transfer, content-type store, and the B2 dialog lifecycle. **Done when:** both panels render from Jini, upload and replacement preserve concurrency behavior, and SQL binds the host’s existing tables.

## Collections, Taxonomy — `collections`, `taxonomy`

**Steps:** `X-entries-1`, `K5-entries-1`, `K5-content-types-1`, `A-K2-collections-1/2`, `A-K2-taxonomy-1`, `RT-K1-adm-content-types-1/2`, `RT-K1-adm-entries-1`, `RT-K1-adm-taxonomy-1–3`. Files include the collection/entry editors, taxonomy dialogs and term and schema services/routes. Needs shared taxonomy and content-type rows, publish and trash contracts, and the corrected collection hook in `A-adm-other-1`. **Done when:** collection and taxonomy screens render from Jini, with entry edits, term merge and deletion preserving the injected operations.

## Menus — `menus`

**Steps:** `X-navigation-1`, `K5-navigation-1`, `A-K2-menus-1`, `RT-K1-adm-menus-1/2`. Files include the menu tree/editor, navigation service and routes. Needs shared routing, publish contracts, menu row helpers in the mixed admin sheets, and the common escaping and rendering ports. **Done when:** menu editing mounts from Jini and persisted links and public menu rendering retain their behavior.

## Widgets — `widgets`

**Steps:** `X-widgets-1`, `K5-widgets-1`, `A-K2-widgets-1`, `RT-K1-adm-widgets-1–4`. Files include widget definitions and persistence, the Widgets screen, and preview/CRUD routes. Needs shared media, post/content types, kit pickers, publishing and public rendering. **Done when:** Jini renders the editor and preview, with the host supplying active theme and fragment rendering.

## Forms — `forms`

**Steps:** `X-forms-1`, `X-form-destinations-1`, `K5-forms-1`, `A-K2-forms-1`, `RT-K1-adm-forms-1–3`. Files include forms UI, form/destination services and routes. Needs `K5-form-destinations-1`, shared public multipart/admission/submission and feedback sheets, mail/delivery contracts, and B2 trimming. B3 `T10` binds manifest normalization and feedback rendering. **Done when:** the builder and destination UI render from Jini and public submission preserves admission, multipart and feedback parity.

## Comments — `comments`

**Steps:** `A-K2-comments-1`, `K5-comments-1/2`, `RT-K1-adm-comments-1/2`. Files include comment moderation, comment services, and admin routes. Needs shared public comment submission/rendering, `K4-seam-8`, and settings and trash ports. **Done when:** moderation renders from Jini and visitor submission and moderation retain the host’s current route behavior.

## Add-ons — `plugins`, `agent-plugins`, `skills`

**Steps:** `K4-plugins-1`, `X-plugin-runtime-1`, `K5-plugin-runtime-1–3`, `K5-agent-plugins-1/3/7`, `X-skills-1`, `K5-skills-1`, `A-K2-plugins-1/3/4`, `A-K2-skills-1`, `RT-K1-adm-{plugins-1–5,agent-plugins-1–5,skills-1/2}`, `RT-K1-pub-{agent-plugin-surfaces-1,plugin-contributions-1}`, `BX-24–26`. Files include the install and inventory screens, runtime hooks, contributions, skill management and `packages/sdk/src/{content-contracts,index,hooks}.ts`. Needs shared catalog, lifecycle and agent-plugin surface contracts, token state, provider ports and K2 kit. Own `RN-J1`, `RN-T1`, `RN-J2` in that order before Foundation’s `RN-J3/4`. **Done when:** all three screens render from Jini and install, contributions and SDK callbacks preserve their existing behavior and public ABI.

## Security — `access-tokens`

**Steps:** completed `SEC-0` → Jini `SEC-1–15` in report order → `SEC-T1`. The four screen-move sheets `SEC-adm-security-1`, `A-K2-security-1–3` belong here and are superseded by parity. `RT-K1-adm-system-4` owns the one site-key route in the measured count beyond the 39 screen files. Needs `A-adm-shell-lib-3`, shared credential and deployment/source-control API contracts, project keys, the vault seam, and the owner auth routes from Users.

**Done when:** the existing `access-tokens` route and both tabs mount `@jini-ai/admin/security/react`, including owner TOTP/passkeys/recovery/reset, human-only site-key reveal and recovery, Shared Keys and grants, and all credential-store behaviors. Repoint the seven Deployment source imports and 15 test imports from SEC-0, plus the lazy route assertion and refresh/autocomplete fixtures. Delete all 39 Security sources only after the linked parity gate. The swap remains blocked on that gate.

## Sites, Workspace, AI Assistant — `sites`, `workspace`, `ai-assistant`, `playground`

**Steps:** `AX-1–11`, `AX-26/27`, `AX-35–37`, `AX-42–45`, `BX-28/29/33`, `K5-origin-1`, `K5-site-inspection-2`, `K5-webmcp-1`, `K5-web-screenshot-1/2`, `X-workspace-1`, `K5-workspace-1`, `RT-K1-adm-{assistant-1–6,sites-1/2,workspace-1/2,system-14}`. Files include reusable assistant settings, execution and credential/tool panels, sites list/trash/onboarding, Workspace settings, site inspection and browser operations, plus site-directory write bindings. Needs shared site preview and token state, voice and composer ports, workspace DTOs, route base, and the Settings workspace slot. B3 `T01/23/31` covers assistant dialogs, evidence capture ports, and site-directory/registry bindings. **Done when:** the audited views mount Jini features with host rollout, starter, site-identity and policy inputs. The `workspace` alias still routes to the Settings tab. Playground’s shared bus is covered by shell work. The remaining Playground implementation has no complete extraction sheet.

## Desktop shell

**Steps:** `DT-desktop-1`, `K5-desktop-1`, `AX-46–80`, `AX-89–125`, `AX-128–132`, including `AX-132 → AX-103`. Files cover Electron bridges and find/zoom/update UI, durable storage, conversation and resource support, window/guest lifecycle, packaging, supervisor and IPC helpers. Needs shared daemon and resource contracts, site preview and token adapters, chat composer and surfaces, and sidecar seams. B2-14 binds durable JSON across the desktop consumers. B3 `T19/20/30` covers usability, toolchain and packaging, and the directory lifecycle. **Done when:** the desktop shell uses those Jini entries with injected host services, preserving deployed channels, persistence, updater and guest lifecycle behavior. The desktop theme-preview registration and transport stay with the host.

## Visitor chat

**Steps:** `BX-1–5`, `BX-7–18`, `BX-31`, `RT-K1-pub-site-assistant-confirm-1`. Files include `apps/site-chat` transport and session storage, widget activation and loader, confirmation UI/lifecycle, visitor page-control and path policy, plus bundle measurement. Needs shared site-chat markup, `BX-6`, `BX-34–36`, `BX-47/49/59`, and the terminal/response contracts. `BX-8` waits for `BX-13/15` and the shared composer/surface steps named in the audit. **Done when:** React and vanilla host entries render the Jini embed and preserve transport settlement, legacy session reads, explicit confirmation and visitor DOM-effect ordering. The host supplies visitor admission, IDs, product copy, slots and mount configuration.

## Lane order and parallelism

1. Start with the FOUNDATION route, kit, contract and shell slices needed for Pages and identity. Take the already-cleared Posts repoint early because Foundation’s HTML repoint depends on it.
2. Finish **Pages**, then **Users/Roles/Authentication** and **Members/Newsletter**. Pull forward their shared kit, mail and editor prerequisites.
3. Finish **Commerce** after the member and storefront prerequisites. Then prioritize **Integrations**, **Settings**, **Dashboard**, and **Deployment**.
4. Finish **Posts**, **Library/Media**, **Collections/Taxonomy**, **Menus**, **Widgets**, **Forms**, **Comments**, and **Add-ons** as their shared services clear. Run **Security**’s Jini parity work alongside the operations work when the write sets permit, and put its Tovu swap after parity and the shared credential bindings. Finish **Sites/Workspace/AI Assistant**, **Desktop**, and **Visitor chat** as the composer and runtime cutovers clear.

**One complete admin lane can run at a time under a strict no-shared-files rule.** Each admin cutover touches `panels.tsx`, and many write the same Admin or CMS manifest and API baseline. The workable parallel unit is an individual ready step. Use **up to six concurrent steps** as in P9K, with one writer per manifest/API baseline and disjoint source **and importer** paths. Chat transport, user-management kit, desktop-host, diagnostics, and devops can have separate Jini writers once their prerequisites clear. Serialize `panels.tsx`, `jini-kits.ts`, shared route registrars, composition roots, tool-metadata aggregator, lockfiles, and the B1/B2 dev-lite source scan. The revised lane schedule has no verified wall-clock estimate.

## Themes — STAYS

| Dropped work | Files |
|---|---:|
| `T-theme-1`, `A-adm-themes-1`, `A-K2-themes-1/2`, `K5-theme-1–5/7`, `V-theme-6`. `T-theme-2` was already superseded. | 111 |
| `A-K2-admin-themes-1`, `K5-presentation-1`, `RT-K1-adm-themes-1/2`, `RT-K1-adm-presentation-1`, `RT-K1-pub-middleware-3`, `RT-K1-pub-site-{handlebars-render,handlebars-sandbox,handlebars-worker,liquid-render,liquid-sandbox,liquid-worker,worker-sandbox}-1` | 25 |
| Mixed-sheet removals listed below | 7 |
| `AX-126/127` desktop theme-preview revision transport | 4 |
| **Total** | **147** |

The seven mixed-sheet files are `A/features/admin-themes/admin-themes.css` from `A-adm-other-1`, `theme-content-security-headers.ts` from `R-public-http-1`, `render-theme-override.ts`, `theme-asset-dirs.ts`, and `theme-preview-static.ts` from `RT-K1-pub-middleware-1`, and `theme-preview-report.ts` and `theme-preview-manifest.ts` from `K5-site-export-1/2`. The screen and its `appearance` alias, theme files, validation, engine workers, active-theme administration and preview stay in Tovu. Keep theme tests with those sources. Shared K4 steps retain their other consumers and use structural contracts at theme boundaries.

### Theme edges the host supplies

| Jini-bound consumer | Tovu binding or structural boundary |
|---|---|
| `A-K2-pages-1–3`, `A-K2-posts-1–3`, `A-K2-shell-components-5` | `ThemeTier`, presentation summary/settings, `themesApi`, theme-page queries and `NO_THEME_ID`. Inject `resolveThemeLayout` in template-source and canvas styling. Inject `useThemePreviewFrame` and the reload button into PageEditor, PostPreviewFrame and PostEditorToolbarEnd. Keep theme-page styling with the host. |
| `A-K2-shell-lib-6`, `RT-K1-adm-settings-1` | Bind theme-preview refresh publication, reserved-path validation, refresh reads, and the preview event feed used by settings events. |
| `A-K2-authentication-1`, `email-2`, `media-2`, `observability-1`, `plugins-4`, `providers-1`, `settings-2–4`, `skills-1`, `shell-hooks-2`, and `AX-5/6` | Supply `useAdminThemeBoundary` and `useAdminThemeState` where used. `AdminAppearance` also receives the scheme control, theme/accent lookup and preview defaults. `AX-12–14` receives Dashboard’s theme/presentation reader. `AX-24/25` receives the export roster and active/default selection. |
| `K5-pages-1`, `K5-post-6`, `RT-K1-adm-posts-2`, `RT-K1-adm-widgets-4`, `K5-site-inspection-1` | Bind active theme and presentation reads, roster/sync, template applicability/branch selection, bare-page choice, and fragment rendering where used. Pass narrow theme IDs and result data into Jini. |
| `K4-asset-transfer-1`, `K4-image-transform-1`, `K5-plugin-runtime-1`, `K5-contracts-core-8` | Bind theme file lookup, writable/containment and reload operations, import size/type/accept policy, shape-refusal mapping, default slots, and the theme metadata contribution. |
| `K5-deployments-5`, `K5-site-backup-1/4/7`, `K5-site-export-1/2` | Bind public page security headers, theme identity and source validation, `loadTheme`, original source selection, standalone-page resolution, layout, preview manifest construction and export-size reporting. |
| `RT-K1-pub-middleware-1/2` | Bind themed document headers, visitor-page publication and active-theme lookup for consent. The theme override and theme asset and preview middleware are mounted by Tovu. |
| `RT-K1-pub-site-render-1–3`, `RT-K1-pub-site-render-site-1` | Bind entry-list markup settings, image/author projection, token aliases, fonts, template ID resolution, static rendering, and bounded Liquid/Handlebars rendering. Supply structural template-node, theme, menu and media result shapes. |
| `RT-K1-pub-site-5/7/8/9/10/11` | Bind static menu scanning, post-preview and pagination helpers, entry markers, featured-image projection, theme slots, static rendering, title/entity injection, template selection, token stylesheet marker, and active/render-theme resolution for home, post, virtual page, slug and product handlers. |
| Desktop workspace consuming theme preview | Bind `subscribeWorkspaceThemePreview` from the retained desktop bridge, including revision, cleanup and reload behavior. |

The edge list covers the surviving index dependencies on dropped theme steps and the direct imports found in the targeted reads. Dynamic and barrel-only edges across the full tree remain NOT-CHECKED. The 2,479 figure also precedes the full review of old non-theme STAYS entries against the wiring-only decision. `P-publish-content-ui-1`’s retained policy slice, the Admin UI and Playground gaps, STOP-held metadata, and the deferred cutover inventories are assigned above where there is an existing owner. They have no verified zero-files-left path in the supplied plan. The review stayed within the lookup cap and made no file changes, installs, builds, tests or type-checks.
