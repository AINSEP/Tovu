import { toolMetadata as commerce } from '@jini-ai/core/tool-metadata/commerce';
import { toolMetadata as consent } from '@jini-ai/core/tool-metadata/consent';
import { projectToolMetadata } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '@jini-ai/core/contracts/site/tool-metadata-approval-policy';

import { createAgentPluginsToolMetadata } from '@jini-ai/core/tool-metadata/agent-plugins';
import { toolMetadata as analytics } from '@jini-ai/core/tool-metadata/analytics';
import { toolMetadata as assistant } from '@jini-ai/chat/core/assistant-tool-metadata';
import { toolMetadata as change_sets } from '@jini-ai/core/tool-metadata/change-sets';
import { toolMetadata as comments } from '@jini-ai/core/tool-metadata/comments';
import { toolMetadata as content_duplication } from '@jini-ai/core/tool-metadata/content-duplication';
import { toolMetadata as content_read } from './content-read.js';
import { toolMetadata as content_types } from '@jini-ai/core/tool-metadata/content-types';
import { toolMetadata as custom_credentials } from '@jini-ai/core/tool-metadata/custom-credentials';
import { toolMetadata as database } from '@jini-ai/core/tool-metadata/database';
import { toolMetadata as database_transfer } from '@jini-ai/core/tool-metadata/database-transfer';
import { createDeployOpsToolMetadata } from '@jini-ai/core/tool-metadata/deploy-ops';
import { toolMetadata as deployments } from '@jini-ai/core/tool-metadata/deployments';
import { toolMetadata as domain_dns } from '@jini-ai/core/tool-metadata/domain-dns';
import { toolMetadata as external_mcp } from '@jini-ai/core/tool-metadata/external-mcp';
import { toolMetadata as entries } from '@jini-ai/core/tool-metadata/entries';
import { toolMetadata as forms } from '@jini-ai/core/tool-metadata/forms';
import { toolMetadata as frontend_control } from '@jini-ai/core/tool-metadata/frontend-control';
import { toolMetadata as fs_files } from '@jini-ai/core/tool-metadata/fs-files';
import { toolMetadata as identity } from '@jini-ai/core/tool-metadata/identity';
import { toolMetadata as files_copy } from '@jini-ai/core/tool-metadata/files-copy';
import { toolMetadata as image_transform } from '@jini-ai/core/tool-metadata/image-transform';
import { toolMetadata as email_templates } from '@jini-ai/core/tool-metadata/email-templates';
import { toolMetadata as mail_status } from '@jini-ai/core/tool-metadata/mail-status';
import { toolMetadata as media } from '@jini-ai/core/tool-metadata/media';
import { toolMetadata as media_generation } from '@jini-ai/core/tool-metadata/media-generation';
import { toolMetadata as media_video_conversion } from './media-video-conversion.js';
import { toolMetadata as media_import } from '@jini-ai/core/tool-metadata/media-import';
import { toolMetadata as members } from '@jini-ai/core/tool-metadata/members';
import { toolMetadata as navigation } from '@jini-ai/core/tool-metadata/navigation';
import { toolMetadata as newsletter } from '@jini-ai/core/tool-metadata/newsletter';
import { toolMetadata as pages } from '@jini-ai/core/tool-metadata/pages';
import { toolMetadata as permanent_delete } from '@jini-ai/core/tool-metadata/permanent-delete';
import { createPluginRuntimeToolMetadata } from '@jini-ai/core/tool-metadata/plugin-runtime';
import { toolMetadata as post } from '@jini-ai/core/tool-metadata/post';
import { toolMetadata as publish_content } from '@jini-ai/cms/publish/content/tool-metadata';
import { toolMetadata as recovery } from '@jini-ai/core/tool-metadata/recovery';
import { toolMetadata as redirects } from '@jini-ai/core/tool-metadata/redirects';
import { toolMetadata as search } from '@jini-ai/core/tool-metadata/search';
import { toolMetadata as seo } from '@jini-ai/core/tool-metadata/seo';
import { toolMetadata as server_logs } from '@jini-ai/core/tool-metadata/server-logs';
import { toolMetadata as observability } from '@jini-ai/core/tool-metadata/observability';
import { toolMetadata as settings } from '@jini-ai/core/tool-metadata/settings';
import { toolMetadata as visitor_tools } from '@jini-ai/core/tool-metadata/visitor-tools';
import { createSiteBackupToolMetadata } from '@jini-ai/core/tool-metadata/site-backup';
import { toolMetadata as site_evidence } from '@jini-ai/core/tool-metadata/site-evidence';
import { createSiteGuideToolMetadata } from '@jini-ai/core/tool-metadata/site-guide';
import { toolMetadata as agent_pause } from './agent-pause.js';
import { toolMetadata as site_inspection } from '@jini-ai/core/tool-metadata/site-inspection';
import { toolMetadata as site_update } from './site-update.js';
import { toolMetadata as sites } from '@jini-ai/core/tool-metadata/sites';
import { toolMetadata as skills } from '@jini-ai/core/tool-metadata/skills';
import { toolMetadata as source_control } from '@jini-ai/core/tool-metadata/source-control';
import { toolMetadata as taxonomy } from '@jini-ai/cms/taxonomy/site/tool-metadata';
import { toolMetadata as theme } from './theme.js';
import { toolMetadata as trash } from '@jini-ai/core/tool-metadata/trash';
import { toolMetadata as web } from '@jini-ai/core/tool-metadata/web';
import { toolMetadata as web_screenshot } from '@jini-ai/core/tool-metadata/web-screenshot';
import { toolMetadata as webhooks } from '@jini-ai/core/tool-metadata/webhooks';
import { toolMetadata as widgets } from '@jini-ai/core/tool-metadata/widgets';
import { toolMetadata as workspace } from '@jini-ai/core/tool-metadata/workspace';

/** deploy-ops and site-backup search queries name this product (its site-key env var and its portable
 * archive), so the host binds that vocabulary here; their registration files import these bindings. */
export const deployOpsToolMetadata = createDeployOpsToolMetadata({ siteKeyEnvName: 'TOVU_SITE_KEY' });
export const siteBackupToolMetadata = createSiteBackupToolMetadata({ archiveLabel: 'Tovu ZIP' });
/** agent-plugins, plugin-runtime and site-guide search copy names this product (its bundled theme plugin id,
 * its plugin package term and its name), so the host binds that vocabulary here too. */
export const agentPluginsToolMetadata = createAgentPluginsToolMetadata({ bundledThemePluginId: 'tovu-theme' });
export const pluginRuntimeToolMetadata = createPluginRuntimeToolMetadata({ pluginKeyword: 'tovu-plugin' });
export const siteGuideToolMetadata = createSiteGuideToolMetadata({ productName: 'Tovu' });
const deploy_ops = deployOpsToolMetadata;
const site_backup = siteBackupToolMetadata;
const agent_plugins = agentPluginsToolMetadata;
const plugin_runtime = pluginRuntimeToolMetadata;
const site_guide = siteGuideToolMetadata;

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
  { domain: 'media-video-conversion', tools: media_video_conversion },
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
  { domain: 'agent-pause', tools: agent_pause },
  { domain: 'site-inspection', tools: site_inspection },
  { domain: 'site-update', tools: site_update },
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
