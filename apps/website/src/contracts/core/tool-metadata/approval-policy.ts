/** Owner policy: classify the action rather than the input's write-shaped fields.
 * ONE reviewed declaration per owning domain. Reversible actions run directly: read, edit (which
 * includes publishing or unpublishing on this site) and trash (restorable from the Trash).
 * Only what cannot be undone from here asks — see {@link approvalClassAsks}.
 * `publish` means the action leaves this site: the live site, a deploy, a git host, an email.
 * Plan entries describe domain facts through Jini; human forms stay on their secret-card engine.
 * New native registrations fail closed until their owner declares an action policy. */
export type ToolApprovalClass = 'read' | 'edit' | 'trash' | 'delete' | 'restore-over-existing' | 'publish' | 'replace-secret' | 'escalation';
export interface ToolApprovalPolicy { readonly class: ToolApprovalClass; readonly confirmation: 'direct' | 'policy' | 'plan'; readonly input?: 'human-form'; readonly rule?: 'http-method' | 'page-control' | 'export-commit' | 'plugin-enable' | 'execution-setting' }
