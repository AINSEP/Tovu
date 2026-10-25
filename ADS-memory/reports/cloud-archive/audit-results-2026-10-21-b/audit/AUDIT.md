# Overnight quality audit — 2026-10-21 (report only, no code changed)

Branches audited: Tovu `cloud/verify-2026-10-21` @ 0c5698d44, Jini same branch @ 529649933. Node 24.22, Semgrep 1.182.0.
Tools ran 05:37–06:22 UTC. Raw outputs + rule→count tables sit beside this file (`<repo>-<tool>-summary.txt`).

## 1. What each tool does (plain English)
- **dependency-cruiser (depcruise)** — draws the "who imports whom" map and checks it against your architecture rules (e.g. "feature A must not reach into feature B's internals", "no import loops"). Matters because tangled imports make code hard to change and cause hidden breakage.
- **knip** — finds dead weight: files nobody imports, exports nobody uses, packages listed in package.json but unused, and (more important) packages the code uses but package.json doesn't list. Dead code is clutter; unlisted packages can break installs/builds.
- **SonarJS (via eslint)** — a "code smell + bug-pattern" linter. Mostly readability/complexity advice, with a small number of rules that spot genuine bugs or risky calls.
- **Semgrep** — pattern-based security scanner (XSS, unsafe HTML, hard-coded secrets, regex that can hang, etc.).

## 2. Headline numbers vs 2026-10-20 baseline
| Tool | Tovu now | Tovu baseline | Jini now | Jini baseline |
|---|---|---|---|---|
| depcruise | 2,461 (1,143 errors, 1,318 warn) | 2,443 (1,137 err) — **slightly worse (+18)** | 58, all warnings, 0 errors | 50 after triage — **slightly worse (+8)** (56 circular, 2 orphans) |
| depcruise detail | no-deep-imports 2,095; no-circular 307 | 2,082; 304 | — | — |
| SonarJS | 1,999 warnings / 2,753 files, 64 parse errors | 2,090 / 2,748 / 65 — **better** | 1,683 warnings / 2,907 files | 1,676 after triage — **~same (+7)** |
| knip unused files | 71 | 71 (same) | 47 | 47 (same) |
| knip unused deps | 3 deps + 6 devDeps | 92 — **not comparable** (see §6) | 2 deps + 9 devDeps | 2 |
| knip unlisted deps | 65 | 61 (+4) | 16 | 16 |
| knip unused exports / types | 962 / 2,462 | 962 / 2,461 (same) | 170 / 313 | 168 / 312 (+2/+1) |
| Semgrep | **could not run as configured** — see §6; substitute run: 6,165 findings | none | substitute run: 5,478 | none |

Nothing moved materially. The small Jini/Tovu depcruise drift is new imports since yesterday, not a regression to worry about.

## 3. Likeliest REAL problems (I read the code around each)
### dependency-cruiser
1. **Tovu — 3 genuine rule *errors*** (the only non-"deep import" errors): `apps/website/src/features/agent-plugins/{connect-tool,apply-connect-defaults,access-token-tool}.ts` import `assistant/index.ts` directly (rule `domain-no-direct-assistant-tool-registration`). Real architecture breaches of your own rule; behaviour is fine today. Confidence: high that they're real, low severity.
2. **Tovu — 28 `only-composition-constructs-concrete-adapters` warns**: features such as `features/identity/user-purge.sqlite.ts`, `features/plugins/*`, `features/database-transfer/*`, `features/custom-credentials/store.ts` reach straight into `platform/db/...` (kernel, dialect, sqlite driver). Medium: this is the exact layering rule meant to keep DB code swappable.
3. **Tovu — 6 `site-dir-no-server-express-or-cli-imports`**: `platform/site-dir/init-site.ts` and `boot-site-dir.ts` import `server/runtime/composition/*`. Platform → server is an upward dependency. Medium.
4. **Tovu — circular imports (307)**: concentrated in `contracts/core` (54), `assistant/tool-registrations.ts` (50), `features/agent-plugins` (44), `site-backup` (26). Cycles can give "undefined at import time" bugs; none shown to fail today. Low–medium.
5. **Jini — 56 cycles, all in `packages/ui` / `user-management`** (e.g. `user-management/src/core/builtin-permissions.ts`, `ui/.../TabBar.hooks.tsx`, `*.labels.ts` files). Likely benign `.labels`/hook split cycles. Low.

