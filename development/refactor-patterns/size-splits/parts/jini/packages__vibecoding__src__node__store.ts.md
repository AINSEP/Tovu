### jini:packages/vibecoding/src/node/store.ts
- **Over:** `createProjectStore` 246 (file 411)
- **Phase:** now · **Batch:** size-41
- **Tests:** `packages/vibecoding/src/node/__tests__/store-recovery.test.ts`, `packages/vibecoding/src/node/__tests__/store-symlink.security.test.ts`, `packages/vibecoding/src/node/__tests__/unit/project-contracts.unit.test.ts`, `packages/vibecoding/src/node/__tests__/project-turn.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `currentPath`, `objectPath`, `manifestPath`, `checkpoint`, `metadataLimit`, `readCurrent`, `manifest`, `object` | state-dir paths + verified reads (core) |
| B | `prepare`, `writeObject` | stage objects/manifest before selection |
| C | `observations`, `scan`, `scanFile`, `readWorkingFile` | fingerprint/scan the live tree |
| D | `removeManaged`, `prune`, `pruneFolder`, `pruneRenamedFolders`, `materialize`, `removeBlockingFolder` | write a revision onto disk |
| E | `preflight`, `assertManagedDestination`, `assertRenamedFolders`, `assertRemovableFolder` | refuse unsafe obstructions before commit |
| F | `recover`, `select`, `observe`, `collect`, return | journal + lifecycle (stays) |

- **Splits** — the factory has no mutable `let`s, so groups lift cleanly. Because the file would pass ~470 with typed inputs, put them in siblings:
  1. NEW `store-scan.ts` — job: scan the working tree. `createTreeScanner({ paths, limits, manifest, object }: CreateTreeScannerInput): { observations, scan, readWorkingFile }` ← unit C (`scanFile` inner). Comments "Capture hashes only files…", "Read a published live file…" move.
  2. NEW `store-materialize.ts` — job: put a revision on disk. `createMaterializer({ paths, filesystem, checkpoint, manifest, object, observations, currentPath }: CreateMaterializerInput): { materialize, pruneFolder }` ← unit D (all inner functions, comments "Prune only directories…", "On case-insensitive volumes…", "Pre-read/verify every object…" move). If `removeBlockingFolder` is used by `preflight`, return it too.
  3. NEW `store-preflight.ts` — job: obstruction checks. `createPreflight({ paths, manifest, object, removeBlockingFolder? }: CreatePreflightInput): { preflight }` ← unit E with comments.
  4. HELPER in `store.ts`: `createObjectStager({ paths, limits, filesystem, checkpoint, manifestPath, manifest, objectPath, object }: CreateObjectStagerInput): { prepare }` ← unit B (same file; "Prepare every durable dependency…" comment).
  New files import `Manifest`, `ManifestFile`, `Current`, `Fingerprint` helpers from `./store.js` → CYCLE. Move first the shared pure pieces they need (`Manifest`, `ManifestFile`, `Fingerprint`, `fingerprint`, `sameFingerprint`, `removedFolders`, `inside`, `corrupt`, `missing`, `lstatIfPresent`, `statIfPresent`, `regularPath`, `readBounded`, `compareCodeUnits`) into NEW `store-fs.ts`; `store.ts` imports them and keeps `export type { Manifest, ManifestFile } from './store-fs.js'` ONLY if `store.ts` is reachable from the `./node` entry by name (check `src/node/index.ts`: if it does `export … from './store.js'`, update that barrel instead and drop the re-export).
- **Importers to update:** `rg -n "Manifest\b|ManifestFile" packages/vibecoding/src --glob '!**/store*.ts'`; `src/node/index.ts` barrel if it re-exports these.
- **After:** `createProjectStore` ~70; store.ts ~230; store-fs ~90; store-scan ~55; store-materialize ~75; store-preflight ~55.
- **Risks / notes:** security-sensitive (symlink/containment checks) — `store-symlink.security.test.ts` must stay green. Functions are hoisted declarations used before definition today; as factory results they must be created before use (create scanner → materializer → preflight → stager in that order). Recommend Opus execution.
