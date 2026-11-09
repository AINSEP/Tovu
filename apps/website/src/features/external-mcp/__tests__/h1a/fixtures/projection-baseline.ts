/**
 * EXTRACT-S5 H1a projection pin. `BASELINE` was captured ONCE from the unmodified c3801c833 functions
 * (contracts/core/external-mcp-{access,auth}.ts) over `ROWS` before anything moved; never regenerate it.
 * Second-host vocabulary on purpose: ids, paths, URLs and principals are not Tovu's.
 */
const sealed = (ciphertext: string) => ({ keyId: "k-second", ciphertext, nonce: "bm9uY2U=", alg: "aes-256-gcm" });
export const ROWS = {
  stdioStatic: { createdAt: "2026-01-02T03:04:05.000Z", transport: "stdio", url: null, command: "/opt/second-host/bin/acme-mcp", args: "[\"--port\",\"7\"]", authMode: "static_env", sealedEnv: sealed("ZW52LWNpcGhlcg=="), sealedOAuth: sealed("c3RhdGljLXRva2Vu"), enabled: true, allowedToolNames: "[\"acme.read\",\"acme.write\"]", writeAllowedToolNames: "[\"acme.write\"]", writeGrantsUpdatedByPrincipalId: "operator:second", writeGrantsUpdatedAt: "2026-02-03T04:05:06.000Z", provisionedByPluginId: "second.plugin" },
  hostedOAuth: { createdAt: "2026-03-04T05:06:07.000Z", transport: "streamable_http", url: "https://mcp.second-host.example/rpc", command: null, args: null, authMode: "oauth", sealedEnv: null, sealedOAuth: sealed("b2F1dGgtYmxvYg=="), enabled: false, allowedToolNames: null, writeAllowedToolNames: null, writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, provisionedByPluginId: null },
  legacyMode: { createdAt: "2026-04-05T06:07:08.000Z", transport: "streamable_http", url: "https://mcp.second-host.example/legacy", command: null, args: null, authMode: "", sealedEnv: null, sealedOAuth: sealed("bGVnYWN5"), enabled: true, allowedToolNames: "not json", writeAllowedToolNames: "[1,\"x\"]", writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, provisionedByPluginId: null },
} as const;
export const BASELINE: unknown = {"stdioStatic": {"revision": "13e4d4de162bed671342197ed4c373480a93227dcb78b01fa161b4d60a1a77fc", "snapshot": {"admissionRevision": "13e4d4de162bed671342197ed4c373480a93227dcb78b01fa161b4d60a1a77fc", "enabled": true, "allowedToolNames": "[\"acme.read\",\"acme.write\"]", "writeAllowedToolNames": "[\"acme.write\"]", "writeGrantsUpdatedByPrincipalId": "operator:second", "writeGrantsUpdatedAt": "2026-02-03T04:05:06.000Z", "provisionedByPluginId": "second.plugin"}, "grants": {"allowedToolNames": ["acme.read", "acme.write"], "writeAllowedToolNames": ["acme.write"]}, "hasStatic": true}, "hostedOAuth": {"revision": "ea6142287ca6aaef197097a46df462b5a89a46f894edbefad729d571d52de5e2", "snapshot": {"admissionRevision": "ea6142287ca6aaef197097a46df462b5a89a46f894edbefad729d571d52de5e2", "enabled": false, "allowedToolNames": null, "writeAllowedToolNames": null, "writeGrantsUpdatedByPrincipalId": null, "writeGrantsUpdatedAt": null, "provisionedByPluginId": null}, "grants": {"allowedToolNames": [], "writeAllowedToolNames": []}, "hasStatic": false}, "legacyMode": {"revision": "c9a1998fbcaab70695207d8b6bb6826bbce0a3052f1a89bd04b64ba145983541", "snapshot": {"admissionRevision": "c9a1998fbcaab70695207d8b6bb6826bbce0a3052f1a89bd04b64ba145983541", "enabled": true, "allowedToolNames": "not json", "writeAllowedToolNames": "[1,\"x\"]", "writeGrantsUpdatedByPrincipalId": null, "writeGrantsUpdatedAt": null, "provisionedByPluginId": null}, "grants": {"allowedToolNames": [], "writeAllowedToolNames": ["x"]}, "hasStatic": true}, "strictGrants": {"allowedToolNames": ["acme.read", "acme.write"], "writeAllowedToolNames": ["acme.write"]}, "strictError": {"name": "ToolInputError", "message": "The plugin connection has an unreadable tool list. Save its tool list again before enabling it."}, "validated": ["acme.read", "acme.write"], "validationErrors": [{"name": "ExternalMcpValidationError", "message": "'bad name' is not a valid MCP tool name, so the trust tier would refuse it on connect", "field": "writeAllowedToolNames"}, {"name": "ExternalMcpValidationError", "message": "at most 64 tools are supported", "field": "writeAllowedToolNames"}], "oauthStatus": ["connected", "needs_reauth", "disconnected", "disconnected"]};

/** The six projections, as the host binds them. Structural so any binding (shim, entry, host object) fits. */
export interface ProjectionSet {
  accessSnapshot(required: { record: (typeof ROWS)[keyof typeof ROWS] }): unknown;
  admissionRevision(record: (typeof ROWS)[keyof typeof ROWS]): string;
  readToolGrants(record: { allowedToolNames: string | null; writeAllowedToolNames: string | null }, options?: { strict?: boolean }): unknown;
  validateToolNames(required: { names: readonly string[]; field: string }): string[];
  oauthStatus(record: { oauthStatus: string | null }): string;
  hasStaticAccessToken(record: (typeof ROWS)[keyof typeof ROWS]): boolean;
}
const caught = (run: () => unknown) => { try { run(); return null; } catch (error) { const e = error as Error & { field?: string }; return e.field === undefined ? { name: e.name, message: e.message } : { name: e.name, message: e.message, field: e.field }; } };
/** Runs every projection over `ROWS`; the result must deep-equal `BASELINE`. */
export function computeProjections(p: ProjectionSet): unknown {
  const rows = Object.fromEntries(Object.entries(ROWS).map(([key, record]) => [key, { revision: p.admissionRevision(record), snapshot: p.accessSnapshot({ record }), grants: p.readToolGrants(record), hasStatic: p.hasStaticAccessToken(record) }]));
  return { ...rows, strictGrants: p.readToolGrants(ROWS.stdioStatic, { strict: true }), strictError: caught(() => p.readToolGrants(ROWS.legacyMode, { strict: true })),
    validated: p.validateToolNames({ names: ["acme.read", "acme.write", "acme.read"], field: "allowedToolNames" }),
    validationErrors: [["bad name"], Array.from({ length: 65 }, (_, i) => `t${i}`)].map(names => caught(() => p.validateToolNames({ names, field: "writeAllowedToolNames" }))),
    oauthStatus: ["connected", "needs_reauth", "bogus", null].map(oauthStatus => p.oauthStatus({ oauthStatus })) };
}
