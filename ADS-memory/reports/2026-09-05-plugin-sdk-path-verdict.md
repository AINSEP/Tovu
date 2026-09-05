# Plugin SDK resolver default-path bug — verdict (read-only investigation)

- Author: Software Architect (subagent dispatch)
- Date: 2026-09-05
- Scope: `resolveDefaultSdkModulePath()` in `apps/website/src/server/runtime/boot/plugin-sdk-resolver.ts`. READ-ONLY — no source file changed.

## 1. Bug: CONFIRMED, independently, and it is worse than "same wrong path in both layouts"

```ts
function resolveDefaultSdkModulePath(): string {
  return path.join(import.meta.dirname, "../../../packages/sdk/dist/index.js");
}
```

The file lives at `apps/website/src/server/runtime/boot/` — **6** path segments below repo root in the tsx/dev layout (`apps`/`website`/`src`/`server`/`runtime`/`boot`). `../../../` is only 3 ups, landing at `apps/website/src`, so the computed path is `apps/website/src/packages/sdk/dist/index.js`. Verified missing:

```
MISSING: apps/website/src/packages/sdk/dist/index.js
```

Under the compiled layout, root `tsconfig.json` has `rootDir: "apps/website"` and `include: ["apps/website/src/**/*.ts"]`, so this file compiles to `dist/src/server/runtime/boot/plugin-sdk-resolver.js` — **5** segments below repo root (one shallower than dev, because `apps/website` collapses to the single `dist` segment). Same 3-up math lands at `dist/src/packages/sdk/dist/index.js`. Also verified missing (and `dist/` itself only exists locally because someone ran a manual build — see §3):

```
MISSING: dist/src/packages/sdk/dist/index.js
```

**Correction to the dispatch framing:** these are not "the same wrong offset" in both layouts — dev needs 6 ups, compiled needs 5, and the code always does 3. The function is wrong by a different amount in each layout, which matters for evaluating Option B below.

`packages/sdk/dist/index.js` **does** exist on this machine right now (`packages/sdk/dist/index.js`, `index.d.ts`, dated Aug 27) — but see §3/§4: it is gitignored, untracked, and not produced by any dev or root-build automation. It's a manually-built artifact, not evidence the pipeline produces it.

Confirmed: `shortCircuit: true` in the registered hook means a planted shadow `@tovu/sdk` still never wins even though the real one 404s — this really is fail-closed breakage, not a security regression. Agree with the original framing on that point.

## 2. Intended topology — cited, and it contradicts the current implementation's own approach

The governing document is **not** ADR-005's top-level text (which only states semver/deprecation policy for the SDK's *public API surface*, nothing about filesystem resolution) — it's ADR-005's companion **"SDK Resolution Mechanism" sub-decision**, in `ADS-memory/reports/pipeline/005-plugin-system/adr.md:103-114`. Its own problem statement says:

> "...a directory the runtime binary's own `node_modules` (**where `@tovu/sdk` actually lives, per ADR-011's standalone single-binary topology**) is not an ancestor of..."

That is the design's stated model: `@tovu/sdk` is expected to be resolved through the runtime's **own `node_modules`**, i.e. ordinary Node package resolution — not a hand-computed relative path assuming sibling directories. I verified this is exactly how the workspace is actually wired:

```
node_modules/@tovu/sdk -> ../../packages/sdk   (real npm-workspace symlink, confirmed on disk)
```

The selected mechanism table (same section) picks `module.register()` specifically to redirect **bare-specifier resolution** for plugin code — its whole comparative advantage over the rejected "shim `node_modules` per site" option is that it needs no per-install-dir filesystem provisioning **because the runtime's own copy is already reachable via normal `node_modules` resolution**. Nothing in the ADR, in CIC U-002 (`critical-internal-constraints.md:67-93`, ordering/registration constraints only), or in implementation-outline C-015 (`implementation-outline.md:76`) specifies or requires the relative-`path.join` approach the code actually took — that's an implementation detail invented later that never matched the ADR's own resolution assumption.

Production topology confirms the same thing independently. `Dockerfile:33-57,161`: the whole repo (including `node_modules` and `packages/sdk`) is `COPY . .`'d into the build stage, `npm install` at repo root creates the same `node_modules/@tovu/sdk` symlink, `RUN npm run build --workspace=packages/sdk` (line 57) populates its `dist/`, and stage 2 (`COPY --from=build /workspace/Tovu /workspace/Tovu`, line 161) carries the **entire tree, node_modules included**, into the runtime image verbatim. So in the actual shipped container, `node_modules/@tovu/sdk` resolves correctly via plain Node resolution from any depth under `/workspace/Tovu` — the hand-rolled relative path was never necessary there either.

