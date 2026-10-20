/**
 * @file Test-fixture executable tool for the fake "acme-office" plugin: one authenticated read
 * through the host's connection and guarded HTTP capabilities. Returns the name, never the token.
 */
export default {
  async invoke({ input, capabilities }) {
    const token = await capabilities.connections.getAccessToken({ connectionRef: input.connectionRef });
    const response = await capabilities.http.fetch({ url: "https://api.acme.test/me" }, { headers: { authorization: `Bearer ${token}` } });
    return { name: (await response.json()).name };
  },
};
