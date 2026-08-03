# Handoff: `@jini-ai/vibecoding` created, six of seven cloud branches merged

Generated: 2026-08-03T18:20:00Z
Source: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M), repos `Tovu` + `Jini`
Target: claude (Claude Code)
Supersedes the merge plan in `2026-08-03-handoff-cms-extraction.md` — that merge job is now done.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file. Both repos are on branch
> `refactor/jini-admin-extraction` (kept deliberately — see "Branch naming"). Do not re-derive what
> the four recon reports establish. Start at "Next Steps".
> **Another session is working the same Tovu branch concurrently** — check `git log` and
> `git status` before assuming anything about the working tree is yours.

---

## What this session did

1. **Merged six of the seven dispatched cloud branches** and verified Tovu boots and serves for real.
2. **Created `@jini-ai/vibecoding`** in Jini with a framework-free `/core` — the design is evidenced
   by four recon reports, not invented.
3. **Ran four recons** (Tovu-Runner, the bolt.diy/open-lovable apply tier, Onlook, screenshot-to-code)
   and independently verified or corrected each one's load-bearing claims.

## Current state

| repo | branch | HEAD |
|---|---|---|
| Tovu | `refactor/jini-admin-extraction` | `0894ee2` |
| Jini | `refactor/jini-admin-extraction` | `e9b9fbd83` |

**Neither repo's `main` has been pushed.** Both were fast-forwarded locally earlier, then work
continued on the branch, so local `main` is now behind. That is intentional — the user asked to test
locally first.

### Cloud branch outcomes — all seven accounted for

| branch | outcome |
|---|---|
| `port/entries-content-types` | merged |
| `port/taxonomy` | merged |
| `port/workspace-presentation` | merged |
| `port/widgets` | **vetoed itself, correctly** — moved `toWhereUsedResponse` and reported; merged |
| `refactor/subpath-imports` (wave C) | merged, one trivial conflict |
| `refactor/admin-react-to-ui` | **pushed, NOT merged — the one piece of work left** |
| `refactor/ai-chat` | **vetoed, and pushed nothing at all** |

### Verification gates, post-merge

- Tovu `npm run typecheck` — clean
- Tovu `npm test` — **2950 tests / 2944 pass / 4 known failures** (new count; tests moved into
  packages, so judge by *which* tests fail, never by count)
- Tovu `npm run check:architecture` — improved on every ratcheted metric; **back-edges into the
  composition root 28 → 24**. **Baseline NOT locked** — run `--update` once you are satisfied.
- Tovu `npm run check:inventory` — fixed this session, now passes (25 entries)
- Jini `packages/cms` — build clean, 62 files / 471 tests green
- Jini `packages/vibecoding` — typecheck clean, 11/11 tests, build clean, complexity clean
- Jini `npm run guard` — only the one known pre-existing violation in `packages/ui`
- **Booted for real**: `tovu init` + `tovu serve` → site 200, admin 200

### The 4 known failures (anything else is a regression)

3 in `src/server/__tests__/identity-crud-routes.test.ts` (password fixtures shorter than the 12-char
minimum) and 1 in `src/features/plugins/store/__tests__/store-plugin.test.ts`.

**Two additional failures appear under machine load and are NOT regressions** —
`src/cli/__tests__/integration/serve-command.integration.test.ts` (a boot timeout; **verified 14/14
passing in isolation**) and `src/server/http/site/__tests__/liquid-sandbox.test.ts` (an OOM whose
error text varies by which guard trips first). Both were failing while a second session ran work on
the same machine. Re-run a suspected failure in isolation before calling it a regression.

## `@jini-ai/vibecoding` — what exists

`Jini/packages/vibecoding`, commit `e9b9fbd83`. `/core` only; `./node` and `./react` are
deliberately absent rather than stubbed.

```
EditTarget:  listParts / readPart / replacePart / snapshot / restore / validate
exports:     applyEdit, applyEdits, correctionsFor
```

The premise: every AI app-builder differs at exactly one place — what is being edited. So the
package owns the loop and reaches the artifact through one port. Tovu Pages implements "parts are
tagged regions of one document"; Zana implements "parts are files."

**Do not re-litigate these.** Full reasoning in `ADS-memory/reports/recon/2026-08-03-vibecoding-*.md`.

1. **`listParts` is an allowlist.** A part not listed is structurally unaddressable rather than
   merely discouraged. That is where scope discipline comes from — bolt.diy enforces identical scope
   rules across three prompt variants of wildly different tone, over an identical mechanism.
