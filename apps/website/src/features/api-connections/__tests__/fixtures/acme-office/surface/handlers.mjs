/**
 * @file Test-fixture admin-surface handler module for the fake "acme-office" plugin: one action that
 * reads the signed-in account through the same host capabilities its executable tool gets.
 */
export default {
  actions: {
    async whoami({ input, capabilities }) {
      const token = await capabilities.connections.getAccessToken({ connectionRef: input.connectionRef });
      const response = await capabilities.http.fetch({ url: "https://api.acme.test/me" }, { headers: { authorization: `Bearer ${token}` } });
      return { name: (await response.json()).name };
    },
  },
};
