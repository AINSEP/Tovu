SHEETS P4 COMPLETE: 18 sheets (4 Jini / 14 Tovu), 18 OPUS-REVIEW, 0 files move

| Item | Status on merge-23 | Disposition |
|---|---|---|
| T3b admin JSON and capped content | Open | **323 direct calls in 65 files**, plus **10 calls through injected `adminPorts.mount` in 4 more files**. Eight batches of 8–9 caller files cover all 69. The report’s 53-file estimate is stale. |
| T3b public JSON, raw and direct kit mounts | Open | Four sheets cover the public JSON and raw callers. They also close the direct site-import and private tool-preflight mounts that would otherwise fail the retirement gate. |
| T5 test-only proof | Landed | Tovu `671bbb0250` is in HEAD. All three named tests are present. Do not replay or add production changes to that commit. |
| J4 item 3 | Production retirement landed | Jini `c452c0c6c` and baseline follow-up `c157d4410` are in HEAD. Retire the remaining **test imports of the old kit export** before removing the export. Do not replay the 14 production edits. |
| J3a / J3b | Written, gated | **Do not apply either breaking sheet until the Tovu consumer gate is cleared.** |

Verified against Tovu `bf1519bba7329e0637eee4a6600dbdaba48f83db` and Jini `ad71bf68dee9907ce4db8fe86dcb8d1ffd06e8ba`, both matching the fetched merge-23 refs. The worktrees were clean. No files changed and no tests, builds, installs, or type-checks ran.

**Build order** is J0 → J4-F → T0 → A1–A8 → P → R1–R3 → T-GATE → J3a → J3b. The independent Jini work goes first. The two breaking Jini sheets go last because executing them before T3b would reject still-unbound mounts. Opus reviews and tests the Sol commits. There is no Opus implementation prerequisite.

### Shared sheet rules

`S/` means Tovu `apps/website/src/server/`. `M/`, `H/`, `I/`, and `V/` mean `S/runtime/composition/modules/`, `S/runtime/composition/http-app/`, `S/inbound/admin-http/`, and `S/inbound/public-http/`. `J/` means Jini `packages/`. Re-anchor by symbol at build time and account for any commits after the two SHAs above.

- Use `RouteErrorPorts` from `@jini-ai/core/contracts/server`. Bind the existing site reporter at registration. Keep Express, the site reporter construction, host-specific copy, and origin policy on the host side. Do not add the reporter to a spec’s `deps`, mutate `RouteDeps`, use `app.locals` as a mount registry, or replace the reporter for a capped app or router.
- Keep the existing route order, names, paths, parsers, headers, authentication gates, authorizer choices, status and reply envelopes. Keep why-comments with their logic, the two-object convention and existing `_optional = {}` pads. Functions ≤80 lines and complexity ≤10. Under strict TS, omit absent optional keys, narrow indexed results, and do not add assertions to make missing ports compile.
- No route specs, themes, screens, or other sources move. No import **path** repoints in A1–A8 or P/R except the named type or fixture imports. For changed registrar signatures, the required repoints are the same-symbol callers, including tests and callers that pass a registrar by reference. Use `git grep -n -w -e '<registrar>' -e '<factory>' -- apps` for each named anchor, including aliases and untracked-at-build additions by inspecting the worktree diff. For the batches, the mount lines identify the containing registrar even where the declaration is not enumerated. Repoint **every** returned caller or contextual registrar type, not just the main module caller.
- Every Tovu sheet has **no package export-map change, no changeset, and no API-baseline delta**. During the staged cut use the paired Jini source, not a fabricated published version. The coordinator reconciles the Tovu root `package.json` ranges and `package-lock.json`, including the installed core/http-kit/server/daemon closure, after the compatible artifacts exist. Don’t change an app manifest unless it directly consumes a changed package. No package publish is part of a sheet.
- Sol writes the named tests first and records the mutation to try. Opus runs the baseline, target tests, mutation, strict type-check and applicable guards. No fixture weakens an existing assertion to make a new binding pass.

## 1. J0 — Preserve an Express host’s error routing in reporter mode

**BUILDER: SOL · OPUS-REVIEW**

**Why this comes first.** Tovu’s folder-picker and custom-root mounts deliberately throw out of their `onError` port to reach `asyncRoute` and Express error middleware. Jini’s current reporter mode catches that throw in `adapter.ts:185–187`, describes the original, and supplies its own reply. Also, a pre-header write failure that used to go through the host writer now goes straight to the kit’s generic transport reply. Switching those mounts without a compatibility choice changes behavior.

**Tests first** in `J/http-kit/src/__tests__/adapter-reporter.test.ts` and `raw-route-reporter.test.ts`.

- `an opted-in host policy rejection reaches Express unchanged after the operation ends`. Check the thrown object’s identity, one end, zero kit records and zero kit writes on that branch. The middleware must still select the status. Mutation `swallow-forwarded-policy-error` replaces propagation with the reporter’s generic reply.
- `an opted-in pre-header JSON or buffered raw write failure uses the existing host writer once`. Assert the same host-selected status/body, one host record, no extra operation, and no retry of `handle`. Mutation `bypass-host-write-policy` emits the kit envelope instead.
- Keep the existing unopted policy-failure test, including a distinct policy incident and the original incident ID in the reply. Retain the post-header raw stream cut and disconnect tests.

**Edit.** Add `readonly preserveHostErrorRouting?: true` to `RouteMountOptions<Deps>` in `J/http-kit/src/types.ts:46–63`. The option is an Express transport choice and must not enter core specs. Keep the existing mount signatures and second-object defaults for this sheet.

