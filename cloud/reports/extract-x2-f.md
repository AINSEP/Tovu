# EXTRACT-X2-F — fixes for the X2 NEW failures, `cloud/extract-s10`

## Summary

All nine items are done, with one commit per item (item 6 took two). Every NEW Jini red from X2 (J-2 to J-12, J-14, J-15, J-19, J-20) is green. J-13 is **PRIOR**: it fails the same way on combine with combine's own install. The one NEW Tovu lint error is fixed, and lint is now 600 errors against combine's 607, with none new. Three of the architecture-drift items were removed by one-line import changes. The rest are listed in §9 with reasons.

Things you should know before merging:

- **J-12 was a real defect in more than one plugin.** Before the fix, a manifest parse that names the legacy `tovu` namespace read **all 34** shipped plugins as `unknown/<name>` with no `provides`, not just commerce. That namespace is still listed as portable. One resolver line fixes all 34 (§1 table).
- **J-12's test needed a one-line change too.** Its second line read the raw `value.extensions.tovu`, which no longer exists in the shipped file (the metadata moved to `extensions.jini`). It now reads `extensions.jini`. The brief said to fix the code, not the test. That line asserts raw JSON, not parser output, and no code change can make it pass without moving the metadata back. Disclosed here.
- **J-20 cannot be proven as asked.** The current guide does **not** explain how to build the callback from the configured site address. It only says to use "the host's configured canonical address and exact member sign-in callback URI, including any configured base path". The URL-API code, workspace-id encoding, first-link proof (gmail/hd/one emailed code), issuer+subject linking and unlink rules were removed in `291a2200`. They are now in **neither** repo (`grep` of Tovu `apps`/`packages`/`sites` and Jini finds them only in a Tovu test fixture). The guide is unchanged, as instructed. The test now pins what the neutral guide still says. **Owner decision needed:** should Tovu ship its own host-specific member-login guidance?
- **J-14/J-15 work the other way round from the brief's wording.** `descriptor-i18n.ts` imports nothing. The platform `process`/`proxy-env` closures reach it through the `@jini-ai/core/text` barrel, which they load for `captureLineTail`. Core has no narrower text subpath, so the coordinator allowance was used.

## Tips

| | Tovu | Jini |
| --- | --- | --- |
| Start | `0e14ab98` (X2 report tip; product tip `bd96a31a3`) | `6c7a7857d` |
| End (last green pair) | `3fca0eb4` (+ this report) | `3f693fd2` |
| Combine baseline | `7cf9658e5` | `e1b1bdbd6` |

Commits after `bd96a31a3` on Tovu before this job were the X2 report commits only (`41cbd996`, `45231309`, `95d24685`, `22df99dd`, `7aea7912`, `0e14ab98`).

Environment: Node 24.22.2 (tarball), pnpm 10.33.2 (corepack). Jini `pnpm install` + `pnpm --no-bail -r build` exit 0. Tovu `npm ci` exit 0, then `@tovu/sdk` build exit 0, then `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` exit 0. No Postgres was installed: no gate here needed it.

## Commits

| item | repo | commit | subject |
| --- | --- | --- | --- |
| 1 (J-12) | Jini | `f8b5294f` | fix(agent-plugins): an explicit legacy tovu namespace reads the canonical jini metadata |
| 2 (J-8..J-11) | Jini | `f24b4225` | fix(agent-plugins): credential-card metadata no longer closes the lifecycle ports cycle |
| 3 (J-4) | Jini | `ea707524` | fix(plugins): plugin-host warnings pass caught errors through core's shared redaction |
| 4 (J-2, J-3) | Jini | `dcffba2c` | test(db): data-modules joins the kysely and driver-free subpath lists |
| 5 (J-14, J-15) | Jini | `8706c8b9` | test(scripts): platform process and proxy-env closures include core's descriptor-i18n text module |
| 6 (J-5..J-7) | Jini | `90c5655e` | test(agent-plugins): pins follow the legacy-metadata warning and bundled versions |
| 6 (J-19, J-20) | Jini | `3f693fd2` | test(google-login): guidance pins follow the host-neutral wording |
| 7 (J-13) | — | none | PRIOR; nothing to fix |
| 8 (lint) | Tovu | `8e04f0bc` | fix(website): migration-recovery shim calls the void restore without returning it (+ raw evidence so far) |
| 9 (drift) | Tovu | `3fca0eb4` | refactor(website): three Jini re-exports are imported from Jini directly |

