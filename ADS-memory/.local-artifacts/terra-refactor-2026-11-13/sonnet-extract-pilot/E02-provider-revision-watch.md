# E02 MIXED split with a port: provider-revision watcher -> `@jini-ai/plugins/host`

Tovu `apps/website/src/server/runtime/composition/provider-revision-watch.ts` (survey: MOVE `watchProviderRevisions` + `revisionSnapshot`; STAY-PRODUCT `siteProviderRevisions`, SQL over `secrets_vault`). The Tovu key format (`plugin-state:<id>:provider.config`, `providerPluginOf`) becomes the injected `pluginIdOf` port. The positional `schedule(check, intervalMs)` port becomes object-shaped. Behaviour otherwise identical.

## Guards
- Tovu `provider-revision-watch.ts` blob `2166c3fbe86615431e51aad820fec22ee88930af`; `__tests__/provider-revision-watch.unit.test.ts` blob `a76cc6145f2cdf64abfbf931efc29f8af3bbbe80`. `deps.ts` is shared and large: guard by exact old text only.
- Jini `packages/plugins/src/host/index.ts` blob `e358238126e1a0d0d1e0cae993470eb96b6573f5`; `packages/plugins/src/host/provider-revision-watch.ts` must not exist; `rg -n "watchProviderRevisions" packages` must print nothing.

## Jini (commit 1)
1. NEW `packages/plugins/src/host/provider-revision-watch.ts`:
```ts
import type { PluginProviderApplyResult } from './provider-host.js';

/** A provider-config row from a store that records when the key was attached. */
export interface ProviderRevisionRow { readonly id: string; readonly revision: number; readonly attached_at: string }
/** A provider-config row from a store without attachment times. */
export interface SiteProviderRevisionRow { readonly id: string; readonly revision: number }

export interface WatchProviderRevisionsRequired {
  read: () => Promise<readonly ProviderRevisionRow[]>;
  /** The plugin a key id belongs to, or `undefined` for keys that are not provider config. Host-owned key format. */
  pluginIdOf: (required: { keyId: string }) => string | undefined;
  reapply: (required: { pluginId: string }) => Promise<PluginProviderApplyResult>;
}

export interface WatchProviderRevisionsOptional {
  readSite?: () => Promise<readonly SiteProviderRevisionRow[]>;
  schedule?: (required: { run: () => Promise<void>; intervalMs: number }) => () => void;
}

const POLL_INTERVAL_MS = 30_000;

/** Keep site and project revisions distinct even when both stores contain the same provider id. */
function revisionSnapshot({ project, site, pluginIdOf }: {
  project: readonly ProviderRevisionRow[];
  site: readonly SiteProviderRevisionRow[];
  pluginIdOf: WatchProviderRevisionsRequired['pluginIdOf'];
}): Map<string, string> {
  const entries = new Map<string, string[]>();
  for (const [scope, rows] of [['project', project], ['site', site]] as const) for (const row of rows) {
    const pluginId = pluginIdOf({ keyId: row.id });
    if (!pluginId) continue;
    const revisions = entries.get(pluginId) ?? [];
    revisions.push(`${scope}:${row.revision}:${'attached_at' in row ? row.attached_at : ''}`);
    entries.set(pluginId, revisions);
  }
  return new Map([...entries].map(([id, values]) => [id, JSON.stringify(values.sort())]));
}

function intervalSchedule({ run, intervalMs }: { run: () => Promise<void>; intervalMs: number }): () => void {
  const timer = setInterval(() => void run(), intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}

/**
 * One metadata query per store every 30 seconds; both processes observe saved revisions and detachments.
 * Reapplies each plugin whose revision set changed (including appearing or disappearing).
 * @returns Stop function: no reapply runs after it.
 */
export function watchProviderRevisions(
  { read, pluginIdOf, reapply }: WatchProviderRevisionsRequired,
  { readSite = async () => [], schedule = intervalSchedule }: WatchProviderRevisionsOptional = {},
): () => void {
  let previous = new Map<string, string>();
  let running = false;
  let closed = false;
  async function check(): Promise<void> {
    if (running || closed) return;
    running = true;
    try {
      const [project, site] = await Promise.all([read(), readSite()]);
      const next = revisionSnapshot({ project, site, pluginIdOf });
      for (const pluginId of new Set([...previous.keys(), ...next.keys()])) {
        if (!closed && previous.get(pluginId) !== next.get(pluginId)) await reapply({ pluginId });
      }
      previous = next;
    } catch { /* A transient store read must not terminate the site's polling loop. */ }
    finally { running = false; }
  }
  void check();
  const cancel = schedule({ run: check, intervalMs: POLL_INTERVAL_MS });
  return () => { closed = true; cancel(); };
}
```
2. `packages/plugins/src/host/index.ts`: after the line `export * from './provider-host.js';` insert `export * from './provider-revision-watch.js';`
3. NEW `packages/plugins/src/host/__tests__/unit/provider-revision-watch.unit.test.ts`: Tovu tests 1 and 2 (the two that use only fakes; lines 10-49 of the guarded Tovu test) with these mechanical changes: header `import assert from 'node:assert/strict';` + `import { test } from 'vitest';` + `import { watchProviderRevisions } from '../../provider-revision-watch.js';` + `const pluginIdOf = ({ keyId }: { keyId: string }) => /^plugin-state:([a-z0-9-]+):provider\.config$/.exec(keyId)?.[1];`; in each call add `pluginIdOf` to the first object; move `readSite: ...` (test 2) into the second object; `schedule: (run, interval) => { assert.equal(interval, 30_000); check = run; ...` -> `schedule: ({ run, intervalMs }) => { assert.equal(intervalMs, 30_000); check = run; ...`; `schedule: run => {` -> `schedule: ({ run }) => {`. Also add test 3: `test('stop cancels the schedule and no reapply runs after it', ...)` is already covered by test 1's last line; add nothing else.
4. NEW `.changeset/plugins-provider-revision-watch.md`: `"@jini-ai/plugins": minor` / `Add \`watchProviderRevisions\` to \`@jini-ai/plugins/host\`: polls provider-config revisions in one or two stores and reapplies changed plugins; the host injects its key format as \`pluginIdOf\`.`
5. eslint the new .ts files + index.ts. Commit `E02-jini.msg`: `feat(plugins): add host watchProviderRevisions with an injected pluginIdOf port`. Paths: the 3 new files, index.ts... (4 incl. changeset).

