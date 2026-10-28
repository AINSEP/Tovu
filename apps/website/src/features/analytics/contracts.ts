/** Analytics-owned host contracts shared by ingestion and HTTP adapters. */
import type { Request } from 'express';
import type { Tracker } from '@jini-ai/diagnostics/observability';
import type { ConsentAnalyticsProof } from '@jini-ai/cms/consent/express';
import type { BrowserAnalyticsContribution } from '@jini-ai/analytics/product';

/** Composition-bound public analytics ports. Missing consent or identity generation denies capture. */
export interface VisitorAnalyticsDeps {
  tracker?: Tracker;
  visitorTracker?: Tracker;
  idGen?: { newId(): string };
  visitorAnalyticsProof?: (required: { request: Request }) => Promise<ConsentAnalyticsProof | undefined>;
  visitorAnalyticsDeliveryAllowed?: (required: { proof: ConsentAnalyticsProof }) => Promise<boolean>;
}

/** Browser payloads retain Jini's provider contribution contract. */
export type BrowserAnalyticsSource = (required: { surface: 'site' | 'admin' }) => readonly BrowserAnalyticsContribution[];
