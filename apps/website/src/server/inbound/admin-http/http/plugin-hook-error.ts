import { createConsoleLogger } from "@jini-ai/core/primitives";
import { createPluginHookErrorEnvelope } from "@jini-ai/cms/admin-http/http/plugin-hook-error";
import { pluginHookRefusalText } from "#src/contracts/core/plugin-hook-failed-error";
import { PluginHookFailedError } from "@jini-ai/plugins/host";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

export type { PluginHookErrorResponse, PluginHookFailedBody } from "@jini-ai/cms/admin-http/http/plugin-hook-error";

const consoleLogger = createConsoleLogger({ prefix: "" });

/**
 * @file Tovu's binding of the Jini `PLUGIN_HOOK_FAILED` envelope (RT-K1-adm-plugin-hook-error).
 *
 * The envelope (status, code, which fields leave the server, the redacted log line) moved to
 * `@jini-ai/cms/admin-http/http/plugin-hook-error`. What stays here is Tovu's own half, which the
 * engine cannot name: the plugin host's error class, Tovu's public refusal copy
 * (`pluginHookRefusalText`) and its secret redaction. The callers (`widgets.ts`, plugin preview,
 * publish-content import errors, the posts/pages save registrars) call these with no args object,
 * so the copy has nowhere else to be bound (K3: the binding stays host-side).
 */
const envelope = createPluginHookErrorEnvelope<PluginHookFailedError>({
  isPluginHookFailure: (err): err is PluginHookFailedError => err instanceof PluginHookFailedError,
  refusalText: pluginHookRefusalText,
  redact: (text) => redactSecretShapes({ text }).text,
  warn: (message) => consoleLogger.warn({ message }),
});

/** The 500 `PLUGIN_HOOK_FAILED` body with Tovu's refusal copy; logs the redacted cause. */
export const pluginHookFailedBody = envelope.pluginHookFailedBody;
/** Writes the envelope for a `PluginHookFailedError` and returns `true`; `false` (writes nothing) otherwise. */
export const sendPluginHookFailedError = envelope.sendPluginHookFailedError;
/** For Jini route specs: throws the flat 500 refusal for a hook failure; returns for anything else. */
export const rejectPluginHookFailure = envelope.rejectPluginHookFailure;
