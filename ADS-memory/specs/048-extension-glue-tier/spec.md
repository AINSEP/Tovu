# SPEC-048 — Site Glue: an agent-authored, capability-gated extension tier

Status: **DRAFT — awaiting owner clarification (4 markers below)**
Author: Coordinator (dispatched slice — Spec Agent persona), 2026-08-04
Builds on: SPEC-005 (plugin system), ADR-024 (plugin trust model), ADR-025 (plugin client JS
isolation), ADR-009 (hybrid decoupling), ADR-003 (plugins never get DDL), ADR-008 (change sets),
ADR-021 (identity/authz)

---

## 1. Intent, in the owner's words

> "For a website where I vibecode pages and apps, but I'm trying to give the user a full admin, I
> need a way for AI to create glue for stuff that I don't provide out-of-the-box… a folder that I
> can maybe override, extend, or add more functionality that acts as glue to bridge packages
> between that and the vibecoded app or even admin stuff. And an AI agent can do this — so they
> would have free reign to change and add anything in [that folder] that acts as glue, since every
> app is different."
>
> Clarification: **"the idea is that an agent can create or edit (in a controlled manner) stuff for
> a non-technical user."**

**The load-bearing constraint:** the author of the glue code is an AI agent. The accountable party
is a non-technical human who cannot read the code. Reconciling "free reign" with "controlled
manner" is this spec's actual deliverable — not the folder, and not a new plugin format.

---

## 2. Phase 1 verdict — extension, not a fourth mechanism, but a real one

**This is not a new parallel plugin system.** Tovu already has one real mechanism for exactly this
shape of problem — SPEC-005's plugin artifact/loader/capability-SDK/hook pipeline, governed by
ADR-024's tiered trust model. Site Glue reuses that pipeline's manifest shape, its capability-gate
pattern, and its change-set-backed activation lifecycle wholesale. **Nothing here invents a second
artifact format, a second loader, or a second capability-checking mechanism.**

What genuinely does not exist, and is this spec's real content:

1. **A hook/call-site vocabulary broad enough to be useful.** SPEC-005 ships exactly **one** hook —
   `HOOK_CONTENT_ENTRY_BEFORE_SAVE` (`packages/sdk/src/index.ts:45`; `addFilter` rejects any other
   name at validation, `HOOK_UNKNOWN`, per its own doc comment at `:104-106`). The owner's ask —
   "bridge packages… vibecoded app or even admin stuff" — needs call sites across content
   lifecycle, tool registration, admin nav, rendering, async events, and HTTP routes. None of that
   vocabulary exists yet; §5 below is this spec's actual substance.
