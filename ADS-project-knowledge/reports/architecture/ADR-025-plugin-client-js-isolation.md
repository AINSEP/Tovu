# ADR-025: Plugin Client / Admin JS Isolation — Sandboxed Cross-Origin Iframe + postMessage RPC (Generalizes ADR-020)

- Status: PROPOSED 2026-07-08 (from the 2-round plugin-roadmap swarm debate; the decide-now item that unblocks OQ-07)
- Author: Leon Aburime / Coordinator (Opus 4.8 Primary) with peers Codex `gpt-5.5`, Gemini 3.1 (`agy`), Fable
- Extends: **ADR-020 §6-correction** (generalizes the theme separate-origin + CSP rule to plugin client JS)
- Relates: **ADR-024** (§8 records this as its own decide-now ADR; §3 serializable ABI is the shape this RPC follows), ADR-021 (the operator session this protects), ADR-013/014 (assistant/admin surfaces that will host plugin panels), ADR-022 (core admin mutation APIs a hijacked session could call), OQ-07 (admin-surface / extension-panel registry — blocked on this)

## Context

Plugins that contribute **admin panels, settings screens, or editor extensions** ship
**browser JavaScript**. ADR-024's Tier-1/2/3 model governs a plugin's *server-side*
execution, but says nothing about where its **client** code runs — and that is a distinct,
equally dangerous boundary.

The threat is the one ADR-020 already discovered for **theme** JS and fixed in its §6
correction: **a CMS admin renders in the same origin as the logged-in operator session**
(ADR-021). Any JavaScript that runs **same-origin** with that session can call core admin
mutation APIs (ADR-022's write chokepoint, ADR-018's command gateway, etc.) using the
operator's **own cookie**, via a plain `fetch()`. It can also read session storage and
`localStorage`. So a "fun little settings widget" from an untrusted plugin can silently
perform **any action the logged-in operator can** — create admin principals, publish or
delete content, exfiltrate secrets — with no exploit, just same-origin trust.

ADR-020 §6 corrected exactly this for themes and **explicitly deferred the plugin-side
version to its own ADR** (ADR-020 Follow-ups; ADR-024 §8 confirms the dependency and marks
admin-panel work OQ-07 blocked until it lands). This is that ADR.

Full trace + decision ledger (#7): `.local-artifacts/swarm-consensus/runs/20260708T195959Z-plugin-system-roadmap/consensus-report.md`.

## Decision

### 1. Plugin client JS runs in a sandboxed, cross-origin iframe — never on the admin origin

Any plugin-contributed browser code (admin panel, settings UI, editor extension, client
island) is rendered inside a **sandboxed iframe served from a separate, cookie-less,
credential-isolated origin** — never inline on, and never same-origin with, the Tovu
admin/author session. This is ADR-020 §6's "separate cookie-less origin" rule, generalized
from themes to plugins. Because the origin carries no session cookie and no admin
`localStorage`, a hostile plugin panel has **no ambient authority to steal**.

### 2. It talks to core only through a `postMessage` RPC — no live objects cross the boundary

The iframe communicates with the host admin shell **exclusively** over a **`postMessage`
RPC** channel. The host validates `origin` on every message; the plugin frame never
receives a live core object, DOM handle, or session token. Payloads are **serializable
only** — deliberately aligned with **ADR-024 §3's transport-agnostic ABI** (async,
structured-clone-safe, capabilities by handle not by reference). The client boundary and
the server boundary are therefore the *same shape*, which is what lets a plugin's client
and server halves share one capability model.

### 3. A strict CSP with `connect-src` locked down (no ambient egress)

The plugin frame ships with a **strict CSP** — at minimum `connect-src` restricted so the
frame cannot make arbitrary network calls back to the admin origin or exfiltrate freely
(ADR-020 §6's `connect-src 'none'` baseline for pure client JS; any network a plugin needs
is a **declared capability mediated by core over the RPC**, not a raw `fetch` from the
frame). Every privileged action the panel wants is an **explicit, capability-checked RPC
call the host authorizes**, subject to ADR-021 authorization — not something the frame can
do on its own because it happens to share an origin.

### 4. Capability-gated, consistent with ADR-024

Contributing a client surface is a **capability** (ADR-024 §6 namespace; e.g.
`ui.adminPanel`), default-deny, surfaced at install consent. The host renders a plugin's
frame and grants RPC verbs **only** for capabilities the plugin was consented. This keeps
client UI on the **same separate axis** as human authorization (ADR-021) and the same
deny-by-default vocabulary as the rest of the plugin capability set.

### 5. This is a decide-now boundary, built early (recovery-ladder-aligned)

The **decision** (separate origin + RPC + CSP + capability gate) is frozen now because it
is a boundary, and boundaries are expensive to move once plugins depend on the DOM they are
handed. The **full mechanism** (the iframe host component, the RPC verb catalog, the panel
registry) is built alongside the admin-panel work it unblocks — but never in a way that
first ships a same-origin panel and retrofits isolation later.

## Consequences

- **Closes the plugin admin-UI session-theft hole** that ADR-020 §6 flagged for themes —
  now for plugins too, with the same mechanism, so there is one origin-isolation story
  across themes and plugins rather than two.
- **Unblocks OQ-07** — the admin-surface / extension-panel registry is designable once the
  boundary is fixed; ADR-024 §8 named this as the blocker.
- **One boundary shape, client and server.** Reusing ADR-024 §3's serializable ABI for the
  `postMessage` RPC means a plugin author learns one capability/serialization model, and a
  future move to out-of-process server isolation does not create a second, divergent client
  contract.
- **Real DX cost, accepted.** Plugin panels cannot reach into the host DOM or call admin
  APIs directly; everything privileged is an async RPC round-trip. This is the same
  front-loaded cost ADR-024 §3 accepts for the server ABI, for the same reason: it is the
  price of a retrofit-free path to safe third-party UI.
- **Does not, by itself, sandbox Tier-3 server code** — this ADR is the *client* boundary
  only. A Tier-3 plugin's *server* half still has full machine access until ADR-024 §4
  isolation ships. The two boundaries are complementary, not substitutes.

## Open

- **RPC verb catalog** — the concrete set of host-mediated verbs (read config, request a
  capability-checked mutation, subscribe to host events) is designed alongside the panel
  registry; frozen only when OQ-07 is built.
- **Separate-origin delivery mechanism** — sandboxed iframe on a distinct local origin vs a
  dedicated theme/plugin domain (ADR-020 left the same choice open for themes). Pick once,
  for both, when the host component is built; the *rule* (cookie-less, credential-isolated)
  is fixed here regardless.
- **Editor-extension ergonomics** — TipTap/editor plugin surfaces (ADR-016/017) need richer
  host↔frame interaction than a settings panel; whether that stays pure RPC or needs a
  constrained shared render-IR seam is deferred to editor-extension design.

## Debate record

Recorded as decision-ledger item **#7** of the 2-round plugin-roadmap planning debate.
**Majority decide-now:** Codex, Fable, and Primary held that this is cheap (it generalizes
machinery ADR-020 already built for themes) and that it blocks admin-panel design (OQ-07),
so it should be decided now rather than deferred. **Dissent (recorded, not adopted):** agy
would **defer** this to Tier-2 UI work, on the view that client-surface design can wait
until the sandbox exists. The majority judged the boundary decision separable from — and
cheaper than — the sandbox mechanism, and worth fixing before any plugin ships a panel that
would have to be un-shipped. Full trace: `.local-artifacts/swarm-consensus/runs/20260708T195959Z-plugin-system-roadmap/consensus-report.md`.
