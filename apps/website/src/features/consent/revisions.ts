/** @file Site policy snapshots; Jini owns enforcement, Tovu owns site publication state. */
import type { ConsentConfig } from '@jini-ai/cms/consent';

export interface SiteConsentRevision {
  id: string;
  config: ConsentConfig;
  actorId: string;
  createdAt: string;
}
export interface SiteConsentState {
  draft: SiteConsentRevision | null;
  published: SiteConsentRevision | null;
}
/** All operations are workspace bound at composition. Conflicting heads must refuse atomically. */
export interface SiteConsentStore {
  read(required: Record<string, never>, optional?: Record<string, never>): Promise<SiteConsentState>;
  saveDraft(required: { revision: SiteConsentRevision; expectedDraftId: string | null }, optional?: Record<string, never>): Promise<void>;
  publish(required: { draftId: string; expectedPublishedId: string | null }, optional?: Record<string, never>): Promise<void>;
}
/** A stale editor or confirmation card cannot overwrite a newer policy. */
export class SiteConsentConflict extends Error {
  constructor() { super('Cookie consent changed. Reload and review the current revision before saving or publishing again.'); }
}
