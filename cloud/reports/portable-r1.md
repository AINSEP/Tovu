# portable-r1: Base merge of cloud/combine into cloud/plugins-anywhere (2026-11-07)

Scope: merge `cloud/combine` into `cloud/plugins-anywhere` in Jini and Tovu, regenerate the Jini
plugin catalog, run the focused test groups, and check the gate. No other source changes.

Toolchain: Node 24.2.0, pnpm 10.33.2 (Jini, via corepack), npm 11.3.0 (Tovu).
Checkout roots: Jini `/home/user/Jini`, Tovu `/home/user/Tovu`.
Raw output for every step: `cloud/reports/raw/portable-r1/<step>.txt`.

## Tips used

| Repo | Side A (`cloud/plugins-anywhere`) | Side B (`cloud/combine`, pinned) | Branch |
|---|---|---|---|
| Jini | `40d14a9727eb5a43eeb8fd57ad35b4262eeb2ff4` | `7935d01e43f271bb6e235e71724d287e4fba6c45` (contains `01490e122`) | `cloud/portable-r1` |
| Tovu | `cdbc6ccef536f9b198cb45264e2b30bb9f3e6204` | `73fa8a730acd04c9ad344e43591200a39ffdadb1` (contains `a76bb010b`) | `cloud/portable-r1` |

## Commits pushed

| Repo | SHA | What |
|---|---|---|
| Jini | `7b162ec98` | merge of side B into side A (clean, no conflicts) |
| Jini | `b747e4b8c` | regenerated `packages/plugin-catalog/catalog.json` |
| Tovu | `f85923a7e` | merge of side B into side A, two conflicts resolved by the conflict rule |
| Tovu | (this commit) | this report and raw output |

**Frozen merged Tovu SHA (baseline for later rounds): `f85923a7e`** (the merge commit; this report
commit adds only `cloud/reports/`).

## Jini steps

