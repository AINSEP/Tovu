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
import { createContentAnalyzerPlugin } from "@jini-ai/cms/seo/content-analyzer-plugin/plugin";

export default createContentAnalyzerPlugin({ definePlugin, beforeSaveHook: HOOK_CONTENT_ENTRY_BEFORE_SAVE });
