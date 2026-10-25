# L10 — StrykerJS measure-only: Jini tooling + admin logic

Report-only run; no source or test edits (Jini clone `cloud/overnight-1024-jini`; only untracked `vitest.stryker.config.ts` per package, see §7). Config: vitest runner, `coverageAnalysis: perTest`, concurrency 3, `incremental`, `StringLiteral` excluded, type checks off.

## 1. Headline
| package | mutants run | killed (incl. timeout) | survived | no-coverage | score |
|---|---|---|---|---|---|
| vibecoding | 2260 | 1487 | 348 | 89 | 77.29% |
| cli | 1635 | 1175 | 181 | 0 | 86.65% |
| artifacts | 946 | 717 | 89 | 0 | 88.96% |
| analytics | 642 | 487 | 54 | 0 | 90.02% |
| diagnostics | 3179 | 2425 | 282 | 2 | 89.52% |
| desktop-host | 3040 | 2304 | 287 | 5 | 88.75% |

**Total: 11702 mutants run, 8595 killed, 1241 survived, 96 no-coverage; aggregate score 86.5%.** Wall ≈ 4 h budget; Stryker machine time ≈ 2 h 40 m (desktop-host 54 m, admin batch A last). Packages run in full: analytics, cli, artifacts, vibecoding, diagnostics, desktop-host. `packages/admin` was NOT run in full — 10,748 mutants projected at ~8 h (measured: 2% in 10 min incl. a 4-min dry run, 2498 tests); a risk-ordered subset (batch A) was run instead — see §6.

## 2. Suspected source bugs
**None found.** No survivor looks like a behaviour defect; all are weak/absent assertions. The sharpest *security-adjacent test gaps* (not bugs) are listed in §8, e.g. symlink refusal in vibecoding `node/store.ts` and default-deny flags in diagnostics `request-guard.ts`.


## 3. Per-file tables (worst score first)

### vibecoding
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/core/project.ts | 3 | 1 | 1 | 0 | 0 | 50.0% |
| src/node/store.ts | 672 | 362 | 196 | 27 | 2 | 61.9% |
| src/react/use-vibecoding-session.ts | 17 | 11 | 6 | 0 | 0 | 64.7% |
| src/node/project.ts | 453 | 248 | 62 | 61 | 0 | 66.8% |
| src/node/paths.ts | 180 | 121 | 25 | 0 | 1 | 82.9% |
| src/session.ts | 106 | 83 | 14 | 0 | 2 | 85.6% |
| src/html/node/parse5-region-parser.ts | 250 | 168 | 21 | 1 | 2 | 88.4% |
| src/tools.ts | 118 | 88 | 8 | 0 | 0 | 91.7% |
| src/html/edit.ts | 160 | 135 | 7 | 0 | 0 | 95.1% |
| src/html/regions.ts | 163 | 145 | 7 | 0 | 0 | 95.4% |
| src/core/history.ts | 103 | 95 | 1 | 0 | 1 | 99.0% |
| src/core/apply.ts | 35 | 30 | 0 | 0 | 0 | 100.0% |

### cli
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/version-command.ts | 79 | 47 | 20 | 0 | 0 | 70.1% |
| src/daemon-command.ts | 97 | 52 | 22 | 0 | 0 | 70.3% |
| src/run-command.ts | 340 | 204 | 58 | 0 | 2 | 77.9% |
| src/prompt.ts | 160 | 102 | 23 | 0 | 0 | 81.6% |
| src/redact.ts | 35 | 28 | 4 | 0 | 0 | 87.5% |
| src/main.ts | 178 | 134 | 16 | 0 | 2 | 89.3% |
| src/introspection.ts | 62 | 47 | 5 | 0 | 0 | 90.4% |
| src/errors.ts | 110 | 88 | 9 | 0 | 0 | 90.7% |
| src/http.ts | 260 | 203 | 15 | 0 | 2 | 93.1% |
| src/flags.ts | 130 | 115 | 6 | 0 | 2 | 95.0% |
| src/daemon-url.ts | 73 | 63 | 2 | 0 | 0 | 96.9% |
| src/command-registry.ts | 64 | 56 | 1 | 0 | 1 | 98.2% |
| src/local-daemon-discovery.ts | 14 | 11 | 0 | 0 | 0 | 100.0% |
| src/tokens.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/usage.ts | 31 | 24 | 0 | 0 | 0 | 100.0% |

