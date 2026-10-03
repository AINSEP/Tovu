# Behavior Rules Spec: desktop-app-chat

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-051 |
| feature_name | FEAT-051-desktop-app-chat |
| version | 0.1.2 |
| last_edited | 2026-09-16T00:00:00Z |

## Purpose

`feature.spec.md`'s Behavior Summary table is a precedence rule set: six contexts, six tool sets. REQ-05/INV-04 is an ordering rule. REQ-11 and REQ-19 define pause and degrade sequencing. This file states each as a rule with an id, so `traceability.spec.md` §5 has something to point at and a TDD agent can assert them one at a time.

Rules use EARS phrasing where it helps and plain prose where EARS would obscure.

---

## 1. Precedence Rules

### 1.1 BR-01 — Turn-start tool-set precedence

Evaluated top to bottom; the first matching row wins. This is the whole of `feature.spec.md`'s Behavior Summary, ordered.

| # | Condition at turn start | Resulting tool set | REQ |
|---|---|---|---|
| 1 | The addressee is an open site's tab, **and** its tool surface answered the probe | always-on `desktop.*` **plus** that site's allowlisted tools | REQ-02, REQ-03, REQ-06, REQ-07 |
| 2 | The addressee is an open site's tab, **and** its tool surface did not answer | always-on `desktop.*` only, plus a visible transcript note | REQ-19 |
| 3 | The addressee is the All tab, Marketplace, Settings, or there are zero sites | always-on `desktop.*` only | REQ-04 |

Row 2 outranks row 1 by evaluation order, which is the point of writing them in one table: "a site tab is active" and "that site is reachable" are two separate conditions, and the second is the one that decides.

**The always-on `desktop.*` set** is `desktop.navigate` plus the section tools admitted by BR-08, minus `desktop.settings.get`, `desktop.settings.set`, and every Marketplace tool (REQ-02, REQ-20).

### 1.2 BR-08 — Which section tools are in the always-on set — `[OQ-01 OPEN]`

`apps/desktop/src/contracts/sections.ts` declares 29 `desktop.*` verbs: `desktop.navigate`, 14 in nav-visible sections, and 14 in `hidden: true` sections (templates 2, tasks 3, deploy 2, diagnostics 1, api-keys 3, settings 2, account 1). **None of the 29 has a handler anywhere in the repo today**, so both candidate rules ship identical code right now; the rule is what differs later.

| Candidate rule | Always-on count | Derivation |
|---|---|---|
| Nav-visibility gates it | 15 | `visibleSections()` — already exists in `sections.ts` |
| Handler existence gates it, exclusions explicit | 27 | `runnerToolNames()` minus the two settings verbs — also already exists |
| Explicit per-section `agentAlwaysOn`, default off for hidden (recommended) | 15, growing one section at a time | one new optional field on `RunnerSection` |

Owner: Leona Burime. Resolve by: 2026-09-19. Full option analysis, including what each costs on security, prompt size and future flexibility: `ADS-memory/.local-artifacts/agent-reports/2026-09-16-w4-spec051-designs.md` §2 OQ-01.

**Unresolved conflict feeding this rule.** `ADS-memory/.local-artifacts/owner-worklist.md:105` records an owner decision "Marketplace install + settings in v1". `settings` is a `hidden: true` section, so if that decision is current it partially pre-answers this rule and contradicts REQ-02, REQ-20, AC-02 and AC-28 as written.

### 1.3 BR-05 — Panel visibility precedence

The operator's explicit open/close action is the **only** input to `open`. Navigation state, `expanded` mode, zero-sites, and the docked/overlay threshold have no write access to it (REQ-21, INV-09, AC-29, EC-07). `Escape` dismissing an overlay counts as an operator action, not an exception.

---

## 2. Ordering Rules

### 2.1 BR-02 — Turn-start freeze ordering

When a turn starts, in this order:

1. Read the addressee once (which tab is active, and its `siteDir` if it is a site).
2. If it is a site, probe that site's tool surface.
3. Assemble the tool set per BR-01.
4. Freeze it.
5. Only then build the tool schemas handed to the model.

Nothing after step 4 may re-read the addressee. A tab switch mid-turn affects the **next** turn only (REQ-05, INV-04, AC-05, EC-02). A `page.*` call late in a turn targets the `<webview>` captured at step 1, never "whichever tab is focused right now" (EC-08).

### 2.2 BR-03 — Degradation ordering

The reachability probe happens at **turn start** (step 2), not lazily at first tool call. Probing late means the model has already been offered tools that cannot run, and the first call fails mid-turn instead of the turn beginning honestly (REQ-19, AC-26, AC-27).

If a site's surface becomes unreachable *after* a successful probe, the individual call fails with its own error (`errors.spec.md` §2) and the turn continues. The turn is not retroactively downgraded.

### 2.3 BR-04 — Confirmation is per-call, not per-turn

A confirmable call pauses **only itself**. Sibling calls in the same turn proceed and may complete while it waits (REQ-11, AC-17). Two confirmable calls pause independently and render two affordances; resolving one does not resolve the other (EC-10).

### 2.4 BR-09 — IPC registration ordering (REQ-10)

Real `workspace:chat:*` handlers must be registered **and** the five channel names removed from `RUNNER_STUB_CHANNELS` in the same commit. `ipcMain.handle` throws on a duplicate registration, so "register the real one first, clean up the stub later" is not a viable intermediate state — it is a boot crash. `apps/desktop/main.ts:1382-1393` already relies on this ordering property for `project-ipc.ts`'s real handlers, and `runner-ipc-stubs.ts`'s own doc states the rule.