- JSON: extend the `mountOptions` pick at `adapter.ts:82` and add `readonly forwarded?: { readonly error: unknown }` to `ExpressAnswer` at `:93–96`. In `hostPolicyAnswer` at `:177–190`, when the option is set and `onError` throws, return a failed verdict and the thrown **policy value**, with `write: noWrite`. Do not record it in the kit. After `runOperation` settles at `:139–155`, rethrow the forwarded value outside `deliver`. For unopted callers keep the existing policy-record/original-error branch. In `deliver` at `:218–230`, if the write throws before headers and the opted-in host has `onError`, call it once with the write error and return. Let a rejection from that writer escape. Otherwise keep the existing transport path.
- Raw: mirror the tagged forwarding at `raw-route.ts:61–66,124–181` and the pre-header writer dispatch at `:225–239`. Retain the abort-like check before a write-failure policy call. Never invoke an opted-in writer after headers have gone out. Share a small private decision helper if needed to stay below complexity 10. Test raw with a response that fails while being buffered, not by retrying a partial stream.

**API.** Existing `@jini-ai/http-kit` root export of `RouteMountOptions`, `index.ts`; no `package.json` export change. Add minor `.changeset/http-kit-preserve-host-error-routing.md` and update `api-baseline/jini-ai__http-kit.json` for the option. No consumer turns it on until T0.

## 2. J4-F — Remove daemon fixtures’ imports of the retiring kit export

**BUILDER: SOL · OPUS-REVIEW**

**Tests first.** Extend `J/daemon/src/http/__tests__/route-incident-reporter.test.ts:19–69` with `a fixture-host incident exposes the same ERR id it records and no cause`. Check one recording entry, matching `requestId`, and a synthetic private canary absent from the response. Mutation `fixture-uses-second-id` replaces only the returned ID. Retain the existing regression that deliberately passes a retired option and checks the route never forwards it.

**Edit and repoints.** In `J/daemon/src/http/__tests__/fakes/route-host.ts:57–76` add a **test-only** fixture builder with signature `createRouteTestErrors(_required: Record<string, never> = {}, _optional: Record<string, never> = {})`. Return the recording reporter, its entries/reports, `errors: RouteErrorPorts`, and `reportInternalError` bound with `createReporterRouteInternalError({ reporter })`. Use `createRecordingReporter` with fixed ISO and deterministic ERR IDs, and a no-op operation port unless a test records operations. Create one per test setup. Do not replace the existing structured `recordIncident` fixture used by tests that assert provider/source/run metadata.

These are the daemon imports of the old kit value found in the pinned tree. Repoint the import **and its value uses** to the recording fixture or, for a mounted path, to that host’s own `reportInternalError`.

- `args-convention.test.ts:1`, `connectors.test.ts:1`, `daemon-status.test.ts:4`, `db-ops.test.ts:1`, `media.test.ts:1`, `integration-contracts.test.ts:1`
- `delegated-tools.test.ts:1`, `delegated-tools-host-described-internal-error.test.ts:1`, `delegated-tools-host-safe-failure.test.ts:1`, `delegated-tools-status-mapping.test.ts:1`, `delegated-tools.obtain-from.integration.test.ts:1`, `delegated-tools.unknown-tool.integration.test.ts:1`
- `research.test.ts:1`, `research-ports.test.ts:1`, `research-handle.test.ts:1`, `remote-run-events.test.ts:1`, `run-messages.test.ts:1`, `runs.test.ts:1`, `terminals.test.ts:1`, `tool-execution-rpc.test.ts:18`
- `frontend-control.test.ts:4,51` and `fakes/mount-attachments.ts:7,18`. Bind to the reporter of the context being tested when it is provided. Otherwise construct one recording context for the mounted fixture. Don’t use a second reporter on the same host.

Preserve domain assertions. Where a test actually asserted the old request-ID format or default sink, assert the replacement’s one record and correlated ERR ID. `provider-plugins/src/xai/__tests__/routes.test.ts:54` is a **local variable**, not this import. `daemon/src/http/runs.ts:88` and `terminals.ts:96` still describe the removed default. Rewrite those why-comments to explain the injected owner, without changing behavior. Leave run-lifecycle, event-cleanup, and federated-refusal callback contracts alone.

**API.** No new package export, production API-baseline change, or changeset. Preserve `.changeset/daemon-route-tool-reporter.md` and the landed daemon baseline. `git grep -n -w reportRouteInternalError -- packages/daemon/src/http` must have no remaining import or obsolete comment at the end of this sheet.

## 3. T0 — Install the Tovu registration seam

**BUILDER: SOL · OPUS-REVIEW**

**Tests first.** In `I/__tests__/admin-json-route-ports.test.ts`, add `bound admin mounts use one site reporter without changing the failure envelope` and `an opted-in admin rejection still reaches Express error middleware`. Use a fixture operation recorder to detect omission of `adapter.errors` even if `res.locals.failureReporter` was set by the test. Check the flat admin error shape, ERR ID equality, and exact error identity at `next`. Mutation `omit-errors-from-wrapper-adapter`.

**Host signatures and wiring.**

- `S/runtime/composition/app.ts:434,447,461–485`: build one `{ reporter: failureReporter, observability: NO_OPERATION_TRACKING }` after `siteFailureReporter`. Pass it as `errors` to the seven existing composition mounts and `applyPublicMiddleware` at those same statements. Keep `res.locals.failureReporter` for existing handwritten and request-owned paths. Don’t rebuild the reporter from another set of deps. `mountMembersNewsletter` **already** has a separate report-only `reporter` for detached work. Keep that identity and responsibility.
- `M/types.ts:19–26`: extend the existing handle with `ServerModuleHandle<Registration extends { app: Express } = { app: Express }>` and use `Registration` in its `registerRoutes` property. Add the host-local type `RouteRegistration = { app: Express; errors: RouteErrorPorts }`. Old handles accepting `{ app }` still work as inputs to the richer host. Only converted handles return `ServerModuleHandle<RouteRegistration>`.
- `H/module-handles.ts:15,26–33`: keep `MountInput` for untouched helpers. Add `ErrorBoundMountInput = MountInput & { errors: RouteErrorPorts }`. `mountRoutes({ app, mod, errors }: { app: Express; mod: ServerModuleHandle<RouteRegistration>; errors: RouteErrorPorts }, _optional = {})` delivers `{ app, errors }`. `startModule` needs only `Pick<ServerModuleHandle, "start">`. Add `errors` to every `mountRoutes` call in `H/{mount-core-content,mount-members-newsletter,mount-admin-system,mount-admin-features,mount-assistant,mount-admin-data,visitor-submit}.ts` and pass the same binding through any private helpers that reach those calls. The core, Forms and Widgets factories can use their already-required `errors` argument rather than a second binding.
- Registry stage pattern for later sheets: keep factory dependencies as they are. A module that reads the new port obtains it in `registerRoutes: ({ app, errors }, _optional = {}) => …` and forwards it in the required object of **only** the affected registrars. Add `errors: RouteErrorPorts` to those registrar signatures, including any route-family callback types that contextually type them. Do not add errors to the default registrar type for unrelated handwritten modules.