### artifacts
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/tokens.ts | 2 | 0 | 1 | 0 | 0 | 0.0% |
| src/node/stub-guard.ts | 148 | 107 | 21 | 0 | 2 | 83.6% |
| src/text-suppression.ts | 219 | 170 | 25 | 0 | 6 | 87.2% |
| src/manifest.ts | 331 | 248 | 30 | 0 | 0 | 89.2% |
| src/store.ts | 52 | 41 | 3 | 0 | 0 | 93.2% |
| src/publication-guard.ts | 56 | 45 | 3 | 0 | 0 | 93.8% |
| src/stub-guard.ts | 133 | 101 | 6 | 0 | 0 | 94.4% |
| src/runtime-compat.ts | 5 | 5 | 0 | 0 | 0 | 100.0% |

### analytics
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/ingest.ts | 435 | 315 | 45 | 0 | 1 | 87.5% |
| src/repo.memory.ts | 25 | 22 | 3 | 0 | 0 | 88.0% |
| src/forwarding.ts | 164 | 137 | 6 | 0 | 0 | 95.8% |
| src/salt.ts | 17 | 12 | 0 | 0 | 0 | 100.0% |
| src/ports.ts | 1 | 1 | 0 | 0 | 0 | 100.0% |

### diagnostics
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/web-evidence/lazy-browser.ts | 93 | 71 | 17 | 0 | 0 | 80.7% |
| src/web-evidence/public-page.ts | 307 | 236 | 52 | 1 | 0 | 81.7% |
| src/observability/config.ts | 33 | 24 | 5 | 0 | 0 | 82.8% |
| src/redaction.ts | 92 | 61 | 11 | 0 | 0 | 84.7% |
| src/web-evidence/page-work-budget.ts | 55 | 44 | 7 | 0 | 0 | 86.3% |
| src/core/secrets-only.ts | 598 | 440 | 68 | 0 | 0 | 86.6% |
| src/web-evidence/playwright-runtime.ts | 34 | 21 | 3 | 0 | 0 | 87.5% |
| src/web-evidence/render-page.ts | 296 | 233 | 29 | 1 | 3 | 88.6% |
| src/observability/otel.ts | 156 | 118 | 14 | 0 | 0 | 89.4% |
| src/discovery-filesystem.ts | 10 | 9 | 1 | 0 | 0 | 90.0% |
| src/web-evidence/collect-page-evidence.ts | 163 | 119 | 13 | 0 | 0 | 90.2% |
| src/web-evidence/playwright-browser.ts | 157 | 121 | 11 | 0 | 0 | 91.7% |
| src/web-evidence/same-origin.ts | 88 | 56 | 5 | 0 | 0 | 91.8% |
| src/domain-dns/index.ts | 235 | 186 | 15 | 0 | 0 | 92.5% |
| src/observability/instrumentation.ts | 170 | 133 | 8 | 0 | 0 | 94.3% |
| src/web-evidence/request-guard.ts | 351 | 267 | 16 | 0 | 1 | 94.3% |
| src/manifest.ts | 22 | 17 | 1 | 0 | 0 | 94.4% |
| src/node-ports.ts | 46 | 40 | 2 | 0 | 0 | 95.2% |
| src/zip.ts | 25 | 20 | 1 | 0 | 0 | 95.2% |
| src/observability/hooks.ts | 24 | 23 | 1 | 0 | 0 | 95.8% |
| src/sources.ts | 71 | 63 | 1 | 0 | 0 | 98.4% |
| src/agent-logs.ts | 131 | 104 | 1 | 0 | 0 | 99.0% |
| src/contract.ts | 3 | 0 | 0 | 0 | 0 | 100.0% |
| src/observability/index.ts | 5 | 5 | 0 | 0 | 0 | 100.0% |
| src/observability/node.ts | 4 | 4 | 0 | 0 | 0 | 100.0% |
| src/observability/noop.ts | 10 | 10 | 0 | 0 | 0 | 100.0% |

