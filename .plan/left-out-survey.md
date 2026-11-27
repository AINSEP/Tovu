BIGGEST GAP: The plan proves package portability while leaving enough rendering, domain workflows, and table setup in Tovu that a second app still has to implement behavior beyond wiring.

Software Architect(Direct): Evidence is from Tovu `b45d2ee75` (**T**) and Jini `32e9c9c21` (**J**), read through Git objects. Counts include comments and blanks, exclude tests and generated output. Proposed move sizes are estimates.

**1. Page rendering and routes — MOVE PART**

`T server/inbound` contains **54,897 production lines**: admin HTTP 34,558; public HTTP 16,012; assistant 3,887; shared 440. The named files are under `public-http/`.

| Measured evidence | Generic job → Jini home; host contract | Truly Tovu / verdict |
|---|---|---|
| `http/site/render.ts` **3,651**; tier dispatch at `:3604`, document shell `:3283` | Theme rendering → `cms/themes/render`; document rendering → `cms/presentation/html`; widget/form/commerce rendering stays in its owning domain. Host passes render functions, assets, URLs and content projections. | Branding (`:1991`), assistant mount/assets, product component selection stay. **MOVE PART**: split by job, not this file. |
| `routes/site/pages.ts` **3,106**; dependency shapes `:1229`, rendering `:1561`, request finalization `:2635` | Template selection, bounded content expansion, listings, themed responses → `cms/themes/express`, receiving local contracts for content, menus, widgets, membership, redirects and head contributors. | Tovu chooses enabled contributions, reserved paths, legacy title behavior and registration order. **MOVE PART**: substantial reusable handling lives inside the route. |
| `http/site/form-render.ts` **786**, plus validation-message helpers **137** | Form feedback, field restoration, attempt-token injection and flash serialization → `cms/forms/html`. Host supplies cookie name, legacy markup names and messages. | Preserve `tovu_form_flash` (`:674`) and existing classes through Tovu bindings. **MOVE PART**, mostly movable. |
| Public route groups: members **916**; API/MCP callbacks **332**; SEO endpoints **173**; media rendition **763**; search **174** | Domain HTTP adapters → `user-management/server/members/express`, `integrations/api-connections/express`, `cms/seo/express`, `cms/media/express`, `search/express`. Host supplies session/origin/access/telemetry contracts. | Paths, cookies, callback message names and product access composition remain host inputs. **MOVE PART**; another app should not rewrite these handlers. |
| Admin CMS route groups **13,073**, including dependency files; examples: `routes/posts/list.ts:10`, `entries/create.ts:34`, `themes/duplicate.ts:42` | Reusable request parsing, authorization sequencing, service invocation and error mapping → each domain’s `/express`. | Principal extraction, Tovu permission bindings and endpoint mounting stay. **MOVE PART**; don’t move the entire registrar/dependency surface. |
| System/site-management routes **4,602**; shared middleware **440** | Extract generic jobs only when still absent from existing low-level Jini exports. | **STAY** for Tovu site selection, repair, product directories, development authentication and composition. |

**Runtime prerequisite:** `http/site/worker-sandbox.ts` (**167**) compiles workers against Tovu’s source directory and `#src` aliases (`:69–76`). The reusable render job needs its worker implementation too; entry paths and development compilation remain explicit host inputs. Moving only the renderer would fail the owner’s test.

**2. Remaining theme — MOVE PART, substantially more than the stay list allows**

The full theme feature is **15,872 lines**. These measured groups expose the main omissions:

| Measured evidence | Generic job → Jini home; host contract | Tovu / verdict |
|---|---|---|
| Nine tool/catalog files **2,387**; `tool-registrations.ts:48`, `set-active-theme-tool.ts:48` | Theme editing, duplication, activation and publication tools → `cms/themes/tools`. Pass authorization, presentation actions, cards, shared surface exchange, messages and metadata. | Tovu tool wording and bindings stay. **MOVE PART**; the workflows are reusable. |
| Asset operations, import, trash, duplication and original-copy helpers **1,387** | → `cms/themes/files` or `/node`. Pass byte fetch/read, sniffing/error factories, trash capability, roots and refresh hooks. | Root selection and product guidance stay. **MOVE PART**. `theme-trash.ts:128` implements paired theme/original rollback; composition-root callers do not make that behavior host-specific. |
| Preview, watcher and roster helpers **615** | → `cms/themes/preview` and `/node`. Pass settings access, roster, directory, watch port and refresh delivery. | Mounting preview endpoints stays. **MOVE PART**. Watcher singleton (`theme-watcher.ts:26`) and roster cache (`theme-roster-sync.ts:37`) need explicit instance ownership. |
| Publishing contributors and page publication **996**: `publish-content.ts` 826, active-theme adapter 110, page publication 60 | Theme packing, validation, staged swap/rollback → `cms/themes/publish`; activation behavior belongs to presentation. Pass blob access, command execution, hashing/publishing contracts and activation functions. | Legacy aliases and registrations stay. **MOVE PART**. `publish-content.ts:696` is a workflow, not merely wiring. |
| Asset normalizer **407**; portability index **234** | → `cms/themes/build` and `/portable`. Pass output paths, framework artifact policy, marker operations and placeholder copy. | Product defaults stay. **MOVE PART**; most behavior is theme-format processing. |
| Visitor publication **149**; active-theme resolution **218**; header loader **51**; capability card **29** | Visitor publication belongs to `agentic` with routing/storage contracts; reusable theme resolution belongs to themes. | **MOVE PART** for the first two; **STAY** for product resource loading, default theme IDs and capability copy. Keep their generic operations separate. |

Revision 3 already moves `build-conformance.ts` (**574**); that is not another omission.

The broader prerequisite is `features/publish-content` (**11,762**): planner, hashing, contributor catalog and apply/rollback machinery contain reusable publishing behavior. Home: **`cms/publishing`**, receiving contributor contracts rather than importing every CMS domain. Its current `type-registry.ts:3–33` imports those domains directly; that dependency map must be split before extraction.

**3. Table setup — MOVE PART**

| What exists | Smallest sufficient design | Saved-data boundary / verdict |
|---|---|---|
| T migration TS **3,062**; synchronous fresh constructor **257**. J already has migration runner **298**, step contract **55**, payments migration history **374**. Evidence: `T platform/db/migrations/index.ts:77`; `J commerce/.../migrations/index.ts:33`. | Each owning `/sql` exports table bindings and versioned migrations, using `db/migrate`. Host supplies kernel, table/reference names and ledger identity, then explicitly runs selected domain histories in dependency order. No registry, dependency resolver or package above domains. | **MOVE PART**: publish domain schemas and subsequent upgrades. Keep Tovu’s migration orchestration and historical adoption code. |
| Forms production `/sql` exports repositories but no bootstrap; its **44-line test fixture** already creates working dialect-specific tables. | Promote verified schema ownership into production exports; include indexes, constraints, defaults and dialect differences. First prove one domain, then expand. | **Tovu databases must remain unchanged:** preserve its 78-step frozen Drizzle chain, IDs, checksums, ledgers, table names and fresh-constructor path. Do not run new domain baselines against them or silently “adopt” existing tables. |

The runner already supports separate histories and ledgers. The gap is schema ownership, not another migration framework.

**4. Wiring cost — MOVE PART**

| Evidence | What cuts the cost | What stays explicit / what is overbuilt |
|---|---|---|
| Plan: **430–680 estimated host lines**, excluding SQL. Existing `T server/runtime/composition/agent-plugin-service-ports.ts` is **96**. | Domain-owned capability objects with structurally assignable methods; exported projection/error bundles; same-domain defaults; one documented binder example per integration. Cards remain `ui` exports passed by the host. | Product identities, permissions, cookie names, saved formats and shared instances remain explicit. Don’t add factories merely to hide object literals. |
| `T server/routes/types.ts` **1,739** demonstrates the cost of exposing the whole host dependency surface. | Put a copyable starter **outside packages**, containing explicit cross-domain wiring, schema calls and lifecycle cleanup. Measure its actual required lines. | **STAY** for cross-domain composition. A `createEverything`, DI container, universal host interface or new umbrella package would be overbuilt. No defensible reduced line estimate exists yet. |