**Verdict on intended topology:** `@tovu/sdk` is supposed to be reached via real npm-workspace/node_modules resolution in (a) dev, (b) compiled `dist/`, and (c) the packaged Docker image alike — that's the one topology that's actually uniform across all three, and it's the one the ADR's own prose assumes. The current code instead reimplements this as directory-depth arithmetic, which is layout-dependent by construction and has already broken twice (see §4).

## 3. Does the root `build` script produce `packages/sdk/dist`? No.

Root `package.json`'s `build` script: `check-no-linked-jini.mjs && tsc -p tsconfig.json && emit-dist-package-json.mjs && rm -rf dist/content ... && cp -R content/... `. `tsconfig.json`'s `include` is scoped to `"apps/website/src/**/*.ts"` only — `packages/sdk` is never compiled by it. `emit-dist-package-json.mjs` derives `dist/package.json`'s `imports` map purely from the root `package.json`'s `imports` field and `tsconfig.json`'s `rootDir`; it has no knowledge of `packages/sdk` at all — it does not "account for it" in any sense, confirming that's genuinely out of scope for that script, not an oversight within it.

The **only** place that builds `packages/sdk` is `Dockerfile:57`, `RUN npm run build --workspace=packages/sdk`, run once per image build, standalone from the root `npm run build` (line 69) that follows it. `development/scripts/dev.mjs` has zero references to `sdk` — dev mode never builds it either. `.gitignore`'s bare `dist/` pattern matches `packages/sdk/dist/` too (confirmed: `git ls-files packages/sdk/dist` returns nothing — untracked). So a fresh clone, `npm install`, `npm run dev` has **no** `packages/sdk/dist` at all, independent of the path-math bug — the copy present on this machine right now was built manually by someone, not by any automated dev or build path.

## 4. Has plugin loading ever worked end-to-end? No evidence it has, and the path was only briefly numerically correct

Git history of this exact function (`__dirname`/`import.meta.dirname` line only changed the identifier, never the `"../../../packages/sdk/dist/index.js"` string):

| Commit | Change | Depth from repo root at that point | Math (`../../../` = 3 ups) |
|---|---|---|---|
| `f23bbd63` (original) | Authored at `src/server/boot/plugin-sdk-resolver.ts` | 3 segments (`src/server/boot`) | **Correct** — 3 ups reaches repo root |
| `3762169c` | `__dirname` → `import.meta.dirname` (ESM conversion) | unchanged | unchanged, still correct |
| `f9b42698` | Moved `src/server/boot/` → `src/server/runtime/boot/` | 4 segments | **Broken** — off by one level, string not updated |
| `708e81b2` | Renamed `src/` → `apps/website/src/` | 6 segments (dev) / 5 (compiled) | **Broken further** — off by 3 (dev) / 2 (compiled), string still not updated |

So the default path was momentarily *arithmetically* correct only at original authorship — and even then, only if `packages/sdk/dist/index.js` existed at that moment too, which (per §3) nothing automated ever guaranteed. It has been wrong since at least the `runtime/` move, and every one of the three real boot call sites calls it with **zero arguments** (confirmed by direct read, not inference):

- `apps/website/src/index.ts:302` — `registerPluginSdkResolver();`
- `apps/website/src/cli/commands/serve.ts:157` — `registerPluginSdkResolver();`
- `apps/website/src/cli/commands/export.ts:115` — `registerPluginSdkResolver();`

All three rely on the default. The only call site that overrides it is the certified integration test (`__tests__/integration/plugin-sdk-resolver.integration.test.ts:64`, `sdkModulePath: realSdkPath`), plus two CLI-level integration tests that presumably do the same (not fully read — not needed, they don't call the real boot path). **No test has ever exercised the true default.** Combined with §3 (nothing in dev automation ever produced the SDK's `dist/` either), I see no evidence this has ever worked end-to-end outside of a hand-built local SDK plus a coincidence of directory depth — likely never, not "regressed from working."

**Ownership conclusion:** this is a never-finished/never-verified feature, not a regression any single person or agent caused. Two unrelated, reasonable-looking directory-rename commits (`f9b42698`, `708e81b2`) each silently invalidated it because nothing certified the default path; neither mover had a reason to know this file's relative-path arithmetic existed as a load-bearing computation.

## 5. Options, ranked

