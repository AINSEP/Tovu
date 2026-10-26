/** Tovu-app usage projection. Site events keep their original payload on the independent branch. */
import type { ProductEvent, ProductEventProperties } from '@jini-ai/analytics/product';
import { TOOL_ATTEMPT_PHASES } from '@jini-ai/daemon/tool-audit';

const source = Object.freeze(['admin', 'assistant', 'service']);
const chatSurface = Object.freeze(['admin', 'daemon', 'public']);
const runOutcome = Object.freeze(['succeeded', 'failed', 'cancelled', 'canceled']);
const toolOutcome = Object.freeze(TOOL_ATTEMPT_PHASES.filter(phase => phase !== 'requested'));
type Rules = Readonly<Record<string, readonly string[] | 'boolean' | 'number'>>;

/** Closed property vocabularies, frozen at both levels. IDs, tool names, target names and text
 * have no rule: installed plugins and deploy targets are open catalogs, not product labels.
 * Call-site property inventory (variants share the same projection below):
 * - assistant run starts (assistant/byok modules, daemon): chatSurface, logicalRunId, eventId.
 * - run finishes (same plus run-ledger, site-assistant): the above plus outcome.
 * - assistant-chats chat starts: chatSurface, conversationId, source, eventId.
 * - assistant-chats/site-assistant messages: chatSurface, conversationId?, inputKind, eventId.
 * - tool-use-events/site-assistant: toolId, outcome, chatSurface, attemptId, eventId.
 * - site-admin creation: targetSiteId, templateKind, source.
 * - import-backend: targetSiteId, operationId, eventId, source.
 * - export-run: outcome, operationId, eventId, source.
 * - content-events publishes: eventId, resourceKind, resourceId, source, initialStatus?.
 * - presentation/theme setters: themeId, source.
 * - plugin install routes/tools: pluginId, pluginKind, source; toggles also enabled.
 * - media/analytics: kind, bytesBucket, source.
 * - publish-site/publish-agent-tools: target?, reasonClass, source.
 * - plugin install failures: operationKind, reasonClass, surface, retryable.
 * - provider-settings-save: contract, pluginId, action.
 * - browser-telemetry: route (renamed and shortened to screen).
 * Unlisted identity/free-text properties are intentionally omitted, including tool IDs rather
 * than inventing a category taxonomy. Product events never retain outbox/deduplication IDs.
 */
export const PRODUCT_EVENTS: Readonly<Record<string, Rules>> = Object.freeze(Object.fromEntries(Object.entries({
  app_started: { launchMode: ['fresh', 'update'] },
  // Memory is numeric and grouped by closed process kinds; release attribution is the app version.
  app_memory_sample: Object.fromEntries(['uptimeSeconds', 'processCount', ...['main', 'renderer', 'server', 'daemon', 'other']
    .flatMap(kind => [`${kind}RssMb`, `${kind}Count`, `${kind}HeapUsedMb`])].map(key => [key, 'number' as const])),
  desktop_screen_viewed: { screen: ['home', 'projects', 'templates', 'marketplace', 'tasks', 'generation', 'activity', 'updates', 'deploy', 'diagnostics', 'api-keys', 'settings', 'account', 'appearance', 'create_website'] },
  desktop_action: { action: ['create_website', 'add_existing_website', 'open_admin', 'open_preview', 'start_site', 'stop_site', 'open_settings', 'check_updates', 'open_chat'] },
  admin_pageview: {},
  assistant_run_started: { chatSurface },
  assistant_run_finished: { chatSurface, outcome: runOutcome },
  assistant_chat_started: { chatSurface, source },
  assistant_message_sent: { chatSurface, inputKind: ['text'], source },
  assistant_tool_used: { chatSurface, outcome: toolOutcome },
  site_created: { templateKind: ['default'], source },
  site_imported: { source },
  site_exported: { outcome: ['completed', 'errored'], source },
  post_published: { resourceKind: ['post'], source, initialStatus: ['draft', 'published', 'scheduled'] },
  page_published: { resourceKind: ['page'], source, initialStatus: ['draft', 'published', 'scheduled'] },
  theme_changed: { source },
  plugin_installed: { pluginKind: ['cms'], source },
  plugin_toggled: { pluginKind: ['cms'], enabled: 'boolean', source },
  media_uploaded: { kind: ['image', 'audio', 'video', 'document', 'other'], bytesBucket: ['<100KB', '<1MB', '<10MB', '10MB+'], source },
  site_publish_blocked: { reasonClass: ['auth', 'config', 'consent', 'busy'], source },
  operation_failed: { operationKind: ['plugin_install'], reasonClass: ['refused', 'internal'], surface: ['admin', 'assistant'], retryable: 'boolean' },
  provider_configured: { contract: ['observability', 'product_analytics', 'ai_trace'], action: ['save'] },
}).map(([name, rules]) => [name, Object.freeze(Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, Array.isArray(rule) ? Object.freeze(rule) : rule])))])));

/** Reduce an existing route template to two segments; later segments can contain site slugs.
 * @returns The projected admin screen, or undefined outside admin. @complexity O(n) route length.
 */
export function productAdminScreen({ route }: { route: unknown }, _options = {}): string | undefined {
  if (typeof route !== 'string') return undefined;
  const parts = route.split(/[?#]/, 1)[0]!.split('/');
  if (parts[1] !== 'admin') return undefined;
  return parts[2] ? `/admin/${parts[2]}` : '/admin';
}

/** Check one declared value without coercion. @complexity O(e) in the small enum size. */
function allowedValue({ rule, value }: { rule: Rules[string]; value: unknown }, _options = {}): boolean {
  if (rule === 'boolean') return typeof value === 'boolean';
  if (rule === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string' && rule.includes(value);
}

/** Project only catalog properties and replace all caller identity with installation identity.
 * Unknown fields are omitted; an invalid value of a declared field refuses the whole event.
 * @returns A fresh event, or undefined for unapproved names/values/identity. No effects.
 * @example projectProductEvent({ event: { name: 'app_started', userId: 'ignored' }, installationId: 'fake-install' });
 * @complexity O(k) declared keys, bounded by the frozen catalog; no caller-property scan.
 */
export function projectProductEvent({ event, installationId }: { event: ProductEvent; installationId: string | null }, _options = {}): ProductEvent | undefined {
  if (!installationId || !Object.hasOwn(PRODUCT_EVENTS, event.name)) return undefined;
  if (event.name === 'admin_pageview') {
    const screen = productAdminScreen({ route: event.properties?.route });
    return screen ? { name: 'admin_screen_viewed', userId: installationId, properties: { screen } } : undefined;
  }
  const properties: Record<string, ProductEventProperties[string]> = {};
  for (const [key, rule] of Object.entries(PRODUCT_EVENTS[event.name]!)) {
    const value = event.properties?.[key];
    if (value === undefined) continue;
    if (!allowedValue({ rule, value })) return undefined;
    properties[key] = value;
  }
  return { name: event.name, userId: installationId, properties };
}
