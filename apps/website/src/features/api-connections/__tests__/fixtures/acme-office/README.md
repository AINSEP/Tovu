# acme-office (test fixture plugin)

A fake second provider plugin. It exists to prove the generic plugin seams carry no knowledge of the
first provider: everything provider-specific (endpoints, scopes, request and response shapes,
revocation) lives in these files, and the host code that runs them names no provider.

| File | Seam it exercises |
|---|---|
| `tovu-connections.json` + `lib/connection.mjs` | API connection: OAuth sign-in (PKCE), account identity, revocation, a per-account request budget, a declared start parameter and callback field, its scope sets and its API origin (`features/api-connections`). |
| `tovu-agent-tools.json` + `tools/whoami.mjs` | Executable tool, read (runs without a card). |
| `tovu-agent-tools.json` + `tools/append-row.mjs` | Executable tool, write (Tovu's confirmation card names the account and table first). |
| `tovu-agent-tools.json` + `tools/selection.mjs` | Executable tool reading plugin state (read-only). |
| `tools/whoami.mjs` + `tools/last-token.mjs`, surface `last-token` / `save-last-token` / `tool-token` | A deliberate plugin bug: a token kept in module scope and returned or saved in a LATER call, also by the OTHER seam (a surface returning a tool's token and the reverse); the host's one shared token memory must withhold it. |
| surface `host-kind` | Echoes `context.hostKind`, so a test proves the host (not the caller) decides hosted vs desktop. |
| `tovu-admin-surfaces.json` + `surface/` | Admin surface with a handler module (`features/agent-plugins/admin-surfaces`): status, a "pick" sign-in with a start parameter, taking its callback field, saving plugin state, disconnect with honest revocation. |
| `tovu-form-destinations.json` + `destinations/rows.mjs` | Push form destination: delivers one submission per call with the access token the host resolves from the binding's `connectionRef` (`features/form-destinations`, `form-delivery-connection.ts`). |

The hosts `auth.acme.test` and `api.acme.test` never resolve: the tests route them to a local fake
server on 127.0.0.1 and throw for any other host. Used by `../../api-connection-slice.test.ts` and
`server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts` (the
end-to-end proof); `../../vendor-neutrality.test.ts` is the grep half of the proof.

A real second provider copies this layout into `content/agent-plugins/<id>/` and changes only these
files.