1. `git merge --no-ff 7935d01e43f271bb6e235e71724d287e4fba6c45` — clean, merge commit `7b162ec98`. (`jini-1-merge.txt`)
2. `CI=true pnpm install --frozen-lockfile` — exit 0. (`jini-2-install.txt`)
3. `pnpm --filter @jini-ai/core run build` — exit 0; `pnpm --no-bail -r build` — exit 0, no errors. (`jini-3a-core-build.txt`, `jini-3b-build.txt`)
4. `pnpm --filter @jini-ai/plugin-catalog generate` — exit 0. One file changed, committed as `b747e4b8c`:
   cloudflare digests gain `lib/cms-forms.mjs` and `worker/portable-validation.mjs`, and
   `lib/forms.mjs` / `worker/forms-receiver.mjs` digests change (both sides' cloudflare changes meeting). (`jini-4-catalog-generate.txt`)
5. Focused tests:
   - `pnpm --filter @jini-ai/plugin-catalog test -- --maxWorkers=2` — 1 file, 65/65 passed. (`jini-5a-catalog-test.txt`)
   - `pnpm exec vitest run scripts/__tests__/plugin-release-consistency.test.ts scripts/__tests__/check-package-layers.test.ts --maxWorkers=2 --minWorkers=1` — 81 passed, **1 failed** (see Reds). (`jini-5b-scripts-tests.txt`)
     Note: with `--maxWorkers=2` alone, vitest 2.1.9 aborts before running any test with
     `RangeError: options.minThreads and options.maxThreads must not conflict`; `--minWorkers=1` was
     added only to satisfy that check.
   - `pnpm --filter @jini-ai/agent-plugins test <the six lifecycle unit files> --maxWorkers=2 --minWorkers=1` — 6 files, 110/110 passed. (`jini-5c-agent-plugins-tests.txt`)
   - `node --test --test-concurrency=1 packages/agent-plugins/cloudflare/__tests__/bundled-package.test.mjs packages/agent-plugins/higgsfield-media/__tests__/bundled-package.test.mjs` — 11/11 passed. (`jini-5d-node-test.txt`)
   - `pnpm --filter @jini-ai/agent-plugins run typecheck` — exit 0. (`jini-5e-typecheck.txt`)
   - `pnpm guard:plugins` — exit 0. (`jini-5f-guard-plugins.txt`)

## Tovu steps

1. `git merge --no-ff 73fa8a730acd04c9ad344e43591200a39ffdadb1` — exactly two textual conflicts, as expected:
   - `apps/website/src/features/agent-plugins/__tests__/manifest.default-tools-read.test.ts`
   - `apps/website/src/features/agent-plugins/__tests__/unit/bundled-higgsfield-video-docs.unit.test.ts`

   `apps/admin/src/features/plugins/AgentPluginRow.tsx` and `apps/admin/src/lib/api.ts` auto-merged.
   Resolution: the combine-side block, with only `extensions.tovu` → `extensions.jini`,
   `tovuDefaultTools` → `defaultTools`, `tovuAuthMode` → `authMode`. Merge commit `f85923a7e`. (`tovu-1-merge.txt`)
2. `npm ci` — exit 0; `npm run build --workspace @tovu/sdk` — exit 0;
   `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` — exit 0 (68 links);
   `npm --prefix packages/contracts run build` — exit 0. (`tovu-2a..2d-*.txt`)
3. `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1`
   over `manifest.default-tools-read.test.ts` and the 15 listed `unit/*.unit.test.ts` files — 250 tests,
   247 passed, **3 failed** (see Reds). (`tovu-3-tests.txt`, first line is the exact command)
4. `npx tsc -p tsconfig.json --noEmit` — exit 0, no errors. (`tovu-4-tsc.txt`)

## Conflict-rule diffs (full text in `tovu-1-conflict-diffs.txt`)

### Against side A (`cdbc6ccef`): only title, comment and the 8/3/5 values change

```diff
--- manifest.default-tools-read.test.ts
-test("bundled Higgsfield declares only the two evidenced read tools and no sign-in allow defaults", async () => {
+test("bundled Higgsfield declares the reviewed sign-in grants and independent read trust", async () => {
@@
-  assert.deepEqual(manifest.extensions.jini.mcpServers.higgsfield.defaultTools, { read: ["models_explore", "job_status"] });
+  assert.deepEqual(manifest.extensions.jini.mcpServers.higgsfield.defaultTools, {
+    allow: ['generate_image', 'generate_video', 'models_explore', 'job_status', 'jobs_wait', 'show_generations', 'reveal_generation', 'show_generation_by_ids'],
+    write: ['generate_image', 'generate_video', 'reveal_generation'],
+    read: ['models_explore', 'job_status', 'jobs_wait', 'show_generations', 'show_generation_by_ids'],
+  });
   const parsed = parseAgentPluginMcpConfig({ value: raw }, { pluginManifest: manifest });
   assert.equal(parsed.ok, true);
   if (!parsed.ok) throw new Error("invalid bundle");
   assert.equal(remote(parsed.config.servers.higgsfield)?.authMode, "oauth");
+  assert.deepEqual(remote(parsed.config.servers.higgsfield)?.defaultTools, {
+    allow: [ ...same 8... ],
+    write: [ ...same 3... ],
+    read: [ ...same 5... ],
+  });

--- unit/bundled-higgsfield-video-docs.unit.test.ts
-  // The manifest supplies read defaults, so documentation must not imply installation grants writes.
-  assert.deepEqual(manifest.extensions.jini.mcpServers.higgsfield.defaultTools, { read: ['models_explore', 'job_status'] });
+  // Browser sign-in grants the reviewed setup lists; installation alone does not authorize writes.
+  assert.deepEqual(manifest.extensions.jini.mcpServers.higgsfield.defaultTools, {
+    allow: [ ...same 8... ],
+    write: [ ...same 3... ],
+    read: [ ...same 5... ],
+  });
```

### Against side B (`73fa8a730`): only the three key renames

In `manifest.default-tools-read.test.ts` every difference is `tovuDefaultTools` → `defaultTools`
(8 lines, including the auto-merged lines outside the conflict hunk that side A had already renamed),
`manifest.extensions.tovu` → `manifest.extensions.jini` (1 line) and `tovuAuthMode` → `authMode`
(1 line). In `bundled-higgsfield-video-docs.unit.test.ts` the only difference is
`manifest.extensions.tovu.mcpServers.higgsfield.tovuDefaultTools` →
`manifest.extensions.jini.mcpServers.higgsfield.defaultTools` (1 line). Exact hunks are in the raw file.

## Reds, by name

| Repo | Test | Pre-existing in `full-tests.md`? | Merge-caused? |
|---|---|---|---|
| Jini | `scripts/__tests__/plugin-release-consistency.test.ts` › `imports the release preparation path in Node without running a release` | not listed (Jini test; that report covers Tovu) | No. `SyntaxError: The requested module './scripts/publish-pending.ts' does not provide an export named 'preparePluginRelease'`: under `node --import tsx --input-type=module -` the stdin import loads the `.ts` file as CommonJS (exports only `default`, `module.exports`). The test, `scripts/publish-pending.ts`, the root `package.json` (no `type` field) and the tsx lockfile entries are unchanged from side A. |
| Tovu | `unit/bundled-higgsfield-media-package.unit.test.ts` › `SKILL.md forbids inventing a cause for an absent or refused federated tool` | not listed | No (see below) |
| Tovu | `unit/bundled-higgsfield-media-package.unit.test.ts` › `SKILL.md is honest that the cold start leaves chat — the enable step, and TOVU_PUBLIC_URL` | not listed | No (see below) |
| Tovu | `unit/bundled-higgsfield-media-package.unit.test.ts` › `SKILL.md forbids the two wrong recoveries — silent media_generate_asset, and re-attaching by hand` | not listed | No (see below) |

The three Tovu reds assert text (`/invented/i`, `/plugins_set_enabled/`, `/media_generate_asset/`)
in the Higgsfield `SKILL.md`, which the test reads from the linked Jini package. Both inputs are
byte-identical to side A: `git diff cdbc6ccef HEAD -- <test>` is empty in Tovu and
`git diff 40d14a972 HEAD -- packages/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md`
is empty in Jini. Side A's `SKILL.md` contains none of the three strings; side B's contains each once.
So the same three fail on the unmerged side A pair. Not fixed here (no source edits in this round).

Not red: `unit/bundled-deploy-package.unit.test.ts` — all its tests pass after the merge
(`full-tests.md` had recorded 2 not-ok outcomes for it). Both Higgsfield conflict-rule tests pass.

## Gate

| Item | Result |
|---|---|
| Both Higgsfield tests pass | **passed** — `✔ bundled Higgsfield declares the reviewed sign-in grants and independent read trust`, `✔ Higgsfield setup documents video and its write grant without claiming a deployment-wide ban` |
| The manifest's Higgsfield grants are byte-identical to side A | **passed** — see below |
| Every other red listed, marked pre-existing if in `full-tests.md` | **passed** — four reds above, none listed in `full-tests.md`, none merge-caused |
| `bundled-deploy-package` temp-path failures | **passed** — fixed by the merge; nothing to list |
| Fix only what the merge caused | **passed** — no fixes were needed beyond the conflict rule |

How the grant check was done (`gate-higgsfield-grants.txt`): in Tovu the Higgsfield plugin is
selected from `@jini-ai/agent-plugins` (there is no `content/agent-plugins/higgsfield-media`), so the
manifest is Jini's `packages/agent-plugins/higgsfield-media/plugin.json`.

- `git diff --stat 40d14a972 HEAD -- packages/agent-plugins/higgsfield-media/plugin.json packages/agent-plugins/higgsfield-media/mcp.json` is empty.
- sha256 of `JSON.stringify(extensions.jini.mcpServers.higgsfield)` is
  `fb6f317370753d94e47f0b51ebdf4b5a09f7a06518cf29c994b7bbf4808adc30` at both side A and the merged HEAD.
- sha256 of the file the Tovu tests read through the link
  (`node_modules/@jini-ai/agent-plugins` → `/home/user/Jini/packages/agent-plugins`) equals the side A
  git blob: `deefabf2df17c0db58bee19e473086ce5d9f57995a1f0ba4b2ff6cffbecc6899`.

## Housekeeping

- No test process left running (`pgrep -af "vitest|node --test"` empty).
- A secret and sensitive-detail scan was run on the authored diffs (the two resolved test files,
  the regenerated catalog, this report and the raw files) before each push: no keys, tokens or
  passwords found.
