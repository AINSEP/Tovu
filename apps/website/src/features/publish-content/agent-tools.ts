/**
 * @file The publish-content domain's agent-tool catalog — the two tools that let the assistant find
 * out whether publishing works, and make it work.
 *
 * ## Why these two and not one
 *
 * The owner's requirement was "it should be automatic, discoverable by AI, and a regular user
 * doesn't have to think about it". "Discoverable" is the part a single tool cannot deliver: a model
 * that can only act has no way to answer "can I publish?" without attempting it, so the honest
 * answer to a person asking "is my site set up?" would be a failed attempt. So the read comes first
 * and stands alone, and the repair is its own verb.
 *
 * ## Why there is no `publish_content_publish` here
 *
 * `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §0 deleted it. There
 * is now exactly one publish surface, the admin **Publish dialog**, and the chat assistant reaches it
 * through the `admin.publish_content` capability (`ui/criteria.ts`) rather than through a chat tool
 * of its own — see that plan and `tool-registrations.ts`'s header for why.
 *
 * ## The vocabulary rule
 *
 * The DESCRIPTIONS below are read by the model and may name mechanism. Everything these tools
 * RETURN is read by a person, and may not: no key, token, grant, principal, capability, workspace
 * id, installation id, generation, peer or bundle, and no error codes.
 * `__tests__/publish-content-agent-tools.test.ts` asserts that over every reachable sentence rather
 * than trusting review — the same guard `publish-trust/__tests__/provisioning.test.ts` already
 * applies to its own refusals.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "deletes-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

export const PUBLISH_CONTENT_STATUS_TOOL_ID = "publish_content_status";
export const PUBLISH_CONTENT_CONNECT_TOOL_ID = "publish_content_connect";

const NO_ARGUMENTS_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;

export const publishContentAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: PUBLISH_CONTENT_STATUS_TOOL_ID,
    description:
      "Reports whether THIS installation can copy its content to the site's live, public deployment, " +
      "and if not, what is missing — in plain sentences meant to be repeated to a non-technical " +
      "person verbatim. Call this before publishing, and whenever someone asks whether publishing is " +
      "set up, why publishing is not working, or where this site publishes to. " +
      "It distinguishes four situations: publishing works; there is a live site but this computer has " +
      "never been connected to it; this site has never been put online at all; and this site has " +
      "nothing publishable yet. " +
      "READS ONLY — it changes nothing, contacts no other site, and never reveals or produces any " +
      "credential. Its `summary`/`missing`/`nextStep` strings are already written for a person; do " +
      "not translate them into technical terms.",
    sideEffects: "none",
    authorization: { permission: "publish_content.read" },
    inputSchema: NO_ARGUMENTS_SCHEMA,
  },
  {
    name: PUBLISH_CONTENT_CONNECT_TOOL_ID,
    description:
      "Sets up — or repairs — this installation's ability to publish to the site's live deployment. " +
      "Call it when `publish_content_status` reports that this computer is not connected, or when a " +
      "publish fails because the live site does not recognise this computer. " +
      "With no argument it uses the address already written in this repository's own deployment " +
      "configuration, which is the normal case; pass `siteUrl` only when the person names a different " +
      "site. It is SAFE TO REPEAT: running it again replaces this computer's own entry and leaves " +
      "every other computer's alone, so 'try connecting again' is always a valid suggestion. " +
      "It mints nothing a person has to keep, shows no secret, and asks for no identifier. " +
      "It does NOT publish anything, and it does NOT take effect on the live site until this " +
      "repository is deployed once more — the returned `nextStep` says so in one sentence; relay it.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "publish_content.apply" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        siteUrl: {
          type: "string",
          description:
            "Optional. The live site's address, e.g. 'https://example.com'. Omit it to use the address " +
            "this repository's deployment configuration already names, which is what the person almost " +
            "always means. Only pass it when they explicitly name a different site.",
        },
      },
    },
  },
];
