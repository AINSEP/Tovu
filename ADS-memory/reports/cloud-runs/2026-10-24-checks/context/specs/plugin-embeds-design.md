Software Architect(Design): Personas loaded: Software Architect for ownership and delivery boundaries; Security for plugin admission, HTML safety, and authentication. Read-only; no files changed.

Extend the existing HTML embed registry with `type:"plugin"`. Put the reusable component contract in `@jini-ai/agent-plugins`, embed resolution in `@jini-ai/cms`, and site/login adapters in Tovu. Google’s template and branded artwork stay inside `content/agent-plugins/google-login`.

1. **Manifest contract and ownership**

   Declare components in the existing host namespace, with parsing and validation owned by Jini:

   ```json
   {
     "extensions": {
       "tovu": {
         "id": "tovu/google-login",
         "components": [
           {
             "name": "sign-in-button",
             "template": "components/sign-in-button.html",
             "surfaces": ["public-page"],
             "propsSchema": {
               "type": "object",
               "properties": {},
               "additionalProperties": false
             },
             "assets": {
               "button": "components/assets/continue-with-google.png"
             }
           }
         ],
         "componentBindings": {
           "sign-in-button": {
             "memberLoginProvider": "google"
           }
         }
       }
     }
   }
   ```

   `components` is a reusable Jini contract, read using the lifecycle’s configured extension namespace. `componentBindings` is Tovu-specific metadata: it tells the host which existing member-login provider supplies this component’s public data. Neither Jini nor Tovu’s generic renderer contains Google identifiers, endpoints, or artwork.

   The identity is the pair **manifest ID + component name**. Today the lifecycle also uses a short local `pluginId`, such as `google-login`; that must be mapped explicitly to manifest ID `tovu/google-login`. Do not reconstruct canonical IDs by prefixing local names.

   Supported surface values are `public-page` and `admin`. A public-page preview retains the `public-page` surface; editor authentication must never make an admin-only export available publicly. Existing executable admin surfaces retain their current isolation contract.

   Validate during staged installation, before publication or activation:

   - Unique component names; valid surface values; explicit manifest identity.
   - Contained, existing template and declared asset files.
   - Bounded component count, template size, props size, schema depth, and asset size.
   - A closed object props schema using the existing bounded schema checker/value validator in `agent-plugins/src/admin-surfaces/action-schema.ts`; expose neutral aliases if useful, without implementing another validator.
   - Supported template slots and permitted HTML.

   Extend the existing installed-package indexing/validation path so install, update, preview installation, and existing-package admission share the checks. Invalid updates leave the previous revision intact.

   For Google v1, `props:{}` is sufficient. Arbitrary button text, URLs, provider selection, and redirect destinations are unnecessary.

2. **Rendering through the existing machinery**

   The existing flow is:

   ```text
   scanHtmlEmbeds
     → resolveHtmlPageEmbeds
     → HTML_EMBED_RESOLVERS[type]
     → WidgetRenderIR
     → renderHtmlPageBody / substituteHtmlEmbeds
     → final response consent gate
   ```

   This is implemented in Jini’s [resolver registry](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/cms/src/widgets/resolver-service.ts:1285), [HTML orchestration](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/cms/src/widgets/html/resolve-html-page-embeds.ts:38), and Tovu’s [render substitution](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/inbound/public-http/http/site/render.ts:1894).

   Add `plugin` to the existing page-embed vocabulary and registry. Its resolver receives an injected component source; CMS does not import Tovu or discover plugins itself.

   Give every plugin occurrence an internal placement key, following existing occurrence-key handling for galleries and widget overrides. Keying only by plugin/component would incorrectly share output between two occurrences with different props. The authored snippet needs no synthetic ID:

   ```html
   <div data-embed-config='{"type":"plugin","plugin":"tovu/google-login","component":"sign-in-button","props":{}}'></div>
   ```

   Resolution proceeds through these gates:

   1. Resolve the canonical manifest identity in this site.
   2. Apply existing activation and bundled-digest admission.
   3. Find the declared component and verify its surface.
   4. Validate props.
   5. Obtain narrowly scoped, host-supplied public data.
   6. Fill the template, validate the resulting fragment, and return render IR.

   Use a small interpolation contract: declared `props` and `host` values in text nodes or quoted attribute values. No expressions, helpers, includes, loops, raw HTML slots, dynamic attribute names, or recursive interpolation. Reuse `parse5` for HTML structure and `@jini-ai/core/text` for escaping. URL slots require URL validation as well as escaping.

   Google’s template can be as small as:

   ```html
   <a href="{{host.signInStartUrl}}">
     <img src="{{host.assets.button}}" alt="Continue with Google">
   </a>
   ```

   The host supplies the existing OIDC start URL only when the bound provider belongs to this admitted plugin and is configured. Reuse the provider-readiness composition behind `listProviders`; do not duplicate credential checks.

   The [existing start route](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/inbound/public-http/routes/members/oidc-start.ts:25) owns authentication behavior, rate limiting, browser binding, and subsequent protocol checks.

   Add one internal IR renderer for validated component HTML. Reuse [validateServerWidgetFragment](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/cms/src/widgets/html/server-fragment.ts:29) as the HTML policy owner. It already rejects scripts, event handlers, inline styles, SVG, iframes, and unsafe URLs. Do not add another sanitizer.

   Missing, disabled, uninstalled, undeclared, invalid, or unavailable components produce **empty public output**, including removal of the marker’s fallback content and wrapper. The page continues rendering. Authenticated editor diagnostics explain the reason separately.

   Thread the injected source through every existing resolution call: bare HTML pages, templated pages, expanded partials, nested HTML content, and pending previews. This avoids a feature that works only on one page-render branch.

