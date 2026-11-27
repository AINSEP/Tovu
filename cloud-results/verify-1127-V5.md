PARTIAL run V5 | branches 1/5 | (in progress — header rewritten at the end)

# Verify 2026-11-27 — run V5 (Jini: cms-6, devops-1, devops-3, devops-4, mcp-1)

Setup: Node 24.22.3 (`/opt/node24`), pnpm 10.33.2, Jini `pnpm install --frozen-lockfile` + `pnpm -r build` on `integ/merge-28-2026-11-26` (d1ced6c5) green. gitleaks 8.28.0. One built copy per branch (`/home/user/Jini-<job>`), so branches ran in parallel without sharing a checkout. Coverage numbers are scoped runs (the branch's package tests for the area, `--coverage.include=<brief FILES>`, text reporter; thresholds zeroed on the CLI for the measuring run only — no config touched).

## codex/w62-cov-devops-4 — final sha `ea55c8d0` (pushed)
- 17 changed test files; typecheck (`tsc -p packages/devops/tsconfig.json`) had 4 errors, all in new tests; run: 154 tests, 3 red. After fixes: tsc 0; 156/156 green (2 tests added for the bug fix); scoped coverage run 37 files / 394 tests green.
- Reds -> why -> fix:
  - `media-original-urls.test.ts` "rewrites an absolute media URL only on the verified custom port" -> **production BUG (fixed)**: `media-original-urls.ts:30` built the configured origin as `scheme://host`, dropping the verified `port`, so on a site with a custom port its own absolute `/m/.../original` URLs were left stale while the port-less URL of a *different* origin was rewritten. Fix: `configuredOrigin()` builds `new URL(scheme://host[:port]).origin` (default port normalised, unparsable -> null). Test was red before the fix, green after; added "treats a verified default port as the plain origin" and "keeps absolute media URLs as written when the configured origin cannot be parsed".
  - `SourceControl.interactions.unit.test.tsx` token guidance -> test expected the hint `<p>` to contain only the guidance; it also holds the "Create a token" link. Now asserts the element is the `P` and its full text `"Grant read access Create a token"`.
  - `tool-bindings.test.ts` capabilities guidance -> asserted the call ORDER of `switchedOffPluginSentence` (saved rows are visited first). Order is not the contract; now asserts exactly 2 calls and each provider's own pluginIds (the returned guidance strings already pin the mapping per provider).
  - tsc: `headerAttrs={{}}` -> required `data-agent-element` value; `authorize` fake missing `reason`; `site-exporter.test.ts` read `result.themePreview` on a union -> narrowed with `in`; `store.validation.test.ts` cast `{ loadSourceControlProviders } as SourceControlCredentialWriteDeps` -> replaced by a strict Proxy fake that throws on any dependency other than the loader (proves the test's comment "only the optional loader is read").
- Weak tests fixed: the two casts above (type lies) replaced by a strict fake; grep of the diff for `toBeDefined`/`not.toThrow`/`toBeTruthy`/snapshots/skip/`as any` found none.
- Mutation spot-checks (all red, reverted): commit-target `branch` check disabled -> red; rules.ts secret field trimmed -> red; rules.ts partial-load message inverted -> red; store.validation `credentialRegistry` passes wrong workspaceId -> red; media-original-urls port dropped (the original bug) -> red. A `.origin` -> `.href` minus trailing slash mutant survived: equivalent (both normalise the default port).
- Coverage (lines/br/fn) before -> after:
  | file | before | after |
  |---|---|---|
  | source-control/react/ProvidersTab.tsx | 76.57/81.82/75.0 | 100/96.87/100 |
  | source-control/react/SourceControl.tsx | 100/100/66.67 | 100/100/100 |
  | source-control/react/hooks/use-source-control-credentials.hooks.ts | 88.89/68.57/69.23 | 100/92.98/100 |
  | source-control/react/rules.ts | 89.87/58.62/100 | 100/100/100 |
  | source-control/react/source-control-visuals.tsx | 56.25/100/66.67 | 100/100/100 |
  | source-control/repository-path.ts | 100/95.65/100 | 100/100/100 |
  | source-control/site/commit-target.ts | 0/0/0 | 100/100/100 |
  | source-control/site/credential-setup.ts | 67.61/35.0/43.48 | 100/86.6/100 |
  | source-control/site/provider-kit.ts | 100/75.0/27.27 | 100/94.44/91.66 |
  | source-control/site/saved-key-bindings.ts | 0/100/100 | 100/100/100 |
  | source-control/site/store.ts | 64.34/46.15/62.5 | 100/90.84/87.5 |
  | source-control/site/store.validation.ts | 70.8/36.96/77.78 | 100/95.74/100 |
  | source-control/site/tool-registrations.ts | 66.81/44.0/74.07 | 100/92.36/96.29 |
  | static-export/html-url-locations.ts | 96.05/92.0/100 | 100/97.46/100 |
  | static-export/site/export-preflight.ts | 100/87.8/100 | 100/95.34/100 |
  | static-export/site/media-original-urls.ts | 42.25/46.15/83.33 | 100/93.18/100 |
  | static-export/site/public-origin-policy.ts | 100/88.89/100 | 100/94.73/100 |
  | static-export/site/route-manifest.ts | 88.24/87.1/100 | 100/100/100 |
  | static-export/site/site-exporter.ts | 88.76/86.79/60.0 | 100/94.44/75 |
  | static-export/transforms.ts | 100/98.22/100 | 100/98.23/100 |
- BUGs: 1, fixed in this commit (`packages/devops/src/static-export/site/media-original-urls.ts:30`).
- Owner decisions: none.

## codex/w62-cov-mcp-1 — final sha `5af4d4b0` (pushed; subagent work, re-verified by the coordinator: tsc 0, 33 files / 729 tests green)
- 33 changed test files (all packages/mcp); first run 730 tests, 8 red; 4 tsc errors.
- Reds -> why -> fix:
  1. tool-registrations "a changed connection after the card…" (existing test): fake deps lacked `approvalToolHandler`, which `externalMcpSaveHandler` builds eagerly -> added a strict fake that throws if called.
  2. tool-registrations "configuration-only check does not use the wired live probe" -> **DROPPED** (owner decision below).
  3. run-tool-host "loads each requested startup descriptor once…": `resolveBaseUrl` is called via `.then`, so it receives `undefined`; the exact-args assertion with no args could never pass -> `toHaveBeenCalledOnce()` (args are incidental).
  4. second-host-store "hosted OAuth row reports pending…": a freshly saved OAuth row really is `'disconnected'` (store.ts:157) -> expected text corrected.
  5–7. AdmissionsBanner restart, y5 "Cancel draft" and OAuth "Cancel": `onClick={fn}` passes the click event -> `toHaveBeenCalledOnce()`.
  8. y5 "an unrelated edit round-trips empty and whitespace-bearing stdio arguments" -> **production BUG (fixed)**, below.
  - tsc: 3 vault `put` calls lacked `expectedRevision: null`; a partial `as` cast of the server view in tool-registrations replaced by a complete typed server view.
- Weak tests: diff grep for `toBeDefined`/`not.toThrow`/`toBeTruthy`/snapshots/`as any`/ts-ignore/skip/only/`vi.mock` -> none; each `not.toHaveBeenCalled` sits beside value assertions. Large files (y5, second-host-store, store.memory, repo.sql, tool-registrations) were checked by grep only, not read line by line.
- Mutation spot-checks (red, reverted): `joinArgs` empty-arg quoting removed; stdio-codec bounded error code -32603 -> -32600; run-tool-host 48-hex nonce check disabled; connection-gate `isPreset = true` (4 tests red).
- **BUG fixed**: `packages/mcp/src/react/external-mcp/hooks/external-mcp-form.rules.ts:42` — `joinArgs` did not quote an empty argument, so saving any unrelated change (e.g. toggling `enabled`) silently deleted `""` stdio arguments (`parseArgs` reads an empty arg only as `""`). Fix: quote when `arg === "" || /\s/.test(arg)`.
- **Owner decision**: `packages/mcp/src/external/tool-registrations.ts:319-324` — `external_mcp_test_connection` is documented (`agent-tools.ts:179` + `external_mcp_probe_connection` copy) as making no network call, but when a host wires a probe (`tool-registrations.ts:371`) it probes live and attaches `credentialSetup`. Codex's test asserted the documented promise (red). Either remove the probe branch (move `credentialSetup` to probe_connection) or change the description. Test dropped until decided; lines 320-324 stay uncovered. Dropped test code is in Codex commit `de6dba04` (`tool-registrations` test "configuration-only check does not use the wired live probe").
- Coverage (lines/br/fn) before -> after, "after" from the 33 changed test files only; † = file mostly covered by other suites, so this scoped number understates it (full-package run needed):
  install 100/93.6/100 -> 100/94.8/100; owned-json-install 100/92.9/100 -> 100/85.7/100†; client 98.4/99.0/100 -> 100/100/100; css-url-refs 100/73.3/100 -> 100/95.2/100; access-review 55.8/40/43.8 -> 100/93.5/100; operations-tools 88.1/78.6/85.7 -> 100/100/100; save-form 100/97.4/100 -> 100/98.7/100; save-input 35.7/50/16.7 -> 100/100/100; tool-registrations 17.4/100/13.3 -> 96.8/94.6/95.5; adapter.http 100/99.3/100 -> 92.2/94.9/100†; bootstrap 100/98.4/100 -> 90.5/84.9/100†; external-mcp-probe 98.1/94.7/100 -> 100/100/100; frozen-grants 100/96.7/100 -> 100/89.7/100†; hosted/access 100/96/100 -> 100/100/100; connection-gate 9.1/100/0 -> 100/100/100; external-mcp-repo 68.7/67.9/64.7 -> 100/81.0/100; repo.writes 89.0/61.3/90 -> 100/81.0/100; pinned-capability 100/94.9/100 -> 100/97.6/100; hosted/probe 100/92.3/100 -> 100/98.1/100; revocation 56.1/100/50 -> 100/100/100; store-config 88.6/68/100 -> 100/89.6/100; store-credentials 86.1/81.9/100 -> 100/96.7/100; store-input 76.8/59.7/100 -> 100/88.6/100; store-oauth-fields 75.6/78.5/100 -> 100/97.5/100; store-view 100/92/100 -> 100/96.4/100; store.memory 80.3/96.4/84.2 -> 100/97.3/100; store.save 85.7/80/83.3 -> 100/87.9/100; store 92.4/94.4/88.9 -> 100/97.3/100; vault 97.2/82.3/87.5 -> 100/84.1/87.5; runtime 100/95.7/95 -> 100/97.9/95; smoke 100/96.5/100 -> 100/96.5/100; ExternalMcpAdmissionsBanner 75.8/64/100 -> 100/100/100; ExternalMcpPanelSections 61.6/30/60 -> 100/84.2/100; ExternalMcpSettingsPanel.hooks 69.7/100/75 -> 50/100/80†; ExternalMcpSettingsPanel 90.1/83.3/50 -> 100/100/100; SourceRow 64.7/50/40 -> 100/93.6/76.2; external-mcp-form.rules 84.3/54.2/91.7 -> 100/97.7/100; source-actions 30.3/60/50 -> 100/95.2/100; admissions.hooks 98.4/96.4/92.9 -> 100/98.4/100; use-external-mcp.hooks 86.2/100/42.9 -> 100/100/100; stdio-codec 84.6/85.7/100 -> 100/100/100; http-tool-server.adapter 98.1/83.7/95.5 -> 90.1/75.3/90.5†; loopback-fetch 100/81.3/100 -> 100/88.2/100; run-tool-host 100/93.1/100 -> 100/95.8/100; stdio-hosting 100/95.9/100 -> 100/94.7/100†; tool-arguments 100/98.5/100 -> 97.6/95/100†; tool-protocol 100/98.9/100 -> 100/96.4/93.3†; tool-server 98.7/97.4/100 -> 96.0/89.1/96.8†; delegated-tool 100/98.2/100 -> 99.3/94/100†; custom-answer 100/96.2/100 -> 100/98.2/100.
