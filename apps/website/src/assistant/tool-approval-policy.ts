import { applyApprovalPolicy, isNonArrayRecord, type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { requireHumanConfirm, notConfirmedResult } from '../contracts/core/human-confirm.js';
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { TOOL_APPROVAL_POLICY, ASSISTANT_EXECUTION_APPROVAL_SETTINGS, type ToolApprovalClass, type ToolApprovalPolicy, approvalClassAsks, directPageAction, toolApprovalPolicyFor } from '../contracts/headless/assistant-tool-approval-policy.js';
import { approvalText } from '../contracts/core/approval-i18n.js';
import { toolApprovalPresentation, type SurfaceDetail } from '@jini-ai/ui/mcp-ui/surfaces';

/** Classification is an owner-reviewed action policy, separate from read-only admission and auth.
 * Jini owns the generic registration wrapper; retain the CMS table in Tovu.
 * A frozen proposal prevents a later agent turn from changing what the human approved. */
export function approvalClassFor({ toolId, input }: { toolId: string; input: unknown }, options: { policy?: ToolApprovalPolicy } = {}): ToolApprovalClass {
  const policy = options.policy ?? (Object.hasOwn(TOOL_APPROVAL_POLICY, toolId) ? TOOL_APPROVAL_POLICY[toolId] : undefined);
  if (!policy) throw new Error(`${toolId} has no approval classification`);
  const candidate = { value: input };
  const args = isNonArrayRecord(candidate) ? candidate.value : {};
  const classify = policy.rule && Object.hasOwn(RULE_CLASSIFIERS, policy.rule) ? RULE_CLASSIFIERS[policy.rule] : undefined;
  return classify ? classify({ toolId, input, args }) : policy.class;
}

type RuleInput = { toolId: string; input: unknown; args: Record<string, unknown> };
const RULE_CLASSIFIERS: Record<NonNullable<ToolApprovalPolicy['rule']>, (required: RuleInput, options?: object) => ToolApprovalClass> = {
  'plugin-enable': ({ args }, _options = {}) => args.enabled === false ? 'edit' : 'escalation',
  'execution-setting': ({ args }, _options = {}) => ASSISTANT_EXECUTION_APPROVAL_SETTINGS.some(setting => setting.namespace === args.namespace && setting.key === args.key) ? 'escalation' : 'edit',
  'export-commit': ({ args }, _options = {}) => args.dryRun === true ? 'edit' : 'publish',
  'page-control': ({ toolId, input }, _options = {}) => directPageAction({ capabilityId: toolId, input }) ? 'edit' : 'delete',
  'http-method': ({ args }, _options = {}) => typeof args.method === 'string' && args.method.toUpperCase() === 'DELETE' ? 'delete' : 'edit',
};

export function applyToolApprovalPolicy(
  { registration, surfaces }: { registration: ToolRegistration; surfaces: AssistantSurfaceDeps },
  { localeFor = async () => 'en', disclose }: {
    localeFor?: (ctx: ToolExecutionContext) => Promise<string>;
    /** Extra rows for the card, computed from the frozen call before asking (e.g. the account and
     *  the resources an external tool would change). A throw refuses the call before any effect. */
    disclose?: (required: { ctx: ToolExecutionContext }) => Promise<readonly SurfaceDetail[]>;
  } = {},
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
      const disclosed = disclose ? await disclose({ ctx }) : [];
      const presentation = toolApprovalPresentation({ descriptor: registration.descriptor }, {
        text: ({ key }) => approvalText({ locale, key }),
      });
      return {
      toolId, errorCode: 'TOOL_APPROVAL', title: presentation.title,
      details: [{ label: approvalText({ locale, key: 'Input' }), value: ctx.input ?? {}, labels: presentation.labels,
        description: `${approvalText({ locale, key: 'Technical name' })}: ${toolId}` }, ...disclosed],
      danger: actionClass === 'trash' || actionClass === 'delete' || actionClass === 'restore-over-existing',
      confirmLabel: presentation.confirmLabel, cancelLabel: approvalText({ locale, key: 'Cancel' }),
      };
    },
    askHuman: ({ ctx, description }, options) => requireHumanConfirm({ ctx, surfaces, spec: description }, options),
    notConfirmed: ({ reason }) => ({ executed: false, ...notConfirmedResult({ confirmed: false, reason }) }),
    // Permissions and entity/version checks still run inside the original domain handler.
  });
}