2. **A distinct loading location + authorship trust posture.** SPEC-005's loader
   (`src/features/plugin-runtime/loader.ts`) discovers built-ins plus a fixed site-plugin
   directory; every real plugin today runs at ADR-024 Tier-3 (full in-process trust — Tier-2's
   sandbox doesn't exist yet, see §4). Glue modules are never distributed, never installed from a
   marketplace, and are authored *in place* by the same system that will run them, for one specific
   site. That is a different trust question from "how much do we trust the publisher" — see §4.
3. **An agent-author control loop.** SPEC-005 has enable/disable. It has no concept of "an agent
   proposed this code, a human who cannot read it must approve it before it runs" — see §6.

**A disclosed pre-existing gap this spec inherits if it reuses the loader as-is:** `loader.ts`'s
own doc comment (`loader.ts:140-146`) states that steps 4–5 of `loadPlugin()` — invoking a loaded
plugin's `setup()` and attaching its declared hook via `hook-registry.ts` — are "deliberately NOT
wired here." I confirmed this directly: `hookRegistry.attach()` has **no call site anywhere in the
codebase** outside `hook-registry.ts`'s own doc comment referencing it
(`grep -rn "hookRegistry\.attach" src` returns nothing). So today, an enabled plugin is
integrity-checked, sdk-range-checked, and `import()`-ed, but **its hook never actually fires in
production.** This is not something Site Glue needs to fix — SPEC-005 owns it — but a spec that
silently assumed the hook pipeline already runs end-to-end would be building on a foundation that
isn't there. Flagged, not assumed away.

**SPEC-045's finding that "none of SPEC-005 is implemented" is stale.** That was true 2026-07-21.
`git log` shows `ca7a85d SPEC-005: complete plugin-runtime Phases 2-4 (T019-T028)` landed after,
plus real HTTP routes (`server/routes/admin/plugins/{list,set-enabled}.ts`), a real admin UI
(`apps/admin/src/sections/Plugins.tsx`, 166 lines), real agent tools (`plugins_list`,
`plugins_set_enabled` in `plugin-runtime/tool-registrations.ts`), and the `word-count` dogfood
plugin (`plugin-runtime/built-ins/word-count/index.ts`) are all wired and real.

---

## 3. What already exists — do not rebuild

| piece | where | state |
|---|---|---|
| Plugin artifact envelope (manifest, integrity hash, sdkRange) | `features/plugin-runtime/manifest.ts`, `loader.ts` | Built. Steps 1–3 of `loadPlugin()` are real; steps 4–5 are not wired (see §2) |
| Capability-scoped SDK, `gate()` pattern | `features/plugin-runtime/capability-sdk.ts` | Built. 3 capabilities today: `content.read`, `content.extend`, `hooks.attach`. Ungranted calls throw `CapabilityDeniedError` synchronously, never silently omit (`capability-sdk.ts:16-19`, CIC U-003) |
| Tiered trust model | ADR-024 | Accepted. Tier-1 declarative (real), Tier-2 sandboxed code (**not built** — see §4), Tier-3 trusted in-process (real, the only tier that actually runs code today) |
| Plugin client/admin JS isolation | ADR-025 | Accepted **in principle**; the sandboxed-iframe + `postMessage` RPC mechanism itself is unbuilt — "the RPC verb catalog… frozen only when OQ-07 is built" (ADR-025 Open); OQ-07 (admin-surface/extension-panel registry) is explicitly blocked (ADR-024 §8) |
| Content-lifecycle hook | `features/plugin-runtime/hook-registry.ts` | One hook, fail-closed, deterministic TB-01 order (built-ins then site plugins, id-ascending) |
| Change-set gateway (plan/confirm/execute, revert) | ADR-008, SPEC-001, `core/commands` | Built. `plugins_set_enabled` already routes through it (`plugin-runtime/tool-registrations.ts:104-135`) with `captureInverse`/`rollback` |
| Outbox (async "this happened" events) | `core/events`, ADR-009, ADR-046 Phase 1 | Built (`SqliteOutboxAdapter`). Handlers are expected idempotent (retries) |
| Agent tool registration, per-domain | `assistant/tool-registrations.ts`'s `DOMAIN_SLICES` | Built. One `build<Domain>Registrations` per domain, assembled centrally; **duplicate id throws and stops daemon boot** — a fail-*fast*, not fail-*isolated*, discipline (see §5.2 for why glue can't reuse this as-is) |
| Admin nav/panel single source of truth | `apps/admin/src/panels.tsx`'s `ADMIN_PANELS` | Built. Explicitly "the single declaration of every admin section," replaced 3 previously-hand-synced places (routing, nav, AI assistant's page allowlist) |
| Widget region/embed placement | `widgets/region-area-service.ts`, ADR-047 | Built. Reconcile-not-author discipline over binding tables |
| Permission catalog, capability-vs-authorization separation | `@jini-ai/cms`'s `identity/permissions.ts` (Jini repo) | Built, and **already extracted to Jini** — see §7 |
| Distribution/signing/versioning (a different concern) | `@jini-ai/registry` (Jini repo) | Built — semver resolution + GitHub-OIDC-signed distribution against three backends. **Not what this spec is about; see §8 naming** |

---

## 4. Decision 1 — the trust model (the central decision)

**ADR-024's Tier-1/2/3 ladder answers "how much do we trust the *publisher* of this code" —
distribution trust.** Site Glue's code has no publisher to trust or distrust: an agent wrote it
locally, for this one site, and the accountable human cannot read it. That is a different axis —
**authorship/reviewability trust** — that ADR-024 never had to define because it assumed a human
author (even Tier-3's "local/first-party/sideloaded" framing assumes *someone who chose to run
this* read it or trusts themselves).

