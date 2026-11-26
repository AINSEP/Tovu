import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { createHash } from "node:crypto";
import { CredentialInputError, normalizeCredentialToken } from "@jini-ai/platform/secrets/credential-token";
import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { CREDENTIAL_MESSAGES } from '@jini-ai/platform/secrets/credential-token';
import { credentialText, formatCredentialHint } from '@tovu/contracts/credential-copy';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
import { getMediaProviderCredentials, saveMediaProviderCredentials } from "@jini-ai/cms/media/site/provider-credential-store";
import type { CredentialPrep, CredentialSaved, ProposalResult, saveMediaCredential } from '@jini-ai/cms/media/site-generation/providers-tools';

const MEDIA_CREDENTIAL_POLICY = { ownerKey: "tovu", legacyIds: { grok: ["xai-grok-imagine"] },
  parseMeta: ({ meta }: { meta: unknown }) => parseTovuStoreMeta({ kind: "media-provider", meta }) as { baseUrl: string | null; model: string | null } };
const MEDIA_CREDENTIAL_BINDINGS = { vaultPolicy: MEDIA_CREDENTIAL_POLICY,
  credentialPolicy: { assertCredentialFreeField, normalizeCredentialToken }, builtInProviderIds: new Set(MEDIA_PROVIDERS.map(provider => provider.id)),
  credentialInputMessage: ({ error }: { error: unknown }) => error instanceof CredentialInputError ? error.message : undefined,
  storageMessage: CREDENTIAL_MESSAGES.storage, sha256Hex: ({ text }: { text: string }) => createHash("sha256").update(text).digest("hex"),
  createVault: (required: Omit<Parameters<typeof createTovuStoreVault>[0], "kind">) => createTovuStoreVault({ ...required, kind: "media-provider" }),
};


const CREDENTIAL_SAVE_FAILURE = 'Nothing was saved. Check the key and the server credential store, then try again.';

export const mediaProviderHost = {
  getMediaProviderCredentials: (deps, input) => getMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, workspaceId: input.workspaceId }),
  saveProviders: ({ deps, workspaceId }, { providers }) => saveMediaProviderCredentials({ deps: { ...MEDIA_CREDENTIAL_BINDINGS, ...deps }, input: { workspaceId, providers } }),
  assertCredentialFreeField,
  credentialText,
  formatCredentialHint,
  secureCard: ({ ctx, surfaces, prep, save, result, outcome }, optional) => {
    const card = defineSecretCardTool<CredentialPrep, CredentialSaved, ProposalResult>({
      toolId: CREDENTIAL_SAVE_TOOL_ID,
      prepare: async () => prep,
    form: ({ prep }) => ({
      title: `Connect ${prep.provider.label}`,
      description: prep.reason ?? 'Type the API key directly into this form. The assistant never sees it.',
      submitLabel: 'Save provider key',
      fields: [{ kind: 'string', name: 'apiKey', label: 'API key', secret: true, required: !prep.configured, allowBlank: prep.configured }],
    }),
      save: ({ values, signal }) => save({ value: values.apiKey as string, signal }),
      result,
      outcome,
    }, {
    uriHost: 'tovu',
    text: { noEmitter: 'media_propose_provider_credential requires an interactive form channel. Nothing was saved.', saveFailure: CREDENTIAL_SAVE_FAILURE },
    safeError: err => {
      const id = Object.entries(CREDENTIAL_MESSAGES).find(([, text]) => err instanceof Error && text === err.message)?.[0];
      return id ? credentialText({ id: id as keyof typeof CREDENTIAL_MESSAGES, locale: prep.locale }) : undefined;
    },
    logFailure: metadata => console.warn(JSON.stringify(metadata)),
    });
    return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, optional);
  },
} satisfies Parameters<typeof saveMediaCredential>[0]['host'];
