# Motion graphics for the assistant media library — capability audit + import fix

Agent E (Programmer). Scope per dispatch: audit every media-type accept/serve/render list, answer
"can the assistant create motion graphics today", then extend `media_import_from_url`'s accept list
to match the storage ceiling. No generation backend built, no new external service added, no change
to the public rendition routes' video-only guard.

## Direct answer

**No — the assistant cannot generate motion graphics today**, and this audit found no reachable path
to make it do so without either a paid vendor credential this workspace does not have, or a
cross-repo fix to a shared Jini library file this dispatch is explicitly not scoped to touch.

- Tovu's own `media_generate_asset` tool (`apps/website/src/features/media-generation/tool-registrations.ts:341`)
  hardcodes `generate({ surface: "image", ... })`. It never requests `surface: "video"`, regardless of
  which image model is selected (`IMAGE_MODEL_IDS`, `agent-tools.ts`).
- The underlying `@jini-ai/integrations/media-providers` package (a sibling repo, `Jini/packages/integrations`)
  DOES carry a real video surface: `VIDEO_MODELS` (28 catalogued models — Veo, Sora 2, Kling, Seedance,
  MiniMax, ...) and an async-polling dispatch path (`MediaTaskStore`, `dispatch/providers/imagerouter-video-async.ts`).
  This is genuine, wired capability at the package level — but Tovu's tool never reaches it.
- Even if Tovu wired `surface: "video"` today, **no video-capable provider has a working credential on
  this machine**: only `GEMINI_API_KEY` is set (checked by variable *name* only, never printed), which
  maps to `google`/`nanobanana`. `google` is a catalogued video provider (`veo-3`, `veo-2`) but **no
  renderer file exists** for it in `dispatch/providers/` (confirmed: `ls dispatch/providers/` has no
  `google.ts`/`veo.ts` — only `openai.ts`, `grok.ts`, `imagerouter.ts`, `volcengine.ts`, `minimax.ts`,
  `nanobanana.ts`, `openrouter.ts`, `aihubmix.ts`, `custom-image.ts`, plus audio-only files). The one
  provider (`imagerouter`) with a real video renderer needs `IMAGEROUTER_API_KEY`, not set here.
  `sites/tovu-com/content.db`'s `media_provider_credentials` table has **0 rows** (read-only check) — no
  workspace-saved credential for any provider either.
- Conclusion: no reachable backend produces video/motion today, at either layer, on this machine. Wiring
  `surface: 'video'` into Tovu's tool without a configured credential would just replace "can't ask" with
  "asks and gets a credential error" — not a real capability, and out of this dispatch's scope regardless
  (no new external service).

## The animation-flattening trap — a bigger finding than expected

The dispatch asked whether animated GIF/WebP (already-accepted *image* types) could be a side-door into
motion graphics, since no re-encode is needed to just serve the original bytes. **Traced end to end: it
cannot, today, for the URL every embed actually uses.**

- `uploadMedia` pre-creates a rendition row named `"original"` that points directly at the source blob's
  own storage key (`Jini/packages/cms/src/media/media-service.ts:278-286`) — for THAT one rendition,
  `resolveMediaRendition` serves the existing row and never calls the image transformer
  (`rendition-service.ts:118-127`). Byte-for-byte, animation-preserving. **But nothing ever links to it for
  images** — no code constructs an `/m/{id}/original.v1/...` URL for a non-video asset.
- Every real public image URL — what `resolveMediaPublicUrls` hands back to the model as `publicUrl`
  (`features/media/tool-registrations.ts:125-128`), what gets embedded in a post — uses the `"public"`
  transform instead (`features/media/bootstrap.ts:21,64-72`), registered with `format: "webp"`, no resize,
  applied to every raster regardless of source type.
- `SharpImageTransformer.transform` (`Jini/packages/cms/src/media/image-transformer.sharp.ts:119`) calls
  `sharpFactory(Buffer.from(input.bytes))` with **no options object** — no `{ animated: true }`/`{ pages: -1 }`.
  Sharp's default behavior without that flag is to decode only the FIRST frame/page of a multi-frame
  source. `toFormat("webp")` then re-encodes that one frame.
- **Net effect: an uploaded animated GIF or animated WebP is silently flattened to a single still frame
  the moment it is served through its real public URL.** The bytes stored are the original animated file
  (nothing is lost at rest — re-fetching via the byte-passthrough video route would still show motion if
  something ever pointed there), but every reachable embed path shows a still image. This is NOT
  something this dispatch's scope authorizes fixing (`image-transformer.sharp.ts` lives in the Jini repo,
  not `apps/website`, and touching the shared "public" transform's behavior is outside "the import/accept
  path and its sibling lists"). **Flagging for Leona's ruling separately below.**

