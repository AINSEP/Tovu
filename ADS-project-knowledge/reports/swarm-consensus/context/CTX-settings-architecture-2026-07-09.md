# Swarm Consensus Context Packet

**Date:** 2026-07-09
**Slug:** settings-architecture
**Project Type:** brownfield (Tovu website product — agent-native modular monolith, per-site SQLite `content.db`)
**Question:** What is the right architecture for a **typed, schema-registered Settings surface scoped global / workspace / user** — the `settings` capability that replaces the WordPress `wp_options` grab-bag — such that it composes with the already-accepted content model, identity, and plugin-trust ADRs and never bricks a live end-user SQLite site?
**Intended Consumers:** Primary model (host Opus 4.8) + peer CLIs (Codex `gpt-5.5` xhigh, Gemini 3.1 via `agy`) + Fable subagent

## Goal
Produce the architecture that a future ADR + SPEC will record for Tovu's **Settings** admin section: the data model, the scope/precedence semantics, the typed-schema registration mechanism, the read/write authorization story, and the never-brick reversibility properties. This is the next item in the Admin Section Spec Sweep (competitor teardown → debate → audit → ADR → spec). This packet drives the **debate** step.

## Scope
**In scope**
- The storage + schema model for settings values.
- The three scope tiers **global / workspace / user** and how precedence / override / fallback resolves across them.
- How settings are **declared** (typed schema registration) by: core, the site owner, and plugins.
- Read path performance (settings are read hot — potentially every request) and cache-key correctness under ADR-007 (`workspaceId` in every cache key).
- Reversibility / never-brick behavior (add / rename / retype / remove a setting on a live SQLite site).
- Authorization: who may read/write each scope tier (must compose with ADR-021, not reinvent it).