**Wrappers.** `I/admin-json-route-ports.ts:439–463,471–479,505–512` and `I/admin-raw-route-ports.ts:26–50,80–95` gain `errors?: RouteErrorPorts` on their existing required argument objects **only during rollout**. Change policy-only annotations from `RouteHostContext` to core `OriginContext`. Use a small host helper with this contract:

```ts
function routeAdapterFor(
  { origin, errors }: {
    origin: OriginContext | undefined;
    errors: RouteErrorPorts | undefined;
  },
  _optional: Record<string, never> = {},
): { adapter?: RouteHostContext }
```

If `errors` is absent, return the old result, either the given origin context or no adapter key. If bound, return `{ adapter: { ...(origin ?? denyUnboundOrigin), errors } }`, where `denyUnboundOrigin` is a fixed policy returning `false`. For admin JSON, choose an origin only when `spec.requireSameOrigin`, using the caller override or the existing `adminBrowserWriteOrigin`. For raw, preserve the existing path-specific startup error when a same-origin spec lacks an explicit origin. Never substitute the deny policy for that startup check. Public JSON has no opt-in origin caller in this cut. Fail closed if one appears.

Set `preserveHostErrorRouting: true` on the **bound** Tovu shared wrapper calls to the kit, preserving existing body parsers and request deps. Keep the same named or async-wrapped Express registration. Bind the reporter explicitly into the shared `onError` closures using an optional `{ reporter?: Pick<ErrorReporter, "record"> }` on the existing port builders. Keep `AdminJsonRoutePortDeps` limited to `{ workspaceId, authorize }`. In `writeAdminFailure` at `:295–313`, preserve `failureFor`’s single evaluation and phase order, pass the bound reporter to `sendAdminFailure`, and pass it into the operation-only `adminFailureResponse` path too. Reuse `wasAdmittedInRequest` from `S/inbound/shared/request-admissions.ts:44` for same-error tracker suppression on the latter path. At `:394–410` keep the visitor’s own failure copy and `errorId` key. Custom `failureWriter`s remain owners of their replies. No wrapper adds a second record around a custom writer.

## 4–11. T3b admin JSON batches

All eight batches use T0’s signature and registry pattern. At **every** line below, add `errors` to the existing mount’s first object, beside `app`, not inside `deps`. For `adminPorts.mount`, add `errors: RouteErrorPorts` to the existing `adminPorts` bundle, then forward `errors: adminPorts.errors`. Keep the same `mount` function reference. The rows below are the `git grep` inventory after excluding declarations, imports, comments, tests and the three reference-only injections. Numbers are pre-edit lines.

Use the existing `S/__tests__/helpers/route-incident-reporter.ts:32–40` fixture at newly required fixture edges. For each named batch test, override the fixture’s operation port with a recording `trackOperation` via object spread. Drive the named mounted route with deterministic ports and assert one operation with the registered pattern. The mutation removes **only** that mount’s `errors`, so it cannot pass just because the request-local reporter was installed. Batch tests go in `I/__tests__/admin-route-reporter-batches.test.ts`.

### 4. A1 — Content, capped writes and theme authoring

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `M/content.ts` | 217, 225, 273 |
| `M/posts.ts` | 41, 56, 66, 98, 106, 110 |
| `M/pages.ts` | 61, 76, 102, 111, 123, 132 |
| `M/change-sets.ts` | 37, 48, 65 |
| `M/email-templates.ts` | 66, 67, 69–73 |
| `M/presentation.ts` | 76, 87, 113 |
| `M/themes.ts` | 37, 50 |
| `M/theme-explore.ts` | 90, 98, 106, 128, 141, 149, 163, 175, 185 |

`createContentModule` at `M/content.ts:281–327` supplies the binding to this family. At `M/posts.ts:40–41,55–56,97–98`, pass it beside `app: capped`; `capped-route-app.ts` is only the Express view. Preserve the cap in the same registration, before any kit lifecycle. No move of theme code or of the template-preview raw route.

**Test first:** `post create rejects over-cap before starting a route operation, and admits the same binding below cap`. Pin the existing 413 body and zero operations above cap, one below. Mutation `drop-capped-post-errors` at `posts.ts:41`.

### 5. A2 — Editorial, taxonomy, configuration and widgets

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `M/content-types.ts` | 135, 140, 144, 148, 152, 162, 166, 170 |
| `M/taxonomy.ts` | 54, 62, 85, 92, 96, 110, 114, 118, 123, 149, 159, 170 |
| `M/menus.ts` | 72, 76, 81, 89, 97, 109 |
| `M/comments-moderation.ts` | 83, 95, 100, 108 |
| `M/redirects.ts` | 49, 53, 58, 63, 67, 71, 75 |
| `M/settings.ts` | 78, 82, 86, 90, 94, 98, 102 |
| `I/routes/themes/held-back.ts` | 88, 92, 96, 102 |
| `M/widgets.ts` | 177 |
| `M/seo.ts` | 99, 122, 126, 132, 143, 147 |

`H/mount-admin-data.ts:25–45` supplies content types, taxonomy, separate `registerAdminTaxonomyMergeTermRoutes` and SEO. `H/mount-admin-features.ts:42–50,116–126` supplies comments, menus, widgets, settings, redirects. `M/theme-held-back.ts:16–20` supplies its registrar. `M/widgets.ts:197–219` uses the already injected factory port for just the additional preview mount. Don’t replay the landed direct Widget bindings.

