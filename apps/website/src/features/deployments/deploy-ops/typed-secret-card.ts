import { SECRET_FORM_CARD_DEFINITIONS } from '../../../contracts/headless/index.js';
import { credentialText } from '#src/contracts/core/credential-copy';
import { resolveOperatorLocale } from '#src/features/settings/index';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport, type AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { DeployOpsSecretCards, SetSecretInput, SecretConfirm } from '@jini-ai/devops/deploy';
import { bindDeployOpsRuntime, type DeployOpsToolDeps } from './run-ops.js';
import { collectTypedDeploySecret as collect } from './portable/ops-secret-card.js';
export function bindDeploySecretCards(deps:DeployOpsToolDeps,surfaces?:AssistantSurfaceDeps):DeployOpsSecretCards {
 return {defineSecretCardTool,askThenReport,surfaceExchanges:surfaces?.surfaceExchanges,uriHost:'tovu',defaultLocale:'en',noEmitter:'A typed deployment secret requires an interactive secure card. Nothing was changed.',
 locale:({ctx})=>resolveOperatorLocale({deps,workspaceId:deps.workspaceId,principalId:ctx.principal.id}),
 text:({id,locale})=>credentialText({id,locale}),
 form:({locale,title})=>({
      title, description: credentialText({ id: "secretForm", locale: locale }),
      submitLabel: credentialText({ id: "saveSecret", locale: locale }),
      text: { showSecret: credentialText({ id: "showSecret", locale: locale }), hideSecret: credentialText({ id: "hideSecret", locale: locale }) },
      fields: [{ kind: "string", name: "value", label: credentialText({ id: "secretValue", locale: locale }),
        ...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, required: true }],
      cancelLabel: credentialText({ id: "cancel", locale: locale }),
    })
 };
}
export function collectTypedDeploySecret({ctx,deps,surfaces,input,permit}:{ctx:ToolExecutionContext;deps:DeployOpsToolDeps;surfaces?:AssistantSurfaceDeps;input:SetSecretInput;permit:()=>Promise<void>},optional:ToolExecutionOptions & {confirm?:SecretConfirm}={}) {return collect({ctx,deps:bindDeployOpsRuntime(deps),cards:bindDeploySecretCards(deps,surfaces),input,permit},optional);}
