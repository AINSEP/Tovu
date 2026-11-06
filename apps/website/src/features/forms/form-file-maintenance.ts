/** Explicit form attachment maintenance; storage reads bind Jini's conservative reconciliation. */
import { matchesFormAttachmentCleanupEvidence, reconcileFormAttachments, retainedJsonReferencesAttachment, type FormAttachmentCandidate, type FormAttachmentInspection, type FormOutboxPort } from '@jini-ai/cms/forms';
import { DEFAULT_GC_GRACE_MS, trashMedia } from '@jini-ai/cms/media';
import type { ContentKernel } from '#src/platform/db/content-kernel';
import { purgeMedia } from '#src/features/media/purge-media';
import { createFormMediaCleanup } from './form-file-purge.js';

type MaintenanceDeps = {
  kernel: ContentKernel; workspaceId: string;
  media: Parameters<typeof purgeMedia>[0]['deps'];
  outbox: FormOutboxPort; clock: { nowMs(): number };
};
type CandidateInput = { workspaceId: string; candidate: FormAttachmentCandidate };

/** Read only one batch unless explicitly applied; no boot hook, timer or object-store listing.
 * Existing canonical form-cleanup records prove terminal removal intent; absent evidence keeps
 * legacy/in-flight uploads. The media lifecycle still owns Trash, rendition journaling and grace.
 * @returns Decisions with fixed reasons and an optional cursor for the next explicit invocation.
 * @complexity At most 100 candidates; only proven candidates scan owner/config/history JSON in
 * pages of 100. Each apply commits privacy first, then rechecks ownership before transactional purge.
 */
export async function runFormFileMaintenance(
  required: MaintenanceDeps,
  optional: { after?: string; apply?: boolean } = {},
) {
  const { kernel } = required;
  return reconcileFormAttachments({
    workspaceId: required.workspaceId,
    readPage: ({ workspaceId, after, limit }) => kernel.run(async db => {
      let query = db.selectFrom('media').select(['id', 'source_sha256']).where('workspace_id', '=', workspaceId);
      if (after !== undefined) query = query.where('id', '>', after);
      return (await query.orderBy('id').limit(limit).execute()).map(row => ({ mediaId: row.id, sha256: row.source_sha256 }));
    }),
    inspect: input => inspectCandidate({ required, input }),
    protect: input => protectCandidate({ required, input }),
    cleanup: input => cleanupCandidate({ required, input }),
  }, optional);
}

/** Proof comes from this site's durable server outbox, never a CLI assertion or a name prefix. */
async function inspectCandidate({ required, input }: { required: MaintenanceDeps; input: CandidateInput }): Promise<FormAttachmentInspection> {
  const { kernel, media } = required;
  const { workspaceId, candidate } = input;
  const asset = await media.mediaRepo.findById({ workspaceId, id: candidate.mediaId });
  if (!asset || asset.source.sha256 !== candidate.sha256) return 'unknown';
  const row = await kernel.run(db => db.selectFrom('outbox_events').select('event_json').where('workspace_id', '=', workspaceId)
    .where('id', '=', `forms:file:cleanup:${workspaceId}:${candidate.mediaId}`).executeTakeFirst());
  if (!row) return 'missing-evidence';
  if (!matchesFormAttachmentCleanupEvidence({ workspaceId, candidate, event: JSON.parse(row.event_json) })) return 'unknown';
  const shared = await kernel.run(db => db.selectFrom('media').select('id').where('workspace_id', '=', workspaceId)
    .where('source_sha256', '=', candidate.sha256).where('id', '!=', candidate.mediaId).limit(1).executeTakeFirst());
  if (shared) return 'owned';
  const snapshot = await kernel.run(db => db.selectFrom('publish_content_runs').select('id').where('workspace_id', '=', workspaceId).where('restore_point_id', 'is not', null).limit(1).executeTakeFirst());
  if (snapshot) return 'unknown';
  const retired = await media.mediaRepo.listRetiredSlugs({ workspaceId, mediaId: asset.id });
  const keys = [candidate.mediaId, candidate.sha256, asset.slug, ...retired].filter(Boolean);
  const indexed = await kernel.run(db => db.selectFrom('entry_refs').select('id').where('workspace_id', '=', workspaceId).where('target_kind', '=', 'asset').where('target_id', 'in', keys).limit(1).executeTakeFirst());
  if (indexed) return 'owned';
  if (await hasStoredReferences({ kernel, workspaceId, keys: [...new Set([...keys, ...keys.map(encodeURIComponent)])] })) return 'owned';
  return 'proven-orphan';
}

/** Privacy is a separate committed transaction so a later cleanup error cannot make files public. */
async function protectCandidate({ required, input }: { required: MaintenanceDeps; input: CandidateInput }): Promise<void> {
  const { kernel } = required;
  await kernel.transaction(async () => {
    await kernel.lockKey(`forms:maintenance:${input.workspaceId}:${input.candidate.mediaId}`);
    await assertStillOrphan({ required, input });
    await kernel.run(async db => {
      const row = await db.selectFrom('media').select('source_metadata_json').where('workspace_id', '=', input.workspaceId)
        .where('id', '=', input.candidate.mediaId).where('source_sha256', '=', input.candidate.sha256).executeTakeFirstOrThrow();
      await db.updateTable('media').set({ source_metadata_json: JSON.stringify({ ...JSON.parse(row.source_metadata_json ?? '{}'), private: true }) })
        .where('workspace_id', '=', input.workspaceId).where('id', '=', input.candidate.mediaId).where('source_sha256', '=', input.candidate.sha256).execute();
      await db.updateTable('asset_blobs').set({ document_owned: true }).where('workspace_id', '=', input.workspaceId).where('sha256', '=', input.candidate.sha256).execute();
    });
  });
}

