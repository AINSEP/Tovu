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
