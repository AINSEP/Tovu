# Overnight quality audit — 2026-10-21 (report only; no code changed)
Tovu @ 0c5698d44 · Jini @ 52964993 (both `cloud/verify-2026-10-21`). Node 24.22. Started 05:38 UTC.
Per-rule tables: `<repo>-<tool>-summary.txt`; raw outputs gzipped as `raw-*.gz`.

## 1. What each tool does (plain English)
- **dependency-cruiser (depcruise)** — draws the "who imports whom" map and checks it against your architecture rules (e.g. "feature A may only talk to feature B through its public front door"; "no import loops"). Matters because tangled imports make code hard to change safely.
- **knip** — finds dead weight: files nothing uses, exports nobody imports, packages listed but unused, and packages used but never declared. Matters for bundle size, maintenance and "works on my machine" install bugs.
- **SonarJS** — a code-smell and bug-pattern scanner (overly complex code, suspicious logic, risky regexes, hard-coded secrets, weak randomness). Mostly style/maintainability, with a small security slice.
- **Semgrep** — pattern-based security scanner using community rule packs (injection, secrets, OWASP top ten). **Did not run — see §6.**

## 2. Headline numbers vs 2026-10-20 baseline
| Tool | Tovu now (baseline) | Jini now (baseline) |
|---|---|---|
| depcruise | 2,461 violations, 1,143 errors (2,443 / 1,137) — slightly worse. no-deep-imports 2,095; no-circular 307; other 59 | 58 warnings, 0 errors, (50 after triage) — +8, but raw count not triaged (56 circular, 2 orphans, 18 "residual-js-review" notes) |
| SonarJS | 1,999 warnings / 2,753 files (2,090 / 2,748) — better, -91 | 1,683 warnings / 2,907 files (1,676 after triage) — roughly same (+7) |
| knip | 71 unused files (71); 3 unused deps + 6 unused devDeps (92 deps — baseline likely counted differently); 65 unlisted (61); 962 unused exports (962); 2,462 unused types (2,461) — flat | 47 unused files (47); 2 deps + 9 devDeps (2); 16 unlisted (16); 170 exports (168); 313 types (312) — flat |
| Semgrep | not run | not run |

Net: nothing meaningfully regressed overnight; the backlog is essentially unchanged.

## 3. TOP real problems (my read; confidence in brackets)
**depcruise (Tovu)**
1. `features/agent-plugins/{connect-tool,apply-connect-defaults,access-token-tool}.ts → assistant/index.ts` — rule `domain-no-direct-assistant-tool-registration` (the only 3 non-deep-import errors besides deep imports). Domain code bypasses the assistant's tool-registration seam. Architecture breach, not a bug. [high that it's real, low impact]
2. `platform/site-dir/{init-site,boot-site-dir}.ts → server/runtime/composition/*` (6, rule `site-dir-no-server-express-or-cli-imports`) — a low-level platform layer reaching up into server composition; inverted dependency, causes cycles. [medium]
3. `server/runtime/plugin-tier2/worker.ts`, `cli/commands/{serve,export}.ts → boot/plugin-sdk-resolver.ts` — plugin-loading internals used outside plugin runtime; relevant because plugin sandbox is security-adjacent. [medium]
4. 307 import cycles (`no-circular`) — real but mostly benign; the ones in `server/runtime/composition` are the risky (init-order bugs). [medium]
**depcruise (Jini)** — only cycles, e.g. `packages/admin/src/comments/react/hooks/*.hooks.ts ↔ pages|components/*.tsx` (hook file imports the component that imports it; repeated pattern). Low risk. [high]

