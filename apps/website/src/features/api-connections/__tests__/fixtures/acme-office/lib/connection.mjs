/**
 * @file Test-fixture provider hooks for the fake "acme-office" plugin: scope sets, account identity
 * through the host's HTTP capability, and revocation. Proves the API-connection seam needs nothing
 * provider-specific outside the plugin.
 */
export default {
  createHooks({ http }) {
    return {
      async resolveScopes({ scopeSetIds }) { return ["acme.files", ...scopeSetIds.map((id) => `acme.${id}`)]; },
      async readAccount({ accessToken }) {
        const response = await http.fetch({ url: "https://api.acme.test/me" }, { headers: { authorization: `Bearer ${accessToken}` } });
        const body = await response.json();
        return { accountId: body.id, displayName: body.name };
      },
      async revoke({ token }) {
        const response = await http.fetch({ url: "https://auth.acme.test/revoke" }, { method: "POST", body: new URLSearchParams({ token }).toString() });
        if (!response.ok) throw new Error("revocation not confirmed");
      },
    };
  },
};
