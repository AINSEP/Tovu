# Handoff: the Agent Plugin loading path is architecturally wrong; coverage + menu bugs are fixed

Generated: 2026-08-21
Source: Claude Code (Opus 5, 1M), Coordinator — Review Mode
Target: Claude Code, fresh session
Branch `general-work` · HEAD `be081d9c` · **11 unpushed commits** · all agent work committed, no agents running

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff, then
> `ADS-memory/reports/2026-08-21-agent-plugin-chip-wiring-spec.md`.
>
> **Start with §1 — the Agent Plugin loading path.** It is the only substantive open item and the
> spec in that report is built on two assumptions this handoff proves wrong. Read §1 before you
> read the spec, or you will build the wrong thing.
>
> Hard constraints: **never run `npm run test:cov`** (full-repo: 35 min, 2.7 GB, machine OOMs near
> 5.4 GB). Scoped runs only. Before ANY coverage run, `ps -eo args | grep -c '[e]xperimental-test-coverage'`
> must be `0` — **run that as its own separate command**, or `ps` matches your own shell.
> **Do not start Docker** — the owner shut it off deliberately. Shared git tree with other live
> sessions: `git commit -F <msg-file> -- <exact paths>` is the ONLY safe commit form.

---

## §1 — THE OPEN ITEM: Agent Plugin content is not in Tovu at all

**Tovu ships an "Agent Plugins" feature whose content lives in a different repository and is
inlined at build time via a relative path that escapes the repo.**

`apps/admin/src/features/plugins/agent-plugin-source-catalog.ts:35` (and ~25 siblings):

```ts
import ...KoleJainUiuxConceptsSource from
  "../../../../../../Jini/packages/agent-plugins/ui-ux-design/skills/ui-ux-design/references/kole-jain-uiux-concepts.md?raw";
```

Six levels up, out of Tovu, into a **sibling checkout**. Vite's `?raw` inlines the file contents into
the admin JS bundle at build time.

### Verified facts

| Location | Contents |
|---|---|
| `Tovu/AI-Dev-Shop/skills/ui-ux-design/` | 12 refs on disk, **but `AI-Dev-Shop/` is gitignored** (`.gitignore:37`) — `git ls-files AI-Dev-Shop` returns **0** |
| `Tovu/src/features/agent-plugins/` | TypeScript **only** (install, manifest, layout, capability-projection). No content. |
| Anywhere else in Tovu | `git ls-files \| grep 'skills\?/.*\.md$'` → **zero**. No plugin content is committed in Tovu. |
| `Jini/packages/agent-plugins/ui-ux-design/` | The only real copy. 12 reference files. |

**Consequences:** Tovu cannot build without the Jini checkout sitting at exactly `../Jini` relative to
it. A fresh clone of Tovu alone fails. Nothing "loads" a plugin at runtime — the text is already
baked into the bundle, which is why no file read ever occurs.

### The intent this contradicts

`src/features/agent-plugins/install.ts` exports `installAgentPlugin` — a hardened, content-addressed
archive installer (zip-slip guards, decompression-bomb caps, SHA-256-before-extract, idempotent
publish to `packages/<digest>/`). **It has zero production callers**; every reference is its own tests.

Read together, the shapes suggest the intended design was *install/copy plugin → Tovu owns a copy →
app reads Tovu's copy*, and the relative import is a stand-in for a copy step that was never built.
**This is inference from code shape, not a documented decision — verify before relying on it.**

### Owner's stated end state (2026-08-21)

A publicly hosted agent-plugin registry; Tovu fetches a plugin from a URL and installs a local copy.

That is closer than it looks. **The back half already exists and is tested:**

```
[public registry] → fetch → bytes ──→ installAgentPlugin ──→ local copy
     MISSING              MISSING       BUILT & TESTED        BUILT
```