/** A remote declaration can add friction, never grant admission or permissions. MCP has no standard
 * publish hint: use the advertised behavior (description/remote name) and actual selected action,
 * not the generated tool id.
 * `fallbackClass` lets the adapter preserve Jini's safety decision for unclassified operations;
 * only a recognized reversible action may override a generic destructive hint.
 * NEEDS-JINI: preserve an explicit per-action approval class in the shared MCP descriptor protocol. */
export function federatedApprovalClassFor(
  { description, name, annotations, input }: { description?: string; name?: string; annotations?: { destructiveHint?: boolean }; input: unknown },
  { fallbackClass = 'edit' }: { fallbackClass?: ToolApprovalClass } = {},
): ToolApprovalClass {
  const candidate = { value: input };
  const args = isNonArrayRecord(candidate) ? candidate.value : {};
  const action = [args.action, args.operation, args.method].filter(v=>typeof v === 'string').join(' ').replace(/[_-]/g, ' ').toLowerCase();
  const declaredAction = (name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase();
  const descriptionText = description ?? '';
  const restores = declaresRestore({ action, description: descriptionText, declaredAction });
  return selectedActionClass({ args, action, restores })
    ?? descriptionActionClass({ description: descriptionText })
    ?? declaredActionClass({ declaredAction, restores, destructiveHint: annotations?.destructiveHint })
    ?? fallbackClass;
}

function declaresRestore({ action, description, declaredAction }: { action: string; description: string; declaredAction: string }, _options = {}) {
  return /\brestore\b/.test(action) || /^(?:This tool\s+)?Restores?\b/i.test(description) || /\brestore\b/.test(declaredAction);
}

function restoresOverExisting({ args, action, restores }: { args: Record<string, unknown>; action: string; restores: boolean }, _options = {}) {
  return restores && (args.overwrite === true || args.replaceExisting === true || /\bover existing\b/.test(action));
}

function selectedActionClass({ args, action, restores }: { args: Record<string, unknown>; action: string; restores: boolean }, _options = {}): ToolApprovalClass | null {
  if (/\btrash\b/.test(action)) return 'trash';
  if (/\b(?:delete|purge|destroy|truncate)\b/.test(action)) return 'delete';
  if (restoresOverExisting({ args, action, restores })) return 'restore-over-existing';
  if (/\b(?:publish|unpublish|deploy|send|deliver)\b/.test(action) || args.status === 'published' || typeof args.published === 'boolean') return 'publish';
  return null;
}

function descriptionActionClass({ description }: { description: string }, _options = {}): ToolApprovalClass | null {
  // Exact declaration verbs, not incidental mentions such as "reads published content".
  if (/^(?:This tool\s+)?(?:publishes|unpublishes|deploys|sends|delivers|publish|unpublish|deploy|send|deliver)\b/i.test(description)) return 'publish';
  if (/\b(?:trashes|moves? .{0,80} to (?:the )?trash)\b/i.test(description)) return 'trash';
  if (/\brestores?\b.{0,80}\b(?:over|replaces?|replacing|overwrites?|overwriting)\b.{0,40}\b(?:existing|current)\b/i.test(description)) return 'restore-over-existing';
  if (/\b(?:deletes|purges|permanently removes)\b/i.test(description)) return 'delete';
  return null;
}

function declaredActionClass({ declaredAction, restores, destructiveHint }: { declaredAction: string; restores: boolean; destructiveHint?: boolean }, _options = {}): ToolApprovalClass | null {
  if (restores) return 'edit';
  if (/\btrash\b/.test(declaredAction)) return 'trash';
  if (/\b(?:publish|unpublish|deploy|send|deliver)\b/.test(declaredAction)) return 'publish';
  if (/\b(?:delete|purge|destroy|truncate)\b/.test(declaredAction)) return 'delete';
  if (destructiveHint === true) return 'delete';
  return null;
}