### knip
1. **Tovu undeclared packages used by real (non-test) source:** `apps/website/src/server/inbound/public-http/http/site/worker-sandbox.ts:1` imports `esbuild`; `apps/website/src/server/error-mapping/respond.ts:3` imports `@jini-ai/protocol`; `@tiptap/core`, `@tiptap/pm/{state,view}` used in `apps/admin/src/lib/block-atom-insert.ts`, `features/posts/rules.ts` and others. They work only because another package pulls them in (hoisting). A clean install of a trimmed/published build could fail to resolve. Confidence: high these are undeclared; medium that it bites in practice. (`postcss`, `ajv`, `smol-toml`, `minimatch` are test-only → harmless.)
2. **Tovu unused deps:** `recharts` ×3 apps (admin/desktop/site-chat), `jsdom` & `npm` (desktop), root `astro`, `drizzle-kit`, `ts-morph`, `@types/js-yaml`. Safe-to-remove candidates; confirm none are used via scripts/config. Medium confidence.
3. **Tovu duplicate exports (2):** `apps/website/src/contracts/core/assistant-native-fallbacks.ts` (`resolveFullCliAccess|resolveAssistantNativeFallbacks`), `platform/db/sqlite/database-journal-db.ts` (`journalKernel|openDatabaseJournalDb`). Low.
4. **Jini unused declared deps:** `examples/minimal-host` `@jini-ai/oauth`; `examples/reference-web` `@jini-ai/mcp`, `@modelcontextprotocol/{ext-apps,sdk}`, `vite-plugin-singlefile`; `jsdom`(agentic), `vue`(ui-kit), `tailwindcss`(ui), `dependency-cruiser`(root). Low risk. `argon2` (user-management) is flagged but IS used in source and is a peer dep → probably a knip false positive.
5. **Jini "unlisted" + "unresolved" are noise** (see §4): they come from `agent-plugins/ui-ux-design/skills/shadcn-ui/examples/*`, remotion templates, and `kernel-core.ts` where knip misread a local `require("interactiveTransactions")` helper.

### SonarJS
Almost everything is style. Items worth a look:
1. **`apps/desktop/src/renderer/source-test-harness.ts:15` — `new Function(...)` (code-eval).** Test-harness helper that compiles a component's own source. Not shipped logic → fine; just ensure it's never bundled into the app. High confidence benign.
2. **Weak SHA-1 hashing:** `content/agent-plugins/netlify/targets/netlify.mjs:217`, `vercel/targets/vercel.mjs:70`. Used to compute file digests for Netlify/Vercel deploy APIs, which *require* SHA-1. Benign (high).
3. **`Math.random()` flagged (pseudo-random): Tovu 7, Jini 9.** Real uses are non-secret IDs: temp-file names (`platform/src/fs.ts:103`), order ids (`commerce/src/store/store-plugin.ts:108`), lease owner (`serving-app.ts:68`), UUID fallback (`ui/src/utils/uuid.ts:48`). Worth confirming `commerce` order ids and `memory/note-store.ts:297` are not used as auth/secret tokens. Medium-low.
4. **11× OS command found via PATH** (Tovu: `desktop/src/tovu-server.ts:628`, `site-process-registry.ts:379/402`, `external-site-stop.ts:154`, `website/.../secret-scan-guard.ts:158/296/306/322`, `daemon-supervisor.ts:137`). Standard "spawn('git'/'lsof'…) trusts PATH" notice; only matters if an attacker controls PATH. Low; **mark as security-adjacent** for desktop.
5. **`sonarjs/arguments-order` `admin/src/lib/execution-settings.ts:478`** — looked like a swapped-args bug; I read it: it's an intentional rollback (`changedLedgerEntries(previous, next)`). False positive.
6. `sonarjs/no-empty-collection` `server/runtime/composition/app.ts:1835` — WeakMap is filled elsewhere (exported at :1714). False positive.
7. `no-inverted-boolean-check` (`publish-trust/challenge.ts:148`, `site-preview-service.ts:79`): `!(a > b)` is deliberate NaN-safe fail-closed (bad date ⇒ treated as expired). Do NOT "simplify" — it would be a security regression.

