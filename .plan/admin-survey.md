BOTTOM LINE: Jini already has most of the generic admin builder; keep its shell domain-free, relocate domain screens to their owners, and extract Tovu’s remaining reusable behavior through injected contracts.

Software Architect(Direct): Read-only review at Tovu `b45d2ee75` and Jini `32e9c9c21`. **MOVE means a feasible destination, not demonstrated compatibility.**

**Measured scope:** **182,453 TS/TSX lines**, plus **16,788 CSS lines**. Counts include comments, blanks, dictionaries and in-file fakes; exclude tests, measurement harnesses and declarations. **65,887 lines** are in files named `i18n`/`dictionary`. This counting basis differs from the question’s approximate 178,500.

The disjoint TS/TSX inventory is: root **3,942**; components **18,244**; hooks **2,062**; lib **12,996**; admin themes **372**; integrations **914**; features **143,923**. Detail rows below sometimes overlap.

**What already exists**

| Existing Jini surface | Finding |
|---|---|
| [`@jini-ai/admin` manifest](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/package.json:1) | Already exists, version **0.6.22**; **26,587 TS/TSX lines**. Includes shell, registry, routing, transport, entity CRUD and domain screens. |
| [`AdminShellProps`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/react/shell/types.ts:63) | Already accepts panels, session/navigation ports, branding, themes and login/assistant/overlay slots. No fixed server or router required. |
| [`ui/panel-kit`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/ui/src/features/panel-kit/index.ts:1) | Already owns async actions, dirty guards, serial writes, settings slices and draft autosave. UI also owns themes, editors and query adapters. **Card builders stay here.** |
| [`commerce/react/Payments`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/commerce/src/react/Payments.tsx:26) | Exists, but is a static overview, not functioning Commerce administration. Its `/admin/products`, `/subscriptions`, `/orders` links still need injected destinations. Tovu admin imports no Commerce package at this snapshot. |

**Generic infrastructure versus Tovu**

Counts describe the inspected source pools, **not promised extraction amounts**.

| Area; measured lines | Home and host contract | Verdict / evidence |
|---|---|---|
| Shell/layout: **2,207** in `App.tsx`, `App.hooks.ts`, `main.tsx` | `admin/react/shell`; host supplies chrome, session, page rendering and optional panes | **MOVE PART.** Keep Tovu boot, publishing and site-switching composition. [`App`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/App.tsx:578) |
| Navigation: **2,793**, including **1,406** localization lines | Admin registry/nav model; host declares labels, groups, icons, ordering and visibility | **MOVE PART.** Builder already moved; Tovu’s manifest stays. [`nav.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/nav.ts:66) |
| Routing/adapters: **350** selected lines | Admin route model plus injected navigation port | **MOVE PART.** Keep `/admin`, legacy bookmarks and Tovu aliases in host. [`router.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/router.ts:8) |
| Auth/sign-in configuration: **685** | `user-management/react`; injected login/MFA/session operations | **MOVE PART.** Login already delegates to Jini. Local-owner bootstrap stays host-owned. [`use-login`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/features/auth/hooks/use-login.hooks.ts:64) |
| Permissions/roles: **3,592** | Generic affordance evaluation in admin; role/policy screens in `user-management/react`; host supplies grants/catalog/client | **MOVE PART.** Preserve Tovu’s **any-of** semantics. [`panel-access.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/panel-access.ts:13) |
| Client/query adapters: **4,527** | Admin transport/client assembler; host supplies domain clients, credentials and error classification | **MOVE PART.** Endpoint methods and workspace selection stay adapters. Query-library choice stays host-owned. [`api.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/api.ts:21), [`provider`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/fetch-query/provider.tsx:29) |
| Shared components: **9,644** excluding dock; top-level hooks **2,062** | Domain-neutral controls in `ui`; admin orchestration in `admin`; media/widget controls in their domains | **MOVE PART.** “Shared locally” does not establish generic ownership. |
| Tokens/theming: **870 TS/TSX**, **16,788 CSS** across the app | Theme contract/mechanics in `ui`; admin theme binding in `admin`; host chooses installed themes and persisted keys | **MOVE PART.** Preserve selectors, cascade and tokens initially. [`styles.css`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/styles.css:1) |
| List/table/form builders | Existing admin `DataTable` and entity builder; neutral controls in `ui`; host provides descriptors, CRUD and field renderers | **MOVE PART.** No separate generic builder folder remains in Tovu. Its local `Select` is **201** lines; widget/form-specific builders remain domain work. |
| Assistant: dock **8,600** + assistant feature **7,606** | Chat behavior in `chat/react`; reusable controls/cards in `ui`; admin receives a pane | **MOVE PART.** Inject tools, attachments, capabilities, transport and persistence. Tovu policy and publishing bindings stay. [`dock hooks`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:1) |
| Desktop/native: **1,794** selected, overlapping lines | Native adapters in `desktop-host`; generic controls in `ui`; host supplies capability ports | **MOVE PART.** Includes **427** file-handling and **1,028** voice lines, some browser-generic. Keep Tovu bootstrap and route-release policy. [`release hook`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/hooks/use-desktop-view-release.hooks.ts:3) |

