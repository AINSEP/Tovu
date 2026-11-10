/**
 * @file Old-entry byte pins for EXTRACT-S8 C2 part 2: the emitted saved-key card, the emitted
 * create card and every registration descriptor of Tovu's old entries, as sha256 of their JSON.
 * The expected hashes in `extract-s8-c2p2-host-inputs.test.ts` were recorded from these exact
 * functions on the code BEFORE the host-input seams, so equality proves the seams kept the bytes.
 */
import { createHash } from 'node:crypto';
import type { SurfaceEmission, ToolRegistration } from '@jini-ai/core';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM, type SurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createFakeClock } from '#src/__tests__/support/fake-clock';
import type { ProjectKeysPort } from '../../project-keys/service.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { InMemoryCustomCredentialSetRepo } from '../repo.memory.js';
import type { CustomCredentialsToolDeps } from '../tool-registrations.js';
import { buildApiCredentialSaveHandlers, buildCustomCredentialsRegistrations } from '../tool-registrations.js';
import { buildCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID } from '../credential-copy-tool.js';

export const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** A fixed-id exchange store whose timers never fire, so every emitted card is deterministic. */
export function fixedExchanges(prefix: string): SurfaceExchangeStore {
  let next = 0;
  return createSurfaceExchangeStore({ clock: createFakeClock({ startIso: '2026-11-09T00:00:00Z' }),
    idGenerator: { newId: () => { next += 1; return `${prefix}-${next}`; } }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: () => () => undefined } });
}

/** A project-keys port that records its calls; `use` can be made to refuse (a revoked key). */
export function fakeProjectKeys({ log, permission = 'custom-credentials.write', refuseUse = false }: {
  log: string[]; permission?: string; refuseUse?: boolean;
}): ProjectKeysPort {
  return {
    site: { id: 'site-a', name: 'Site A' },
    list: async () => { log.push('list'); return [{ keyId: 'key-a', name: 'Key A', kind: 'custom', usedByThisSite: false, usedBy: [] }]; },
    listChoices: async () => { log.push('listChoices'); return [{ keyId: 'key-a', name: 'Key A', kind: 'custom', usedByThisSite: false, usedBy: [] }]; },
    listGranted: async () => [],
    permissionFor: async ({ keyId }) => { log.push(`permissionFor:${keyId}`); return permission; },
    use: async ({ keyId, use }) => {
      log.push(`use:${keyId}:${use}`);
      if (refuseUse) throw new Error('key no longer exists');
      return { keyId, usedByThisSite: use, usedBy: [], appliesAt: 'now' };
    },
    savedResult: async ({ result }) => result,
  };
}

/** Minimal custom-credential tool deps: an in-memory repo and sealer, and a recording authorize. */
export function credentialToolDeps({ authorizeCalls }: { authorizeCalls: Record<string, unknown>[] }): CustomCredentialsToolDeps {
  const keyring = new InMemoryKeyring();
  let next = 0;
  return {
    loadAuthSchemes: async () => [],
    loadSourceControlProviders: async () => ({ list: () => [], get: () => undefined, refusals: [] }),
    workspaceId: 'ws-c2p2', clock: createFakeClock({ startIso: '2026-11-09T00:00:00Z' }),
    customCredentialSetRepo: new InMemoryCustomCredentialSetRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring,
    idGen: { newId: () => { next += 1; return `cred-${next}`; } },
    customCredentialsHttpClient: { send: async () => { throw new Error('no network in this pin'); } },
    authorize: async (params: Record<string, unknown>) => { authorizeCalls.push(params); return { allowed: true, reason: 'fixture' }; },
  };
}

export const ctx = (id: string) => ({ executionId: id, principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal });

/** Opens one card through `invoke`, captures its single emission, then dismisses it. */
export async function captureCard({ exchanges, exchangeId, toolId, invoke }: {
  exchanges: SurfaceExchangeStore; exchangeId: string; toolId: string; invoke: (emitSurface: (emission: SurfaceEmission) => Promise<void>) => Promise<unknown>;
}): Promise<{ emission: SurfaceEmission; result: unknown }> {
  let emission: SurfaceEmission | undefined;
  const result = await invoke(async (emitted) => {
    emission ??= emitted;
    // Answer after the card is out, as a human would; a dismissed card saves and grants nothing.
    setImmediate(() => exchanges.deliver({ exchangeId, principalId: 'owner', params: { [SURFACE_DISMISSED_PARAM]: true } }, { toolId, channel: 'mcp-ui' }));
  });
  if (!emission) throw new Error('no card was emitted');
  return { emission, result };
}

/** The four hashes the old entries must keep: copy card, create card, both descriptor lists. */
export async function oldEntryHashes(): Promise<Record<'copyCard' | 'createCard' | 'credentialDescriptors' | 'copyDescriptors', string>> {
  const copyExchanges = fixedExchanges('copy');
  const copy = buildCredentialCopyRegistrations({ deps: { workspaceId: 'ws-c2p2', ownerPrincipalId: Promise.resolve('owner'),
    projectKeys: fakeProjectKeys({ log: [] }), authorize: async () => ({ allowed: true, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
  surfaces: { surfaceExchanges: copyExchanges } });
  const copyCard = await captureCard({ exchanges: copyExchanges, exchangeId: 'copy-1', toolId: CREDENTIAL_COPY_TOOL_ID,
    invoke: emitSurface => copy[0]!.handler(ctx('copy'), { emitSurface }) });
  const createExchanges = fixedExchanges('create');
  const deps = credentialToolDeps({ authorizeCalls: [] });
  const create = buildApiCredentialSaveHandlers({ routeDeps: deps, surfaces: { surfaceExchanges: createExchanges } }).create;
  const createCard = await captureCard({ exchanges: createExchanges, exchangeId: 'create-1', toolId: 'credential_save',
    invoke: emitSurface => create(ctx('create'), { emitSurface }) });
  const descriptors = (registrations: ToolRegistration[]) => registrations.map(registration => registration.descriptor);
  return {
    copyCard: sha256(copyCard.emission), createCard: sha256(createCard.emission),
    credentialDescriptors: sha256(descriptors(buildCustomCredentialsRegistrations(deps, { surfaceExchanges: createExchanges }))),
    copyDescriptors: sha256(descriptors(copy)),
  };
}
