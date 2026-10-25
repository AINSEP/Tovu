# Failing tests

## Counts
Jini vitest total failed: 130 (suites: j-admin=22 j-agent-plugins=5 j-agent-runtime=21 j-charts-recharts=6 j-chat=4 j-cms=2 j-daemon=4 j-devops=6 j-mcp=10 j-oauth=3 j-platform=13 j-server=1 j-ui-kit=1 j-ui=25 )
Tovu apps/admin vitest failed: 7
Tovu desktop node:test failed: 60 (58 + 2)

## Jini/admin (22)
- admin/src/__tests__/fqfix-loading.unit.test.tsx :: editor/cache regressions with builtin joins the providers mount read and spends no providers request on a library write :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/__tests__/fqfix-loading.unit.test.tsx :: editor/cache regressions with tanstack joins the providers mount read and spends no providers request on a library write :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/forms/__tests__/forms-api.conformance.test.ts :: crashes instead of reporting a failure when a cross-form trash is accepted (reported, not fixed) :: AssertionError: expected [Function] to throw error including 'form definition \'s1\' was not found' but got 'form submission \'s1\' was not found'
- admin/src/comments/react/__tests__/use-comment-queue.unit.test.tsx :: queue cache scope isolation isolates a workspace switch while the API and cache provider stay mounted :: Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits 
- admin/src/comments/react/__tests__/use-comment-queue.unit.test.tsx :: queue cache scope isolation isolates a principal switch while the API and cache provider stay mounted :: Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits 
- admin/src/media/react/__tests__/library-parity.test.tsx :: displays endpoint/model controls, persists them through one Save changes without touching secrets or siblings, and fails closed for old ports :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/media.test.tsx :: renders the optional credential tab without exposing saved secrets :: Error: Unable to find a label with the text of: Example credential
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab fails closed and reports the service unreachable without a provider port :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab treats a failed or abandoned read as unreachable :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab discovers the catalog from the read and keeps only providers with saved state :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab orders pinned host catalog entries first and divides them from the rest :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab disables Clear on rows already discovered once the provider port goes away :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab shows and hides a credential, and marks edits unsaved :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab writes the first credential and settings of a catalog provider the read never returned :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab flags a private base URL and blocks saving until it is fixed :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab saves the whole set through an atomic host in one call :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab saves sequentially on an older host: settings, then the credential, then a reread :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab removes a cleared provider that held state and skips one that never did :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab removes a provider whose only saved state is an endpoint or a model :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab fails a settings change on a host without settings support :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab fails the save when the follow-up reread is unreachable :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.
- admin/src/media/react/__tests__/providers-tab-hooks.test.tsx :: media useProvidersTab labels a reload in flight :: TypeError: Cannot destructure property 'normalizeMediaProviderMap' of 'catalogPolicy' as it is undefined.

## Jini/agent-plugins (5)
- agent-plugins/src/admin-surfaces/__tests__/descriptor.characterization.test.ts :: a surface without handler fields parses to exactly id, title, entry, files, actions and csp :: AssertionError: expected { ok: true, descriptors: [ { …(6) } ] } to strictly equal { ok: true, descriptors: [ { …(6) } ] }
- agent-plugins/src/admin-surfaces/__tests__/descriptor.characterization.test.ts :: a surface with a handler module but no capability declarations parses to exactly its handler fields :: AssertionError: expected { ok: true, descriptors: [ { …(7) } ] } to strictly equal { ok: true, descriptors: [ { …(7) } ] }
- agent-plugins/src/admin-surfaces/__tests__/descriptor.characterization.test.ts :: a handled surface with connections and publicConfig parses to exactly its declared fields :: AssertionError: expected { ok: true, descriptors: [ { …(9) } ] } to strictly equal { ok: true, descriptors: [ { …(9) } ] }
- agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts :: shared contracts have no implementation import cycles keeps the MCP server and its SDK adapter acyclic :: AssertionError: expected [ …(3) ] to deeply equal []
- agent-plugins/src/lifecycle/tools/__tests__/agent-plugin-tools.security.unit.test.ts :: two plugins whose namespaced ids collide are both refused (ambiguous) :: AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]

## Jini/agent-runtime (21)
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'result text when the error is null' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'all text blocks while ignoring image …' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'JSON text with its error code and rec…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'structured errors with their code whe…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'explicit errors before result diagnos…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'result diagnostics when the explicit …' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'numeric codes in JSON encoded transpo…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'code-only errors in JSON encoded tran…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'the fallback when result and error ar…' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/__tests__/json-event-stream.test.ts :: createJsonEventStreamHandler (codex) reports 'the fallback when result contains no …' for a failed MCP call :: AssertionError: expected [ { type: 'tool_use', …(3) }, …(1) ] to deeply equal [ { type: 'tool_use', …(3) }, …(1) ]
- agent-runtime/src/providers/__tests__/oauth-credentials.test.ts :: resolveOAuthBearer carries the old refresh_token forward when the refresh response omits one :: AssertionError: expected 'stale' to be 'fresh2' // Object.is equality
- agent-runtime/src/providers/__tests__/oauth-credentials.test.ts :: resolveOAuthBearer drops expiresAt when the refresh response omits expires_in :: AssertionError: expected null to deeply equal { accessToken: 'fresh', …(1) }
- agent-runtime/src/providers/__tests__/oauth-credentials.test.ts :: resolveOAuthBearer defaults fetchImpl to the global fetch when not supplied :: AssertionError: expected null to deeply equal { accessToken: 'fresh', …(1) }
- agent-runtime/src/providers/__tests__/oauth-provider.test.ts :: completeOAuthPkce exchanges the code for a token when state matches :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/oauth-provider.test.ts :: completeOAuthPkce defaults fetchImpl to the global fetch :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/oauth-provider.test.ts :: refreshOAuthPkceToken posts a refresh_token grant to the token endpoint :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/oauth-provider.test.ts :: refreshOAuthPkceToken defaults fetchImpl to the global fetch :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/pkce.test.ts :: exchangeCodeForToken / refreshAccessToken includes a resource indicator and confidential-client basic auth when supplied :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/pkce.test.ts :: exchangeCodeForToken / refreshAccessToken refreshes an access token via grant_type=refresh_token, including optional scope/resource :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/pkce.test.ts :: exchangeCodeForToken / refreshAccessToken defaults fetchImpl to the global fetch when not supplied :: OAuthError: the authorization server's response did not contain a supported OAuth token set
- agent-runtime/src/providers/__tests__/pkce.test.ts :: keeps fractional token lifetime in the persisted wire DTO :: OAuthError: the authorization server's response did not contain a supported OAuth token set

## Jini/charts-recharts (6)
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { dataKey: 'revenue', …(4) } :: Error: expect(element).toHaveStyle()
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { name: 'revenue', value: 7 } :: Error: expect(element).toHaveStyle()
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { dataKey: 'value', …(3) } :: Error: expect(element).toHaveStyle()
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { dataKey: 'value', …(4) } :: Error: expect(element).toHaveStyle()
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { dataKey: 'value', …(4) } :: Error: expect(element).toHaveStyle()
- charts-recharts/src/__tests__/chart.test.tsx :: shared chart presentation with real Recharts resolves tooltip identity and presentation for { dataKey: 'constructor', …(3) } :: Error: expect(element).toHaveStyle()