---

## 3. Default Values

| Field | Default | Why |
|---|---|---|
| Panel `open` | `false` (closed) | The panel squeezes or covers content; opening is the operator's decision, and REQ-21 makes it the only one. A default-open panel would also change `.main`'s width at every app start |
| Panel `layout` | derived from the measured width at mount, not a fixed value | A fixed default would render one wrong frame at whichever width is not the default |
| Turn addressee | `{ kind: 'none' }` | Matches REQ-04's set. Failing toward fewer tools is the safe direction |
| Site-tool inclusion | excluded | A site's tools are included only on a positive probe (BR-03). Silence means excluded |
| `window.tovuDesktopEmbedded` | `undefined` | The signal is set by the shell's guest preload only. Absent everywhere else, which is exactly what makes AC-19 hold with no second code path |
| Confirmation outcome on deadline | cancelled, not confirmed | The only safe direction. `errors.spec.md`'s `CONFIRMATION_EXPIRED` |

---

## 4. Limits and Bounds

| Bound | Value | Enforced Where | Notes |
|---|---|---|---|
| Docked/overlay threshold | 900px | The layout hook (REQ-15) | **Never measured.** `apps/desktop/main.ts:499-502` sets `minWidth: 480` and says in its own comment that "Layout between 480 and 960 has not been measured." There is no `900` in `app.css` or `App.tsx` today — the number exists only in this spec. Needs one `_electron` pass at 480 / 700 / 899 / 901 / 1360 |
| Window minimum width | 480px | `apps/desktop/main.ts:502` | Existing, owner-chosen 2026-09-12. At this width an open overlay panel covers the entire window. Whether that is acceptable, or whether opening the panel should raise the floor, has never been asked |
| Concurrent app-level agent processes | exactly 1 | Daemon construction | INV-01 |
| Agent loops inside a site's process | exactly 0 | REQ-06's route, which executes a tool and never starts a run | INV-02 |
| Confirmation deadline | bounded, value TBD by the ADR | The confirmation mechanism | Must exist. An unbounded park is the failure mode `pending-confirmations.ts` documents |
| Site tool allowlist size | `[OQ-02 OPEN]` | The allowlist module | A site's full catalog is **131 tools across 21 domains** (`apps/website/src/assistant/byok-tool-surface.ts`). Offering all of them alongside 15–27 desktop tools is not viable as a prompt, independent of any security argument. Recommended first slice: reads plus reversible Posts/Pages writes, ~12–15 tools. Owner: Leona Burime / Software Architect. Due 2026-09-19 |

---

## 5. Deduplication Rules

Not applicable in the usual sense — this feature creates no records that could duplicate. Two adjacent cases that look like deduplication and are not:

- **Two identical confirmable calls in one turn** (EC-10) are two distinct calls and must *not* be deduplicated. Each gets its own affordance. Collapsing them would silently confirm an action the operator agreed to only once.
- **A repeated `reattach` on the same run** is idempotent by nature: the second call returns the same subscription rather than creating a parallel one. That is idempotency, not deduplication — see §5.3 below.

### 5.3 Idempotency vs. Deduplication

`workspace:chat:reattach`, `detach` and `status` are idempotent: calling them twice leaves the same state as calling them once. `start` and `stop` are not — `start` creates a run, `stop` ends one — and neither is deduplicated; a second `start` while a run is live is an error state the daemon must name, not silently merge.

---

## 6. Tie-Break Logic

One tie-break scenario exists.

### 6.1 Two open site tabs, neither obviously "the" addressee

`feature.spec.md` defines the addressee as the **active tab** at turn start, which is always exactly one thing — so there is no tie in practice. The case that looks like one, and is not: a `page.*` call arriving after the operator has switched tabs. BR-02 resolves it deterministically in favour of the tab captured at turn start (EC-08). No heuristic, no "most recently used", no focus check.

---

## 7. Edge Case Handling

| Boundary | Behavior | EC |
|---|---|---|
| Zero sites ever created | BR-01 row 3; `desktop.*` only | EC-01 |
| Tab switch mid-turn | BR-02; in-flight turn unaffected | EC-02 |
| Marketplace tab active | BR-01 row 3; Marketplace declares `tools: []` today, so nothing Marketplace-specific exists to offer either way | EC-03 |
| Site daemon crashed or still booting | BR-01 row 2 + BR-03 | EC-04 |
| Site assistant switched off (`TOVU_ADMIN_ASSISTANT=off`) | BR-01 row 2, with `reason: 'assistant-disabled'` so the note does not say "temporarily" about a permanent, boot-time state | Proposed EC-11 (`traceability.spec.md` §3) — **not yet in `feature.spec.md`** |
| `desktop.project.delete` called | BR-04; pause, one affordance, cancel ends only that call | EC-05 |
| Resize across 900px with a turn in flight | Layout switches; conversation and turn both survive | EC-06 |
| `expanded` mode entered with the panel open | BR-05; panel keeps rendering, open state unchanged | EC-07 |
| `page.navigate` against a non-focused tab | BR-02 / §6.1; targets the turn's own site | EC-08 |
| Non-allowlisted tool name | `TOOL_NOT_ALLOWLISTED`, refused by name, turn continues | EC-09 |
| Two confirmable calls in one turn | §5; two affordances, resolved independently | EC-10 |
| Window at exactly 900px | Docked. The threshold is inclusive at the top: `>= 900` is docked, `< 900` is overlay (REQ-13 says "≥900px") | — |
| Window at 480px (the floor) with the panel open | Overlay covering the whole window. **Unmeasured**; see §4 | — |
