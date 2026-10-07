import { loadDeployOpsRegistry, requirePlatform } from "./registry.js";
import { ToolInputError, type ToolExecutionContext, type ToolExecutionOptions } from "@jini-ai/core";
import { buildFormSurface, buildOutcomeSurface, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import { credentialText } from "#src/contracts/core/credential-copy";
import { askThenReport, SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps } from "#src/contracts/core/tool-surface-exchanges";
import { resolveOperatorLocale } from "#src/features/agent-plugins/operator-locale";
import { boundContext, DeployCredentialSetupRequired, type DeployOpsToolDeps } from "./run-ops.js";
import { runSetSecret, type SecretConfirm, type SetSecretInput } from "./secrets.js";

/** Only the human card receives the value. Neither source nor the model-facing result carries it. */
export async function collectTypedDeploySecret(
  { ctx, deps, surfaces, input, permit }: { ctx: ToolExecutionContext; deps: DeployOpsToolDeps; surfaces?: AssistantSurfaceDeps; input: SetSecretInput; permit: () => Promise<void> },
  { emitSurface, confirm }: ToolExecutionOptions & { confirm?: SecretConfirm } = {},
): Promise<unknown> {
  if (!surfaces || !emitSurface) throw new ToolInputError({ message: "A typed deployment secret requires an interactive secure card. Nothing was changed." });
  if (ctx.signal.aborted) return { changed: false, cancelled: true };
  // Resolve the host credential before collecting another secret, so recovery opens that card first.
  const registry = await (deps.loadDeployOps ?? loadDeployOpsRegistry)({ workspaceId: deps.workspaceId });
  const platform = requirePlatform(registry, input.platform);
  if (!platform.module.setSecret) throw new ToolInputError({ message: "This platform has no secrets adapter." });
  await boundContext(deps, platform, input.credentialLabel, ctx.signal);
  const locale = await resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: ctx.principal.id });
  const exchange = surfaces.surfaceExchanges.open({ toolId: "deployment_ops_set_secret", principalId: ctx.principal.id }, emitSurface);
  const close = () => exchange.close();
  ctx.signal.addEventListener("abort", close, { once: true });
  const title = `${input.name} · ${input.target}`;
  const resource = buildFormSurface({
    uri: `ui://tovu/deploy-ops-secret/${exchange.id}` as UIResourceUri, title,
    description: credentialText({ id: "secretForm", locale }),
    submitLabel: credentialText({ id: "saveSecret", locale }), toolName: "deployment_ops_set_secret",
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
    text: { showSecret: credentialText({ id: "showSecret", locale }), hideSecret: credentialText({ id: "hideSecret", locale }) },
    fields: [{ kind: "string", name: "value", label: credentialText({ id: "secretValue", locale }), secret: true, multiline: true, required: true }],
    cancel: { label: credentialText({ id: "cancel", locale }), toolName: "deployment_ops_set_secret", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
  });
  try {
    return await askThenReport<unknown>(exchange, { channel: "mcp-ui", payload: { resource } }, async answer => {
      if (answer.status !== "received" || answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: { changed: false, cancelled: true } };
      let result: unknown;
      let saved = false;
      try {
        await permit();
        // No trim: provider secrets may contain intentional whitespace and newlines.
        result = await runSetSecret({ deps, input }, { signal: ctx.signal, confirm, typedValue: answer.params.value });
        saved = (result as { changed?: boolean; comparison?: string }).changed === true || (result as { comparison?: string }).comparison === "same";
      } catch (error) {
        if (error instanceof DeployCredentialSetupRequired) return { result: { executed: false, credentialSetup: error.credentialSetup } };
        // Vendor and adapter errors can echo the just-submitted value. Return fixed text only.
        result = { changed: false, message: credentialText({ id: "storage", locale }) };
      }
      const message = credentialText({ id: saved ? "savedTitle" : "storage", locale });
      return { result, outcome: { channel: "mcp-ui", payload: { resource: buildOutcomeSurface({
        uri: `ui://tovu/deploy-ops-secret/${exchange.id}` as UIResourceUri, title,
        state: saved ? "success" : "failure", message,
      }) } } };
    });
  } finally { ctx.signal.removeEventListener("abort", close); exchange.close(); }
}