## Jini/chat (4)
- chat/src/react/components/__tests__/MessageList.l199.characterization.test.tsx :: defaults an empty list to no queued row, then puts a cancellable queued message last without mutating messages :: AssertionError: expected "spy" to be called with arguments: []
- chat/src/react/components/__tests__/answered-question.test.tsx :: answered questions in the transcript closes an unanswered failed run on reload even with a stale streaming prop :: TestingLibraryElementError: Found multiple elements with the role "status"
- chat/src/react/components/__tests__/answered-question.test.tsx :: answered questions in the transcript closes an unanswered canceled run on reload even with a stale streaming prop :: TestingLibraryElementError: Found multiple elements with the role "status"
- chat/src/react/features/chat-pane/__tests__/hooks/useChatPane.mid-run.test.tsx :: useChatPane — a message sent mid-run goes to the running agent waits for an uploading screenshot before sending mid-run (image only: true) :: AssertionError: expected null to be 'Review the attached file(s).' // Object.is equality

## Jini/cms (2)
- cms/src/consent/__tests__/http.test.ts :: availability and delivery regressions fails closed after OFF → publish ON → read failure ('live', { maxHtmlBytes: 16 }) :: AssertionError: expected [ 'read', 'read' ] to deeply equal [ 'read' ]
- cms/src/media/__tests__/video-frames.ffmpeg.test.ts :: reports temporary files that cannot be removed and still releases the lock :: Error: ENOENT: no such file or directory, chmod '/tmp/video-preview-0VsTf0'

## Jini/daemon (4)
- daemon/src/__tests__/tool-input-normalization.test.ts :: ToolExecutor normalization gate returns precise validation errors for ambiguous/near-miss inputs before policy or effects :: AssertionError: expected 'Unknown input \'expectedVersoin\'. De…' to match /Send only 'expectedVersion'|Use the c…/
- daemon/src/http/__tests__/attachments.test.ts :: createDiskAttachmentStore rejects a file replaced by a different file of the same size after registration :: Error: promise resolved "{ attachments: [ { …(4) } ], …(1) }" instead of rejecting
- daemon/src/http/__tests__/xai.test.ts :: xaiOauthCompleteRoute — non-Error failures and token defaults persists a token response with no token_type as a Bearer token :: AssertionError: expected { ok: false, error: { …(3) } } to deeply equal { ok: true, value: { ok: true } }
- daemon/src/http/__tests__/xai.test.ts :: xaiAuthStatusRoute defaults token_type to Bearer and reports absent expiry/scope as null, still connected :: AssertionError: expected { ok: false, error: { …(3) } } to deeply equal { ok: true, value: { ok: true } }

## Jini/devops (6)
- devops/src/checks/published-types/__tests__/published-types.test.ts :: isolates new registry diagnostics, shadows transitive scoped packages, and cleans up :: AssertionError: expected 'operation-error' to be 'drift' // Object.is equality
- devops/src/checks/published-types/__tests__/published-types.test.ts :: identical local errors pass the drift comparison and remain reported :: AssertionError: expected false to be true // Object.is equality
- devops/src/checks/published-types/__tests__/published-types.test.ts :: published mode fails on identical errors instead of using a baseline :: AssertionError: expected 'operation-error' to be 'typecheck-error' // Object.is equality
- devops/src/checks/published-types/__tests__/published-types.test.ts :: non-diagnostic compiler failure null never passes by subtracting an empty set :: AssertionError: expected 'operation-error' to be 'typecheck-error' // Object.is equality
- devops/src/checks/published-types/__tests__/published-types.test.ts :: non-diagnostic compiler failure 1 never passes by subtracting an empty set :: AssertionError: expected 'operation-error' to be 'typecheck-error' // Object.is equality
- devops/src/checks/published-types/__tests__/published-types.test.ts :: prerequisites precede compilation, and scoped overrides reach the scratch manifest :: AssertionError: expected false to be true // Object.is equality

## Jini/mcp (10)
- mcp/src/bin/__tests__/serve.test.ts :: serve() — wiring, with a fully-injected fake createMcpToolServer carries trusted launch IDs into the server and daemon-client sanitizer :: AssertionError: expected 'HTTP 400: forms_create_definition; so…' to be 'daemon 400 on http://d.example/api/x:…' // Object.is equality
- mcp/src/server/__tests__/tool-protocol.test.ts :: threads trusted registry IDs through daemon diagnostics and the final MCP error sanitizer :: AssertionError: expected { Object (isError, content) } to deeply equal { Object (isError, content) }
- mcp/src/server/__tests__/tool-protocol.test.ts :: preserves a trusted dotted recovery hint through both error sanitizers, masking glued and token secrets :: AssertionError: expected { Object (isError, content) } to deeply equal { Object (isError, content) }
- mcp/src/server/resources/__tests__/site-guide-resource.test.ts :: site guide MCP resource uses the existing authorization gateway propagates an authorization rejection instead of attaching an empty overview :: AssertionError: expected [Function] to throw error including 'daemon 403 on http://127.0.0.1:3000/a…' but got 'HTTP 403'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {"title":"Missing fields"} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {"title":"Bad group","singleSelect":null} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {"title":"Bad options","singleSelect":{"label":"Plan","options":[]}} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {"title":"Bad option","multiSelect":{"label":"Plan","options":[null]}} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'
- mcp/src/tools/ask-choice/__tests__/ports.test.ts :: malformed question {"title":"Bad label","singleSelect":{"label":"Plan","options":[{"value":"v","label":""}]}} rejects before rendering or minting :: AssertionError: expected [Function] to throw error matching /required|requires|must be an object/ but got 'expected undefined to deeply equal [ …'

## Jini/oauth (3)
- oauth/tests/integration-contract.test.ts :: terminates discovery on rejected issuer metadata without trying another advertised issuer :: AssertionError: expected OAuthError: the OAuth metadata endpoint d… { …(5) } to match object { code: 'OAUTH_UNSAFE_ENDPOINT' }
- oauth/tests/token-endpoint.test.ts :: exchangeOAuthAuthorizationCode / refreshAccessToken includes a resource indicator and confidential-client basic auth when supplied :: AssertionError: expected 'Basic Y2xpZW50JTJEMTpzZWNyZXQlMkQx' to be 'Basic Y2xpZW50LTE6c2VjcmV0LTE=' // Object.is equality
- oauth/tests/token-refresh.test.ts :: the refresh wire path preserves an empty refresh token :: OAuthError: the authorization server's response did not contain a supported OAuth token set

