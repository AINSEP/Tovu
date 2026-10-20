import type { FormDestinationAddress, FormDestinationKit, FormDestinationModule, RemoteFormSubmission } from "./types.js";

/**
 * @file Pulls a form destination's pending submissions into Tovu, page by page, and acknowledges
 * only the rows the import committed, so a row is never lost between the receiver and Tovu: an
 * unacknowledged row is simply pulled again and the import's receipts absorb the repeat. Generic:
 * the destination is any module that implements `pull` and `ack`.
 */
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_PAGE_SIZE = 50;

/** The import step, injected so this module stays independent of the forms feature. */
export type FormDestinationImportPort<R extends { readonly committedIds: readonly string[] }> =
  (required: { readonly items: readonly RemoteFormSubmission[]; readonly destinationKey: string }) => Promise<R>;

/** Stable identity of one receiver for dedupe: its scope and origin. @complexity O(1). */
export function formDestinationKey({ scope, url }: { scope: string; url: string }, _optional = {}): string {
  return `${scope}:${new URL(url).origin}`;
}

/**
 * Pull, import, acknowledge, for up to `maxPages` pages. `hasMore` stays true when the cap stopped
 * the loop, so the caller can say "pull again". Errors name the address, never the key.
 * @complexity O(maxPages * pageSize) rows; two receiver requests per page.
 */
export async function pullFromFormDestination<R extends { readonly committedIds: readonly string[] }>(
  required: { module: Pick<FormDestinationModule, "pull" | "ack">; scope: string; destination: FormDestinationAddress; kit: FormDestinationKit; importPage: FormDestinationImportPort<R> },
  optional: { maxPages?: number; pageSize?: number } = {},
): Promise<{ destinationKey: string; pulled: number; acknowledged: number; hasMore: boolean; pages: R[] }> {
  const { module, scope, destination, kit, importPage } = required;
  const { pull, ack } = module;
  if (!pull || !ack) throw new Error(`no installed form destination returns submissions for ${scope}. Turn on the plugin that provides it (or republish the site to a host that receives forms), then pull again.`);
  const destinationKey = formDestinationKey({ scope, url: destination.url });
  const report = { destinationKey, pulled: 0, acknowledged: 0, hasMore: false, pages: [] as R[] };
  const { maxPages = DEFAULT_MAX_PAGES, pageSize: limit = DEFAULT_PAGE_SIZE } = optional;
  try {
    let after = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const batch = await pull.call(module, { kit, destination }, { after, limit });
      report.hasMore = batch.hasMore;
      if (batch.items.length === 0) break;
      report.pulled += batch.items.length;
      const imported = await importPage({ items: batch.items, destinationKey });
      report.pages.push(imported);
      report.acknowledged += await acknowledgeCommitted({ acknowledge: (ids) => ack.call(module, { kit, destination, ids }), committedIds: imported.committedIds });
      after = batch.nextAfter;
      if (!batch.hasMore) break;
    }
  } catch (error) {
    throw pullStopped({ error, destination });
  }
  return report;
}

/** Acknowledges each committed id once; no request when nothing was committed. @complexity O(ids). */
async function acknowledgeCommitted(
  required: { acknowledge: (ids: readonly string[]) => Promise<{ readonly acknowledged: number }>; committedIds: readonly string[] },
  _optional: Record<string, never> = {},
): Promise<number> {
  const ids = [...new Set(required.committedIds)];
  return ids.length > 0 ? (await required.acknowledge(ids)).acknowledged : 0;
}

/** The person-facing stop error: names the address, never the key. @complexity O(message bytes). */
function pullStopped({ error, destination }: { error: unknown; destination: FormDestinationAddress }, _optional = {}): Error {
  const message = (error instanceof Error ? error.message : String(error)).replaceAll(destination.secret, "[redacted]");
  return new Error(`pulling form submissions from ${new URL(destination.url).origin} stopped: ${message}. Rows not yet acknowledged stay at the host; pull again later.`);
}
