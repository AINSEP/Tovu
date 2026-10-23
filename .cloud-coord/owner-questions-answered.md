Software Architect + Programmer (Direct): chosen to check the product and safety decisions against current code and make only tiny, low-risk fixes; both persona files were loaded.

# Answers to the cloud reports' owner questions

Reviewed 2026-10-22 on `codex/nonui-2026-10-22`. These are recommendations for the coordinator, not a claim that the owner has approved new policies. Repeated questions are answered once. Sources below identify the remote reports; current source takes precedence over an older report.

Paths starting `apps/` or `content/` are in this clone. `../jini-int/` means the sibling Jini checkout, which was read but never edited. Installed Jini packages inspected here link to that checkout; `@jini-ai/search` is currently missing from this clone's `node_modules`, although its source exists next door. No graph tools were available, so evidence came from direct source reads. Architecture chapters 13/14 and project memory were read from `/Users/la/Programming/Tovu/ADS-memory/` because those files are absent here. Missing local governance records cannot be treated as permission to change their decisions.

Three small fixes were made: comments-provider refusals now use a permission error; duplicate sites keep their saved timezone; desktop request methods cannot inherit object properties. Tests were edited but **none were run**, as requested. Git was only read. Other work already present in this shared checkout was left alone.

## 1. Should uploads allow symbolic links to other folders?

**Today:** `../jini-int/packages/platform/src/object-store/local-fs.ts:73` resolves the real root and parent folder; `:120` rejects a linked final file. Contrary to providers-a's wording, a folder link whose target stays inside the root is allowed; one escaping the root is refused. **Answer:** keep this boundary: owners may relocate the uploads root, but an upload must not reach private files elsewhere. **Smallest change:** none; keep Jini's existing checks and containment tests. Do not add a Tovu copy. [providers-a]

## 2. Should an interrupted webhook be resent immediately after restart?

**Today:** `../jini-int/packages/integrations/src/webhooks/delivery.ts:217` releases work not yet sent; `:306` counts a started request and schedules its normal delayed retry. The receiver might already have accepted it. **Answer:** keep the delay and the same delivery identity; immediate retries make duplicate actions more likely. **Smallest change:** none. Keep the current attempt count and recovery tests. This concerns outbound webhooks, not a mail provider. [providers-a]

## 3. Should analytics hide phone numbers and private identifiers in page addresses?

**Today:** `../jini-int/packages/analytics/src/ingest.ts:70` hides email-shaped path parts, including encoded ones; `../jini-int/packages/analytics/src/forwarding.ts:64` applies that before forwarding. It does not generally hide phone numbers, account IDs or secret links. **Answer:** yes: send known public route shapes and explicitly allowed event fields; do not try to recognize every private value with a broad number pattern. **Smallest change:** extend Jini's existing export filter with route/field rules and privacy tests. Deferred: a shared privacy contract, beyond a tiny safe edit. [providers-a]

## 4. Should manual DNS automatically replace or delete conflicting records?

**Today:** `../jini-int/packages/devops/src/dns/manual.ts:155` reads public answers without assigning ownership; `../jini-int/packages/devops/src/dns/plan.ts:163` refuses replacement of records not marked as ours. Non-conflicting additions and value merges remain possible. **Answer:** keep conflicts for human review; guessing ownership could break an owner's website or email. **Smallest change:** none to the protection. A later instructions improvement can name the exact conflict and offer a recheck after the owner changes it. No UI work here. [providers-b]

## 5. Can search assume that only one process serves a site?

**Today:** `apps/website/src/server/runtime/composition/modules/site-search.ts:368` coordinates work within one runtime; `../jini-int/packages/search/src/indexer.ts:398` reads and then assigns the next index generation. This is not a lock shared by separate servers. No universal one-server guarantee was found. **Answer:** permit only one search writer per site for now; owners should not have to diagnose competing rebuilds. **Smallest change:** enforce a database-backed writer lease and atomic generation allocation in Jini before allowing multiple writers. Deferred: shared concurrency and restart behavior need dedicated tests. [providers-b, merge]

## 6. Should owners be able to invent extra cookie-consent categories?

**Today:** `../jini-int/packages/cms/src/consent/types.ts:2` defines necessary, functional, analytics and marketing; `apps/website/src/features/consent/validation.ts:17` rejects extra configuration fields. **Answer:** keep those four categories and explain what belongs in each. A custom label must not imply that scripts are blocked when the engine cannot enforce it. **Smallest change:** none. Custom categories would require coordinated changes to choices, saved receipts, script blocking and the editor in Jini first. No standalone report question was found; included because the brief explicitly names it. [merge2, brief]

## 7. Should an outside analytics service receive the daily visitor identifier?

**Today:** `../jini-int/packages/analytics/src/forwarding.ts:66` includes `visitorHash`; `../jini-int/packages/analytics/src/ingest.ts:333` derives it from the daily salt and coarse request signals. **Answer:** omit it by default for outside services; enable it only when the owner deliberately needs unique-visitor counts and the visitor permits forwarding. A changing hash is still a linking value. **Smallest change:** add an opt-in field to the shared forwarded-hit contract and its existing mapper. Deferred: changing that contract without updating consumers is not a safe one-line deletion. [analytics]

## 8. Should disabling the consent banner allow outside analytics forwarding?

**Today:** `apps/website/src/server/runtime/composition/analytics-providers.ts:81` reads the engine's analytics choice; `../jini-int/packages/cms/src/consent/express/index.ts:225` grants choices when consent is disabled. **Answer:** keep local statistics separate, but require a positive visitor choice before optional outside forwarding. Turning a banner off should not silently grant outside tracking. **Smallest change:** extend the existing consent result to distinguish “disabled” from “visitor agreed,” then use it in the forwarder. Deferred: shared consent behavior and compatibility tests are required. This is a product privacy recommendation, not a legal compliance determination. [analytics]

## 9. Should logged-in browser access remain owner-only?

**Today:** `apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:43` requires the owner, the preference and runtime support; `apps/website/src/assistant/runtime-preferences.ts:23` now defaults the preference on. **Answer:** retain owner-only access; another administrator must not inherit the owner's logged-in browser sessions. **Smallest change:** none. Keep explicit off respected. [assistant, merge2]

## 10. Should list and search reads be grouped into batches?

**Today:** `apps/website/src/assistant/batch-tool-inputs.ts:115` delegates eligibility to Jini's existing batch mechanism, whose structural rules exempt reads with no required input. **Answer:** keep these reads separate; a single list/search already returns many items and is easier to understand. **Smallest change:** none; batch reads by individual record ID where supported. [assistant]

## 11. Should several actions share one approval card?

**Today:** `apps/website/src/assistant/batch-tool-inputs.ts:50` excludes actions that ask once per call; `:64` already recognizes the combined permanent-delete plan. **Answer:** keep separate approvals until the existing combined-plan mechanism can show every proposed effect and bind approval to that exact list. **Smallest change:** extend that owner in Jini and its Tovu adapters, rather than loop through individual cards. Deferred: approval semantics and UI exceed this job. [assistant]

## 12. Should a static export keep a comment form that cannot submit?

**Today:** this report is stale: `apps/website/src/server/inbound/public-http/routes/site/pages.ts:2724` removes the comments provider for static export requests, leaving an empty surface rather than a form or a frozen thread. **Answer:** keep that behavior. It avoids a broken form and prevents an exported copy from permanently retaining a comment later removed by moderation. **Smallest change:** none; keep the static-export regression test. A hosted comments option would need a separately approved provider, not a dead local form. [comments]

## 13. Should old posts have a real publication date for closing comments?

**Today:** `apps/website/src/features/comments/comment-targets.ts:25` returns no publication timestamp for legacy posts, so age-based closing cannot apply. **Answer:** add a trustworthy first-publication date; do not guess from the latest edit time or suddenly close old conversations. **Smallest change:** store the date on publication, migrate only known dates, and explain the unknown case. Deferred: stored data and migration policy. [comments]

## 14. Should visitors get a reply button on public comments?

**Today:** `apps/website/src/features/comments/public-markers.ts:1` adapts the shared renderer; `apps/website/src/server/inbound/public-http/routes/site/comments-submit.ts:1` handles submissions. The report's public form has no parent selector, while reply support exists behind the service/API. **Answer:** keep public comments flat in this release; add replies as a separately tested visitor flow. **Smallest change:** connect the renderer's reply choice to the existing parent ID validation, with an accessible cancel action. Deferred: UI work. [comments]

## 15. Should pages containing live comments always avoid shared caching?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/pages.ts:2756` detects comment-bearing pages and applies private/no-store caching. **Answer:** yes while comments are rendered into the page; safe moderation and member-specific output matter more than caching an empty thread. **Smallest change:** none now. A future change should make the existing renderer report when it emits no live surface, then test anonymous and member responses before allowing caching. [verify]

## 16. Should a general settings reset be able to reactivate comments?

**Today:** `apps/website/src/features/settings/site-title-write.ts:122` refuses a reset containing the provider setting, including global definitions and aliases. **Answer:** keep that refusal; changing the provider belongs to the explicit comments approval flow. **Smallest change:** none. A workspace reset containing no such definition can still succeed without changing the provider. [content, merge]

## 17. Should a forbidden comments-provider write return the same permission error as clear and reset?

