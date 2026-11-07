# Import fixes

Started 2026-11-07 19:57:25 UTC (11:57:25 PST). Deadline 21:57:25 UTC.
Branches: `cloud/import-fix` in both repositories. Bases: Tovu `b45d2ee759009b08d04268ef9ddcf2b6d0f60671`; Jini `32e9c9c2128805b20d1a562d6f0053d1c4604b52`.

## Item 1 — done

Imported menus and forms follow the same keep-off rule as pages. Menus use existing `items` mode: draft menus still resolve, so draft status would not suffice. The stored HTML remains recoverable by choosing HTML mode. Forms use existing `disabled` status, preserving their authoring envelope unchanged. Innocent menus/forms and marker-only pages remain live. Existing trusted theme behavior remains covered by the restore tests. Notices use the existing 80-character title limit and 20-item cap per kind plus a summary.

Changed test command (Tovu root):

```sh
node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=2 apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts
```

Node tests use `--test-concurrency=2`; Node does not accept Vitest worker flags. Vitest commands will use `--maxWorkers=2 --minWorkers=1`.

- Red: 42 passed, 1 failed (`AssertionError [ERR_ASSERTION]`, menu remained in HTML mode).
- Mutation: menu-only implementation: form remained active, caught by `AssertionError [ERR_ASSERTION]`; 41 passed, 2 failed (the second exposed changed missing-table error order; corrected before final validation).
- Mutation: bypass menu keep-off: 42 passed, 2 failed (menu state and notice-cap checks).
- Green: 44 passed, 0 failed. An initial cap fixture used identical titles and encountered existing notice deduplication; unique titles now exercise the intended cap.
- No-emit check: `./node_modules/.bin/tsc -p /workspace/work/tsconfig-item1.json --noEmit`, exit 0. Config extends Tovu's tsconfig and includes the changed production file and its dependency graph, with the repository's typeRoots.
- Production lines added: 26; test lines added: 58.
- Cost once per import: two table reads of eligible menu/form JSON; O(total selected JSON + HTML bytes) memory/parsing and one update per kept-off row (menu document bytes or form status). Notices add O(item count × bounded title/message size) transient memory; stored notices cap at 42 strings for these two kinds. No per-page runtime cost.

## Items 2–6 — pending

## Base/setup findings (separate from regression reds)

- Tovu's referenced `AI-Dev-Shop/AGENTS.md` is absent; the sibling Jini toolkit was read. No framework files changed.
- Initial restore discovery failed with `SyntaxError` for stale Jini exports: `fileDigest`, then `validateScripts`, `mediaFileReplacementRecord`, and `accessApprovalDetails` while local output was being rebuilt.
- Initial broad Tovu no-emit check reported pre-existing/dependency-output diagnostics; final report will separate their names/counts from changed-code checks.
- Host pnpm 11.25.0 failed with `ERR_PNPM_UNSUPPORTED_ENGINE`; `corepack pnpm@10.33.2` meets the repository requirement.
- Setup recursive build stopped with `ERR_MODULE_NOT_FOUND` (`esbuild` in agent-plugins' Cloudflare build) and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Required platform/CMS outputs built; restore tests subsequently ran normally. No unrelated source fixes made.
- First log redirection failed because the scratch directory did not yet exist; created `/workspace/work`.
- First external scratch tsconfig reported `TS2688` (node types); setting the repository typeRoots corrected the check.

## Other observed bugs

None confirmed beyond the requested six. Base/setup failures are listed above.

Work continues in item order. Final proof, SHAs and elapsed time will replace this progress footer.
