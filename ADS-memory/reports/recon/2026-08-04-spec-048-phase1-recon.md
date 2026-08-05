# SPEC-048 Phase 1 recon — does the extension/glue tier already exist?

**Date:** 2026-08-04
**Source:** Spec Agent (dispatched subagent, Sonnet 5), interim report before spec authoring
**Status:** interim findings, persisted on arrival. Superseded in detail by
`ADS-memory/specs/048-extension-glue-tier/spec.md` once written.

## Verdict

**An extension of SPEC-005, not a fourth parallel mechanism** — but a real extension along two axes
SPEC-005 does not cover.

1. **Loading location + trust posture.** `src/features/plugin-runtime/loader.ts` discovers only
   built-ins plus a fixed site-plugin directory, and in practice everything lands at ADR-024
   **Tier-3 (full in-process trust)** — no lighter tier is actually wired. The glue tier needs an
   agent-writable location at a posture *below* Tier-3, because the author is an LLM rather than a
   human sideloading their own code.
2. **Hook surface breadth.** SPEC-005 ships **exactly one hook**: `content.entry.beforeSave`
   (`packages/sdk/src/index.ts:45` — `HOOK_CONTENT_ENTRY_BEFORE_SAVE` is the only exported hook
   name; `addFilter` rejects anything else with `HOOK_UNKNOWN`). The owner's ask needs many more
   named call sites. **That enumeration is the real substance of the spec.**

## Pre-existing gap found — the one hook does not actually fire

`loader.ts` steps 4-5 (invoking a loaded plugin's `setup()` and attaching its hook) are **not wired
into the runtime path**. The doc comment says so, and there are **zero call sites of
`hookRegistry.attach()` outside its own file**.

So today: plugins can be enabled/disabled, their code is integrity- and sdk-range-checked and
imported — but the single hook never fires in production. Any tier that reuses this loader inherits
the gap.

## Stale document corrected

SPEC-045 (2026-07-21) recorded that none of SPEC-005 was built. **That is now stale.** `git log`
shows `ca7a85d SPEC-005: complete plugin-runtime Phases 2-4 (T019-T028)`, plus HTTP routes
(`server/routes/admin/plugins/{list,set-enabled}.ts`), admin UI
(`apps/admin/src/sections/Plugins.tsx`), agent tools (`plugins_list` / `plugins_set_enabled` in
`plugin-runtime/tool-registrations.ts`), and the `word-count` dogfood plugin — all real and wired.

## Trust model recommendation

**Capability-declared, default-deny** — extend the existing `gate()` pattern in `capability-sdk.ts`
(3 capabilities today: `content.read`, `content.extend`, `hooks.attach`) rather than replace it.

Explicitly **against** in-process-fully-trusted as the default, even though Tier-3 already does that
for today's plugins: agent-authored code accountable to a non-technical human is a strictly worse
trust case than ADR-024's own Tier-3 scenario (a human sideloading their own code), so it must not
inherit Tier-3's posture by default.

## Extension points that already exist

Each is a real working pattern; none is a generalized "declare X, attach at named call site Y"
contract. **That generalization across them is what's missing — not any individual call site.**

| Concern | Where |
|---|---|
| Content lifecycle | `content.entry.beforeSave` (SPEC-005 hook registry — the only hook) |
| Agent tool registration | `src/assistant/tool-registrations.ts` `DOMAIN_SLICES`; one `build<Domain>Registrations` per domain, duplicate-id build failure |
| Admin nav / panels | `apps/admin/src/panels.tsx` `ADMIN_PANELS` — "the single declaration of every admin section", replacing 3 hand-synced places |
| Rendering / placement | widget regions, `src/widgets/region-area-service.ts` (ADR-047) — reconcile-not-author binding tables |
| Async "this happened" | the outbox, `src/core/events` (ADR-009 / ADR-046), `SqliteOutboxAdapter` |
| HTTP routes | `server/routes/admin/*` composition-root pattern |

## Placement evidence (Jini vs Tovu)

Identity and permissions (`identity/seed.ts`, `identity/permissions.ts`) **already live in
`@jini-ai/cms`**, not Tovu. So a CMS-shaped mechanism — which plugin-runtime's
loader / hook-registry / capability-sdk arguably is — has precedent for living in Jini, while
plugin-runtime itself is still Tovu-only today.

## Naming collision confirmed

`@jini-ai/registry` (`packages/registry/src`) is semver resolution + GitHub-OIDC-signed
distribution — an entirely different concern. Do not reuse the word "registry" for this tier.