**Today after this patch:** `apps/website/src/features/settings/site-title-write.ts:86` throws the existing `ForbiddenError`; `../jini-int/packages/core/src/settings/express/http.ts:21` maps it to HTTP 403. **Answer:** yes; the value is not malformed, the general write path lacks approval. **Smallest change made:** replace the error class, keep the reason and approval check, update the service assertion, and add an HTTP assertion that comments remain disabled. No approval rule changed. [content]

## 18. Which email setup should a fresh owner see first?

**Today:** `apps/website/src/features/settings/mail-provider.ts:11` stores an explicit provider for each mail lane; unset/unconfigured is not a promise that mail will send. **Answer:** offer one guided “Connect email” flow that reuses an already-connected working provider, then shows available trusted plugins; keep SMTP as an advanced choice. Do not hard-code a company into core. **Smallest change:** drive onboarding from the existing provider catalogue and a test-send result. Deferred: UI and protected mail wiring. [email]

## 19. May the assistant delete DNS records?

**Today:** `../jini-int/packages/devops/src/dns/approval.ts:1` owns DNS approval; `../jini-int/packages/devops/src/dns/plan.ts:163` permits replacement only for owned records. The report says applying provider changes is still separate work. **Answer:** a person must approve an exact deletion plan; the assistant must never independently remove unknown records. **Smallest change:** retain that gate; future apply support must reuse the existing approval digest and ownership checks. Deferred: irreversible external changes, not a tiny fix. [email]

## 20. Is bulk email reserved for newsletters?

**Today:** `../jini-int/packages/platform/src/mail/policy.ts:59` selects bulk by message purpose, and `:101` requires one-click unsubscribe headers. It is not technically tied to the newsletter feature. **Answer:** allow any legitimate subscription-message feature that supplies the same unsubscribe and suppression behavior; ordinary sign-in links stay transactional. **Smallest change:** none to the rule; future callers reuse the current policy and newsletter unsubscribe owner. [email]

## 21. Should captured test emails expire automatically?

**Today:** `apps/website/src/features/mail/capture.repo.ts:43` saves full messages and `:49` lists a bounded window; no expiry operation exists there. Messages can contain sign-in links. **Answer:** yes: default to deleting captures after 24 hours, with a clear-all action; never retain login previews indefinitely. **Smallest change:** add a bounded purge operation to the existing mail repository and call it from the maintenance lifecycle. Deferred: cleanup scheduling, both database adapters and test coverage make this more than a safe local edit. [email]

## 22. Should the webhook worker send in production while webhook routes are disabled?

**Today:** `apps/website/src/server/runtime/composition/serving-app.ts:99` starts the worker without a mode gate; `apps/website/src/server/runtime/boot/production-readiness-gate.ts:186` still refuses production webhook routes. **Answer:** apply the same approved capability decision to both; until REQ-07 is superseded, do not silently begin sending old subscriptions. **Smallest change:** have composition consult the existing capability gate before starting the worker. Deferred to Coordinator: changing production delivery is a rollout decision, even if the conditional is short. [provfix]

## 23. Should abandoned webhook claims be recovered?

**Today:** this has been fixed since the provfix report: `../jini-int/packages/integrations/src/webhooks/ports.ts:49` defines expiring claims; `../jini-int/packages/integrations/src/webhooks/delivery.ts:213` supplies the lease on every claim. **Answer:** keep recovery after expiry and protect the outcome with the claimed attempt number. **Smallest change:** none; a second sweep would duplicate existing ownership. The timestamp's meaning depends on whether a delivery is waiting or in progress, as the port documents. [provfix, providers-a]

## 24. Should local development bypass private-address restrictions for webhooks and search?

**Today:** `apps/website/src/server/runtime/composition/webhook-delivery-worker.ts:53` requires a guarded HTTPS client; `apps/website/src/server/runtime/composition/modules/site-search.ts:20` consumes the guarded HTTP port. **Answer:** keep public production connections protected. Development may explicitly inject a narrowly allowed local client; do not globally allow private addresses or retry a permanently forbidden destination forever. **Smallest change:** add a development-only port binding with exact destinations and an early configuration refusal. Deferred: shared egress/security policy, not a URL exception in core. [provfix, search]

## 25. Should sender settings have validation, an editor and publication support?

**Today:** `apps/website/src/features/settings/mail-sender.ts:15` defines sender email/name; `:43` reads nonblank strings. `apps/website/src/features/settings/publish-content.ts:47` has no mail sender entry. **Answer:** validate the address and header-safe name and provide guided setup, but keep sender/provider settings local to each live site. Publishing content must not accidentally switch email identity. **Smallest change:** reuse Jini's mail validators at the existing settings boundary; add the editor separately. Deferred: protected mail work and UI. Do not add these settings to the publication list. [provfix]

## 26. May newsletter confirmations send without the background-mail durability check?

**Today:** `apps/website/src/features/newsletter/confirmation.ts:1` sends confirmation mail; `../jini-int/packages/platform/src/mail/purpose-scoped-mailer.ts:47` applies that check only to the notification lane. **Answer:** yes for the immediate user-requested confirmation, with honest failure and a safe retry path; queued campaigns still require durable work records. **Smallest change:** none to lane classification. Add focused retry/repeat-request tests before changing reliability promises. [provfix]

## 27. Should missing sender setup fail, and should a missing display name use the site title?

**Today:** `../jini-int/packages/platform/src/mail/sender-identity.ts:77` already falls back to the caller's display name; `:81` refuses a real sender without a configured address. **Answer:** keep that refusal and show the owner a setup problem before public signup is enabled. Use the site title where the caller supplies it, without inventing a deliverable address. **Smallest change:** no resolver change; add readiness guidance and audit caller names. Deferred: protected mail/UI scope. Public responses should remain the same for known and unknown addresses. [provfix]

## 28. Should every provider registry adopt one new identifier format?

**Today:** `apps/website/src/features/agent-plugins/search-provider-registry.ts:1` owns search contributions; `../jini-int/packages/commerce/src/payments/provider-registry.ts:1` owns payment providers. The merge report identifies established visitor-auth/OAuth/payment identifiers with punctuation. **Answer:** keep valid existing IDs; share validation only where contracts actually agree. **Smallest change:** document each registry's accepted IDs and add compatibility tests before a common validator. Deferred to Coordinator: no mass rename of saved identifiers and no new parallel registry. [provfix, merge]

## 29. Should one DNS request be silently split between zones?

**Today:** `apps/website/src/features/domain-dns/dns-changes.ts:180` checks the authority of requested names rather than assuming a parent domain owns them all. **Answer:** keep mixed-zone changes refused and clearly identify the separate zones. One approval must not quietly authorize changes at another DNS host. **Smallest change:** none to the refusal; later offer one separate reviewed plan per zone. Deferred: multi-plan UI and approval behavior. [providers-b]

## 30. Should an email event's creation time also schedule its retry?

**Today:** `apps/website/src/features/newsletter/send-pipeline.ts:563` explicitly uses the continuation event's `occurredAt` as its future due time. **Answer:** separate “when this happened” from “when to run it”; owners should see honest history and dependable retry timing. **Smallest change:** add an optional due time to Jini's existing outbox enqueue contract, defaulting to current behavior, then migrate this caller. Deferred: shared queue contract and adapter tests. [providers-b]

## 31. Should disabling a search plugin remove it immediately from status?

**Today:** `apps/website/src/server/runtime/composition/modules/site-search.ts:213` rechecks activation before provider use, so disabled plugins stop receiving new calls; status can still list the registered provider. **Answer:** keep the per-use protection and also report it as disabled immediately. **Smallest change:** derive status from the same activation reader; use a lifecycle notification only to refresh the display, never as the sole safety check. Deferred: shared status contract and lifecycle tests. [providers-b]

## 32. Is the search-provider contract acceptable?

**Today:** `../jini-int/packages/search/src/contract.ts:160` scopes provider context by index; `../jini-int/packages/search/src/api.ts:70` exposes rebuilds; Tovu binds these through `apps/website/src/server/runtime/composition/modules/site-search.ts:251`. **Answer:** retain this contract as the working proposal, subject to the writer-lock and database-copy fixes described here and unchanged provider conformance tests. **Smallest change:** record Coordinator/owner sign-off in the existing design record. Deferred: this research does not manufacture the missing approval. [search]

## 33. Should database copies carry search's stored progress and index pointers?

**Today:** `apps/website/src/features/database-transfer/exclusions.ts:30` omits secrets and temporary work, but not the four `search_index_*` tables. `apps/website/src/server/runtime/composition/modules/site-search.ts:47` derives external index names from the installation identity. **Answer:** leave search progress behind and rebuild on the destination; copied pointers can claim a different installation's index is ready. **Smallest change:** exclude all four tables together and schedule/verify destination rebuilding before exposing search. Deferred: exclusions alone are short, but copy/switch/restore correctness and old-index deletion need a complete test. [search]

## 34. Should colliding migration numbers be changed at merge?

**Today:** `apps/website/src/platform/db/migrations/index.ts:7` already imports search as 0027 and 0028, after the email/DNS steps. **Answer:** keep the merged numbering; never rename a migration already applied to an owner's database. **Smallest change:** none for this collision. Verify the migration manifest and upgrade paths, rather than renumbering again. [search, providers-b]

## 35. Should editing an HTML page update search automatically?

**Today:** already implemented: `apps/website/src/features/pages/html-document-store.ts:451` enqueues `entry.updated`; its dependency contract at `:136` explains the search requirement. **Answer:** keep this event in the existing successful-write transaction; search must catch up without an owner rebuilding manually. **Smallest change:** none; keep SQL and memory behavior aligned and verify composition supplies the outbox. [search]