### desktop-host
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/electron/electron-protocol.ts | 17 | 8 | 9 | 0 | 0 | 47.1% |
| src/electron/create-electron-desktop-host.ts | 15 | 9 | 5 | 0 | 0 | 64.3% |
| src/electron/electron-window-lifecycle.ts | 32 | 20 | 11 | 0 | 0 | 64.5% |
| src/render-service.ts | 87 | 47 | 23 | 0 | 0 | 67.1% |
| src/electron/electron-render-service.ts | 33 | 21 | 10 | 0 | 0 | 67.7% |
| src/tauri/tauri-protocol.ts | 5 | 3 | 1 | 0 | 0 | 75.0% |
| src/tauri/tauri-window-lifecycle.ts | 39 | 30 | 8 | 0 | 0 | 78.9% |
| src/electron/usability/window-bounds-store.ts | 60 | 46 | 12 | 0 | 0 | 79.3% |
| src/sidecar.ts | 124 | 83 | 20 | 0 | 3 | 80.6% |
| src/protocol.ts | 25 | 17 | 4 | 0 | 0 | 81.0% |
| src/tauri/tauri-sidecar.ts | 68 | 51 | 11 | 0 | 2 | 82.3% |
| src/windows-registry.ts | 49 | 30 | 6 | 0 | 0 | 83.3% |
| src/tauri/testing.ts | 85 | 70 | 12 | 1 | 0 | 84.3% |
| src/electron/navigation-policy/webview-guest-policy.ts | 30 | 23 | 4 | 0 | 0 | 85.2% |
| src/tauri/tauri-render-service.ts | 11 | 6 | 1 | 0 | 0 | 85.7% |
| src/electron/testing.ts | 101 | 80 | 13 | 0 | 0 | 86.0% |
| src/bridge-testing.ts | 46 | 38 | 6 | 0 | 0 | 86.4% |
| src/speech/macos/mac-on-device-transcriber.ts | 174 | 137 | 20 | 0 | 0 | 87.3% |
| src/speech/speech-bridge.ts | 8 | 7 | 1 | 0 | 0 | 87.5% |
| src/paths.ts | 98 | 69 | 9 | 0 | 0 | 88.5% |
| src/speech/pcm-wav-encoder.ts | 34 | 23 | 3 | 0 | 1 | 88.5% |
| src/url-capture.ts | 90 | 46 | 6 | 0 | 0 | 88.5% |
| src/electron/usability/find-in-page-ipc.ts | 30 | 24 | 3 | 0 | 0 | 88.9% |
| src/electron/updates/instance-presence.ts | 71 | 58 | 7 | 0 | 0 | 89.2% |
| src/logging.ts | 157 | 116 | 14 | 0 | 0 | 89.2% |
| src/electron/electron-url-capture.ts | 118 | 87 | 9 | 1 | 1 | 89.7% |
| src/tauri/tauri-shell.ts | 33 | 28 | 3 | 0 | 0 | 90.3% |
| src/speech/speech-ipc.ts | 71 | 63 | 6 | 0 | 0 | 91.3% |
| src/shutdown/quit-signals.ts | 15 | 11 | 1 | 0 | 0 | 91.7% |
| src/tauri/create-tauri-desktop-host.ts | 14 | 12 | 1 | 0 | 0 | 92.3% |
| src/electron/updates/auto-update-controller.ts | 232 | 199 | 16 | 0 | 0 | 92.6% |
| src/window-lifecycle.ts | 15 | 14 | 1 | 0 | 0 | 93.3% |
| src/config.ts | 32 | 29 | 2 | 0 | 0 | 93.5% |
| src/render-bridge.ts | 213 | 144 | 9 | 0 | 0 | 94.1% |
| src/electron/render-window.ts | 73 | 60 | 3 | 0 | 0 | 95.2% |
| src/node-toolchain/index.ts | 158 | 100 | 5 | 0 | 0 | 95.2% |
| src/electron/usability/spellcheck-menu.ts | 69 | 61 | 0 | 3 | 0 | 95.3% |
| src/electron/updates/update-policy.ts | 94 | 82 | 4 | 0 | 0 | 95.3% |
| src/electron/electron-shell.ts | 30 | 28 | 1 | 0 | 0 | 96.6% |
| src/bridge.ts | 136 | 120 | 4 | 0 | 0 | 96.8% |
| src/electron/navigation-policy/window-navigation-policy.ts | 112 | 97 | 3 | 0 | 0 | 97.0% |
| src/electron/electron-single-instance.ts | 8 | 7 | 0 | 0 | 0 | 100.0% |
| src/electron/usability/find-menu.ts | 18 | 17 | 0 | 0 | 0 | 100.0% |
| src/electron/usability/zoom-menu.ts | 34 | 26 | 0 | 0 | 0 | 100.0% |
| src/shell.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/shutdown/quit-drain-gate.ts | 13 | 5 | 0 | 0 | 0 | 100.0% |
| src/speech/channels.ts | 4 | 2 | 0 | 0 | 0 | 100.0% |
| src/speech/transcription-port.ts | 14 | 13 | 0 | 0 | 0 | 100.0% |
| src/tauri/not-implemented.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/tokens.ts | 12 | 6 | 0 | 0 | 0 | 100.0% |
| src/shutdown/shutdown-tracker.ts | 11 | 11 | 0 | 0 | 5 | 100.0% |
| src/single-instance.ts | 12 | 12 | 0 | 0 | 0 | 100.0% |
| src/tauri/tauri-single-instance.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |

