import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** deploy-ops registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "deployment_ops_deploy": {
    search: {
      keywords: "deploy now redeploy ship release roll out push the server app to production start a deploy fly github actions workflow dispatch latest commit main",
      queries: [
        "Deploy the server now.", "Redeploy my app to production.", "Ship the latest commit on main to Fly.", "Start a deploy through GitHub Actions.",
      ],
    },
    approval: { class: 'publish', confirmation: 'policy' },
  },
  "deployment_ops_list_secrets": {
    search: {
      keywords: "list secrets environment variables env vars which secrets are set on my app server host fly names digests",
      queries: [
        "Which secrets are set on my Fly app?", "List the environment variables on the server.", "Is TOVU_SITE_KEY set in production?", "Show my app's secrets.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_ops_list_targets": {
    search: {
      keywords: "list my fly apps which apps do I have deployments",
      queries: [
        "List my Fly apps.", "Which apps do I have on Fly?", "Show available deployment targets.", "What Fly apps can you inspect?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_ops_logs": {
    search: {
      keywords: "logs log output error why did deploy fail build failed crash fly github actions",
      queries: [
        "Why did the GitHub Actions deploy fail?", "Show the error logs from my Fly app.", "What failed steps explain the build error?", "Read deployment logs for this crash.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_ops_set_secret": {
    search: {
      keywords: "set secret STRIPE_KEY on my app add environment variable env var copy site key to host server rename secret copy secret fly stage",
      queries: [
        "Set TOVU_SITE_KEY on Fly from my site key.", "Copy the site key to the production server.", "Add a secret to my hosted app.", "Copy one secret to a new name on Fly.",
      ],
    },
    approval: { class: 'replace-secret', confirmation: 'plan' },
    mcpUi: { secretField: { secret: true } },
  },
  "deployment_ops_status": {
    search: {
      keywords: "deploy deployment status is my app up running healthy fly fly.io machines github actions workflow run build ci passed failed",
      queries: [
        "Is my Fly app healthy?", "Is my Fly app up?", "Did the GitHub Actions workflow build pass?", "Show deployment status for my running app.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "deployment_ops_unset_secret": {
    search: {
      keywords: "unset secret remove delete environment variable env var old secret from host server app fly",
      queries: [
        "Remove the old secret from Fly.", "Unset an environment variable on my server.", "Delete the OLD_API_KEY secret from production.", "Remove a secret from my hosted app.",
      ],
    },
    approval: { class: 'replace-secret', confirmation: 'plan' },
  },
  "deployment_ops_wait": {
    search: {
      keywords: "wait until deployed finished done poll check again in a minute",
      queries: [
        "Wait until the deploy finishes and tell me.", "Poll until my deployment is healthy.", "Check again in a minute until it is done.", "Wait for the deployment to finish.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