## 36. Should public search run behind the site's serving protection?

**Today:** the old report is stale: `apps/website/src/server/runtime/composition/app.ts:1904` applies the serving gate and `:1913` applies consent before search registration at `:2311`. `apps/website/src/server/inbound/public-http/routes/site/search.ts:1` owns the JSON endpoint. **Answer:** keep that order and the existing member-access checks. A functional search response need not require optional analytics consent. **Smallest change:** none; pin blocked-site behavior in the route tests. [search]

## 37. Is a public theme search block still wanted?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/search.ts:1` supplies search, while `apps/website/src/server/runtime/composition/modules/site-search.ts:33` documents the still-empty built-in-provider slot. **Answer:** yes, after the default provider works; owners should not need a paid account simply to add search. **Smallest change:** implement the approved built-in Jini provider and conformance tests first, then connect a theme form to the existing endpoint. Deferred: substantial shared behavior and UI. [search]

## 38. Is another hosted search plugin needed immediately?

**Today:** `content/agent-plugins/meilisearch/providers/meilisearch.mjs:1` is the existing plugin example; `apps/website/src/features/agent-plugins/search-provider-registry.ts:1` loads contributions. **Answer:** defer another vendor until an owner needs it; prioritize working default search. **Smallest change:** none now. If needed, implement it through the same Jini contract entirely inside its plugin. [search]

## 39. Should site-search gain an index file just to reduce the architecture count?

**Today:** `apps/website/src/server/runtime/composition/modules/site-search.ts:14` imports named feature modules directly. **Answer:** do not add a forwarding file solely to improve a number; use one only if the feature needs a supported public boundary. **Smallest change:** none now; document the intended feature surface in its existing INFO file before changing import policy. [search]

## 40. Should saving media keys delete entries for unknown providers?

**Today:** `apps/website/src/features/media/provider-credential-vault.ts:1` owns the shared saved-key behavior; the merged save preserves entries omitted by the built-in editor. **Answer:** keep unknown keys until the owner explicitly removes them; an inactive or temporarily missing plugin is not evidence its key is unwanted. **Smallest change:** none. Cleanup should name the provider and ask through the existing credential-removal flow. [providers-a, verify]

## 41. Should media-provider loading happen before boot continues?

**Today:** `apps/website/src/server/runtime/composition/deps.ts:1201` awaits the media registry before later composition. **Answer:** keep this order; early requests must not see a half-built catalogue. **Smallest change:** none. An optional plugin failure should be reported by the loader without losing the built-in provider. The protected composition file was read only. [verify]

## 42. Should backups notice remote media selected through settings?

**Today:** the storage report's gap has been addressed: `apps/website/src/features/site-backup/sources.ts:384` checks the injected `isMediaRemote` reader as well as the local-folder value; `:345` explains missing remote bytes in the backup. **Answer:** keep that check and the visible omission notice; do not describe a database-only backup as complete media protection. **Smallest change:** none for this old gap; verify the setting-selected case. [storage]

## 43. Should any third-party plugin be allowed to supply storage?

**Today:** `apps/website/src/features/object-storage/registry.ts:61` loads activated contributions through Jini's shared loader; its header at `:17` specifies the bundled-digest and module-containment checks. The storage report leaves broader trust unresolved. **Answer:** require the existing trusted-plugin approval before handing over site files or storage keys. **Smallest change:** retain the current trust owner and record an explicit trust decision before widening accepted plugins. Deferred to Coordinator: no bypass of the shared loader's safety checks. [storage]

## 44. Should the storage plugin advertise its capability in its manifest?

**Today:** `content/agent-plugins/s3-compatible/plugin.json:1` is the plugin identity; its object-store contribution is separate metadata. **Answer:** yes, once the manifest schema names the capability consistently; owners and discovery should see what installation provides. **Smallest change:** update the existing plugin manifest using the schema-approved capability name and its manifest test. Deferred: the report's proposed name was explicitly unverified; do not invent an unsupported field/value. [storage]

## 45. May a plugin be uninstalled during an unfinished update?

**Today:** `apps/website/src/features/agent-plugins/uninstall-tool.ts:71` explains the pending-update refusal; `../jini-int/packages/agent-plugins/src/lifecycle/update-store.ts:138` settles the journal under the same plugin lock. **Answer:** keep the refusal until recovery completes. This protects the owner's installed version and memory. **Smallest change:** none; show a recovery action instead of encouraging repeated uninstall attempts. [plugins]

## 46. How long should plugin update history be kept?

**Today:** `../jini-int/packages/agent-plugins/src/lifecycle/update-store.ts:94` writes one history file per transaction without an expiry policy. **Answer:** keep a bounded history, initially the latest 50 completed updates per plugin, while never deleting an active recovery record or the last recoverable version. **Smallest change:** add pruning after successful history filing in Jini's existing store. Deferred: file retention and rollback references need recovery tests; no directory deletion here. [plugins]

## 47. Should owners be able to return to an older plugin version?

**Today:** `../jini-int/packages/agent-plugins/src/lifecycle/update-plan.ts:28` refuses downgrades; automatic failed-update rollback has its own recovery path. **Answer:** retain the refusal for ordinary updates; add an explicit “restore previous working version” action with a preview and backup. Never silently downgrade. **Smallest change:** extend the existing update/recovery owner to validate the older package and preserve compatible memory. Deferred: security, stored-data compatibility and UI. [plugins]

## 48. Should the update planner require an explicit enabled state?

**Today:** `../jini-int/packages/agent-plugins/src/lifecycle/update-plan.ts:4` makes it optional and `:18` treats absence as false. The update runtime passes the resolved value at `../jini-int/packages/agent-plugins/src/lifecycle/update.ts:106`. **Answer:** require the installed plugin's enabled state, so an omitted field cannot switch it off by accident. **Smallest change:** narrow the installed input type in Jini and update its callers/tests. Deferred: the owning checkout is read-only for this job; no local copy of the planner. [plugins]

## 49. Should the generic plugin engine default its namespace to Tovu?

**Today:** `../jini-int/packages/agent-plugins/src/manifest.ts:86` uses that fallback. **Answer:** make the host namespace explicit at the host binding; a generic Jini package serves multiple products. **Smallest change:** require the namespace through the existing validation options after auditing callers; Tovu supplies its own name at the edge. Deferred: shared API compatibility, outside this writable repository. [plugins]

## 50. Should the plugin-disable dialog be translated?

**Today:** `apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts:1` owns the plugin-panel actions; the plugins report flags the existing English disable title. **Answer:** yes, through the existing translation dictionary, with the same confirmation behavior. **Smallest change:** replace the literal at its actual dialog owner and supply translations through the established catalogue. Deferred: UI/i18n work, explicitly outside this job's safe non-UI fixes. [plugins]

## 51. Should missing Jini releases be fixed by removing dependencies?

**Today:** `package.json:148` declares search and `:127` declares capability-providers; `node_modules/@jini-ai/search` is absent here. The comments report's old lock mismatch and later search-release question are not proof of today's registry availability. **Answer:** publish compatible Jini releases first, then update the existing manifests and lockfiles together. Do not remove working source integrations to make installation appear successful. **Smallest change:** a coordinated release/lockfile update, followed by a clean install by the separate runner. Deferred: no installs, registry verification or publishing authorized here. [plugins, providers-a, site]

## 52. Should a refused plugin update disable the old working plugin?

**Today:** `../jini-int/packages/agent-plugins/src/lifecycle/update.ts:182` disables before switching, and `:243` keeps recovery disabled until MCP servers can be provisioned. **Answer:** check a missing provisioning capability before disabling anything. If a real switch partly ran, staying disabled until safe recovery is appropriate. **Smallest change:** add the precondition to the existing Jini update owner and test that a preflight refusal preserves activation. Deferred: shared lifecycle and recovery semantics. [fill-T2]

## 53. Should deployment resend every historic scheduled-post announcement?

**Today:** `apps/website/src/features/post/go-live.ts:18` gives announcements schedule-based IDs; `:45` permits a first sweep without a lower date bound. Old save-time IDs do not suppress the new IDs. **Answer:** do not surprise subscribers with a historic burst. Record a one-time upgrade boundary, distinguish previously announced schedules, and resume normal catch-up for genuinely missed publications. **Smallest change:** a versioned migration/reconciliation step using the existing outbox IDs, with old/new/offline cases. Deferred: a bare time cutoff can lose real announcements and is not a safe small fix. [content]

## 54. Should the stock blog show 6, 12 or 24 posts per page?

**Today:** `content/themes/static/tovu-starter/render/pages/listing-default.html:77` sets the paged preview limit to six; the site report records the same default in both stock themes. **Answer:** keep six as the default and let owners change the existing marker setting. It keeps initial pages small and avoids another surprise layout change. **Smallest change:** none. Any changed default belongs in both live/reset theme copies with layout review. [site]

## 55. Should later listing pages have their own title and canonical address?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/pages.ts:2437` builds the requested listing page; the general page-head builder at `:154` supplies title/canonical context. The report raises missing page-specific metadata. **Answer:** yes: add “Page 2” to the title and use that page's actual public address. **Smallest change:** carry the existing listing page/path into the page-head owner and verify rendered HTML. Deferred: visible output and search metadata behavior; no UI edits here. [site]

