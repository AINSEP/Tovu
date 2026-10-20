/** @file ADR-066: immutable site consent policies and atomic draft/published heads. */
import { sql } from 'kysely';
import type { StorageKernel } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

/** Policies outlive receipts (180 days); no visitor identifiers or receipt payloads live here. */
export const SITE_CONSENT_REVISION_STATEMENTS = [
  'CREATE TABLE site_consent_revisions (workspace_id text NOT NULL, id text NOT NULL, config_json text NOT NULL, actor_id text NOT NULL, created_at text NOT NULL, PRIMARY KEY (workspace_id, id))',
  'CREATE TABLE site_consent_heads (workspace_id text PRIMARY KEY, draft_id text, published_id text)',
] as const;

/** Apply portable DDL through the already instrumented storage kernel. */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of SITE_CONSENT_REVISION_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Register only after this file exists. @example siteConsentRevisions({ checksum }) */
export function siteConsentRevisions(required: { checksum: string }, _options = {}): MigrationStep {
  return { id: '0021_site_consent_revisions', checksum: required.checksum, up };
}