**Domain screens**

Proposed `/react` destinations below are **ownership recommendations**, not claims that those exports already exist. Each receives its own client, navigation and cross-domain picker/preview contracts; admin imports none of them.

| Area in `features/`; measured lines | Destination; host fills | Verdict |
|---|---|---|
| Posts **9,410** | `cms/posts/react`; posts, drafts, lifecycle, media/terms/template slots | **MOVE PART** |
| Pages **9,075** | `cms/pages/react`; entries, canvas/preview, templates and save/conflict contracts | **MOVE PART** |
| Entries/collections **4,416** | `cms/entries/react`, `cms/content-types/react`; schemas, CRUD, lifecycle | **MOVE PART** |
| Media **5,892** | `cms/media/react`; library/upload/provider/event contracts | **MOVE PART**; Jini alternative exists but is parked |
| Members **802** | `user-management/react`; member client and refresh events | **MOVE PART**; already delegates |
| Forms **1,871** | `cms/forms/react`; definitions, submissions, provider configuration | **MOVE PART**; actual screens already in Jini admin |
| Themes **9,458** | `cms/themes/react`; files, revisions, validation and preview contracts | **MOVE PART**; Tovu’s publishing composition stays |
| Plugins **11,624** | `plugins/.../react` and `agent-plugins/.../react`; lifecycle, settings, surfaces and file clients | **MOVE PART**; split the two plugin families |
| Settings **8,470** | Existing `ui` panels plus owner-domain panels; host declares tabs, clients and persistence | **MOVE PART**; Tovu’s assembled settings page stays |
| SEO **1,626** | `cms/seo/react`; SEO client, entry/media selectors | **MOVE PART**; actual screen already in Jini admin |
| Comments **960** | `cms/comments/react`; moderation, pagination, events and grants | **MOVE PART**; actual screen already in Jini admin |
| Newsletter **0 implemented screen lines** | Future `cms/newsletter/react` | **STAY** placeholder declaration; nothing to extract |
| Commerce **0 implemented screen lines** | `commerce/react`; future operations/read models and destinations | **STAY** placeholder declarations |
| Deploy **7,389** | Deployment domain’s opt-in React surface; target, build/publish/status clients | **MOVE PART**; site-specific publish workflow stays |
| Other feature areas **57,278**¹ | Respective domains, existing UI controls, or host composition | **MOVE PART** after ownership split |

¹ Excludes the named domains and infrastructure-feature rows above. Includes menus, taxonomy, widgets, redirects, consent, trash, security, email, sites, workspace, dashboard, operations and publishing.

Representative boundaries: [`PostEditor`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/features/posts/PostEditor.tsx:24), [`collection adapter`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/features/collections/hooks/collection-entry-editor-dependencies.hooks.ts:10), [`Forms bridge`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/features/forms/index.ts:16), [`newsletter placeholder`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/panels.tsx:1250).

**Smallest builder API**

Keep the existing panel model, client assembler and shell. **A second configuration language or universal workflow engine would be overbuilt.** Illustrative target wiring:

```tsx
const client = createAdminClient({
  transport: host.transport,
  groups: { posts: host.postRoutes, settings: host.settingsRoutes },
});

const panels = [{
  id: "posts",
  description: "Write and organize posts.",
  nav: { label: "Posts", group: "Content" },
  routes: [{ pattern: "/:postId", view: "post-editor" }],
  anyOfPermissions: ["content.read"], // proposed promotion of Tovu's field
  render: ({ route }) => host.renderPosts({ route, client: client.posts }),
}, ...host.otherPanels];

<AdminShell
  {...host.chrome} // base, scope, labels, theme, login and layout slots
  panels={panels}
  session={host.session}
  navigation={host.navigation}
/>
```

`anyOfPermissions` and sufficient sidebar/layout customization are additions needed for Tovu parity. Domain clients close over server details outside admin. Server authorization remains authoritative.

**Notes app test**