## 56. Should `/page/1` redirect to the main listing?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/pages.ts:2720` prepares listing request state; the site report says page one aliases currently return 404. **Answer:** redirect a valid listing's page-one alias to its main URL, while keeping malformed and non-listing routes as 404. **Smallest change:** extend the existing listing route parser/redirect decision, including canonical and custom-prefix tests. Deferred: route behavior is broader than a generic string redirect. [site]

## 57. Should delete confirmation explain the Trash?

**Today:** `apps/website/src/contracts/core/soft-delete.ts:1` defines the trash lifecycle; the site report flags misleading admin confirmation text in 20 locales. **Answer:** yes: say “Move to Trash” for recoverable deletion and reserve permanent wording for permanent deletion. **Smallest change:** update the existing action's dictionary entries and snapshots together. Deferred: translated UI, not a non-UI fix. [site]

## 58. Should duplicate and repaired sites retain their timezone?

**Today after this patch:** `apps/website/src/platform/site-dir/duplicate-site.ts:201` reuses the already-read source configuration, and `:283` preserves its optional timezone while resetting domain and port. **Answer:** copies should keep local dates; repair should preserve a readable existing timezone and never guess from the repairing computer. **Smallest change made:** carry the source's optional field through the existing duplicate writer and extend its real-file assertion. Repair behavior and setting the named live site's zone are deferred: no live site was accessed or modified. [site]

## 59. Should redirect patterns be normalized when saved?

**Today:** `apps/website/src/features/redirects/tool-registrations.ts:176` passes the supplied pattern to the write owner; `apps/website/src/server/inbound/public-http/routes/site/pages.ts:2695` preserves the original requested path for matching. The site report says matching/duplicate checks already equate trailing-slash variants without rewriting stored values. **Answer:** normalize future exact-path writes through the same comparison owner, while preserving wildcard/prefix meaning and old saved rules. **Smallest change:** reuse that normalizer at create/update boundaries and test duplicate conflicts. Deferred: stored matching behavior and all redirect kinds must be checked together. [site]

## 60. Should clearing old in-memory runs also delete durable conversation events?

**Today:** `../jini-int/packages/server/src/kernel-base.ts:171` does not enable `dropEventsOnEviction`; `../jini-int/packages/daemon/src/run-lifecycle.ts:676` deletes events only when explicitly requested. **Answer:** keep durable history; memory cleanup must not erase the owner's conversation. **Smallest change:** none. Add a separate, explicit history-retention policy if storage needs a limit. [memory]

## 61. Should repeated delegated tool results be deduplicated?

**Today:** the memory report identifies the missing CLI tool-use identity across the boundary; `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:1` is Tovu's daemon edge and `../jini-int/packages/daemon/src/agent-executor/launch.ts:1` owns execution. **Answer:** yes, by the original tool-use ID, not by equal text; two legitimate calls can return the same answer. **Smallest change:** carry that ID through the existing Jini protocol and deduplicate at its event owner. Deferred: protocol change and replay tests. [memory]

## 62. Should each status poll read the entire conversation?

**Today:** `apps/website/src/server/runtime/composition/modules/assistant.ts:190` calls `load` for a message ID; `../jini-int/packages/chat/src/store/runtime/durable-run-store.ts:206` explicitly loads its full conversation transcript. Separately, `../jini-int/packages/chat/src/react/hooks/assistant-chats.ts:606` loads messages when selecting a conversation. **Answer:** status polling should fetch only status/new events; opening a chat may load history. **Smallest change:** expose the existing head-only read by message ID through Jini's durable-store port and use it for status polling, preserving ownership checks. Deferred: shared contract change; do not replace the full read needed to open/recover a conversation. [memory]

## 63. Should repeated media-reference scans be cached?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:145` scans authored media markers as part of access checks. **Answer:** cache parsed references only by site, entry ID and content revision; recheck current access every time. This can reduce repeated work without leaking members-only media after an edit. **Smallest change:** add a bounded parsed-reference cache to the existing shared scanner owner with revision invalidation. Deferred: stale access decisions would be unsafe; this needs privacy/revocation tests. [memory]

## 64. Is it acceptable to expire full in-memory run replay?

**Today:** `../jini-int/packages/daemon/src/event-log.ts:49` keeps full in-memory events for 15 minutes after completion, then compacts them. This is separate from the 24-hour run-record retention at `../jini-int/packages/daemon/src/run-lifecycle.ts:368`; durable events remain separate too. **Answer:** keep bounded memory retention and reconstruct older history from durable storage, with an honest replay-gap response when necessary. **Smallest change:** none to retention; preserve the existing compaction, resume and replay-gap tests. [memory]

## 65. What account mapping should old payment imports use?

**Today:** `../jini-int/packages/commerce/src/payments/ledger/migrations/index.ts:31` lists 0001, 0002 and 0004; the legacy 0005 import was removed by the merge. The old mapping question is therefore superseded, not answered by a guessed account. **Answer:** never infer production account ownership or erase a real ledger. **Smallest change:** none here; if any installation recorded 0005 or holds legacy rows, inventory it read-only and design an explicit supported upgrade. Deferred: real site/account data is unavailable. [payments, merge]

## 66. Should the payment adapter use the new PaymentsPort?

**Today:** `../jini-int/packages/commerce/src/payments/contract/payments-port.ts:6` requires single-use approval grants for money-moving operations; `../jini-int/packages/commerce/src/payments/providers/lipay-gateway.ts:1` is the provider adapter. **Answer:** yes; keep one governed payment path rather than resurrecting an unguarded legacy API. **Smallest change:** none to the direction; release the compatible Jini API and run its adapter/contract tests before adoption. Vendor details belong in plugins, not Tovu core. [payments]

## 67. Do money approvals need durable storage?

**Today:** `../jini-int/packages/commerce/src/payments/ops/grants.ts:69` stores approvals in a process-local map and `:79` consumes them atomically only within that process. **Answer:** use durable, expiring, single-use grants before multiple workers or restart-safe approvals are promised. Never ask an owner to approve again merely because another server received the request. **Smallest change:** implement the existing `MoneyGrantPort` with conditional consume in Jini's storage layer and bind it at composition. Deferred: transaction and replay safety, outside this repository. [payments, merge]

## 68. Should payment contract tests use PGlite instead of a real Postgres database?

**Today:** `../jini-int/packages/commerce/src/payments/ledger/__tests__/postgres.vitest.test.ts:28` skips without its database URL and `:37` runs the shared ledger contract on real Postgres when supplied. **Answer:** keep the real database contract in CI; PGlite may be an additional quick check, not a replacement for Postgres locking behavior. **Smallest change:** supply an isolated CI database to the existing test; no new production dependency. Deferred: runner/CI setup, tests expressly forbidden in this job. [merge]

## 69. Should a dispute close if the provider changes its reported amount?

**Today:** `../jini-int/packages/commerce/src/payments/accounting/plan-evidence.ts:272` separates a closing-status change from an amount mismatch; `../jini-int/packages/commerce/src/payments/accounting/apply-evidence.ts:145` records the discrepancy. **Answer:** accept the independently verified closing status, keep the original booked amount, and surface the changed amount for review. Do not silently rewrite money history. **Smallest change:** none if those existing tests confirm this behavior; route any missing alert through the existing alert owner. [merge]

## 70. Should excess refunds and disputes be capped or reported?

**Today:** `../jini-int/packages/commerce/src/payments/accounting/apply-evidence.ts:189` raises `over-withdrawn` when withdrawn exceeds captured money. **Answer:** keep the full evidence and alert the owner; silently capping would hide an actual account discrepancy. **Smallest change:** bind a durable alert delivery path to the existing alert port. Deferred: actual host wiring and reliable delivery, not arithmetic changes. [merge]

## 71. Should the old capability-providers payment interface be retired?

**Today:** `../jini-int/packages/capability-providers/src/payments.ts:16` still exposes the older charge contract; `../jini-int/packages/commerce/src/payments/contract/payments-port.ts:6` owns the newer approval-bound path. **Answer:** deprecate new use of the old interface and migrate real callers before removing it. **Smallest change:** add deprecation guidance and a consumer inventory in Jini; move provider-specific wire behavior to the payment plugins. Deferred: a cross-package API retirement needs its existing decision record revised. [commerce, merge]

## 72. Should providers always echo our payment correlation ID?

**Today:** `../jini-int/packages/commerce/src/payments/contract/provider.ts:61` declares whether a provider echoes it; `../jini-int/packages/commerce/src/payments/contract/evidence.ts:40` makes received correlation optional. **Answer:** use the ID when supported, but do not pretend every provider returns it. Otherwise match an unambiguous provider reference and keep ambiguous evidence waiting for review. **Smallest change:** none to this capability-based contract; prove each plugin's matching behavior with provider fixtures/sandbox tests before enabling it. [commerce]

## 73. Should the first payment-provider interface include every possible operation?

**Today:** `../jini-int/packages/commerce/src/payments/contract/provider.ts:14` keeps capture, void and retrieval optional and capability-declared. **Answer:** retain the small interface and add operations only for an actual supported flow. An owner should see a clear unsupported action, not an improvised substitute. **Smallest change:** none; use the existing conformance suite for each declared capability. [commerce]

## 74. May checkout ship without tax and shipping support?

**Today:** `../jini-int/packages/commerce/src/catalog/checkout.ts:32` explicitly excludes tax and related checkout expansion; it is not evidence of a complete physical-goods checkout. **Answer:** require an explicit supported product/setup policy; refuse a checkout that needs shipping or tax calculation not provided. Do not assume every digital product is exempt. **Smallest change:** a shared checkout-readiness check using injected tax/shipping decisions before payment creation. Deferred: product requirements, integration and owner setup; no financial/legal rules invented here. [commerce]

