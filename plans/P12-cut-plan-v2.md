CUT PLAN 2 PARTIAL

| Cut | Disposition | Parallel group |
|---|---|---|
| **#4 Admin request transport** | Factory and host binding specified. Full feature API conversion needs a per-feature caller inventory. | **A** after the paired foundation fixes |
| **#6 Locale hook** | Port and shared host wiring specified. The remaining leaf-to-mount chains need verification before the old hook entry can be deleted. | **A**, after #4 on the shared Admin files |
| **#7 HTML escape and slug** | **Ready for Tovu execution** on the specified pins. Both escapers have a public Core target. The slug blobs are identical. | **B**, independent of A |
| **#8 AdminKit 0c** | The existing `SettingsDialogTab` surface is ready for a type-only cutover after rv-g closes. Other families need a residual inventory. | **C** after rv-g. Serialize Jini kit edits with #6. |

### Base and merge order

I read `plans/P12-tovu-tangle.md`, `plans/P12-cut-plan.md`, and reviews rv-f and rv-g at Tovu `origin/plan/whats-left-1122` **`cd49e46b7a`**. The P12 executor document records its older missing-ref result. The current tip contains both P12 documents. I used the Opus corrections in the dispatch and treated cuts 1, 2, 3 and 5 as landed work.

- **Tovu** `origin/integ/merge-13-2026-11-22` `f7185f153a`, plus `origin/codex/ex2-tovu-halves` `d6590fc72d`, `origin/codex/ex2-holds-tovu` `8eb8ea568e`, and `origin/codex/ex5-fnd-{kit,seams,inject}-tovu` at `97a033e11a`, `54db4bce97`, `6f571e3d00` respectively.
- **Jini** `origin/integ/merge-14-2026-11-22` `4902a6a1a`, plus `origin/codex/ex5-fnd-kit-jini` `1af2c1684`. Merge-14 already contains the `ex-html-jini` slug contribution.
- These are cached remote-tracking tips. GitHub DNS failed in both clones, so server-side tip freshness is **NOT-CHECKED**. The Tovu contribution branches descend separately from merge-13. I compared their files directly and did not create a combined tree.

Land corrected Jini packages before their Tovu consumers. Per rv-f, reconcile Seams before Inject. Keep the approved P0.T move to `lib/admin-http/settings-api.ts` from Holds. Kit edits the deleted original and overlaps Holds on the effective-read integration test, Pages and Posts tests, and `lib/execution-settings.ts`. Preserve the Seams type repoint in that last file. Kit and Seams also overlap on `App.hooks.ts` and adjacent Dock and sidebar files. Reconcile `integrations/jini-kits.ts` and its integration test between Kit and Halves. For `lib/i18n-common.ts`, converge Halves, Kit, and Inject on one host overlay. Preserve existing translated entries and satisfy rv-g’s requirement that an added Jini locale can fall back when the product translation is absent.

Tovu anchors below are on `97a033e11a` unless marked **Holds**. `A/` means `apps/admin/src/`, and `W/` means `apps/website/src/`. For executor work, inject collaborators, use consumer-owned narrow ports, put shared contracts in Core and Tovu-specific shared contracts in `@tovu/contracts`, require hook props, and import from owners directly. New public functions use `(requiredArgs, optionalArgs)`. Keep functions at most 80 lines and complexity at most 10. Start with the named tests and record red under mutation and green after restoration. Add a **Wiring** section to the applicable feature `INFO.md` or README.

## #4 — Admin request transport

**Scope and recount.** P12’s **132** is the `request.ts` count in its Jini-bound production candidate set. The kit report’s **293** is a wider Tovu count. On both the report’s `284f95502` and the cached kit fix tip, the literal `admin-http/request` search returns **296 distinct files** under `A/`. On the fix tip, the counted import/mock forms comprise **130 test or test-support paths and 166 other paths**. On Holds, the full-path count is **295**, with the relocated Settings client importing `./request` at `A/lib/admin-http/settings-api.ts:3`. Count that relative import once in the effective overlay. The kit fix tip has **59** full-path config importers plus the two same-directory imports at `request.ts:7` and `urls.ts:1`. The Settings relocation substitutes a same-directory config import for the old feature import.