## Tovu (commit 2)
1. Census: `rg -n "watchProviderRevisions|provider-revision-watch" apps content development --glob '!**/node_modules/**'` -> only `composition/deps.ts` (lines 25 and 1977), `composition/provider-revision-watch.ts`, `composition/__tests__/provider-revision-watch.unit.test.ts`. Else STOP.
2. `provider-revision-watch.ts`: keep lines 1-8 minus the unused import (delete `import { providerPluginOf } from "#src/features/project-keys/service";`), delete everything from `/** Keep site and project revisions distinct` to the end. Append at the end:
```
// The polling watcher lives in `@jini-ai/plugins/host` (`watchProviderRevisions`); Tovu binds its key
// format there as `pluginIdOf: providerPluginOf` (composition/deps.ts).
```
3. `deps.ts`:
   - `import { createProjectKeys } from "#src/features/project-keys/service";` -> `import { createProjectKeys, providerPluginOf } from "#src/features/project-keys/service";`
   - `import { siteProviderRevisions, watchProviderRevisions } from "./provider-revision-watch.js";` -> `import { siteProviderRevisions } from "./provider-revision-watch.js";`
   - `import { deferDeclaredContentTypePorts } from "@jini-ai/plugins/host";` -> `import { deferDeclaredContentTypePorts, watchProviderRevisions } from "@jini-ai/plugins/host";`
   - the 3-line call (refreshed 11-15 after the args batch wrapped it in `{ registration }`: `  onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ siteId: projectSiteId }) ?? Promise.resolve([]),` / `    readSite: () => siteProviderRevisions({ kernel: kernel as unknown as StorageKernel<unknown>, workspaceId }),` / `    reapply: input => providerPlugins.reapply(input) }) });`) ->