### Semgrep (substitute run, see §6)
1. **`apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts:97,107,121,124,133` — `postMessage(..., "*")`.** The frame is `sandbox="allow-scripts"` with an opaque origin (`AgentPluginSurfaceFrame.tsx`), where `"*"` is required; inbound messages are validated. Benign, high confidence. **Security-sensitive area — keep reviewed.**
2. **`apps/site-chat/src/vanilla-host.ts:44` — `template.innerHTML = micromark(content…)`** on visitor-supplied text. Code comment says allowDangerousHtml is off and a filter pass follows. Looks correctly hardened; **security-sensitive**, worth one targeted test with `<img onerror>` / `javascript:` payloads. Medium confidence it's safe.
3. **`website/.../routes/site/store.ts:49,68`** HTML built by string concat: user input goes through `escapeHtml` (checked `req.query.msg`). Safe as read; second site (`:68`) not fully traced. **Security-sensitive.**
4. **`website/src/features/theme/preview-switcher-html.ts:111`** injects a `<script>` from a constant `BANNER_SCRIPT`. Benign.
5. **`packages/admin/src/media/react/components/MediaCard.tsx:14` (Jini) — `<a href={vm.src}>`** with a non-literal URL; if `src` can ever come from user data a `javascript:` URL would execute on click. I did not trace where `src` originates. Low–medium; **security-sensitive** — check it's http(s)/relative only.
6. `chat/src/embed-widget/browser/lazy-loader.ts:44,77` and `ui/src/utils/markdown-scroll-sync.ts:207` set `innerHTML`: first from a trusted constant, second from an internally-built mirror (verify it escapes text). Low.
7. No real secrets: all `detected-private-key`/`aws-access-token`/`generic-api-key` hits (7/4/61 in Jini) are in test fixtures/redaction tests or i18n labels. I did not exhaustively open each of the 61/53 generic-api-key hits (INFO).

## 4. Noise — safe to ignore (counts)
- **depcruise:** `no-deep-imports` (Tovu 2,095; ~half are warnings, many in tests) is a "use the public barrel" convention, not a bug. 1,140 of these are errors — a big migration job, not an urgent one.
- **knip:** unused *exported types* (Tovu 2,462 / Jini 313) and unused exports (962 / 170) — mostly public-API surface and `default` re-exports; Jini "Referenced optional peerDependencies" (137) and "Configuration hints" (545) are tool-config chatter; Jini unlisted/unresolved (31) are sample/template files inside skills.
- **SonarJS:** `prefer-read-only-props` 566 (Tovu), `no-nested-conditional` 139/205, `expression-complexity` 138/158, `no-nested-incdec` 31/164, `no-unenclosed-multiline-block` 108 (Jini — one-line `if (x) return; next();` style, not bugs), `no-nested-template-literals` 94/71, `no-redundant-optional` 93, `no-inconsistent-returns` 87/129, `elseif-without-else` 54/111, `too-many-break-or-continue` 69/111, `no-duplicate-string` 76/46, `todo-tag`, `concise-regex`. `no-hardcoded-passwords` 44 (Tovu) — all i18n *labels* (users-i18n.ts etc.), not secrets. `different-types-comparison` 54 — TS type-narrowing false positives (`x === undefined` on a `Record` lookup, `e.target === ref`). `no-collection-size-mischeck` 2 (Jini) — `entry.size < 0` is a numeric size, not a collection. `super-linear-regex` (51 / 152) — advisory; the ones I inspected are linear patterns.
- **Semgrep (substitute):** `i18next-key-format` 1,933/1,354, `missing-template-string-indicator` 1,925/1,398, `react-props-spreading` 818/1,384, `jsx-not-internationalized` 223/528, `html-in-template-string` 614/303, `no-stringify-keys` 221/87, `detect-non-literal-regexp`, `no-replaceall`, `unsafe-dynamic-method`, `detect-redos` (22/30 — spot-checked ones are simple linear regexes), `useless-ternary`, `insecure-innerhtml/document-method` ERRORs (8 / 12 — almost all in test files). These come from generic community rules, not a security pack.

