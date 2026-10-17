# Admin surface descriptors and contribution ownership

Version: 0.1.0 · Date: 2026-10-17 · Status: DRAFT — contribution admission decision remains open.

Inputs: TRIAGE s4-75 (original TODO line 1610); current `apps/admin/src/panels.tsx`, `lib/panel-access.ts`, Jini admin core manifest/routing contracts, `ADS-memory/reports/architecture/admin-sitemap.md` and `admin-section-architecture-outline.md`; local Medusa admin extension research. Output is a bounded descriptor/ownership proposal, not an accepted new plugin-loading mechanism. The complete five-competitor IA/extension capture requested by neighboring TODOs is not claimed here.

## Existing mechanism and flow

`ADMIN_PANELS` is Tovu’s existing declaration of route, render binding, navigation, detail routes and agent navigation. Jini’s `AdminPanel<TRender>` is the generic owner. Shell routing/nav/agent maps derive from it; Tovu augments it with `PanelAccessDeclaration.anyOfPermissions`. This is already the shared mechanism; do not create a parallel SurfaceRegistry or server resource descriptor that owns the same facts.

Read path: host assembles declarations → capability/UX permission filtering → route match → host render binding → feature’s existing read/write API. Write authorization is server-side at the owning domain/gateway. A sidebar entry, agentReachable flag or client-side permission filter never grants authority.

The July sitemap’s route prefixes, permission names, live/build status and placeholder paths are historical intent, not the current route contract. Use current panel IDs and adminHref/currentRoutePath from Jini core; do not reconstruct /admin URLs manually or rename stable route IDs to match display labels. The existing panels file records why providers is labeled Integrations, access-tokens is labeled Secrets, and workspace/appearance remain compatibility routes.

## Descriptor vocabulary

“Surface descriptor” means the existing AdminPanel plus a **separate description of provenance**, not a second representation of its routing/navigation. Separate these axes explicitly:

| Axis | Meaning | Existing/proposed contract |
|---|---|---|
| Panel identity | Stable route/domain identity | Existing AdminPanel.id; unique within the assembled host. Display labels are independent. |
| Navigation | Label/group/order/icon and optional soon state | Existing optional nav. No nav means a routable hidden/compatibility surface, not a broken panel. |
| View routes | Detail/child routes and selected view/params | Existing routes, including explicit agentPageId where it differs from sidebar identity. |
| Host renderer | Trusted render binding | Existing generic render type bound by host; never serialized third-party JSX/function/import paths. |
| Dependencies | Required host capabilities | Existing requires; missing capability prevents mounting according to the generic resolver. |
| UX access | Visibility and direct-URL affordance | Existing generic all-of permissions; Tovu anyOfPermissions adapter where the landing route admits either permission. Do not change all-of into any-of implicitly. |
| Agent navigation | Whether agent may navigate, separately from acting on controls | Existing agentReachable plus explicit host default. Jini default is false; Tovu currently chooses defaultReachable true. Preserve the distinction and do not treat it as tool authorization. |
| Provenance | Who supplies the declaration/code and who owns its behavior | Proposed metadata: core(host), registry-contributed(host-approved contributor), or plugin-shipped(installed plugin). Names and identity binding require the owner decision below before implementation. |
| Surface kind | What interactions need to be specified/tested | list/detail/editor; settings tabs; operational/control; overview/read-only; explicit placeholder; redirect/compatibility. This is descriptive vocabulary, not permission to generate complex control UIs from CRUD metadata. |

A generic contributor protocol, if approved, belongs in Jini admin/plugin packages with Tovu bindings. Public factories/functions take `(requiredArgs, optionalArgs)` objects. Existing domain ports remain the data/action contract; secrets, repositories and executable server objects never travel in descriptor metadata.

## Inventory and ownership synthesis

All 47 currently explicit `id:` declarations below are statically registered by the Tovu host in `panels.tsx`. Thus **current registration provenance is core(host)** for every row, including placeholders and adapters over plugin behavior. This does not reclassify plugin-owned features as core behavior. No panel is claimed dynamically registry-contributed merely because its declaration sits in a registry array.