**Test first:** `menu update retains its two authorization sources with the site route binding`. Pin permission order, guarded/direct choices and the operation. Mutation `drop-menu-update-errors` at `menus.ts:89`.

### 6. A3 — Access, members, mail subscriptions, trash and workspaces

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `I/routes/api-keys/create-principal.ts` | 9 |
| `I/routes/api-keys/issue.ts` | 9 |
| `I/routes/api-keys/revoke.ts` | 9 |
| `M/users.ts` | 90, 94, 98, 103, 111, 123, 134, 138, 142 |
| `M/users-access.ts` | 65, 70, 79, 89, 93, 97, 101, 105, 109, 113, 121 |
| `M/members.ts` | 85, 90, 109, 120, 139 |
| `M/newsletter.ts` | 155, 160, 165, 171, 176, 182, 207, 220, 226, 232, 238, 263, 268, 273, 278, 283, 288, 294, 305 |
| `M/trash.ts` | 121, 129, 135, 141 |
| `M/workspace.ts` | 57, 69, 73, 77, 81 |

`M/api-keys.ts:19–25` binds the three API-key registrars. Update their contextual type at `I/routes/api-keys/deps.ts:48`. `createUsersModule` at `M/users.ts:145+` also supplies the `users-access` registrars. `H/mount-members-newsletter.ts:40,52` supplies the two handles without merging their admin/public deps. Pass the binding through `createAdminNewsletterSendCampaignRoute` at `M/newsletter.ts:197–212`, including the factory-backed registrar. `H/mount-admin-features.ts:87–116` supplies Trash, users, API keys and workspace.

**Test first:** `API-key issue keeps its refusal and records no credential in the bound route operation`. Use inert test credentials and assert the existing refusal status/body, operation pattern, and zero records for the refusal. Mutation `drop-key-issue-errors`.

### 7. A4 — Assistant, plugins and external services

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `M/agent-plugin-admin-surfaces-routes.ts` | 74, 77, 82 |
| `M/agent-plugin-memory-routes.ts` | 45, 49 |
| `M/agent-plugins-routes.ts` | 123, 133, 147 |
| `M/assistant-chats.ts` | 321–324 |
| `M/assistant-execution.ts` | 152, 198, 228, 248 |
| `M/assistant-settings.ts` | 181, 205, 206, 217, 225, 237, 244, 254, 266, 273 |
| `M/external-mcp.ts` | 94, 104, 117, 130, 139, 143, 151 |
| `M/plugins.ts` | 125, 134, 147, 185, 196, 197, 239, 240, 245 |
| `M/skills.ts` | 78, 86, 109, 111, 113, 115 |

Follow `M/agent-plugins.ts:42–54`, `H/mount-admin-features.ts:52–63,101`, and `H/mount-assistant.ts:81–98`. Inject chat cleanup at `assistant-chats.ts:301,311,474`; the four calls still use the injected mount and origin. Bind `registerPluginProviderSettingsRoutes` through the same plugin module path. The private tool preflight in `M/assistant-tool-exec.ts:113` is covered in P, not via the browser admin wrapper.

**Test first:** `chat cleanup uses the injected route binding and preserves the owner check`. Assert cross-owner refusal before the cleanup port is called. Mutation `drop-chat-cleanup-errors` at `assistant-chats.ts:322`.

### 8. A5 — Publish-content, integrations and Forms

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `M/publish-content-backstop.ts` | 210, 211, 219, 220, 224 |
| `M/publish-content-blobs.ts` | 44, 59 |
| `M/publish-content-import.ts` | 172–175 |
| `M/publish-content-ingest.ts` | 56, 80 |
| `M/publish-content-transport.ts` | 63, 66, 69, 71, 123, 125, 126, 138 |
| `I/routes/publish-content/blobs-probe.ts` | 18 |
| `M/integrations-admin.ts` | 94, 113, 125, 136, 140 |
| `M/forms-admin.ts` | 72, 77, 81, 93, 107, 116, 124, 128, 135 |

`M/publish-content.ts:44,71–91` binds its registrars, including the inline destination `own` object unchanged and the blob probe’s shared type in `I/routes/publish-content/deps.ts:94`. `H/mount-admin-features.ts:63,122` binds integrations and Forms. Forms uses its existing factory port at `forms-admin.ts:183–200`; do not modify the already-bound direct pull at `:169–175`. The raw export at `publish-content-blobs.ts:34` is R2.

**Test first:** `blob probe preserves malformed-input precedence while bound to the site reporter`. Pin its existing 400-before-session behavior and the operation. Mutation `drop-blob-probe-errors`.

### 9. A6 — Sites, storage and deployment

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `H/mount-admin-system.ts` | 64, 79, 81, 92, 105, 120, 235 |
| `I/routes/sites/sites-home.ts` | 59 |
| `M/sites.ts` | 79, 82, 149, 191–193 |
| `I/routes/system/dockerfile-source.ts` | 23, 24 |
| `M/storage-routes.ts` | 190, 195 |
| `M/screenshot-storage.ts` | 92, 93 |
| `M/revision-thinning-routes.ts` | 88, 89 |
| `M/site.ts` | 40 |
| `M/system-deploy.ts` | 155, 241, 247, 266, 267, 270 |

`H/mount-admin-system.ts:125–132,152–160,179–209` supplies its private `mountObservability` and `mountSiteAdmin` chains, and the injected storage bundle at `:127–128`. `M/sites.ts:74–82,139–158,185–208` passes through home, support, local and site-spec registrars. `M/screenshot-storage.ts:42,105–118` binds `mountScreenshotCleanup`; `M/storage-routes.ts:46` and `M/revision-thinning-routes.ts:36` update their bundle type. Revision thinning has **no production caller**. Update its provided-port fixtures only and do not activate it. Change those policy-only `origin` annotations and the chat cleanup one to `OriginContext`.

**Test first:** `storage cleanup keeps the owner-only refusal and uses its injected route binding`. Mutation `drop-storage-cleanup-errors` at `storage-routes.ts:195`.

