import { toolMetadata as commerce } from './commerce.js';
import { toolMetadata as consent } from '@jini-ai/core/tool-metadata/consent';
import { projectToolMetadata } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '@jini-ai/core/contracts/site/tool-metadata-approval-policy';

import { toolMetadata as agent_plugins } from './agent-plugins.js';
import { toolMetadata as analytics } from '@jini-ai/core/tool-metadata/analytics';
import { toolMetadata as assistant } from './assistant.js';
import { toolMetadata as change_sets } from '@jini-ai/core/tool-metadata/change-sets';
import { toolMetadata as comments } from './comments.js';
import { toolMetadata as content_duplication } from '@jini-ai/core/tool-metadata/content-duplication';
import { toolMetadata as content_read } from './content-read.js';
import { toolMetadata as content_types } from '@jini-ai/core/tool-metadata/content-types';
import { toolMetadata as custom_credentials } from './custom-credentials.js';
import { toolMetadata as database } from '@jini-ai/core/tool-metadata/database';
import { toolMetadata as database_transfer } from '@jini-ai/core/tool-metadata/database-transfer';
import { toolMetadata as deploy_ops } from './deploy-ops.js';
import { toolMetadata as deployments } from './deployments.js';
import { toolMetadata as domain_dns } from './domain-dns.js';
import { toolMetadata as external_mcp } from '@jini-ai/core/tool-metadata/external-mcp';
import { toolMetadata as entries } from '@jini-ai/core/tool-metadata/entries';
import { toolMetadata as forms } from '@jini-ai/core/tool-metadata/forms';
import { toolMetadata as frontend_control } from './frontend-control.js';
import { toolMetadata as fs_files } from './fs-files.js';
import { toolMetadata as identity } from '@jini-ai/core/tool-metadata/identity';
import { toolMetadata as files_copy } from '@jini-ai/core/tool-metadata/files-copy';
import { toolMetadata as image_transform } from './image-transform.js';
import { toolMetadata as email_templates } from '@jini-ai/core/tool-metadata/email-templates';
import { toolMetadata as mail_status } from '@jini-ai/core/tool-metadata/mail-status';
import { toolMetadata as media } from '@jini-ai/core/tool-metadata/media';
import { toolMetadata as media_generation } from './media-generation.js';
import { toolMetadata as media_import } from '@jini-ai/core/tool-metadata/media-import';
import { toolMetadata as members } from './members.js';
import { toolMetadata as navigation } from '@jini-ai/core/tool-metadata/navigation';
import { toolMetadata as newsletter } from './newsletter.js';
import { toolMetadata as pages } from '@jini-ai/core/tool-metadata/pages';
import { toolMetadata as permanent_delete } from './permanent-delete.js';
import { toolMetadata as plugin_runtime } from './plugin-runtime.js';
import { toolMetadata as post } from './post.js';
import { toolMetadata as publish_content } from '@jini-ai/cms/publish/content/tool-metadata';
import { toolMetadata as recovery } from './recovery.js';
import { toolMetadata as redirects } from './redirects.js';
import { toolMetadata as search } from './search.js';
import { toolMetadata as seo } from './seo.js';
import { toolMetadata as server_logs } from './server-logs.js';
import { toolMetadata as observability } from '@jini-ai/core/tool-metadata/observability';
import { toolMetadata as settings } from './settings.js';
import { toolMetadata as visitor_tools } from './visitor-tools.js';
import { toolMetadata as site_backup } from './site-backup.js';
import { toolMetadata as site_evidence } from './site-evidence.js';
import { toolMetadata as site_guide } from './site-guide.js';
import { toolMetadata as site_inspection } from './site-inspection.js';
import { toolMetadata as sites } from './sites.js';
import { toolMetadata as skills } from './skills.js';
import { toolMetadata as source_control } from './source-control.js';
import { toolMetadata as taxonomy } from '@jini-ai/cms/taxonomy/site/tool-metadata';
import { toolMetadata as theme } from './theme.js';
import { toolMetadata as trash } from './trash.js';
import { toolMetadata as web } from './web.js';
import { toolMetadata as web_screenshot } from './web-screenshot.js';
import { toolMetadata as webhooks } from './webhooks.js';
import { toolMetadata as widgets } from './widgets.js';
import { toolMetadata as workspace } from './workspace.js';