## Jini/platform (13)
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: an existing EXDEV backup path is refused; the copy is removed and the source kept :: AssertionError: expected [Function] to throw error including 'Move backup target already exists: /t…' but got 'Target already exists: cp returned EE…'
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: an EXDEV commit failure restores the retired source and removes the copy :: AssertionError: expected [Function] to throw error including 'Registry is not writable.' but got 'Target already exists: cp returned EE…'
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: EXDEV copy skips excluded top-level entries :: SystemError: Target already exists: cp returned EEXIST (/tmp/move-bounds-t2JsPa/target already exists) /tmp/move-bounds-t2JsPa/target
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: EXDEV retirement uses a random UUID backup folder by default :: SystemError: Target already exists: cp returned EEXIST (/tmp/move-bounds-SYWCcP/target already exists) /tmp/move-bounds-SYWCcP/target
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: POSIX moves flush the source/target parent and the EXDEV backup folder :: SystemError: Target already exists: cp returned EEXIST (/tmp/move-bounds-KuFOqI/target already exists) /tmp/move-bounds-KuFOqI/target
- platform/src/fs/__tests__/verified-directory-move.boundaries.test.ts :: an EXDEV backup-folder fsync failure restores the retired source before removing the copy :: AssertionError: expected SystemError: Target already exists: cp re… { …(5) } to match object { code: 'EIO' }
- platform/src/fs/__tests__/verified-directory-move.test.ts :: cross-device verification failure preserves the source and never commits :: AssertionError: expected [Function] to throw error including 'Moved directory verification failed.' but got 'Target already exists: cp returned EE…'
- platform/src/fs/__tests__/verified-directory-move.test.ts :: reserves a cross-device destination before copying any site bytes :: SystemError: Target already exists: cp returned EEXIST (/tmp/jini-directory-move-6MnK1y/target already exists) /tmp/jini-directory-move-6MnK1y/target
- platform/src/fs/__tests__/verified-directory-move.test.ts :: EXDEV retires the source into a hidden recovery parent before committing :: SystemError: Target already exists: cp returned EEXIST (/tmp/jini-directory-move-GQIt7W/target already exists) /tmp/jini-directory-move-GQIt7W/target
- platform/src/fs/__tests__/verified-directory-move.test.ts :: EXDEV retains one original legacy DB backup without a second copied destination backup :: SystemError: Target already exists: cp returned EEXIST (/tmp/jini-directory-move-yCVWFK/target already exists) /tmp/jini-directory-move-yCVWFK/target
- platform/src/fs/__tests__/verified-directory-move.test.ts :: EXDEV retains one original inSite DB backup without a second copied destination backup :: SystemError: Target already exists: cp returned EEXIST (/tmp/jini-directory-move-vola7F/target already exists) /tmp/jini-directory-move-vola7F/target
- platform/src/fs/__tests__/verified-directory-move.test.ts :: a new cross-device recovery folder never collides with an earlier home2 backup :: SystemError: Target already exists: cp returned EEXIST (/tmp/jini-directory-move-gdV9wZ/target already exists) /tmp/jini-directory-move-gdV9wZ/target
- platform/src/fs/__tests__/verified-file-relocation.test.ts :: commits a Windows site and database move while retaining mandatory file flushes (EXDEV: true) :: SystemError: Target already exists: cp returned EEXIST (/tmp/verified-db-move-aXhEc9/new already exists) /tmp/verified-db-move-aXhEc9/new

## Jini/server (1)
- server/src/__tests__/create-local-node-daemon.test.ts :: createLocalNodeDaemon binds an IPv6 loopback host to a URL that actually parses and answers :: Error: listen EAFNOSUPPORT: address family not supported ::1

## Jini/ui-kit (1)
- ui-kit/src/react/native/__tests__/dialog.characterization.test.ts :: native dialog lifecycle characterization restores only a connected HTML opener: connected :: AssertionError: expected "focus" to be called 2 times, but got 3 times

## Jini/ui (25)
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the form and success outcome with host framing, a non-secret field and a form cancel label :: AssertionError: expected '29f39e475ba23e0d237daabb92df26ae66058…' to be '513dd8a0b4491bc007f17818c7e17cddb9d9e…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the default-option form, options cancel label fallback and success outcome :: AssertionError: expected '0c92c823420134849f4759cc8d923ec9f791d…' to be '5d11e21f8a323b3eb203666069b1ed42a9d70…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the redacted failure outcome, result and fixed log metadata :: AssertionError: expected '8acec6369df1009c3b16a8146e215b549c83a…' to be 'ca7aba0bf27d288ab783745a1e149f9dae412…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the cancelled run as a form-only emission with no save :: AssertionError: expected 'e68a7b4a1a9c51ac195e453cd201276c2faaa…' to be '1008d45c0f4c1a2a78f0b0472839fd9136923…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the blank run as a form-only emission with no save :: AssertionError: expected 'e68a7b4a1a9c51ac195e453cd201276c2faaa…' to be '1008d45c0f4c1a2a78f0b0472839fd9136923…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts :: secret-card exact emitted output pins the expired run as a form-only emission with no save :: AssertionError: expected 'e68a7b4a1a9c51ac195e453cd201276c2faaa…' to be '1008d45c0f4c1a2a78f0b0472839fd9136923…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output tool-routed cancel :: AssertionError: expected 'f8dff6cc6e7b6a2412c5376ebc97ed1289960…' to be 'f6a869447f8966829c0d36d52dcf113caa30e…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output minimal with no cancel :: AssertionError: expected 'addeeb377caf61ab1fe8cc40484414214445e…' to be 'c8b0f37daf7fa589a2f41f75b30f8e1bd1110…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output local-only cancel :: AssertionError: expected '335a191e179cfcd4469262d09cb818d6f5a8f…' to be 'b017c612043de8a70e5b4d4160b3c54350cf9…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output choices, alternatives and every option :: AssertionError: expected 'baf80ab6817f10d1eb3d015ff7dddbf91ae04…' to be '8d72fde4f751183c1c1800208701466696e6f…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output pins the framed, expiring resource wrapper and its action plan :: AssertionError: expected '0df5d6175caeee5583e723acf42a9211a63e5…' to be '4bcd9e1427b2c3e1739d97c9b11bcfc8770b9…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/confirmation.test.ts :: renderConfirmationDocument exact output pins the bare resource wrapper :: AssertionError: expected '7c3fd74e155bf5893e1ef036cf03c131f4e6f…' to be '7efbc7ae94f9dc037f513c3405401cb3b6721…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output shared spec with an untargeted cancel :: AssertionError: expected '6c87cf26a2fa4491185aa424a71c80fe6e0c6…' to be 'd6f2939607184095c29d108707668f110c5d2…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output minimal spec with no cancel :: AssertionError: expected 'f5501bc23289059d2b92be383a54e4ae5286c…' to be 'cea276136613ddba217e7939a0ca06a0300e7…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output every option, with a tool-routed cancel :: AssertionError: expected '254d9a5b2bc0e6b9ab1eb1854a61317d5ddf9…' to be 'acce221dc13f25223cd0265757a06248d4b76…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output a cancel tool with no params :: AssertionError: expected '7975f57db5d633bc3ecfc8eb30603b15df4ff…' to be '5e7c602a0aa4ce472882c871635b2c71218ae…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output pins the framed resource wrapper :: AssertionError: expected '405ebd687a67c9d9b3a1938605ec9a463eb60…' to be '18950938d511a8abcbc46484b0a3015cbc4f4…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/form.test.ts :: renderFormDocument exact output pins the unframed resource wrapper :: AssertionError: expected '30fe210fabcf130778e0ca66e149f460cadff…' to be '97959b00169765ee131c704cb33ffafddec93…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts :: renderOutcomeDocument exact output success with link and details :: AssertionError: expected '55cbbaf00a1c494efa946236f4d330b5dc2b2…' to be '688dde39abe77aa8c1fcaa8430f8da4611946…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts :: renderOutcomeDocument exact output partial with custom link label, app, lang and tokens :: AssertionError: expected '1448668d10856589276a1d3e1d8a1132096dd…' to be '73fb126bfebf3105037bd0111928e38706278…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts :: renderOutcomeDocument exact output failure with link :: AssertionError: expected '96d5e6d19957ad3e17e0bce8e9071ad2d79c7…' to be 'cd02c8d5b6c02042da614c39ca30f8433b80f…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts :: renderOutcomeDocument exact output failure without link :: AssertionError: expected '0f60232d4e14f4e88e0b6ab2d4bfcfb3aac8a…' to be '4289fca764208847cd4888d91bc93b7d32675…' // Object.is equality
- ui/src/features/mcp-ui/__tests__/surfaces/outcome.test.ts :: renderOutcomeDocument exact output pins the framed resource wrapper :: AssertionError: expected 'e8eb2d29102d545f192a498ad66063f4c716b…' to be '38c59e246fda02435f2c78af15187036773c7…' // Object.is equality
- ui/src/features/execution/react/components/__tests__/LocalCliAgentList.pin.test.tsx :: LocalCliAgentList characterization uses the default scope and the existing injected disclosure port :: AssertionError: expected "spy" to be called with arguments: []
- ui/src/features/version-manager/__tests__/react/components/VersionManagerModal.test.tsx :: VersionManagerModal metadata characterization (L204) omits a restored-from badge if the referenced version is absent :: TestingLibraryElementError: Unable to find an element with the title: index.html · v2.

