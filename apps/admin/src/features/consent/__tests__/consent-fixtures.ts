import type { ConsentSettingsView } from '@jini-ai/admin/consent/react';
import { ApiError } from '@/lib/api';
import type { ConsentDraftSaved, ConsentRevisionsPort, ConsentSettingsSnapshot } from '../settings.hooks';

/** Shared fakes for the consent feature's tests: a full valid config and an in-memory port. */
export const CONSENT_CONFIG: ConsentSettingsView = {
  enabled: true, regionMode: 'opt-in', policyVersion: '1', privacyPolicyUrl: '/privacy', title: 'Your cookie choices',
  message: 'We use cookies.', acceptLabel: 'Accept all', rejectLabel: 'Reject non-essential', preferencesLabel: 'Cookie preferences',
  placement: 'bottom-bar', secondaryLinkLabel: '', secondaryLinkUrl: '',
};

export function consentSnapshot(overrides: Partial<ConsentSettingsSnapshot> = {}): ConsentSettingsSnapshot {
  return {
    draft: null, published: null, effective: { ...CONSENT_CONFIG, enabled: false },
    editor: { placements: ['bottom-bar', 'top-bar'], textLimits: { title: 120 }, maxCssLength: 16384, regionModes: ['opt-in', 'opt-out'], rules: { gpc: 'always-enforced', preferenceMaxAgeMs: 1, staticReceipts: false } },
    ...overrides,
  };
}

export function revision(id: string, config: ConsentSettingsView = CONSENT_CONFIG) {
  return { id, config, actorId: 'owner', createdAt: '2026-10-21T00:00:00.000Z' };
}

export function saved(id: string, blockingProblems: ConsentDraftSaved['blockingProblems'] = []): ConsentDraftSaved {
  return { revision: revision(id), blockingProblems };
}

export const conflict = () => new ApiError('Cookie consent changed.', 409, 'CONSENT_REVISION_CONFLICT');

/** Unlisted calls reject, so a test that reaches one it did not describe fails loudly. */
export function fakeConsentPort(overrides: Partial<ConsentRevisionsPort> = {}): ConsentRevisionsPort {
  const unexpected = (name: string) => () => Promise.reject(new Error(`${name} was not expected`));
  return {
    get: () => Promise.resolve(consentSnapshot()),
    readiness: () => Promise.resolve({ ready: true, enabled: false, blockingProblems: [], detected: [], truncated: false, limitations: [] }),
    dryRun: unexpected('dryRun'),
    preview: () => Promise.resolve({ html: '<p>page</p>', blockingProblems: [], revisionId: null }),
    saveDraft: unexpected('saveDraft'),
    publish: unexpected('publish'),
    ...overrides,
  };
}