`installAgentPlugin` takes **`{archive (bytes), expectedSha256, archiveReader, layout, workspaceId}`**
— **not a URL.** There is zero network code in `src/features/agent-plugins/` (grep for
`fetch(|https?://|download|axios|undici` returns only schema-URL string constants). Digest-verify-
before-extract is exactly the property a download flow needs. `manifest.ts:40-41` already requires
`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, consistent with a registry plan.

### Recommended next step (owner had not yet chosen when the session ended)

**Prove `installAgentPlugin` works on real content**: zip `Jini/packages/agent-plugins/ui-ux-design/`,
compute its SHA-256, call the installer with those bytes plus the existing `yauzl-archive-reader`, and
assert real files land in the workspace `packages/<digest>/` dir. Its current tests use synthetic
fixtures only. This is the identical call a download would make — only the byte source differs. If it
passes, the entire back half is proven and the remaining work is "fetch a file."

Two options were put to the owner and **neither was chosen** — decide with them first:
- **A** — vendor a committed copy into Tovu (e.g. `plugins/ui-ux-design/`). Works on a fresh clone; costs a sync burden.
- **B** — wire up `installAgentPlugin` properly. Reuses built work; more moving parts before anything visible.

### The chip-wiring spec is built on two now-disproven assumptions

`ADS-memory/reports/2026-08-21-agent-plugin-chip-wiring-spec.md` (`be081d9c`) is good work on Layers
1–2 but **Layer 3 is wrong**:
1. It targets `AI-Dev-Shop/skills/ui-ux-design/` — **gitignored**, not in the repo.
2. It assumes server-side file loading — unnecessary; the content is already in the admin bundle.

Correct Layer 3 before building from it. Layers 1 (chip UI, reusing `AttachmentTray.tsx`'s existing
removable-chip pattern) and 2 (extend the existing `contextRef` envelope with `pluginRefIds`) still stand.

---

## §2 — Why any of this matters: the plugin currently does nothing, proven end-to-end

Full detail: `ADS-memory/reports/2026-08-21-agent-plugin-wiring-static-verdict.md`.

- The `/` menu row is a plain `insertText` binding. Selecting it types the literal string
  `UI/UX Design agent plugin` and nothing else (`composer-capabilities.ts:210`). The composer is a
  plain `<textarea>` (`Composer.tsx:297`); `Composer.tsx:257-258` appends the string and **discards the
  selection**, so nothing downstream can distinguish "picked the plugin" from "typed those words."
- `onSend: () => void` (`Composer.tsx:32`) carries no structured payload.
- The system overlay (`src/server/agent-daemon/agent-daemon-server.ts:442-455`) **never mentions
  plugins or skills**, and actively tells the agent it is *"not doing general development work on the
  Tovu codebase"* — which may discourage file reads. `contextKinds: () => []` is empty.
- **`augmentUserRequest` is NOT an empty extension point — it is dead.** Grepping all of Jini, the only
  matches are its own interface declaration (`prompt-augmenter.ts:46`), its own no-op default (`:62`),
  and its own tests. **Nothing invokes it.** Resolution must hook where Tovu builds `prompt` by hand
  before `agentExecutor.run()`, the same place attachments already resolve.
- **A/B run, both arms real:** two landing pages generated through the live assistant — `/cinder-coffee-roasters`
  (plugin row selected) and `/thornwood-coffee-roasters` (not selected). Near-identical design language:
  same dark theme, same green accent, same custom SVG mark, same button pair, and the
  **character-for-character identical eyebrow string `SMALL-BATCH · ROASTED TO ORDER`**. Both pages are
  still live. Neither read any skill file.
- **Recall test:** attaching the row then asking *"What did I just give you? Name its reference files"*
  — the assistant answered, verbatim, **"You gave me a plain string, not a plugin,"** and cited
  `composer-capabilities.ts:210` itself.

---

## §3 — Completed, verified, and committed this session (11 commits, `8a3fdb47..be081d9c`, UNPUSHED)

**One commit in range is not this session's:** `f457c734` / `c1f955a5` belong to the composer-menu-trim
session that finished separately. Do not attribute them here.

### Coverage corruption — FIXED, measured before and after by the Coordinator
- **679 of 703 first-party lcov blocks contaminated → 0.** Single scoped run of
  `export-command.integration.test.ts`; `check:coverage-integrity` exit 1 → exit 0; tests 4/4 both times.
- Root cause: tests spawning Node children that inherit `NODE_V8_COVERAGE`. **`delete env.NODE_V8_COVERAGE`
  does NOT work** — Node re-injects it into descendants (probed directly). **Redirecting** the variable is
  the only fix that holds. Shared helper `src/core/child-process-coverage-env.ts` + a **static wiring test**
  pinning that all 13 call sites actually call it. (`1aabfb6d`, `9db7d528`, `df157b34`)
- **"Layer 1" and "layer 2" were always one bug.** Both images are present in 100% of runs; what varies is
  which one wins the lcov merge. A corrupt run's `DA:` values collapse to exactly the CJS wrapper's own
  hit counts (`0, 32, 128`) vs 14 distinct values in a good run. Full derivation + a retracted wrong claim:
  `ADS-memory/reports/2026-08-21-coverage-unsorted-list-control-result.md`.
- **Honest cost:** that run's reported footprint drops 703 files → 2. Aggregate coverage percentages will
  go DOWN. The vanished blocks were corrupt, not real coverage. Say so before quoting any before/after.
- `npm run check:coverage-integrity` added (`2d0f73f2`, `ceb210e8`, `32a7b901`): CONTAMINATED (gates) /
  SEVERE (never baseline-suppressible), path-based `--baseline` ratchet, 35 tests.
  **Open:** the committed baseline is from a scoped 93-block run, not a real `test:cov`, and is
  deliberately NOT wired as the default. Recapture with `--update-baseline` before wiring it.

### Composer menu duplicate labels — FIXED (`ac3d09c2`)
Two `/` menu rows were byte-identically labelled "UI/UX Design"; descriptions exist but are rendered as a
**hover-only tooltip**, so they were indistinguishable at scan time. Now "UI/UX Design (Agent Plugin)" and
"UI/UX Design (Skill)". Regression test asserts the **general invariant** (no two items share a label),
proven RED 12/12 first. Verified in-browser by the Coordinator.

### Visual regression testing — WORKS LOCALLY (`de701ddd`)
`development/e2e/admin-composer-typeahead-visual.spec.ts` + its config (ports **8041-8043**), 3 tests
passing, including the owner's named case: type `/`, screenshot the menu, fail on pixel change. Paradigm
doc at `ADS-memory/reports/2026-08-21-visual-regression-testing-paradigm.md`.
**Two caveats:** (1) that doc still recommends a **Docker container** flow that was **never tested and will
not work as written** — `better-sqlite3` is `Mach-O 64-bit x86_64`, so mounting host `node_modules` into
Linux cannot boot the `webServer`; (2) the committed `-chromium-darwin` baselines are macOS-locked and must
be regenerated before CI. Also found: first test needs `timeout: 60_000` for Vite cold JIT, matching
existing admin-suite precedent.

---

## §4 — Claims corrected during this session. Do not re-inherit the originals.

Recorded because this repo keeps a register of proven-false claims and this session generated several.

1. **"`augmentUserRequest` is an empty extension point you just fill in."** WRONG — it has zero callers anywhere. Dead interface method.
2. **"Tovu has no dependency edge to the plugin package."** WRONG — the `?raw` relative import in `agent-plugin-source-catalog.ts` is a hard filesystem coupling. The original grep only checked `package.json` and `src/`, missing `apps/admin/src/`.
3. **"Run 3 contained a third instantiation image (21 extra `FN:` lines)."** WRONG and retracted in-report — the diff compared only the first comma-field, so a reordering read as an insertion. Blocks are structurally identical.
4. **"Runs 1/2/4/5/6 were clean."** Only **line**-clean. All six report `FNF:43 FNH:29` against a true `FNF:20 FNH:20` — 67% function coverage for a file actually at 100%.
5. **`kole-jain` / `sam-crawford` filenames are an unfakeable proof-of-read.** WRONG — those names appear in `agent-plugin-source-catalog.ts`'s import statements. An agent can name them without opening any `.md`. It did exactly that.
6. **The persona path is `AI-Dev-Shop/agents/qa-e2e/skills.md`**, not `agents/qa/`.

---

## §5 — Constraints the next agent must honor

- **Memory is the binding constraint.** One coverage run at a time. Never `npm run test:cov`. Check `ps` as its OWN command.
- **Do not start Docker**, pull images, or run containers without asking. The owner shut it off mid-task today.
- **Ask before killing any process.** PID 8967 (codex), **PID 9969 (vite :5173 — the owner watches this)**, PID 60795 (backend :3000) are not ours.
- **Never delete or modify site content** to make a test work. This was requested by an agent today and refused. `/cinder-coffee-roasters` and `/thornwood-coffee-roasters` are live A/B evidence — leave them.
- **Shared git tree.** `git commit -F <msg-file> -- <exact paths>` only. Never `git add .`/`-A`, `git reset`, `git stash`, `git checkout -- .`.
- **Do not touch:** `apps/admin/src/features/plugins/{agent-plugin-catalog,agent-plugin-source-catalog}.ts` and their two tests, `src/assistant/__tests__/execution-credential-store.test.ts` — dirty, owned by other sessions.
- **Subagent messages frequently do NOT arrive mid-flight** — this bit four times today. Put everything in the spawn prompt. **To actually stop an agent, `TaskStop` it; do not rely on a message.**
- **Never say "rotate" to a subagent.** Use: *at a good stopping point near 350k, commit everything, report to the team lead, then take yourself offline.* Pair with observable proxies (context warnings; files-touched / tool-call counts) — an agent cannot read its own token count.
- **Treat every subagent report as a claim.** Re-derive numbers, re-run tests, `git status` their territory. Three agents' load-bearing claims needed correction today; two agents caught the Coordinator's own errors.
- lcov `DA:` line numbers are wrong here (tsx strips comments pre-instrument). Read `FN`/`FNDA` names.
- `waitUntil: "networkidle"` NEVER resolves against the admin (open SSE feed) and fails **silently**.
- The round assistant-dock button **moves after a page reload** — locate by element reference, never a stale coordinate.
- **macOS atime does not update on a plain read.** To detect file reads, force atimes old first (`touch -a -t 202001010000`), then re-`stat`. Note the `Jini/` tree does not track atime reliably at all — use the tool-call transcript there instead.

## Handoff Contract
- **Inputs used:** live `git log`/`status`/`rev-list`; direct reads of `install.ts`, `agent-plugin-source-catalog.ts`, `composer-capabilities.ts`, `Composer.tsx`, `ComposerDiscovery.tsx`, `agent-daemon-server.ts`, `prompt-augmenter.ts`; two before/after scoped coverage runs; a live two-arm A/B through the real assistant; a recall test; 6 subagent reports, all independently spot-checked.
- **Output summary:** lets a fresh session resume on the plugin-loading problem without replaying the day, and stops it from building on the spec's two wrong assumptions.
- **Risks:** the "intended design" reading in §1 is **inference from code shape, not a documented decision**. The owner had **not** chosen between options A and B when the session ended — do not pick for them. 11 commits are **unpushed**.
- **Suggested next assignee:** Coordinator → owner decision on A vs B, then a single Programmer-persona agent for the `installAgentPlugin` real-content test.