| Needed | Minimum |
|---|---|
| List/editor | Existing entity descriptor, registry and `createEntityPanel`, wired to notes CRUD |
| Comfortable note body | Add an injectable field renderer: current [`EntityField`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/react/entities/EntityField.tsx:66) renders `text` as a single-line input |
| Sign-in | Existing `user-management/react` login plus shell session port |
| Settings | Existing UI settings/tabbed-dialog pieces, wired to the app’s preferences client |

**Estimate:** **200–500 shared lines**, plus **400–800 host/example lines**. No CMS, assistant or desktop extraction is necessary. This remains unproven until exercised.

**Biggest tangles and cost traps**

| Evidence | Consequence; smallest rule-preserving option |
|---|---|
| Jini admin contains **17,496 lines** outside its generic core/browser/React/contracts areas. [`forms/field-settings.ts`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/forms/field-settings.ts:2) imports CMS behavior; [`agent-plugin models`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/agent-plugins/models.ts:1) import lifecycle types | Existing packaging violates the requested boundary. Relocate screens/rules into owners; keep local consumer contracts. Supply neutral controls through UI or injected kit contracts. |
| [`api.ts:21`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/api.ts:21): fixed workspace/base; **4,487** lines of mixed transport and domain shapes | Split by operation owner. I found manually mirrored API types rather than direct generated-database imports. Moving the file wholesale would preserve coupling. |
| [`App.hooks.ts:1`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/App.hooks.ts:1) imports website assistant policy; [`PostEditor:29`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/features/posts/PostEditor.tsx:29) imports page UI/rules | Inject policy and preview/picker slots; move neutral primitives downward. No cross-domain import is necessary. |
| [`media-panel.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/media-panel.ts:3) explicitly parks the swap; [`modules.hooks.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/integrations/jini-admin/modules.hooks.ts:24) already wires six modules | Preserve current renderer until parity is established. Avoid mounting both implementations and doubling reads/subscriptions. |
| [`settings-effective-reads.ts`](/Users/la/Programming/tovu-integration-clones/ui-tovu/apps/admin/src/lib/settings-effective-reads.ts:10) documents approximately 100 duplicate locale reads before sharing | Preserve scoped deduplication. Keep buses/caches per admin instance, principal and workspace rather than copying module singletons. |
| [`AdminShell`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/react/shell/AdminShell.tsx:89) rebuilds navigation each shell render; [`session hook`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/react/shell/use-admin-shell-session.ts:58) rereads when port/context identity changes | Memoize by relevant inputs; keep injected objects stable and chat token state below the shell. Otherwise extraction can add renders and session reads. |
| [`entity relation loader`](/Users/la/Programming/tovu-integration-clones/ui-jini/packages/admin/src/react/entities/rules.ts:43) reads up to 100 options per relation target | Generic editing can add relation reads. Use searchable picker contracts where needed; preserve cursor pagination and avoid loading whole collections. |

**Cost:** Target **zero additional requests per existing Tovu action**, one shared session/settings owner, and unchanged polling visibility/cadence. These are proposed acceptance budgets, not measured performance results.

**Rough order**

| Order | Source size / work | Nature |
|---|---|---|
| 1 | Notes proof: **600–1,300 estimated new lines** | Judgment: verify the smallest contracts |
| 2 | Rehome **17,496 measured existing Jini domain lines**, then split domain-bearing core contracts | Judgment at boundaries; mechanical moves afterwards |
| 3 | Tovu shell adoption: **2–4k estimated touched lines**, anchored by the **2,207-line** root shell pool | Judgment: permissions, chrome, lifecycle and CSS parity |
| 4 | Posts/pages/entries/themes/media: **38,251 measured source lines** | Contract work first; move dependency-complete units |
| 5 | Remaining screens, then assistant/native work | Judgment-heavy state and lifecycle boundaries |

Against [server plan Revision 3](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-05-day/jobs-1106/portable-plugins-PLAN-v6.md:9): its remaining move inventory is roughly **58,300 lines**, with a **22.8M-token estimate** excluding the left-out survey. The small builder/notes tranche is much smaller. Full admin portability examines **143,923 feature lines plus existing misplaced Jini screens**—a larger source scope, though dictionaries inflate it. **Planning estimate: comparable to or greater than the server effort**, not a mechanical 178k-line move.

**Not checked:** runtime/visual parity, tests, builds, installs, servers, packaged desktop behavior, backend query costs, every function body, or a complete transitive dependency graph. Counts cover the stated snapshot files; architectural conclusions use targeted source inspection. No files changed.