## Tovu/apps/admin (7)
- admin/src/lib/__tests__/untranslated-copy.unit.test.ts :: admin dictionaries: no copy left in English features/sites/site-publish-i18n.ts SITE_PUBLISH_DICT has no untranslated copy :: AssertionError: expected [ 'id :: "Deploy"' ] to deeply equal []
- admin/src/lib/__tests__/untranslated-copy.unit.test.ts :: admin dictionaries: no copy left in English features/sites/site-transfer-i18n.ts SITE_TRANSFER_DICT has no untranslated copy :: AssertionError: expected [ 'pl :: "Link"', …(2) ] to deeply equal []
- admin/src/lib/__tests__/untranslated-copy.unit.test.ts :: admin dictionaries: no copy left in English features/sites/sites-i18n.ts t has no untranslated copy :: AssertionError: expected [ 'id :: "Deploy"', …(3) ] to deeply equal []
- admin/src/features/skills/__tests__/use-skills.unit.test.ts :: pins list availability before and after loading {"installed":[]} :: AssertionError: expected false to be undefined
- admin/src/features/skills/__tests__/use-skills.unit.test.ts :: pins list availability before and after loading {"installed":[{"toolId":"skill_incident_response","name":"incident-response","description":"Respond to outages.","enabled":true,"source":"uploaded"}]} :: AssertionError: expected false to be undefined
- admin/src/features/users/__tests__/Users.unit.test.tsx :: Caller without role.manage keeps the Roles/Policies columns with resolved names when roles and policies load :: AssertionError: expected [ 'Username', 'Email', 'Status', …(3) ] to deeply equal [ 'Username', 'Email', 'Status', …(3) ]
- admin/src/features/users/__tests__/account-protections.unit.test.tsx :: rendered owner row keeps admin login, shows Owner badge, and hides Delete/Disable :: AssertionError: expected 1 to be greater than or equal to 2