Raw files: `cloud/reports/raw/extract-x2-f/`.

## 1. J-12 — commerce manifest read as `unknown/commerce` (behaviour)

**Cause.** `291a2200` moved every bundled `plugin.json` from `extensions.tovu` to `extensions.jini`. `resolveAgentPluginIdentityNamespace` (`packages/agent-plugins/src/core/identity-namespace.ts`) returns an explicitly requested namespace unchanged. So `parseAgentPluginManifest({ value }, { identityNamespace: 'tovu' })` looked only at `extensions.tovu`, which is now absent. The result was `unknown/<name>` and `provides: []`. Yet `isPortableAgentPluginNamespace` treats `tovu` as portable, and the lifecycle resolver (`resolveAgentPluginLifecycleNamespace`) already lets a declared `jini` key win. The direct parser path, and `parseAgentPluginMcpConfig`, which uses the same resolver, did not.

**Fix.** One line: when `tovu` is requested and the manifest declares `jini`, read `jini`. Custom namespaces keep their isolation. A `tovu`-only legacy manifest still reads `tovu`, with its deprecation warning.

**Test.** The existing test was the failing test. Red: `raw/…/j12-red.txt` (`id` `unknown/commerce`, `provides` `[]`). After the code fix, its second line, `expect(value.extensions.tovu).not.toHaveProperty("providerPlugin")`, threw `TypeError: Cannot convert undefined or null to object`, because the raw JSON no longer has that key. That line now reads `value.extensions.jini`, the same check where the metadata now lives. Green: `raw/…/j12-green.txt` (1/1).

**Every shipped manifest, tip against combine.** Each plugin was parsed by the combine parser (worktree at `e1b1bdbd6`), the tip parser before the fix (`6c7a7857d`) and the fixed tip. Modes: default (no namespace), explicit `tovu`, explicit `jini`, and the lifecycle resolver with `extensionNamespace` `jini`/`tovu` (tip only; it does not exist at combine). Core's `plugin-directory.js` identity reader is byte-identical between combine and tip. Full JSON: `raw/…/j12-manifests-{combine,tip-before-fix,tip-fixed}.json`. Per-mode differences: `raw/…/j12-manifest-table.md`.

Reference = combine with explicit `tovu`, the mode the test uses. "same" = identical id, provides, requires and exports count.

| plugin | id (publisher) | provides | requires | exports | combine `tovu` / default | tip before fix: `tovu` | tip fixed: `tovu` / default / `jini` / lifecycle(`jini`) |
|---|---|---|---|---|---|---|---|
| charts-echarts | `jini/charts-echarts-agent` | chart | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| charts-recharts | `jini/charts-recharts-agent` | chart | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| cloudflare | `tovu/cloudflare` | deploy-target:cloudflare-workers, deploy-target:cloudflare-pages, form-destination:cloudflare-d1 | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| commerce | `jini/commerce` | commerce | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| composio | `tovu/composio` | app-connectors | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| fly | `tovu/fly` | deploy-ops:fly, deploy-config:fly, credential-scheme:fly-io | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| formspree | `jini/formspree-agent` | forms | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| github | `tovu/github` | source-control, site-backup, deploy-ops:github-actions | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| github-pages | `tovu/github-pages` | deploy-target:github-pages | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| google-forms | `jini/google-forms-agent` | forms | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| google-login | `tovu/google-login` | member-login:google | — | 1 | reference / same | **unknown/…, provides []** | same/same/same/same |
| google-workspace | `tovu/google-workspace` | api-connection:google-workspace, form-destination:google-sheets | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| higgsfield-media | `tovu/higgsfield-media` | media:image, media:video | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| jev | `tovu/jev` | skill-discovery | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| langfuse | `jini/langfuse` | ai-tracing | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| meilisearch | `tovu/meilisearch` | site-search | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| netlify | `tovu/netlify` | deploy-target:netlify | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| opentelemetry | `tovu/opentelemetry` | observability, tracing | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| posthog | `tovu/posthog` | product-analytics | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| railway | `tovu/railway` | deploy-config:railway, deploy-ops:railway | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| render | `tovu/render` | deploy-config:render, deploy-ops:render | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| resend | `tovu/resend` | outbound-mail | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| s3-compatible | `tovu/s3-compatible` | deploy-target:s3-compatible | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| sentry | `tovu/sentry` | error-tracking, observability | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| shopify | `tovu/shopify` | commerce:shopify | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| site-compliance | `tovu/site-compliance` | site-compliance | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| site-import | `tovu/site-import` | site-import | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| slide-design | `jini/slide-design` | slide-design | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| software-engineering | `jini/software-engineering` | software-engineering | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| stripe | `jini/stripe` | payments | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| supabase | `tovu/supabase` | database:supabase | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| ui-ux-design | `jini/ui-ux-design` | ui-design | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| vercel | `tovu/vercel` | deploy-target:vercel | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |
| wordpress | `tovu/wordpress` | wordpress-guidance | — | 0 | reference / same | **unknown/…, provides []** | same/same/same/same |

