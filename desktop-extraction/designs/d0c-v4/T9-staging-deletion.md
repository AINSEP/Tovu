# T9 (D0c3d): delete the website staging step (OUTLINE: runs only after T8; P required)

Precondition: `node apps/desktop/scripts/stage-website-shared.ts` prints `bundled 0 module(s)` on the start SHA (STOP otherwise).

One commit, Tovu:
- `git rm apps/desktop/scripts/stage-website-shared.ts`; its header "Why" paragraph (desktop 0.1.21's `ERR_MODULE_NOT_FOUND`, why a staged copy existed) moves to `apps/desktop/RELEASING.md` under a "History" heading; each why-comment block the gate reports lost is allow-listed with that carrying path (combine-3-fix pattern), none with a blanket entry.
- `apps/desktop/package.json:25` `stage` = `node scripts/stage-payload.ts` (the NAME stays: `.github/workflows/desktop-release.yml:87,162,406` run `npm run stage`; proof `rg -n "npm run stage" .github apps/desktop/package.json`); `src/staged-closure.test.ts:7` pins the new string.
- `apps/desktop/electron-builder.yml:94-97` (the `staging/website-shared -> website` entry and its comment) deleted.
- `apps/desktop/scripts/verify-staged-closure.ts:39-40` (copy of `Resources/website`) deleted; no new verifier code. `src/verify-package-cli.test.ts:243` fixture: drop the `Resources/website` directory; the complete-archive case keeps every package the verifier now requires (judge 1 B4: a separate missing-package case, not a half-complete "complete" fixture).
- `src/dist-import-check.test.ts`: the module list is replaced by one rule: no non-test desktop source contains a quoted `../website/src/` specifier (the D0 end state). Zero-hit search scoped to runtime config, with explicit status: `if rg -n "website-shared|stage-website-shared" apps/desktop/package.json apps/desktop/electron-builder.yml apps/desktop/scripts; then exit 1; elif [ $? -ne 1 ]; then exit 2; fi`.
- Proof P: `npm run package` on macOS (`gates`, `build`, `stage`, electron-builder, `verify-package`, `smoke-native`, `smoke-bridge`) and the release workflow's Windows job on the same SHA, with one configured telemetry provider.