2. **`validate` takes the whole prospective artifact.** The one piece with no upstream to copy:
   neither reference implementation validates writes at all, because a whole file cannot corrupt
   another file's syntax and a sub-document region can. It takes the whole artifact, not the part,
   because a fragment well-formed in isolation can still break the document it lands in.
3. **`snapshot` restores data, never execution state.** bolt.diy's rewind also replays setup
   commands to restart its dev server; that is the host's job after `restore` returns.
4. **No verbs for process/build/install** — a separate execution layer owns those. Absence is a
   decision, not a gap.
5. **`replacePart` is an upsert.** Both reference implementations create-on-write.

Two behaviours deliberately correct the references: a write failure surfaces as `failed` rather than
being logged and forgotten (bolt.diy marks actions complete regardless — `action-runner.ts:311-339`),
and every proposal gets its own outcome so a host can report which parts landed.

## Recon findings that change previously-locked decisions

All four reports carry a **"Coordinator verification pass"** section recording what was independently
checked and what was corrected. Read those sections — in three of four cases they correct the body.

- **D-5 (`data-tovu-id`) should reuse `data-agent-element`.** `Jini/packages/agentic/src/element-handles.ts`
  already implements a hardened, injection-safe allowlist with `region` as an existing role. Also, a
  product-named attribute cannot live in Jini at all under guard rule R5.
- **D-4 (separate-origin preview) is largely pre-solved.** `renderers-react`'s `SrcDocSandbox` omits
  `allow-same-origin` deliberately, with a test asserting the omission. The requirement shrinks to
  "do we need a *navigable* preview URL?"
- **OQ-2 (vision self-check) — its premise is falsified.** It was scoped as a stretch slice because
  "neither reference implementation uses a vision model anywhere." screenshot-to-code has a fully
  wired render → screenshot → vision-feedback → edit loop (`backend/agent/tools/screenshot_preview.py`).
- **D-REV-4 (visual editor) gains a third option, not a reversal.** Onlook writes a permanent
  `data-oid` into JSX *source* — no build plugin, no fiber introspection. But every JSX write is
  re-parsed, regenerated and Prettier-formatted (`packages/file-system/src/code-fs.ts:46-83`), and
  **even unparseable files still get formatted**. Semantically faithful, not byte-preserving. Risk
  class moves from severe (silent loss) to mild (reformatting churn). Worth a spike.

## Next Steps

1. **E2E tests — the user's explicit ask, and nothing covers it today.** The gap this session
   exposed: a full unit suite passed while `tovu serve` crashed on boot, and the only reason anyone
   knew was a manual `init` + `serve` + `curl`. Start there — init a site, boot it, assert site and
   admin both serve, exercise one ported domain end to end. `src/cli/__tests__/integration/serve-command.integration.test.ts`
   is the closest existing thing and a reasonable model.
2. **Merge `refactor/admin-react-to-ui`** — the last unmerged branch, in both repos.
3. **Add the undo/redo tier to `@jini-ai/vibecoding`** — accepted design, not yet built. An
   operation-level stack layered *on top of* `snapshot`/`restore`, recording a before/after pair per
   `replace`. Adds no verb to `EditTarget`. Onlook has real undo *and* redo with transaction
   batching; bolt.diy has no redo at all. Also borrow never-destructive restore (capture current
   state before restoring, so a rewind can itself be undone).
4. **Lock the architecture baseline** — `npm run check:architecture --update` once satisfied.
5. **Read `ADR-052-tovu-runner-is-its-own-desktop-product.md`** (written by the concurrent session)
   and reconcile it against `2026-08-03-tovu-runner-recon.md`, whose Open Question 1 was exactly this
   unresolved ADR-011-vs-ADR-014 tension. Make sure the two documents agree.
6. **The vision self-check is BLOCKED, and now you know exactly why.** Report landed:
   `2026-08-03-jini-multimodal-capability.md`. **Jini cannot send an image to a model today** on the
   path that matters. Verified independently: `agent-runtime/src/providers/anthropic-messages.ts:63-86`
   defines `text | tool_use | tool_result` with no image variant, and — the detail most likely to be
   missed — **`AnthropicToolResultBlockParam.content` is a plain `string`, not a parts array**. A
   self-check returns its screenshot *inside a tool result*, so adding a top-level image block is not
   sufficient; `tool_result.content` must become a parts array. OpenAI is the same shape, Azure
   inherits it by reusing OpenAI's builder, and Google's own source comment names multimodal parts as
   deliberately out of scope.
   Attachments are a red herring: they reach real disk storage through a well-built capability-claim
   system, then feed `buildArgs(prompt, imagePaths, …)` — which **16 of 20 CLI agent defs underscore
   and never use, including the flagship `claude.ts:81`.** That was checked adversarially, because
   `_prompt` is underscored there too yet is delivered via stdin; images have no such fallback.
   Only the ACP and pi-rpc protocol paths genuinely forward images.
   **Build it on the direct-provider proxy path, not the CLI-agent path** — the proxy's turn-runners
   already have the execute-tool-then-continue shape; the CLI path hands control to an external
   subprocess where a mid-turn tool-result image cannot be injected. A self-check screenshot needs no
   attachment-store involvement: renderer → callback, in memory.