**Decision: Site Glue is not a fourth ADR-024 tier.** It inherits Tier-3's honest execution
disclosure (in-process, capability-gated **at the SDK surface only**, not sandboxed — ADR-024's own
words: "capability enforcement is API-surface-level, not a sandbox — an in-process ESM plugin can
still touch `fs`, `process.env`, and the network") *combined with* a distinct authorship contract
ADR-024 never needed:

- **REQ-1.** Every glue module declares the capabilities it needs in its manifest, from the same
  vocabulary `capability-sdk.ts`'s `gate()` already enforces, extended with the call-site
  capabilities §5 adds (e.g. `admin.nav.register`, `tools.register`, `render.contribute`,
  `events.subscribe`, `http.route.register`). The loader exposes **only** the granted surface;
  every position is always present (never omitted), granted calls delegate, ungranted calls throw
  `CapabilityDeniedError` — identical shape to `capability-sdk.ts:98-105`'s `gate()`, extended in
  vocabulary, not replaced in mechanism.
- **REQ-2.** A glue module cannot self-activate. First activation, and **any manifest diff that
  adds a capability**, requires an explicit owner approval step (§6) — silently re-enabling a
  module whose declared capability set grew is not "controlled."
- **REQ-3.** Because no real sandbox exists (Tier-2's mechanics are explicitly "designed-for, not
  built now" per ADR-024's Open section), the approval surface must disclose this honestly, in the
  same spirit as ADR-024's "never marketed as safe": something to the effect of *"this code runs
  with the same privileges as the rest of your site once enabled — capability declarations are
  enforced at the interface it's given, not by a sandbox around it."* Do not build a UI that implies
  stronger isolation than exists.
- **REQ-4.** No raw filesystem/network/process handle is ever passed to glue code by the loader —
  only capability-scoped SDK handles, matching ADR-024 §3's "capabilities passed by handle, not by
  reference" and the serializable-payload rule, so a later move to real process isolation (ADR-024
  §4 rung 1/2) is a runtime swap, not an API break.

**Given the trust rung is weak (advisory-only, same as Tier-3), the recovery rung must be strong.**
ADR-024's own organizing invariant applies directly: *"no feature ships whose failure mode exceeds
the current recovery rung."* §6 and §7.3 are where that invariant gets discharged for Site Glue.

---

## 5. Decision 2 — the named call sites (the substance of this spec)

A folder with no call sites is inert — this is the brief's framing and it is correct; enumerating
real, existing attachment points is the actual work.

**REQ-5.** The v1 extension-point catalog, each grounded in a real, working mechanism today:

| category | existing mechanism | attach shape for a glue module |
|---|---|---|
| Content lifecycle | `hook-registry.ts`'s `HOOK_CONTENT_ENTRY_BEFORE_SAVE` | Same hook, same `ext.{moduleId}.*` namespacing (ADR-003) |
| Agent tool registration | `assistant/tool-registrations.ts`'s `DOMAIN_SLICES` pattern | A glue-contributed tool list, composed **after** core domains (§5.1) |
| Admin nav entry | `apps/admin/src/panels.tsx`'s `ADMIN_PANELS` | A nav/route declaration only — **not** panel content (see the v1 cut below) |
| Rendering | site `render.ts` / widget region binding (ADR-047) | Server-rendered data contribution only — no client JS injected into the admin origin |
| Async "this happened" | the outbox (`core/events`, ADR-009) | A subscribed handler, naturally isolated by outbox retry/dead-letter semantics |
| HTTP routes | `server/routes/admin/*` composition pattern | A declared route + handler, capability-gated the same way `admin.plugins.enable` gates `plugins_set_enabled` today |

**REQ-6 — v1 explicitly excludes client-side/admin-panel UI contribution.** A glue module cannot
ship its own admin panel content (settings screens, editor extensions, client JS) in v1. This is
not a conservative default — it is a hard blocker: ADR-025's sandboxed-iframe + `postMessage` RPC
mechanism, the only safe way to render untrusted client JS in the admin origin, is explicitly
unbuilt ("frozen only when OQ-07 is built," and OQ-07 itself is "blocked until it lands" per
ADR-024 §8). Shipping client-contributed admin UI before that mechanism exists would reopen the
exact same-origin session-theft hole ADR-020/ADR-025 exist to close. A glue module may register a
**nav entry that routes to a server-rendered page**, not an admin-origin script.

### 5.1 Load order (why not filename alphabetization)

**REQ-7.** Glue modules load in a fixed, deterministic order: **after** built-in plugins and
site-installed plugins, id-ascending within the glue tier — the same TB-01 discipline
`hook-registry.ts` already applies to plugins (`hook-registry.ts:20-24,80-88`), extended by one
more ordered stage. Filename alphabetization is rejected for the same reason ADR-024 §7 already
rejects "implicit registration-order semantics" generally: a rename becomes a silent behavior
change, and nothing about a filename expresses intended priority. Glue running last matches the
owner's own framing — it is meant to *bridge already-installed capability*, the same relationship
a WordPress theme's `functions.php` has to already-active plugins, not a replacement for load-order
discipline within the tier itself.

### 5.2 Failure containment differs by call-site category

**REQ-8.** A uniform containment policy is wrong here, and reusing `DOMAIN_SLICES`'s existing
fail-**fast** discipline verbatim would be a mistake for glue specifically:

- **Data-mutation call sites** (content lifecycle): stay **fail-closed**, unchanged from
  `hook-registry.ts`'s existing CIC U-004 discipline — a throwing hook must abort the save, not
  produce a partial write. Reuse as-is.
- **Admin-surface / boot-time call sites** (nav registration, tool registration, route
  registration): must be **fail-isolated** — a new discipline, not a reuse of `DOMAIN_SLICES`'s
  current "duplicate/failed registration throws and stops daemon boot." This is the sharpest
  containment requirement in this spec: some of these call sites are contributed by the same
  mechanism the owner would need to open the admin and disable a broken module. **A broken glue
  module must never be able to prevent the admin shell itself, or any other module's contribution,
  from mounting.** Each glue registration call is wrapped, a throw is caught, logged, and the
  module is auto-quarantined (§7.3) — core panels and other modules' contributions must still boot.
- **Rendering call sites**: fail-isolated — skip the contribution, render the page without it,
  log. A glue-caused 500 on every page load is a worse failure mode than a missing widget.
- **Async event subscriptions**: no new mechanism needed. The outbox's own retry/dead-letter
  semantics already require idempotent handlers (ADR-009's consequence, "event handlers must stay
  idempotent"); a throwing glue-contributed handler is contained the same way any handler is.

---

## 6. Decision 3 — discovery, upgrade safety

**REQ-9.** Glue modules live in a directory that is **core-adjacent, never core-owned** — the same
reasoning as `wp-content/`'s upgrade-safety property named in the brief: a Tovu core upgrade must
never write to, or be able to overwrite, this directory. Concretely, this means glue is discovered
from a location outside whatever directory core's own build/release artifact occupies (mirroring
how `features/plugin-runtime`'s site-plugin directory is already separate from core's own source
tree) — the exact path is an implementation detail for the Architect stage, not a spec-level
decision, but the invariant (core upgrade path never touches it) is spec-level and binding.

**REQ-10.** Glue modules reuse SPEC-005's manifest shape (id/version/capabilities/hooks/sdkRange)
for one-vocabulary consistency, but **skip the integrity-hash check** (`loadPlugin()` step 1).
Integrity hashing exists to catch tampering of a *downloaded* artifact; a glue module is authored
in place by the same system about to run it — there is no download step to tamper with. This
mirrors the `word-count` built-in's own precedent exactly: `integrity: {}` because "built-in — no
packaged files to hash" (`built-ins/word-count/index.ts:34`). Glue modules keep step 2 (sdkRange
check) — that check is about *compatibility*, not tampering, and still applies.

