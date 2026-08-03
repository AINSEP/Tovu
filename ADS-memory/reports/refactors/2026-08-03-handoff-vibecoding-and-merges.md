# Handoff: `@jini-ai/vibecoding` exists; six of seven cloud branches merged

Generated: 2026-08-03T18:35:00Z
Source: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M), repos `Tovu` + `Jini`
Target: claude (Claude Code)
Supersedes `2026-08-03-handoff-cms-extraction.md` — that handoff's merge job is now complete.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file end to end. Both repos are on branch
> `refactor/jini-admin-extraction`. The main workstream is **`@jini-ai/vibecoding`** — a reusable
> AI-app-building capability in Jini, for Tovu Pages first and Zana second. `/core` is built and
> green; read "The vibecoding workstream" below before touching it, and do not re-derive what the
> seven reports establish.
> **A second session works the same Tovu branch concurrently.** Run `git log` and `git status`
> first; anything uncommitted in `apps/admin/` or the ADR files is theirs, not yours.

---

## State

| repo | branch | HEAD |
|---|---|---|
| Tovu | `refactor/jini-admin-extraction` | `2ec7ddb` |
| Jini | `refactor/jini-admin-extraction` | `e9b9fbd83` |

Nothing is pushed and neither `main` is updated — deliberate, the user wanted local verification
first. Local `main` in both repos is behind the branch.

**Gates as of this handoff:** Tovu typecheck clean; **2950 tests / 2944 pass / 4 known failures**;
`check:architecture` improved on every ratcheted metric (**back-edges into composition root 28 → 24**)
but the **baseline is NOT locked**; `check:inventory` fixed and passing; Jini `packages/cms` 471 tests
green; `packages/vibecoding` 11/11 green; `npm run guard` shows only the one known pre-existing
`packages/ui` violation. **Tovu boots for real** — `init` + `serve` → site 200, admin 200.

**The 4 known failures** — 3 in `src/server/__tests__/identity-crud-routes.test.ts` (password fixtures
below the 12-char minimum), 1 in `src/features/plugins/store/__tests__/store-plugin.test.ts`.
**Two more appear only under machine load and are not regressions:**
`src/cli/__tests__/integration/serve-command.integration.test.ts` (boot timeout — **verified 14/14 in
isolation**) and `src/server/http/site/__tests__/liquid-sandbox.test.ts` (OOM flake). Re-run any
suspected failure in isolation before calling it a regression.

---

# The vibecoding workstream

**Goal:** a reusable AI-app-building capability in Jini — used first for Tovu **Pages**
(AI-generated bespoke HTML, one document), then for **Zana** (a multi-file app builder). Both are
named consumers, so the engine must assume neither shape.

## What exists — `Jini/packages/vibecoding`, commit `e9b9fbd83`

`/core` only. `./node` and `./react` are deliberately **absent rather than stubbed**.

```ts
interface EditTarget {
  listParts(): Promise<readonly PartRef[]>;   // the allowlist
  readPart(id): Promise<string>;
  replacePart(id, content): Promise<void>;    // upsert
  snapshot(): Promise<Snapshot>;
  restore(snapshot): Promise<void>;
  validate(candidate): Promise<ValidationResult>;
}

// exported from @jini-ai/vibecoding/core
applyEdit(target, edit)        // validate, then commit
applyEdits(target, edits)      // sequential; one outcome per proposal
correctionsFor(outcomes)       // the rejections/failures to feed back as the next turn
```

**The premise:** every AI app-builder differs at exactly one place — *what is being edited*. The
conversation, streaming, undo and preview are identical across all of them. So the package owns the
loop and reaches the artifact through one port. Tovu implements "parts are tagged regions of one
document"; Zana implements "parts are files."

## Locked decisions — do not re-litigate

Evidence in `ADS-memory/reports/recon/2026-08-03-vibecoding-*.md`.

1. **`listParts` is an allowlist.** An unlisted part is structurally unaddressable, not merely
   discouraged. That is where scope discipline comes from — bolt.diy enforces identical scope rules
   across three prompt variants of wildly different tone over an identical mechanism, which
   falsifies "shout at the model harder."
2. **`validate` receives the whole prospective artifact.** The one piece with **no upstream to
   copy**: neither reference implementation validates writes at all, because a whole file cannot
   corrupt another file's syntax and a sub-document region can. Whole-artifact rather than
   part-in-isolation, because a fragment well-formed alone can still break the document it lands in
   (a `<td>` outside a table). A rejection's `reason` is written *for the model* and fed back as its
   next turn — that is what closes validation to correction.
