/** Explicit SQLite maintenance entrypoint. Preview opens read-only; apply holds exclusive admission.
 * No migration, owner bootstrap, schedule, file listing or immediate object deletion occurs here. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openNativeSqlite } from '../apps/website/src/platform/db/kernel/drivers/sqlite.js';
import { contentKernel } from '../apps/website/src/platform/db/content-kernel.js';
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo } from '../apps/website/src/platform/db/repos/media-repo.js';
import { SqlEntryRefsRepo } from '../apps/website/src/platform/db/repos/entry-refs-repo.js';
import { SqlOutboxAdapter } from '../apps/website/src/platform/db/repos/outbox-repo.js';
import { SqlitePostRepo } from '../apps/website/src/features/post/repo.sqlite.js';
import { runFormFileMaintenance } from '../apps/website/src/features/forms/form-file-maintenance.js';

/** Parse explicit selection and one resumable batch; destructive work always requires --apply.
 * @returns Validated selection or help without opening a database.
 * @throws TypeError for unknown/positional flags or absent database/workspace selection.
 * @complexity O(argument bytes), no I/O.
 */
export function parseFormsMaintenanceArgs({ argv }: { argv: string[] }, _optional = {}) {
  const { values } = parseArgs({ args: argv, options: {
    database: { type: 'string' }, workspace: { type: 'string' }, after: { type: 'string' },
    apply: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (!values.help && (!values.database || !values.workspace)) throw new TypeError('Select an existing SQLite database with --database and its workspace with --workspace. Use --help for usage.');
  return { ...values };
}

/** Open only the explicitly selected existing database; applying requires exclusive admission.
 * @returns One Jini reconciliation report. A full page returns nextAfter for an explicit next run.
 * @throws Database/admission failures before mutation; per-candidate uncertainty is in the report.
 * @complexity One connection and at most 100 candidate inspections; no file bytes are read.
 */
export async function runFormsMaintenanceCommand(
  { database, workspace, after, apply = false }: { database: string; workspace: string; after?: string; apply?: boolean },
  _optional = {},
) {
  const native = openNativeSqlite(database, { fileMustExist: true, readonly: !apply, timeout: 0 });
  try {
    // Keep EXCLUSIVE mode until close. Another site's owner must not race this offline apply.
    if (apply) native.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; ROLLBACK;');
    const kernel = contentKernel(native);
    const exists = await kernel.run(db => db.selectFrom('workspaces').select('id').where('id', '=', workspace).executeTakeFirst());
    if (!exists) throw new Error('The selected workspace is absent from this database. No form files were changed.');
    const media = { mediaRepo: new SqlMediaRepo(kernel), blobRepo: new SqlAssetBlobRepo(kernel), renditionRepo: new SqlAssetRenditionRepo(kernel),
      entryRefsRepo: new SqlEntryRefsRepo(kernel), postRepo: new SqlitePostRepo(kernel) };
    return await runFormFileMaintenance({ kernel, workspaceId: workspace, media, outbox: new SqlOutboxAdapter(kernel), clock: { nowMs: () => Date.now() } }, { apply, ...(after === undefined ? {} : { after }) });
  } finally { native.close(); }
}

const explanations = {
  'proven-orphan': 'The exact terminal form-upload record matches and no live or restorable owner was found.',
  'missing-evidence': 'No verified terminal upload record matches. A missing submission or matching filename is insufficient; the file was kept.',
  owned: 'A live, trashed, shared or retained reference still owns the file; it was kept.',
  unknown: 'The file identity or retained snapshot ownership could not be verified; the file was kept.',
  'inspection-failed': 'An ownership read failed; the file was kept without changes.',
  'protection-failed': 'Private ownership could not be confirmed; cleanup was not attempted.',
  'cleanup-failed': 'Cleanup failed after private protection; the file remains private for a later explicit retry.',
} as const;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseFormsMaintenanceArgs({ argv: process.argv.slice(2) });
  if (args.help) {
    console.log('Usage: node --import tsx scripts/forms-maintenance.ts --database <existing content.db> --workspace <id> [--after <media-id>] [--apply]\nDefault: preview one batch of at most 100. --apply requires the SQLite database to be closed by other processes. Proven orphans become private before entering existing delayed cleanup; unknown files are kept with a reason. No schedule is installed.');
  } else {
    const report = await runFormsMaintenanceCommand({ database: args.database!, workspace: args.workspace!, after: args.after, apply: args.apply });
    console.log(JSON.stringify({ ...report, results: report.results.map(result => ({ ...result, explanation: explanations[result.reason] })) }, null, 2));
  }
}
