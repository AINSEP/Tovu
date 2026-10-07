import { type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { requireHumanConfirm, notConfirmedResult } from '../contracts/core/human-confirm.js';
import type { AssistantSurfaceDeps } from '../contracts/core/tool-surface-exchanges.js';
import { TOOL_APPROVAL_POLICY, type ToolApprovalClass, directPageAction, toolApprovalPolicyFor } from '../contracts/headless/assistant-tool-approval-policy.js';
import { approvalText } from '../contracts/core/approval-i18n.js';

/** Classification is an owner-reviewed action policy, separate from read-only admission and auth.
 * NEEDS-JINI: the generic registration wrapper belongs in core; retain the CMS table in Tovu.
 * A frozen proposal prevents a later agent turn from changing what the human approved. */
export function approvalClassFor({ toolId, input }: { toolId: string; input: unknown }, _optional = {}): ToolApprovalClass {
  const policy = Object.hasOwn(TOOL_APPROVAL_POLICY, toolId) ? TOOL_APPROVAL_POLICY[toolId] : undefined;
  if (!policy) throw new Error(`${toolId} has no approval classification`);
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  switch (policy.rule) {
    case 'export-commit': return args.dryRun === true ? 'edit' : 'publish';
    case 'create-status': return args.status === 'published' ? 'publish' : 'edit';
    case 'update-status': return args.status === 'draft' || args.status === 'published' || args.publishAt !== undefined ? 'publish' : 'edit';
    case 'duplicate-status': return (args.overrides as Record<string, unknown> | undefined)?.status === 'published' ? 'publish' : 'edit';
    case 'page-control': return directPageAction({ capabilityId: toolId, input }) ? 'edit' : 'safety';
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
  // Specific existing gates remain authoritative: wrapping those would ask twice for one action.
  if (policy.confirmation === 'handler' || (policy.confirmation === 'direct' && !policy.rule)) return registration;
  return { ...registration, handler: async (ctx, options = {}) => {
    const input = structuredClone(ctx.input);
    const actionClass = approvalClassFor({ toolId, input });
    if (actionClass === 'read' || actionClass === 'edit') return registration.handler({ ...ctx, input }, options);
    if (ctx.signal.aborted) return { executed: false, ...notConfirmedResult({ confirmed: false, reason: 'abandoned' }) };
    let locale = 'en';
    try { locale = await localeFor(ctx); } catch { /* Copy failure must never bypass a safety gate. */ }
    const outcome = await requireHumanConfirm({ ctx, surfaces, spec: {
      toolId, errorCode: 'TOOL_APPROVAL', title: approvalText({ locale, key: 'Confirm action?' }),
      details: [{ label: approvalText({ locale, key: 'Tool' }), value: toolId }, { label: approvalText({ locale, key: 'Input' }), value: JSON.stringify(input ?? {}, null, 2) }],
      danger: actionClass === 'trash' || actionClass === 'delete' || actionClass === 'restore-over-existing',
      confirmLabel: approvalText({ locale, key: 'Confirm' }), cancelLabel: approvalText({ locale, key: 'Cancel' }),
    } }, options);
    if (!outcome.confirmed) return { executed: false, ...notConfirmedResult(outcome) };
    if (ctx.signal.aborted) return { executed: false, ...notConfirmedResult({ confirmed: false, reason: 'abandoned' }) };
    // Permissions and entity/version checks still run inside the original domain handler.
    return registration.handler({ ...ctx, input }, options);
  } };
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