3. **`snapshot` restores data, never execution state.** bolt.diy's rewind also replays setup commands
   to restart its dev server; that is the host's job after `restore` returns.
4. **`replacePart` is an upsert.** Both references create-on-write.
5. **No verbs for process/build/install.** A separate execution layer owns those. Absence is a
   decision, not a gap.
6. **The `/core` split is load-bearing, not stylistic.** Verified: a Node HTTP server
   (`Jini/examples/reference-web/src/daemon.ts`) imports `@jini-ai/chat-core` with **no React**.
   When `./react` lands, React must be an **optional peer** (`peerDependenciesMeta`), following
   `packages/ui`'s existing pattern.

Two behaviours deliberately correct the references: a write failure surfaces as `failed` instead of
being logged and forgotten (bolt.diy marks actions complete regardless — `action-runner.ts:311-339`),
and every proposal gets its own outcome so a host can report exactly which parts landed
(the one thing open-lovable does better than bolt.diy).

## Five of seven parts already existed in Jini

This is the finding that reframed the work — it is far less greenfield than it looks.

| part | status |
|---|---|
| Ask — chat, transcript | exists: `chat-core` |
| Describe — tell the model what's there | **half** |
| Stream — read a partial answer | exists: `chat-core/partial-json`, `agentic/gen-ui` |
| **Apply** | **built this session** |
| **Undo** | `snapshot`/`restore` built; **operation-level undo/redo still missing** |
| Show — safe preview | exists: `renderers-react` srcdoc sandbox |
| Fix — error back as a turn | `correctionsFor` built; needs a host loop |
| *Ship* | exists: `deploy` |
| *Run* (Zana only) | exists: `platform`, `agent-runtime` |

## Next steps for vibecoding, in order

1. **Undo/redo tier** — accepted design, not built. An operation-level stack layered **on top of**
   `snapshot`/`restore`, recording a before/after pair per `replace` (needs only `readPart` first, so
   it adds **no verb** to `EditTarget`). Onlook has real undo *and* redo with transaction batching;
   bolt.diy has no redo at all. Also borrow **never-destructive restore** — capture current state
   before restoring, so a rewind can itself be undone.
2. **`./node` adapter** — file-tree target for Zana.
3. **A Tovu Pages adapter** — parts are tagged regions of one HTML document. This is where `validate`
   earns its existence.
4. **`./react`** — chat + preview surface, React as an optional peer.
5. **The vision self-check is BLOCKED** — see the multimodal section below for the exact fix.

## Corrections to previously-locked Pages decisions

From `pages-vibecoding-decisions.md`. Each report carries a **"Coordinator verification pass"**
section recording what was independently checked and what was corrected — **read those sections; in
four of five cases they correct the report body.**

- **D-5 (`data-tovu-id`) → reuse `data-agent-element`.**
  `Jini/packages/agentic/src/element-handles.ts` already implements a hardened, injection-safe
  allowlist with `region` as an existing role. Separately, a product-named attribute **cannot live in
  Jini at all** under guard rule R5.
- **D-4 (separate-origin preview) is largely pre-solved.** `renderers-react`'s `SrcDocSandbox` omits
  `allow-same-origin` deliberately, with a test asserting the omission. The requirement shrinks to
  "do we also need a *navigable* preview URL?"
- **OQ-2 (vision self-check) — premise falsified, implementation blocked.** See below.
- **D-REV-4 (visual editor) gains a third option, not a reversal.** Onlook writes a permanent
  `data-oid` into JSX **source** — no Babel plugin, no fiber introspection. But every JSX write is
  re-parsed, regenerated and Prettier-formatted (`packages/file-system/src/code-fs.ts:46-83`), and
  **even unparseable files still get formatted**. Semantically faithful, **not byte-preserving**.
  Risk class moves from severe (silent data loss) to mild (reformatting churn + a permanent attribute
  on every element). Worth a spike, not an immediate reversal of D-6.

## The vision self-check — proven as a design, blocked as an implementation

**screenshot-to-code has a fully wired loop** (`backend/agent/tools/screenshot_preview.py`): renders
the model's own in-progress HTML in headless Chromium, captures desktop+mobile PNGs, and returns them
as real image bytes inside the tool result, so the next turn sees what it built.