### 10. A7 — Analytics, media, mail, consent and routines

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `I/routes/analytics/recent-hits.ts` | 56 |
| `I/routes/media/list.ts` | 15 |
| `M/system-mail.ts` | 71, 106, 108, 111, 140, 141, 167, 238, 239, 241, 243, 245, 250, 251 |
| `I/routes/system/mail-providers.ts` | 63 |
| `M/system-telemetry.ts` | 30 |
| `M/media.ts` | 179, 201, 250, 255, 260, 273, 286, 293, 313, 321, 329, 339, 380, 400 |
| `M/serving-routines.ts` | 137 |
| `M/commerce.ts` | 31 |
| `M/consent.ts` | 39 |

- Follow `M/analytics.ts:14–18` to recent hits and `M/media.ts:424–455` to `registerAdminMediaListRoute` and the other media registrars. Keep recent hits’ request-time `authorize` lookup and its nested custom envelope. At `recent-hits.ts:42–59`, bind the reporter into its existing custom writer’s `adminFailureResponse`. Keep its authorized-only details gate.
- `H/mount-admin-system.ts:152–175,251–256` forwards errors to telemetry, mail and consent. `M/system-mail.ts:103–111` also forwards the same input to `registerAdminMailProviderCredentialSaveRoute`. Commerce-status has fixture callers at `S/__tests__/route-async-guards.test.ts:455` and `S/__tests__/routes/commerce-status-adapter.integration.test.ts:19`, not a production mount to activate.
- `M/serving-routines.ts:73–91,126–137` adds `errors` to `ServingRoutinesRequired`. In `S/runtime/composition/serving-app.ts:149–158`, get the site reporter once with `siteFailureReporter({ routeDeps }, {})` and pass it to both `createApp` as `errorReporter` and the routine binding as `errors.reporter`. Export that existing host-only helper from `app.ts:434`; `serving-app.ts` already imports `createApp` from that module. Repoint `M/__tests__/serving-routines.integration.test.ts:38`. Keep the router slot, startup barrier, release flags and eligibility conditions exactly as they are.

**Test first:** `the routine route uses the serving-site reporter without changing admission`. Pin the session-only denial and keep the dark-default test. Mutation `drop-routine-slot-errors` at `serving-routines.ts:137`.

### 11. A8 — Files, credentials, owner grants and recovery

**BUILDER: SOL · OPUS-REVIEW**

| Caller file | Mount lines |
|---|---|
| `I/routes/fs-files/custom-root.ts` | 68, 69, 72 |
| `I/routes/fs-files/folder-picker.ts` | 72 |
| `M/system-credentials.ts` | 176–178, 184, 188, 246, 252, 256, 261, 472, 478, 481, 482 |
| `M/system-credential-copy.ts` | 45, 46 |
| `M/system-assistant.ts` | 60, 61 |
| `M/database-migrate-forward.ts` | 90–92 |
| `M/database-recovery.ts` | 106, 113, 122, 139, 150, 158, 166, 174 |
| `M/recovery-restore.ts` | 108–110 |

`H/mount-admin-system.ts:184–186,251–286` passes the site binding into file, credential and assistant owner-grant registrars. Preserve the spread through `registerAssistantOwnerGrantRoutes` at `system-assistant.ts:53,66–68,109–110`. `H/mount-admin-data.ts:36–37` supplies migrate-forward and restore. `H/mount-admin-features.ts:136` and `M/database-recovery.ts:181–194` supply the database-recovery family. No migration files or changes to migration behavior.

**Tests first:** `folder-picker forwards the unclaimed error and writes the claimed failure once` and `custom-root keeps distinct GET DELETE and PUT error policies`. Pin original `next(error)` identity, existing middleware status passthrough, one evaluation of `failureFor`, and no extra incident. Mutation `bypass-forwarding-on-bound-picker` removes the compatibility choice from the bound branch.

## 12. P — Public JSON and two additional direct kit mounts

**BUILDER: SOL · OPUS-REVIEW**

**Tests first.** In `I/__tests__/admin-route-reporter-batches.test.ts`, add `health keeps visitor-safe copy and records one matching ID when its first write fails`. Use the real `/health` registration, fail the first pre-header `res.json`, and verify one operation and one record with the reply’s `errorId`. Mutation `drop-health-adapter-errors`. Retain the existing site-import wire suite and private plugin-preflight caller-gate fixtures.

**Edit.**

- `M/core.ts:62–78,110–117`: bind health and healthz with the factory’s existing `errors`. Type just those registrars `(required: RouteRegistration, optional?: Record<string, never>) => void`; leave `registerReadyzRoute` and its `NoDepsRouteRegistrar` alone. Forward errors to `registerPublishTrustHandshakeRoutes` at `M/publish-trust.ts:85,94–99`. Preserve the unauthenticated handshake placement and its existing keyless/limiter behavior.
- `M/public-members.ts:128,171,195,213,239,259,297`: add the required binding and pass it through `M/members.ts:171–190,231–245`. Keep the explicit report-only dependency for detached delivery and the fallback registrations when there is no OIDC configuration. Don’t send admin authorization deps to the public family.
- `V/routes/content/posts/get-by-slug.ts:39,54` is supplied by `H/mount-core-content.ts:37`. `V/routes/site/search.ts:38–40` is supplied by `H/mount-admin-data.ts:48`. Convert the latter’s positional registrar to `registerSiteSearchRoute({ app, deps, errors }: { app: Pick<Express, "get">; deps: SiteSearchRouteDeps; errors: RouteErrorPorts }, _optional: Record<string, never> = {})`. Repoint all calls, including test calls, from the two positional arguments to the required object.
- `I/routes/system/site-imports.ts:96–99,189`: thread `errors` from `H/mount-admin-system.ts:206` through `registerAdminSiteImportRoutes` to `registerListAndImportRoutes`. Add the deny-by-default origin policy and the existing host reporter to the **direct** kit adapter, plus the compatibility choice from J0. Keep the import-specific writer and its status selection. Repoint direct fixtures in `site-imports.integration.test.ts:46,83,119,133,165,188,209,224` and `site-imports-wire.integration.test.ts:22,71`.
- `M/assistant-tool-exec.ts:95–113`: bind the private direct mount from the `reporter` already required at `:95`, with `NO_OPERATION_TRACKING` and the deny-by-default origin policy. No change to token/loopback order, the 1 KiB parser, or the cache header. Don’t use public or admin wrapper policy there.

