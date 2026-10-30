import type { SurfaceEmission } from "@jini-ai/core";
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { credentialText, formatCredentialHint, translateCredentialMessage } from '../../contracts/core/credential-copy.js';
import type { DatabaseDestinationStorePort } from './destination-store.js';
import { buildDestinationOutcome } from './destination-ui.js';

/** Tovu presentation adapter: Jini owns transfer checks; the server alone derives the saved URI hint. */
export function createDestinationExchangeReporter(
  { store, workspaceId }: { store: DatabaseDestinationStorePort; workspaceId: string },
  { localeForExchange = async () => 'en' }: { localeForExchange?: (required: { exchangeId: string }) => Promise<string> } = {},
): typeof askThenReport {
  return ({ exchange, confirmationEmission: emission, handle }) => askThenReport({ exchange, confirmationEmission: emission, handle: async answer => {
    const settled = await handle(answer);
    const resource = (emission.payload as { resource?: { resource?: { uri?: string } } }).resource?.resource;
    if (!resource?.uri?.startsWith('ui://tovu/database-transfer-destination/')) return settled;
    const locale = await localeForExchange({ exchangeId: exchange.id });
    if (!settled.result || typeof settled.result !== 'object' || !('saved' in settled.result)) return settled;
    if (settled.result.saved !== true) return reportDestinationFailure({ result: settled.result, outcome: settled.outcome, exchangeId: exchange.id, locale });
    return reportDestinationSuccess({ result: settled.result, store, workspaceId, exchangeId: exchange.id, locale });
  } });
}

function reportDestinationFailure<T>({ result, outcome, exchangeId, locale }: {
  result: T & object; outcome?: SurfaceEmission; exchangeId: string; locale: string;
}, _options = {}) {
  if (!('message' in result) || typeof result.message !== 'string') return { result, outcome };
  const message = translateCredentialMessage({ message: result.message, locale });
  return { result: { ...result, message }, outcome: { channel: 'mcp-ui' as const, payload: {
    resource: buildDestinationOutcome({ exchangeId, state: 'failure', message }),
  } } };
}

async function reportDestinationSuccess<T>({ result, store, workspaceId, exchangeId, locale }: {
  result: T; store: DatabaseDestinationStorePort; workspaceId: string; exchangeId: string; locale: string;
}, _options = {}) {
  // Open the saved value; never derive a client hint from unverified submitted bytes.
  const destination = await store.get(workspaceId).catch(() => null);
  const tokenHint = destination?.tokenHint ?? null;
  const hint = formatCredentialHint({ hint: tokenHint, locale });
  const message = `${hint ? hint + '. ' : ''}${credentialText({ id: 'connected', locale })}`;
  return {
    result: { ...result, tokenHint, connection: 'connected' },
    outcome: { channel: 'mcp-ui' as const, payload: { resource: buildDestinationOutcome({ exchangeId, state: 'success', message }) } },
  };
}