/** Owner policy: classify the action rather than the input's write-shaped fields.
 * ONE reviewed declaration per owning domain. Reversible actions run directly: read, edit (which
 * includes publishing or unpublishing on this site) and trash (restorable from the Trash).
 * Only what cannot be undone from here asks — see {@link approvalClassAsks}.
 * `publish` means the action leaves this site: the live site, a deploy, a git host, an email.
 * Plan entries describe domain facts through Jini; human forms stay on their secret-card engine.
 * New native registrations fail closed until their owner declares an action policy. */
export type HostToolApprovalRule = 'http-method' | 'page-control' | 'export-commit' | 'plugin-enable' | 'execution-setting' | 'theme-activation';
/** The core contract leaves `rule` open to any host; this app's catalog and evaluator use its own six rule names. */
export type HostToolApprovalPolicy = ToolApprovalPolicy<HostToolApprovalRule>;

/**
 * One projection pass over domain-owned registration contracts, never handler-derived risk.
 * Shared placement lets the session callback gate read these facts without importing handlers
 * or creating feature dependency cycles. Side effects and derived risk retain their independent
 * owners; these declarations do not reclassify either.
 */
export const nativeToolMetadata = projectToolMetadata<HostToolApprovalPolicy>({ domains: [
  { domain: 'agent-plugins', tools: agent_plugins },
  { domain: 'analytics', tools: analytics },
  { domain: 'assistant', tools: assistant },
  { domain: 'change-sets', tools: change_sets },
  { domain: 'comments', tools: comments },
  { domain: 'commerce', tools: commerce },
  { domain: 'consent', tools: consent },
  { domain: 'content-duplication', tools: content_duplication },
  { domain: 'content-read', tools: content_read },
  { domain: 'content-types', tools: content_types },
  { domain: 'custom-credentials', tools: custom_credentials },
  { domain: 'database', tools: database },
  { domain: 'database-transfer', tools: database_transfer },
  { domain: 'deploy-ops', tools: deploy_ops },
  { domain: 'deployments', tools: deployments },
  { domain: 'domain-dns', tools: domain_dns },
  { domain: 'email-templates', tools: email_templates },
  { domain: 'external-mcp', tools: external_mcp },
  { domain: 'entries', tools: entries },
  { domain: 'forms', tools: forms },
  { domain: 'frontend-control', tools: frontend_control },
  { domain: 'fs-files', tools: fs_files },
  { domain: 'identity', tools: identity },
  { domain: 'files-copy', tools: files_copy },
  { domain: 'image-transform', tools: image_transform },
  { domain: 'mail-status', tools: mail_status },
  { domain: 'media', tools: media },
  { domain: 'media-generation', tools: media_generation },
  { domain: 'media-import', tools: media_import },
  { domain: 'members', tools: members },
  { domain: 'navigation', tools: navigation },
  { domain: 'newsletter', tools: newsletter },
  { domain: 'pages', tools: pages },
  { domain: 'permanent-delete', tools: permanent_delete },
  { domain: 'plugin-runtime', tools: plugin_runtime },
  { domain: 'post', tools: post },
  { domain: 'publish-content', tools: publish_content },
  { domain: 'recovery', tools: recovery },
  { domain: 'redirects', tools: redirects },
  { domain: 'search', tools: search },
  { domain: 'seo', tools: seo },
  { domain: 'server-logs', tools: server_logs },
  { domain: 'observability', tools: observability },
  { domain: 'settings', tools: settings },
  { domain: 'visitor-tools', tools: visitor_tools },
  { domain: 'site-backup', tools: site_backup },
  { domain: 'site-evidence', tools: site_evidence },
  { domain: 'site-guide', tools: site_guide },
  { domain: 'site-inspection', tools: site_inspection },
  { domain: 'sites', tools: sites },
  { domain: 'skills', tools: skills },
  { domain: 'source-control', tools: source_control },
  { domain: 'taxonomy', tools: taxonomy },
  { domain: 'theme', tools: theme },
  { domain: 'trash', tools: trash },
  { domain: 'web', tools: web },
  { domain: 'web-screenshot', tools: web_screenshot },
  { domain: 'webhooks', tools: webhooks },
  { domain: 'widgets', tools: widgets },
  { domain: 'workspace', tools: workspace },
] });