**Recommended — Option A: replace the relative-path arithmetic with real Node package resolution for `@tovu/sdk`** (e.g. `createRequire(import.meta.url).resolve("@tovu/sdk")`, or `import.meta.resolve("@tovu/sdk")`). This directly matches ADR-005's own stated assumption (§2 above: "where `@tovu/sdk` actually lives... the runtime binary's own `node_modules`") rather than fighting it, and it's layout-invariant by construction — it doesn't care whether this file sits 3, 5, or 6 levels below repo root, so it can't be broken by the *next* directory rename the way it's already been broken by the last two. `createRequire(...).resolve(...)` already has direct precedent elsewhere in this codebase (`server/inbound/admin-http/admin-static.ts`, `server/runtime/composition/deps.ts`, `platform/observability/otel.ts`, `assistant/mcp-injection.ts`, `platform/mail/adapters/smtp.nodemailer.ts`, `server/inbound/public-http/http/site/worker-sandbox.ts`) — this is an established idiom here, not a new pattern.
- Blast radius: one function, one file. CIC U-002's Binding Constraints (registration-before-reachability ordering) are untouched — they govern *when* registration happens, not *how* the path is computed, so this is a narrow, low-risk change relative to the CIC.
- Caveat, not a blocker for the fix itself but must be called out: this alone does not solve §3/§4's separate gap — dev mode still never builds `packages/sdk/dist`, so a fresh checkout would resolve to the *right* location and still ENOENT until something (dev tooling, or a documented manual step) builds it. That's a distinct piece of work (build/dev tooling) from this one (resolver logic); I'd fix both, but they're separably owned.

**Option B: fix the `..` count to match each layout's actual depth**, branching on environment or computing it dynamically (e.g. count segments from a known anchor). Narrower diff, but reintroduces the exact failure class that has already bitten this function twice on unrelated renames, and doesn't align with the ADR's own resolution-mechanism rationale. Would still need §3/§4's dev-build gap closed. Not recommended given the repo's recent history of exactly this kind of drift.

**Option C: change the build to place `packages/sdk`'s output where the resolver already (wrongly) expects it** — e.g. copy `packages/sdk/dist` into `dist/src/packages/sdk/dist` for compiled, and into `apps/website/src/packages/sdk/dist` for dev. Larger blast radius: touches the root build script, the Dockerfile (which currently builds it correctly in place and would have to stop), and dev tooling, and creates two synchronized copies of the SDK build output. This is precisely the "provision a shim directory per location, keep it in sync" approach ADR-005's own SDK Resolution Mechanism sub-decision already evaluated and rejected (`adr.md:110`, the "shim `node_modules`" runner-up) — for a different reason (per-site vs. per-layout) but the same shape of tradeoff the ADR already argued against. Not recommended.

**My pick: Option A**, plus a follow-up (separately scoped) to make `packages/sdk/dist` actually exist in dev — either `development/scripts/dev.mjs` builds/watches it, or the gap is at minimum documented, since right now a fresh clone has no path to a working `@tovu/sdk` build at all outside Docker.

## 6. Is this the "correct primitive, unwired call site" pattern (8 instances today)?

**No — different shape, related root cause.** In that pattern, the function itself is right and something fails to call it, or calls it with the wrong argument. Here, all three real call sites call `registerPluginSdkResolver()` correctly, exactly as designed (zero args → use the runtime's real build). The **primitive itself is wrong** — a hardcoded relative-path computation that was correct only at authorship and was silently invalidated by two later, unrelated directory renames. The shared root cause across both patterns is the same one this repo's memory already names repeatedly: nothing ever certified the real/default path, only the overridden test seam — so breakage is silent either way. But mechanically: unwired-call-site bugs are "right code, wrong wiring"; this is "wiring is right, the code the wiring calls stopped being right after the tree moved out from under it, undetected for the same reason." Worth tracking as a sibling failure mode, not filing as the same instance.

## What I could not verify (read-only constraints)

- Did not run `createRequire(...).resolve("@tovu/sdk")` or any test — Option A's mechanics are reasoned from Node's documented resolution algorithm and this codebase's own existing `createRequire` call sites, not executed/proven here.
- Did not diff `packages/sdk/dist/index.js`'s currently-on-disk build against current `packages/sdk/src` for staleness — irrelevant to the topology verdict but flagging it as unverified.
- Did not check whether `apps/admin` or `apps/site-chat` have any equivalent `@tovu/sdk` resolution need — out of scope, no reference found in the files read.