## 4. Triaged survivors (full per-file listings with line:col + original → mutant in `raw/summ-<pkg>.md`; (a) real gap, (b) equivalent, (c) noise)
### vibecoding (77.3%, worst package — 89 no-coverage)
- `node/store.ts` (61.9%, 196 survivors): (a) **corrupt-state validators are almost untested** — `checkManifestFile`/`checkObserved`/`checkFingerprint`/`checkPending` conditions at 102–143 all flip to `false` unnoticed: need tests feeding corrupt `current.json`/manifest (non-array files, negative/unsafe size, non-object fingerprint, malformed `pending`, wrong `root`/`generation`) and asserting `CORRUPT`. (a) manifest digest mismatch (180) and object content size/hash mismatch (190) are not asserted. (a) tree limits at 233/245 (`truncated`, `total > maxTreeBytes`, `files.size >= maxFiles`) and `generation === MAX_SAFE_INTEGER` (399) have no boundary tests. (a) **`refuseSymlink: true` → `false` (318) and `info.isSymbolicLink()` branch at 72 survive** — no test proves a symlinked path component/file is refused on write. (a) conflict check `sameFingerprint` (261) mtime/ctime branches. (b/c) `[...folders]` copies / `sort` comparators at 198/281/299/332 (ordering of directory removal only visible with nested folders) — (a) low risk.
- `node/project.ts` (66.8%): (a) boundary checks `>` vs `>=` on `maxChanges`/`maxFileBytes` (36, 55, 57); `create` of an existing path not rejected-asserted (52); `assertCandidatePaths` receives `[]` instead of the file list (44) — path validation of pre-existing files not asserted; 61 no-coverage mutants (lines 77–79, 90–91, 102, 130, 144, 151–153, 185–186, 242–243, 259, 264–277, 293–312, 321, 328) = error/rollback branches no test reaches.
- `node/paths.ts` (82.9%): (a) case-fold key `path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase()` (21) — no test with chars whose fold depends on the full chain (e.g. `İ`, `ß`, Kelvin sign); limits validation (28–29): negative/zero/non-integer limit values not each tested.
- `react/use-vibecoding-session.ts` (64.7%, hook, included because it is `.ts`): `useCallback` dependency arrays `[session]` → `[]` survive (session-switch tests do not detect stale closures for `readPart`/`undo`/`refresh`).
- `core/project.ts` 1 survivor: `{cause}` option dropped from the Error (c). `session.ts` 14, `parse5-region-parser.ts` 21: mostly guard conditions (a).
### diagnostics (89.5%)
- `redaction.ts` (84.7%, all 11 survivors are Regex): (a) URL-query / bare / HTTP-auth secret regexes lose `?` quantifiers and anchors with no failing test: add cases `api-key=` vs `apikey=` vs `api_key=`, secrets after `;`/`,`/whitespace/start, `Bearer` with tab/newline/multiple spaces.
- `core/secrets-only.ts` (86.6%, 68 survivors): (a) PRIVATE KEY block with and without END marker (59); header/cookie/`set-cookie` lookbehind (77, 82); URL basic-auth `user:pass@` (92); `whsec_`/`ghp_`/`sk-ant-`/`ASIA…` tokens' left-boundary lookbehinds and min lengths (103–133) — need "preceded by an identifier char → NOT redacted" and "exactly N / N-1 chars" cases; entropy gate (221–229); JS-token escape decoding `\x`/`\u`/octal/line-continuation (308–310); Bearer after-adjacent logic (290–292); previous-token window (`previous.length > 4`, 345). `sk-ant` replacement fn `() => "[REDACTED:anthropic_key]"` → `undefined` (124) survives: replacement output text not asserted.
- `web-evidence/request-guard.ts` (94.3%) but with **security-default survivors**: `allowDataRequests = false → true` (104, 263), `preserveOwnSiteCookies = false` default (263), budget boundary `report.bytes >= maxTotalBytes` vs `>` (233, 247), redirect-status gate (179).
- `web-evidence/public-page.ts` (81.7%, 52 survivors): wildcard URL matcher offset arithmetic (35–41), content-type header lookup case-insensitivity (52); `lazy-browser.ts` (80.7%): idle-timer/refcount (`active - 1`, `Math.max(0,…)`, release-once) not asserted. `same-origin.ts`: path-length boundary (75), scheme regex anchor (90), slash-trimming regexes (179–180). `observability/config.ts`: `.trim()` removals on serviceName/tracerName/endpoint (17–24).
### cli (86.7%)
- `version-command.ts` / `daemon-command.ts` / `run-command.ts` (70–78%): ~80% of survivors are the optional-dep forwarding pattern `...(deps.x !== undefined ? {x: deps.x} : {})` → `true`/`false`/`{}` and `deps.writeErr ?? defaultWriteErr` → `&&`: (b/c) largely equivalent (an `undefined` value spread behaves like absence); (a) only real gap = no test injects a custom `writeErr`/`exit`/`exitCodes` through these three entry points and asserts it is used. `run-command.ts` ObjectLiteral ×27 are option-bag `{}` replacements (c).
- `prompt.ts` (81.6%): (a) **stdin size cap boundary** `total > maxBytes` vs `>=` (173) and the PayloadTooLarge error contents (176); `settled` double-settle guard (126–127); abort reason fallthrough (186); `pause?.()` (169). `redact.ts` (87.5%): depth (`> MAX_SANITIZE_DEPTH`, 36) and entry-cap (39) boundaries and `depth - 1` recursion not asserted; key sanitizing maxLength option (44). `errors.ts` (90.7%): daemon error-body parsing guards (103, 112, 115, 146, 157) — non-object/`null` JSON bodies. `flags.ts`: `--x=` inline-equals (`eq >= 0` vs `> 0`, 61, 178), boolean-flag consumption (73–79), numeric-literal regex anchors (126). `http.ts`: content-length precheck (97–98), empty-body → `{}` (133), `body.getReader` stream path (152), sandbox-denial code check (69). `main.ts`: `--help/-h/-v` argv shortcuts (208, 214), `--flag=value` global parsing (174–178).
### artifacts (89.0%)
- `node/stub-guard.ts` (83.6%): (a) sidecar read limits: `info.isFile()`/`size > maxBytes` (48), `length > maxBytes` (58), `> MAX_SIDECAR_BYTES` (90) boundaries, `parsed?.metadata?.identifier` optional chaining (92) with missing `metadata`, non-string identifier (93).
- `text-suppression.ts` (87.2%): empty text early return (68), `index >= min` window edge (154), `>` char guard (166), prefix/suffix canonical match `some`→`every` (185). `manifest.ts` (89.2%): plain-object guard (81–83: arrays/class instances/null-proto), max-length boundaries `>` vs `>=` (94, 101), Windows drive-letter regex anchor (105), `..` traversal (109) cases. `tokens.ts` 0% = `{id}` ObjectLiteral on a DI token (c, equivalent unless id is asserted).
### analytics (90.0%)
- `ingest.ts` (87.5%, 45 survivors): (a) IPv6 coarse-bucketing: `expandIpv6Groups` ("::" handling 235–242: leading/trailing "::", empty groups filter, zero-fill arithmetic), IPv4-mapped regex (248), bracketed `[::1]` unwrapping (291) — privacy truncation depends on these; (a) CIDR check `ip.includes(":")`/`NaN prefix`/octet range (436–448) for bot/IP filters; (a) `decodeURIComponent` failure fallback (61); email-shaped PII regex anchors/classes (57); referrer null (480), UTM `queryIndex === -1` (497); `validateEventPropEntry({pending: []})` (514). `repo.memory.ts`: list limit `||`→`&&` (30) — NaN/undefined limit; `initialHits` copy (43). `forwarding.ts`: forwarder shape guards (74, 85), `limiter.tryAcquire` negation (204: dropped-event report), `structuredClone` on non-null props (67), `cached?.value` (281).
### desktop-host (88.7%)
- Thin Electron/Tauri adapters are the weak spots: `electron/electron-protocol.ts` 47% (scheme privileges `standard/secure/corsEnabled/supportFetchAPI` flags and the `registerSchemesAsPrivileged` argument shape unasserted), `electron-window-lifecycle.ts` 64.5% (`show ?? false` default, delegating `show/hide/focus`), `create-electron-desktop-host.ts` 64%, `electron-render-service.ts` 68%, `tauri/*` 75–83%.
- `render-service.ts` (67.1%, 23): (a) **`allowedOrigins ?? []` default-deny not asserted (92)**, timeout/abort settle-once logic (105–147): `settled` guard, clearTimeout when timer set, abort listener `{once:true}` / removal.
- `sidecar.ts` 80.6% (3 timeouts), `window-bounds-store.ts` 79.3%, `protocol.ts` 81%, `windows-registry.ts` 83%, `url-capture.ts`, `logging.ts` (89%, 14), `mac-on-device-transcriber.ts` (87%, 20): guard conditions; see `raw/summ-desktop-host.md`.

