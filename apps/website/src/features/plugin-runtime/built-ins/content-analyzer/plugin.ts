/**
 * @file `content-analyzer` tier-2 worker entry: the module the Tier-2 host loads inside its worker.
 *
 * Jini's `@jini-ai/cms/seo/content-analyzer-plugin/plugin` is a factory with no default export, so
 * the host owns this entry: it binds the factory to the SDK `definePlugin` and the beforeSave hook
 * name and default-exports the defined plugin. `@tovu/sdk` is resolved inside the worker by the
 * tier-2 SDK resolver (`../../sdk-resolver.ts`). Never import `pluginHostBinding` (or anything else
 * under `host-binding`) here: it pulls server modules into the sandboxed worker.
 */
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";
import { createContentAnalyzerPlugin, type ContentAnalyzerPluginBinding } from "@jini-ai/cms/seo/content-analyzer-plugin/plugin";

// Type-only widening, not a runtime adapter: Jini's binding types `definePlugin` over an SDK whose
// `addFilter` takes ANY hook name (and whose `plugins` rows carry Jini's full `PluginProvider`), while
// `@tovu/sdk` narrows both, so the parameter check fails contravariantly. The factory only ever calls
// `addFilter(beforeSaveHook, …)` with the `HOOK_CONTENT_ENTRY_BEFORE_SAVE` passed below, which
// `@tovu/sdk` accepts. Remove once Jini makes the binding generic over the host's SDK.
const bindDefinePlugin = definePlugin as unknown as ContentAnalyzerPluginBinding["definePlugin"];

export default createContentAnalyzerPlugin({ definePlugin: bindDefinePlugin, beforeSaveHook: HOOK_CONTENT_ENTRY_BEFORE_SAVE });
