import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** custom-credentials registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "credential_save": {
    search: {
      keywords: "credential save connect add create new account api key token set update change rotate replace expired refresh secret human form " +
        "image generation video media provider openai repository backup git github gitlab source control commits " +
        "static publish hosting storage s3 bucket registrar dns third-party stripe mailchimp fly flyio fly.io " +
        "plugin personal access token pat fallback",
      queries: [
        "Save a new API credential through a secure human form.",
        "Set up my Fly.io account with a Fly API token before deploying an app.",
        "Add a provider token so this site can use my hosting account.",
        "Rotate the token on an existing saved account without changing the username.",
        "Connect an image or video generation provider with an API key.",
        "Save a GitHub or GitLab source control credential for commits and site backups.",
        "Connect a static publishing host or object storage account.",
        "Use personal access token sign-in when a plugin OAuth connection cannot start.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct', input: 'human-form' },
    mcpUi: { secretField: { secret: true } },
  },
  // Operator vocabulary includes DNS, registrars, hosting and third-party APIs, rather than
  // only internal domain names. Setup questions must find secure cards alongside operations.
  "custom_credential_list": {
    search: {
      keywords: "credential credentials token tokens api key keys secret secrets saved connected account accounts " +
        "provider providers registrar registrars dns domain domains hosting host deployment deploy deployments " +
        "third-party thirdparty external outside service services vendor vendors inventory what do i have " +
        "do i have list existing configured connections name.com flyio fly.io",
      queries: [
        "List my API keys and show my saved API keys.",
        "What tokens do I have saved? List my tokens.",
        "What credentials do I have saved?",
        "Do I have an API key or token saved for name.com?",
        "What did I save for fly.io — is there already a token for that?",
        "What third-party accounts or providers are connected to this site?",
        "Before I use curl for this, is there already a saved credential I should use instead?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "custom_credential_make_request": {
    search: {
      keywords: "call calling request requests curl wget http https api endpoint third-party thirdparty external outside " +
        "service services vendor provider dns registrar hosting deployment domain credential credentials token tokens use using saved fetch " +
        "send get post put patch delete hit query invoke run execute",
      queries: [
        "Call an external service API with a saved API token, keeping authentication on the server.",
        "Send an authenticated HTTP request using credentials already stored for the service.",
        "Can you call the name.com API using my saved credential instead of curl?",
        "Make a request to my fly.io account using the token I already saved.",
        "I need to hit a third-party API with my saved credential — can you do that instead of shelling out?",
        "Can you check my domain's DNS records using the registrar credential I saved?",
        "Use my saved deployment provider token to make an authenticated request to their API.",
      ],
    },
    approval: { class: 'edit', confirmation: 'plan', rule: 'http-method' },
  },
  "custom_credential_set_username": {
    search: {
      keywords: "credential username set add fix repair update change login sign in basic auth account name saved " +
        "api key token 401 unauthorized broken not working",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "custom_credential_verify": {
    search: {
      keywords: "verify verifying valid invalid expired revoked revoke working works work test testing check checking " +
        "credential token api key secret still good bad broken status health healthy alive dead stale current",
      queries: [
        "Is my fly.io token still valid?",
        "Can you check if this saved API key still works?",
        "Has my name.com credential expired or been revoked?",
        "Test whether this saved token is still good before I rely on it.",
        "Why did my last request through a saved credential fail — is the credential itself the problem?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "custom_credential_write_files": {
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