## 13. R1 — Owner and public member raw mounts

**BUILDER: SOL · OPUS-REVIEW**

**Tests first:** `owner recovery raw failure keeps its response and records under the owning auth reporter` and `member raw refusal does not record an incident`. Use `I/__tests__/admin-route-reporter-batches.test.ts` and the real owner and member registrar functions. Mutation `drop-owner-recovery-raw-errors`. Keep before-handler refusal ordering and session-cookie behavior.

Add required `errors` to these first objects and their callers.

- `I/owner-mfa-routes.ts:53,56` and `I/owner-recovery-routes.ts:69,72`: extend the local `Admission` shapes. `I/dev-auth.ts:605–618` already has `errors` and supplies both. The direct seven JSON mounts at `:694–719` are already bound.
- `M/public-members.ts:60,62,149,151`: add errors to sign-out and complete-sign-in. Use the `createMembersModule` registration binding at `M/members.ts:238,244`.
- `V/routes/members/{oidc-start.ts:23,31; oidc-callback.ts:101,109; oidc-verify-email.ts:83,92; unlink-identity.ts:93,95}`: thread through `M/members.ts:171,187–190`. Keep challenge, origin and state checks and any fixed caller-safe replies. Bind existing custom writers to the same reporter where they own an incident. Do not promote expected refusals to incidents.

## 14. R2 — Admin raw, previews and plugin surface files

**BUILDER: SOL · OPUS-REVIEW**

**Tests first:** `raw custom failure text is preserved with exactly one site incident` and `same-origin raw mounts still reject a missing explicit origin at registration` in `I/__tests__/{admin-raw-route-ports,admin-raw-route-ports-origin}.test.ts`. Also retain install handler naming and streamed response pins. Mutation `drop-raw-errors-after-origin-merge`.

| Raw mount | Required upstream edge |
|---|---|
| `I/routes/posts/template-preview.ts:58,75–76` | `M/content.ts:288`. Bind the reporter in the custom `adminFailureResponse` at `template-preview.ts:69–72`. Keep the POST URL-encoded parser, handler name and the preview response body. |
| `I/routes/themes/preview.ts:45,62` | `M/presentation.ts:74–76` passes the same binding to its preview registrar. |
| `M/agent-plugin-install-route.ts:59–60` | `M/agent-plugins.ts:50`, both ZIP specs, retaining `installHandler`. |
| `M/agent-plugin-surface-files-route.ts:39–42` and `V/routes/agent-plugin-surfaces/export-files.ts:30–34` | `M/agent-plugins.ts:53–54`. Keep separate surface scopes, limiter and buffered reply choices. |
| `M/publish-content-blobs.ts:27,34` | `M/publish-content.ts:71`. Keep the raw export streaming. |
| `M/site-previews-route.ts:25–26` | `M/sites.ts:152–156` supplies the preview binding via `registerSitesSupportRoutes`. |
| `M/system-site-backups.ts:40,53–54` | `H/mount-admin-system.ts:207`. Keep both registrations and the workspace refusal writer. |
| `M/system-site-shares.ts:96–115` | `H/mount-admin-system.ts:205`. Pass through every `mountSiteShareRoute` caller, including the helper that adapts its failure writer. Keep existing status, headers and response transformation. |

Use T0’s bound adapter so a custom writer can own the one report on an uncommitted response. Don’t add recovery retries or intercept stream close after headers.

## 15. R3 — Visitor raw mail, SEO and analytics

**BUILDER: SOL · OPUS-REVIEW**

**Tests first:** `a mounted SEO document failure keeps text/plain and has one report with its error ID` and `newsletter returned refusals keep their original envelope`. Use `I/__tests__/admin-route-reporter-batches.test.ts`; retain existing route-specific tests. Mutation `drop-seo-raw-errors` at `seo-documents.ts:67`.

- `V/routes/site/seo-documents.ts:63–67,74–85,108–120`: add `errors` to `mountDocument` and its four callers, using `M/seo.ts:163–166`. Pass `errors.reporter` to the existing `textFailure` writer at `:29`. Retain per-document copy, buffering and request headers.
- `V/routes/mail-feedback.ts:31–39` gets the same binding from `H/public-middleware.ts:39,82`. Bind its existing failure writer to the reporter without changing the plain-text reply.
- `V/routes/site/analytics-ingest.ts:27–37` receives it from `H/visitor-submit.ts:50–55`, supplied by `H/mount-public-site.ts:93`. Keep proxy-resolved request facts and existing body-parsing order.
- `V/routes/site/newsletter-confirm.ts:17–29` and `newsletter-unsubscribe.ts:16–25` receive it from `M/newsletter.ts:95–96`. The closures that obtain request facts still do so per request. Pass the same reporter into their existing `reportFailure` path, without introducing an additional call at the boundary. Keep the method-specific registrations, signed inputs, and reply copy.

## 16. T-GATE — Make Tovu’s wrapper binding mandatory and prove closure

**BUILDER: SOL · OPUS-REVIEW**

**Tests first:** `unbound Tovu wrapper registrations fail at startup before touching Express`, covering all four wrappers, plus `two site compositions do not share incident ownership`. Put the startup proof in `I/__tests__/admin-route-reporter-batches.test.ts` and the site-ownership proof beside `S/inbound/shared/__tests__/observability-error-report.test.ts:273–315`. Mutations `allow-unbound-wrapper` and `reuse-reporter-from-other-site`. Do not alter the landed T5 test names or loosen their existing exact counts.

Change the four wrapper first-object `errors?: RouteErrorPorts` keys from T0 to required. Replace the temporary optional adapter construction with a required `{ adapter: RouteHostContext & { errors: RouteErrorPorts } }` return. Add a clear startup guard for untyped callers before `app[method]`, while retaining the raw missing-origin check. Remove only the temporary rollout branches. Do not remove `reportServerFailure`’s separate fallback for handwritten routes. Update the Wiring text at `S/INFO.md:41,120,270,320–339`.

