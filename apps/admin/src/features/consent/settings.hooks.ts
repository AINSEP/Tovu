import type { ConsentFieldProblem, ConsentSettingsView } from '@jini-ai/admin/consent/react';
import { WORKSPACE_ID, authenticatedAdminRequest } from '@/lib/api';

/**
 * @file The Cookie Consent page's port onto the revisions API
 * (`apps/website/src/server/inbound/admin-http/routes/consent/routes.ts`, contract in
 * `apps/website/src/features/consent/README.md`). It replaces the legacy `core.consent` ledger
 * adapter: the page edits immutable draft revisions and publishes one atomically, so it reads the
 * published revision rather than ledger values.
 */

export interface ConsentRevision {
  id: string;
  config: ConsentSettingsView;
  actorId: string;
  createdAt: string;
}

/** What GET /settings says the editor may offer. Categories and GPC are fixed by the engine. */
export interface ConsentEditorLimits {
  /** Field defaults; `customCss` is the default banner style that "Reset to default" restores. */
  defaults?: { customCss?: string };
  placements: string[];
  textLimits: Partial<Record<'title' | 'message' | 'acceptLabel' | 'rejectLabel' | 'preferencesLabel' | 'secondaryLinkLabel', number>>;
  maxCssLength: number;
  regionModes: ConsentSettingsView['regionMode'][];
  rules: { gpc: string; preferenceMaxAgeMs: number; staticReceipts: boolean };
}

export interface ConsentSettingsSnapshot {
  draft: ConsentRevision | null;
  published: ConsentRevision | null;
  /** The published revision, or the legacy ledger values before the first publication. */
  effective: ConsentSettingsView;
  editor: ConsentEditorLimits;
}

export interface ConsentDetectedItem {
  tag: string;
  category: string;
  source: string | null;
}

export interface ConsentReadiness {
  ready: boolean;
  enabled: boolean;
  blockingProblems: ConsentFieldProblem[];
  detected: ConsentDetectedItem[];
  truncated: boolean;
  limitations: string[];
}

export interface ConsentPreview {
  html: string;
  blockingProblems: ConsentFieldProblem[];
  revisionId: string | null;
}

export interface ConsentDraftSaved {
  revision: ConsentRevision;
  blockingProblems: ConsentFieldProblem[];
}

/** The adapter is only HTTP; it has no competing save/debounce state. Autosave ordering lives in
 * `consent-autosave.ts`, so this stays a 1:1 map of the six routes. */
export interface ConsentRevisionsPort {
  get(required?: Record<string, never>, optional?: Record<string, never>): Promise<ConsentSettingsSnapshot>;
  readiness(required?: { path?: string }, optional?: Record<string, never>): Promise<ConsentReadiness>;
  dryRun(required: { config: ConsentSettingsView; path?: string }, optional?: Record<string, never>): Promise<ConsentReadiness>;
  preview(required: { config: ConsentSettingsView; path?: string }, optional?: Record<string, never>): Promise<ConsentPreview>;
  saveDraft(required: { config: ConsentSettingsView; expectedDraftId: string | null }, optional?: Record<string, never>): Promise<ConsentDraftSaved>;
  publish(required: { draftId: string; expectedPublishedId: string | null }, optional?: Record<string, never>): Promise<{ published: true; revisionId: string }>;
}

/** `authenticatedAdminRequest`'s shape: resolves the JSON body, rejects with `ApiError` on non-2xx. */
export type ConsentRequest = <T>(required: { method: string; path: string; body?: unknown }) => Promise<T>;

/** Builds the port over any request function, so tests drive it with a fake per status code.
 * @complexity O(1) per call; one request each. */
export function createConsentRevisionsPort({ request }: { request: ConsentRequest }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): ConsentRevisionsPort {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/consent`;
  return {
    get: () => request({ method: 'GET', path: `${base}/settings` }),
    readiness: ({ path } = {}) => request({ method: 'GET', path: `${base}/readiness${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}` }),
    dryRun: body => request({ method: 'POST', path: `${base}/dry-run`, body }),
    preview: body => request({ method: 'POST', path: `${base}/preview`, body }),
    saveDraft: body => request({ method: 'PUT', path: `${base}/settings`, body }),
    publish: body => request({ method: 'POST', path: `${base}/publish`, body }),
  };
}

export const defaultConsentRevisionsPort = createConsentRevisionsPort({ request: required => authenticatedAdminRequest(required) });