## Capability matrix — storage/serving/rendering vs. what the assistant's tools accept

| Type | `uploadMedia` ceiling (`DEFAULT_ALLOWED_MIME_TYPES`) | Sniffer recognizes it (`SniffedContentType`) | Serving/rendering | Assistant tool acceptance (before this fix) |
|---|---|---|---|---|
| image/png, jpeg, webp, gif | Yes | Yes | "public" webp transform; GIF/animated-WebP flattened (see above) | All 4 tools (`upload`, `import`, `generate` output only png, `promote_chat_attachment`) |
| image/avif | Yes | Yes (ISO-BMFF `ftyp`, disambiguated from mp4 since 2026-09-06) | Same "public" transform path | `media_upload_asset`, `media_import_from_url` yes; `media_generate_asset` hardcodes `image/png` regardless of what the provider actually returned (see note below) |
| video/mp4, video/webm | Yes (since 2026-08-24) | Yes | Real, separate byte-passthrough route: `GET /m/{id}/original`, video-only by design (`media-rendition.ts:492-534`); `resolveOneAssetPublicUrl` already branches correctly to that URL for any `video/`-prefixed sniffed type (`features/media/tool-registrations.ts:125`) | `media_upload_asset` — YES, already (schema literally spreads `DEFAULT_ALLOWED_MIME_TYPES`, `Jini/packages/cms/src/media/agent-tools.ts:105`). `media_import_from_url` — **NO, this was the gap** (fixed by this dispatch, see below). `media_generate_asset` — no (image-only surface, see above). |
| image/svg+xml | **No** — deliberately excluded, no ingest sanitizer built | Yes (sniffer recognizes it to force `Content-Disposition: attachment`, a defusal, not an accept) | N/A — never stored | Correctly rejected everywhere |
| audio (mp3/wav/ogg/etc.) | **No** | **No** — sniffer has no audio branch; falls to `application/octet-stream` | No admin "Audio" tab, no player component found | Rejected everywhere. Real gap if ever wanted: needs sniffer support + a storage-layer allowlist entry + a serving decision (byte-passthrough like video, presumably) — a `@jini-ai/integrations/media-providers` audio surface already exists for *generation* (`AUDIO_MODELS_BY_KIND`) but that's a separate axis from *import/upload* of existing audio files, which is what's actually missing. |
| PDF | **No** | **No** | N/A | Rejected. Same shape of gap as audio — needs sniffer + allowlist + a serving decision (most likely force-download like the existing SVG/HTML `Content-Disposition: attachment` handling, given PDFs are also embed-a-live-document risk). |
| Fonts (woff/woff2/ttf) | **No** | **No** | N/A | Rejected. No product signal seen anywhere in the codebase that this is wanted — theme font-loading (if any) was not investigated further, out of scope for a media-library gap audit. |
| Lottie/JSON motion | **No** | **No** (would sniff as `application/octet-stream` or, if the JSON happens to start with `<`, nothing) | No renderer exists anywhere in this codebase (no `lottie-web`/`@lottiefiles/*` dependency found) | Rejected. This is the one true "wire something new" option for real vector motion graphics — but it needs a client-side player added to the theme-rendering surface (`render.ts`) before an accepted JSON blob would do anything, which is well beyond an accept-list fix. Flagged as a real option, not attempted. |
| APNG | Not separately — sniffs as `image/png` today (APNG's chunk signature comes after the shared PNG magic bytes `isPng` checks) | Effectively yes, mislabeled as static PNG | Same "public" webp transform flattening trap as GIF/animated-WebP | Accepted everywhere PNG is, but animation is invisible for the same reason as GIF/WebP above |

## The "three accepted-type lists" — do they agree?

They do NOT, and the drift is exactly the shape the dispatch predicted: a fix (video support) landed in
the ceiling and in one client, not in its siblings.

1. **`DEFAULT_ALLOWED_MIME_TYPES`** (`Jini/packages/cms/src/media/media-service.ts:105-113`) — the real
   ceiling `uploadMedia` enforces: `image/jpeg, image/png, image/webp, image/gif, image/avif, video/mp4,
   video/webm`. 7 types. This is authoritative — everything else should be a subset or match it.
2. **`IMPORTABLE_CONTENT_TYPES`** (`apps/website/src/features/media-import/fetch-image.ts`) — was 5 types
   (image-only), now **7, matching #1** (this dispatch's fix).
3. **`FILE_HANDLER_ALLOWED_MIME_TYPES`** (`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:339-345`)
   — the TipTap drag/paste-into-post-body client-side filter. Still **5 types, image-only**, despite its
   own doc comment literally claiming it "mirrors the server's own advisory upload allowlist" — it does
   not; it is missing `video/mp4`/`video/webm`. **NOT fixed by this dispatch** — this file is under
   `apps/admin/src/features/posts/**`, outside my assigned scope (`media-import/**`, `media-generation/**`,
   `media/**`), and Agent F is live in `apps/admin/src/features/media/**` (adjacent, not identical, but I
   left it alone per the collision-avoidance rule and because it's a client-side UX filter, not a security
   boundary — `port.uploadMedia` still enforces the real allowlist server-side regardless of what this
   filter lets through to `onDrop`/`onPaste`). **Flagging for whoever owns `apps/admin/src/features/posts/**`.**

`media_upload_asset`'s own JSON-schema `enum` (`Jini/packages/cms/src/media/agent-tools.ts:105`) is not a
fourth divergent list — it's generated directly from `DEFAULT_ALLOWED_MIME_TYPES` (`[...DEFAULT_ALLOWED_MIME_TYPES]`),
so it can never drift from #1 by construction. Good precedent; `IMPORTABLE_CONTENT_TYPES` is a hand-copied
literal set instead (kept that way deliberately per its own doc comment, to stay independently reviewable
as a narrower policy) — worth considering the same "derive, don't copy" pattern if a future type is added
to #1 and both #2/#3 need to track it automatically. Not changed in this pass — out of scope, and the
existing test (`fetch-image.test.ts`'s "IMPORTABLE_CONTENT_TYPES is exactly..." assertion) already pins
the two staying in sync by hand.

## `media_generate_asset`'s content-type guess (separate, smaller finding, not fixed)

`tool-registrations.ts:346` hardcodes `contentType = "image/png"` for whatever `generate()` returns, with
a comment disclosing it as "a best-effort initial guess... most registered vendors return PNG." The
`uploadMedia` call's own allowlist check therefore always passes (the literal string `"image/png"` is
always in `DEFAULT_ALLOWED_MIME_TYPES`) regardless of what the provider actually returned, and the
*correct* type is separately re-sniffed and recorded to `mediaContentTypeStore` right after (line 371-372)
for display/serving purposes. Practical impact is small — `resolveOneAssetPublicUrl` reads the
content-type STORE, not the `MediaRecord`'s upload-time input, so serving is already correct — but it
means a provider that returned e.g. a WebP would still pass an upload-time allowlist check keyed on a
string that doesn't match its real bytes, which is a coincidence of using a value already inside the
allowlist rather than a real check. Not in Phase 2 scope (media-generation, not media-import); flagging
only.

## Phase 2 — what was implemented

Extended `media_import_from_url`'s accept list to the storage ceiling.

**Files changed:**
- `apps/website/src/features/media-import/fetch-image.ts` — `IMPORTABLE_CONTENT_TYPES` and
  `EXTENSION_BY_CONTENT_TYPE` gained `video/mp4`/`video/webm`; doc comments updated to explain why (the
  distinction that used to justify excluding video — "never re-encoded by the transform pipeline" — is
  true but was never a reason to reject the request, since `media_upload_asset` already accepts video and
  `resolveMediaPublicUrls` already branches correctly for it); the `Accept` request header widened from
  `image/*` to `image/*, video/*` (advisory only — the sniffed bytes decide regardless, same as before);
  the rejection message generalized from "not an importable image" to "not an importable file".
- `apps/website/src/features/media-import/agent-tools.ts` — tool/field descriptions updated to say image
  **or video**, list all 7 accepted types, and drop the now-false "a URL that returns... a video... is
  rejected" claim.

**Decision needed and resolved conservatively:** whether video should get a larger size cap than the
existing 10 MiB (`MEDIA_IMPORT_MAX_BYTES = DEFAULT_MAX_UPLOAD_BYTES`). **Recommendation taken: no change,
keep the shared 10 MiB cap for both.** Reasoning: `uploadMedia`'s own `DEFAULT_MAX_UPLOAD_BYTES` (the same
constant, `Jini/packages/cms/src/media/media-service.ts:79`) is not type-specific and would reject
anything over 10 MiB regardless of what this tool lets through first — raising only the import-side cap
would just move the rejection point later (after downloading more bytes over the SSRF-guarded egress
path) with zero additional capability gained. It would also cut into the deliberate headroom
`MEDIA_IMPORT_EGRESS_POLICY.maxResponseBytes` (12 MiB, `egress-policies.ts:66`) keeps above the 10 MiB
feature check (per SEC-06's pattern: transport backstop must stay above the feature's own cap, never the
reverse) — raising the feature cap toward or past 12 MiB would need the transport cap raised too, which is
a `platform/http` change, out of scope. If a real product need for larger video imports shows up later,
the correct fix is raising `DEFAULT_ALLOWED_MIME_TYPES`'s cap in the Jini package (cross-repo, its own
decision) — not a local override here.

