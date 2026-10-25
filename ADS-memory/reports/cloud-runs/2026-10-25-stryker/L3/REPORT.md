# L3 — Stryker measure-only: Jini `packages/mcp` + `packages/agent-runtime` (Jini @ 3e2fbae8)

Report only; no source/test edits. Config: vitest runner (package's own), perTest coverage, concurrency 3, incremental, StringLiteral excluded, type checks off, typescript 5, Stryker 9.

## 1. Headline — packages/mcp (DONE)
- 46 files / 5116 mutants instrumented (excl. `index.ts` barrels, `testing/` fakes, tests). 944 ignored (StringLiteral exclusion) → 4172 scored.
- Killed 3724 · Timeout 11 · Survived 434 · NoCoverage 3 · RuntimeError 1 → **score 89.5 %**.
- Dry run 1320 tests / 30 s; mutation phase 26 m 25 s (~6.3 s/10 mutants at concurrency 3 on 4 cores).

## 2. Suspected source bugs
None found. (Survivors below are test gaps; nothing observed behaving wrongly.)

## 3. Per-file table, mcp (worst first; score = (killed+timeout)/(scored))
| file | mutants | surv | noCov | score |
|---|---|---|---|---|
| server/tools/component-catalog-tools.ts | 50 | 10 | 0 | 64.3 |
| server/tools/run-tools.ts | 130 | 25 | 0 | 70.2 |
| client/client.ts | 276 | 72 | 0 | 72.8 |
| server/resources/site-guide-resource.ts | 36 | 6 | 0 | 76.0 |
| federation/approvals/scope-option.ts | 5 | 1 | 0 | 80.0 |
| federation/adapter.http.ts | 268 | 39 | 0 | 82.4 |
| server/message-relay.ts | 59 | 7 | 0 | 83.7 |
| server/tools/tool-catalog-tools.ts | 95 | 8 | 0 | 87.1 |
| federation/stdio/adapter.stdio.ts | 294 | 29 | 0 | 87.7 |
| agent-install/install.ts | 290 | 18 | 0 | 88.0 |
| core/tokens.ts | 150 | 15 | 0 | 88.4 |
| core/config.ts | 457 | 42 | 0 | 89.3 |
| tools/ask-choice/question.ts | 264 | 21 | 0 | 89.3 |
| bin/serve.ts | 175 | 12 | 3 | 89.4 |
| server/tool-protocol.ts | 140 | 12 | 0 | 90.4 |
| server/resource-protocol.ts | 35 | 3 | 0 | 90.9 |
| federation/bootstrap.ts | 100 | 8 | 0 | 91.0 |
| federation/reload.ts | 35 | 3 | 0 | 91.4 |
| federation/tool-approvals.ts | 48 | 3 | 0 | 91.7 |
| federation/registrations.ts | 105 | 8 | 0 | 91.8 |
| server/tool-server.ts | 178 | 14 | 0 | 91.9 |
| federation/trust.ts | 501 | 32 | 0 | 92.2 |
| federation/approvals/remembered-approval.ts | 133 | 9 | 0 | 93.0 |
| server/daemon-client.ts | 198 | 10 | 0 | 94.0 |
| server/tools/delegated-tool.ts | 125 | 6 | 0 | 94.1 |
| federation/refusal-notice.ts | 66 | 3 | 0 | 94.7 |
| federation/stdio/default-connect.ts | 46 | 2 | 0 | 95.5 |
| federation/approvals/call-confirmation.ts | 91 | 3 | 0 | 96.3 |
| federation/mcp-protocol.ts | 131 | 4 | 0 | 96.6 |
| federation/config.ts | 38 | 1 | 0 | 96.7 |
| server/tool-arguments.ts | 150 | 4 | 0 | 96.8 |
| tools/ask-choice/pending.ts | 42 | 1 | 0 | 97.5 |
| federation/approvals/revocation.ts | 59 | 1 | 0 | 98.0 |
| federation/stdio/stdio-launch-resolver.ts | 207 | 2 | 0 | 98.8 |
| 8 files (chrome-devtools, install-info, revocation-reason, messages, ports, active-resource, presets, sdk-transport) | 139 | 0 | 0 | 100 |

## 4. Triaged survivors, mcp (bucket a = real test gap, b = equivalent/low value)
- **component-catalog-tools.ts, message-relay.ts, tool-catalog-tools.ts, run-tools.ts (34–50 % of survivors):** `inputSchema`/`properties`/`annotations` ObjectLiteral→`{}`, `required:[…]`→`[]`, `additionalProperties:false→true`. (a) No test asserts the advertised tool schema/annotations (readOnlyHint etc.). Add a snapshot/`toEqual` of each tool descriptor; matters because the schema is the model-facing contract and annotations drive approval UX.
- **run-tools.ts:24,56,58,100:** `typeof value==='string' && length>0` → `true`; `if (x !== undefined) body.x = x` → `true`: (a) tests never pass empty-string / omitted agentId, idempotencyKey, reason, so the request body may gain `undefined` keys. Assert exact body for omitted optionals. 123: `err?.status` → `err.status` (a) null-error case untested.
- **client.ts (72, 54 are Regex):** URL/ref extraction regexes (`JS_REF_PATTERNS`, `SRCSET_PATTERN`, `isJsLike` `$` anchor at 180) mutated without failures: (a) only happy-path refs tested; need negative cases (prose "imported from 'X'", non-JS paths ending `.jsx.bak`, multi-candidate srcset). Also 42: idleMs validation `||` chain (non-integer / NaN / Infinity each need a case); 76/86/98 `disposed` flag (double-dispose, use-after-dispose); 113 `inFlight===0`; 146 `if(!mime)`.
- **adapter.http.ts:** 79/282 `{once:true}` abort listeners (listener-leak, (a) low-risk); 195 `finally {}` emptied (a) cleanup not asserted; 223 `serverProtocolVersion || CLIENT_PROTOCOL_VERSION` (a) fallback header untested; 278 `!hook || signal.aborted` (a) pre-aborted signal untested.
- **adapter.stdio.ts:101-103:** Windows-path detection regexes and `.cmd/.exe` stripping (a) — no Windows-style command (`C:\x\npx.cmd`) cases; security-relevant because command identity is basis for allow/deny.
- **core/config.ts:115 & core/tokens.ts:127:** `k==='__proto__' || 'constructor'` guards → `false` survive: **(a) HIGH — prototype-pollution guard has no test** (feed `{"__proto__":…}` / `constructor` keys through persisted config/tokens). **config.ts:90 / tokens.ts:105:** `writeSecretText` option booleans (`verifyOwnerOnly:true→false`, `createParent:true→false`): (a) HIGH — secret-file permission verification is never asserted at this layer (mode 0o600 itself is a numeric literal, unmutated). Also tokens.ts:140 `Number.isFinite` → `true`, 115 object check.
- **bin/serve.ts:213-215 (NoCoverage, 3):** the `^[a-f0-9]{48}$` relay-nonce validation and its error exit are executed by no test (a) HIGH — auth-nonce gate untested; plus 213 cond→false survives.
- **trust.ts (92.2 %):** 264 federated-prefix guard→false, 393/413 depth/null guards, 418 `depth+1→-1` (recursion-depth cap untested), 373/375 camelCase-split regex (write-shaped name heuristics), 481 array walk. (a) — write-shaped-tool detection classifier needs adversarial cases (deep nesting beyond WRITE_SHAPED_MAX_DEPTH, names like `HTMLParser`, arrays of nested objects).
- **install.ts:** `removeArgv: ['mcp','remove',name]`→`[]` (203/211) and copilot/cline jsonPlan keys → `[]` (a): uninstall argv / config-path arrays never asserted.
- **question.ts (21), site-guide-resource.ts:20:** validation conjunction mutated to `false`/`&&` survives — (a) each clause (non-object, empty label, non-array options) lacks its own rejecting case.
- Other files (≤14 survivors each): not individually triaged; dominant mutators ConditionalExpression > ObjectLiteral > Regex > BooleanLiteral. Raw JSON kept at `/root/stryker/reports/mcp.json` (container only; 3.8 MB, not committed).

## 5. No-coverage ranges, mcp
- `src/bin/serve.ts:213–215` (relay nonce check + error write + `exit({code:1})`). Only no-coverage mutants (3). Package runs 100 % coverage thresholds, which is why NoCoverage is near zero.

## 6. NOT RUN, mcp
Excluded by design: `index.ts` barrels, `src/**/testing/*` (in-memory fakes), tests. Not triaged individually: survivors in the ~20 files scoring ≥ 90 %.

AGENT-RUNTIME SECTION FOLLOWS (appended when done).
