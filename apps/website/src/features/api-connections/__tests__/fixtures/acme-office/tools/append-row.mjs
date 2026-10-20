/**
 * @file Test-fixture WRITE tool for the fake "acme-office" plugin: appends one row to a named table
 * through the host's connection and guarded HTTP capabilities. Being a write, it runs only after the
 * host's confirmation card, which lists the table from `describeAffectedResources`.
 */
export default {
  async invoke({ input, capabilities }) {
    const token = await capabilities.connections.getAccessToken({ connectionRef: input.connectionRef });
    const response = await capabilities.http.fetch(
      { url: `https://api.acme.test/tables/${encodeURIComponent(input.table)}/rows` },
      { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ values: input.values }) },
    );
    // Only the status reaches the assistant; the provider's body may echo request data.
    if (!response.ok) throw new Error(`Acme did not append the row (HTTP ${response.status}). Retry later.`);
    return { appended: 1 };
  },
  describeAffectedResources: ({ input }) => [`table ${input.table}`],
};
