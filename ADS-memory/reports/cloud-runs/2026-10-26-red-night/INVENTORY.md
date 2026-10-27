# RED-run inventory (2026-10-26 night)

Report sources: /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-26-9e-{failing-tests,failing-tests-2,failing-tests-4,t30,sentry-env-test,gemini-blockers,keys-followup}/ (local Mac; not on this branch).
Every file uses node:test. Runner column: `website` / `desktop` / `desktop-renderer` (commands in BRIEF.md).
`RED` = written to fail on this code. `touched` = an existing test the lot edited; may legitimately pass.
Totals: 57 files, 81 RED names, 7 touched-existing names.


## Lot C — custom-credentials rename collisions
- `apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts` [website]
  - RED: "T6: project key renames refuse site-owned and unattached project labels"

## Lot D — desktop webview/boot error/poll race
- `apps/desktop/src/renderer/App.render.test.ts` [desktop-renderer]
  - RED: "T3: navigating away from Websites and back preserves the open admin webview"
- `apps/desktop/src/tovu-server-failures.test.ts` [desktop]
  - RED: "T5: a boot failure after long startup logs reports the final CLI error"
- `apps/desktop/src/renderer/App.hooks.render.test.ts` [desktop-renderer]
  - RED: "T18: a poll started before creation cannot erase the new site and its token notice"

## Lot E — agent-plugins bindings/embeds/tokens/refresh/OAuth/abort
- `apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/delivery-bindings.unit.test.ts` [website]
  - RED: "T7: re-saving a binding preserves its temporarily hidden trashed form ids"