**Jini cannot do this today.** `agent-runtime/src/providers/anthropic-messages.ts:63-86` defines
`text | tool_use | tool_result` with no image variant — and the detail most likely to be missed:
**`AnthropicToolResultBlockParam.content` is a plain `string`, not a parts array.** A self-check
returns its screenshot *inside a tool result*, so adding a top-level image block is **not sufficient**.
OpenAI is the same shape; Azure inherits it by reusing OpenAI's builder; Google's own source names
multimodal parts as deliberately out of scope.

**Attachments are a red herring.** They reach real disk storage via a well-built capability-claim
system, then feed `buildArgs(prompt, imagePaths, …)` — which **16 of 20 CLI agent defs underscore and
never use**, including the flagship `claude.ts:81`. Only the ACP and pi-rpc protocol paths genuinely
forward images.

**Build it on the direct-provider proxy path, not the CLI-agent path** — the proxy's turn-runners
already have the execute-tool-then-continue shape; the CLI path hands control to an external
subprocess where a mid-turn tool-result image cannot be injected. A self-check screenshot needs no
attachment-store involvement: renderer → callback, in memory.

## The four reference implementations — what to take, what to refuse

All cloned under `/Users/la/Programming/OSS-Repos/`. bolt.diy and open-lovable are cbm-indexed;
Onlook and screenshot-to-code were indexed this session (cbm + graphify).

