# Jini package-boundary adversarial audit

- **Auditor:** Software Architect agent (`jini-boundaries`), adversarial framing — mandate was to falsify "the boundaries are sound," not confirm it.
- **Date:** 2026-08-16
- **Subject:** `/Users/la/Programming/Jini` at `c39311e5` (2026-08-16 18:55 -0700)
- **Consumer checked:** `/Users/la/Programming/Tovu` at `0261491e` (this repo, `general-work` branch)
- **Scope:** read-only on Jini source. No refactor performed. This document is the only write.

---

## Headline

**Mostly sound, with one real and current exception that matters more than any structural defect I could find.**

The 26-package import DAG itself is clean: zero cross-package cycles, zero layering violations, foundational packages behave like foundations. That part of "do the boundaries hold up" is a genuine yes.

But Jini already has a real, well-built architecture gate (`pnpm guard`) — self-tested against known-bad fixtures, six enforced rules — and it is **not wired into anything**. Run today, it fails with **25 violations** that have been accumulating silently since at least 2026-08-03. A repo with an unwired gate is more dangerous than a repo with no gate, because it looks governed and isn't. That is the finding that would most change a "sound" verdict into an "unsound" one if left uncorrected.

**What would change this verdict to a harder no:** if the 25 current violations turn out to be the tip of something — e.g. if the neutrality leaks (`"Tovu"` strings in engine code) are load-bearing rather than cosmetic, so removing them breaks Tovu at runtime. I did not find evidence of that (see Finding 2), but I also didn't exhaustively trace every string's call site.

---

## Correction to the dispatch brief

The brief stated as a "verified starting fact": *"Jini has no architecture gate of any kind. Its only check script is `typecheck`."* **This is false, and it is the single most important thing this audit found.** `package.json`'s `scripts.guard` (`tsx ./scripts/guard.ts`) runs six real, self-tested checks — see Finding 1. I verified this myself per the brief's own instruction to confirm rather than trust the stated fact.

---

## Measured: the cross-package import graph

**Method:** `dependency-cruiser` (`npx --yes dependency-cruiser`, v18.2.0) OOM'd at ~4.1GB heap when pointed at `packages/` with no config — it has no default excludes for `node_modules`/the pnpm store on a monorepo this size, and building a tuned config was out of scope for this pass. That is a real gap: **I could not get third-party tooling to produce the cross-package graph directly.** Instead I extracted it by hand: every `.ts`/`.tsx` file under each package's `src/`, filtered to lines that are actual `import`/`export …from`/`require(`/dynamic `import(` statements (not comments, not `.md` files — an early pass without this filter produced false-positive edges to `@jini-ai/chat-core`, `@jini-ai/chat-react`, `@jini-ai/renderers-react` that turned out to be doc-comment prose and README code samples, not real imports). This is slower than a tool but auditable — every edge below is a real, grep-verified line I read.

**26 workspace packages** (`pnpm-workspace.yaml`: `packages/*` + `examples/*`).

### Cross-package edges (A → B means A imports B)

```
agent-runtime  → platform, protocol
agentic        → protocol
artifacts      → core
capability-providers → core, platform
chat           → agentic, ui
cli            → core, sidecar
cms            → core
daemon         → agent-runtime, core, platform, protocol
desktop-host   → core
devops         → core, daemon, platform
http-kit       → agent-runtime, chat, core, daemon, platform, protocol
integrations   → core, protocol
mcp            → cli, platform
registry       → protocol
server         → agent-runtime, core, daemon, http-kit, sidecar, sqlite
sidecar        → core
ui             → agentic
```

17 edges among 17 packages that have any cross-package fan-out. 9 packages have **zero** fan-out to another `@jini-ai/*` package: `admin`, `core`, `diagnostics`, `infra`, `memory`, `platform`, `plugins`, `protocol`, `vibecoding`, `sqlite`.

### Fan-in (who is imported, by how many distinct internal packages)

| Package | Internal fan-in | Notes |
|---|---:|---|
| `core` | 11 (`artifacts`, `capability-providers`, `cli`, `cms`, `daemon`, `desktop-host`, `devops`, `http-kit`, `integrations`, `server`, `sidecar`) | Also Tovu's single heaviest external dependency (46 static imports). |
| `protocol` | 6 | Enforced zero-fanout by its own guard rule (R3) — see below. |
| `platform` | 6 | |
| `agentic` | 2 (`chat`, `ui`) | |
| `agent-runtime` | 3 | |
| `daemon` | 3 | |
| `sidecar` | 2 | |
| `chat`, `ui`, `cli`, `http-kit`, `sqlite` | 1 each | |
| `artifacts`, `capability-providers`, `diagnostics`, `registry`, `vibecoding` | **0** | See Finding 3. |