## 75. Should money use ordinary numbers or very large integer values?

**Today:** `../jini-int/packages/commerce/src/money/money.ts:14` uses whole minor units as numbers; `:60` requires safe integers and `:81` checks addition overflow. **Answer:** keep this validated representation; changing every stored and transmitted amount adds risk without a stated need. **Smallest change:** none; preserve boundary/overflow tests and never introduce floating-point currency arithmetic. [commerce]

## 76. Are the old unapproved daemon payment routes still a concern?

**Today:** `../jini-int/packages/daemon/src/http/connectors.ts:10` documents their removal. `../jini-int/packages/server/src/builtin-features.ts:518` still binds the remaining connector routes with empty dependencies. **Answer:** keep the old charge/refund routes removed; any replacement must use PaymentsPort and its grants. **Smallest change:** none; retain regression tests proving those URLs cannot move money. [commerce]

## 77. Should database-specific fraud and location analysis be built into the money ledger?

**Today:** `../jini-int/packages/commerce/src/payments/contract/risk.ts:1` exposes a risk decision boundary, while the ledger is storage-port based. The commerce report's database/geo/graph additions were explicitly not yet designed. **Answer:** keep the ledger portable; add provider signals and coarse, permission-controlled risk analysis behind the existing risk boundary. **Smallest change:** a separately approved Jini design fed by existing payment events; vendor-specific signals stay in plugins. Deferred: privacy, retention and new feature scope, not a small fix. [commerce]

## 78. How should a timed-out payment be found if it has no provider reference yet?

**Today:** `../jini-int/packages/commerce/src/payments/ops/reconciler.ts:5` describes reference-based retrieval; `../jini-int/packages/commerce/src/payments/ops/intent.ts:5` preserves an unknown outcome after dispatch. **Answer:** keep it unresolved and offer safe provider lookup by the original correlation/idempotency key where the provider supports it; never create another charge to discover whether the first worked. **Smallest change:** add an optional lookup capability to the existing provider contract and plugin. Deferred: shared contract plus real provider evidence. [merge]

## 79. Should payment alerts be sent inside database transactions?

**Today:** `../jini-int/packages/commerce/src/payments/ingest/worker.ts:239` sends its collected alerts after commit; `../jini-int/packages/commerce/src/payments/accounting/apply-evidence.ts:191` can also call the alert port during evidence application. **Answer:** record alert work in the same transaction, then deliver it afterwards through the existing outbox. An email/network outage must not change money history or lose the alert. **Smallest change:** make the alert adapter enqueue durable work, not perform external I/O. Deferred: shared transaction/outbox binding and failure tests. [merge]

## 80. Should payment reconciliation enforce a minimum waiting time?

**Today:** `../jini-int/packages/commerce/src/payments/ops/reconciler.ts:24` documents that waiting must exceed provider-call duration, but `:150` directly subtracts the supplied age. **Answer:** enforce a finite minimum derived from the longest provider deadline plus margin; callers should not be able to treat an in-progress payment as abandoned. **Smallest change:** validate the option at the existing Jini reconciler boundary and share the configured deadline. Deferred: the owning package is outside this writable clone and race tests are required. [merge]

## 81. Should tools have a separate “moves money” classification?

**Today:** `../jini-int/packages/commerce/src/payments/tools/catalog.ts:114` explains that money actions use the existing durable-change class plus a human-confirmation rule and single-use approval grant. **Answer:** keep these actual enforcement checks; add a money label only if the central policy owner will use it consistently. A label alone is not protection. **Smallest change:** none now; any vocabulary expansion belongs in Jini core with existing consumers migrated together. [merge]

## 82. Is it acceptable for a replayed payment request to mint an unused approval grant?

**Today:** `../jini-int/packages/commerce/src/payments/tools/money-tools.ts:166` mints before the service call, while `../jini-int/packages/commerce/src/payments/ops/capture-void.ts:113` can return a replay without using it. **Answer:** it must remain bound, single-use and expiring; do not move approval checks ahead of authorization merely to save a token. Prefer avoiding needless minting after an authorized replay lookup. **Smallest change:** add that optimization inside the existing approved-command owner. Deferred: ordering and replay tests; no payment behavior changed here. [merge]

## 83. Should all rejected payment webhooks return a bad-request response?

**Today:** `../jini-int/packages/commerce/src/payments/ingest/receive.ts:98` returns 503 for temporary/unknown verification failure and `:100` returns 400 for a definite rejection. **Answer:** keep this distinction; temporary service failures should ask the sender to retry, while invalid signatures or permanently invalid payloads must be refused. **Smallest change:** none to the core mapping. Plugins must classify uncertain failures honestly in the existing contract. [merge]

## 84. Should replaying an unfinished capture or void look successful?

**Today:** `../jini-int/packages/commerce/src/payments/ops/capture-void.ts:113` returns `ok: true, replayed: true` for a matching saved attempt, even if its final outcome is not yet known. **Answer:** report “still checking” with a retryable unresolved result, preserving the original key and never sending the money action again. Owners must not read “success” as settled money. **Smallest change:** distinguish open from terminal attempts in the existing replay branch and update its typed result/consumer tests. Deferred: shared payment contract and user-visible semantics. [fix2]

## 85. Should any server response clear an “unreachable” message?

**Today:** `apps/admin/src/lib/api.ts:2586` marks the server reachable after a successful request; its nearby error mapping distinguishes a real application response from a proxy's refusal. **Answer:** a verified application reply, including a permission or validation error, proves reachability; a proxy-generated 502 does not. **Smallest change:** use the existing parsed application-response evidence to clear connectivity status. Deferred: reconnect UI behavior and proxy cases need tests; do not clear on every HTTP response indiscriminately. [fix2]

## 86. Should a missing parent page's redirect catch its numbered child pages?

**Today:** `apps/website/src/server/inbound/public-http/routes/site/pages.ts:1` owns page/listing handling; fix2 records that `/about-old/page/2` now returns 404 when only `/about-old` matches a missing-page rule. **Answer:** keep exact-path behavior unless the owner explicitly created a subtree rule. A broad fallback could send unrelated pages to the wrong destination. **Smallest change:** none; provide an explicit prefix rule through the existing redirects feature when wanted. [fix2]

## 87. Should browser integration be gated on the extension actually being connected?

**Today:** `apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:143` combines preferences and runtime support; the runtime probe reports CLI support, not a verified extension connection. **Answer:** distinguish supported from connected. A disconnected extension should yield actionable guidance and allow ordinary site work to continue. **Smallest change:** extend Jini's existing runtime probe with connection status if the runtime exposes it; keep the owner restriction. Deferred: external CLI/browser integration and live verification. [fix2]

## 88. Is an empty run ID acceptable for a turn that failed before starting?

**Today:** fix2 records that representation. `../jini-int/packages/chat/src/store/sql/store.ts:279` writes the supplied run ID, and `:128` omits a falsey stored run ID when reading. Thus an empty string does not round-trip as a real ID. **Answer:** preserve the failed message but represent “no run was started” as an absent/null ID; never fabricate a running job. **Smallest change:** normalize the failure at Jini's existing chat persistence boundary and cover save/reload. Deferred: shared stored-message contract; do not infer success from missing ID. [fix2]

## 89. Should the plugin source-manifest fallback remain permanently?

**Today:** `apps/website/src/features/agent-plugins/supersession.ts:85` first reads installed declarations, then uses the trusted bundled source fallback when needed. **Answer:** keep it only for the compatibility period and only for the same trusted plugin identity; remove it after a recorded reseeding migration proves old installations are covered. **Smallest change:** add a migration/version condition to this existing fallback and its old-install tests. Deferred: removing it immediately could strand owners' old plugin layouts. [fix2]

## 90. Should boot preflight also exercise authenticated startup-tool fetching?

**Today:** `apps/website/src/server/inbound/assistant/bridge-preflight-entry.ts:16` strips startup tool IDs so an unauthenticated initialize probe does not falsely fail. **Answer:** keep that lightweight check and add a separate narrowly scoped authenticated check of the real startup-tool path. **Smallest change:** reuse the existing short-lived run-token mechanism and revoke the probe token at completion. Deferred: authentication/lifecycle work; do not give an unauthenticated probe broader privileges. [verify]

## 91. Should bundled hosting templates contain the maintainer's production settings?

**Today:** `content/agent-plugins/fly/scripts/tovu-production.values.json:1` ships the hosting values inside the plugin. **Answer:** plugin-owned generic templates are appropriate; personal app names, accounts or region choices should not become another owner's defaults. **Smallest change:** keep the template in its plugin, replace personal values with required inputs or neutral examples, and read actual site values through the existing configuration ports. Deferred: classify the template inputs with its deploy owner before changing generated deployment behavior. [vendors]

## 92. Should the source-control plugin hard-code a hosting plugin's workflow filename?

**Today:** `content/agent-plugins/github/deploy-ops/github-actions.mjs:73` uses a fixed workflow filename and `:105` dispatches it. **Answer:** the selected hosting setup should declare its workflow path; the source-control plugin executes that choice. Owners should not have to rename their workflow to match an unrelated host. **Smallest change:** add a workflow path to the existing deployment target contract and consume it here, retaining safe path validation. Deferred: cross-plugin contract coordinated through Jini, not imports between vendor plugins. [vendors]

