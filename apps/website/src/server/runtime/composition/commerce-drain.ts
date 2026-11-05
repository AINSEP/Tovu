import { sql } from 'kysely';
import type { StorageKernel } from '@jini-ai/db/kernel';
import type { CommerceConfiguration } from './commerce-settings.js';

interface RecordedCommerce {
  provider_id: string; provider_account_id: string; mode: 'test' | 'live'; dispatch_json: string | null;
}
export function commerceConfigurationKey({ config }: { config: CommerceConfiguration | null }, _optional = {}): string { return JSON.stringify(config); }

/** Read one durable unfinished intent, only at activation/configuration transitions.
 * @complexity At most one result row and one original intent snapshot; no provider I/O. */
export async function readCommerceDrain({ kernel, workspaceId }: { kernel: StorageKernel<unknown>; workspaceId: string }, _optional = {}): Promise<RecordedCommerce | null> {
  const rows = await kernel.query<RecordedCommerce>(sql`SELECT p.provider_id,p.provider_account_id,p.mode,a.dispatch_json
    FROM commerce_payments p LEFT JOIN commerce_payment_attempts a ON a.workspace_id=p.workspace_id AND a.mode=p.mode AND a.operation_key=('intent:' || p.idempotency_key)
    WHERE p.workspace_id=${workspaceId} AND p.intent_status NOT IN ('succeeded','failed','canceled') LIMIT 1`);
  return rows[0] ?? null;
}

function recordedOrigin(record: RecordedCommerce): string | null {
  try {
    const snapshot = JSON.parse(record.dispatch_json ?? 'null') as { returnUrl?: string } | null;
    return snapshot?.returnUrl ? new URL(snapshot.returnUrl).origin : null;
  } catch { return null; }
}

/** Configuration writes never redirect existing work to a newly selected merchant account.
 * @complexity O(snapshot bytes) parsing; only credential-free original URLs are consulted. */
export function selectCommerceDrain({ configured, previous, recorded }: {
  configured: CommerceConfiguration | null; previous: CommerceConfiguration | null; recorded: RecordedCommerce | null;
}, _optional = {}): { config: CommerceConfiguration | null; problem: string | null } {
  if (!recorded) return { config: configured ?? previous, problem: configured ? null : 'Commerce configuration is missing. Restore the configured payment account and deployed HTTPS origin before accepting checkout.' };
  const publicOrigin = drainOrigin({ recorded, previous, configured });
  if (!publicOrigin) return { config: null, problem: 'Existing payment work has no recoverable site origin. Restore the original payment configuration to resume settlement.' };
  const original: CommerceConfiguration = { providerId: recorded.provider_id, accountId: recorded.provider_account_id, mode: recorded.mode, publicOrigin };
  const matches = merchantMatches(configured, original);
  return { config: matches ? configured : original, problem: matches ? null : 'Existing payments are draining under their original account, mode and site. Restore that configuration or wait for settlement before changing checkout settings.' };
}

function normalizedOrigin(value: string): string | null { try { return new URL(value).origin; } catch { return null; } }

function drainOrigin({ recorded, previous, configured }: { recorded: RecordedCommerce; previous: CommerceConfiguration | null; configured: CommerceConfiguration | null }): string | undefined {
  return recordedOrigin(recorded) ?? previous?.publicOrigin ?? configured?.publicOrigin;
}
function merchantMatches(configured: CommerceConfiguration | null, original: CommerceConfiguration): boolean {
  if (!configured) return false;
  const sameScope = configured.providerId === original.providerId && configured.accountId === original.accountId && configured.mode === original.mode;
  return sameScope && normalizedOrigin(configured.publicOrigin) === normalizedOrigin(original.publicOrigin);
}
