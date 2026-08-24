# Swarm Consensus — Tovu Extension Surface — SYNTHESIS

**Date:** 2026-08-20 · **Branch:** general-work · **Rounds:** 2

## Participants

| Role | Model | Weight |
|---|---|---|
| Primary / synthesis | Claude Opus 5 | — |
| Peer | `gpt-5.6-sol` @ xhigh (codex) | full |
| Peer | Gemini 3.1 Pro (High) (agy) | downweighted (owner instruction) |
| Peer | Gemini 3.7 Flash (High) (agy) | downweighted (owner instruction) |
| Adversarial reviewer | Claude Sonnet 5 | non-voting (same family as primary) |

Round 1 = independent positions. Round 2 = rebuttal after a correction preamble.
**Every peer revised or conceded on at least two of three questions.** No peer merely restated.

---

## RESULT 1 — Merge `plugin-runtime` and `site-glue`. Unanimous (4/4).

Round 1 was 3–1. After round 2, unanimous — including the peer that had argued separate.

**The deciding fact:** `site-glue` has no runtime. No `loader.ts`; `GlueHostPort` has zero non-test
implementations; zero production callers of its attachment points. This is *one working substrate
plus an unfinished design*, not two systems. `plugin-runtime` already has working `loader.ts`,
`activation.ts`, `quarantine.ts`, `discovery.ts`, `hook-registry.ts`, and is composed into the
server save path.

**What survives from ADR-057 (all peers agree):** its trust argument is a *policy* constraint on
the merged system, not a reason for a second runtime. Distribution and authorship are real, but
they are **installer-recorded metadata on one extension record**:

```
origin:     "built-in" | "marketplace" | "upload" | "local-agent"
authorship: "publisher" | "operator" | "agent"
tier:       tier-1 | tier-2 | tier-3        (how code runs)
kind:       render.component | http.route | …  (where it attaches)
capabilities: [...]                          (what authority the handler gets)
```

**Binding invariant (Sonnet, refused to concede; primary endorses):** `origin` must be assigned by
the installer and be **un-promotable**. No migration and no admin action may promote a
`local-agent` module to marketplace-eligible without a real re-authorship event. Otherwise code
with no publisher acquires a publisher's distribution rights — exactly what ADR-057 exists to
prevent.

**Also agreed:** integrity hashing applies in the distributed-artifact installer only. Local glue
has no artifact to verify; hashing co-deployed files against themselves buys nothing. That policy
difference does not justify a second runtime. Shared vocabulary should live *below* both features
rather than one sibling importing the other.

**Open:** ADR-057 is `DRAFT — not accepted`. It needs an amendment recording that its conclusion
(separate mechanisms) is superseded while its trust axis is retained.

---

## RESULT 2 — Contributions return `{componentId, props, children?}`. Unanimous (4/4).

**Raw HTML is dead.** Conceded by the peer that proposed it *and* by the strongest peer.

The shape already exists: `WidgetRenderIR` at `src/widgets/types.ts:223-227`, with recursive
`children?: readonly WidgetRenderIR[]`. The round-1 "flat vs. nested" argument was moot — Tovu
already ships the hybrid: a closed component id **plus** optional children.

- **Tier-1** may only parameterize component ids that already exist. Pure data, no code.
- **Tier-2/3** may register new ids via a reviewed resolver inside its isolation boundary — but the
  output still resolves through the host renderer catalog. Unknown ids degrade to the existing
  placeholder.

**The decisive argument against a generic `{tag, attrs, children}` tree** (sol, independently
supported by Sonnet): Tovu would acquire a **permanent second HTML security model** — URL
protocols, `style`, forms, outbound resources, dangerous attributes, nesting depth, size limits,
accessibility semantics. Those policies live inside host renderers today (`safeHref`,
field-attribute validation, escaping). The four-scanner drift that `core/embeds/marker.ts` unified
away is the precedent for how parallel generic contracts decay.

Sonnet's supporting evidence: `section()` branches `section--media-left`/`-right`; `featureGrid()`
owns its own grid scaffolding. **Core does not trust a generic tag primitive even for its own
first-party content.**

### Blocking sub-finding — two catalogs, not one

Two independent peers found the same problem. There are **two closed component vocabularies**:

| Catalog | Location | Members | Shape |
|---|---|---|---|
| `COMPONENTS` | `src/server/http/site/render.ts:1362` | 12 theme components | flat, props-only, **no children** |
| Widget IR | `src/widgets/types.ts:223` | 5 | **recursive children** |

`render.ts:1380` states they are *"deliberately a separate switch, not folded into `COMPONENTS`."*
No shared dispatch, diverging in one file.

**Therefore "extend the widget seam" is currently ambiguous between two different seams.** Resolve
the split — or explicitly ratify it as intentional — before opening either to plugins.

Concrete gap that already exists, before any plugin: **neither catalog can express "testimonial."**

**Also agreed:** the widget seam is a sufficient *foundation* but is not yet a plugin API.
`WidgetTypeKey`, `WIDGET_TYPE_REGISTRATIONS`, `CORE_RESOLVERS`, `WIDGET_IR_RENDERERS` are all
core-closed. Generalize that registration path with provenance, tier checks, schemas, and clamps.
Do not invent a `RenderIR v2` or a third renderer registry.