**This is the opposite shape of Tovu's known defect (53 back-edges into the composition root).** `core`/`protocol`/`platform` are exactly what a foundation should be: heavily depended-upon, zero outgoing `@jini-ai/*` edges. No low-level package imports a high-level one. **Zero layering violations found.**

### Cycles

**Method:** `madge --circular --extensions ts,tsx` (v8.0.0, via npx) run against **every one of the 26 packages' `src/` directories individually** — exhaustive, not sampled. Madge only sees within-directory resolution per invocation; it does not by itself prove there's no *cross*-package cycle (for that I rely on the hand-verified DAG above, which is acyclic by inspection — no reciprocal A→B/B→A pair exists in the 17-edge list, and it topologically sorts cleanly: `{core, protocol, platform, sqlite, admin, memory, diagnostics, infra, plugins, vibecoding}` → `{agentic, artifacts, sidecar, desktop-host, cms, capability-providers, registry, agent-runtime}` → `{ui, chat, cli, daemon, integrations}` → `{devops, http-kit, mcp}` → `{server}`).

Three file-level cycles found, **all confined inside a single package** — none cross a package boundary:

1. `packages/cms/src/taxonomy/write-service.ts ↔ taxonomy/list.ts`
2. `packages/ui/src/renderers/annotation-canvas/react/hooks/useAnnotationCanvas.ts ↔ useAnnotationCanvas.controller.ts`
3. `packages/integrations/src/composio/composio.ts ↔ composio/service.ts`

None of these are the finding that matters — a 2-file cycle inside one package's implementation detail is cheap to break and doesn't threaten a consumer. Flagging them because the brief asked for cycles, not because they're urgent.

---

## Ranked findings

### Finding 1 — `pnpm guard` is real, currently red, and wired into nothing [HIGH]

