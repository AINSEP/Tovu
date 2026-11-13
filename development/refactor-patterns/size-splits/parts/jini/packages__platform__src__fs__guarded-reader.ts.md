### jini:packages/platform/src/fs/guarded-reader.ts
- **Over:** `createGuardedFileReader` 329
- **Phase:** now · **Batch:** size-30
- **Tests:** `src/fs/__tests__/guarded-reader.binary.test.ts`, `…/guarded-reader.boundaries.test.ts`, `…/guarded-reader.traversal-budget.test.ts`, `…/guarded-reader.descriptor.test.ts` and any other `src/fs/__tests__/guarded-reader*.test.ts` (`pnpm --filter @jini-ai/platform exec vitest run <path> --maxWorkers=2`)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | arg checks, `descriptorFlags`, fs destructure, limit consts, `return {` | reader wiring (stays) |
| B | `foldFsNameForDenylist`, `normalizeFsRelativePath`, `isWithin`, `assertWellFormedRelativePath`, `walkBoundReached`, `interface FsWalkState`, `interface ReadFsFileResult` | pure helpers (read no closure locals) |
| C1 | `isDeniedFsFileName`, `isDeniedFsPathSegment`, `assertRequestedPathNotDenied`, `assertEffectiveTargetNotDenied` | deny rules |
| C2 | `assertNoSymlinkEscape`, `resolveFsFilePath` | containment / path resolution |
| S | `statOrFsPathError`, `statRegularFile` | shared stat refusals (used by listing AND both read paths) |
| O | `openNoFollow`, `openValidatedDescriptor` | shared descriptor open + validation (used by BOTH read paths) |
| D | `visitFsDirEntry`, `walkFsDir`, `listFsFiles` | bounded directory listing |
| E | `looksBinary`, `readFsFile`, `readBoundedSync` | synchronous bounded reads |
| F | `openFsFileForRead`, `readBoundedStream`, `createBoundedStream` | streamed bounded reads (`readBoundedStream` calls `createBoundedStream`: they stay together) |

- **Dependency graph (settled; every edge is an explicit input):** C1 ← denyRules, fs (`existsSync`, `realpathSync`), B. C2 ← rootPath, fs, limits (`maxWalkDepth`), B. S ← fs (`statSync`). O ← fs, descriptorFlags, descriptorRead (+ module-level `assertDescriptorStat`). D ← rootPath, fs, limits, excludedListingDirs, C1, C2 (`resolveFsFilePath`), S (`statOrFsPathError`). E ← rootPath, fs, limits, descriptorFlags, C2 (`resolveFsFilePath`), S (`statRegularFile`), O (`openValidatedDescriptor`). F ← rootPath, fs, descriptorFlags, C2, S (`statRegularFile`), O (`openValidatedDescriptor`). No factory calls any returned function while being constructed, so construction order only has to follow the arrows.
- **Splits** (same file, module level above `createGuardedFileReader`; each factory ≤ 50 counted lines; second options object `_options: Record<string, never> = {}` on each):
  1. Lift unit B verbatim (each with its "why" comment).
  2. `createDenyChecks({ denyRules, fs }: CreateDenyChecksInput)` ← C1; returns its four functions.
  3. `createPathResolver({ rootPath, fs, limits }: CreatePathResolverInput)` ← C2; re-declares `const MAX_WALK_DEPTH = limits.maxWalkDepth;` and `const { existsSync, realpathSync } = fs;` with the original expressions; returns `{ assertNoSymlinkEscape, resolveFsFilePath }`.
  4. `createStatChecks({ fs }: CreateStatChecksInput)` ← S; returns `{ statOrFsPathError, statRegularFile }`.
  5. `createDescriptorOpener({ fs, descriptorFlags, descriptorRead }: CreateDescriptorOpenerInput)` ← O; returns `{ openValidatedDescriptor }`.
  6. `createGuardedLister({ rootPath, fs, limits, excludedListingDirs, deny, paths, stat }: CreateGuardedListerInput)` ← D; returns `{ listFsFiles }` (re-declare the `MAX_*` / `EXCLUDED_LISTING_DIR_NAMES` consts it reads with the same expressions).
  7. `createGuardedSyncReads({ rootPath, fs, limits, descriptorFlags, paths, stat, descriptor }: CreateGuardedSyncReadsInput)` ← E; returns `{ readFsFile }`.
  8. `createGuardedStreamReads({ rootPath, fs, descriptorFlags, paths, stat, descriptor }: CreateGuardedStreamReadsInput)` ← F; returns `{ openFsFileForRead }`.
  9. Main keeps the arg validation (`if (!rootPath)`, limits loop) and `descriptorFlags` FIRST, then constructs in this order: `deny` (2), `paths` (3), `stat` (4), `descriptor` (5), lister (6), sync reads (7), stream reads (8); destructures what `return {` uses; `return {` unchanged. Input types: `limits: GuardedReaderLimits`, `fs: GuardedReaderFilesystem`, `descriptorRead: DescriptorReadPolicy | undefined`, `descriptorFlags: ReturnType<typeof descriptorOpenFlags> | undefined`, `deny`/`paths`/`stat`/`descriptor` = `ReturnType<typeof create…>`.
- **Importers to update:** none (exports unchanged; package entry `./fs/guarded-reader` is this file).
- **After:** file ~490; `createGuardedFileReader` ~40; every factory 20–48.
- **Risks / notes:** security-critical (containment, symlink escape, deny rules, byte caps): every refusal message and check order must stay byte-identical. Validation (`if (!rootPath)`, limits loop, `descriptorOpenFlags`) must still run before any factory. If `outline.mjs --check` shows the file > 500 after the split: move S, O, E, F (their factories + input types) and the module-level `assertDescriptorStat`, `isByteCountWithin`, `errorText`, `collectBoundedChunks` to sibling `guarded-reader-reads.ts`; the types they need (`DescriptorCapabilities`, `DescriptorReadPolicy`, `GuardedReaderFilesystem`) move there too and `guarded-reader.ts` (the package entry) re-exports them unchanged (rule 4). The sibling never imports `guarded-reader.ts`.