| Current panel IDs | Surface contract | Behavior owner / contribution distinction |
|---|---|---|
| dashboard, sites, ai-assistant | Overview / operational settings | Host compositions over existing Jini and Tovu domains; core host registration. |
| pages, posts, media, collections, menus, widgets, taxonomy, forms | Lists + editor/detail; widgets includes region subroutes | Existing CMS/domain owners and their thin Tovu adapters; no new screen-per-plugin contract. |
| users, authentication, roles, members | Identity/security settings and management | Existing identity/member owners; hand-authored control surfaces retain server permission checks. |
| comments | Moderation | ADR-031 names comments a bundled plugin behavior. Today its panel is a static host registration; a future plugin-shipped contribution must not add a second comments panel. |
| themes, admin-themes, admin-appearance | Site design versus operator chrome | Keep site theme and app chrome separate. Shared chrome belongs to Jini; CMS theme behavior remains its named owner. |
| design-system, playground | Reference / development tooling | Host-owned surfaces; placeholder status is read from actual nav/render state, not treated as delivered functionality. |
| plugins, agent-plugins, skills, providers | Add-on management / integration settings | Core extension-management surfaces; installed feature content is not permission to replace the manager’s declaration. |
| integrations | Compatibility route plus existing delivery detail | Preserve existing redirect/detail semantics; not a second Integrations nav entry. |
| orders, products | Commerce placeholder/list targets | Store behavior is plugin-owned (ADR-023 / current store-plugin). Current panel placeholders are host registrations, not plugin UI delivery evidence. |
| subscriptions, billing | Explicit future commerce/cost surfaces | Retain placeholder truth; owning future delivery/contribution contract requires decision rather than inferring it from the label. |
| database, recovery, deployment, source-control, access-tokens, observability | Operational/control | Existing domain/provider ports; host owns shell registration, providers own behavior behind ports. No provider-specific module is added to core by this spec. |
| activity-log, import-export, notifications | Activity/data movement/notification surfaces | Current host declarations may be placeholders; contract must state loaded/empty/error/coming-soon behavior. |
| settings | Settings tabs | Existing settings owners; ADR-063 tab URL contract. |
| workspace, appearance | Compatibility/redirect/hidden route | Keep remembered URLs; absence from nav is deliberate. |
| trash, seo, redirects, newsletter, analytics | Domain list/settings/read-only surfaces | Reuse current domain contracts; a current host registration does not determine whether a future packaged feature is bundled. |

For each surface, downstream UI specs must describe the actual index/detail/tab interaction, required capabilities and landing-read permissions, loading/empty/error/denied states, mutation confirmations, concurrency behavior, keyboard/focus contract and agent reachability. The descriptor names where those contracts live; it does not embed domain business logic or duplicate API definitions.

## Proposed admission invariants

| ID | Requirement | Required verification |
|---|---|---|
| AS-01 | Build route/nav/agent metadata from one assembled AdminPanel set. | A contributed declaration appears consistently in all opted-in derived views; no second hard-coded menu or agent allowlist edit. |
| AS-02 | Stable IDs/routes cannot be silently shadowed by contributions. | Duplicate id/route fails admission with contributor attribution before any code mounts. Existing core/security/compatibility IDs cannot be replaced by install order. |
| AS-03 | Capability availability and permissions have separate meanings. | Missing capability suppresses unavailable mount; UI permission checks mirror the declared landing read; server denies unauthorized direct requests independently. Explicit any/all semantics are tested. |
| AS-04 | Core vs registry vs plugin describes real supply/ownership, not merely nav location. | Inventory names the host binding and behavior owner; a plugin-owned feature has one panel identity whether bundled or independently installed. |
| AS-05 | Plugin disable/uninstall removes its admitted contributions from nav/route/agent discovery through the same assembly owner. | No stale nav or executable renderer remains; an active route transitions to a known host fallback with accessible messaging. Plugin data retention follows the plugin’s existing lifecycle. |
| AS-06 | Contribution trust and isolation follow the approved plugin UI loader. | A descriptor cannot supply arbitrary module path/React component/HTML to escape ADR-025 or acquire host capabilities. Host capability ports remain scoped and authorizable. |
| AS-07 | Failure of an optional contribution does not break core recovery/settings/sign-in. | Reject/disable the failed contribution, attribute its error without secrets, and keep core operational routes reachable. |
| AS-08 | Dynamic metadata cannot grant agent control permissions. | Navigation succeeds only under declared reachability; element/tool execution still uses independent existing authorization/opt-in checks. |

Test neighborhoods: Jini admin `core/__tests__/manifest.test.ts`, routing/default-panel-navigation tests; Tovu `lib/__tests__/panel-access.unit.test.ts` and existing panel/route/agent-map tests. Future plugin lifecycle integration proof belongs to the approved plugin UI owner. No implementation tests were written or run here.

## Decision required before completion

The existing AdminPanel is a host-side executable render contract. It is **not** by itself a safe serialization or plugin-admission contract. The task asks for registry-contributed/plugin-shipped ownership, but a binding from verified plugin identity/lifecycle to an admitted render surface has not been established by the inspected contracts. Coordinator must confirm the existing plugin UI loader/admission owner and approved identity contract (including ADR-025 isolation), or route an ADR revision if that owner is unsuitable. Proposed provenance metadata cannot silently become a parallel plugin loader.

Therefore **ITEM 1610 NOT DONE** as an authoritative, implementation-ready ownership decision. The current inventory and bounded requirements above are delivered for that decision; no owner was reassigned. Neighboring competitor-capture tasks also remain unperformed; local research is secondary evidence and is not a new five-CMS source audit.

Constitution: I existing admin/router/platform mechanisms; II/V future boundary tests; III/IV no duplicate registry or speculative UI generator; VI plugin trust and server auth retained; VII no active spec/hash/approval overwritten; VIII attribution via existing diagnostic surface. No exceptions granted. Output: current registration inventory, descriptor vocabulary and admission criteria. Risks: unsafe interpretation of render metadata as executable permission; incomplete contributor contract. Next assignee: Coordinator → Software Architect for the named admission owner, then Spec package promotion/preflight.