---

## 7. Decision 4 — the agent-author control loop

**REQ-11 — Propose.** An agent edits or creates a glue module's manifest + code in a staged, not-
yet-active location — the shape SPEC-005's manifest/loader validation already assumes (validate
before anything runs), extended with a draft/staged status distinct from "installed and active."

**REQ-12 — Validate before it can run.** Static validation (manifest schema, capability vocabulary
membership, sdkRange) happens **before** step 3 of `loadPlugin()` (code import) can ever run — this
is the existing CIC U-001 ordering guarantee in `loader.ts` (integrity/compat before code
evaluation), reused verbatim; a malformed proposal never reaches execution, staged or not.

**REQ-13 — Owner sees, in plain language.** The raw diff is not sufficient for a non-technical
owner (the clarification's own framing). The agent must generate a plain-language summary
alongside the diff: what changed, which capabilities are requested (and which are new versus
already-granted), and which call sites the module attaches to. This is genuinely new — SPEC-005's
existing `Plugins.tsx` admin UI is an enable/disable toggle over pre-vetted plugins; it has no
diff/preview/summary concept at all, because nothing in SPEC-005's world is agent-authored.

**REQ-14 — Owner approves; activation is free, already-built infrastructure.** Approval routes
through the *same* change-set gateway pattern `plugins_set_enabled` already uses
(`plugin-runtime/tool-registrations.ts:104-135` — `executeCommand`, `captureInverse`, `rollback`).
No new mutation-safety mechanism is needed for the activation *state* transition.

**REQ-15 — Revert must restore code, not just activation state.** This is where reuse stops being
sufficient: today's change sets (ADR-003/ADR-008) revert *data rows* — `plugin_activations` is a
row, and reverting it is a row flip. A glue module's content is a **file**. "Revert" for glue must
restore prior file content, not merely flip an activation boolean back. **Per-turn snapshot + full
rewind — not a Stop button — is the mechanism**, directly reusing the Pages/Zana precedent (D-7,
`ADS-memory/reports/recon/pages-vibecoding-decisions.md:71-76`): bolt.diy's Stop button is wired to
`workbenchStore.abortAllActions()`, an empty stub with a literal `// TODO`; its snapshot-and-rewind
path, by contrast, is fully built with no TODOs. The lesson transfers exactly: streaming/stopping
buys perceived speed, not safety; only a real snapshot gives revert an actual guarantee. Every
agent turn that touches a glue module snapshots its prior file content before writing; rewind
restores it, going through the same change-set-gateway activation flip if the rewind also changes
enabled state.

**REQ-16 — The no-brick invariant, concretely.** A broken glue module must never be able to prevent
the owner from reaching the admin surface needed to disable or revert it. This is discharged by
three things acting together, not one: (a) §5.2's fail-isolated containment for admin-surface call
sites, so a throwing glue registration cannot stop the admin shell or other panels from mounting;
(b) §7.3's auto-quarantine, so a repeatedly-failing module disables itself without waiting for the
owner to notice; (c) REQ-15's snapshot+rewind, so "restore the last known-good state" is always a
real, tested action, not a hope.

### 7.3 Auto-quarantine

**REQ-17.** If a glue module's registered handler throws or times out repeatedly within a bounded
window, the loader auto-disables it — the same activation-flip path REQ-14 uses, attributed to a
system actor — and surfaces a clear, owner-visible notice naming the module and the call site that
failed. **The specific threshold (failure count, window, timeout) has no precedent to derive from
in this codebase and is marked `[NEEDS CLARIFICATION]` below** — it is a product/UX tuning
decision, not one Phase 1 recon can resolve from evidence.

---

## 8. Decision 5 — naming (hard constraint, satisfied)

**`@jini-ai/registry`** (`packages/registry/src` in the Jini repo — `github-client.ts`, `trust.ts`,
`versioning.ts`, `static-backend.ts`/`database-backend.ts`/`github-backend.ts`) already means
something entirely different: **semver specifier resolution plus signature-verified distribution
of content entries against a GitHub Actions OIDC trust root, with three interchangeable backends.**
Calling this feature a "registry" would collide with a real, shipped concept one repo over.

**Decision: this tier is named "Site Glue."** The directory is `site-glue/`; the unit is a **glue
module**. Neither term collides with `plugin` (SPEC-005's installable, potentially-distributed,
Tier-1/2/3-classified artifact) or `registry` (Jini's distribution mechanism) or `ToolRegistry`
(`@jini-ai/core/src/tool-registry.ts`, the in-process tool-lookup structure the daemon already
uses). "Glue" also matches the owner's own word for the concept verbatim.

---

## 9. Decision 6 — where it lives: Jini or Tovu

**Confirmed via source, not assumption:** `identity/seed.ts` and `identity/permissions.ts` —
Tovu's entire capability/permission catalog, including the exact "theme-source editing is a
build-time-shaped capability" and "`media.upload_svg` is XSS-risk-gated" precedents this spec's
Decision 1 draws on — **already live in `@jini-ai/cms`, in the Jini repo**
(`packages/cms/src/identity/{seed,permissions}.ts`), moved there by commit `7107118`
("refactor(cms): consume identity, navigation, and media from @jini-ai/cms"). `ToolRegistry`
(the in-process tool-lookup structure `assistant/tool-registrations.ts` builds against) is
similarly already in `@jini-ai/core`.

**By contrast, `features/plugin-runtime`** — the loader, hook-registry, capability-sdk, manifest,
and discovery machinery Site Glue is meant to extend — **has not been extracted to Jini.** It is
still Tovu-only, despite being the closest sibling to identity/permissions in shape (a
CMS-content-hook-shaped mechanism, not a Tovu-specific admin concern).

**Recommendation:** design Site Glue's mechanism (manifest vocabulary, capability-gate extension,
hook dispatch for the new call sites) with the same Jini-portability discipline ADR-024 §3 already
mandates for the plugin SDK — async-only, serializable payloads, capabilities by handle — but
**implement it in Tovu now**, alongside `plugin-runtime`, rather than opening a new Jini package
ahead of the mechanism it extends. **Do not let this spec force `plugin-runtime`'s own extraction
to Jini as a prerequisite** — that is a materially larger, unscoped project (moving an entire
feature's data model, tests, and wiring across repos) that this dispatch never authorized. The
**admin mounting** (approval UI, diff/summary rendering, nav entries, quarantine notices) stays in
Tovu regardless of where the mechanism ends up — it is inherently tied to Tovu's own admin shell,
not portable to Jini's other consumers (an app-builder product and a marketing product, per the
brief).

**`[NEEDS CLARIFICATION: sequencing]`** — whether the owner wants `plugin-runtime`'s Jini extraction
pulled forward to happen *with* this feature (bigger scope, cleaner end state) or deferred to
whenever the rest of `plugin-runtime` naturally migrates (smaller scope now, a second migration
pass later, same "DUPLICATED until [the host] is rewired" pattern this codebase has already
accepted once for the CMS package). This is a resourcing/sequencing call only the owner can make;
Phase 1 evidence supports either answer.

Per Jini's `R5-neutrality` guard rule (`scripts/check-engine-boundaries.ts:9,70`): whatever lands in
Jini must carry **zero product-identity strings**, including in comments — "Tovu" (and "Tovu-Runner"
by substring) is checked and enforced even in comments. Any Jini-side glue-mechanism code must be
written product-neutral from the first line.

---

## 10. Decision 7 — non-goals

**REQ-18.** Explicitly out of scope for this spec:

- **Not an npm-installing plugin marketplace.** No package registry, no third-party distribution —
  Site Glue modules are single-site, agent-authored, never shared. (Distribution, if ever wanted,
  is `@jini-ai/registry`'s problem, a different feature entirely.)
- **Not a general sandbox/VM tier.** No isolate, no worker process, no resource-limited runtime.
  Real process/capability sandboxing is ADR-024 §4's Tier-2 rung, tracked there, not reinvented
  here. Site Glue's safety story is capability-declaration-plus-recovery, honestly labeled as
  advisory (§4), not sandboxing.
- **Not a replacement for SPEC-005's plugin system.** Confirmed by Phase 1: SPEC-005 is real,
  substantially implemented, and Site Glue extends its manifest/loader/capability-SDK lineage
  rather than duplicating it.
- **Not admin-panel/client-JS contribution in v1** (REQ-6) — blocked on ADR-025's unbuilt RPC
  mechanism, not a scope preference.
- **Not a fourth ADR-024 distribution tier** (§4) — authorship trust and distribution trust are
  different axes; conflating them was the wrong framing to spec against.

---

## 11. Open questions — `[NEEDS CLARIFICATION]`

1. **Jini extraction sequencing** (§9) — pull `plugin-runtime`'s Jini migration forward with this
   feature, or defer it and accept a second migration pass later. Owner resourcing call.
2. **Auto-quarantine thresholds** (§7.3, REQ-17) — failure count, time window, and timeout values
   have no precedent in this codebase to derive from; a product/UX decision, not a Phase 1 finding.
3. **Raw source visibility.** The clarification's framing ("a non-technical user") establishes the
   *default* surface must be a diff/summary, not raw code (REQ-13). It does not resolve whether a
   technically-curious owner, or a support engineer acting on the owner's behalf, gets any "view
   raw source" affordance at all, or whether the summary is the *only* surface, full stop. Affects
   the approval UI's shape materially.
4. **v1 call-site priority.** REQ-5's table lists six categories as architecturally ready (modulo
   REQ-6's UI exclusion). Whether all six ship together or the owner wants a narrower v1 (e.g.
   content-lifecycle + tool-registration + HTTP routes only, admin-nav and rendering deferred) is a
   scope/cost call Phase 1 evidence doesn't resolve on its own.

---

## 12. Concerns

- **The trust story is honest, not strong.** Given ADR-024's Tier-2 sandbox is unbuilt, Site
  Glue's actual runtime guarantee in v1 is "capability-gated at the interface, full process trust
  underneath" — the same honesty ADR-024 already requires for Tier-3. This spec leans hard on the
  *recovery* side (snapshot+rewind, fail-isolated admin call sites, auto-quarantine) to compensate,
  per ADR-024's own "no feature ships whose failure mode exceeds the current recovery rung"
  invariant. That is a considered trade, not an oversight, but it means the marketing framing must
  stay as careful as ADR-024's own — "an agent can write and run code on your site, recoverably,"
  not "an agent can write and run code on your site, safely."
- **§5.2's fail-isolated containment is new, not reused.** `DOMAIN_SLICES`'s existing discipline is
  fail-fast by design (a duplicate/misconfigured tool registration stops daemon boot outright,
  deliberately, per `assistant/tool-registrations.ts:294-302`). Glue's admin-surface call sites need
  the opposite property for the no-brick invariant to hold. Implementing two containment postures
  side-by-side in what is otherwise one registration pipeline is real design and test work the
  Architect stage should size explicitly, not treat as a small addition.

## 13. What I could not verify

- Whether the daemon's tool-registration boot failure (`DOMAIN_SLICES` throwing on collision) is
  process-fatal or caught somewhere further up the boot sequence — I read `tool-registrations.ts`
  directly but did not trace the daemon's own top-level boot/catch behavior. Relevant to how severe
  reusing that discipline verbatim for glue would actually be.
- The exact current wiring (if any) that would let `loadPlugin()`'s steps 4–5 fire in a future
  SPEC-005 fix — I confirmed the gap exists (§2) but did not investigate SPEC-005's own remaining
  task list for whether/when it closes. If it closes before Site Glue implementation starts, some
  of §5's "reuse hook-registry.ts as-is" framing should be re-checked against the fixed version.

---

## Handoff Contract

- **Inputs used:** `ADS-memory/specs/005-plugin-system/` (headers only, not the full 55KB package),
  `ADS-memory/specs/043-widgets/` and `045-plugins-admin/` (headers), `ADS-memory/reports/recon/
  pages-vibecoding-decisions.md` (D-7, D-12), ADR-003/008/009/024/025, `ADS-memory/governance/
  constitution.md`; source: `src/features/plugin-runtime/{manifest,loader,hook-registry,
  capability-sdk,tool-registrations,activation}.ts`, `src/features/plugin-runtime/built-ins/
  word-count/index.ts`, `src/assistant/{tool-registrations,tool-catalog-query,tool-executor-audit}.ts`,
  `src/assistant/site/capability-registry.ts`, `src/server/capability-inventory.ts`,
  `apps/admin/src/{panels.tsx,nav.ts}`, `src/widgets/region-area-service.ts`, `src/server/seed.ts`;
  Jini repo: `packages/cms/src/identity/{seed,permissions}.ts`, `packages/core/src/tool-registry.ts`,
  `packages/registry/src/*`, `scripts/check-engine-boundaries.ts`; `ADS-memory/specs/
  046-site-assistant-page-actions/spec.md` (shape/rigor reference).
- **Output summary:** Site Glue extends SPEC-005's plugin lineage (same manifest shape, same
  capability-gate mechanism, same change-set-backed activation) rather than replacing it. Its real
  content is (1) a broad named-call-site vocabulary SPEC-005 never needed, (2) an authorship-trust
  posture orthogonal to ADR-024's distribution-trust ladder, (3) an agent-author control loop
  (propose → validate → plain-language diff → approve → snapshot-backed revert) SPEC-005 has no
  equivalent of, and (4) differentiated failure containment by call-site category, since a uniform
  policy would either be unsafe (data mutation) or brick the admin (boot-time registration).
- **Risks:** the no-brick invariant (REQ-16) depends on getting §5.2's containment split right —
  reusing `DOMAIN_SLICES`'s fail-fast discipline for admin-surface call sites would defeat the
  entire premise. REQ-6's client-JS exclusion is a hard blocker on ADR-025 landing, not a
  preference — if the Architect stage relaxes it, ADR-025's OQ-07 must land first, in full.
- **Suggested next assignee:** owner, for the four `[NEEDS CLARIFICATION]` markers in §11 — this
  spec is not Software-Architect-ready until at least #1 (Jini sequencing) and #4 (v1 call-site
  priority) are resolved, since both change the shape of what gets architected. #2 and #3 could
  plausibly be deferred to the Architect stage as design details if the owner prefers, but are
  called out here rather than guessed.
