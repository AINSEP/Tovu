import { applyApprovalPolicy, type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { requireHumanConfirm, notConfirmedResult } from '../contracts/core/human-confirm.js';
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { TOOL_APPROVAL_POLICY, ASSISTANT_EXECUTION_APPROVAL_SETTINGS, type ToolApprovalClass, approvalClassAsks, directPageAction, toolApprovalPolicyFor } from '../contracts/headless/assistant-tool-approval-policy.js';
import { approvalText } from '../contracts/core/approval-i18n.js';

/** Classification is an owner-reviewed action policy, separate from read-only admission and auth.
 * Jini owns the generic registration wrapper; retain the CMS table in Tovu.
 * A frozen proposal prevents a later agent turn from changing what the human approved. */
export function approvalClassFor({ toolId, input }: { toolId: string; input: unknown }, options: { policy?: import('../contracts/headless/assistant-tool-approval-policy.js').ToolApprovalPolicy } = {}): ToolApprovalClass {
  const policy = options.policy ?? (Object.hasOwn(TOOL_APPROVAL_POLICY, toolId) ? TOOL_APPROVAL_POLICY[toolId] : undefined);
  if (!policy) throw new Error(`${toolId} has no approval classification`);
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  switch (policy.rule) {
    case 'plugin-enable': return args.enabled === false ? 'edit' : 'escalation';
    case 'execution-setting': return ASSISTANT_EXECUTION_APPROVAL_SETTINGS.some(setting => setting.namespace === args.namespace && setting.key === args.key) ? 'escalation' : 'edit';
    case 'export-commit': return args.dryRun === true ? 'edit' : 'publish';
    case 'page-control': return directPageAction({ capabilityId: toolId, input }) ? 'edit' : 'delete';
    case 'http-method': return typeof args.method === 'string' && args.method.toUpperCase() === 'DELETE' ? 'delete' : 'edit';
    default: return policy.class;
  }
}

export function applyToolApprovalPolicy(
  { registration, surfaces }: { registration: ToolRegistration; surfaces: AssistantSurfaceDeps },
  { localeFor = async () => 'en' }: { localeFor?: (ctx: ToolExecutionContext) => Promise<string> } = {},
): ToolRegistration {
  const toolId = registration.descriptor.id;
  const policy = toolApprovalPolicyFor({ registration });
  // Domain plans already use the same Jini owner; wrapping them would ask twice for one action.
  if (policy.confirmation === 'plan' || (policy.confirmation === 'direct' && !policy.rule)) return registration;
  return applyApprovalPolicy({
    registration,
    classify: ({ input }) => approvalClassFor({ toolId, input }, { policy }),
    asks: ({ class: actionClass }) => approvalClassAsks({ class: actionClass }),
    describe: async ({ ctx, class: actionClass }) => {
      let locale = 'en';
      try { locale = await localeFor(ctx); } catch { /* Copy failure must never bypass a safety gate. */ }
      return {
      toolId, errorCode: 'TOOL_APPROVAL', title: approvalText({ locale, key: 'Confirm action?' }),
      details: [{ label: approvalText({ locale, key: 'Tool' }), value: toolId }, { label: approvalText({ locale, key: 'Input' }), value: JSON.stringify(ctx.input ?? {}, null, 2) }],
      danger: actionClass === 'trash' || actionClass === 'delete' || actionClass === 'restore-over-existing',
      confirmLabel: approvalText({ locale, key: 'Confirm' }), cancelLabel: approvalText({ locale, key: 'Cancel' }),
      };
    },
    askHuman: ({ ctx, description }, options) => requireHumanConfirm({ ctx, surfaces, spec: description }, options),
    notConfirmed: ({ reason }) => ({ executed: false, ...notConfirmedResult({ confirmed: false, reason }) }),
    // Permissions and entity/version checks still run inside the original domain handler.
  });
}

/** A remote declaration can add friction, never grant admission or permissions. MCP has no standard
 * publish hint: use the advertised behavior and the actual selected action, not the tool id.
 * NEEDS-JINI: preserve an explicit per-action approval class in the shared MCP descriptor protocol. */
export function federatedApprovalClassFor(
  { description, annotations, input }: { description?: string; annotations?: { destructiveHint?: boolean }; input: unknown }, _optional = {},
): ToolApprovalClass {
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const action = [args.action, args.operation, args.method].filter(v=>typeof v === 'string').join(' ').replace(/[_-]/g, ' ').toLowerCase();
  if (/\btrash\b/.test(action)) return 'trash';
  if (/\b(?:delete|purge|destroy|truncate)\b/.test(action)) return 'delete';
  if (/\brestore\b/.test(action) && (args.overwrite === true || args.replaceExisting === true || /\bover existing\b/.test(action))) return 'restore-over-existing';
  if (/\b(?:publish|unpublish|deploy)\b/.test(action) || args.status === 'published' || typeof args.published === 'boolean') return 'publish';
  // Exact declaration verbs, not incidental mentions such as "reads published content".
  if (/^(?:This tool\s+)?(?:publishes|unpublishes|deploys|publish|unpublish|deploy)\b/i.test(description ?? '')) return 'publish';
  if (/\b(?:trashes|moves? .{0,80} to (?:the )?trash)\b/i.test(description ?? '')) return 'trash';
  if (/\brestores?\b.{0,80}\b(?:over|replaces?|replacing|overwrites?|overwriting)\b.{0,40}\b(?:existing|current)\b/i.test(description ?? '')) return 'restore-over-existing';
  if (/\b(?:deletes|purges|permanently removes)\b/i.test(description ?? '') || annotations?.destructiveHint === true) return 'delete';
  return 'edit';
}