### #4.J — Factory

Add `packages/admin/src/shell/lib/admin-http/request.ts` and its browser subpath, matching `exports`, `jini.entries`, `typesVersions`, and API baseline. Put the following shared structural contracts at `@jini-ai/core/admin-runtime/admin-http`. Existing `AdminTransport` remains the route-group contract. Its transport implementation uses a different error class, parsing behavior, and retry surface.

```ts
export interface AdminHttpError extends Error {
  readonly status: number;
  readonly code?: string | undefined;
  readonly body?: Record<string, unknown> | undefined;
}

export interface AdminHttpReconnect {
  markReachable(): void;
  waitUntilReachable(): Promise<boolean>;
}

export interface AdminHttpOptions<E extends AdminHttpError, B extends string, F extends string> {
  basePath?: B;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  keepalive?: boolean;
  onOk?: (required: { response: Response }, optional?: Record<string, never>) => void;
  retryWrites?: boolean;
  requireJson?: boolean;
  failureEntry?: F;
  errorFactory?: (required: { response: Response; error: E }, optional?: Record<string, never>) => E;
}
```

Own the construction port in the Admin request module. Every callback with input takes a required object and accepts a second optional object.

```ts
type Empty = Record<string, never>;

interface CreateAdminHttpPorts<E extends AdminHttpError, B extends string, F extends string> {
  fetch(required: { url: string; init: RequestInit }, optional?: Empty): Promise<Response>;
  timeoutSignal(required: { ms: number }, optional?: Empty): AbortSignal;
  isPageUnloading(required: Empty, optional?: Empty): boolean;
  makeUnloadAbort(required: Empty, optional?: Empty): Error;
  resolveBasePath(required: { basePath?: B }, optional?: Empty): string;
  isUpstreamRefused(required: { response: Response }, optional?: Empty): boolean;
  decodeApiError(required: { body: unknown }, optional?: { fallbackMessage?: string }):
    { message: string; code?: string | undefined };
  createError(
    required: { message: string; status: number },
    optional?: { code?: string | undefined; body?: Record<string, unknown> },
  ): E;
  isRequestError(required: { error: unknown }, optional?: Empty): boolean;
  messages: {
    timeout(required: { ms: number }, optional?: Empty): string;
    unreachable(required: { status?: number }, optional?: Empty): string;
    requestFailed(required: { method: string; path: string; status: number }, optional?: Empty): string;
  };
  reconnect: AdminHttpReconnect;
  shouldRetry(required: {
    code: string | undefined; unreachableCode: string; method: string | undefined;
    upstreamRefused: boolean; retryWrites: boolean;
  }, optional?: Empty): boolean;
  sessionInvalidated(required: Empty, optional?: Empty): void;
  getFailureGeneration(required: Empty, optional?: Empty): number;
  reportFailure(required: {
    error: E; path: string; method: string; generation: number; basePath: string;
    failureEntry?: F;
  }, optional?: Empty): void;
}
```

Use an explicit type predicate on `isRequestError` over the destructured `error` value only if TypeScript accepts the signature. The cast-free form is `isRequestError(required: { error: unknown }, optional?: Empty): required is { error: E }`, called with a named `{ error }` object. Use that form in the implementation.

`createAdminHttp(required, optional = {})` returns `request`, `requestOnce`, `requestRidingOutRestart`, `authenticatedAdminRequest`, and `fetchOrThrowUnreachable` with the existing request shapes. Keep the failure-marking `WeakSet` per factory instance and keep the public test override for reconnect structurally compatible. Use the stages already in `A/lib/admin-http/request.ts:129–154,225–250,262–267,294–315,336–405,425–445`. Keep the helpers outside the factory where needed to meet its size limit. Preserve valid `null`, optional strict JSON, caller signal precedence, `onOk` order, custom error identity, the single retry, and final-only notice publication. Keep the synthesized error codes and legacy `ApiError` identity stable across the cut.

