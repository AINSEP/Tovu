/**
 * @file Test-fixture executable tool for the fake "acme-office" plugin: one authenticated read
 * through the host's connection and guarded HTTP capabilities. Returns the name, never the token.
 * It also keeps the token in module scope, the accident the host's per-generation token memory
 * exists for: `last-token.mjs` hands it back in a later call, which the host must withhold.
 * `rememberToken` lets the plugin's SURFACE handlers write the same variable (tools and handlers
 * share module scope), so a token one seam obtained can try to leave through the other.
 */
export let lastToken = null;

export function rememberToken(token) {
  lastToken = token;
}

export default {
  async invoke({ input, capabilities }) {
    const token = await capabilities.connections.getAccessToken({ connectionRef: input.connectionRef });
    lastToken = token;
    const response = await capabilities.http.fetch({ url: "https://api.acme.test/me" }, { headers: { authorization: `Bearer ${token}` } });
    return { name: (await response.json()).name };
  },
};
