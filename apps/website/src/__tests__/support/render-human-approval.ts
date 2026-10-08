import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import type { UIResource } from '@jini-ai/ui/mcp-ui/surfaces';
import { requireHumanConfirm, type HumanConfirmSpec } from '../../contracts/core/human-confirm.js';

/** Render through the actual host transport, with deterministic IDs/time and a cancelling human.
 * Tests assert emitted markup/actions; no production resource builder is copied into fixtures. */
export async function renderHumanApproval(
  { spec, exchangeId, expiresAtMs = 1_300_000 }: { spec: HumanConfirmSpec; exchangeId: string; expiresAtMs?: number }, _optional = {},
): Promise<UIResource> {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: { schedule: () => () => {} },
    clock: { nowMs: () => expiresAtMs - 100_000 }, idGenerator: { newId: () => exchangeId }, defaultChannel: 'mcp-ui',
  }, { idleTtlMs: 100_000, maxLifetimeMs: 100_000 });
  let resource: UIResource | undefined;
  await requireHumanConfirm({ surfaces: { surfaceExchanges }, spec,
    ctx: { principal: { id: 'owner' }, run: { id: 'run' }, executionId: 'execution', input: {}, signal: new AbortController().signal },
  }, { emitSurface: async emission => {
    resource = (emission.payload as { resource: UIResource }).resource;
    surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: spec.toolId });
  } });
  if (!resource) throw new Error('The human approval transport did not render a card');
  return resource;
}