**Out of scope (name the seam, don't design it)**
- The **Integrations / API** ADR (API keys, webhooks, outbound). Secrets storage may *touch* settings — decide the boundary, but do not design the webhook/outbox surface here.
- The actual Settings **UI** (that's the spec/design step after the ADR).
- Backups/export mechanics (separate ADR; note if settings must be in the export set).

## Architecture Summary (current, accepted context)
Tovu is a modular monolith. Each site is a folder with its own `content.db` (SQLite now → Postgres later) behind ports. Content is being unified under **ADR-022**: one generic `entries` table + a **content-types-as-data registry** (types are data, not code), universal fields as real columns, custom/plugin fields in a **namespaced, write-validated JSON column** (`fields.ext.{owner}.*`), queried via **core-provisioned expression indexes**. Every mutation flows through **one write chokepoint that records an append-only revision in the same transaction** (never-brick foundation; CI-canary enforced). Identity/authz is **ADR-021**: one `principals` table, RBAC for humans, scoped grants for machines, `authorize()` as ordinary core code (no PolicyPort), composite `(workspace_id, id)` FKs for relational workspace isolation. Plugins (**ADR-024**) install in trust tiers; **Tier-1 declarative manifests already list `settings` as a first-class primitive** ("types/fields/taxonomies/expression-indexes/**settings**/declarative admin"). Plugin-contributed admin/settings **JS** is isolated cross-origin (**ADR-025**). Plugin data writes are core-mediated (**ADR-023**) with an atomic multi-write envelope (**ADR-026**). Ports obey the **rule-of-two** (**ADR-006**: a port earns its abstraction only with two real adapters).

## Relevant Files And Artifacts
| Path | Why it matters |
|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-INDEX.md` | Map of all accepted decisions; read first |
| `ADR-022-content-model-entries-registry-expression-indexes.md` | The entries + registry + revision + expression-index model settings must compose with (or deliberately diverge from). Does NOT currently mention settings. |
| `ADR-007-structural-workspace-scoping.md` | `workspaceId` required in every event/repo/job/**cache key** — settings caching must obey this |
| `ADR-021-identity-and-authorization.md` | Who can read/write which scope; composite `(workspace_id,id)` FKs; per-user identity; `api_keys`/secrets seam |
| `ADR-024-plugin-execution-and-trust-model.md` | Names `settings` as a Tier-1 declarative primitive; "install from anyone" safety bounds what a plugin-declared setting may do |
| `ADR-025-plugin-client-js-isolation.md` | Plugin settings *panels* run sandboxed cross-origin; settings values reachable only via core-mediated RPC |
| `ADR-023 / ADR-026` | Core-mediated plugin writes + atomic multi-write envelope — a plugin never holds a tx handle |
| `ADR-006-ports-rule-of-two.md` | Whether a `SettingsPort` is justified or is premature abstraction |
| `ADR-020-theme-capability-tiers.md` | Theme settings schema overlaps; avoid two competing "settings" concepts |
| `src/features/presentation/__specs__/presentation-settings.spec.md`, `src/features/presentation/presentation.ts` | The one existing settings-shaped surface in the repo today — evidence of the current ad-hoc pattern |

## Constraints
- **Never-brick is the product's top guarantee.** Any settings change (add/rename/retype/remove, including a plugin uninstall that owned settings) must be reversible on a live end-user SQLite site — no risky migration, no brick.
- **One write chokepoint + append-only revisions** (ADR-022) — settings writes should not open a side door around this. Either reuse the chokepoint or justify a second, equally-audited one.
- **`workspaceId` in every cache key** (ADR-007). Settings are read-hot; a naive global cache is a cross-tenant leak.
- **Compose with ADR-021 authz** — do not invent a parallel permission model for settings.
- **Plugin settings must be Tier-1-declarable** and safe to "install from anyone" (ADR-024) — declarative, bounded, no code.
- **SQLite now, Postgres later** behind ports; anything chosen must port cleanly (ADR-015).
- **Rule-of-two** (ADR-006) governs whether new ports are warranted.

## Known Unknowns (assumptions that could change the answer)
- **Is a "setting" just a content entry?** ADR-022's registry + JSON-ext + revision machinery *could* model a settings singleton per (scope, namespace). Is reuse elegant or a category error (settings are config, not content; different lifecycle, caching, and authz)?
- **Where do per-USER settings live?** `content.db` is **per-site/per-workspace**. User preferences may need to span workspaces (one human, many sites). Does user-scope belong in the site DB, the identity store, or elsewhere?
- **Precedence semantics.** global → workspace → user override chain: last-writer-wins? explicit layering with computed effective value? Which layer may a given principal write?
- **Typed schema registration mechanism.** How does a typed setting get declared (Zod-like? the ADR-022 content-type registry? a dedicated settings registry?), validated on write, defaulted, and versioned/renamed reversibly?
- **Secrets boundary.** API keys / tokens: settings, or ADR-021 `api_keys`/principals? Encryption at rest?
- **Read performance + invalidation** at global/workspace/user granularity without cross-tenant leak.
- **Does this justify a `settings` library/port at all, or is it a thin feature over the entries model + identity store?**

## Source-of-Truth Inputs
| Source | Notes |
|---|---|
| ADR-INDEX + ADRs 006/007/020/021/022/023/024/025/026 | The decided context peers must design *within* |
| `todos.md` §"Admin Section Spec Sweep" → **Settings** row | "typed schema-registered settings, scoped global/workspace/user (`settings` lib, replaces WP options grab-bag)" |
| `src/features/presentation/*` | Current ad-hoc settings-shaped code |
| WP `wp_options` / Directus settings / Payload globals / Ghost settings | Competitor references for teardown (peers may cite from knowledge) |

## Shared Prompt Payload
> **You are a peer in an adversarial architecture debate (Round 1, blind).** Do not assume the Coordinator has a preferred answer; there is none disclosed. Your job is to independently derive the best architecture and to attack weak options.
>
> **Before designing, you MUST read** (they exist in this repo): `ADS-project-knowledge/reports/architecture/ADR-INDEX.md` and ADR-006, ADR-007, ADR-020, ADR-021, ADR-022, ADR-023, ADR-024, ADR-025, ADR-026 in `ADS-project-knowledge/reports/architecture/`, plus skim `src/features/presentation/`. Design **within** these accepted decisions; if you must diverge from one, name it and justify. Confirm in your first line which ADRs you read.
>
> **Question:** What is the right architecture for a typed, schema-registered **Settings** surface scoped **global / workspace / user** in Tovu, replacing the WordPress `wp_options` grab-bag, that composes with the content model (ADR-022), identity (ADR-021), workspace scoping (ADR-007), and plugin-trust (ADR-024/023/025/026) ADRs and **never bricks a live SQLite site**?
>
> **Treat these as OPTIONS to critique, not a menu to pick from — invent a better one if warranted:**
> - **(A) Settings-as-entries:** model each setting group as a singleton/typed entry in the ADR-022 `entries` table via a content-type in the registry, reusing JSON-ext validation + the revision chokepoint + expression indexes.
> - **(B) Dedicated `settings` store:** a purpose-built typed key/value store keyed by `(scope, scopeId, namespace, key)` with its own schema registry, defaults, and precedence resolver — separate from content.
> - **(C) Hybrid:** core/site config one way, plugin-declared settings via the ADR-024 Tier-1 manifest into a namespaced core-mediated store; user prefs in the identity store.
>
> **You must address, concretely:**
> 1. **Data model** (tables/columns/keys) and how it satisfies never-brick reversibility for add/rename/retype/remove and plugin-uninstall-owning-settings.
> 2. **Scope + precedence:** exact resolution of global→workspace→user, who may write each layer (via ADR-021), and how the effective value is computed and **cached without cross-tenant leak** (ADR-007 cache-key rule).
> 3. **Where per-USER settings live**, given `content.db` is per-site and a user may span workspaces.
> 4. **Typed schema registration + validation-on-write + defaults + reversible rename/retype.**
> 5. **Plugin settings**: how a Tier-1 declarative manifest safely contributes settings + their panel (ADR-024/025), and how writes stay core-mediated (ADR-023/026).
> 6. **Secrets boundary:** do API keys/tokens live here or in ADR-021 `api_keys`? Encryption at rest?
> 7. **Does this warrant a new `SettingsPort`/library under the rule-of-two (ADR-006), or is it a thin feature over entries + identity?**
> 8. **The single strongest failure mode** of your recommended option and what would change your mind.
>
> Output: a ranked recommendation with a crisp data model, the precedence + authz + caching story, the never-brick argument, and an explicit statement of what you'd need to see to abandon your pick. Be specific and adversarial. End your response with `<<SWARM_END>>`.