## 5. No-coverage ranges (code no test executes)
- vibecoding `node/store.ts` (27): 85, 184–185, 233, 245, 261, 274, 307, 340, 359, 388–389, 399, 409–410. `node/project.ts` (61): 77–79, 90–91, 102, 130, 144, 151–153, 185–186, 242–243, 259, 264–277, 293–312, 321, 328. `node/paths.ts`: 312. `html/node/parse5-region-parser.ts`: 1 mutant.
- diagnostics: `web-evidence/public-page.ts` 178; `render-page.ts` 1 mutant. desktop-host: `electron/usability/spellcheck-menu.ts` (3), `electron/electron-url-capture.ts` (1), `tauri/testing.ts` (1) — lines in `raw/summ-desktop-host.md`.
- cli, artifacts, analytics: none.

## 6. NOT RUN
- `packages/admin` — only batch A below was attempted (see §9 status); NOT RUN: everything outside batch A: `src/forms/**`, `src/redirects/**`, `src/comments/**`, `src/media/**`, `src/widgets/**`, `src/seo/**`, `src/playground/**`, `src/consent/**`, `src/core/ports/**`, `src/core/entities/**`, `src/core/*.ts`, `src/*.ts` (batch B, ~7.7k mutants) and all `**/react/**` + `src/browser/**` (UI/hooks, by lane rule).
- diagnostics `web-evidence/page-performance-script.ts` and `page-structure-script.ts` (functions stringified into the browser; Stryker instrumentation breaks them — `stryMutAct is not defined`).
- Tests excluded from every run because they fail in the Stryker sandbox: admin `react/entities/__tests__/draft-rules.test.ts` (asserts a forced non-UTC TZ), vibecoding `session/__tests__/session-exports.test.ts` (packs `dist` to /tmp; `@jini-ai/core` not resolvable — fails standalone too), diagnostics `web-evidence/__tests__/page-performance.test.ts`. Mutants only those tests would kill appear as survivors.