## Tovu/apps/desktop run 1
✖ src/add-site-button-wiring.test.ts (287.851827ms)
✖ src/add-site-pointer.test.ts (250.036164ms)
✖ src/admin-dev-proxy.test.ts (256.149624ms)
✖ src/agent-plugin-tokens.test.ts (208.01004ms)
✖ src/built-in-mcp-ownership.test.ts (236.26586ms)
✖ a manifest whose gates all pass exits 0 (181.903868ms)
✖ ONE deliberately failing gate makes a non-zero code reach the caller (122.427121ms)
✖ a gate whose command does not exist at all fails, rather than being skipped (125.819497ms)
✖ EVERY gate runs even after an earlier one fails, so one run reports every problem (129.4892ms)
✖ a disabled gate with no reason fails the run even though every enabled gate passed (136.273653ms)
✖ a properly documented disabled gate does NOT fail the run — turning a gate off is allowed (136.545174ms)
✖ a stale disablement fails the run until the date is re-confirmed (130.827977ms)
✖ an empty manifest fails rather than passing by measuring nothing (132.32569ms)
✖ a malformed gate entry (null, valid JSON) fails clearly instead of an obscure crash (147.515207ms)
✖ a gate script on disk that the manifest does not run fails the run (129.951916ms)
✖ a gate script the manifest DOES run is not reported as drift (150.215037ms)
✖ the runner does not report ITSELF as an unregistered gate script (136.46479ms)
✖ gate output is bounded and redacted while a failing child still fails the runner (138.44847ms)
✖ src/desktop-agent-runtime.test.ts (537.446202ms)
✖ src/desktop-capture-env.test.ts (285.6745ms)
✖ src/main-shutdown-wiring.test.ts (268.814347ms)
✖ the bridge completes the handshake and lists its tools over real pipes (352.735989ms)
✖ the bridge writes NOTHING but protocol to stdout (265.175191ms)
✖ a malformed line is reported on stderr and does not end the server (273.860953ms)
✖ two messages arriving in ONE write are handled as two (230.568051ms)
✖ the bridge reads the registry named by --user-data-dir, not the real one (246.909612ms)
✖ add_site_pointer through the real bridge writes the row the app will read (203.974498ms)
✖ add_site_pointer through the real bridge REFUSES an empty folder and initializes nothing (231.814272ms)
✖ the bridge refuses to start without a userData directory (244.688257ms)
✖ the bridge refuses a userData directory that does not exist (326.180573ms)
✖ the bridge accepts the userData directory from the shell's existing env override (262.772576ms)
✖ src/mcp-bridge.unit.test.ts (304.103059ms)
✖ src/move-site-home.test.ts (245.113672ms)
✖ src/nested-sites-migration.test.ts (329.753372ms)
✖ src/node-toolchain.test.ts (259.569703ms)
✖ src/profile-isolation.test.ts (292.232575ms)
✖ src/project-delete-guard.test.ts (251.988618ms)
✖ src/project-ipc-dispatch.test.ts (271.2851ms)
✖ src/project-ipc.test.ts (277.882892ms)
✖ src/shared-sites-home.test.ts (228.621838ms)
✖ src/site-create-admin-password.test.ts (258.910078ms)
✖ src/site-dir-store.test.ts (267.125051ms)
✖ the real worker reads shared extra roots and the legacy MRU fresh without writing them (176.159899ms)
✖ the real worker discovers default and remaining nested sites with its own injected policy home (205.123648ms)
✖ src/site-relocation.test.ts (231.919952ms)
✖ src/sites-mcp-registration.test.ts (227.800087ms)
✖ src/sites-mcp-server.test.ts (214.817271ms)
✖ src/sites-mcp-tools.test.ts (187.071931ms)
✖ src/smoke-bridge.test.ts (170.993682ms)
✖ src/smoke-native.test.ts (162.942417ms)
✖ src/smoke-packaged-chat.test.ts (208.170957ms)
✖ src/speech/preload-speech.test.ts (459.392506ms)
✖ src/store-cross-process.test.ts (234.883668ms)
✖ src/tovu-desktop-cli.test.ts (243.801527ms)
✖ src/tovu-server-failures.test.ts (279.217805ms)
✖ src/tovu-server.test.ts (243.760821ms)
✖ src/tracked-sites.test.ts (257.436734ms)
✖ src/workspace-conversation-gaps.test.ts (139.761503ms)
✖ failing tests:
✖ src/add-site-button-wiring.test.ts (287.851827ms)
✖ src/add-site-pointer.test.ts (250.036164ms)
✖ src/admin-dev-proxy.test.ts (256.149624ms)
✖ src/agent-plugin-tokens.test.ts (208.01004ms)
✖ src/built-in-mcp-ownership.test.ts (236.26586ms)
✖ a manifest whose gates all pass exits 0 (181.903868ms)
✖ ONE deliberately failing gate makes a non-zero code reach the caller (122.427121ms)
✖ a gate whose command does not exist at all fails, rather than being skipped (125.819497ms)
✖ EVERY gate runs even after an earlier one fails, so one run reports every problem (129.4892ms)
✖ a disabled gate with no reason fails the run even though every enabled gate passed (136.273653ms)
✖ a properly documented disabled gate does NOT fail the run — turning a gate off is allowed (136.545174ms)
✖ a stale disablement fails the run until the date is re-confirmed (130.827977ms)
✖ an empty manifest fails rather than passing by measuring nothing (132.32569ms)
✖ a malformed gate entry (null, valid JSON) fails clearly instead of an obscure crash (147.515207ms)
✖ a gate script on disk that the manifest does not run fails the run (129.951916ms)
✖ a gate script the manifest DOES run is not reported as drift (150.215037ms)
✖ the runner does not report ITSELF as an unregistered gate script (136.46479ms)
✖ gate output is bounded and redacted while a failing child still fails the runner (138.44847ms)
✖ src/desktop-agent-runtime.test.ts (537.446202ms)
✖ src/desktop-capture-env.test.ts (285.6745ms)
✖ src/main-shutdown-wiring.test.ts (268.814347ms)
✖ the bridge completes the handshake and lists its tools over real pipes (352.735989ms)
✖ the bridge writes NOTHING but protocol to stdout (265.175191ms)
✖ a malformed line is reported on stderr and does not end the server (273.860953ms)
✖ two messages arriving in ONE write are handled as two (230.568051ms)
✖ the bridge reads the registry named by --user-data-dir, not the real one (246.909612ms)
✖ add_site_pointer through the real bridge writes the row the app will read (203.974498ms)
✖ add_site_pointer through the real bridge REFUSES an empty folder and initializes nothing (231.814272ms)
✖ the bridge refuses to start without a userData directory (244.688257ms)
✖ the bridge refuses a userData directory that does not exist (326.180573ms)
✖ the bridge accepts the userData directory from the shell's existing env override (262.772576ms)
✖ src/mcp-bridge.unit.test.ts (304.103059ms)
✖ src/move-site-home.test.ts (245.113672ms)
✖ src/nested-sites-migration.test.ts (329.753372ms)
✖ src/node-toolchain.test.ts (259.569703ms)
✖ src/profile-isolation.test.ts (292.232575ms)
✖ src/project-delete-guard.test.ts (251.988618ms)
✖ src/project-ipc-dispatch.test.ts (271.2851ms)
✖ src/project-ipc.test.ts (277.882892ms)
✖ src/shared-sites-home.test.ts (228.621838ms)
✖ src/site-create-admin-password.test.ts (258.910078ms)
## Tovu/apps/desktop run 2
✖ Websites fits at 375px with every nav control and header action inside the page (583.307448ms)
✖ narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column (6.842915ms)
✖ failing tests:
✖ Websites fits at 375px with every nav control and header action inside the page (583.307448ms)
✖ narrow collapsed multi-tab content fills the dialog, and the desktop single-tab dialog uses its one column (6.842915ms)

## Tovu website/plugins/packages/site-chat (node:test) — INCOMPLETE: killed at 04:55Z cap; 22.4k ✔ before kill; run did not finish
Unique failing test lines (before interrupt): 250. No Postgres server; Postgres-only failures are not separated automatically (log has no ECONNREFUSED-5432 lines; none classified ENV).

