import assert from 'node:assert/strict';
import type { ToolExecutionOptions } from '@jini-ai/core';
import { buildAssistantToolRegistrations } from '../../tool-registrations.js';
import { toolApprovalPolicyFor } from '../../../contracts/headless/assistant-tool-approval-policy.js';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/** Domain regression fixtures explicitly approve policy cards so permission, version and write
 * assertions reach the real handler. Handler-owned forms retain their own test-controlled answers;
 * approval refusal/cancel/binding tests use the production builder directly. */
export function buildConfirmedAssistantToolRegistrations(
  { routeDeps, surfaces, options }: {
    routeDeps: Parameters<typeof buildAssistantToolRegistrations>[0];
    surfaces?: Parameters<typeof buildAssistantToolRegistrations>[1];
    options?: Parameters<typeof buildAssistantToolRegistrations>[2];
  },
  _optional = {},
): ReturnType<typeof buildAssistantToolRegistrations> {
  const boundSurfaces = surfaces ?? { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  return buildAssistantToolRegistrations(routeDeps, boundSurfaces, options).map(registration => {
    const policy = toolApprovalPolicyFor({ registration });
    if (policy.confirmation === 'plan' || (policy.confirmation === 'direct' && !policy.rule)) return registration;
    return { ...registration, handler: (ctx, optional: ToolExecutionOptions = {}) => registration.handler(ctx, {
      ...optional,
      emitSurface: async emission => {
        assert.equal(emission.channel, 'mcp-ui');
        const html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
        const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
        assert.ok(match, 'policy card must carry an exchange id');
        await optional.emitSurface?.(emission);
        assert.deepEqual(boundSurfaces.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: ctx.principal.id, params: { decision: 'confirm' } }, { toolId: registration.descriptor.id }), { ok: true });
      },
    }) };
  });
}
