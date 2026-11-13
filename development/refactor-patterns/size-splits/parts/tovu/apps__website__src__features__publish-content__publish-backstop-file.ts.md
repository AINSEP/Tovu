### tovu:apps/website/src/features/publish-content/publish-backstop-file.ts
- **Over:** `createRawFileSitePort` 102 (file 130, under)
- **Phase:** after-move (MIXED) · **Batch:** size-50
- **Tests:** `apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts`, `apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-errors.unit.test.ts`, `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`, `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `missing`, `sha`, `LINK_REFUSAL`, `NOT_REGULAR_REFUSAL`, `BackstopFilesystem`, `lstatOrNull`, `componentsRefusal` | no-follow filesystem probes (stay) |
| B | inner `privateDir`, `parents`, `readBackup` of `createRawFileSitePort` | directory/backup steps that need only `root` + `filesystem` → module level |
| C | `createRawFileSitePort` (`check`, `target`, `read`, `alreadyRestored`, `removeCreatedFile`, `replace`, returned port) | the site-file port (stays) |

- **Splits:**
  1. HELPERS (module level, directly above `createRawFileSitePort`, after `componentsRefusal`), each opening with the same destructure the port uses (`const { mkdirSync, chmodSync } = filesystem;` etc.) so calls stay unbound exactly as today:
     - `ensurePrivateDir({ root, name, filesystem }: EnsurePrivateDirInput): string` ← inner `function privateDir(name: ".publish-staging" | ".publish-previous"): string {` body (keeps its "lstat never follows a link" comment).
     - `ensureParentDirs({ root, relPath, filesystem }: EnsureParentDirsInput): void` ← inner `function parents(relPath: string): void {` body.
     - `readBackupBytes({ backup, filesystem }: ReadBackupBytesInput): Buffer | null` ← inner `function readBackup(backup: string): Buffer | null {` body, with its `/** A backup's bytes ... */` doc.
  2. In `createRawFileSitePort`, delete the three inner functions and replace every call: `privateDir(x)` → `ensurePrivateDir({ root, name: x, filesystem })`, `parents(p)` → `ensureParentDirs({ root, relPath: p, filesystem })`, `readBackup(b)` → `readBackupBytes({ backup: b, filesystem })` (call sites: inside `replace` and the returned object). Drop now-unused names from the port's own destructure only if eslint reports them unused.
- **Importers to update:** none (helpers private; export unchanged).
- **After:** file ~138; `createRawFileSitePort` ~78; helpers ~9 each.
- **Risks / notes:** `filesystem` is the injected fake in tests — helpers must read it from the passed object, never default to `fs`. Keep statement order inside each body.