---

## RESULT 3 — One manifest, two typed fields: `kind` + `capabilities`. Converged.

Both Geminis conceded this as "vocabulary." **The two strongest peers independently landed on the
same concrete shape,** and sol supplied the reason it is *not* merely vocabulary:

- A **kind** says *what is being attached* — and determines its payload schema, placement,
  lifecycle, failure policy, and adapter.
- A **capability** says *what authority the resulting handler receives.*

They are **many-to-many**: `render.component` may need zero authority or `content.read`;
`content.read` may also be used by a job handler or a flow step. So a capability record cannot
sensibly own one placement schema or one resolver pointer.

```ts
contributions: [ { kind: "render.component", registration: { /* WidgetTypeRegistration-shaped */ } } ],
capabilities: [ "content.read" ]
```

Sonnet's supporting find: site-glue's `callSite` **already functions as a `kind`** and is already a
field separate from `capabilities`. So this isn't a foreign taxonomy — it is half-present already,
informally named, and absent from `plugin-runtime`. Generalize `callSite` → `kind`.

Maintain two generated, closed catalogs (one of kinds, one of capabilities).

---

## Settled in round 1, not re-argued

- **Machine-readable contract:** generate it from the live closed constants in code; expose via
  `tovu introspect`. Never hand-write. (Precedent: `introspectProgram()` walks the real command
  tree, so it cannot drift; the hand-kept `api.spec.md` already drifted once.)
- **Lifecycle:** consent screen for Tier-3; real cryptographic signing replacing today's string
  comparison; never delete plugin data on uninstall; permanently tombstone the plugin id.
  **Install/update/uninstall routes must land before any marketplace opens** — today there is no
  route to revoke a bad install at all.
- **Admin UI:** Tier-1 declarative; executable plugin UI in an iframe, not a React error boundary
  (a boundary catches a render throw, not an infinite loop, a memory leak, or a version mismatch).
- **Sequencing:** `admin.nav` + i18n first (Tier-1, pure data, cheapest). Defer cron,
  automation/flow steps, dashboard panels, collection layouts.

## Owner decisions recorded during the debate

- Tier-3 **is** marketplace-listable (reverses ADR-024 §2). Install-consent becomes the primary
  user protection.
- **A2UI is a nice-to-have.** Nothing in the extension architecture may depend on it.
- **Web components: parked**, leaning no. Revisit alongside the iframe story.
- Plugin folder layout: `tovu.plugin.json` + `css/ script/ assets/ hooks/ admin/ server/`.
- Embed attribute stays `data-embed-config`; plugin embeds use `{"type":"plugin","plugin":"<id>"}`.
- Cron is **not** a plugin capability. It is infrastructure, and it is deferred.

---

## Recommended order (when this work starts)

0. **Amend ADR-057** — record that its conclusion is superseded and its trust axis retained.
1. **Resolve the two-catalog split** (`COMPONENTS` vs widget IR). Blocks any honest "extend the
   widget seam" statement.
2. **Unify the capability vocabulary** — one shared type below both features; stop duplicating the
   three strings by value.
3. **Publish payload JSON Schemas** for every call site *before* wiring its adapter. Today
   `GlueManifestAttachment` is `{callSite, [key]: unknown}` — an AI cannot know what to put in an
   `admin.nav` attachment. This is a sharper AI-legibility gap than the WordPress `do_action`
   framing.
4. **`admin.nav` + i18n** — Tier-1, pure data, cheapest, highest leverage.
5. **`render.component`** via the generalized widget registration path.
6. **Install / update / uninstall routes** — blocking before any marketplace.
7. Deferred indefinitely: cron, automation steps, dashboard panels, collection layouts, React SSR
   tier, raw HTML returns, same-origin React plugin imports, arbitrary WordPress-style hook strings.

---

## Unresolved / needs verification before committing

- Whether Tier-2's `worker_threads` boundary can actually deny filesystem, env, and network access
  in Tovu's target Node/container environment. **The current Worker proves resource containment,
  not that security property.** (sol; primary agrees this is the largest unverified assumption in
  the whole debate.)
- Worker spawn cost with N contributed components per page — `liquid-sandbox.ts` documents one
  spawn/teardown per call, **no pooling**. (Sonnet self-flagged.)
- The concrete cookie-less iframe origin available under Docker, Electron, and reverse proxy.
- Whether static publishing/export invokes plugin render contributions before artifacts are gone.
- Root-key rotation, registry-compromise recovery, and rollback-attack policy for marketplace
  metadata.
- **A third plugin-shaped system exists** — `src/features/agent-plugins/` — treated as out of scope
  by inference, never confirmed. Worth an explicit ruling.

## Primary's own errors, recorded

The round-1 packet contained four material errors, all from inferring from surrounding code
instead of opening the governing document: (1) claimed site-glue's three call sites were "wired";
(2) omitted ADR-057 entirely; (3) presented `render.contribute` as having no existing seam when
`widgets/registry.ts:11` already scopes it; (4) called cron greenfield when
`__specs__/80-platform/tenancy-and-jobs.spec.md` already specifies the job envelope. Corrections
1, 3 and 4 changed peers' answers. The owner caught (4) from memory.