## 93. Should plugins contribute vendor names to tool search?

**Today:** `apps/website/src/assistant/tool-search-keywords.ts:27` takes keywords from core metadata; `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:8` still includes vendor-specific words. **Answer:** yes, through a trusted, removable keyword contribution; owners should be able to ask using their provider's name without hard-coding it in core. **Smallest change:** extend Jini's existing search enricher input and contribution lifecycle, then move vendor terms to their plugins and update discovery tests. Deferred: new shared contribution contract and revocation tests. [vendors, verify, merge]

## 94. Should hosting plugins decide proxy trust and hosted-runtime detection?

**Today:** `apps/website/src/server/runtime/boot/boot-readiness-warnings.ts:47` reads a host-specific environment signal; the merge report identifies related proxy/runtime checks in core. **Answer:** move factual host signals into trusted host adapters, but keep final security policy centrally owned. An arbitrary plugin must not be able to declare visitor headers trustworthy or enable unrestricted execution. **Smallest change:** define a reviewed injected host-environment capability in Jini and migrate the existing checks through it. Deferred: security boundary and approved behavior, not a string rename. [vendors]

## 95. Should deployment configuration discovery come from plugin manifests?

**Today:** `apps/website/src/features/publish-trust/connect.ts:51` has an ordered list of provider files and `:78` reads in that order. **Answer:** yes, preserving deterministic priority and rejecting paths outside the repository. Otherwise moving the list could silently select a different app. **Smallest change:** extend the existing deployment descriptors with paths plus explicit priority, then have discovery consume them. Deferred: contribution schema, trust and ordering tests. [vendors]

## 96. Should remaining vendor-specific core test fixtures become neutral?

**Today:** `apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:8` and the vendor report distinguish discoverability/migration cases from incidental fixture IDs. **Answer:** use neutral fixtures for generic core behavior; keep real vendor behavior tests inside their plugins. Historical migration values must remain unchanged. **Smallest change:** move only the concrete vendor-behavior tests and rename incidental fixtures in a dedicated test-only pass. Deferred: this job's three fixes do not need those fixtures changed, and parallel jobs already own related files. [vendors]

## 97. Should comments and payments use the shared provider registry?

**Today:** `../jini-int/packages/capability-providers/src/comments/registry.ts:21` combines definitions with per-site adapter resolution; `../jini-int/packages/commerce/src/payments/provider-registry.ts:1` owns payment-specific scoping. These contracts are richer than a keyed map. **Answer:** reuse Jini core's keyed storage/validation where it fits, but preserve their specialized resolution and approval contracts. **Smallest change:** refactor those implementations behind unchanged public contracts with conformance tests. Deferred to Coordinator: shared ownership/boundary decision, not mechanically replacing factories in Tovu. [merge]

## 98. Should the comments provider tools be allowed through confirmation cards and cross-site reads?

**Today:** `apps/website/src/contracts/core/tool-metadata/comments.ts:6` marks get as a direct read and set as an approved plan; `apps/website/src/assistant/mcp-ui-tool-calls.ts:37` derives the callback allowlist from reviewed metadata. **Answer:** allow provider switching only through its bound, single-use confirmation exchange; permit genuinely read-only status through the reviewed cross-site read catalogue. Do not add a bare allowlist entry just to make tests green. **Smallest change:** review the existing handler's exchange binding, then change its own metadata and tests together. Deferred: security-surface review. [comments, merge]

## 99. Should exported web-clone helpers use the two-object signature?

**Today:** `../jini-int/packages/agent-runtime/src/skills/web-clone/scripts/lib/script-cli.mjs:1` and related script helpers expose older positional call patterns, as the coverage report notes. **Answer:** yes for new or materially changed boundaries; migrate the old helpers by coherent call group, preserving CLI entry behavior. **Smallest change:** adapt the owning Jini helper and all its callers together, using the established `(required, options = {})` form. Deferred: outside this writable clone and unrelated to the three fixes. [coverage]

## 100. Should the two web-clone command-line helper libraries be combined?

**Today:** `../jini-int/packages/agent-runtime/src/skills/web-clone/scripts/lib/script-cli.mjs:1`, `cli-args.mjs:1` and `main-guard.mjs:1` are separate implementations. **Answer:** share argument parsing and direct-entry detection where their contracts agree; retain distinct command-specific rules. **Smallest change:** make current callers delegate to one existing owner after listing their differing flags/error behavior. Deferred: Jini refactor, not copying one lifecycle over the other. [coverage]

## 101. Should “Strict Mode” tests actually exercise React's repeated effects?

**Today:** the coverage report says the current Vitest setup does not rerun the effects; `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1` is among the hook surfaces covered by that wave. **Answer:** yes; a test name is not evidence that restart/cleanup races are covered. **Smallest change:** use the existing React test harness in a configuration that performs setup-cleanup-setup, or directly drive that lifecycle through injected ports. Deferred: test-harness change and runner validation, not app logic. [coverage]

## 102. Should hosted permission and credential-recovery guards be removed for coverage?

**Today:** `apps/website/src/contracts/core/agent-permission-mode.ts:33` keeps hosted execution restricted; `apps/website/src/platform/db/vault-credential-recovery.ts:1` is the recovery owner. The reports explicitly restored safety fallbacks. **Answer:** keep the guards; use direct boundary tests, not narrower runtime protection to improve coverage figures. **Smallest change:** none. Any future removal needs proof at the guard's own boundary and the recorded security decision revised. [cov-T2, cov-T3, merge]

## 103. Should speech preload be tested with an Electron fake or excluded?

**Today:** `apps/desktop/src/speech/preload-speech.cts:1` is the Electron boundary; `apps/desktop/src/speech/preload-speech.test.ts:1` is its direct test. **Answer:** use a typed fake for Electron's port and assert the exposed bridge/callback behavior; also keep a real desktop smoke check. **Smallest change:** extend the existing preload harness. Deferred: runner/desktop environment; do not exclude production behavior solely to raise a percentage. [cov-T2]

## 104. May the source-control HTTP fallback adapter be deleted as dead code?

**Today:** `apps/website/src/features/source-control/provider-kit.ts:15` deliberately rejects guarded HTTP calls when no client was injected. It satisfies the shared provider-kit contract. **Answer:** keep this explicit refusal; do not silently fall back to an unguarded credentialed request. **Smallest change:** none; exercise it directly through the current kit's test seam. [cov-T2]

## 105. Should an old MCP refusal reason and credentialed-request guards be removed?

**Today:** `../jini-int/packages/mcp/src/federation/approvals/revocation-reason.ts:11` maps the legacy reason to a current write refusal; `apps/website/src/features/custom-credentials/credentialed-request.ts:1` owns credentialed requests. **Answer:** retain stored/wire compatibility and fail-closed guards until the owning contract explicitly retires them. **Smallest change:** none here. The credential module is on today's do-not-touch list; only its owner should make a contract-backed change. [cov-T2]

## 106. Is mocking the featured-image module acceptable long-term?

**Today:** `apps/website/src/features/post/__tests__/tool-registrations.featured-image-refusal.test.ts:1` is the reported module-mocking test. **Answer:** inject the image operation at its existing boundary and assert the real tool's refusal; a test should not replace the code whose behavior it claims to prove. **Smallest change:** convert the test to the port seam and keep its exact refusal assertion. Deferred: focused testability refactor, not needed by this patch; do not delete the assertion. [cov-T2]

## 107. Should the test's private-key-shaped marker be changed?

**Today:** already fixed: `apps/website/src/features/publish-content/__tests__/backstop-preview.test.ts:86` assembles the marker at runtime. **Answer:** keep that harmless fixture construction and keep the secret-scanner assertion intact. **Smallest change:** none; rerun the existing scanner and preview tests. This does not require weakening the scanner or adding a broad exception. [cov-T2]

## 108. Should the stray test backup file be kept?

**Today:** `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts-e:1` is still an extra backup-like file, separate from the actual `.test.ts` file. **Answer:** remove it only after confirming it has no unique intended assertions or comments. **Smallest change:** compare it with the real test and move any unique rationale before deleting it. Deferred: this is a source deletion requiring that comparison, not a safe blind cleanup; no test file was deleted here. [cov-T2]

## 109. Should the old site-backups test be deleted because its module was missing?

**Today:** `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts:4` imports `../site-backups.js`; that module now exists. **Answer:** keep the test; the old missing-module reason is stale. **Smallest change:** none unless the runner finds a current failure; fix its real cause without removing coverage. [comments]

## 110. Should deployment overview require callers to supply site-key status?

**Today:** `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts:128` accepts an explicit status or reads the real key sources by default; `:194` supplies the correct sources on the route path. **Answer:** keep the safe default for compatible callers and inject the status in tests. **Smallest change:** none. Do not remove a recovery fallback just to reach an otherwise-uncovered branch. [cov-T3, merge2]

## 111. Which workspace should a future multi-workspace delete remove?

**Today:** `apps/website/src/server/inbound/admin-http/routes/workspace/delete.ts:52` refuses the currently served workspace, but `:64` passes that same bound ID to deletion on the other branch. The report says the second-workspace branch is not currently addressable. **Answer:** delete only the explicitly requested, separately authorized workspace; always retain the bound-workspace refusal. **Smallest change:** pass the validated target after confirming route authorization and add a two-workspace test proving the served workspace survives. Deferred: destructive behavior cannot be classified as trivially safe from the current unreachable branch alone. [merge2]

