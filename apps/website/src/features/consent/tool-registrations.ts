/** @file Consent tools share the HTTP service and Jini's held confirmation lifecycle. */
import { buildDomainRegistrations, indexCatalogById, ToolInputError, type AgentToolDefinition, type DerivedRiskByToolId, type ToolRegistration } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { ToolContributor } from '@jini-ai/core';
import { approvalToolHandler } from '#src/contracts/core/human-confirm';
import { toolMetadata } from '#src/contracts/core/tool-metadata/consent';
import type { SiteConsentService } from './service.js';
import { readConsentRequest, consentRevisionToken } from './request.js';
import { parseConsentConfig } from './validation.js';

export interface ConsentToolDeps { siteConsent?: SiteConsentService }
const PATH = { type: 'string', description: 'One local public page path, default /; no external URL.' };
const TOKEN = { type: ['string', 'null'], description: 'The exact revision id from consent_get_settings, or null for no revision.' };
const CONFIG = { type: 'object', description: 'Full ConsentConfig: banner text, enabled, policyVersion, links, placement, regionMode, appearance tokens, customCss, optional allowUnsafeEval boolean. Four engine-owned categories cannot be changed.' };
/** Full schemas are also checked inside the shared service; no input can approve its own write. */
export const consentAgentToolCatalog: AgentToolDefinition[] = [
  ...['consent_get_readiness', 'consent_explain_blocked'].map(name => ({ name, description: 'Read a side-effect-free cookie consent dry run for one local rendered page: fixed categories, gated scripts/resources, placement, blocking problems. A sample is not a whole-site compliance verdict.', sideEffects: 'none' as const, authorization: { permission: 'settings.read' }, inputSchema: { type: 'object', properties: { path: PATH }, additionalProperties: false } })),
  { name: 'consent_get_settings', description: 'Read cookie banner draft, published revision and effective settings. Use returned ids for conflict-safe draft saves and publication.', sideEffects: 'none', authorization: { permission: 'settings.read' }, inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'consent_update_settings', description: 'Save a new cookie consent draft after a human confirmation card. Leaves published enforcement in place. Read consent_get_settings first; pass full config and expectedDraftId. Invalid CSS remains an editable draft and blocks publication.', sideEffects: 'mutates-durable-state', authorization: { permission: 'settings.workspace.write' }, inputSchema: { type: 'object', required: ['config', 'expectedDraftId'], properties: { config: CONFIG, expectedDraftId: TOKEN }, additionalProperties: false } },
  { name: 'consent_publish_settings', description: 'Publish exactly the saved cookie consent draft after a human confirmation card. Rechecks permission and revision freshness. Enabled changes re-ask visitors under a new immutable policy revision. To publish without a banner, save enabled:false, publish it explicitly, then retry deployment; optional scripts will run without banner enforcement.', sideEffects: 'mutates-durable-state', authorization: { permission: 'settings.workspace.write' }, inputSchema: { type: 'object', required: ['draftId', 'expectedPublishedId'], properties: { draftId: { type: 'string' }, expectedPublishedId: TOKEN }, additionalProperties: false } },
];
export const consentDerivedRisk: DerivedRiskByToolId = new Map([
  ['consent_get_settings', 'none'], ['consent_get_readiness', 'none'], ['consent_explain_blocked', 'none'],
  // saveDraft appends an immutable policy; publish atomically changes the public pointer.
  ['consent_update_settings', 'mutates-durable-state'], ['consent_publish_settings', 'mutates-durable-state'],
]);

/** Builds five tools; every write uses an immutable prepared input and a fresh service check.
 * @example buildConsentRegistrations({ siteConsent }, surfaces)
 * @complexity O(1) setup; effects/limits belong to the injected service. */
