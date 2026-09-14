# Higgsfield MCP — external research, 2026-09-10

Dispatched sonnet web-research agent. Read-only; no POST to any Higgsfield endpoint.

## Verdicts on prior beliefs

| Belief | Verdict |
|---|---|
| `https://mcp.higgsfield.ai/mcp`, streamable_http | **Confirmed** (live 401 probe) |
| OAuth-only, no API key / token | **Confirmed, strongly** (401 carries `WWW-Authenticate: Bearer`) |
| RFC 7591 DCR open | Leaning true, NOT executed (would create a real client) |
| 7-tool list (`generate_image`, `models_explore`, `job_status`, `jobs_wait`, `show_generations`, `reveal_generation`, `show_generation_by_ids`) | Unverifiable publicly — see note |
| `generate_image` args nested under `params` | Unverifiable publicly |
| Model ids `z_image` / `gpt_image_2` / `recraft_v4_1` | Unverifiable publicly |
| `readOnlyHint: false` annotations | Unverifiable publicly |

**Note on the "unverifiable" rows — do NOT downgrade the skill because of them.** mcpbundles.com states the
server's tool list is deliberately unpublished and discovered live post-auth. The researcher found no primary
source either way. Our own numbers came from a real authenticated run on 2026-09-09 that produced media asset
`c881a51f-5b41-4aec-b806-e5624e1e1208` (3,419,670-byte PNG, 2048x1152). A first-hand authenticated transcript
outranks the open web here. Two third-party SEO blogs guess a different 5-tool set; neither is sourced.

## Verbatim discovery documents (fetched live, 200)

`GET https://mcp.higgsfield.ai/.well-known/oauth-protected-resource`:

    {"resource":"https://mcp.higgsfield.ai/mcp",
     "authorization_servers":["https://clerk.higgsfield.ai","https://fnf-device-auth.higgsfield.ai"],
     "scopes_supported":["openid","email","offline_access"],
     "bearer_methods_supported":["header"],
     "higgsfield_auth_hints":{"selection":"client_capability_based","options":[
       {"flow":"authorization_code_pkce","authorization_server":"https://clerk.higgsfield.ai",
        "potential_clients":["anthropic","claude","claude-ai","claude-code"],
        "requires":["authorization_endpoint","token_endpoint","redirect_uri_receiver","pkce"]},
       {"flow":"device_code","authorization_server":"https://fnf-device-auth.higgsfield.ai",
        "potential_clients":["openclaw","hermes","memoclaw"],
        "requires":["device_authorization_endpoint","token_polling"]}]}}

`GET https://mcp.higgsfield.ai/.well-known/oauth-authorization-server`:

    {"issuer":"https://mcp.higgsfield.ai",
     "authorization_endpoint":"https://mcp.higgsfield.ai/oauth2/authorize",
     "token_endpoint":"https://mcp.higgsfield.ai/oauth2/token",
     "registration_endpoint":"https://mcp.higgsfield.ai/oauth2/register",
     "response_types_supported":["code"],"response_modes_supported":["form_post","query"],
     "grant_types_supported":["authorization_code","refresh_token"],
     "token_endpoint_auth_methods_supported":["client_secret_basic","none","client_secret_post"],
     "code_challenge_methods_supported":["S256"],
     "scopes_supported":["openid","email","offline_access"],
     "claims_supported":["sub","iss","aud","exp","iat","email","name","org_id"]}

`token_endpoint_auth_methods_supported` includes `"none"` -> public client, no secret to store.
PKCE S256 is mandatory. This is everything a plugin-declared `mcp.json` would need: url + transport +
authMode. No credential.

## The device-code lead — real, but blocked

Higgsfield advertises a `device_code` flow at `https://fnf-device-auth.higgsfield.ai`. Tovu already supports
device_code end to end: `EXTERNAL_MCP_OAUTH_GRANTS = ["authorization_code","device_code"]`
(`features/external-mcp/agent-tools.ts:73`), `external_mcp_oauth_poll_device`, and
`external-mcp-oauth.ts:854`. Device code uses NO redirect URI (`external-mcp-oauth.ts:251`), so it does not
need `TOVU_PUBLIC_URL` — which is the exact thing blocking a fully in-chat cold start today.

**Blocked:** the device authorization endpoint is not published. Probed read-only, all 404 (host answers with
FastAPI-shaped `{"detail":"Not Found"}`, so it resolves but exposes nothing at):
`/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`,
`/.well-known/oauth-protected-resource`, `/oauth2/device_authorization`, `/oauth2/device/code`,
`/device/code`, `/oauth/device/code`, `/`.
Also note `potential_clients` for that flow lists `openclaw, hermes, memoclaw` — it may be client-gated.
Stopped probing rather than thrashing. Needs Higgsfield support or an authenticated session to resolve.

## Calibration warning from the researcher

WebSearch's synthesized answer text produced unsourced claims that did not exist on any real page when
searched verbatim. Only directly-fetched page content and raw curl responses above are treated as evidence.