Repoint direct fixtures from `git grep -n -E 'mount(AdminJson|AdminRaw|PublicJson|PublicRaw)Route|adminPorts\.mount' -- apps`, notably `I/__tests__/{admin-json-route-ports,admin-json-route-ports-combined,admin-json-route-ports-legacy-order,admin-json-route-ports-overrides,admin-json-route-ports-same-origin,admin-mount-opt-ins,admin-raw-route-ports,admin-raw-route-ports-origin,admin-request-facts}.test.ts`, `I/routes/users/__tests__/reset-password.test.ts`, and `M/__tests__/{assistant-chats.cleanup,screenshot-storage,storage-routes}.unit.test.ts`. Use explicit fixture errors, not a default production reporter.

**Retirement gate for Opus.**

1. Inspect adapters at all three shared seams and both raw wrappers, all three capped calls, the direct Forms/Widgets/owner-auth calls, and the site-import and private preflight mounts. The 333 admin JSON calls must be explicitly bound. Check visitors, loopback/daemon and desktop host edges separately. Pure origin-only inputs use `OriginContext`; repoint `apps/website/src/platform/express/jini-routes.ts:10,204`, `apps/website/src/assistant/site/visitor-frontend-control.ts:6,28`, `S/inbound/assistant/agent-daemon-scope-http.ts:6,76`, and the origin-only test annotations in `assistant/__tests__/{run-scoped-credential,run-ownership}.test.ts` before core narrows the full host type.
2. `git grep -n -E 'reportRouteInternalError|onInternalError' -- 'apps/**/*.ts'` must show no retired consumer. Also inspect direct `mountJsonRoute`, `mountRawRoute`, and `daemonRouteHost` usages. Zero old names alone does not prove adapter ownership.
3. Run the exact T5 pins already at `observability-error-report.test.ts:273,294` and `I/routes/system/__tests__/browser-telemetry.unit.test.ts:168`. Keep the unreported 5xx marker and browser telemetry as independent owners. Re-run the landed `console.error`-beside-`reporter.record` mutation. Compare route table, auth, raw, cap, strict and why-comment checks to the unmodified merge-23 baseline. The running-site Chrome correlation check remains an Opus/owner verification item, not evidence from this dispatch.

## 17. J3a — Retire the Express/raw legacy HTTP sinks and require the server owner

**BUILDER: SOL · OPUS-REVIEW**

**Prerequisites:** J0, J4-F and reviewed T-GATE. Apply to the paired trees. Do not publish this independently.

**Tests first.** `J/server/src/__tests__/route-host.test.ts:112–151`: `route-host serves an ERR- id from the injected reporter` and `a route incident writes exactly one host record`. In `J/http-kit/src/__tests__/{adapter-reporter,raw-route-reporter}.test.ts`, pin a missing adapter and an origin-only JS caller failing **at mount**, before registration. Cover JSON and raw, same-origin, host-policy forwarding and pre/post-header writes. Mutations `accept-missing-mount-reporter` and `restore-second-default-sink`.

**Edit.**

- `J/http-kit/src/{adapter.ts:7–9,38–73,123–131,509–542; raw-route.ts:40–79}`: require `readonly adapter: RouteHostContext & { readonly errors: RouteErrorPorts }` on each existing first object. Keep `optional: RouteMountOptions<Deps> = {}`. For untyped missing or incomplete bindings, throw `Pass errors: { reporter, observability } when mounting JSON routes.` or the corresponding `raw routes` text before registering. Route straight to the reporter implementations. Remove `legacyServe`, `legacyRawRoute` and `sendRouteException` after their last callers are gone. Preserve the SEC-005 disclosure rationale beside the surviving classifier. Keep J0’s opted-in host routing and transport paths.
- Delete `J/http-kit/src/internal-error.ts`. Remove `RouteInternalErrorContext`, `RouteInternalErrorSink`, `reportRouteInternalError` from `index.ts:15–16`. Keep `createReporterRouteInternalError` at the same root export; update its retired-option documentation at `reporter-internal-error.ts:26–29`. In `sse.ts:39` preserve the no-throw transport rationale, remove only the obsolete daemon option reference, and do not alter the SSE callback.
- Repoint kit fixture adapters, adding a fresh recording context to each existing mount, or merging into the origin context when the test actually exercises origin. Verified direct mount files under `http-kit/src/__tests__/` are `adapter-{authorize-entity-type,body-limit,no-content,pins,ports,reporter,request-context,returned-errors,route-reply}.test.ts`, `adapter.test.ts`, `admitted-response-headers.test.ts`, `mount-opt-ins.test.ts`, `origin-validation.test.ts`, `raw-route{,-buffered,-deferred-body,-redirect,-reporter}.test.ts`, and `request-deps.test.ts`. Replace legacy-only assertions with reporter assertions without dropping wire pins. `core-server-contract.typecheck.ts:5,10` checks the replacement reporter type. `internal-error.test.ts` stops importing the deleted file and tests the replacement root binding, no duplicate record, and caller-safe ID. Leave the additive core Fetch signatures for J3b.
- `J/server/src/route-host.ts:8–10,29–46`: require the narrowed context and bind `createReporterRouteInternalError` unconditionally. Keep `context: required.context` identity. At `create-local-node-daemon.ts:116,203,370,395,501–529` make `CreateLocalNodeDaemonConfig.errors` required on all overload paths. Build `{ originPolicy: localOriginPolicy({ env, resolvedPortRef }), errors: config.errors }`; reject missing wiring before opening resources. In `compose-jini-kernel.ts:118,254,393–412` and `feature.ts:135`, the configured and extension-visible adapter has the same required type. Pass `adapter.errors.reporter` at preset-owned node-dispatch `mountRoutes` calls, including registered reference-web extensions. Keep the generic `mount-routes.ts:34–46` reporter option for standalone callers, and leave pre-header Express `next(error)` behavior intact.
- Repoint `server/src/create-local-node-daemon.typecheck.ts:36,49,61,75`, server test fixtures using the config/adapter (`builtin-features{,.mounts,.terminal-lifecycle}.test.ts`, `compose-jini-kernel.test.ts`, `create-local-node-daemon{,.headers}.test.ts`, `fixtures/graceful-shutdown-child.ts`, `host-order.characterization.test.ts`, `kernel-runtime.test.ts`, `route-host.test.ts`), and `server/tests/storage/loads-without-driver.test.ts:16`, including the **embedded program**. Give fixtures a fresh recording host. `packages/daemon/src/http/__tests__/agent-plugin-preflight.test.ts:23` must receive a narrowed recording adapter too.
- Production example callers are `examples/minimal-host/src/index.ts:76` and `examples/reference-web/src/daemon.ts:426,445`. Construct one host-owned binding per boot with the existing `createSystemClock`, `createConsoleLogger`, `createErrorCatalog({ sentences: [], scopes: [] })`, `createNoopObservabilityPort({})` where no tracker exists, and `mintToolErrorId` wired to `randomBytes` at the example root. Supply `ids: { newId: () => … }` and safe host version labels to `createErrorReporter`. Only the examples bind these implementations. No default inside the preset.