`scripts/guard.ts` runs `checkEngineBoundaries` (R1/R2/R5/R6/R8: forbidden-directory imports, deep-path bans, product-neutrality strings, gated internal-value imports, package metadata), `checkProtocolPurity` (R3: `protocol` must import zero `@jini-ai/*`), `checkAgenticDomPurity` (R9: DOM/universal tsconfig split), `checkChatPanePublicSurface` (R10), `checkExtensionlessImports` (R11), `checkDriverIsolation` (R12: optional-peer neutrality for `infra`'s `db/core` vs `db/sqlite`). It runs a self-test against known-bad fixtures first and **refuses to report "ok" if a check can no longer detect its own known-bad case** — this is a genuinely well-built gate, built specifically because an earlier version of it silently no-op'd for weeks (documented in its own header, referencing a 2026-07-19 swarm-consensus finding).

I ran it. Current output: **25 violations**, three classes:

- **R5-neutrality (13 files):** the literal string `"Tovu"` (comments included) inside supposedly product-neutral engine packages — `packages/admin`, `packages/cms/src/settings/dictionaries`, `packages/devops/src/deploy/redirect-guard.ts`, `packages/http-kit/src/__tests__/*`, and seven files under `packages/ui/src/features/{html-editor,i18n,mcp-ui,settings,source-config-list,tabbed-dialog}`.
- **R2-deep-path (8 lines across 6 files):** `@jini-ai/chat/core` used instead of the bare `@jini-ai/chat` specifier in `chat-pane/agent-tools.ts`, `create-daemon-attachment-uploader.ts`, `hooks/useChatPane.hooks.ts` (×2), `chat-pane/types.ts` (×2), and a test file; `@jini-ai/ui/html-editor` used the same way in `admin/.../InteractiveHtmlEditor.tsx`.
- **R9-dom-purity (2 files):** `packages/agentic/tsconfig.json`'s `exclude` and `tsconfig.dom.json`'s `include` no longer agree on the DOM/DOM-free split boundary — the DOM-free compile target may now be able to pull in DOM-bearing code.

None of this is theoretical severity — every rule violated is checking for something Jini already got burned by once (the module header for R6 cites a real tool-handler-authz-bypass the boundary check exists to prevent; R11 was added after a real `ERR_MODULE_NOT_FOUND` in production module resolution). **The mechanism to catch this class of regression exists and works — it just isn't running.**

**Why it's been quiet for 10+ days:** `git log` on the currently-violating files spans 2026-08-03 (`chat` consolidation, the source of the R2 deep-path hits) through 2026-08-13 (`ui` TabbedDialog extraction, source of several R5 hits) — at least three unrelated feature sessions, none of which ran `pnpm guard` before committing. There is no git hook (`.husky`/`.git/hooks` has nothing but the unused `pre-rebase.sample`) and **no CI workflow runs it** — `.github/workflows/` contains exactly one file, `publish.yml`, and it's a Changesets release pipeline (`pnpm install` → `pnpm -r run build` → publish-if-changesets-pending). It does not run `guard`, `typecheck`, or `test`. Nothing gates a PR or a push to `main` on any check at all.

**Consequence, concretely:** two of the eight R2 deep-path hits (`chat/core`, `ui/html-editor`) resolve fine at runtime — both are legitimately declared `exports` subpaths in the respective `package.json`s, so this is a policy/consistency violation, not a break. The R5 neutrality strings are the one I'd worry about if Jini is ever meant to power a second product the way its own architecture docs claim: right now nobody can tell, by running anything, whether that promise still holds.

### Finding 2 — the `renderers-react`-into-`ui` fold left a stale, duplicated shape in `chat` [MEDIUM]

`packages/ui/src/renderers/` is the real implementation of what your memory calls the "renderers-react → ui fold": a complete `RendererRegistry`, `ArtifactFile`, `ArtifactRenderer`, `createDefaultRendererRegistry`, etc. (`packages/ui/src/renderers/index.ts`).

`packages/chat/src/react/artifact-types.ts` still defines its own **local, hand-duplicated** `ArtifactFile`/`ArtifactRenderer` interfaces, with a module doc that says `@jini-ai/renderers-react` "is still a placeholder stub being built in a separate session" and a `TODO(renderers-react)` telling a future pass to re-point these imports "once that package lands." **That package landed — as a subpath of `ui`, not as its own package — and the TODO was never revisited.** `chat` already imports from `@jini-ai/ui` for six other things (`AgentIcon`, `RemixIcon`, `WorkingDirPicker`, `useFileDropTarget`, the `mcp-ui` subpath), so there's no boundary reason this couldn't be wired today.

The two `ArtifactFile` shapes have already drifted: `ui`'s version marks `content`/`url`/`manifest` explicitly `| undefined` (an `exactOptionalPropertyTypes`-style signature); `chat`'s does not. Not a bug today — I checked, and **Tovu does not currently import `ArtifactFile`/`ArtifactRenderer`/`RendererRegistry` from either package**, so nothing downstream is exposed to the mismatch yet. But Tovu depends on both `@jini-ai/chat` and `@jini-ai/ui`, so the moment anyone wires chat's artifact streaming into a renderer, they'll be choosing between two non-identical definitions of the same concept, with a comment actively pointing at the wrong one.

### Finding 3 — five packages have zero consumers anywhere I could find [MEDIUM]

`artifacts`, `capability-providers`, `diagnostics`, `registry`, `vibecoding` — each real, substantial code (1.3k–4.1k LOC, own `README.md`/`CHANGELOG.md`, versioned `0.1.x`) — have:
- zero internal fan-in (no other Jini package imports them; confirmed above),
- zero appearance in `examples/*/package.json` (Jini's own reference apps),
- zero appearance in Tovu's `package.json` or Tovu's real import statements,
- zero appearance in Tovu-Runner's `package.json`.

Every apparent cross-reference to these package names elsewhere in the repo, on inspection, was comment prose (e.g. `protocol/src/registry.ts:161: * @jini-ai/registry's trust.ts for the verifier` — a citation, not an import). This is not "grep found nothing" — I read the actual lines.

This isn't automatically a defect — it matches an existing, already-documented pattern in this codebase (`[[project_tovu_agent_plugin_consumption]]`: "the source browser works; `installAgentPlugin` has zero callers on both ends... a feature, not wiring"). `capability-providers` in particular reads like a real architectural piece waiting for a caller (`http-kit/src/connectors.ts`'s own comment: "concrete adapters such as `@jini-ai/capability-providers` satisfy them structurally"). The risk isn't that this code is wasted — it's that **`typecheck` passing on an unconsumed package proves nothing about whether its API is still what a real consumer would need.** `registry`'s `trust.ts` verifier, for instance, has never been exercised by an actual caller; its correctness is asserted, not demonstrated.

### Finding 4 — three file-level cycles, all package-internal [LOW]

Listed under Measured above. Cheap to fix, not urgent, not a boundary problem (nothing crosses a package line).

---

## Deliberate decisions — reverified, not re-reported as defects

Per the brief, I checked these rather than assuming them:

- **`@jini-ai/infra` / `@jini-ai/plugins` have no root export.** Confirmed — `infra`'s only cross-package fan-out edge is Tovu's single `infra/db` import; the package genuinely has zero `.` export. `plugins` is a 3-file package with zero `@jini-ai/*` fan-out or fan-in, consistent with the "data, not modules" design.
- **`checkDriverIsolation` (R12)** is live and enforced — this is the exact mechanism `[[reference_drizzle_type_identity_across_packages]]` and the `infra` decision record describe. It ran clean (0 violations of its own rule) in this pass.
- **`renderers-react` folded into `ui`.** Confirmed the fold itself is real and complete on the `ui` side (Finding 2 is about `chat` not catching up, not about the fold being incomplete).
- **`project-locations` stays out of Tovu admin.** Not directly re-tested (out of scope of the import graph — `desktop-host`, which is the closest package to this concern, is consumed by `examples/reference-desktop` and by Tovu-Runner's `package.json`, never by Tovu).
- **CJS-vs-ESM drizzle type-identity wall.** Did not hit this — I didn't touch `infra`'s drizzle-facing surface in this pass. Not re-derived, not contradicted.

---

## Recommendation on gating

**Wire the existing `pnpm guard` into CI. Do not build a new check.** Concretely: add a `ci.yml` workflow (there is currently none besides the dormant `publish.yml`) that runs on every PR and push:

```
pnpm install --frozen-lockfile
pnpm guard
pnpm typecheck
```

This is the single highest-leverage change available. The reasoning: `guard` is not aspirational — it's already built, already self-tested, already proven capable of catching real regressions (its own module history says so), and it is *currently failing*. The gap isn't "Jini needs an architecture gate," it's "Jini built a good one and forgot to plug it in." Fixing that plug is a few lines of YAML; building a new gate from scratch (dependency-cruiser config, cycle detection, fan-in/fan-out ratchets) is real work that duplicates what `guard` already half-covers and leaves the 25-violation regression unaddressed regardless.

Second-order recommendation, only after the above ships green: `guard`'s rules don't currently check for cross-package cycles or fan-in/fan-out drift — that's the part of this audit `guard` doesn't cover. If Jini wants that too, `madge --circular` per-package (as run here) is cheap enough to add as a seventh check once the 25 existing violations are cleared, so it doesn't get lost in a stampede of unrelated fixes.

---

## What I could not measure

- **Full cross-package graph via automated tooling.** `dependency-cruiser` OOM'd on this monorepo without a tuned config (excludes for `node_modules`/pnpm store, a `tsconfig` for path resolution). The hand-verified edge list above is the substitute — slower to produce, but every edge is a line I personally read, which also caught false positives a naive tool run would likely have reproduced from comments (`chat-core`/`chat-react`/`renderers-react`).
- **Whether the 13 R5 "Tovu" string leaks are load-bearing.** I read enough of each to see the pattern (dictionary defaults, comments, test fixtures) but did not trace every call site to prove removing them wouldn't break something Tovu currently relies on.
- **Fan-in/fan-out for `examples/*`.** Treated as consumers where relevant (`desktop-host`, `memory`, `mcp`) but did not build a full graph including them — the brief's concern is Jini↔Jini and Jini↔Tovu, and examples are neither.
- **Whether `guard`'s R7-removed tiered-admission gate (`UNLOCKED.md`) should be reinstated.** Out of scope — it was removed at the owner's explicit direction per its own module doc; not re-litigated here.

---

## Reproduction

```bash
cd /Users/la/Programming/Jini
pnpm guard                                   # 25 violations, reproduces Finding 1
for pkg in $(ls packages); do
  npx --yes madge --circular --extensions ts,tsx "packages/$pkg/src"
done                                          # reproduces the 3 file-level cycles
```

Jini `c39311e5`, Tovu `0261491e`.