- `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts` [website]
  - RED: "T8: a retired embed remains savable when its old props no longer match the current schema"
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts` [website]
  - touched: "tokens: a confirmed call asks for the account frozen against its own signal"
  - RED: "T13: a confirmed call refuses a token for a connection absent from its frozen approval"
  - RED: "T23: aborting a tool propagates to its in-flight HTTP request even with a plugin signal"
- `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/register.unit.test.ts` [website]
  - touched: "dispose removes every plugin tool from the registry"
  - RED: "T14: an older refresh cannot restore tools withdrawn by a newer refresh"
- `apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts` [website]
  - RED: "T15: re-enabling preserves an operator-edited disabled connection and its OAuth tokens"
- `apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts` [website]
  - RED: "T21: OAuth sign-in respects an operator's explicit plugin-off decision"

## Lot F — forms text caps
- `apps/website/src/features/forms/__tests__/import-remote-submissions.test.ts` [website]
  - RED: "T9: remote imports report the live submit path's default text-length violations"
- `apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts` [website]
  - RED: "T9: the static-host manifest includes default text caps and preserves authored limits"

## Lot G — media duplicate/hash/legacy key
- `apps/website/src/features/media/__tests__/content-duplicate.media.test.ts` [website]
  - RED: "T10: a colliding slug override leaves no half-made media copy"
- `apps/website/src/features/media/__tests__/publish-content.write.test.ts` [website]
  - RED: "T12: malformed bundle hashes are refused before any filesystem blob probe or read"
- `apps/website/src/features/media/__tests__/provider-credential-store.test.ts` [website]
  - RED: "T17: a legacy keyless provider does not block another provider's metadata edit"

## Lot H — deploy-ops content-type, static-publish parser
- `apps/website/src/features/deployments/deploy-ops/__tests__/run-ops.test.ts` [website]
  - RED: "T20: bodyless POST and DELETE omit content-type while JSON writes retain it"
- `apps/website/src/features/deployments/static-publish/__tests__/adapter.plan.unit.test.ts` [website]
  - touched: "readStaticPublishConfig keeps declared string fields, refuses non-strings in JSON mode, and drops unknown keys"
  - RED: "T24: blankAsAbsent refuses non-string declared fields instead of silently dropping them"

## Lot I — source-control rotation/rename/branch/selectors/errors
- `apps/website/src/features/source-control/__tests__/store.unit.test.ts` [website]
  - RED: "T26: token-only rotation retains the saved provider"
  - RED: "T36: blank-token patches refuse changes to other connection fields"
- `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts` [website]
  - RED: "T27: renaming a project credential refuses a label already claimed by this site"
  - RED: "T35: ambiguous site credentials never fall back to a shadowed project default"
- `apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts` [website]
  - RED: "T28: commit targets reject traversal and malformed Git branch names"
  - RED: "T37: plugin exceptions and unknown error codes become safe PROVIDER_ERROR outcomes"

## Lot J — posts compensation/revert/schema/revisions
- `apps/website/src/features/post/__tests__/publish-content.terms.test.ts` [website]
  - RED: "T31: a term write failure after importing a post removes the unrecorded post"
- `apps/website/src/features/post/__tests__/publish-content.test.ts` [website]
  - RED: "T32: reverting a retirement from history restores the holder's original free slug"
- `apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts` [website]
  - touched: "create results link to the public slug when published, and update removes that link when drafted"
  - RED: "T33: the update body schema accepts an empty editor paragraph and preserves existing widget styling"
- `apps/website/src/features/post/__tests__/reverters.test.ts` [website]
  - touched: "reverting a delete of a post that no longer exists fails loudly, naming the post"
  - RED: "T34: reverts record their new revision and preserve an edit committed after their read"

## Lot K — site-backup staging budget
- `apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts` [website]
  - RED: "T25: interrupted verification and orphaned payloads release the staging budget without discarding live owner setup"

## Lot L — publish-trust 503 + OIDC 303
- `apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts` [website]
  - RED: "T43: a keyless session response does not disclose whether the source has a grant"
  - touched: "POST /session answers 500 rather than hanging when the grant store throws"
- `apps/website/src/server/__tests__/routes/member-oidc-callback.unit.test.ts` [website] (new file)
  - RED: "T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page"

## Lot M — site-dir lock + backup cleanup
- `apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts` [website]
  - touched: "a source the owner lock cannot even be taken on is an InternalError naming the target"
  - RED: "T38: a synchronous source-open failure releases the owner lock"
- `apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts` [website]
  - RED: "T42: a completed file undo reclaims its backup and keeps another pending undo"

## Lot N — cookie-consent passthrough + /64 limits
- `apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.regressions.unit.test.ts` [website] (new file)
  - RED: "T40: end-only HTML over 4 MiB and empty HEAD responses pass through with their validators"
  - RED: "T41: collector requests from rotating IPv6 addresses share one /64 rate budget"

## Lot O — lifecycle/shutdown/supervisor
- `apps/website/src/server/__tests__/unit/boot-lifecycle.unit.test.ts` [website]
  - RED: "T45: critical start failure releases resources of modules prepared but not yet started"
- `apps/desktop/src/product-telemetry-ipc.test.ts` [desktop]
  - RED: "T46: telemetry from a frame disposed during delivery is dropped without throwing"
- `apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown.test.ts` [website]
  - RED: "T47/runtime-0#3: beforeExit stops the daemon before closing its shared store"
- `apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts` [website]
  - RED: "T47/runtime-0#5: stderr overflow retains the later fatal tail"
- `apps/website/src/server/runtime/lifecycle/__tests__/serving-host-singletons.unit.test.ts` [website]
  - RED: "T47/runtime-0#6: a binding can assemble a usable supervisor after its prior host shuts down"
- `apps/website/src/platform/site-dir/__tests__/unit/local-site-supervisor.unit.test.ts` [website]
  - RED: "T47/site-dir-1#2: a crash queued behind Stop cannot overwrite the stopped state"
- `apps/website/src/platform/site-dir/__tests__/unit/local-site-child.unit.test.ts` [website]
  - RED: "T47/site-dir-1#3: owner loss during a pending bundle build prevents the later site import"

## Lot P — site-backup plans + share origins
- `apps/website/src/features/site-backup/__tests__/plan-store.unit.test.ts` [website]
  - RED: "T48: other principals and workspaces cannot evict a caller's live backup plan"
- `apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts` [website]
  - RED: "T48: an unparseable public origin raises a typed STORAGE_SETUP refusal"
  - RED: "T48: an invalid runtime origin falls back to object storage or private ZIP delivery"

## Lot T30 — member rate limits (owner rule 10-26)
- `apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts` [website] (new file)
  - RED: "T30: an already limited IP cannot consume a victim's email or identity budget"
  - RED: "T30: Retry-After and its JSON detail report the longest applicable wait"
- `apps/website/src/server/__tests__/routes/member-password-auth.test.ts` [website]
  - RED: "T30: password limits check normalized email only after IP admission"
  - RED: "T30: forgot and sign-in skip the shared email counter when their IP is denied"

## Lot SENTRY — Sentry environment from saved setting
- `apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts` [website]
  - RED: "1: saved provider environment wins over the host default; blank uses host and release stays host-owned"

## Lot SHARE-CONSENT — share rebuild keeps consent tables (already in HEAD via 912cc951a)
- `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts` [website]
  - RED: "S6: shared sites preserve published cookie-banner settings and the separate draft"

## Lot GIT-BACKUP — GitHub backup leaks secrets
- `apps/website/src/features/source-control/__tests__/github-backup-secrets.integration.test.ts` [website] (new file)
  - RED: "SEC-1: GitHub backup excludes password hashes, sessions, magic-link tokens and sealed vault rows"

## Lot GEM-A — publish credential choice/renames (fix NOT applied)
- `apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts` [website]
  - RED: "credentialId: readiness selects a named non-default key without decrypting an ambiguous inventory"
  - RED: "credentialId: readiness refuses missing, foreign and incompatible IDs despite a valid default"
  - RED: "credentialId: neither composed nor env readiness falls back for an unavailable saved connection"
- `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts` [website]
  - RED: "preview and execute use the chosen credential when two compatible keys have no default"
- `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts` [website]
  - RED: "readiness honors an attached project key among non-default peers and refuses an unattached key"
  - RED: "a project rename cannot be hidden by a site-owned label, including a provider move"
  - RED: "create and rename translate hidden project label conflicts without attaching or changing either row"
  - RED: "a stale project update remains a CAS conflict when no other row owns the requested label"

## Lot GEM-B — consent OFF + legacy text + inventory cap (fix NOT applied)
- `apps/website/src/features/consent/__tests__/service.test.ts` [website]
  - RED: "deployment accepts explicit OFF before validating legacy or published copy; enabled copy stays strict"
  - RED: "legacy editor reads default only invalid text without changing activation or stored state"
  - RED: "legacy editor reads preserve valid text at each limit and an empty optional link label"
- `apps/website/src/features/consent/__tests__/readiness.pins.test.ts` [website]
  - RED: "inventory caps at 200 entries and distinguishes an exhausted head from more templates"
  - RED: "${count} body items report truncation only when another gated item exists"
  - RED: "a dry run at exactly 200 gated items remains complete with ordinary DOM nodes left"

## Lot KEYS — keys follow-up attach/rotate (fix NOT applied)
- `apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts` [website]
  - RED: "credential_save projects the shared attachment result for direct and plugin-owned saves"
- `apps/website/src/features/form-destinations/__tests__/key-store.unit.test.ts` [website]
  - RED: "a receiver key stays site-owned with a project store and republishing reuses the installed secret"
- `apps/website/src/features/project-keys/__tests__/tools.unit.test.ts` [website]
  - RED: "save attaches to this site immediately, and detach leaves the saved row"
  - RED: "a committed provider save attaches immediately and retains the restart outcome"
- `apps/website/src/server/__tests__/routes/mail-providers-route.test.ts` [website]
  - RED: "mail card saves attach the project key immediately and re-saving rotates that same key"
- `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/provider-settings-route.unit.test.ts` [website]
  - RED: "a provider settings save attaches to this site and reopening shows the saved fields"
- `apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts` [website]
  - RED: "site values win; unattached project values stay hidden; a different key on B leaves A unchanged"
  - RED: "a project provider save commits its attachment before returning usage"
  - RED: "an attached project's migrated OTel choice feeds boot, both cards and the next save without secret re-entry"
- `apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts` [website]
  - RED: "browser restart after a committed attached save produces a success card with reload guidance"
  - RED: "the chat card saves the provider's settings into the PROJECT store, not the site vault; the key never reaches the result, transcript or model input"
  - RED: "the chat save refuses a missing conditional token with exact guidance and accepts explicit no auth"
  - RED: "provider_status reports presence only: configured, missing, store, never a value"
- `apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` [website]
  - RED: "installed + enabled + configured provider plugin boots through the real composition root (no TDZ fallback to noop)"
  - RED: "two sites of one project: settings saved from site A land in project.db and configure site B's provider"