```
  onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ siteId: projectSiteId }) ?? Promise.resolve([]),
    pluginIdOf: providerPluginOf,
    reapply: input => providerPlugins.reapply(input) }, {
    readSite: () => siteProviderRevisions({ kernel: kernel as unknown as StorageKernel<unknown>, workspaceId }),
  }) });
```
   If `providerPluginOf` is already imported elsewhere in deps.ts, STOP.
4. Test file: delete tests 1 and 2 (lines 10-49, moved to Jini). In test 3: `import { siteProviderRevisions, watchProviderRevisions } from "../provider-revision-watch.js";` -> `import { siteProviderRevisions } from "../provider-revision-watch.js";` + new lines `import { watchProviderRevisions } from "@jini-ai/plugins/host";` and `import { providerPluginOf } from "#src/features/project-keys/service";`; the call `watchProviderRevisions({ read: async () => [],` / `readSite: ...,` / `reapply: ...,` / `}, { schedule: run => { checks.push(run); return () => {}; } })` -> first object `{ read: async () => [], pluginIdOf: providerPluginOf, reapply: ... }`, second object `{ readSite: () => siteProviderRevisions({ kernel, workspaceId: "ws" }), schedule: ({ run }) => { checks.push(run); return () => {}; } }`. Keep everything else (it is the Tovu SQL + watcher integration test).
5. eslint the 3 files. Commit `E02-tovu.msg`: `refactor(composition): watch provider revisions with @jini-ai/plugins/host` + body `Tovu keeps the secrets_vault query and binds its key format as pluginIdOf; the fake-only tests moved to Jini.` Paths: the 3 files.

## Common rules (part of this recipe; read before editing)
- HARD RULE: stop before 300k tokens of context; if near it, report what is done and what is left.
- Clones: Tovu `/Users/la/Programming/tovu-codex-trial-terra`, Jini `/Users/la/Programming/jini-terra-base`. Both must report `refactor/terra` from `git branch --show-current`; else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply; expected. Proceed.
- Run NO tests, tsc, builds, installs, lockfile commands, formatters, `--fix`/`--write`. Leave no process running.
- Edit only the files this recipe names. Never touch node_modules, ADS-memory, *.sql, lockfiles.
- STOP-on-mismatch: a deleted/moved file must match its listed blob (`git hash-object`); every old->new edit's OLD text must occur exactly once (or the stated count) at the time you apply it. Any mismatch, or an importer census hit not listed: restore only the files you changed in this recipe (`git show HEAD:<path> > <path>`; `rm` files you created), report SKIPPED with the reason. Never improvise a fix. A skip is a good outcome.
- No Tovu text in Jini: after the Jini edits, `rg -n -i "tovu|site-chat|apps/(admin|website)" <every Jini file you created or edited>` must print nothing.
- Why-comments move, never deleted (the recipe says where each goes).
- Checks, only these: `node_modules/.bin/eslint <touched .ts/.tsx files>` run from each clone root; `node --check` for touched .js/.mjs. In Tovu, an unresolved-import error for a NEW Jini specifier is expected (Tovu's node_modules hold npm 0.7.x until the D1 link): record it, do not fix. Any other eslint error caused by your edit: fix only if it is a literal consequence of the edit (unused import, import order); otherwise STOP.
- Git: Jini commit FIRST, then Tovu. New file: `git add -- <path>`. Deleted file: `git rm -q -- <path>`. Commit: `git commit -F <msgfile> -- <every path>`. Never `add -A`/`add .`, stash, checkout, reset, rebase, push, amend. Message files go in `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/73a40820-b1fa-4c88-a55c-409efcaf4ee6/scratchpad/`; each message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Report: DONE or SKIPPED (+reason), Jini SHA, Tovu SHA, every path changed, eslint result, anything that differed from the recipe, tokens used.
