import { SECRET_FORM_CARD_DEFINITIONS } from "../../../contracts/headless/secret-form-cards.js";
import { loadDeployOpsRegistry, requirePlatform } from "./registry.js";
import { ToolInputError, type ToolExecutionContext, type ToolExecutionOptions } from "@jini-ai/core";
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { credentialText } from "#src/contracts/core/credential-copy";
import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { resolveOperatorLocale } from "#src/features/agent-plugins/operator-locale";
import { boundContext, DeployCredentialSetupRequired, type DeployOpsToolDeps } from "./run-ops.js";
import { runSetSecret, type SecretConfirm, type SetSecretInput } from "./secrets.js";

/** Only the human card receives the value. Neither source nor the model-facing result carries it. */
export async function collectTypedDeploySecret(
  { ctx, deps, surfaces, input, permit }: { ctx: ToolExecutionContext; deps: DeployOpsToolDeps; surfaces?: AssistantSurfaceDeps; input: SetSecretInput; permit: () => Promise<void> },
  { emitSurface, confirm }: ToolExecutionOptions & { confirm?: SecretConfirm } = {},
): Promise<unknown> {
  if (!surfaces) throw new ToolInputError({ message: "A typed deployment secret requires an interactive secure card. Nothing was changed." });
  let locale = "en";
  const title = `${input.name} · ${input.target}`;
  const card = defineSecretCardTool<{ locale: string }, { result: unknown; saved: boolean; recovery?: true }, unknown>({
    toolId: "deployment_ops_set_secret",
    prepare: async () => {
      if (ctx.signal.aborted) return { locale };
      // Resolve the host credential before collecting another secret, so recovery opens that card first.
      const registry = await (deps.loadDeployOps ?? loadDeployOpsRegistry)({ workspaceId: deps.workspaceId });
      const platform = requirePlatform(registry, input.platform);
      if (!platform.module.setSecret) throw new ToolInputError({ message: "This platform has no secrets adapter." });
      await boundContext(deps, platform, input.credentialLabel, ctx.signal);
      locale = await resolveOperatorLocale({ deps, workspaceId: deps.workspaceId, principalId: ctx.principal.id });
      return { locale };
    },
    form: ({ prep }) => ({
      title, description: credentialText({ id: "secretForm", locale: prep.locale }),
      submitLabel: credentialText({ id: "saveSecret", locale: prep.locale }),
      text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret: credentialText({ id: "hideSecret", locale: prep.locale }) },
      fields: [{ kind: "string", name: "value", label: credentialText({ id: "secretValue", locale: prep.locale }),
        ...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret.secretField, multiline: true, required: true }],
      cancelLabel: credentialText({ id: "cancel", locale: prep.locale }),
    }),
    save: async ({ values, signal }) => {
      try {
        await permit();
        // No trim: provider secrets may contain intentional whitespace and newlines.
        const result = await runSetSecret({ deps, input }, { signal, confirm, typedValue: values.value });
        return { result, saved: result.changed === true || result.comparison === "same" };
      } catch (error) {
        if (error instanceof DeployCredentialSetupRequired) return { result: { executed: false, credentialSetup: error.credentialSetup }, saved: false, recovery: true as const };
        throw error;
      }
    },
    result: ({ prep, run }) => {
      if (run.status === "saved") return run.saved.result;
      if (run.status === "failed" || run.status === "blank") return { changed: false, message: credentialText({ id: "storage", locale: prep.locale }) };
      return { changed: false, cancelled: true };
    },
    outcome: ({ prep, run }) => {
      if (run.status === "saved" && run.saved.recovery) return undefined;
      if (run.status !== "saved" && run.status !== "failed" && run.status !== "blank") return undefined;
      const saved = run.status === "saved" && run.saved.saved;
      return { title, state: saved ? "success" : "failure", message: credentialText({ id: saved ? "savedTitle" : "storage", locale: prep.locale }) };
    },
  }, {
    uriHost: "tovu", text: { noEmitter: "A typed deployment secret requires an interactive secure card. Nothing was changed." },
    // Vendor and adapter errors can echo the just-submitted value. Return fixed text only.
    safeError: () => credentialText({ id: "storage", locale }),
  });
  return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, { emitSurface });
}