export function buildConsentRegistrations(deps: ConsentToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  /** Missing bindings are never replaced by a permissive in-memory store. */
  const service = (_input = {}, _options = {}) => {
    if (!deps.siteConsent) throw new ToolInputError({ message: 'The site consent service is unavailable. Nothing was changed.' });
    return deps.siteConsent;
  };
  /** Closed page input shared by both read diagnostics. */
  const diagnostic = async ({ principalId, input }: { principalId: string; input: unknown }, _options = {}) => {
    const raw = readConsentRequest({ body: input === undefined ? {} : input, fields: ['path'] });
    if (raw.path !== undefined && typeof raw.path !== 'string') throw new ToolInputError({ message: 'path must be a local page path.' });
    return service().readiness({ principalId, path: raw.path as string | undefined });
  };
  return buildDomainRegistrations({ metadata: toolMetadata, domain: 'consent', catalogModule: 'features/consent/tool-registrations.ts', catalog: indexCatalogById({ catalog: consentAgentToolCatalog }), derivedRisk: consentDerivedRisk, handlers: {
    consent_get_settings: async ctx => { readConsentRequest({ body: ctx.input === undefined ? {} : ctx.input, fields: [] }); return service().read({ principalId: ctx.principal.id }); },
    consent_get_readiness: ctx => diagnostic({ principalId: ctx.principal.id, input: ctx.input }),
    consent_explain_blocked: async ctx => { const result = await diagnostic({ principalId: ctx.principal.id, input: ctx.input }); return { ...result, explanation: 'The Jini consent gate pauses optional scripts, resources and handlers until the visitor grants their category. Necessary stays required; missing, expired or invalid receipts keep optional content denied.' }; },
    consent_update_settings: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const input = readConsentRequest({ body: ctx.input, fields: ['config', 'expectedDraftId'] });
        const state = await service().read({ principalId: ctx.principal.id });
        return { config: parseConsentConfig({ value: input.config }), previous: state.draft?.config ?? state.effective, expectedDraftId: consentRevisionToken({ input, key: 'expectedDraftId' }) };
      },
      describe: ({ prepared }) => ({ toolId: 'consent_update_settings', errorCode: 'CONSENT', title: 'Save this cookie consent draft?', details: [{ label: 'Configuration', value: prepared.config, previous: prepared.previous }], warning: unsafeEvalWarning({ config: prepared.config }), confirmLabel: 'Save draft' }),
      run: ({ ctx, prepared }) => service().saveDraft({ principalId: ctx.principal.id, config: prepared.config, expectedDraftId: prepared.expectedDraftId }),
    }, { flag: 'saved' }),
    consent_publish_settings: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const input = readConsentRequest({ body: ctx.input, fields: ['draftId', 'expectedPublishedId'] });
        const state = await service().read({ principalId: ctx.principal.id });
        const draftId = consentRevisionToken({ input, key: 'draftId' });
        if (!draftId || state.draft?.id !== draftId) throw new ToolInputError({ message: 'Reload the saved consent draft before publishing.' });
        return { draftId, expectedPublishedId: consentRevisionToken({ input, key: 'expectedPublishedId' }), config: parseConsentConfig({ value: state.draft.config }), previous: state.effective };
      },
      describe: ({ prepared }) => ({ toolId: 'consent_publish_settings', errorCode: 'CONSENT', title: 'Publish this cookie consent policy?', details: [{ label: 'Revision', value: prepared.draftId }, { label: 'Configuration', value: prepared.config, previous: prepared.previous }], warning: [unsafeEvalWarning({ config: prepared.config }), prepared.config.enabled ? 'Visitors will be asked again for this policy revision.' : 'The banner and optional-content enforcement will be disabled. Optional scripts may run without a visitor choice.'].filter(Boolean).join(' '), confirmLabel: 'Publish policy' }),
      run: ({ ctx, prepared }) => service().publish({ principalId: ctx.principal.id, draftId: prepared.draftId, expectedPublishedId: prepared.expectedPublishedId }),
    }, { flag: 'published' }),
  } });
}

/** Explicit composition contribution; no import-time registration or separate tool lifecycle. */
export function contributeConsentTools(_required = {}, _options = {}): ToolContributor<ConsentToolDeps, AssistantSurfaceDeps> {
  return { domain: 'consent', build: buildConsentRegistrations, risk: consentDerivedRisk };
}

/** Every confirmation carrying the exception explains its page-wide security cost. */
function unsafeEvalWarning({ config }: { config: { allowUnsafeEval?: boolean } }, _options = {}): string | undefined {
  return config.allowUnsafeEval ? 'Allowing dynamic code (unsafe-eval) weakens script protection on this site. Optional scripts still wait for consent.' : undefined;
}