### #4.T — Host composition

In the substantive host `A/lib/admin-http/request.ts`, compose one instance and export its bound operations from their existing entry. Add:

```ts
import { createAdminHttp } from "@jini-ai/admin/shell/lib/admin-http/request";
import type { AdminHttpOptions } from "@jini-ai/core/admin-runtime/admin-http";
```

Bind `decodeApiError`, Tovu’s `redactSecretShapes` in the fallback formatter, native fetch and timeout, and the existing page lifecycle function. Keep `ApiError:10`, `describeApiError:483`, and the session listener registration in this host module. `sessionInvalidated` resets the failure channel before notifying listeners. Preserve the positional legacy `onUnauthenticated(listener)` surface used by `A/App.hooks.ts:29,109,156` and typed by `A/App.session.ts:6,23`.

Keep `BASE`, `WORKSPACE_ID`, and the explicit local alternate prefixes in Tovu. Instantiate `AdminHttpOptions<ApiError, "/api/admin/v1" | "/api/assistant/chats" | "/api/agents", "page">` at the host. `A/lib/server-reconnect.ts:21–22,113,165` supplies the dev-proxy marker check, retry policy, and live reconnect object. `A/lib/admin-failure-channel.ts:10,112,128` supplies generation, classification, publishing, and product vocabulary. Keep `A/lib/admin-http/urls.ts:1` at its current path because the route-check script reads it.

**Import rule for this extraction.** Existing Tovu import and mock lines keep their current host specifier and bindings, including Holds `settings-api.ts:3`:

```ts
import { authenticatedAdminRequest } from "./request";
```

The host `request.ts` composes real behavior and owns the existing subscriptions and error class. Portable features take only the bound operation they actually use in their API factory or existing dependencies bag. The source imports provide an inventory for those follow-up sheets, with no blanket repoint to an unconfigured Jini factory:

```bash
G=/Applications/Xcode.app/Contents/Developer/usr/bin/git
"$G" grep -n -E 'admin-http/(request|config)' HEAD -- apps/admin/src
"$G" grep -n -E 'from .*[.]/(request|config)' HEAD -- apps/admin/src/lib/admin-http
```

**Tests first.** Use `A/lib/__tests__/api-request-shapes.characterization.test.ts`, `api-request-onok-and-null-body.unit.test.ts`, `server-reconnect.unit.test.ts`, and `api-request-page-unload.unit.test.ts`, plus `A/__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx`. Add a factory fixture with two instances and recording ports. Pin one retry after reachable, retry exhaustion, write admission, real session invalidation versus an unrelated 401, and cancellation during unload followed by normal behavior after a persisted `pageshow`. Named mutations `retry-twice`, `logout-on-any-401`, and `publish-unload-as-outage` must each break the corresponding assertion.

**Wiring and verification.** Document in Jini Admin README and `apps/admin/INFO.md`. On the linked executor tree:

```bash
pnpm --filter @jini-ai/admin test src/shell/lib/admin-http
pnpm --filter @jini-ai/admin run typecheck
pnpm api:check
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- api-request server-reconnect app-session-unauthenticated-kickback
```

**STOP** on a second runtime error class, instance state shared across independent factory calls, changed endpoint or retry policy, widened alternate base paths, or lost legacy request shape. **NOT-CHECKED** covers every feature API factory conversion and the final merged importer lines. Keep this dispatcher scope to the extraction and host binding.

## #6 — Locale hook

### #6.J — Required port and kit slot

