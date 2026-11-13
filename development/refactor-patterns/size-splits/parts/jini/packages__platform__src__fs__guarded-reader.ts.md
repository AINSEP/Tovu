### jini:packages/platform/src/fs/guarded-reader.ts
- **Over:** `createGuardedFileReader` 329
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/guarded-reader.binary.test.ts`, `…/guarded-reader.boundaries.test.ts`, `…/guarded-reader.traversal-budget.test.ts`, `…/guarded-reader.descriptor.test.ts` and any other `src/fs/__tests__/guarded-reader*.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | arg checks, `descriptorFlags`, fs destructure, limit consts, `return {` | reader wiring (stays) |
| B | `foldFsNameForDenylist`, `normalizeFsRelativePath`, `isWithin`, `assertWellFormedRelativePath`, `walkBoundReached`, `interface FsWalkState`, `interface ReadFsFileResult`, `readBoundedStream` | pure helpers (read no closure locals) |
| C | `isDeniedFsFileName`, `isDeniedFsPathSegment`, `assertNoSymlinkEscape`, `resolveFsFilePath`, `assertRequestedPathNotDenied`, `assertEffectiveTargetNotDenied` | path policy: deny rules + containment |
| D | `visitFsDirEntry`, `walkFsDir`, `listFsFiles` | bounded directory listing |
| E | `statOrFsPathError`, `statRegularFile`, `looksBinary`, `readFsFile`, `readBoundedSync` | synchronous bounded reads |
| F | `openValidatedDescriptor`, `openFsFileForRead`, `openNoFollow`, `createBoundedStream` | descriptor/stream reads |

- **Splits** (same file, module level above `createGuardedFileReader`, order B, C, D, E, F):
  1. Lift unit B verbatim (each with its "why" comment). Before lifting each, confirm its body reads no closure local (outline shows none for these).
  2. HELPER `createGuardedPathPolicy({ rootPath, denyRules, fs, limits }: CreateGuardedPathPolicyInput): GuardedPathPolicy` ← unit C; inside, re-declare `const { existsSync, realpathSync } = fs;` and `const MAX_WALK_DEPTH = limits.maxWalkDepth;` (same expressions as the original). Returns the six functions.
  3. HELPER `createGuardedLister({ rootPath, fs, limits, excludedListingDirs, policy }: CreateGuardedListerInput): { listFsFiles }` ← unit D (re-declare the `MAX_*` / `EXCLUDED_LISTING_DIR_NAMES` consts and fs functions it reads with the same expressions).
  4. HELPER `createGuardedSyncReads({ rootPath, fs, limits, descriptorFlags, policy }: CreateGuardedSyncReadsInput): { statRegularFile; readFsFile }` ← unit E.
  5. HELPER `createGuardedStreamReads({ rootPath, fs, descriptorRead, descriptorFlags, policy, statRegularFile }: CreateGuardedStreamReadsInput): { openFsFileForRead }` ← unit F (`createBoundedStream` returned too if `openFsFileForRead` is not its only caller).
  6. Main keeps the arg validation (`if (!rootPath)`, limits loop), `descriptorFlags`, calls the four factories in that order, destructures the names `return {` uses, returns unchanged. `GuardedPathPolicy` etc. = `ReturnType<typeof …>`; `limits: GuardedReaderLimits`, `fs: GuardedReaderFilesystem`, `descriptorRead`: the existing `DescriptorReadPolicy | undefined`.
- **Importers to update:** none (exports unchanged; package entry `./fs/guarded-reader` is this file).
- **After:** file ~470; `createGuardedFileReader` ~40; `createGuardedPathPolicy` ~75; `createGuardedLister` ~70; `createGuardedSyncReads` ~60; `createGuardedStreamReads` ~65.
- **Risks / notes:** security-critical (containment, symlink escape, deny rules, byte caps): every refusal message and check order must stay byte-identical. Validation (`if (!rootPath)`, limits loop, `descriptorOpenFlags`) must still run before any factory. If `outline.mjs --check` shows the file > 500 after the split, STOP and report — do not improvise a sibling.
