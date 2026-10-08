import { projectToolMetadata } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';
import { toolMetadata as agent_plugins } from './agent-plugins.js';
import { toolMetadata as analytics } from './analytics.js';
import { toolMetadata as assistant } from './assistant.js';
import { toolMetadata as change_sets } from './change-sets.js';
import { toolMetadata as comments } from './comments.js';
import { toolMetadata as content_duplication } from './content-duplication.js';
import { toolMetadata as content_read } from './content-read.js';
import { toolMetadata as content_types } from './content-types.js';
import { toolMetadata as custom_credentials } from './custom-credentials.js';
import { toolMetadata as database } from './database.js';
import { toolMetadata as database_transfer } from './database-transfer.js';
import { toolMetadata as deploy_ops } from './deploy-ops.js';
import { toolMetadata as deployments } from './deployments.js';
import { toolMetadata as domain_dns } from './domain-dns.js';
import { toolMetadata as external_mcp } from './external-mcp.js';
import { toolMetadata as entries } from './entries.js';
import { toolMetadata as forms } from './forms.js';
import { toolMetadata as frontend_control } from './frontend-control.js';
import { toolMetadata as fs_files } from './fs-files.js';
import { toolMetadata as identity } from './identity.js';
import { toolMetadata as mail_status } from './mail-status.js';
import { toolMetadata as media } from './media.js';
import { toolMetadata as media_generation } from './media-generation.js';
import { toolMetadata as media_import } from './media-import.js';
import { toolMetadata as members } from './members.js';
import { toolMetadata as navigation } from './navigation.js';
import { toolMetadata as newsletter } from './newsletter.js';
import { toolMetadata as pages } from './pages.js';
import { toolMetadata as permanent_delete } from './permanent-delete.js';
import { toolMetadata as plugin_runtime } from './plugin-runtime.js';
import { toolMetadata as post } from './post.js';
import { toolMetadata as publish_content } from './publish-content.js';
import { toolMetadata as recovery } from './recovery.js';
import { toolMetadata as redirects } from './redirects.js';
import { toolMetadata as seo } from './seo.js';
import { toolMetadata as server_logs } from './server-logs.js';
import { toolMetadata as settings } from './settings.js';
import { toolMetadata as site_backup } from './site-backup.js';
import { toolMetadata as site_evidence } from './site-evidence.js';
import { toolMetadata as site_inspection } from './site-inspection.js';
import { toolMetadata as sites } from './sites.js';
import { toolMetadata as skills } from './skills.js';
import { toolMetadata as source_control } from './source-control.js';
import { toolMetadata as taxonomy } from './taxonomy.js';
import { toolMetadata as theme } from './theme.js';
import { toolMetadata as trash } from './trash.js';
import { toolMetadata as webhooks } from './webhooks.js';
import { toolMetadata as widgets } from './widgets.js';
import { toolMetadata as workspace } from './workspace.js';

/**
 * One projection pass over domain-owned registration contracts, never handler-derived risk.
 * Shared placement lets the session callback gate read these facts without importing handlers
 * or creating feature dependency cycles. Side effects and derived risk retain their independent
 * owners; these declarations do not reclassify either.
 */
export const nativeToolMetadata = projectToolMetadata<ToolApprovalPolicy>({ domains: [
  { domain: 'agent-plugins', tools: agent_plugins },
  { domain: 'analytics', tools: analytics },
  { domain: 'assistant', tools: assistant },
  { domain: 'change-sets', tools: change_sets },
  { domain: 'comments', tools: comments },
  { domain: 'content-duplication', tools: content_duplication },
  { domain: 'content-read', tools: content_read },
  { domain: 'content-types', tools: content_types },
  { domain: 'custom-credentials', tools: custom_credentials },
  { domain: 'database', tools: database },
  { domain: 'database-transfer', tools: database_transfer },
  { domain: 'deploy-ops', tools: deploy_ops },
  { domain: 'deployments', tools: deployments },
  { domain: 'domain-dns', tools: domain_dns },
  { domain: 'external-mcp', tools: external_mcp },
  { domain: 'entries', tools: entries },
  { domain: 'forms', tools: forms },
  { domain: 'frontend-control', tools: frontend_control },
  { domain: 'fs-files', tools: fs_files },
  { domain: 'identity', tools: identity },
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
  { domain: 'seo', tools: seo },
  { domain: 'server-logs', tools: server_logs },
  { domain: 'settings', tools: settings },
  { domain: 'site-backup', tools: site_backup },
  { domain: 'site-evidence', tools: site_evidence },
  { domain: 'site-inspection', tools: site_inspection },
  { domain: 'sites', tools: sites },
  { domain: 'skills', tools: skills },
  { domain: 'source-control', tools: source_control },
  { domain: 'taxonomy', tools: taxonomy },
  { domain: 'theme', tools: theme },
  { domain: 'trash', tools: trash },
  { domain: 'webhooks', tools: webhooks },
  { domain: 'widgets', tools: widgets },
  { domain: 'workspace', tools: workspace },
] });