Extract `A/hooks/use-admin-locale.hooks.ts:50–65` to `packages/admin/src/shell/hooks/use-admin-locale.hooks.ts`. The locale port already exists at Jini `packages/admin/src/shell/hooks/admin-locale-port.hooks.ts:15–23`. Keep it as the feature port and use this signature for the shared hook. Keep the namespace and fallback in the host binding.

```ts
interface AdminLocalePort {
  loadLanguage(required: Record<string, never>, optional?: Record<string, never>): Promise<string>;
  subscribeToSettingsRefresh(
    required: { listener: () => void },
    optional?: Record<string, never>,
  ): () => void;
}

interface UseAdminLocaleArgs {
  port: AdminLocalePort;
  useBootScope: () => { queryScope: string; checking: boolean };
  useFetchQuery: FetchQueryAdapter["useFetchQuery"];
  useInvalidate: FetchQueryAdapter["useInvalidate"];
  queryPrefix: readonly [string, string];
  fallbackLocale: string;
}

type UseAdminLocaleHook = (
  required: Record<string, never>,
  optional?: Record<string, never>,
) => string;
```

Import `FetchQueryAdapter` as a type from `@jini-ai/core/fetch`. In `packages/admin/src/react/kit.tsx:263` add `AdminKitHooks.useAdminLocale: UseAdminLocaleHook`, and export the hook type from that entry. Update `react/testing-kit.tsx` with the injected test hook. Keep the existing port capture, scope in the query key, `enabled: !checking`, infinite stale time, prefix invalidation, unsubscribe cleanup, and previous data on failed refresh. Export the bare hook subpath with the browser metadata and baseline.

### #6.T — Host binding and required prop chains

In `A/hooks/admin-locale-dependencies.hooks.ts:1–35`, bind `loadLanguage` and `DEFAULT_LOCALE` from Settings, the existing shared refresh bus, and `useAdminBootScope`. Add:

```ts
import { useAdminLocale } from "@jini-ai/admin/shell/hooks/use-admin-locale.hooks";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";
```

Bind the existing UI query hooks at this host boundary and pass `queryPrefix: ["settings", LANGUAGE_NAMESPACE]`, `fallbackLocale: DEFAULT_LOCALE`. Keep the namespace filter that admits `core.language` and the all-namespaces event. Preserve `A/lib/settings-tabs.ts:261,266`, the Holds Settings API binding, the local publish path at `A/hooks/use-settings-slice.hooks.ts:6,11`, and the SSE path at `A/App.hooks.ts:44,110` → `A/lib/settings-events.ts:56–101` → the same refresh bus. There is one boot provider and one settings stream owner.

At migrated consumers, **delete the live-hook import**. Any file declaring the required prop imports `UseAdminLocaleHook` directly from `@jini-ai/admin/react/kit`. Call `useAdminLocaleHook({}, {})` unconditionally where the old hook ran.

| Verified entry | Required host chain |
|---|---|
| `A/main.tsx:71–98`, `A/integrations/jini-kits.ts:34–36` | Put the host hook in `adminKit.hooks`. `SessionApp` passes it to `<App>` inside the existing providers. Preserve provider order. |
| `A/App.tsx:35,477–488,569–578,676–718`; `A/features/auth/Login.tsx:9,30` | Required `AppProps.useAdminLocaleHook` → `AdminShell` → `useShellLocale` and the early Login mount. Keep `useAdminDocumentLocale` on the resulting locale. |
| `A/App.tsx:226–240`; `A/panel-contracts.ts:9–11`; `A/panels.tsx:60,1296–1312`; `A/components/Placeholder.tsx:3,161–176` | Supply the hook through `PanelRenderContext`, the lazy fallback, and the direct unknown-section Placeholder. The Placeholder slot in the registry must receive it too. |
| `A/App.tsx:730,753–755`; `A/integrations/jini-admin/AdminModulesProvider.tsx:3–11`; `A/integrations/jini-admin/modules.hooks.ts:32–48` | Required hook through `AdminShellProviders` → `AdminModulesProvider` → `useAdminModules` → `createHostAdminScope` → all five feature factories. Each factory and loading component requires the narrow hook. Use one injected hook for production and include it in the scope memo dependencies. |
| `A/integrations/jini-admin/{comments,forms,redirects,seo,widgets}-module.hooks.ts:5,5,5,6,6` | Remove the five live-hook imports. Pass the required hook into each factory’s provider and its loading element. Also pass it into the independent loading mounts at `A/features/comments/index.ts:16`, `forms/index.ts:19,26`, `redirects/index.ts:16`, `seo/index.ts:18`, and `widgets/index.ts:16,21,26,33`, through their actual route mounts. |
| `A/__tests__/admin-boot-readers.test.tsx:6`, `A/hooks/__tests__/use-admin-document-locale.unit.test.ts:4`, `use-admin-locale.hooks.test.ts:7` | Import the bare hook from `@jini-ai/admin/shell/hooks/use-admin-locale.hooks` for explicit port tests. Keep binding coverage in Tovu. For consumers converted to required props, replace old module mocks with hook props. Update source-pin coverage at `A/__tests__/fqfix-rationale.unit.test.ts:21` when the named file is removed. |