**5. Real proof — add an actual second application early**

| Existing proof | Smallest useful second app | Timing / verdict |
|---|---|---|
| Plan E2 uses fakes. J already has `examples/minimal-host/src/index.ts` **263** plus ACP fixture **67**; it exercises a real daemon, but starts with `packs: []` (`:57`). | A standalone notes app: persistent SQLite; create/publish a note; themed list/detail; a form submission; one installed plugin with a saved setting and worker tool; a card answered through HTTP; restart and reuse persisted state. Only public packed exports and wiring—no copied domain implementation or handwritten DDL. | **MOVE PART**: reusable machinery belongs in domains; the application belongs outside packages. Existing daemon/chat examples do not prove these extracted capabilities together. |
| No real-consumer wiring measurement exists. | Give it a second app identity, paths and table bindings. Demonstrate rollback, callback/store identity and restart behavior using real adapters. Retain fakes for provider variation coverage. | Start the app **before contracts freeze**; require its first persistent plugin slice before widening extraction. Extend it with rendering as that lane lands, then repeat from tarballs before release. |

**Other generic omissions over 300 lines**

These are source envelopes/candidate jobs, not claims that every counted line should move.

| Evidence | Recommendation |
|---|---|
| `source-control/store.ts` **551** + `provider-registry.ts` **314** | **MOVE PART** → `devops/source-control`: credential and provider workflows through vault/contribution contracts. Keep bundled sources, filenames and product scopes in Tovu. |
| `deployments/deploy-config.ts` **449** | **MOVE PART** → `devops/deploy`: config generation/validation; host supplies descriptor, environment and notes. `:124` hardcodes Tovu environment policy. |
| Backup upload engine/jobs/plan store **449**; whole backup feature **6,741** | **MOVE PART** → a `devops/backup` domain subpath, with content-source, manifest and repository contracts. Tovu archive layout and restore policy stay. |
| `site-inspection/published-page.ts` **534** + `page-body.ts` **108** | **MOVE PART** → `diagnostics/web-evidence`: bounded fetch/body inspection; inject serving, path policy and telemetry. Product capability/profile inventories stay. |
| Mail activity **221** + suppressions **161** | **MOVE PART** → `platform/mail` domain subpaths: masking, pagination and suppression operations; host supplies repositories and authorization. |
| Publishing challenge **313** + session **212**, within trust feature **2,666** | **MOVE PART** → `cms/publishing/trust`: pass signing/keyring, grant and revocation contracts; preserve saved derivation formats. |

**Recommended new lanes**, with rough implementation sizes—not additions to the plan’s existing move totals:

| Order | Lane | Rough lines | Work |
|---|---|---:|---|
| 1 | Real consumer skeleton + first domain schema | 400–800 new | Judgment |
| 2 | Domain schema exports, selected domains first | 1,500–3,000 | Judgment; mechanical DDL transfer afterward |
| 3 | Rendering leaves, workers, then page pipeline | 7,000–10,000 source | Judgment; mechanical movement after seams |
| 4 | Remaining theme operations/tools/previews | 5,000–6,000 source | Mixed |
| 5 | Publishing engine and domain contributors | 4,000–8,000 source | Judgment; preserve hashing/rollback formats |
| 6 | Domain HTTP adapters, then adopter-needed extras | 10,000–18,000 source | Mixed; select complete jobs, not directories |

Every lane includes its runtime prerequisites and extends the real consumer. None requires domain workflows in `server` or cross-domain capability imports.

**Not checked:** no execution, live databases, provider accounts, packed-worker behavior or migration compatibility proof. Route groups and additional candidates were sampled; this is not an exhaustive body-by-body audit of all 54,897 inbound lines. I did not re-review the plan’s batches, change files, or run tests, builds, installs or servers.