**RED test first**, per the workflow: two existing tests directly encoded the OLD "video is rejected"
behavior and had to change (this IS the intended behavior change per Phase 2's scope, not test-weakening
to manufacture a pass):
- `"an MP4 served as image/png is rejected..."` → now asserts round-trip acceptance + correct sniffed
  `contentType`.
- `"IMPORTABLE_CONTENT_TYPES is exactly the five still-image types..."` → now asserts all 7.
Added: a real EBML/Matroska-header WebM acceptance test, and extension-mapping coverage for both new
types. Confirmed RED (4 failing exactly as expected, no unexpected drift) before implementing, then GREEN
after (46/46 in `fetch-image.test.ts`, 19/19 in the sibling `tool-registrations.test.ts` regression run).

**Verification run (fresh, from repo root):**
```
node --import tsx --test --experimental-test-module-mocks apps/website/src/features/media-import/__tests__/fetch-image.test.ts
# 46 pass, 0 fail

node --import tsx --test --experimental-test-module-mocks apps/website/src/features/media-import/__tests__/tool-registrations.test.ts
# 19 pass, 0 fail

npx tsc -p tsconfig.json --noEmit
# 0 errors

npx eslint fetch-image.ts agent-tools.ts fetch-image.test.ts --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}'
# clean
```