The cached kit census contains **132 direct import/mock files**, **21** in test paths. P12’s **91** refers to its candidate subset. Enumerate the exact tracked lines before splitting the remaining feature lanes:

```bash
G=/Applications/Xcode.app/Contents/Developer/usr/bin/git
"$G" grep -n -F 'use-admin-locale.hooks' HEAD -- apps/admin/src
"$G" grep -n -E 'useWiredAdminLocale|useAdminLocaleHook' HEAD -- apps/admin/src
```

**Tests first.**

- **Scope switch** in `A/__tests__/admin-boot-readers.test.tsx:14` and the locale suite at `:184–206`. Hold A’s promise pending, switch to B, resolve B and then A, and assert B was fetched and remains visible. Mutation `omit-query-scope` must fail.
- **SSE refresh** starting with `A/lib/__tests__/settings-events.unit.test.ts:85` and the host binding suite. Emit an unrelated namespace and then a real `settings-changed` frame for `core.language`. Assert no extra language read for the former and a visible locale change for the latter. Mutation `drop-settings-event-forward` must fail.
- **Reverse-order refresh** in `A/hooks/__tests__/use-admin-locale.hooks.test.ts:105–143`. Resolve the second refresh first and then the first. Mutation `skip-language-invalidation` must fail.
- **English fallback** in the same suite at `:41`. Reject the initial read and assert `"en"` through the host hook. Mutation `drop-english-fallback` must fail. Preserve StrictMode replay and subscription cleanup.

**Wiring and verification.** Update Jini Admin README, `apps/admin/INFO.md`, and the feature Wiring sections for converted mounts.

```bash
pnpm --filter @jini-ai/admin test kit use-admin-locale
pnpm --filter @jini-ai/admin run typecheck
pnpm check:hooks
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- admin-boot-readers admin-locale admin-document-locale settings-events admin-route-lazy-loading module-hook-injection
npm run check:hooks
```

**STOP** before deleting the old Tovu hook if any mount still relies on a default, a mock masks a missing prop, or the complete scope/SSE/race contract fails. **NOT-CHECKED** covers all remaining direct consumers and their transitive mounts, including Dock, picker and editor extensions, feature-local wired hooks, and harnesses. The table is a shared-mount sheet, and the full Tovu deletion remains on hold.

## #7 — Retire the HTML escape and slug duplicates

**Evidence.** `W/platform/html/escape.ts:2–4` already delegates both functions to `@jini-ai/core/text` with the same `{ text }` argument and ignores its optional pad. Jini merge-14 `packages/core/src/text/index.ts:3` publicly exports **both** functions. `packages/core/src/text/escape.ts:14–26` uses `&#39;` for HTML and `&apos;` for XML. This resolves the handoff’s assertion that XML lacks a target. The wrapper proves output equality for both on this base. `W/platform/html/slug.ts` and Jini `packages/cms/src/html/site/slug.ts` both resolve to blob **`e92352c21f30818faa767b1f58bce4446087ce07`**. Both Tovu manifests that need CMS already declare it.