**API.** No `package.json` export-map delta. Add major `.changeset/http-kit-retire-legacy-route-sinks.md` and `.changeset/server-require-route-errors.md`. Update `api-baseline/jini-ai__http-kit.json` and `api-baseline/jini-ai__server.json`. Retain existing obsolete-field why-comment debt where accurate; account for any additional deleted field docs individually. No broad suppression.

## 18. J3b — Require the core Fetch host and retire the remaining sink shape

**BUILDER: SOL · OPUS-REVIEW**

**Prerequisites:** J3a, T-GATE and the paired Tovu bindings. J4’s runtime retirement is already present.

**Tests first.** `J/core/src/contracts/server/__tests__/json-route.reporter.test.ts`: `Fetch serves one matching ERR id from the required host reporter` and `Fetch rejects an unbound host when the route is constructed`. Assert one host/one tracker report, original ID, and no raw diagnostic in the reply. Keep the tests for safe typed refusals, `onError` precedence, a distinct policy-write failure, cancellation, and end-before-answer. Mutations `restore-core-legacy-sink` and `permit-missing-Fetch-host`.

**Edit.**

- `J/core/src/contracts/server/json-route.ts:80–119,224–264,409–428`: remove `RouteHostInternalErrorContext`, `RouteHostContext.onInternalError`, `legacyAnswer` and `exceptionAnswer`. `RouteHostContext extends OriginContext` now has `readonly errors: RouteErrorPorts`. At `jsonRoute` require `{ readonly host: RouteHostContext }` as the second object, with no default that permits omission. Check missing host/ports at construction for untyped JS callers and throw exactly `Pass errors: { reporter, observability } when mounting JSON routes.` Select the reporter answer directly. Retain the public first object’s `reportInternalError` field for this cut, but stop carrying it through a private call object if it is no longer read. Carry the SEC-005 private-driver/credential rationale beside the surviving classification. No runtime or vendor implementation enters core.
- Keep `ReportRouteInternalError` generic:

  ```ts
  export type ReportRouteInternalError = <E extends { readonly error: unknown }>(
    required: { readonly report: E; readonly logSource: string; readonly message: string },
    _optional?: Record<string, never>,
  ) => ServerApiError;
  ```

  In `J/http-kit/src/reporter-internal-error.ts:32–42` retain the factory pad and put `_optional: Record<string, never> = {}` on the returned implementation. Don’t add a shim for the removed callback.
- `J/core/src/contracts/server/testing.ts:55–59`: return a required-error context, taking `{ originPolicy?: SameOriginPolicyPort; errors?: RouteErrorPorts }` in the fixture’s optional object. Default to a **fresh recording** error fixture, not a production host. Repoint `__tests__/{json-route.test,json-route.reporter.test,json-route-authorize-entity-type.test,origin.test}.ts`. Keep independent test controls for allowed/denied origin. For intentional JS-negative coverage use a narrowly annotated type-negative test, not an unsafe assertion in production.
- `J/daemon/src/http/{route-host.ts:8–15,route-table.ts:55–61}`: require the core context along the existing edge and continue to pass the host into `jsonRoute`. Repoint real context builders and fixture literals, particularly `__tests__/fakes/route-host.ts:57–76`, `fakes/mount-attachments.ts:18–33`, `fixtures/local-origin.ts:16–19`, `characterization/harness.ts:169–181,240–242`, and `J/provider-plugins/src/xai/__tests__/fakes.ts:29`. Remove the deprecated optional callback from `fakeDaemonRouteHost`; change the fixtures that typed or passed it into real context construction to recording ownership. Keep deliberate retired-option regression canaries and independent callbacks outside the HTTP host contract. When one fixture reporter is injected across boundaries, bind both `context.errors` and the in-route reporter to that fixture, not just `reportInternalError`.
- Check the existing `J/core/src/contracts/server.ts` barrel and all remaining `RouteHostContext`, `createTestRouteHost`, `jsonRoute` references on the paired cut. Verify the Tovu origin-only repoints from T-GATE. Don’t replace origin-only literals by giving them a meaningless test reporter in production.

**API and exit.** Keep the existing core `./contracts/server` and `./contracts/server/testing` package exports. Add major `.changeset/core-retire-legacy-route-sinks.md`, update `api-baseline/jini-ai__core.json`, and account for any changed transitive daemon/server/http-kit declarations in their existing baselines and release notes. Opus runs `api:update` selectively and `api:check`; don’t sweep unrelated merge-23 baseline drift into the cut.

The retirement guard is `git grep -n onInternalError -- packages/core/src packages/http-kit/src ':!**/__tests__/**'`. Require no matches and exit 1, not a command error. Also require no production importer of the removed kit exports, a strict check of the paired consumer trees, and the T5 ownership witnesses. Release J3a/J3b only with the compatible host bindings and the already-landed J4 retirement.
