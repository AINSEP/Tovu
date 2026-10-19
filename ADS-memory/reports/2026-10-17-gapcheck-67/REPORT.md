# gapcheck-67 — chat-gap Codex check (permanent delete, replace file, SVG)

## Commits (no push)
- Jini 26c81cff (general-work): sanitizeSvg + SVG in uploadMedia/renditions, replaceMediaFile (moved from Tovu), core createBatchApprovalHandler. dompurify + jsdom runtime deps; @types/jsdom dev.
- Tovu d1c1fbd9a: owner chat permanent deletes through one card per batch, media_replace_file, SVG accept/serve headers, post-editor + Media picker accept lists, theme-trash wording. Mixed files committed hunk-only via `git apply --cached --recount`: assistant/tool-registrations.ts, features/media/index.ts, agent-daemon-server.ts, tool-restriction-wiring test (bashgap/purge-media lanes' hunks left uncommitted).

## Security review
- Sanitiser: own adversarial probe (script, onload/ONMOUSEOVER/onbegin, javascript: + entity-obfuscated href, foreignObject, xhtml-ns script/iframe, external use/image/feImage/mpath/pattern, alt xlink prefix, CSS url/@import incl. CDATA + escapes, animate/set, xml-stylesheet PI, DTD/entities, fonts): all stripped or refused; gradient/use/text logo unchanged.
- Serving: every /m/ and admin SVG response sends image/svg+xml, nosniff, CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox` (coordinator's value plus `sandbox`, kept as defence in depth if opened top-level). Legacy SVG blobs re-sanitised on serve.
- Permanent delete: owner-only (principal === ownerPrincipalId; lookup error fails closed); non-owner/missing identity keeps site grant; execution re-checks ctx.principal.id; card always required (no emitSurface => refused); batch = one card, no remembered approval; still-referenced media refusal unchanged.
- Low-risk note: daemon /api/tools + delegated middleware picks the delete-scope principal from RUN_PRINCIPAL_HEADER (bearer-gated). That only affects discovery; delegated execution uses the run-bound principal (principalByRunId), so a forged header cannot execute a delete.

## Codex rounds
- r2: CSP exact value (drop 'self') + header asserts in public original, rendition, admin original tests; media-import test filtered by `startsWith("media_import")` hid media_replace_file.
- r3: post editor FILE_HANDLER_ALLOWED_MIME_TYPES lacked SVG and had a false XSS comment.
- r4: fetch-image.ts comment claimed HTML/PDF were sanitised.
- b-svg "tsc errors" were missing node_modules links: pnpm install --offline refused (wants a TTY modules purge), so dompurify + @types/jsdom were symlinked into Jini packages/cms/node_modules from the pnpm store. cms + core rebuilt; :3000/admin 200.

## Tests
- Jini vitest (batch-approval, sanitize-svg, media-service, rendition-service, replace-media-file): 84/84.
- Tovu node --test, 25 named files: GREEN except 2 failures from other lanes: tool-metadata baseline (committed post.ts content_post_update keywords + uncommitted tool_gaps_list) and the prompt-augmenter test (uncommitted daemon lifecycle.stream change).
- Admin vitest Media.unit + use-post-editor.hooks.unit: 130/130.
- Root tsc: 2 errors, both other lanes: agent-daemon-server.ts:1229 nativeCapabilities (bashgap), permanent-delete-deps.ts:199 listRetiredSlugs (purge-media lane).
- Mutation: not run (owner rule 10-17).

## Warnings / leftovers
- run-codex-shards.sh threw a syntax error at line 152 at the end of r3/r4 (jobs finished; the script looks like it is being edited concurrently).
- Another lane's execution-mode-settings.ts default null broke settings boot for ~10 min (fixed by them to {}).
- sites.json md5 changed at 14:04:45: only tovu-dev lastOpened changed (desktop/owner, after my last test). Same 5 entries.
- The admin Media.unit run started at 1-min load ~20, above the ≤10 rule.