**Execute in Tovu.** Delete `W/platform/html/{escape,slug}.ts` after the repoints. No new types, ports, host bindings, package entries, or dependencies. For **every** path below under `W/`, replace the escaping import with:

```ts
import { escapeHtml } from "@jini-ai/core/text";
```

| Directory under `W/` | Importers and lines |
|---|---|
| `features/` | `comments/builtin-provider.ts:5`, `site-backup/static-download-html.ts:3`, `site-backup/static-download-landing.ts:1`, `site-export/export-html-policy.ts:1`, `site-export/static-security-headers.ts:3` |
| `features/theme/` | `preview-switcher-html.ts:2`, `static-render-content.ts:3`, `static-render-menus.ts:8`, `static-render-previews.ts:3`, `static-render.ts:5`, `visitor-publication.ts:7` |
| `platform/html/` | `menu-render.ts:3` |
| `server/inbound/public-http/http/site/` | `render-site.ts:13`, `render/blocks.ts:5`, `render/contact-form-widget.ts:10`, `render/content-html.ts:7`, `render/media-placeholder.ts:2`, `render/post-body.ts:3` |
| `server/inbound/public-http/http/site/render/` | `components/entry-lists.ts:6`, `components/layout.ts:3`, `components/marketing.ts:3`, `doc/doc-nodes.ts:8`, `doc/nodes-media.ts:7`, `widgets/post-content.ts:7`, `widgets/social-entries.ts:3` |
| `server/inbound/public-http/routes/` | `commerce/purchase.ts:5`, `site/newsletter-confirm.ts:7`, `site/newsletter-unsubscribe.ts:6`, `site/product-checkout.ts:2` |

The 30th escape importer is `W/platform/html/__tests__/escape.test.ts:4`, the only local XML caller. Use `import { escapeHtml, escapeXml } from "@jini-ai/core/text";`.

For every slug row below, use:

```ts
import { toSlug } from "@jini-ai/cms/html/site/slug";
```

- `A/features/menus/hooks/use-menu-editor.hooks.ts:16`
- `W/features/forms/index.ts:62`, `features/pages/tool-registrations.ts:33`, `features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts:8`, `features/post/slug.ts:1`, `features/taxonomy/tool-registrations.ts:29`, `features/widgets/deps.ts:49`
- `W/server/inbound/public-http/http/site/render/doc/doc-nodes.ts:5`
- `W/platform/html/__tests__/slug.test.ts:4` keeps a linked-package parity run. `W/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts:260` uses the same import inside its synthetic source fixture. `development/scripts/__tests__/dev-lite.test.mjs:9` creates its own temporary slug file, so its path is fixture data.

**BLOCK list.** `origin/codex/ex-html-tovu` `ba5b313581` identifies `W/features/post/{post-tool-schemas,tiptap-block-schema,tiptap-text-schema,tiptap-doc-schema}.ts`. Keep these with their Tovu tool-description vocabulary and dependency chain. Cut #7 changes only the site-slug import at `features/post/slug.ts`. Keep `source-edits.ts`, `menu-render.ts`, `safe-url.ts`, and `published-webmcp-strip.ts` in their host roles.

**Tests first.** Use the existing five escape cases, the ASCII/Unicode slug corpus, `W/features/post/__tests__/slug.test.ts`, and `W/server/inbound/public-http/http/site/__tests__/render.golden.characterization.test.ts`, including the post-title-with-marks and post-content assertions. Named mutations `html-apostrophe-to-apos` and `slug-decamelize-on` must turn the HTML apostrophe and ASCII corpus tests red respectively. Restore both linked Jini functions before verification.

