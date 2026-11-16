import type { ToolApprovalMetadata } from '@jini-ai/core';

/** Owner policy: classify the action rather than the input's write-shaped fields.
 * ONE reviewed declaration per owning domain. Reversible actions run directly: read, edit (which
 * includes publishing or unpublishing on this site) and trash (restorable from the Trash).
 * Only what cannot be undone from here asks — see {@link approvalClassAsks}.
 * `publish` means the action leaves this site: the live site, a deploy, a git host, an email.
 * Plan entries describe domain facts through Jini; human forms stay on their secret-card engine.
 * New native registrations fail closed until their owner declares an action policy. */
export type ToolApprovalClass = ToolApprovalMetadata['class'];
export interface ToolApprovalPolicy extends ToolApprovalMetadata { readonly rule?: 'http-method' | 'page-control' | 'export-commit' | 'plugin-enable' | 'execution-setting' | 'theme-activation' }