| repo | stars | take | refuse |
|---|---|---|---|
| **bolt.diy** | 19,689 | resumable cursor-keyed streaming parser; snapshot's flat id→content data shape | write path that swallows every failure; snapshot's setup-command replay; Stop button wired to an empty stub |
| **open-lovable** | 28,171 | per-file write errors collected and streamed to the client | pseudo-XML grammar (invented on a stale "models can't tool-call" premise); two competing parsers that can double-write one path; silent rewriting of the model's paths and content |
| **screenshot-to-code** | 73,820 | the vision self-check loop; multi-model variant generation with per-variant failure isolation; named error types and graceful invalid-tool-arg fallback | zero HTML sanitization; a preview iframe with **no** `sandbox`; a variant iframe using `allow-scripts allow-same-origin`; model-generated JS in a shared `--no-sandbox` Chromium |
| **Onlook** | 26,399 | operation-level undo/**redo** with transaction batching; never-destructive restore; `data-oid`-in-source as a third visual-editing option | `getDomIdSelector(domId, escape = false)` — unescaped by default; keep Jini's throw-on-invalid discipline instead |

---

# Everything else remaining

1. **E2E tests — the user's explicit ask, and nothing covers this today.** This session made the case:
   a full unit suite passed green while `tovu serve` crashed on boot, and the only reason anyone knew
   was a manual `init` + `serve` + `curl`. Start there — init a site, boot it, assert site and admin
   both serve, exercise one ported domain end to end.
   `src/cli/__tests__/integration/serve-command.integration.test.ts` is the closest existing thing and
   a good model.
2. **Merge `refactor/admin-react-to-ui`** — the last unmerged cloud branch, in both repos.
3. **Lock the architecture baseline** — `npm run check:architecture --update` once satisfied. No agent
   was permitted to touch it.
4. **Shim removal, now unblocked.** Tovu still has re-export shims: `core/ports` (118 importers),
   `identity` (47), `core/commands/command` (38), `core/tools/registration-kit` (16),
   `core/commands/change-set` (1) — ~220 files of mechanical import rewriting. **Do it now that wave C
   has landed**, not before; wave C normalized the import style, which makes this strictly easier.
5. **Reconcile `ADR-052-tovu-runner-is-its-own-desktop-product.md`** (written by the concurrent
   session) against `2026-08-03-tovu-runner-recon.md`, whose Open Question 1 was exactly the
   unresolved ADR-011-vs-ADR-014 tension. Make sure the two agree.

## Tovu-Runner — recon done, two blockers found

`2026-08-03-tovu-runner-recon.md`. **A "project" is a separate OS process** (own install dir, port,
DB), not a workspace row in a shared process — confirmed in `src/site-dir/resolve-workspace.ts`, which
resolves exactly one workspace at boot. **Electron, not Tauri**: the Electron assembly is complete
(8 impl files, 8 tests); Tauri throws `NotImplementedError` across 5 files. **It is an assembly job
plus one new component** — port allocation, daemon discovery/liveness and process lifecycle already
exist and are already parameterized for N; what's missing is the **fleet supervisor**. The existing
Tovu-Runner repo is Tovu's own pre-split ancestor, frozen mid-rename — **start over**.

Two real, pre-existing blockers:

- **An interrupted first boot permanently bricks a site.** Seeding is not atomic and its idempotency
  guard checks the *last* thing it writes (the owner user), so a boot that dies after creating the
  owner role — e.g. on a port collision — leaves every later boot crashing on a UNIQUE violation.
  Proven by two "System" principals in a test DB where `seedIdentity` creates exactly one per run.
  Port collisions are routine for a supervisor spawning N instances.
- **Every spawned instance boots with identical owner credentials** `admin`/`tovu-dev` unless Runner
  sets `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` per instance. `@jini-ai/cms` deliberately refuses a
  default password for exactly this reason; Tovu-the-host reintroduces one.

## Smaller open items

- **`npm start` serves no admin.** `src/server/app.ts:762` resolves it to
  `path.resolve(__dirname, "../../apps/admin/dist")`, which from compiled `dist/src/server/` points at
  `dist/apps/admin/dist`. Set `TOVU_ADMIN_DIST` to boot it. May be intentional if packaging copies the
  admin into `dist/` — unverified.
- **`refactor/ai-chat` produced no artifact.** It vetoed correctly — the Node daemon imports
  `chat-core` with no React — but pushed neither branch nor report despite its brief requiring both.
  **Its written analysis is lost**; the finding was re-derived locally.
- **Two reports were uncommitted at handoff time and belong to the concurrent session**:
  `2026-08-03-electron-launch-debug.md` and `2026-08-03-mcp-ui-and-agent-driven-ui.md`. Left alone
  deliberately. If that working tree is cleaned, they are gone.

## Reports — the durable evidence

All under `ADS-memory/reports/recon/`.

| file | answers |
|---|---|
| `pages-vibecoding-decisions.md` | the 13 locked Pages decisions, 4 reversals, do-not-port list, 6 open questions |
| `bolt-diy-analysis.md`, `open-lovable-analysis.md` | the original two reference recons |
| `2026-08-03-vibecoding-in-jini-inventory.md` | what Jini already has; the 7-part table; D-4/D-5 corrections |
| `2026-08-03-vibecoding-apply-tier.md` | apply/undo tiers traced in both references; the contract pressure-test |
| `2026-08-03-onlook-recon.md` | `data-oid` source mapping; two undo tiers; D-REV-4 verdict |
| `2026-08-03-screenshot-to-code-recon.md` | the vision loop; variant system; security anti-patterns |
| `2026-08-03-jini-multimodal-capability.md` | why the vision slice is blocked and the exact fix |
| `2026-08-03-tovu-runner-recon.md` | one-process-per-project; Electron; the two boot blockers |

## Traps worth not re-learning

- **An empty symbol-name search is evidence about names, not capability.** A recon concluded Tovu
  seeds no admin user after searching `firstBoot`/`seedOwner`/`createOwner`. The symbol is
  `seedIdentity`, in `src/identity/wiring.ts`, on the serve path. Trace the composition root.
- **Never treat your own knowledge cutoff as evidence about the world.** A recon flagged a canonical
  1,455-commit clone as possibly synthetic because model names in it (`claude-opus-5`) postdated its
  training data. `git remote -v` and `git rev-list --count` settle provenance in one command each.
- **A clean merge is not a working merge.** All four wave-A branches merged with zero conflicts
  despite predicted collisions; git merges non-overlapping hunks happily. Typecheck, test, and boot.
- **Booting beats testing.** The seeding bug was invisible to 2,926 passing tests and took ten
  seconds to find by running the binary.
- **Verify a subagent's load-bearing claim before building on it.** Four of five reports needed a
  correction. One would have generated real wasted work (a "missing" first-boot credential that
  exists), and one nearly discredited a valid finding.

## Handoff Contract

- **Inputs used:** git state/logs in both repos; `npm run typecheck` / `test` / `check:architecture` /
  `check:inventory` / `guard`; a live `tovu init` + `serve` + `curl`; direct source reads across
  `Jini/packages/{agentic,renderers-react,chat-core,sidecar,desktop-host,cms,agent-runtime}`,
  `Tovu/src`, and `OSS-Repos/{bolt.diy,open-lovable,onlook,screenshot-to-code}`; eight recon reports;
  GitHub REST API for star counts.
- **Output summary:** a fresh session can resume the vibecoding build, the e2e work, and the last
  merge without replaying this session.
- **Risks:** a second session edits the same Tovu branch; the architecture baseline is unlocked; two
  of that session's reports are uncommitted.
- **Suggested next assignee:** Coordinator, with TestRunner for the e2e work.
