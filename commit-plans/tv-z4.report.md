Applied C01–C05 and C07 on `codex/tv-z4`, base `776ce6d0f`. Expected reduction: **18 findings**, pending combine validation.

All paths below are under `apps/website/src/`; ledger keys are `(path, catch-reads-error)`.

| Sheet | Status / files touched | Expected reduction |
|---|---|---:|
| C01 | DONE — `platform/markdown/frontmatter.ts`, `server/runtime/composition/build-release.ts` | 1 each |
| C02 | DONE — `platform/site-dir/{local-admin-bundle,nested-sites-root,local-site-child,read-site-dir,site-registry}.ts` | 1, 2, 1, 2, 1 |
| C03 | DONE — `server/inbound/admin-http/{admin-static,sea-runtime}.ts` | 1 each |
| C04 | DONE — admin routes `pages/get-by-id.ts`, `posts/template-preview.ts`, `widgets/agent-tools.ts` | 1 each |
| C05 | DONE — admin route `plugins/provider-settings.ts`, public route `site/pages/render-context/site-title.ts` | 1 each |
| C07 | DONE — public routes `members/me.ts`, `site/product-checkout.ts` | 1 each |
| C08 | STOPPED — no files touched | 0 |

C08 stopped at `server/runtime/composition/site-deps/identity-settings.ts:51`: `composeIdentitySettings` spans 73 physical lines, exceeding the specified 50-line cap. Both C08 files remain unchanged.

`COMMIT-PLAN.md` contains one entry per sheet, ledger paths, combine mutations, and the permitted 564-line file note. `REFRESH.md` records the C08 stop and no importer repoints.

Zero tests added or changed. No tests, builds, type checks, linters, or gate runs performed. No Jini, package, lockfile, debt-ledger, or `.git` changes.

Diff reread complete; no extraneous edits required deletion. No Chrome/Electron look owed.
