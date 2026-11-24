import { createConsoleLogger } from "@jini-ai/core/primitives";
import { createPluginHookErrorEnvelope } from "@jini-ai/cms/admin-http/http/plugin-hook-error";
import { pluginHookRefusalText } from "@jini-ai/plugins/host/hook-refusals";
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