## 7. What these numbers do NOT catch
Type checks are off (`disableTypeChecks`; no checker plugin), so type-invalid mutants count as killed/survived rather than compile errors. `StringLiteral` mutants excluded: error-message/IDs/paths-as-strings contract is unmeasured. A kill means *any* test in the package failed (indirect kills possible). Untested *inputs* and unimplemented behaviour are invisible; equivalent mutants are included in the denominator (score under-states). UI `.tsx`, admin `react/**`, `src/browser/**`, generated and barrel/type-only files are out of scope. Excluded tests/files in §6 reduce kills for the code they cover. Concurrency-3 timeouts are counted as kills.

## 8. Top 10 tests to write first (ranked by risk)
1. vibecoding `node/store.ts`+`project.ts`: write through a symlinked file and a symlinked parent directory → expect refusal (lines 72, 318); capture/restore must not follow symlinks.
2. vibecoding store: corrupt `current.json`/manifest/pending/fingerprint fixtures (each validator branch, 102–143) → `CORRUPT`; digest-mismatch objects (180, 190); `maxTreeBytes`/`maxFiles`/`maxFileBytes`/`maxChanges` at N-1/N/N+1.
3. diagnostics `secrets-only.ts` + `redaction.ts`: table-driven positive/negative cases per rule (left-boundary char, min length N-1/N, PRIVATE KEY with/without END, Basic/Bearer/Token variants, cookie vs set-cookie, URL userinfo) asserting the exact redacted output.
4. diagnostics `request-guard.ts`: default `allowDataRequests=false` blocks `data:`; default `preserveOwnSiteCookies=false` strips cookies; total-byte budget exactly at limit; non-redirect status.
5. analytics `ingest.ts`: IPv6 bucketing table (`::`, `::1`, `2001:db8::`, `a::b`, full 8-group, bracketed, v4-mapped) and CIDR match/mismatch + malformed prefix; email-like PII in props; bad percent-encoding in paths.
6. artifacts `node/stub-guard.ts` + `manifest.ts`: sidecar exactly at/over byte limit, directory/non-file sidecar, missing `metadata`; manifest arrays/class-instance/null-proto objects, drive-letter and `..` supporting-file paths, max length N/N+1.
7. cli `prompt.ts`/`http.ts`/`redact.ts`: stdin exactly at/over `maxBytes`, abort signal, double-settle; `content-length` over limit and absent; sanitize at depth limit and entry cap.
8. desktop-host `render-service.ts`: origin not in `allowedOrigins` (and `allowedOrigins` undefined) rejected; timeout then abort settle-once; Electron `registerSchemesAsPrivileged` argument deep-equal; window `show` default.
9. cli `flags.ts`/`main.ts`/`errors.ts`: `--k=v`, `--k=` , `-h`/`-v` shortcuts, daemon error body that is `null`/array/non-JSON.
10. diagnostics `lazy-browser.ts` + `public-page.ts`: refcount never negative/idle close only when active==0; wildcard URL matcher with repeated parts; header `Content-Type` any case.


L10 INTERIM (admin batch A still running) — see RUN-LOG
