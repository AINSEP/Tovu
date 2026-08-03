# ADR-052: Tovu-Runner Is Its Own Desktop Product on `@jini-ai/desktop-host`

- Status: ACCEPTED
- Date: 2026-08-03
- Author: Claude Opus 5 / Leon Aburime

## Context

ADR-011 (2026-07-01) decided the multi-site desktop host would be **open-design's
own existing Electron app, reused directly** — "open-design is that product… Tovu
does not build its own Electron manager" — and on that basis explicitly
**cancelled the deferred `desktop/` package**.

Five days later ADR-014 described **"Tovu-Runner"** as its own separate repo and
product, with its own operator UI, its own api-key-driven headless auth into Tovu,
and its own operator tool registry layered above Tovu's site tools. SPEC-006 went
further and shipped `api_keys` in v1 *because Tovu-Runner needs headless auth*,
naming Runner as the consumer in its user journey. Meanwhile Jini extracted
`@jini-ai/desktop-host` from open-design's source specifically to be shell-agnostic
and de-branded — built, per its own `source-map.md`, "ahead of `extraction-plan.md`
§3's stated deferral… per an explicit human decision, not because a second host
consumer is confirmed yet."

Nothing reconciled these. A 2026-08-03 recon
(`reports/recon/2026-08-03-tovu-runner-recon.md`) surfaced the tension rather than
guessing at it, and additionally verified that open-design's current source has
**no Tovu-spawning code at all** — one grep hit, in a doc, not runtime code. So
ADR-011's plan was an accepted decision that was never implemented anywhere.

## Decision

**Tovu-Runner is its own desktop product, assembled on `@jini-ai/desktop-host/electron`.
open-design is untouched.**