**What was deliberately NOT touched**, per dispatch scope:
- No generation backend wiring (`media_generate_asset` stays image-only).
- No change to the public rendition routes' video-only guard (`media-rendition.ts`).
- No change to `apps/admin/**` (`FILE_HANDLER_ALLOWED_MIME_TYPES` drift flagged above, not fixed).
- No change to the animation-flattening bug (`image-transformer.sharp.ts`, a Jini-repo file) — flagged
  for a ruling below.

## Flags needing Leona's ruling

1. **Animated GIF/WebP/APNG are flattened to a still frame on every real public URL.** This is a
   pre-existing bug (not introduced or worsened by this dispatch), living in the shared Jini `cms`
   package's `SharpImageTransformer` (missing `{ animated: true }` on the sharp load call) plus Tovu's
   own single "public" transform registration having no animation-preserving alternative. Fixing it
   properly needs (a) the Jini-side sharp call to opt into multi-page decode, and (b) a decision on
   whether the existing "public" transform should just always preserve animation for GIF/WebP/APNG
   sources (simplest), or whether a second, explicitly-animated transform name is warranted. This is
   real, user-visible ("I uploaded a GIF and it's not moving"), and worth a dedicated pass — but it is a
   cross-repo change outside this dispatch's `apps/website` media-import/media/media-generation scope.
2. **`FILE_HANDLER_ALLOWED_MIME_TYPES` (apps/admin) is stale against the real server allowlist** it
   claims to mirror. Low severity (server-side `uploadMedia` still enforces the real list regardless —
   this only affects which files the drag/paste UI lets a human try), but the doc comment's claim is
   false today. Whoever next touches `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`
   should add `video/mp4`/`video/webm` there too, for consistency with `media_upload_asset` and (as of
   this dispatch) `media_import_from_url`.
3. **Real motion-graphics generation** (an assistant actually producing new video/animation, not just
   importing/uploading existing files) needs one of: (a) a paid video-provider credential added to this
   workspace plus Tovu wiring `surface: 'video'` into `media_generate_asset` — real money, a real
   decision, not something to do silently; or (b) a Lottie/vector-animation path, which needs a new
   client-side renderer in `render.ts` before an accepted JSON blob would be visible at all — a bigger
   build than an accept-list change. Neither was started; both are named here as the real options.