34 shipped plugin.json files at both commits (the same directories).

Readings:
- **Default mode** (what Tovu's website and most callers use): identical at combine, before the fix and after the fix for all 34.
- **Explicit `tovu`**: lost id, publisher and `provides` for **all 34** before the fix; restored for all 34 after it.
- **Explicit `jini`**: `unknown/…` at combine (the manifests had only `tovu` then); correct at tip. That is a gain, not a loss.
- **Lifecycle resolver** (the path Tovu's `lifecycle.ts` uses, `extensionNamespace: "jini"`): no `unknown/…` before or after the fix.
- No other loss was found, so there was nothing else to fix.

## 2. J-8 to J-11 — lifecycle import cycle

**Cycle.** `ports.ts → manifest.ts → credential-card-metadata.ts → contribution-loader.ts → trusted-plugin-files.ts → activation.ts → ports.ts`. The closing edge is a **type-only** import, `import type { PluginContributionParseResult } from './contribution-loader.js'`, in `credential-card-metadata.ts`. The cycle test follows type imports.

**Why not drop the re-export.** The public `./manifest` subpath maps straight to `dist/lifecycle/manifest.js`, so removing `export * from './credential-card-metadata.js'` would remove `parsePluginCredentialCards`, `parseCredentialCardUsedFor` and the card types from a public path.

**Fix.** `parsePluginCredentialCards` now spells out `PluginContributionParseResult<PluginCredentialCard>`'s two-variant shape inline (4 lines including a "why" comment), and the import is gone. Every export path is unchanged. Structural typing still checks the function wherever it is used as a contribution `parse`. `tsc --noEmit` for agent-plugins: exit 0. The test file is unchanged.

Red: `raw/…/j08-j11-red.txt` (4 failed / 3 passed). Green: `raw/…/j08-j11-green.txt` (7/7).

## 3. J-4 — raw caught errors in plugin-host warnings

Both shared redactors live in **`@jini-ai/core`** (`src/redact.ts`: `redactSecrets`, `formatErrorForLog`, exported from the root). No injection was needed, and no package other than core is imported.

| file | call | now |
| --- | --- | --- |
| `host/capability-tools.ts` | `activationReadDenied({ pluginId, detail: error.message… })` | `detail: redactSecrets({ input: … }, { redactPii: false })` |
| `host/node/runtime-core.ts` | `"bundled discovery failed…", error` | `formatErrorForLog({ error })` |
| same | `` `bundled initialization failed for '${failure.pluginId}'`, failure.error `` | label through `redactSecrets(…, { redactPii: false })`; error through `formatErrorForLog` |
| same | `boot conflict check failed…: ${error.message…}` | message through `redactSecrets` |
| same | `boot re-attach failed for '${pluginId}': ${…}` | same |
| same | `provider plugin '${record.id}' failed to load…: ${…}` | same |
| same | `` `Plugin '${id}' restored-version reload failed`, rollbackError `` | `formatErrorForLog({ error: rollbackError })` |
| `host/tools/management.ts` ×2 | `… refused — ${error.message}` | `redactSecrets({ input: error.message }, { redactPii: false })` |

**Same information.** Message-only lines keep their exact text unless it contains a secret. `{ redactPii: false }` is the policy `formatErrorForLog` itself uses, so emails and paths stay readable. Where an `Error` object was passed, `formatErrorForLog` gives its stack (which includes the message) plus any extra own fields, as one redacted string.

**Why the label was redacted.** The guard treats `failure` as a caught-error binding, and its own comment says property names do not establish trust. So rather than rename the loop variable to dodge the scanner, the label goes through the redactor too. The Tovu test prefix `^\[plugin-runtime\] provider plugin 'obs-fake' failed to load; its contract stays on the noop: ` is unchanged.

Red: `raw/…/j04-red.txt` (the 9 calls). Green: `raw/…/j04-green.txt` (24/24). `tsc --noEmit` for plugins: exit 0.

## 4. J-2, J-3 — db `data-modules`

**Proof first** (`raw/…/j02-j03-proof-no-driver.txt`). A copied install held only `@jini-ai/db` (dist + package.json), `@jini-ai/core` and `kysely`. None of `better-sqlite3`, `pg` or `@electric-sql/pglite` resolved there. `import("@jini-ai/db/data-modules")` alone loaded only the `data-modules` and `kernel` dist dirs, plus `kysely` and `node:` builtins (not even core), and exposed 19 exports. Exit 0.

**Same declaration.** `kysely` is a plain `dependencies` entry for the whole package, which is exactly what `kernel/` and `migrate/` rely on. So the coordinator allowance applies:

- `import-isolation.test.ts`: the kysely folder allowlist becomes `/^(kernel|migrate|data-modules)\//`.
- `loads-without-driver.test.ts`: a `data-modules` SUBPATHS entry with `dirs: ["data-modules", "kernel"]` and `kernel: true`. Its probe exercises behaviour: `isIncompletePhase` both ways, `isInMemoryDbPath` both ways, and `declareDataModule` is a function. That brings in the existing kysely positive control (`./data-modules requires kysely in the empty fixture`) and the closure check for the new export.

Red: the committed tests, run from scratch copies (`raw/…/j02-j03-red.txt`: 2 failed / 42 passed; the copies were deleted). Green: `raw/…/j02-j03-green.txt` (46/46, including the two new `data-modules` cases).

## 5. J-14, J-15 — `descriptor-i18n.ts` in the OS-helper closures

`packages/core/src/text/descriptor-i18n.ts` (64 lines) **imports nothing**. The direction is the reverse of the brief's wording. `@jini-ai/platform`'s `process.ts` and `proxy-env.ts` import `captureLineTail` from `@jini-ai/core/text`. That barrel now also exports `parseDescriptorI18n` (`52365d5b`), so the closures load it, just as they already load `escape`, `sanitize-untrusted-text`, `redact` and `trim-chars`, which the test pins. Core exports no narrower text subpath, so cutting it would need a public export change, not an import cut. The coordinator allowance was used: `descriptor-i18n` joins the test's `text` owner list, and nothing else changed.

Red: `raw/…/j14-j15-red.txt` (2 failed). Green: `raw/…/j14-j15-green.txt` (21/21).

## 6. Out-of-date pins (coordinator allowance)

- **J-5**: the default-namespace read of the legacy `extensions.tovu` fixture now expects `warnings: [legacyAgentPluginMetadataWarning]`, imported from the lifecycle barrel, not a copied string. The other three expectations are unchanged.
- **J-6, J-7**: `0.6.2 → 0.6.3` (ui-ux-design) and `0.1.0 → 0.1.1` (slide-design), the versions in the shipped `plugin.json` files.
  - Red: `raw/…/j05-j07-red.txt` (3 failed). Green: `raw/…/j05-j07-green.txt` (21/21).
- **J-19**: the two Tovu-branded Supabase checks now match the guide's neutral text. They still prove the same points: the card is optional unless member login is also used, and the Google client lists both callbacks. The new patterns are `host's credential card is unnecessary unless this site also uses site members` and `both the Supabase callback and the host's callback`. The other 8 checks are unchanged.
- **J-20**: renamed to "member guidance uses the exact callback for the configured site address and base path, and leaves linking to the host". It asserts, inside the `## Site members` section:
  - "Use the host's configured canonical address and exact member sign-in callback URI, including any configured base path";
  - the exact-match rule (scheme, host, port, path, base path);
  - the `redirect_uri_mismatch` troubleshooting line;
  - the secure card ("never receive either secret in chat");
  - host-owned binding, state, PKCE, token validation, linking, unlinking and sessions;
  - "Verify sign-in, sign-out and unlinking".
  - **Confirmation the brief asked for: not met.** The guide names the configured address and base path but no longer *explains building* the callback. Six old assertions have no neutral counterpart left: URL-API construction, `encodeURIComponent(workspaceId)`, the `credential_save` target, gmail/googlemail and `hd` auto-link, one emailed code, issuer+subject, unlink effective on the next sign-in, and Connect Google from `/account`. This is listed as an owner decision above. No guide was changed.
  - Red: `raw/…/j19-j20-red.txt`. Green: `raw/…/j19-j20-green.txt` (2/2).

## 7. J-13 — reference-web composer e2e: **PRIOR**

- **Tip**: `raw/…/j13-tip-red.txt`, `strict mode violation: getByRole('button', { name: 'Send', exact: true }) resolved to 2 elements`.
- **Combine**: the worktree `/home/user/cmb/Jini` at `e1b1bdbd6` got its **own** `pnpm install --frozen-lockfile` (exit 0, `raw/…/j13-combine-install.txt`) and `pnpm --filter "@jini-app/reference-web..." build` (exit 0, `raw/…/j13-combine-build.txt`), with no symlink to the tip's `node_modules`. `examples/reference-web/node_modules/@jini-ai/chat` resolved to `/home/user/cmb/Jini/packages/chat`. Same test, same failure: `raw/…/j13-combine.txt`.
- **Environment, both runs**: `playwright` 1.61.1 symlinked from Tovu's install into `node_modules` (gitignored), and headless shell 1243 aliased as 1228, as in X2.

So J-13 is **PRIOR**, and was not fixed.

## 8. Tovu lint — `migration-recovery.ts:5`

`restoreSqliteSnapshots(…): void { return restore({ dbPath, entries }); }` became `{ restore({ dbPath, entries }); }`. Same behaviour: `restore` returns `void`. Red: `raw/…/tovu-lint-item8-red.txt`. Green: `raw/…/tovu-lint-item8-green.txt`.

## 9. Tovu architecture drift since combine

Measured by running `check:architecture` (with a scratch copy that also dumps the exposed-file sets) and `depcruise` on the tip and on a combine worktree (`7cf9658e5`, read-only, sharing the tip's `node_modules`). Raw: `raw/…/arch-{tip,combine}.txt` (before the item-9 fix), `raw/…/tovu-check-architecture.txt` and `raw/…/tovu-check-boundaries.txt` (after).

**Cross-feature edges (+8 at X2 → +6 now)**

| # | edge | added by | status |
| --- | --- | --- | --- |
| E1 | `api-connections/host-bindings.ts → agent-plugins/lifecycle.ts` (`type LoadPluginContributions`) | `e06f9edd` refactor(api-connections): bind existing owners through A3 host ports | kept: a Tovu-derived type (`TovuAgentPluginLifecycle["loadPluginContributions"]`); no other owner exports it |
| E2 | `api-connections/host-bindings.ts → custom-credentials/index.ts` (`type CustomCredentialSetRepoPort`) | `e06f9edd` | kept: Tovu alias `CredentialSetRepoPort<CustomCredentialCategoryId>`; not one line |
| E3 | `api-connections/surface-connection-bindings.ts → agent-plugins/executable-tools/host-capabilities.ts` | `1ef11e22` feat(extract-s3): seam executable and surface connection owners in place | **removed** (`3fca0eb4`): `confirmedTokenOptions` and `FrozenConnectionAccounts` now come from `@jini-ai/agent-plugins/connect/executable`, the module that file only re-exports |
| E4 | `custom-credentials/credential-ports.ts → source-control/provider-registry.ts` | `09317cc0` feat(custom-credentials): bind the core credentialed-request and source-control write ports… (EXTRACT-S8 C2 part 1) | kept: `buildSourceControlProviderForApi` is Tovu code wrapping the registry |
| E5 | `custom-credentials/tovu-credential-sets.ts → project-keys/create-vault.ts` | `79e039b1` refactor(custom-credentials): seam store/vault repo behind host inputs (EXTRACT-S8 C1) | kept: `ProjectKeyCreateConflictError` is a Tovu class (identity matters for `instanceof`) |
| E6 | `custom-credentials/tovu-credential-sets.ts → vendor-credentials/index.ts` | `79e039b1` | kept: `credentialCreateTarget`/`credentialScopes` are Tovu code (`project-scope.ts`) |
| E7 | `deployments/deploy-ops/run-ops.ts → webhooks/index.ts` | `9616631f` fix(deploy): remove site-key helper import cycle (S9-4) | kept: Tovu `keyring.env.ts` helpers; that commit chose this path to break a cycle |
| E8 | `deployments/deploy-targets/registry.ts → form-destinations/types.ts` | `2671b555` refactor(deployments): deploy contracts come from @jini-ai/devops | **removed** (`3fca0eb4`): the two types now come from `@jini-ai/cms/forms`, which `form-destinations/types.ts` only re-exports |

The 17 edges removed since combine are unchanged. Cross-feature all-import edges: 447 → **445**.

**Exposed files (+2, unchanged at 870; combine 868)**

| file | importers outside the feature | added by | status |
| --- | --- | --- | --- |
| `agent-plugins/capability-projection.ts` | `server/runtime/composition/plugin-host.ts` (`classifyAgentPluginMcpServerTrust`) | `541f00a8` feat(extract-s4): A9 Tovu side… plugin host moved to @jini-ai/agent-plugins/connect | kept: Tovu function; no already-exposed file re-exports it; the consumer is the composition root |
| `agent-plugins/mcp-host-bindings.ts` | composition `plugin-host.ts`, `agent-plugin-service-ports.ts`, boot `bootstrap.ts`, routes `set-enabled.ts`, `list.ts` | created `346da8e1` feat(extract-s3): seam canonical MCP projections…; more importers `85e14f0b` | kept: a new host-binding seam the composition root and routes are meant to consume; no barrel exists to route through |

**Boundary warnings (+3 at X2 → +2 now; 83 → 85; errors 15 = combine's 15)**

New `no-circular` cycles, by the commit that closed each:
- `plugin-runtime/install-tool-binding.ts ↔ install-tool.ts`, `plugin-runtime/host-tool-binding.ts ↔ tool-registrations.ts`, `agent-plugin-tool-binding.ts → tool-registrations.ts → host-tool-binding.ts`: `8d0b6689` wip(plugin-runtime): separate portable tool bodies from host bindings. Kept: each binding imports the caller's own `Deps` type (`PluginsToolDeps`, `PluginsInstallToolDeps`), so breaking it means moving a type definition, not changing one import.
- `api-connections/host-bindings.ts` ×2, `api-connections/byo-client.ts` ×2, `source-control/provider-registry.ts`, `agent-plugins/bundled-contribution-sources.ts`: all run through `host-bindings.ts → {contribution.ts, byo-client.ts, custom-credentials/index.ts}` (`e06f9edd`), and some also through `custom-credentials/credential-ports.ts → source-control/provider-registry.ts` (`09317cc0`). Kept, for the E1, E2 and E4 reasons.
- `api-connections/surface-connection-bindings.ts ↔ surface-connections.ts` (`1ef11e22`): **removed** (`3fca0eb4`). `IssuedSignIn` now comes from `@jini-ai/agent-plugins/admin-surfaces/connections`, the subpath the file already imported and that `surface-connections.ts` only re-exports.
- Deep import `agent-plugins/executable-tools/host-bindings.ts → contracts/headless/assistant-tool-approval-policy.ts` (`1ef11e22`): kept. It is a move: the same import left `executable-tools/register.ts` (listed as GONE), so the count is net zero.

Gone since combine (unchanged): 5 `no-circular` (api-connections `connect.ts`, `hook-http.ts`, `host.ts` ×2, external-mcp `contracts.ts`), plus the `register.ts` and `mail-adapter-registry.ts` deep imports.

`check:architecture` is still red for the same 4 PRIOR hard metrics as X2: back-edges 0 → 5, API surface 821 → 870, 3 new mutual module pairs, largest SCC 22 → 61.

## Gates

Every gate ran after the last code commit (Jini `3f693fd2`, Tovu `3fca0eb4`), with Jini linked into Tovu. Vitest ran with `--maxWorkers=2 --minWorkers=1` and node:test with `--test-concurrency=1`.

| gate | exit | result | vs combine / X2 | raw |
| --- | ---: | --- | --- | --- |
| Jini `packages/agent-plugins` full | 0 | 125 files, **1650 pass**, 2 skipped (native) | J-5…J-12 green | `gate-jini-agent-plugins.txt` |
| Jini `packages/plugins` full | 0 | **813/813** | J-4's files | `gate-jini-plugins.txt` |
| Jini `packages/db` full | 0 | 94 files, **739/739** (combine 735; includes the 2 new data-modules cases) | J-2, J-3 green | `gate-jini-db.txt` |
| Jini `packages/http-kit` redaction guard (code not touched) | 0 | 24/24 | J-4 green | `j04-green.txt` |
| Jini `examples/neutral-host` | 0 | 15 files, **66 pass**, 13 todo | same todo count as X2 | `gate-jini-neutral-host.txt` |
| Jini root `test:scripts`, vitest half | 0 | 50 files, **802 pass**, 32 skipped | J-14, J-15 green; same 32 skips as X2 | `gate-jini-test-scripts-vitest.txt` |
| Jini root `test:scripts`, node half (`test:scripts:node`) | 1 | 7 pass, **3 fail** | all PRIOR: J-16, J-17, J-18 infra-retirement (identical assertions: "Retirement requires every consumer import to move first", "…every consumer dependency to move first", "Retirement is incomplete: retain infra until its release gate and outbox ownership are resolved") | `gate-jini-test-scripts-node.txt` |
| Jini root `test:agent-plugins:content` | 0 | **1406/1406** | J-19, J-20 green | `gate-jini-agent-plugins-content.txt` |
| Jini `pnpm guard` | 1 | 2 violations: **R10** `ChatPane.tsx` imports `Icon` outside the public barrel (PRIOR, identical text); **R13** `defs/claude.ts` fallbackModels missing `claude-fable-5-2` (ENV: this container's live Claude CLI picker cache, 17 live ids against 20 fallbacks) | same two as X2 | `gate-jini-guard.txt` |
| Jini `pnpm check:cross-package` with XP3 | 0 | "XP1–XP5 clean" | as S10 | `gate-jini-check-cross-package.txt` |
| XP3 snapshot | 0 | clean worktree at `35c4961af718f0f30591c46d2ea2756c4484a731`: `CI=true pnpm install --frozen-lockfile` exit 0, `pnpm --no-bail -r build` exit 0. The unmodified `scripts/check-no-cross-package.ts` ran by absolute path with that tree's tsx, `--write-baseline <scratch>`: 3308 source mappings, 3320 declarations, manifest SHA-256 `d836eba0…d459`, declaration aggregate `48f6d422…2d24` | **both match** extract-s10.md | `xp3-*.txt` |
| Tovu lint (`biome lint . --max-diagnostics=none --diagnostic-level=error`) | 1 | **600** errors | combine 607: **0 new**, 7 gone (`contracts/core/commands/revert.ts` noEmptyInterface; `agent-plugins/automatic-agent-plugins.ts` noAssignInExpressions; `agent-plugins/connect-tool.ts` noImplicitAnyLet; `agent-plugins/credential-cards.ts` noVoidTypeReturn; `agent-plugins/host-signals.ts` noControlCharactersInRegex ×2; `deploy-ops/run-ops.ts` noImplicitAnyLet). Compared by file+rule count against a lint of the combine worktree | `tovu-lint.txt`, `tovu-lint-{new,gone}-vs-combine.txt` |
| Tovu `typecheck` (root + e2e) | 0 | clean, Jini linked | same | `tovu-typecheck.txt` |
| Tovu `check:architecture` | 1 | the 4 PRIOR hard metrics (§9); cross-feature edges 445 | drift reduced (§9) | `tovu-check-architecture.txt` |
| Tovu `check:boundaries` | 15 | 15 errors (= combine), 85 warnings (combine 83, X2 86) | §9 | `tovu-check-boundaries.txt` |
| Tovu website tests touching the changes (193 files: every test importing `migration-recovery`, `surface-connection(s|-bindings)`, `deploy-targets/{registry,index}`, `credential-cards`, `capability-tools`, `plugin-runtime.provider-plugins`; all `features/agent-plugins/__tests__/unit`; all of `features/{api-connections,plugin-runtime,deployments/deploy-targets}`) | 1 | 2073 tests: **2066 pass, 3 fail**, 4 skipped | W-16 and W-23 PRIOR (identical to X2 §6: the same 3 vendor-neutrality offenders, and the same 60 no-vendor-in-core pairs, 0 new / 0 gone); the third is ENV (below); the 4 skips are the usual root and environment self-skips | `gate-tovu-website.txt`, `tovu-website-gate-files.txt` |
| … rerun with Postgres | 0 | `shared-bindings.postgres.test.ts` 1/1 | The full run had no Postgres ("failed to drop fixture database … /tmp/.s.PGSQL.5432 … No such file or directory"). Installed PostgreSQL 16 (`apt-get update && apt-get install -y postgresql`), trust auth, `/tmp` socket, roles `root`/`la`; reran; cluster stopped | `gate-tovu-website-postgres-rerun.txt` |
| Tool-metadata golden | — | `apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json` SHA-256 **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6** | unchanged | `gate-tool-metadata-golden.txt` |

Every error in the failing gates, listed in full:
- Jini node scripts: J-16, J-17, J-18 (assertions quoted above).
- Jini guard: R10, R13 (quoted above).
- Tovu website:
  - (a) `api-connections/__tests__/vendor-neutrality.test.ts` › no generic seam file names the first provider: actual `bundled-catalog.ts:43`, `bundled-catalog.ts:44`, `shared-owner.ts:81`.
  - (b) `deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts` › real core tree has only reviewed pattern exceptions…: the 60 pairs in the raw file, identical to X2's shard 7.
  - (c) `api-connections/__tests__/shared-bindings.postgres.test.ts` › PostgreSQL persists only the consumer reference across pools…: no server; passes with Postgres.
- Tovu lint and architecture: the totals above; per-error lists in the raw files (600 lint diagnostics; 15 boundary errors, the same 15 as combine).

**Last green pair** (every NEW X2 red fixed; only PRIOR/ENV remain): **Tovu `3fca0eb4` + Jini `3f693fd2`** on `cloud/extract-s10`. The Tovu report commit sits on top of `3fca0eb4`.

## Process and cleanup

- No test, server or Postgres process is left (`ps` checked; the cluster shows `down`).
- Worktrees `/home/user/cmb/{Jini,JiniTip,Tovu,xp3}` were created for the combine and XP3 comparisons and then removed. The temporary Playwright symlinks in Jini's `node_modules` were removed. The headless-shell alias under `/opt/pw-browsers` remains (environment only).
- The scratch copy of `check-architecture.ts` ran as an untracked file and was deleted. The red copies of the db tests were deleted.
- Test pollution: none. Tovu `git status` shows only this report and its raw files; Jini is clean.
- Nothing published. No force-push. main and cloud/combine untouched. No guide, guard baseline, lockfile, golden or lint config changed.
- Pushed:
  - Jini `cloud/extract-s10`: `f8b5294f`, `f24b4225`, `ea707524`, `dcffba2c`, `8706c8b9`, `90c5655e`, `3f693fd2`.
  - Tovu `cloud/extract-s10`: `8e04f0bc`, `3fca0eb4`, then this report.

EXTRACT-X2-F DONE
