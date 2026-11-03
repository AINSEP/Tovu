import assert from 'node:assert/strict';
import type { ToolExecutionOptions, ToolRegistration } from '@jini-ai/core';
import { buildAssistantToolRegistrations } from '../../tool-registrations.js';
import { toolApprovalPolicyFor } from '../../assistant-tool-approval-policy.js';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { buildThemesRegistrations, type ThemeToolDeps } from '../../../features/theme/tool-registrations.js';
import { buildImportThemeFileRegistrations, type ImportThemeFileToolDeps } from '../../../features/theme/import-theme-file-tool.js';
import { THEME_CONTENT_REPLACEMENT_TOOL_IDS } from '../../../contracts/core/tool-metadata/theme.js';

const THEME_PLANS: ReadonlySet<string> = new Set(THEME_CONTENT_REPLACEMENT_TOOL_IDS);
const fixtureSurfaces = (): AssistantSurfaceDeps => ({ surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) });


/** Domain regression fixtures explicitly approve policy cards so permission, version and write
 * assertions reach the real handler. Handler-owned forms retain their own test-controlled answers;
 * approval refusal/cancel/binding tests use the production builder directly. `confirmPlanTools`
 * opts named handler-owned (`plan`) cards in too, for fixtures whose assertions are about what
 * the confirmed write does (e.g. `theme_write_file` overwrites, owner decision 2026-11-02). */
export function buildConfirmedAssistantToolRegistrations(
  { routeDeps, surfaces, options }: {
    routeDeps: Parameters<typeof buildAssistantToolRegistrations>[0];
    surfaces?: Parameters<typeof buildAssistantToolRegistrations>[1];
    options?: Parameters<typeof buildAssistantToolRegistrations>[2];
  },
  { confirmPlanTools = [] }: { confirmPlanTools?: readonly string[] } = {},
): ReturnType<typeof buildAssistantToolRegistrations> {
  const boundSurfaces = surfaces ?? fixtureSurfaces();
  return confirmFixtureRegistrations({ registrations: buildAssistantToolRegistrations(routeDeps, boundSurfaces, options), surfaces: boundSurfaces }, { confirmPlanTools });
}

/** Other domain tests explicitly approve file changes; gate tests keep using production builders. */
export function buildConfirmedThemesRegistrations(deps: ThemeToolDeps, _options = {}): ToolRegistration[] {
  const surfaces = fixtureSurfaces();
  return confirmFixtureRegistrations({ registrations: buildThemesRegistrations(deps, surfaces), surfaces });
}

export function buildConfirmedThemeImportRegistrations(deps: ImportThemeFileToolDeps, _options = {}): ToolRegistration[] {
  const surfaces = fixtureSurfaces();
  return confirmFixtureRegistrations({ registrations: buildImportThemeFileRegistrations(deps, surfaces), surfaces });
}

function confirmFixtureRegistrations(
  { registrations, surfaces: boundSurfaces }: { registrations: ToolRegistration[]; surfaces: AssistantSurfaceDeps },
  { confirmPlanTools = [] }: { confirmPlanTools?: readonly string[] } = {},
): ToolRegistration[] {
  return registrations.map(registration => {
    const policy = toolApprovalPolicyFor({ registration });
    const confirmed = THEME_PLANS.has(registration.descriptor.id) || confirmPlanTools.includes(registration.descriptor.id);
    if (!confirmed && (policy.confirmation === 'plan' || (policy.confirmation === 'direct' && !policy.rule))) return registration;
    return withConfirmingSurface({ registration, surfaces: boundSurfaces });
  });
}

/** Wraps one registration so every card it draws is answered `confirm` by the calling principal,
 * through the real exchange store it was built with. A call that draws no card is unchanged. */
export function withConfirmingSurface(
  { registration, surfaces }: { registration: ToolRegistration; surfaces: { surfaceExchanges: SurfaceExchangeStore } },
  _optional = {},
): ToolRegistration {
  return { ...registration, handler: (ctx, optional: ToolExecutionOptions = {}) => registration.handler(ctx, {
    ...optional,
    emitSurface: async emission => {
      assert.equal(emission.channel, 'mcp-ui');
      const html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text;
      const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
      assert.ok(match, 'policy card must carry an exchange id');
      await optional.emitSurface?.(emission);
      assert.deepEqual(surfaces.surfaceExchanges.deliver({ exchangeId: match[1]!, principalId: ctx.principal.id, params: { decision: 'confirm' } }, { toolId: registration.descriptor.id }), { ok: true });
    },
  }) };
}