**Wiring and verification.** Document direct Core and CMS ownership in the platform HTML Wiring section, and record the Posts slug and Menus browser bindings in their feature or Admin Wiring docs.

```bash
pnpm --filter @jini-ai/core test escape.hwa.test.ts
pnpm --filter @jini-ai/cms test src/html/site/__tests__/slug.test.ts
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- MenuEditor
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks \
  apps/website/src/platform/html/__tests__/{escape,slug}.test.ts \
  apps/website/src/features/post/__tests__/slug.test.ts \
  apps/website/src/assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts \
  apps/website/src/server/inbound/public-http/http/site/__tests__/render.golden.characterization.test.ts
```

**STOP** if linked exports differ from the pinned declarations, any bytes or anchor outputs change, or the merged base introduces another real importer. Check for stale resolved imports after deletion, including aliases and relative forms.

## #8 — AdminKit 0c after rv-g

**Gate.** `1af2c1684` already has the B5 prop/controller shapes in `packages/admin/src/react/kit.tsx:156–281` and the split chat shapes in `kit-chat-types.ts`. Tovu already binds the relevant values at `A/integrations/jini-kits.ts:28–49`. The cached Tovu commits show host URL/workspace restoration, collaborator binding, refresh call-shape fixes, and selector/hook wiring. The cached Jini tip still has the Select pass-throughs at `shell/components/Select/Select.hooks.tsx:4–5` and positional `computePosition` at `:43`. Its moved test imports the forwarded names at `:19,21`. The paired rv-g approval and verification are **NOT-CHECKED**. Use rv-g’s numbered checklist to close the rest, including metadata, selection-echo transfer, missing mutations, and the host locale overlay. Treat the branch report’s earlier green checks as evidence for the reviewed revision.

**Ready after that gate — #8.T `SettingsDialogTab`.** The structural type already exists at Jini `packages/admin/src/react/kit.tsx:171–173`. It matches the UI owner’s `TabbedDialogTab` and `TabbedDialogTabMeta` fields on the cached tip:

```ts
interface SettingsDialogTab<TId extends string = string> {
  id: TId;
  label: string;
  navHint?: string;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  panel: ReactNode;
}
```

Add `import type { SettingsDialogTab } from "@jini-ai/admin/react/kit";` at each row. Remove only the old inline type specifier and preserve the other imports.

| Tovu file | Line |
|---|---:|
| `A/features/observability/Observability.tsx` | 2 |
| `A/features/observability/hooks/use-observability-tab.hooks.ts` | 2 |
| `A/features/recovery/Recovery.tsx` | 3 |
| `A/features/skills/Skills.tsx` | 4 |

**Host binding and proof.** `A/integrations/jini-kits.ts:5,31,49` already binds `SettingsDialogShell` and checks `satisfies AdminKit`. Add a bidirectional assignability assertion in `A/integrations/__tests__/admin-kit.integration.test.tsx` using `SettingsDialogTab<"overview">` from each owner and a literal fixture with a `panel`. Run typecheck to execute that contract. Named mutation `kit-tab-panel-field-rename` changes Jini `panel` to `content` and must fail the linked Tovu typecheck. The four consumers remain type-only for this cut. Record the type owner and existing host slot in the feature Wiring sections and Jini Admin README.

```bash
pnpm --filter @jini-ai/admin run typecheck
pnpm api:check
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- admin-kit.integration observability recovery skills
```

**STOP** if rv-g lacks paired verification, the type crosses a UI implementation boundary, or a cast becomes necessary. **NOT-CHECKED** covers the residual 0c consumers. `plans/P9-data/k2-kit-gaps.md` predates the B5 contribution and includes value names in its 0c heuristic. Recount each family against the corrected pair, starting with already-owned structural types. Resolve the chat `AgentEvent` owner against Seams before dispatching chat repoints.

No files were changed, and no tests, builds, or type checks were run in this planning pass.