/** Reuse the normal purge owner and a distinct journal id so old job receipts cannot settle it. */
async function cleanupCandidate({ required, input }: { required: MaintenanceDeps; input: CandidateInput }): Promise<void> {
  const { kernel, media, outbox, clock } = required;
  await kernel.transaction(async () => {
    await kernel.lockKey(`forms:maintenance:${input.workspaceId}:${input.candidate.mediaId}`);
    await assertStillOrphan({ required, input });
    const maintenanceOutbox: FormOutboxPort = { enqueue: event => outbox.enqueue({ ...event, id: `${event.id}:maintenance:${clock.nowMs()}` }) };
    await trashMedia({ deps: { mediaRepo: media.mediaRepo, clock }, input: { workspaceId: input.workspaceId, id: input.candidate.mediaId } });
    await purgeMedia({ deps: { ...media, ...createFormMediaCleanup({ kernel, outbox: maintenanceOutbox, clock, graceMs: DEFAULT_GC_GRACE_MS }) }, input: { workspaceId: input.workspaceId, id: input.candidate.mediaId } });
  });
}

async function assertStillOrphan({ required, input }: { required: MaintenanceDeps; input: CandidateInput }): Promise<void> {
  if (await inspectCandidate({ required, input }) !== 'proven-orphan') throw new Error('Form file ownership changed during maintenance; the file was kept.');
}

/** Current/trashed form owners and retained content/config revisions all block orphan cleanup.
 * Broad string matching deliberately over-retains rather than guessing through historical formats.
 * @complexity Sequential pages of 100 rows per existing owner/history table; no file bytes read.
 */
async function hasStoredReferences({ kernel, workspaceId, keys }: { kernel: ContentKernel; workspaceId: string; keys: string[] }): Promise<boolean> {
  const sources = [
    (offset: number) => kernel.run(db => db.selectFrom('form_definitions').select('fields_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('form_delivery_jobs').innerJoin('outbox_events', 'outbox_events.id', 'form_delivery_jobs.job_id').select('outbox_events.event_json as json').where('form_delivery_jobs.workspace_id', '=', workspaceId).orderBy('form_delivery_jobs.job_id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('form_submissions').select('data_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('entries').select(['body_json as first', 'fields_json as json']).where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('posts').select('body_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(async db => (await db.selectFrom('posts').select('body_html').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()).map(row => ({ json: row.body_html ? JSON.stringify(row.body_html) : null }))),
    (offset: number) => kernel.run(db => db.selectFrom('posts').select('seo_ext_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('posts').select('autosave_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('post_revisions').select('state_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('entry_revisions').select('state_json as json').where('workspace_id', '=', workspaceId).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('setting_revisions').select(['before_json as first', 'after_json as json']).where(eb => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)])).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('change_set_items').innerJoin('change_sets', 'change_sets.id', 'change_set_items.change_set_id').select('change_set_items.inverse_payload_json as json').where('change_sets.workspace_id', '=', workspaceId).orderBy('change_set_items.id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('publish_content_bundles').select(['entities_json as first', 'blob_manifest_json as json']).where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('publish_backstop_log').select(['items_json as first', 'inverses_json as json']).where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('members').select('fields_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('member_revisions').select(['before_json as first', 'after_json as json']).where('workspace_id', '=', workspaceId).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('menus').select('doc_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('content_types').select('fields_json as json').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('content_type_revisions').select('state_json as json').where('workspace_id', '=', workspaceId).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('newsletter_campaign_revisions').select('state_json as json').where('workspace_id', '=', workspaceId).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('taxonomy_revisions').select('previous_state_json as json').where('workspace_id', '=', workspaceId).orderBy('seq').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(async db => (await db.selectFrom('posts').select('featured_media_id').where('workspace_id', '=', workspaceId).orderBy('id').limit(100).offset(offset).execute()).map(row => ({ json: row.featured_media_id ? JSON.stringify(row.featured_media_id) : null }))),
    (offset: number) => kernel.run(db => db.selectFrom('setting_definitions').select(['schema_json as first', 'default_json as json']).where(eb => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)])).orderBy('setting_id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('setting_values_user').select('value_json as json').where('workspace_id', '=', workspaceId).orderBy('setting_id').orderBy('principal_id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('setting_values_workspace').select('value_json as json').where('workspace_id', '=', workspaceId).orderBy('setting_id').limit(100).offset(offset).execute()),
    (offset: number) => kernel.run(db => db.selectFrom('setting_values_global').select('value_json as json').orderBy('setting_id').limit(100).offset(offset).execute()),
  ];
  for (const read of sources) if (await storedPageReferences({ read, keys })) return true;
  return false;
}

async function storedPageReferences({ read, keys }: { read: (offset: number) => Promise<{ json: string | null; first?: string | null }[]>; keys: string[] }): Promise<boolean> {
  for (let offset = 0; ; offset += 100) {
    const rows = await read(offset);
    for (const row of rows) {
      if (storedRowReferences({ ...row, keys })) return true;
    }
    if (rows.length < 100) return false;
  }
}

/** Inspect both stored JSON columns; absent/empty columns carry no reference. Corrupt JSON throws. */
function storedRowReferences({ json, first, keys }: { json: string | null; first?: string | null; keys: string[] }): boolean {
  return [json, first].some(value => Boolean(value && retainedJsonReferencesAttachment({ json: value, keys })));
}
