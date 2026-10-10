/** Host composition for publish-content egress: read operator configuration once per boot. */
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createPublishContentPeerEgressPolicy, parsePublishContentDevHosts } from "#src/platform/http/egress-policies";
import type { HttpClientPort } from "#src/platform/http/ports";

/** Builds today's guarded adapter, or uses the injected host port without reading environment. */
export function resolvePublishContentPeerHttpClient(
  _required: Record<string, never>,
  { client, env = process.env, onDevHosts = ({ hosts }) => console.info(`[publish-content] development peer hosts: ${hosts.join(", ")}`), createClient = createDefaultHttpClient }: {
    client?: HttpClientPort;
    env?: Readonly<Record<string, string | undefined>>;
    onDevHosts?: (required: { hosts: readonly string[] }, optional: Record<string, never>) => void;
    createClient?: typeof createDefaultHttpClient;
  } = {},
): HttpClientPort {
  if (client) return client;
  const hosts = parsePublishContentDevHosts(env.TOVU_PUBLISH_CONTENT_DEV_HOSTS);
  if (hosts.length > 0) onDevHosts({ hosts }, {});
  return createClient(createPublishContentPeerEgressPolicy(hosts));
}