3. **Branding, assets, and third-party policy**

   For the smallest v1, package local PNG button artwork containing the full Google mark and “Continue with Google” text. Use Google’s approved artwork/configurator, preserve its proportions and presentation, and give the image meaningful alternative text inside a keyboard-accessible anchor. This avoids introducing a plugin CSS pipeline or weakening the fragment validator for inline SVG. Google permits HTML/downloadable alternatives and specifies the permitted text and visual treatment. [Google branding guidelines](https://developers.google.com/identity/branding-guidelines)

   Serve only manifest-declared component assets through a thin host route. Reuse lifecycle containment checks and the existing declared-file serving approach; the public endpoint accepts identifiers that select declarations, never arbitrary filesystem paths. V1 accepts bounded PNG assets with verified media type and `nosniff`.

   **Recommend bundled-only v1.** The existing [trusted-file owner](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts:14) explicitly restricts contributions to shipped digests, including data contributions. Use its loader with activation required.

   Assistant-written and third-party packages may be structurally validated, but their components remain unavailable under that policy. The editor should say why. Later admission can use the same template rules after an explicit trust-policy change.

   Existing executable plugin widgets have a different contract: server callbacks and SDK authority, placed through partials. Keep that contract separate while sharing fragment validation and existing lifecycle owners. Do not register these declarative exports as executable widgets.

4. **Tracking, disablement, and uninstall**

   Record attribution from authored markers as:

   ```text
   site/workspace + document + occurrence + manifest plugin ID + component
   ```

   For v1, derive usage on demand with the existing marker scanner. Report authored placement count and distinct document count, with page bodies and theme templates/partials distinguished. These are placement counts, not impressions or clicks.

   Scan persisted source documents independently of the render-time 50-embed cap. Do not count repeated rendering, previews, or template expansion as additional authored placements.

   Avoid a new database table. Existing `entry_refs` targets are entries, terms, and assets; plugin IDs should not be disguised as entry IDs.

   Disable/uninstall preserves page source and revisions. Subsequent live rendering becomes empty, editor cards flag the retained reference, and re-enabling a compatible export restores it. Removed or renamed exports remain unresolved; no guessing or automatic substitution.

   Collect per-request plugin-dependency metadata, including unresolved occurrences. Live pages depending on plugin embeds should use `no-store` in v1 so cached HTML cannot continue displaying a disabled component. Recheck admission after asynchronous preparation before releasing output. Immutable template data may be cached by digest; enablement must remain fresh.

5. **Assistant, editor, and Pages regions**

   Expose one read-only component catalog to both the assistant and editor. It returns canonical plugin ID, component name, allowed surfaces, props schema, availability, and safe diagnostic codes. It exposes no credentials, package paths, or templates.

   Add a small `plugins_list_components` tool through the existing tool-registration machinery. Return a generated snippet for the selected component. Extend the existing marker snippet builder to serialize complete configs safely, including apostrophes; its current identifier-only implementation is insufficient for arbitrary props.

   The assistant discovers the export, reads the target page/region, and inserts the marker using existing `pages_write_region` or `pages_write_html`. It never copies the resolved button markup into stored page HTML.

   Extend the shared marker-target vocabulary for plugin identity and component display. Update the [existing protected embed card](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/admin/src/features/pages/lib/embed-placeholder.ts:138) to show, for example:

   ```text
   Google Login · sign-in-button
   Plugin disabled — visitors will see nothing here.
   ```

   Use the existing authenticated pending-preview pipeline with an explicit editor audience. Public requests cannot select diagnostic rendering through a query flag. Previewed authentication links should be inert.

   Pages region handling remains source-based. Put the marker inside an ordinary editable region; keep generated template internals opaque. Region moves, copy/delete, undo, save/reload, and version checks continue using their existing owners. Component templates must not introduce Pages editing handles or nested embed markers.

6. **Static export and deployment**

   The [existing exporter](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/features/site-export/site-exporter.ts) crawls the real application, so publishing should resolve components through the same registry. There is no separate publish renderer.

   Add the component asset URL prefix to the existing asset discovery/fetch configuration. Exported output contains resolved HTML and local assets, with existing base-path rewriting applied; it contains no unresolved embed marker, localhost URL, token, or browser binding.

   Authentication still requires a live backend. For v1:

   - A live deployment uses the existing same-origin start route.
   - A static frontend can use the same route through a same-origin reverse proxy to Tovu.
   - Without that backend capability, resolve the login embed to empty and report a clear publish/editor diagnostic.

   Do not point a static page directly at another origin’s OIDC start route: it currently rejects cross-site navigation. Cross-origin authentication and session transfer require a separate design.

   Keep the existing consent gate after component substitution. Preserve its current refusal of static delivery when explicitly enabled consent requires unavailable receipt storage; this feature must not silently disable consent.

   Exported files are snapshots. Disabling a plugin changes subsequent renders and exports; removing already-published button markup requires rebuild/redeployment. The live authentication route still rechecks provider availability.

7. **Implementation constraints and delivery shards**

   Every new public function/factory uses `(requiredObj, optionalObj = {})`. Inject component lookup, contained reads, host data, and diagnostics. Keep request/site state out of globals.

   New or materially changed functions must have CCN ≤10; the admin’s existing stricter 9/9 limits still apply. Separate declaration validation, slot filling, admission, resolution, and response projection into readable units. Preserve Windows-safe path handling through the existing lifecycle path owner; do not introduce shell-based file operations.

   | Shard | Assignee | File scope and dependency |
   |---|---|---|
   | Contract and admission | Codex | Jini `packages/agent-plugins/src/components/**` proposed; lifecycle manifest/index integration, exports, tests. Lands first. |
   | Embed integration | Codex | Jini CMS marker vocabulary, occurrence keys, resolver registry, HTML substitution, existing fragment validator, tests. Consumes settled contract. |
   | Tovu runtime | Codex | Thin component adapter under `features/agent-plugins`, member-login public-data adapter, render dependency wiring, declared asset route, export asset prefix, integration tests. |
   | Assistant and usage | Codex | Existing plugin tool catalog, Pages authoring contract, marker-based usage projection. Shares runtime catalog. |
   | UI and branding | Opus + Chrome | Existing Pages embed cards/catalog interaction, preview diagnostics, translations, plugin template/artwork, browser journeys. Consumes settled APIs. |

   Shared contracts land before dependent variants. Tovu consumes released npm packages; no checked-in sibling-path dependencies or copied Jini implementation.

   Required behavioral tests cover install refusal and update preservation; canonical/local ID mapping; site isolation; activation/digest refusal; two occurrences with different props; escaping and malicious URLs; unavailable components removing fallback markup; all render branches; editor-only diagnostics; region operations; asset containment; disable/re-enable; and real export output including base paths and consent refusal.

   Representative commands, run from the corresponding repository:

   ```bash
   # Jini
   pnpm --filter @jini-ai/agent-plugins test
   pnpm --filter @jini-ai/cms test
   pnpm --filter @jini-ai/agent-plugins typecheck
   pnpm --filter @jini-ai/cms typecheck
   pnpm guard
   ```

   ```bash
   # Tovu: existing regression boundaries
   node --import tsx --test --experimental-test-module-mocks "apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts" "apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts" "apps/website/src/features/site-export/__tests__/site-exporter.test.ts"

   npm --prefix apps/admin test -- src/features/pages/__tests__/embed-placeholder.unit.test.ts
   npm run typecheck
   npm --prefix apps/admin run typecheck
   ```

   Add the new component/install/security/export suites to those targeted runs. Run existing complexity commands against the changed production files. Opus validates the new browser journey in Chrome: insertion, keyboard access, branding across themes, preview, disablement, reload, and deployed static assets. No tests were executed for this design-only task.

8. **Cuts and handoff**

   Cut v1 support for third-party admission, plugin browser scripts, custom CSS, arbitrary redirects, full template languages, recursive components, click/impression telemetry, persisted usage indexes, cross-origin sessions, and migration of existing executable widgets.

   No owner question is needed to proceed with these recommendations. The binding plugin-export decision remains intact.

   Coordinator should convert this design into the approved spec/contracts before implementation. The clone’s referenced architecture chapters, constitution, governance index, and project memory were absent at their stated paths; canonical `/Users/la/Programming/Tovu/ADS-memory` copies supplied that context. Source behavior was checked against the requested clones; graph tools were unavailable.
