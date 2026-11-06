import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from './approval-policy.js';

/** The handler owns its human card; plan admits its callback without a second policy prompt. */
export const toolMetadata = {
  commerce_resolve_unknown: { title: 'Record a verified payment outcome',
    summary: 'This records verified payment evidence and may fulfill the order.',
    approval: { class: 'publish', confirmation: 'plan' } },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