This **supersedes ADR-011 §2** (the desktop-hosted topology's "open-design's Electron
app is the host" clause) and **reverses its first Consequence** — the `desktop/`
package is no longer cancelled; it is Tovu-Runner, living in its own repo. ADR-011 §1
(standalone single-binary, the WordPress mode) is **unaffected and still primary**.
ADR-011's load-bearing discipline also survives intact and is restated here: the
dependency arrow points one way, integration happens at an **HTTP API boundary**, and
neither side imports the other's source. What changes is *which* app is on the far side
of that boundary.

**Shell: Electron, not Tauri.** Not a preference — an assembly-completeness fact.
`desktop-host`'s Electron assembly implements all 6 ports across 8 files, each with a
matching test file. The Tauri assembly is an explicitly partial spike: `NotImplementedError`
appears in 5 of its files (`RenderService`, `ProtocolHandlerPort`, shell paths) against
1 hit anywhere under `electron/`. Tauri has no JS-reachable equivalent of Electron's
`webContents.printToPDF` or custom-scheme registration; closing that needs Rust work
nobody has funded. Revisit only if someone does.

**This is an assembly job plus one genuinely new component.** The recon's coordinator
verification pass checked the "70-80% already exists" claim directly and found it
*understated*: `allocatePort({host, label, port, reserved})` already takes a
`reserved: Set<number>`, so allocating N mutually non-colliding ports is a supported
call shape, not a modification; `resolveDaemonRegistryPath(dataDir, fileName)` is
parameterized by both arguments, so N instances is N calls with distinct `dataDir`s,
with crash-safe liveness detection already built in. The per-instance mechanics are
not "generalizable" — they are already parameterized for N.

What does **not** exist is the layer above them: the **fleet supervisor** that owns the
project list, allocates ports as a coordinated set, starts/stops/health-checks each
child, and surfaces the fleet in a UI. That is Runner's actual reason to exist, and it
is orchestration over tested primitives rather than primitive-building.

### Consequences of the topology, restated

Each Runner "project" is a **separate OS process** — one install dir, one port, one
`tovu serve` child, one workspace served for that process's whole lifetime. This was
verified in source, not inferred: `src/site-dir/resolve-workspace.ts` resolves exactly
one workspace at boot (oldest by `createdAt`, or `--workspace <id>`), bakes it into
`deps` once, and 35+ routes defensively reject `workspaceId` mismatches.
`src/server/app.ts:796` says it outright: `// single-workspace v1`.

`content.db`'s ability to hold >1 workspace row is an **orthogonal** ADR-007 tenancy
feature — it exists so an install that *grew* a second workspace still boots, expressly
not so one process can serve two concurrently. It is not the mechanism for Runner's
multi-project management and must not be mistaken for one.

## Scope decisions taken with this ADR

**`@jini-ai/admin` is NOT adopted.** Runner's operator shell is built directly rather
than on the composable admin surface. Runner's navigation is app-level and spans
projects; `@jini-ai/admin`'s panel registry and route model are shaped for a
single-product admin. Reconsider if Runner's section count makes a registry pay for
itself. `@jini-ai/ui`'s `./chat` subpath and `@jini-ai/agentic`'s `./a2ui` are still in
scope for the chat surface.

**Per-instance owner credentials are NOT provisioned in v1.** Owner decision, recorded
because the alternative was analysed and declined rather than missed.

The recon's verification pass found that `@jini-ai/cms` deliberately requires
`ownerPassword` with no default — `identity/wiring.ts:91-96` says why: "a library
fallback would mean every host that forgot to pass one shipped the same owner
credential." Tovu-the-host then supplies exactly such a fallback,
`TOVU_ADMIN_PASSWORD ?? "tovu-dev"`, seeded idempotently on the **serve** path via
`seedIdentity`. So absent an override, every site Runner spawns boots with owner
`admin` / `tovu-dev`.

Owner's call: Runner is a local desktop app driving local dev sites; the exposure a
per-instance credential scheme would buy is not worth the complexity now. **Accepted
as a known, deliberate v1 posture, not an oversight.** The tripwire that should reopen
it: the first time a Runner-spawned instance binds a non-loopback interface, or the
first time Runner publishes a site anywhere reachable. A cheap mitigation exists if
wanted later — make Tovu's `"tovu-dev"` fallback refuse to apply on a non-loopback bind
— and is deliberately not taken now.

This also **corrects** the recon body's claim (its lines 133/146/190/203) that a freshly
`tovu init`'d site has no way to log into `/admin`, called "a real, currently-unimplemented
gap." It is not a gap; the owner is seeded on serve. The search that missed it looked for
`firstBoot`/`seedOwner`/`createOwner`; the symbol is `seedIdentity` and it lives in identity
wiring, not the init path. Method lesson worth keeping: an empty symbol-name search is
evidence about *names*, not about *capability* — trace the composition root before
declaring a gap.

**Repo:** rebuilt on an orphan branch (`rebuild/v1`) of the existing `Tovu-Runner`
repo, keeping name and remote continuity. The recon established that repo is Tovu's own
literal pre-split ancestor, frozen mid-rename, with 389 never-committed working-tree
changes from an abandoned 2026-07-06 attempt. None of its code is reusable. `main`
stays intact at `fdaf214`; the abandoned working tree was moved out of the repo
(1.9GB → 2.7MB once five stale `node_modules` trees, a 621MB turbopack cache, and a
graph DB were dropped — ~850KB of it was real source).

## Information architecture — the rail

`admin-sitemap.md` §2 defines three nav surfaces and explicitly carves one out:
**(A) App rail** — "App-level, *spans projects*. Not part of a single site's admin…
**Out of scope for this sitemap except that the project admin mounts inside it.**"

That carve-out is Runner. Tovu admin's surface (B) section sidebar mounts *inside*
Runner when a project is opened; the two nest rather than compete.

Layout: collapsible icon rail → chat panel → main content. The chat is an operator
agent that creates and starts Tovu projects through tools (ADR-014's registry:
`create_site`, `generate_video`, `queue_task`), composed above Tovu's site tools per
ADR-014's one-way rule — Runner composes site tools plus its own; Tovu never imports
Runner tools.

Twelve sections, grouped — the sitemap's own rail was five items, and twelve
unstructured would stop reading as a rail:

| Group | Sections | Source |
|---|---|---|
| Fleet | Home, Projects, Templates/Explore | sitemap §2 rail items; ADR-012 (create = copy a template's data/config into a new install dir) |
| Work | Tasks/Queue, Generation & Media | ADR-014 `queue_task`, `generate_video`; `@jini-ai/media` |
| Operations | Activity, Updates & Migrations, Deploy, Diagnostics | recon Part E (log capture is a named gap — `tovu serve` writes stdout only; fleet-wide migration coordination correctly does not belong in Tovu per ADR-007/012); `@jini-ai/deploy`; `@jini-ai/diagnostics` |
| Access | Keys & Access, Settings, Account | recon Part E (fleet-wide api_key management is Runner's job); SPEC-006 OQ-05 |

## Open, carried forward rather than closed here

- **SPEC-006 OQ-05** — cross-site identity federation (owner: Leon Aburime, resolve-by
  2026-11-30). Nothing today lets Runner make one call fanning out across N sites; each
  project's admin API is independently addressed and independently authenticated. Already
  named, dated, and owned by the project — treat as a known blocker, not a fresh finding.
- **Shared vs. per-instance LLM/BYOK secrets** across a Runner-hosted fleet. ADR-011
  described the *mechanism* (daemon-backed vs. direct provider adapter) but never whether
  secrets pool or isolate. No evidence either way. Surfaces in the Settings section.
- ~~Whether Runner's own backend is Jini-native (`@jini-ai/daemon` + `http-kit`) or
  hand-rolled.~~ **Resolved 2026-08-03, later the same day: Jini-native.**
  `@jini-ai/daemon` supplies run lifecycle, the `ToolExecutor` boundary, and the agent
  executor; `@jini-ai/http-kit` the routes; `@jini-ai/sqlite` Runner's own store. The
  supervisor registers as a pack on that daemon rather than living beside it.

  Decided on the ADR-049 precedent: Tovu already adopted this exact kit as its assistant
  substrate and re-expressed ADR-014's Profile model as the `ToolPolicy` fed into
  `ToolExecutor`. Runner's `runner.*` verbs therefore inherit the same deny-by-default
  gate rather than re-deriving one, which matters because those verbs start and stop OS
  processes — a strictly more dangerous surface than the content tools the gate was built
  for. `RoutineService`'s DST-safe scheduler also covers periodic fleet-wide health checks,
  which the recon listed as needed and unbuilt.

  A hybrid (daemon for chat, ordinary code for the supervisor) was considered and rejected:
  the supervisor is the component most in need of an audited execution boundary, so putting
  it outside the one the rest of the app uses inverts the intent.

## Relates

Supersedes ADR-011 §2 and its `desktop/`-cancellation consequence; ADR-011 §1 unaffected.
Relates ADR-007 (workspace tenancy), ADR-012 (site template + instantiation), ADR-014
(assistant profiles / operator tool layering), ADR-021 + SPEC-006 (identity, api_keys,
OQ-05), ADR-049 (Jini kit as the tool-execution substrate), SPEC-003 (install dir).
Source recon: `reports/recon/2026-08-03-tovu-runner-recon.md`, including its coordinator
verification pass.
