import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { withExtensionApprovalPolicy } from '../../../../assistant/assistant-tool-approval-policy.js';
import { resolveAgentPluginLayout } from '../../layout.js';
import { createTovuAgentPluginLifecycle } from '../../lifecycle.js';
import { registerInstalledAgentPluginTools } from '../../tool-registrations.js';
import { selectedPluginSourceRoot } from '../fixtures/bundled-source-root.js';
import { forceRemove } from '../fixtures/force-remove.js';

const pluginIds = ['higgsfield-media', 'resend', 'supabase', 'composio', 'github-pages', 'meilisearch', 'google-workspace',
  'github', 'site-compliance', 'wordpress', 'opentelemetry', 'posthog', 'sentry', 'commerce',
  'formspree', 'google-forms', 'cloudflare', 'netlify', 'vercel', 's3-compatible', 'fly', 'railway', 'render'];
const overlayRoot = path.resolve(import.meta.dirname, '../../../../../../../content/agent-plugin-overlays');
const requiredTools: Record<string, readonly string[]> = {
  'higgsfield-media': ['agent_plugin_connect', 'media_import_from_url'],
  resend: ['agent_plugin_connect', 'system_get_mail_status', 'mail_set_provider', 'mail_send_test'], supabase: ['agent_plugin_connect'],
  composio: ['agent_plugin_connect'], 'github-pages': ['credential_save'], meilisearch: ['credential_save', 'Tovu Search — Meilisearch'],
  'google-workspace': ['_tovu_submission_id', '_tovu_submitted_at', 'TOVU_GOOGLE_PICKER_BROWSER_KEY', 'TOVU_GOOGLE_PICKER_APP_ID'],
  github: ['site_backup_plan', 'site_backup_push', 'source_control_get_capabilities', 'source_control_execute_commit'],
  'site-compliance': ['site_get_profile', 'site_collect_page_evidence'],
  wordpress: ['dns_plan', 'dns_instructions', 'dns_verify'],
  opentelemetry: ['provider_status', 'plugins_set_enabled', 'project_key_use', 'site_restart'],
  posthog: ['provider_status', 'plugins_set_enabled', 'project_key_use', 'site_restart'],
  sentry: ['provider_status', 'plugins_set_enabled', 'project_key_use', 'site_restart'],
  commerce: ['provider_status', 'commerce_get_status', 'commerce_create_product', 'commerce_create_price', 'settings_list_definitions', 'settings_set_value'],
  formspree: ['forms_update_definition'], 'google-forms': ['forms_update_definition'],
  cloudflare: ['deployment_get_static_publish_capabilities', 'deployment_preview_static_publish', 'deployment_execute_static_publish'],
  netlify: ['deployment_get_static_publish_capabilities', 'deployment_preview_static_publish', 'deployment_execute_static_publish'],
  vercel: ['deployment_get_static_publish_capabilities', 'deployment_preview_static_publish', 'deployment_execute_static_publish'],
  's3-compatible': ['deployment_get_static_publish_capabilities', 'deployment_preview_static_publish', 'deployment_execute_static_publish'],
  fly: ['credential_save', 'TOVU_SITE_KEY'],
  railway: ['deployment_ops_list_targets', 'deployment_ops_deploy', 'deployment_ops_logs', 'deployment_ops_wait'],
  render: ['deployment_ops_list_targets', 'deployment_ops_deploy', 'deployment_ops_status', 'deployment_ops_wait'],
};

/** Exercise actual gated tool output and pointer/injection delivery, not an isolated file read. */
test('Tovu delivers host tool rules beside portable skills, including tools-first delivery', async t => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'portable-host-guidance-'));
  const source = await selectedPluginSourceRoot({ pluginIds });
  t.after(async () => { await source.dispose(); await forceRemove(siteDir); });
  const layout = resolveAgentPluginLayout({ siteDir }, { env: {} });
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: source.root, hostOverlaysDir: overlayRoot });
  const workspaceId = 'workspace-local';
  const workspace = layout.forWorkspace(workspaceId);
  const seed = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId, sourceRoot: source.root });
  assert.equal(seed.ledgerFailure, undefined);
  for (const pluginId of pluginIds) await lifecycle.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId, enabled: true, actor: 'test:operator' });
  const registry = createToolRegistry({});
  await registerInstalledAgentPluginTools(registry, { workspaceId, agentPluginLayout: layout, withExtensionApprovalPolicy }, { overlaysDir: overlayRoot });
  const executor = createToolExecutor({ registry });
  for (const pluginId of pluginIds) {
    const toolId = `agent_plugin_${pluginId.replaceAll('-', '_')}`;
    const pointer = await lifecycle.resolveAgentPluginRefs([pluginId], workspace, 'pointer');
    assert.equal(pointer.ok, true, pluginId);
    assert.match(pointer.promptPrefix, /MANDATORY/);
    assert.ok(pointer.promptPrefix.includes(toolId), pluginId);
    const response = await executor.execute({ principal: { id: 'test:operator' }, run: { id: `run-${pluginId}` }, toolId, input: {} });
    assert.equal(response.status, 'completed', pluginId);
    const guidance = (response.output as { guidance: string }).guidance;
    const overlay = await readFile(path.join(overlayRoot, pluginId, 'GUIDANCE.md'), 'utf8');
    const skill = await readFile(path.join(source.root, pluginId, 'skills', pluginId, 'SKILL.md'), 'utf8');
    assert.ok(guidance.includes(overlay), `${pluginId} tool output includes its host overlay`);
    assert.ok(guidance.includes(skill), `${pluginId} tool output includes the portable skill`);
    assert.ok(guidance.indexOf(overlay) < guidance.indexOf(skill), `${pluginId} host rules precede portable guidance`);
    assert.equal(pointer.promptPrefix.includes(overlay), false, 'tools-first pointer defers overlay to actual gated output');
    for (const tool of requiredTools[pluginId]!) assert.ok(guidance.includes(tool), `${pluginId} retains ${tool}`);
    if (pluginId === 'resend') {
      assert.match(guidance, /target:\s*"resend-mcp"/);
      assert.match(guidance, /target:\s*"resend"/);
      assert.ok(guidance.includes('Tovu Mail — Resend API'));
    }
    const injected = await lifecycle.resolveAgentPluginRefs([pluginId], workspace, 'inject');
    assert.equal(injected.ok, true, pluginId);
    assert.ok(injected.promptPrefix.includes(overlay), pluginId);
    assert.ok(injected.promptPrefix.includes(skill), pluginId);
  }
});
