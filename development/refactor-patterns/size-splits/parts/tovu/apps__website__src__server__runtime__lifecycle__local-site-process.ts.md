### tovu:apps/website/src/server/runtime/lifecycle/local-site-process.ts
- **Over:** `createLocalSiteProcessPort` 121 (file 229, under)
- **Phase:** now (label ?) · **Batch:** size-09
- **Tests:** `apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts`, `.../__tests__/local-site-process-port.unit.test.ts`, `.../__tests__/local-site-start.unit.test.ts`, `.../__tests__/warm-site-watch.unit.test.ts`. Check `rg -n "mock.*local-site-process" apps/website/src` first.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `repoRoot`, `tls`, `scheme`, `let buildRoot`, `registry`, `stateForSite`, `existing`, the returned object's other props (`isPortFree`, `dispose`, …) | bind native effects |
| B | the `launch` prop from `const childBuildRoot = buildRoot;`'s next statement (`const childEnv = localSiteChildEnv({ …`) to its end | spawn one site child and hand back its `LocalSiteProcess` |

- **Splits:** HELPER at module level directly above `createLocalSiteProcessPort`: `spawnLocalSiteChild({ name, port, daemonPort, siteDir, childBuildRoot, env, repoRoot, scheme, registry, processOptions, tls, probeHttp }: SpawnLocalSiteChildInput): Promise<LocalSiteProcess>` ← every statement of `launch` after `const childBuildRoot = buildRoot;` (add `site`, `existing` or `stateForSite` to the input only if those statements reference them). `launch` keeps: `assertLocalSiteName`, the site lookup/`SITE_NOT_FOUND`, `siteDir`, the containment comment, `buildRoot ??= mkdtempSync(…)`, `const childBuildRoot = buildRoot;`, then `return spawnLocalSiteChild({ … })`. Types: `tls` = `ReturnType<typeof resolveDevTls>`, `registry` = `typeof registry` → declare a module-level type for the inline `{ readLive, write, removeIfCurrent }` literal (copy its member types), `processOptions`/`probeHttp`/`env` = the factory's option types.
- **Importers to update:** none.
- **After:** `createLocalSiteProcessPort` ~45; `spawnLocalSiteChild` ~78; file ~240.
- **Risks / notes:** `buildRoot` is a lazily-created `let` shared with `dispose` — it stays in the factory; only its snapshot `childBuildRoot` crosses into the helper.