## 112. Should toggling a plugin before its list loads empty the list?

**Today:** already fixed: `apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts:112` preserves the unloaded state; `:175` uses that helper when a toggle completes. **Answer:** keep that behavior; a late operation must not replace an unknown list with an empty one. **Smallest change:** none; retain the regression case added in the later coverage wave. [cov-T1, fill-rest]

## 113. Does the reported desktop tab-close hang need follow-up?

**Today:** `apps/desktop/src/renderer/App.tsx:1` still owns the tab UI, and `apps/desktop/src/renderer/App.render.test.ts:1` is the rendering test surface. The old report's jsdom hang is not proof of a current production hang; later reports changed the renderer. **Answer:** have the runner reproduce tab closing in the real desktop app and keep an explicit no-loop regression if it still occurs. **Smallest change:** none without a current reproduction; do not remove a close handler to make a test finish. Deferred: desktop/UI verification prohibited in this job. [cov-T1, fill-rest]

## 114. Should the unused WorkspaceChatPane be removed?

**Today:** `apps/desktop/src/renderer/WorkspaceChatPane.tsx:21` now lives separately and `apps/desktop/src/renderer/WorkspaceChatPane.render.test.ts:1` tests it; the later coverage report explicitly retained it. **Answer:** keep it until its recorded product contract is deliberately retired; a test requiring it is a reason to check intent, not automatically to delete both. **Smallest change:** none here. Coordinator should resolve intended usage before a removal-only change. [cov-T1, fill-rest]

## 115. Should desktop request methods accept inherited object names?

**Today after this patch:** `apps/desktop/src/sites-mcp-server.ts:150` checks that a method is declared directly on the table before reading its handler. Previously names such as `toString` and `constructor` reached inherited properties. **Answer:** refuse them as unsupported methods. **Smallest change made:** the standard `Object.hasOwn` check, plus a test covering `toString`, `constructor` and `__proto__` with the existing unsupported-method assertion. The existing JSON-RPC adapter signature is preserved for its callers; no new function was introduced. [cov-T1, merge]

## 116. Does the theme file-limit warning need a behavior change?

**Today:** `apps/website/src/features/theme/validation/structure.ts:157` stops entering a truncated walk, while `:170` also checks the file count inside each directory's loop. Unwinding nested directories can repeat the same warning. **Answer:** retain the limit and rejection; duplicate warnings are not a reason to relax the safety bound. **Smallest change:** none required for correctness. If display deduplication is desired, use the existing diagnostics owner after a nested-directory boundary test; do not bypass the scan to improve coverage. [cov-T2, merge]

## 117. Should an old authorization cancellation erase a newer connection error?

**Today:** `../jini-int/packages/ui/src/features/connectors/hooks/useConnectorAuthorization.ts:244` documents the race, and the following state update clears the current error after an older cancellation settles. **Answer:** keep the newer result; owners need the error from their latest action. **Smallest change:** bind cancellation cleanup to the original action generation and clear only that generation's state. Deferred: Jini's UI owner is outside the writable clone; use its existing stale-race test before implementation. [merge]

## 118. Is corrupt asset-cache metadata a fatal null-value bug?

**Today:** `../jini-int/packages/platform/src/asset-cache.ts:215` parses metadata and accesses its content type inside a try block; `:220` catches malformed/null metadata and returns a cache miss. **Answer:** keep the cache-miss/refetch behavior; do not call a caught internal type error an escaping production failure. **Smallest change:** none needed for recovery. An explicit object-shape check could improve diagnostics later in the same owner, without changing the fallback. [merge]

## 119. Should stale database-lock cleanup be allowed to lose another process's lock?

**Today:** `../jini-int/packages/db/src/pglite/owner.ts:330` checks the renamed lock identity and tries to restore a newer one; `:366` now serializes stale-lock removal and rechecks liveness. Tovu delegates through `apps/website/src/platform/db/kernel/drivers/pglite-owner.ts:25`. **Answer:** keep these fail-closed guards. The old report alone cannot establish that today's path still loses a live lock. **Smallest change:** none without a current race reproduction; add interleaved-start/cleanup tests in Jini before changing filesystem locking. [merge]

## 120. Should redirect and SEO writes depend on a shared mutable site binding?

**Today:** `apps/website/src/server/inbound/admin-http/routes/redirects/update.ts:43` passes write dependencies explicitly, but `apps/website/src/features/redirects/phase-handler.ts:77` registers the resolver with a shared routing owner. `apps/website/src/features/redirects/__tests__/phase-handler.repo-identity-binding.test.ts:29` documents that construction-time binding. The old “admin copy binds singleton” report does not by itself prove an incorrect current write target. **Answer:** bind writes and rendering to the request's site; one app's setup must not replace another's resolver. **Smallest change:** isolate the existing routing/SEO registrations per composed app and add a two-site test before changing bindings. Deferred: shared lifecycle/ownership change; no speculative route rewrite. [merge]

## 121. Should font names keep mismatched quote marks?

**Today:** `../jini-int/packages/agent-runtime/src/skills/web-clone/scripts/dna-scaffold.mjs:130` strips quotes before splitting a font stack, so a quoted first family followed by a fallback can retain a quote. **Answer:** preserve a clean first-family name; malformed generated styling wastes owner editing time. **Smallest change:** use the existing font-stack parser if available, or split before stripping a matched quote pair and cover quoted names containing commas. Deferred: the owner is Jini's script, outside this writable clone; no copied parser added to Tovu. [merge]

## 122. Is a prompt turn index that begins at zero acceptable?

**Today:** `../jini-int/packages/daemon/src/agent-executor/launch.ts:510` supplies zero for the initial overlay; `:1018` explicitly describes a coarse initial/later-turn distinction. **Answer:** yes if consumers need only initial versus follow-up; do not advertise it as an exact count. **Smallest change:** none for that contract. If an actual counter is required, add it to the existing conversation/run owner and revise the contract before consumers depend on it. [merge]

## 123. Should the pending-refresh cache state be removed?

**Today:** `../jini-int/packages/core/src/fetch/cache.ts:98` initializes `refreshAfterPending`, and `:180` still reads/resets it when a request settles. **Answer:** do not remove a lifecycle state solely because a coverage report could not reach it. First determine whether invalidation during an outstanding read still needs a follow-up refresh. **Smallest change:** characterize that sequence through the existing cache API; remove the field and branch only if no supported transition writes it. Deferred: shared cache semantics in read-only Jini. [merge]

## 124. Are removals based on another package's invariants acceptable?

**Today:** the merge report cites transfer refusals, run lifecycle guards and `no_grant` handling without an exact surviving diff. `../jini-int/packages/daemon/src/run-lifecycle.ts:565` is the current lifecycle boundary; Tovu's production permission guard remains at `apps/website/src/contracts/core/agent-permission-mode.ts:33`. **Answer:** keep security/recovery checks at their actual public boundary unless the owning contract forbids the input and direct tests prove it. **Smallest change:** Coordinator should review the named removals against their exact contracts; restore missing checks where required. Deferred: no blanket approval of unspecified removals, and no history-based code audit beyond this report lookup. [merge]

## 125. Should the generic locale, process-watchdog, test-harness and metadata helpers move to Jini?

**Today:** examples remain at `apps/admin/src/lib/merge-locale-overlays.ts:1`, `apps/website/src/server/runtime/boot/parent-watchdog.ts:1`, `apps/desktop/src/renderer/dom-hook-harness.ts:1` and `apps/website/src/platform/site-dir/key-only-site-meta.ts:1`. **Answer:** use Jini for reusable behavior under the standing Jini-first rule; keep Tovu site policy in thin adapters. **Smallest change:** inventory real consumers and existing Jini owners, then move one shared owner before changing its callers. Deferred: coordinated package extraction; this patch adds no generic helper or parallel owner. [coverage, merge]

## 126. Are the loose route test-port casts sufficient?

**Today:** `apps/website/src/server/__tests__/helpers/port-fake.ts:1` is the shared helper identified by cov-T3; that report says it checks keys but not method signatures. **Answer:** keep tests asserting real route outcomes, and use method-signature-checked port fakes for new or changed fixtures. **Smallest change:** strengthen the existing helper's type contract and migrate only callers that rely on wrong signatures. Deferred: test-only type refactor needing typecheck by the runner; do not replace production safety behavior to satisfy a fake. [cov-T3]

## 127. Is mocking Playwright at the browser boundary acceptable?

**Today:** `apps/website/src/platform/headless-browser/lazy-browser.ts:1` is the reported lazy boundary; the coverage report says tests fake the third-party import. **Answer:** yes for deterministic port-level unit tests, provided a real-browser smoke test separately proves launch/render behavior. **Smallest change:** none to production code. Keep the mock at the external boundary and never claim that test proves a browser was launched. Browser execution belongs to the separate runner. [cov-T3]

## 128. Should a unit test discover and spawn whichever agent CLI is installed?

**Today:** cov-T3 reports a real detector test; `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts:1` delegates detection to its runtime boundary. **Answer:** use an injected deterministic probe in the unit test and make real CLI discovery an explicit integration check. Owners' machines should not need arbitrary tools installed for unrelated tests. **Smallest change:** bind the existing detector port to a fixture and keep a named live check. Deferred: runner/test-owner work; no CLIs were launched here. [cov-T3]

## 129. Should a leaked root-level chat database be ignored or fixed in tests?