## Open items carried forward

- **Shim removal.** Tovu still has re-export shims: `core/ports` (118 importers), `identity` (47),
  `core/commands/command` (38), `core/tools/registration-kit` (16), `core/commands/change-set` (1).
  Deleting them is ~220 files of mechanical import rewriting. **Do it now that wave C has landed**,
  not before — wave C normalized the import style, which makes this strictly easier.
- **Two Tovu-Runner blockers, both real and both pre-existing:**
  - **An interrupted first boot permanently bricks a site.** Seeding is not atomic and its
    idempotency guard checks the *last* thing it writes (the owner user), so a boot that dies after
    creating the owner role — e.g. on a port collision — leaves every later boot crashing on a
    UNIQUE violation. Proven by two "System" principals in a test DB where `seedIdentity` creates
    exactly one per run. Port collisions are routine for a supervisor spawning N instances.
  - **Every spawned instance boots with identical owner credentials** `admin`/`tovu-dev` unless
    Runner sets `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` per instance. `@jini-ai/cms` deliberately
    refuses a default password for exactly this reason; Tovu-the-host reintroduces one.
- **`npm start` serves no admin.** `src/server/app.ts:762` resolves the admin to
  `path.resolve(__dirname, "../../apps/admin/dist")`, which from compiled `dist/src/server/` points
  at `dist/apps/admin/dist`. Set `TOVU_ADMIN_DIST` to boot it. May be intentional if packaging copies
  the admin into `dist/` — unverified.
- **`refactor/ai-chat` produced no artifact.** It vetoed correctly — a Node HTTP server
  (`Jini/examples/reference-web/src/daemon.ts`) imports `@jini-ai/chat-core` with no React, so
  folding React in would break it — but it pushed neither branch nor report despite its brief
  requiring both. **Its written analysis is lost.** The finding above was re-derived locally.

## Traps worth not re-learning

- **An empty symbol-name search is evidence about names, not capability.** A recon concluded Tovu
  seeds no admin user after searching `firstBoot`/`seedOwner`/`createOwner`. The symbol is
  `seedIdentity`, in `src/identity/wiring.ts`, on the serve path. Trace the composition root.
- **Never treat your own knowledge cutoff as evidence about the world.** A recon flagged a canonical
  1,455-commit clone as possibly synthetic because model names in it (`claude-opus-5`) postdated its
  training data. `git remote -v` and `git rev-list --count` settle provenance in one command each.
- **A clean merge is not a working merge.** All four wave-A branches merged with zero conflicts
  despite the handoff predicting collisions; git merges non-overlapping hunks happily. Typecheck,
  test, and boot.
- **Booting beats testing.** The seeding bug was invisible to 2,926 passing tests and took ten
  seconds to find by running the binary.

## Branch naming

`refactor/jini-admin-extraction` is misnamed for what this became — the user acknowledged this and
chose to keep it, because the scheduled cloud routines had that name written into their instructions.
All seven have now fired, so the name is free to change whenever convenient.

## Handoff Contract

- **Inputs used:** git state and logs in both repos; `npm run typecheck` / `test` / `check:architecture`
  / `check:inventory` / `guard`; a live `tovu init` + `serve` + `curl`; direct source reads in
  `Jini/packages/{agentic,renderers-react,chat-core,sidecar,desktop-host,cms}`, `Tovu/src`, and
  `OSS-Repos/{bolt.diy,onlook,screenshot-to-code}`; the four recon reports; GitHub REST API for star
  counts.
- **Output summary:** lets a fresh session continue at e2e tests, the last merge, and the undo tier
  without replaying the session.
- **Risks:** a second session is editing the same Tovu branch; the architecture baseline is unlocked;
  the multimodal recon may not have finished.
- **Suggested next assignee:** Coordinator, with TestRunner for the e2e work.
