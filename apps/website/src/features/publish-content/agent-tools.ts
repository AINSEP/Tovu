/**
 * @file The publish-content domain's agent-tool catalog — the three tools that let the assistant
 * find out whether publishing works, make it work, and publish.
 *
 * ## Why these three and not one
 *
 * The owner's requirement was "it should be automatic, discoverable by AI, and a regular user
 * doesn't have to think about it". "Discoverable" is the part a single `publish` tool cannot
 * deliver: a model that can only publish has no way to answer "can I publish?" without attempting
 * it, so the honest answer to a person asking "is my site set up?" would be a failed publish. So the
 * read comes first and stands alone, the repair is its own verb, and publishing is the third.
 *
 * ## The vocabulary rule
 *
 * The DESCRIPTIONS below are read by the model and may name mechanism. Everything these tools
 * RETURN is read by a person, and may not: no key, token, grant, principal, capability, workspace
 * id, installation id, generation, peer or bundle, and no error codes.
 * `__tests__/publish-content-agent-tools.test.ts` asserts that over every reachable sentence rather
 * than trusting review — the same guard `publish-trust/__tests__/provisioning.test.ts` already
 * applies to its own refusals.
 *
 * ## Why `publish_content_publish` cannot just publish
 *
 * Applying a bundle to a live site is a gated ceremony on the DESTINATION (plan → confirm →
 * execute), and `contracts/core/gated-mutations/gateway.ts`'s confirm-time actor-class rule is that
 * confirmation is a human act. This tool therefore plans, shows the human what would change, and
 * holds its own call open until the human answers — the same held-open MCP-UI exchange shape
 * `content_post_delete` uses (ADR-055 Decision 2). The model never supplies the answer: the only
 * channel that can resolve the exchange is a browser POST the model cannot make. See
 * `tool-registrations.ts`'s handler for the full statement.
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
export const PUBLISH_CONTENT_PUBLISH_TOOL_ID = "publish_content_publish";

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
  {
    name: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
    description:
      "Copies this installation's content to the site's live deployment. " +
      "It works out what would change, shows the person a summary of it, and WAITS FOR THEM TO SAY " +
      "YES before anything is written to the live site — you cannot answer on their behalf, and there " +
      "is no argument that skips the question. Expect this call to take a while: it is held open " +
      "until they answer. " +
      "If they decline, or nobody answers, NOTHING is published and the result says so; report that " +
      "plainly rather than retrying. " +
      "Requires that publishing is already set up — call `publish_content_status` first if you are " +
      "not sure, and `publish_content_connect` if it says this computer is not connected. " +
      "This tool needs an interactive session with a person present; in a background or scripted run " +
      "it refuses rather than publishing unattended.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "publish_content.apply" },
    inputSchema: NO_ARGUMENTS_SCHEMA,
  },
];