### failing tests (name, time)
✖ --storage-env moves the site and leaves the connection string in that variable (0.061956ms)
✖ --storage-env: the site names the variable, keeps no secret, and its database is at head with the template (321.15875ms)
✖ /home/user/Tovu/apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts (38.758482ms)
✖ /home/user/Tovu/apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts (35.163886ms)
✖ /home/user/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.postgres.test.ts (36.065796ms)
✖ /home/user/Tovu/apps/website/src/features/entries/__tests__/integration/unreadable-owner-entries-repair.postgres.test.ts (35.747776ms)
✖ /home/user/Tovu/apps/website/src/platform/db/__tests__/migration-manifest-postgres.test.ts (33.57072ms)
✖ /home/user/Tovu/apps/website/src/platform/db/__tests__/parity/vault-read-parity.postgres.test.ts (35.090541ms)
✖ /home/user/Tovu/apps/website/src/platform/db/kernel/__tests__/ops.postgres.test.ts (0.240015ms)
✖ /home/user/Tovu/apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts (33.595328ms)
✖ /home/user/Tovu/apps/website/src/platform/db/repos/__tests__/form-delivery-repo.postgres.test.ts (37.619762ms)
✖ /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts (36.835593ms)
✖ /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts (54.835354ms)
✖ /home/user/Tovu/apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts (39.094871ms)
✖ 0000_legacy_baseline on Postgres (PGlite) (12165.24363ms)
✖ CANONICAL_PID_SUFFIX: matches only a bare decimal pid shape; rejects every adversarial suffix Number() would otherwise coerce (0.050954ms)
✖ COPY accepts an explicit identity-column value with NO override syntax at all — the override clause this manifest exports must never be prepended to a COPY statement (0.051111ms)
✖ Cancel writes nothing, and a used planId is gone (2.506809ms)
✖ EVERY wired tool's outbound Gemini schema is structurally valid — the whole catalog, not a sample (94.202427ms)
✖ FIXTURE_DB is namespaced by this run's own process.pid — two different pids can never compute the same fixture database name, which is the entire fix for the collision (0.881901ms)
✖ L025b bundled source pins malformed ids, extra keys and failed seeding (74.243521ms)
✖ L041 closed tool inputs retain source shapes, selectors and setup diagnostic (10.643788ms)
✖ L201 pin: disable checks only active wildcard targets against the owner floor (195.466661ms)
✖ L201 pin: purge checks only active wildcard targets against the owner floor (196.47096ms)
✖ L201 pin: trash checks only active wildcard targets against the owner floor (197.142644ms)
✖ OAuth callback composes installed defaults with real plugin activation storage (70.197563ms)
✖ PKCE-disabled providers omit challenge and verifier and honor a scope override (1.381772ms)
✖ Postgres accepts a UTC offset up to and including ±15:59 and rejects ±16:00 and beyond, in both directions — the bound a UTC-offset check must enforce, not the ±23:59 Date.parse allows (0.044
✖ Postgres compactAndVerify refuses a missing ledger, then passes once it has a step (0.09997ms)
✖ Postgres copyTo is refused with what to do instead (0.715492ms)
✖ READ-ONLY: the refusal is reported, not swallowed — the caller gets the original failure AND why the remedy was not attempted (9.013751ms)
✖ REGRESSION: the shipped admin UI source does not contain the seeded default password (123.642247ms)
✖ SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently (8.852225ms)
✖ T1: a source row whose parent is missing does not stop the copy; that foreign key is kept unvalidated and named in the result (36.413549ms)
✖ T1: the copy carries the schema's indexes, foreign keys, checks, defaults and identity columns, and new rows number after the copied ones (37.714548ms)
✖ T2: every table in the snapshot is copied or left out with a reason; a plugin's tables are copied from the snapshot's own layout (36.208761ms)
✖ a Postgres database holding one foreign table is refused by name, before any folder is made (42.299169ms)
✖ a Postgres site copy preserves publish backstop audit rows and their undo inverses (35.710057ms)
✖ a TRANSIENT refresh failure does not mark the connection needs_reauth (3.375035ms)
✖ a clear-token failure that is NOT the secret store still propagates — the degrade is targeted, not a blanket swallow (3.196483ms)
✖ a client secret the server volunteers is sealed and never appears in a read model (6.40855ms)
✖ a completed handshake writes expiresAt in PLAINTEXT — readable with no sealer at all (4.508245ms)
✖ a completed sign-in on a row with no client secret seals the tokens alone (3.24318ms)
✖ a count mismatch or rejected replacement preserves the earlier rows and marker (41.857204ms)
✖ a database that already holds a Tovu site is refused, before any folder, secret or key is made (37.479027ms)
✖ a failing post-connect step never fails the sign-in, and leaves the row for the next sign-in to retry (2.970849ms)
✖ a full handshake connects, and no response anywhere carries a token or the client secret (241.294907ms)
✖ a javascript: verification URI is refused — it would be rendered to an operator as a link (1.923062ms)
✖ a malformed or unreachable address is refused in the form, nothing is saved, and the password is never quoted (0.066002ms)
✖ a mid-write failure (a missing blob) leaves the old tree serving and no staging dir (21.690262ms)
✖ a migrated SQLite content.db has every generated table and column, with compatible storage (444.404809ms)
✖ a missing token_type defaults to Bearer (1.405486ms)
✖ a naive-local timestamp string casts to a DIFFERENT instant depending on the reading session's timezone; a UTC-offset string does not (0.040878ms)
✖ a needs_reauth connection is REPORTED at boot, not silently dropped (3.372012ms)
✖ a non-default token_type passes through unchanged (0.848283ms)
✖ a non-empty refresh_token passes through unchanged (0.889026ms)
✖ a nonrotating refresh token stays sealed for the next refresh (2.663263ms)
✖ a normalized vault row survives a token persist — the writer must not carry the old version next to a re-sealed blob (31.501175ms)
✖ a normalized vault row survives device-code token persistence (5.181631ms)
✖ a normalized vault row survives self-configuration with DCR (5.15319ms)
✖ a plain INSERT naming an explicit identity-column value fails WITHOUT OVERRIDING SYSTEM VALUE, and succeeds WITH it (0.036662ms)
✖ a plain Postgres text column silently accepts malformed JSON — proving a json-text column needs a semantic check beyond either dialect's type system (0.077792ms)
✖ a post-connect step that succeeds is handed the server id and logs nothing (3.176044ms)
✖ a post-connect step that throws a non-Error is logged by its string form (3.530877ms)
✖ a post-connect step that throws is logged and does not fail the sign-in (4.11662ms)
✖ a provider answering invalid_grant transitions to needs_reauth, clears the token, and surfaces a non-retryable error (3.560313ms)
✖ a provider that omits expires_in yields a null expiry rather than a fabricated one (2.239006ms)
✖ a provisioned row whose url no longer matches the plugin's declaration is untouched (2.75748ms)
✖ a re-copy replaces the site's own copy and never appends (40.314154ms)
✖ a re-seal that fails once and then recovers is retried transparently — the clear still succeeds (3.005415ms)
✖ a recovery status wrapped in an array is accepted and returned as-is (reported, not fixed) (0.296123ms)
✖ a redirect to a private address is 'refused' at that hop; endless redirects are 'failed' after MAX_REDIRECT_HOPS (6.603502ms)
✖ a refresh lease held elsewhere is waited on, then the still-valid token is used once the wait budget runs out (19.815771ms)
✖ a refresh reseals the token WITHOUT losing the client secret sharing its blob (3.287899ms)
✖ a replayed callback is refused and never reaches the token endpoint a second time (2.074643ms)
✖ a replayed code reaches the provider once and its single-use check rejects it (3.334956ms)
✖ a restart never overwrites operator edits: edited, deleted and re-themed rows survive a second prepare byte for byte (34.114689ms)
✖ a row Postgres rejects rolls the whole copy back and names only the table (36.783928ms)
✖ a row the operator already edited is untouched by a sign-in (4.604854ms)
✖ a save that changes nothing about the OAuth binding leaves the live connection alone (3.690102ms)
✖ a schema someone else made (no marker) is refused and left untouched, and a new site is given its own schema instead (36.595468ms)
✖ a second sign-in after the defaults applied changes nothing further (3.082816ms)
✖ a secret issued with no echoed method authenticates with client_secret_basic when the server advertises it (6.522312ms)
✖ a secret issued with no echoed method is POSTed when client_secret_post is the only secret method advertised (7.008603ms)
✖ a self-registered row written before the client was tracked re-registers once (the stuck-row self-heal) (6.907629ms)
✖ a setting marked secret stays behind (values at every scope and its history); ordinary settings are copied (38.031237ms)
✖ a transfer copies the same tables as before minus the retired ones (4.62168ms)
✖ a verification URI embedding credentials is refused (0.762874ms)
✖ admin build redacts both streams and preserves failure code and signal (16.867417ms)
✖ after the first OAuth callback, a plugin-provisioned row with empty lists is enabled with the declared tools (25.403709ms)
✖ an approved poll returns the token set with the RFC 8628 grant type on the wire (1.043786ms)
✖ an empty-string refresh_token normalizes to null, same as an absent one (0.828018ms)
✖ an empty-string token_type defaults to Bearer rather than being passed through (1.119103ms)
✖ an existing workspace with the seed's SLUG but a different id is never seeded over: no second workspace, no demo posts (54.13053ms)
✖ an operator who types a client id over a self-registered one keeps it through disconnect (8.236468ms)
✖ an operator's own row (no provisioning plugin) is untouched by a sign-in (4.053996ms)
✖ an unconfirmed first-copy plan cannot overwrite a copy created since planning (41.313939ms)
✖ applies on an empty database and matches schema.postgres.ts at head (6936.506502ms)
✖ apps/website/src/platform/db/kernel/__tests__/postgres-pool-error.postgres.test.ts (1606.051794ms)
✖ apps/website/src/server/inbound/admin-http/routes/integrations/__tests__/integration/create-delete-pause.integration.test.ts (11991.895492ms)
✖ begin refuses device_code= instead of returning an unusable authorization (1.441114ms)
✖ begin refuses device_code=42 instead of returning an unusable authorization (0.956391ms)
✖ begin refuses device_code=null instead of returning an unusable authorization (1.092637ms)
✖ begin refuses device_code=undefined instead of returning an unusable authorization (5.844248ms)
✖ begin refuses user_code= instead of returning an unusable authorization (1.322713ms)
✖ begin refuses user_code=42 instead of returning an unusable authorization (0.920732ms)
✖ begin refuses user_code=null instead of returning an unusable authorization (1.145086ms)
✖ begin refuses user_code=undefined instead of returning an unusable authorization (0.819543ms)
✖ boot-time federation injects the access token into the operator's chosen env variable (3.221371ms)
✖ bootSiteDir honors an explicit Postgres workspace instead of the oldest (0.08711ms)
✖ bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db (0.76208ms)
✖ bootSiteDir on a postgres site rejects an unknown --workspace and closes the store it opened (0.064106ms)
✖ callback checks its exact URI and a replayed code is refused by the provider fake (223.251058ms)
✖ complete production catalog classifies every reader and exercises every scoped read on B (1131.069134ms)
✖ copy outcome renders empty success (6.848559ms)
✖ copy outcome renders failure without a copied row (3.946171ms)
✖ createSiteRouteDeps refuses overrides.store without workspaceId (the pair rule covers the store too) (0.042808ms)
✖ createSiteRouteDeps reuses the store bootSiteDir opened (serve/export pass it as overrides.store) (0.093233ms)
✖ createSiteRouteDeps: storage choice, then hydration, then the store open (the recovering site opener), then the chat sweep (1.923044ms)
✖ cross-site wipe regression: a copy aimed at a schema holding ANOTHER site's copy is refused inside the transaction (36.861002ms)
✖ database_transfer_status reports the saved destination, this process's last run and the copy found there (0.154927ms)
✖ deleting a workspace: same accept/reject, and all its keys go with it (site key included) (3.448568ms)
✖ deployment_execute_static_publish waits for one human approval over HTTP before publishing (470.354321ms)
✖ disconnect also drops the self-registered client's sealed secret (7.326792ms)
✖ disconnect clears the authorization but keeps the server row (220.011899ms)
✖ disconnect clears the token, preserves the client secret, and returns the row to disconnected (3.545691ms)
✖ disconnect does NOT wipe the client secret when the KEYRING re-seal leg keeps failing, and surfaces the failure instead of reporting a false success (3.242045ms)
✖ disconnect still clears an UNOPENABLE blob and reaches disconnected — a rotated site key must not wedge the escape hatch (3.294337ms)
✖ disconnect stops the read model claiming a stored token — even though the sealed blob survives (3.045916ms)
✖ discovery retains a device endpoint and refuses an unsafe advertised device endpoint (1.650684ms)
✖ every OAuth write leaves version and ciphertext in step (5.732764ms)
✖ every baseline ID retains its exchange and fresh-callback refusal rules (0.947529ms)
✖ expires_in "abc" yields unknown expiry (0.710139ms)
✖ expires_in -1 yields unknown expiry (0.733552ms)
✖ expires_in 0 yields unknown expiry (0.62847ms)
✖ expires_in becomes an absolute expiresAt computed from the injected clock (4.157976ms)
✖ findSiteKeyDependentData: Postgres (env) site — a clean database is no data; a sealed row is data (52.423605ms)
✖ first copy runs headlessly; replacement waits for Copy; the password never shows (26.605181ms)
✖ generic trash_item denied pins the shared live snapshot read and permission-before-read contract (88.365042ms)
✖ handler rejects invalid arguments before reading for [] (2.805518ms)
✖ index.ts main(): a refusing schema guard stops a disk boot before site-key preparation or store opening (89.191957ms)
✖ index.ts main(): the content.db schema guard and site key run before the composition root opens the database (4.601362ms)
✖ init empty-envelope checks before creation and seals after success output (599.187328ms)
✖ installFirstPartyToolContributors installs exactly the converted domains — no more, no fewer (8.438324ms)
✖ int4 rejects 2147483648 on a live server; int8 accepts the identical value (0.041998ms)
✖ isolation: a second and an empty workspace see only their own rows (2.161235ms)
✖ isolation: a second and an empty workspace see only their own rows (2.774014ms)
✖ list: a plugin's admitted surfaces with their frame src, declared actions and link origins (348.419185ms)
✖ markNeedsReauth clears the token but PRESERVES the client secret sharing its blob (3.654653ms)
✖ markNeedsReauth records the durable state even when the blob became unopenable mid-session (2.838668ms)
✖ needs_reauth is DURABLE — a second call does not re-probe the provider (3.55065ms)
✖ no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks) (5664.584626ms)
✖ order: vendor and source-control lists, defaults first-class (3.202669ms)
✖ order: vendor and source-control lists, defaults first-class (4.809604ms)
✖ polling a device authorization reports pending, then connects, and stores the token (7.526429ms)
✖ postgres: a purge during an in-flight attempt is final; the attempt's outcome neither revives nor resends the job (0.11583ms)
✖ postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError (0.615498ms)
✖ postgres: transactions commit, roll back and nest on a pooled connection (0.712429ms)
✖ postgres: two creates of one id, B blocked on A's uncommitted insert — A lands, B gets the version conflict (0.087552ms)
✖ postgres: two import-as-creates of one id, B blocked on A's uncommitted insert — one row, one revision, one event; B is a version conflict (0.116959ms)
✖ postgres: two pulls racing for one receiver admit exactly one; the other is already-running (0.99689ms)
✖ postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict (0.746483ms)
✖ postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict (0.954564ms)
✖ preflight reads only added terms, in wanted order, and leaves retained trashed terms alone (90.556234ms)
✖ projected search, approval and callback metadata exactly matches the reviewed baseline (7.297056ms)
✖ psql() returns ok:false with stderr populated, never throwing, for a failing statement (33.177523ms)
✖ psql() returns ok:true with stdout for a successful query (54.406561ms)
✖ publish backstop audit is workspace-scoped core data included once in the Postgres copy catalog (0.078758ms)
✖ publish compatibility selection: one inventory per kind and one selected row read (4.224808ms)
✖ publish compatibility selection: one inventory per kind and one selected row read (4.266983ms)
✖ publish-site: a concurrent call through the ASSISTANT TOOL while the HTTP route's own publish is in flight is refused, not raced — the two callers share one guard (Terra audit finding #1, 2026-0
✖ re-pointing an OAuth connection's client id discards the token it no longer matches (3.696617ms)
✖ recreateDatabase() + dropDatabase() happy path round-trips a real throwaway database (32.860906ms)
✖ recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails (125.960527ms)
✖ refresh POST carries the saved refresh token and unsealed client secret to the token endpoint (7.248712ms)
✖ refuses a target other than postgres, and a --storage-env that is not set (0.71973ms)
✖ reportAuthFailure is idempotent against a connection already needs_reauth — it does not re-clear or re-timestamp the row (3.287584ms)
✖ reportAuthFailure marks needs_reauth, preserves the client secret, and surfaces the same terminal error tokenResolver throws (3.182454ms)
✖ reportAuthFailure throws the TERMINAL error even when the status write fails — the do-not-retry signal is the guarantee (3.137553ms)
✖ reseedSequenceSql handles the empty-table edge case: reseeding an empty table still starts identity at 1 (0.072251ms)
✖ reseedSequenceSql, executed after a copy that preserved original ids, makes the next plain insert land at max+1 with no collision (0.101255ms)
✖ reseedSequenceSql: a mixed-sign table (some non-positive, some positive ids) still reseeds to max+1 — the non-positive-id fix does not regress the ordinary case (0.048644ms)
✖ reseedSequenceSql: a table containing ONLY non-positive copied ids (0 and -1) reseeds to 1, not a collision and not a jump to 2 (0.084925ms)
✖ resolves the one workspace row and rejects an unknown explicit id (0.744007ms)
✖ runner-to-head, then prepare twice: one watermark row, one seeded workspace with its posts and presentation (38.194946ms)
✖ scope accepts comma and whitespace separators without empty scopes (0.768348ms)
✖ sealed redirect state rejects another workspace, server and exact callback URI (3.973866ms)
✖ sealed redirect state survives rebuilding the service and carries only encrypted verifier material (3.884257ms)
✖ sealed: the connection string is sealed in the site folder (0600, no plaintext) and the site reopens from its meta (40.67235ms)
✖ secret without an echoed method resolves ["client_secret_basic"] to client_secret_basic (0.635523ms)
✖ secret without an echoed method resolves ["client_secret_post","client_secret_basic"] to client_secret_basic (0.836331ms)
✖ secret without an echoed method resolves ["client_secret_post"] to client_secret_post (0.466864ms)
✖ secret without an echoed method resolves ["none","private_key_jwt"] to none (0.586475ms)
✖ secret without an echoed method resolves [] to client_secret_basic (0.647715ms)
✖ secret without an echoed method resolves undefined to client_secret_basic (1.716829ms)
✖ security: switching the OAuth client makes a connected account reconnect-required, honestly, until it reconnects (26.422259ms)
✖ self-registration and disconnect both preserve a normalized vault OAuth payload (8.65831ms)
✖ settings_clear_value cannot bypass cookie consent confirmation through legacy scalar settings (4.734496ms)
✖ siteSchemaName: the readable per-site schema for every site after the first, a safe identifier of at most 63 bytes (38.795636ms)
✖ string-collation ORDER BY on a text timestamp column disagrees with chronological ORDER BY when Z and offset forms mix — the concrete mechanism TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents 
✖ sweepStaleFixtureDatabases: a non-canonical suffix Number() would coerce into a plausible dead pid is never touched, even though the pre-fix Number()-based guard would have dropped it (0.052293ms)
✖ sweepStaleFixtureDatabases: reclaims a fixture database whose owning pid has died, and leaves one whose pid is still alive completely untouched (0.087285ms)
✖ the admin read model never carries a token, a refresh token, or a client secret (17.545892ms)
✖ the bare protected-resource path is a FALLBACK, tried only after the path-inserted one (4.635795ms)
✖ the chat history lands in ai_chat with its own ledger there; public gets no chat table (0.065914ms)
✖ the connection gate lets a healthy OAuth connection through (3.874618ms)
✖ the connection gate reads the ROW, so the daemon sees a state the web server discovered (3.608919ms)
✖ the connection gate refuses a needs_reauth connection with the terminal, model-legible error (3.725182ms)
✖ the content history through the current head applies on real Postgres (0.155251ms)
✖ the credential checker CLI succeeds when invoked as the entry point (747.043318ms)
✖ the device grant returns a user code over the wire and keeps the device code server-side (228.437026ms)
✖ the first site's copy lands in `tovu` with the same row count as SQLite for every copied core table, and leaves out logins and saved keys (570.067706ms)
✖ the gate refuses a non-preset call with no admission origin (3.200305ms)
✖ the gate refuses an OAuth connection the operator disconnected (3.216757ms)
✖ the gate still refuses a needs_reauth ROSTER connection with the unchanged reauth error (3.07325ms)
✖ the model never passes a connection string: no tool takes one, and the plan asks for the private form first (0.19418ms)
✖ the private form saves a reachable destination, and neither the form, its result nor the log shows the password (0.12671ms)
✖ the program routes `storage move` to the command (0.10142ms)
✖ the starter skeleton only uses token names the shipped themes define, and sets no text colour of its own (0.472119ms)
✖ token read: tokens sealed for another client are refused as reconnect-required and the stored record is marked by that read itself (24.416545ms)
✖ token requests authenticate using client_secret_basic (1.329266ms)
✖ token requests authenticate using client_secret_post (1.494533ms)
✖ token requests authenticate using none (11.186159ms)
✖ two connections WITH lockKey: the second append waits and chains after the first (0.05885ms)
✖ two connections WITHOUT lockKey: both appends read the same latest row (the hazard is real) (0.096075ms)
✖ two connections migrating at once apply a step exactly once (1.011266ms)
✖ two connections: a concurrent appendRevision waits for the open one and chains after it (0.666239ms)
✖ two processes booting at once: the mismatched rows go exactly once, one marker, readable rows survive (41.215319ms)
✖ two processes booting at once: the second prepare WAITS on the seed lock the first holds, then seeds nothing twice (50.712933ms)
✖ two sites share one database: the second gets `tovu_<site>`, each re-copy replaces only its own, and a site keeps its schema after `tovu` frees up (37.304463ms)
✖ unique well-formed descriptors are accepted without mutating the caller (17.698993ms)
✖ vault boundary parity [sqlite] (991.478928ms)
✖ vault cascade parity [sqlite] (940.64915ms)
✖ vault hot paths [pglite] (4333.019364ms)
✖ vault hot paths [postgres] (0.085575ms)
✖ vault hot paths [sqlite] (1078.273987ms)
✖ vault read parity [pglite] (4265.257551ms)
✖ vault read parity [postgres] (199.915145ms)
✖ vault read parity [sqlite] (996.287251ms)
✖ vault write parity [memory] (598.490519ms)
✖ vault write parity [pglite] (4719.327565ms)
✖ vault write parity [sqlite] (1191.040406ms)
✖ vendor (with the folded publish_credential_sets) (3.36677ms)
✖ vendor (with the folded publish_credential_sets) (4.174406ms)
✖ vendor: every step matches (13.513206ms)
✖ vendor: every step matches (17.046885ms)
✖ vendor: every step matches (21.06641ms)
✖ verifyPublishCredential: Netlify and Cloudflare Pages acceptances leave accountLabel undefined — neither's checked endpoint carries a safe public identity field (6.616139ms)
✖ when EVERY advertised authorization server fails, the error names the resource and does not retry (9.732662ms)
✖ without the desktop toolchain env, the real spawn is unchanged: same command and args, no launch env added (42.9352ms)

### files listed ✖ in SIGINT summary (file failed OR cancelled by interrupt; not all are real failures): 484
- ✖ apps/website/src/server/inbound/admin-http/routes/integrations/__tests__/integrations-route-failures.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/admin-media-routes.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/byte-size.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/content-type.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/created-by.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/delete-route.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/import-url.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/integration/providers.integration.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/library.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/media-original-route.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/media-route-failures.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/original-route.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/parse.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/providers.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/replace-route.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/replace.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/text-route.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/trash-route.unit.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/update.test.ts
- ✖ apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload-concurrent.test.ts
- ... full list in /tmp/cov/web-files.txt