## 5. Recommendations
| Tool | Act? | Smallest next step | Effort |
|---|---|---|---|
| depcruise (Tovu) | Partly | Fix the 3 `domain-no-direct-assistant-tool-registration` errors; stop the count from growing (ratchet/baseline in CI) | S |
| depcruise (Jini) | Low | Keep as-is; maybe break the 56 cycles opportunistically | M |
| knip | Yes (narrow) | Declare `esbuild`, `@jini-ai/protocol`, `@tiptap/*` in the owning package.json; remove ~9 clearly unused deps. Ignore export/type counts | S |
| SonarJS | Mostly no | Keep, but whitelist 6–8 bug-class rules (e.g. `no-collection-size-mischeck`, `no-dead-store`, `no-invariant-returns`, `no-incorrect-string-concat`) and silence the style rules to cut noise | S |
| Semgrep | Yes, **security-sensitive** | Get the real configured packs running (network/Docker, §6); then review `vanilla-host.ts:44`, `store.ts:68`, `MediaCard.tsx:14` | M |

## 6. What failed / caveats
- **Semgrep official run FAILED on both repos:** the scripts pull rule packs (`p/typescript`, `p/owasp-top-ten`, `p/secrets`…) from `semgrep.dev`, which the sandbox proxy blocks (HTTP 403). Tovu's script additionally needs a pinned Docker image. First error lines are in `semgrep-official-run-error.txt`. **Substitute:** I cloned `semgrep/semgrep-rules` from GitHub and scanned with its `typescript`, `javascript`, `generic/secrets` dirs (Semgrep 1.182.0). That is NOT the same ruleset as `p/owasp-top-ten`/`p/nodejs`, so the numbers are not comparable to a future official run; it also ran 110 (Tovu) / 164 (Jini) rule-level errors, 45 of them timeouts on large files, so coverage is incomplete. Custom rules under `.semgrep/` were not run (they are tests dirs only).
- **Tovu knip first attempt failed** (`Cannot find module '@vitejs/plugin-react'` in `apps/site-chat` then `apps/desktop`): those two apps' deps weren't covered by the specified setup. I ran `npm ci` in `apps/site-chat` and `apps/desktop` (install only, no source change) and re-linked Jini; knip then ran. This is probably why the baseline's "92 unused deps" differs from today's 9 — I can't tell whether yesterday's run had the same gap. First-attempt output: `tovu-knip-firstattempt-error.txt`.
- Tovu SonarJS: 64 files hit parse/config errors (baseline 65) — not analysed.
- The SonarJS formatter only prints rule counts, so I re-ran eslint with JSON output (same configs) to get file:line (raw gz files included).
- Jini `pnpm quality:depcruise` / `quality:knip` exit codes were 0 (report-only); Tovu depcruise exits 119 and knip 1 because of findings — expected.
- `git status` in both repos shows only the untracked/ignored installs; no tracked file was modified. Only the report branch is committed.