**knip**
1. Tovu `apps/website` imports `@tovu/sdk` in production code (`features/plugin-runtime/host-binding.ts:7`, `invocation-core-deps.ts:15`, `plugin-export.ts:7`, `server/runtime/composition/plugin-runtime.ts:27`) but doesn't declare it — works via workspace hoisting, can break in a packaged/installed build. [high; M-impact]
2. Tovu admin: `@tiptap/core`, `@tiptap/pm/*` used (e.g. `apps/admin/src/lib/block-atom-insert.ts:1`) but not declared — relies on transitive install; a tiptap upgrade can silently break. [high]
3. Tovu `ajv`, `smol-toml`, `postcss` used only in tests but undeclared (tests could fail on clean install). [high, low impact]
4. Unused deps: `recharts` in 3 Tovu apps; `argon2` devDep in `packages/user-management` (if it's meant to be a real runtime dep for password hashing, check it's not mis-declared — security-sensitive). [medium]
5. Jini `packages/db/src/kernel/kernel-core.ts` "unlisted `interactiveTransaction`/`backup`" — knip parse artefact (they're capability strings), not real. [high noise]
6. Unused-file lists include worker files loaded by path string (Tovu `handlebars-worker.ts`, `liquid-worker.ts`, `import-database-worker.ts`, `site-discovery-worker.ts`) — likely FALSE positives; deleting them would break the app. Don't delete from this list without checking.
7. Jini 137 "referenced optional peerDependencies" and 545 config hints = knip config noise.

**SonarJS** (security-flavoured rules reviewed in code; most are false alarms)
1. `Jini packages/commerce/src/store/store-plugin.ts:108` — order id `ord-${Date.now()}-${Math.random()...}`; guessable/collidable. Matters only if order id is ever used as a secret/unauthenticated lookup. [medium-low; **security-sensitive**, S fix: crypto.randomUUID]
2. `Tovu apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts:107,121,124,133` — `postMessage(..., "*")` to plugin iframes. Probably intentional (sandboxed iframe has opaque origin) and the receive side validates; verify the messages carry nothing secret. [low; **security-sensitive**]
3. `Tovu apps/desktop/src/renderer/source-test-harness.ts:15` — `new Function(...)` eval; test harness only. [high it's benign]
4. `Tovu content/agent-plugins/{netlify,vercel}/.../*.mjs:217/70` — SHA-1; required by those providers' upload APIs. Benign.
5. `Tovu apps/desktop/src/{external-site-stop,packaged-gate-isolation,site-process-registry}.ts` — spawns OS commands by bare name (PATH lookup) — could run a planted binary if PATH is hostile; check they use absolute paths on packaged builds. [low-medium; **security-sensitive**]
6. `Tovu apps/website/src/assistant/external-mcp-store.ts:1612,1836`, `routes/external-mcp/probe.ts:83`, `routes/commerce/status.ts:58` — swallowed exceptions; may hide failures. [low]
7. `Tovu features/trash/adapters/member.ts:24,47` and Jini `json-line-stream.ts:278`, `pi-rpc/events.ts:124,196` — functions that always return the same value (`no-invariant-returns`); possible logic slip, worth a 5-minute look. [low-medium]
8. Jini `packages/agentic/src/skills/install/{archive.ts:41,github.ts:110}` — flagged "size mischeck"; on reading, the checks are correct size-cap validation. False positive. The control-char regexes in `install-service.ts:44/107/129` are intentional path-safety checks. Good code actually.
9. Jini `no-unused-vars` (64) and `unused-import` (53) — cheap genuine cleanups, can hide dead code. [high]
10. `Math.random` for non-secret ids in Tovu admin transport / Jini `agent-plugins/lifecycle/node.ts:22` — benign.
Hard-coded-password hits (44, Tovu) are i18n labels like "Password" — all noise (checked `auth-i18n.ts:7,27`).

**Semgrep** — no findings (did not run).

## 4. NOISE (safe to ignore)
- Tovu depcruise `no-deep-imports` ×2,095 (85%): a "use the folder's index file" convention; mass import-path style, not bugs. Biggest: platform/site-dir 838, assistant 320, webhooks 294, headless 157.
- SonarJS style: `prefer-read-only-props` 566 (Tovu), `no-nested-conditional` 139/205, `expression-complexity` 138/158, `elseif-without-else` 54/111, `no-nested-incdec` 31/164, `too-many-break-or-continue-in-loop` 69/111, `no-nested-template-literals` 94/71, `no-unenclosed-multiline-block` 42/108, `no-duplicate-string` 76/46, `no-redundant-optional` 93, `todo-tag`, `redundant-type-aliases`, `void-use`, `deprecation` 62.
- `super-linear-regex` (51 Tovu / 152 Jini): sampled ones are mostly trailing-slash/whitespace trimming regexes on short strings — theoretical ReDoS only; check only those applied to untrusted HTTP input (e.g. Tovu `features/agent-plugins/federate-mcp.ts:169,171`, `contracts/headless/content-chat-title.ts:23-29`). Not verified individually.
- Tovu SonarJS "(no-rule)" 64 = mostly "eslint-disable has no effect" config notes, not real parse failures.
- knip: unused exported *types* (2,462/313) and exports (962/170) — public-API surface; mostly cosmetic. Jini examples/skill-template files (shadcn examples, remotion template) are intentionally unresolved.

## 5. RECOMMENDATIONS
- **knip** — worth acting on, smallest step: declare the missing deps (`@tovu/sdk` in apps/website, `@tiptap/*` in admin, `ajv`/`smol-toml`/`postcss` devDeps) — S. Then trim real unused deps (`recharts`) — S. Leave exports/types — L, low value. Fix knip config to exclude worker files/templates to kill false positives — S.
- **depcruise** — worth keeping as a ratchet (CI fails if count rises); don't try to burn down 2,095 deep imports (L). Fix the 3 `assistant` errors and 6 site-dir inversions — M.
- **SonarJS** — low value as-is. Smallest step: restrict to a bug/security rule subset (`no-invariant-returns`, `no-ignored-exceptions`, `no-unused-vars`, `unused-import`, `pseudo-random`, `no-os-command-from-path`) and drop style rules — S. Look at commerce order id and OS-command PATH items (**security-sensitive**) — S.
- **Semgrep** — can't judge. Smallest step: run it where semgrep.dev is reachable (or vendor the rule packs as local YAML so it runs offline/pinned) — S/M. **Security scanner, so this gap matters.**

## 6. Did not run / failed
- **Semgrep (both repos): not run.** Registry rule packs (`p/typescript`, `p/javascript`, `p/nodejs`, `p/secrets`, `p/owasp-top-ten`) are fetched from semgrep.dev, which the sandbox network blocks (HTTP 403 via proxy). Exit 2; semgrep 1.182.0 installed OK. Local rules in `.semgrep/tests` are test fixtures only; I did not substitute them.
- **Tovu knip first failed** (`Cannot find module '@vitejs/plugin-react'` in apps/site-chat, then apps/desktop): per-app deps were not installed by the prescribed setup. I ran `npm ci` in `apps/site-chat` and `npm ci --ignore-scripts` in `apps/desktop` (environment-only, no tracked file changed) and re-ran knip successfully (exit 1 = findings). Tovu depcruise exit 119 = errors present (expected). Jini depcruise exit 0.
- Jini depcruise prints "automation-engine-vocabulary-firewall SKIPPED: foundry/automation absent" — expected in a clean clone.
- Sonar finding lines for §3 came from a second JSON-format run of the same eslint config (same counts).