**Today:** `.gitignore:75` protects site-local chat files, while `../jini-int/packages/server/src/kernel-base.ts:154` opens the configured event database. The provfix report observed a root `chat.db`, but no current test was run to reproduce it. **Answer:** fix the test's database path to use its isolated temporary directory; hiding the leak alone leaves private test data and cross-test interference. **Smallest change:** correct the owning fixture once identified; optionally add a narrow root ignore as defense. Deferred: the source test is not identified by the old report, and tests were forbidden here. [provfix]

## 130. Should the existing red tests be assigned a separate follow-up?

**Today:** the reports' failures are historical observations, not fresh results. Current tests include `apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts:1` and `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts:1`; later verification reports already resolve several older failures. **Answer:** yes: have the runner rerun current failures in isolation, distinguish missing services from code defects, and assign only reproduced defects. **Smallest change:** no production patch based only on a stale failure list. This job provides exact tests for its own changes below; full-suite triage belongs to the separate runner. [merge2, verify, main-verify]

# Runner handoff

Run these four changed test files; none has been executed by this job:

- `apps/website/src/features/settings/__tests__/site-title-write.test.ts` — forbidden provider writes fail before persistence; the approved selection path still works.
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/comments-provider-protection.test.ts` — generic PUT now returns 403 and leaves both selection and revision unchanged; clear/reset and aliases remain protected.
- `apps/website/src/platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts` — the duplicate keeps the saved timezone, gains a new identity, resets domain/port, and leaves the source unchanged.
- `apps/desktop/src/sites-mcp-server.test.ts` — normal methods still work; inherited names return the existing unsupported-method response.

Also run these existing nearby regression files:

- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/json-route-parity.unit.test.ts`
- `apps/website/src/platform/site-dir/__tests__/integration/duplicate-site-branches.integration.test.ts`
- `apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-site.integration.test.ts`

Use the repository's existing node:test/tsx/module-mock settings and the desktop package's existing runner. The separate runner must provide any missing published/linked package setup; this job did not install, start a server, launch a browser, run tests, typecheck or measure coverage. The named live site's timezone, provider accounts, DNS records, deployment configuration and production data were never changed.

## Change and reuse record

| Changed file | What changed |
| --- | --- |
| `.cloud-coord/owner-questions-answered.md` | Answers, current-source evidence, recommendations, deferred ownership decisions and runner handoff. |
| `apps/website/src/features/settings/site-title-write.ts` | Uses the existing permission error for an unapproved comments-provider write; keeps the same reason and approval boundary. |
| `apps/website/src/features/settings/__tests__/site-title-write.test.ts` | Checks the permission error while retaining no-write and approved-write assertions. |
| `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/comments-provider-protection.test.ts` | Adds the real PUT route to the fixture and checks 403 plus unchanged comment selection/revision. |
| `apps/website/src/platform/site-dir/duplicate-site.ts` | Carries the already-validated optional source timezone into the new site's existing configuration writer. The private writer now takes one required object and an optional options object. |
| `apps/website/src/platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts` | Adds the source timezone and asserts it survives alongside the original identity/domain/port protections. |
| `apps/desktop/src/sites-mcp-server.ts` | Checks own properties before looking up a request handler; inherited object properties are refused. |
| `apps/desktop/src/sites-mcp-server.test.ts` | Covers three inherited names without weakening existing method tests. |

Reuse: comments-provider refusal; searched the host settings commands/routes and Jini settings error mapper; used the existing `ForbiddenError` already used by clear/reset. Owner remains `site-title-write.ts` plus the existing Jini HTTP mapper.

Reuse: site-copy timezone; inspected `readSiteDir`, `ConfigJson`, init/repair/duplicate code and the Jini platform/desktop-host owners; reused the configuration already returned by the existing site reader, with no extra file read or new generic helper. Tovu owns this CMS site's configuration policy. No dependency or shared package was added.

Reuse: desktop method lookup; inspected the method table, request handler and current tests; used the standard `Object.hasOwn` operation. No parallel router, API wrapper or lookup helper was introduced.

Static architecture review: the three fixes keep existing owners, injected dependencies and error mapping. They add no vendor names in core and touch no do-not-touch files. Existing copy cleanup/last-marker ordering and source immutability remain intact. Every existing explanatory comment was preserved. No generic behavior was added to Tovu, so the Jini extraction backlog rule was not triggered. Broader ownership changes above remain Coordinator follow-ups, not unapproved architecture changes.

| Assessment unit | Static review | Verification still needed |
| --- | --- | --- |
| `refuseUncardedCommentsProviderWrite` | Same two guards, constant work/space; existing permission error reused. | The two changed settings tests and JSON error-mapping regression. |
| `duplicateSite` / `writeDuplicateFolder` | Same I/O lifecycle; one optional field carried from an existing validated read. No added queries or file reads; branch count remains below 10 on manual inspection. Copy cost remains bounded by source size. | SQLite/PGlite copy, failure cleanup and source-unchanged tests above. |
| `handleSitesMcpRequest` | One native own-property check; constant work/space before dispatch, branch count remains below 10 on manual inspection. Existing adapter signature retained for compatibility. | Supported/unsupported methods plus the three inherited-name cases. |

Runtime/coverage assessment remains **unverified** by instruction; no green test result or numeric coverage is claimed. A second static pass checked names, optional-field handling, forbidden-write persistence, inherited-name dispatch and comment preservation. No known new architectural issue was identified in these small patches. Larger privacy, payment, lock, protocol, migration and UI recommendations were deliberately not implemented.

Read-only checks completed: `git diff --check` passed; all cited source paths and line numbers exist; all seven runner test paths exist; numbered answers cover 1–130 without gaps. These checks do not substitute for executing the tests.

## Report sources

Read-only discovery used `git branch -r` and `git show <branch>:<path>`. All `.cloud-coord` report blobs found across cloud refs were scanned for questions and owner decisions: **40 distinct versions**, deduplicated by Git object ID. The first branch carrying identical archived reports was often assistant-runtime; this table gives the exact readable location, not a claim that all those jobs originated on that branch.

For the following labels, the branch is `gh/cloud/assistant-runtime-2026-10-21`:

| Label | Report path |
| --- | --- |
| assistant | `.cloud-coord/assistant-runtime-REPORT.md` |
| analytics | `.cloud-coord/build-analytics-REPORT.md` |
| comments | `.cloud-coord/build-comments-REPORT.md` |
| email | `.cloud-coord/build-email-dns-REPORT.md` |
| plugins | `.cloud-coord/build-plugins-REPORT.md` |
| provfix | `.cloud-coord/build-provfix-REPORT.md` |
| search | `.cloud-coord/build-search-REPORT.md` |
| storage | `.cloud-coord/build-storage-REPORT.md` |
| cov-T1 | `.cloud-coord/cov-T1-REPORT.md` |
| cov-T2 | `.cloud-coord/cov-T2-REPORT.md` |
| cov-T3 | `.cloud-coord/cov-T3-REPORT.md` |
| content | `.cloud-coord/fix-content-REPORT.md` |
| coverage | `.cloud-coord/fix-coverage-REPORT.md` |
| memory | `.cloud-coord/fix-memory-REPORT.md` |
| payments | `.cloud-coord/fix-payments-REPORT.md` |
| providers-a | `.cloud-coord/fix-providers-a-REPORT.md` |
| providers-b | `.cloud-coord/fix-providers-b-REPORT.md` |
| merge | `.cloud-coord/merge-REPORT.md` |

Other labels:

| Label | Branch | Report path |
| --- | --- | --- |
| fill-T2 | `gh/cloud/bug-analysis-2026-10-22` | `.cloud-coord/cov-fill-T2-2026-10-21-REPORT.md` |
| fill-rest | `gh/cloud/bug-analysis-2026-10-22` | `.cloud-coord/cov-fill-rest-2026-10-21-REPORT.md` |
| site | `gh/cloud/bug-analysis-2026-10-22` | `.cloud-coord/fix-site-port-bugs-REPORT.md` |
| merge2 | `gh/cloud/bug-analysis-2026-10-22` | `.cloud-coord/merge2-REPORT.md` |
| commerce | `gh/cloud/commerce-design-2026-10-21` | `.cloud-coord/commerce-design/REPORT.md` |
| verify | `gh/cloud/fix-verify-2026-10-22` | `.cloud-coord/fix-verify-REPORT.md` |
| fix2 | `gh/cloud/fix2-2026-10-22` | `.cloud-coord/fix2-REPORT.md` |
| vendors | `gh/cloud/fix2-2026-10-22` | `.cloud-coord/vendor-to-plugins-REPORT.md` |
| main-verify | `gh/cloud/main-verify-2026-10-22` | `.cloud-coord/main-verify/REPORT.md` |
| brief | This dispatch | Cookie custom categories explicitly requested; no standalone matching question found in the report blobs. |

The remaining scanned report versions were build-mediagen, fix-scheduled, fix-tovu, bug-analysis, a revised cov-T2 report, cov-fill-T3, kuinetic-local, coverage-canary, coverage-full, verify-codex-fixes, verify-coverage-lots, verify-v2 and verify-v3. Their relevant follow-ups and stale-failure evidence were considered; test results quoted by those authors were not treated as this job's verification.

Next assignees: the separate runner for the seven files above; Coordinator for the deferred shared-package, production-policy and ownership decisions; the existing UI owner for visible/translated changes. No commits or pushes were attempted because Git is read-only and the coordinator commits.
