# Media import and guarded HTTP audit

Inputs: Tovu `4b89cd09..efc6847ed4490d0f57cd94d16b8cf46a6489a88a`, especially `b1ce2d0a`, `dd187ece`, `a346b3ec`; HEAD production source, architecture sections 13/14. Tests excluded; no execution of application code or network requests. Findings are source-path confirmations, not runtime reproductions.

## MI-01 — Medium — Complete images are rejected because their unused text representation was truncated

- **Location:** `apps/website/src/platform/http/client.ts:308`; consumer `apps/website/src/features/media-import/fetch-image.ts:225`.
- **Status: CONFIRMED.** Read the transport → policy cap → `fetchImage` → tool handler path.
- **Scenario:** An HTTPS response contains an image below the 10 MiB upload limit, but decoding its binary bytes as UTF-8 and re-encoding the replacement characters produces more than the HTTP policy's 12 MiB limit. The transport returns both the intact binary buffer and that lossy text (`transport.fetch.ts:87`). `capResponse` leaves `bodyBytes` intact but sets the single `bodyTruncated` flag because `bodyText` changed. `fetchImage` passes that flag to `validateImageBytes`, which rejects before upload with a false claim that the image exceeds the import limit. The tool never reads the text body.
- **Impact:** The advertised binary size limit depends on the image's byte distribution; legitimate files below the limit fail to import. The comment at `client.ts:295` correctly notices the representations have different lengths but its OR rule incorrectly makes truncation of an unused representation fatal to the binary consumer.
- **Correction direction:** Report raw-body truncation independently, or make the flag consumed by binary clients describe clipping of raw bytes. Keep any text-specific truncation separately observable.
- **Limit:** No runtime reproduction or live URL fetch was performed, as required by the audit constraints.

## MI-02 — Low — Redirected imports report the initial URL as the final source

- **Location:** `apps/website/src/features/media-import/tool-registrations.ts:168`; false contract comment at `:107`.
- **Status: CONFIRMED.** Read URL parsing, redirect recursion, fetch return, and result projection.
- **Scenario:** An allowed HTTPS URL A redirects to allowed HTTPS URL B, which serves the image. `sendWithPolicy` follows B, but `HttpResponse` contains no final URL. `fetchImage` returns its original parsed A in `FetchedImage.url` (`fetch-image.ts:285`); the tool emits A as `sourceUrl`. The declared result contract says this field is the source after redirect resolution. The default filename also derives from A.
- **Impact:** The reported import provenance does not identify the URL from which the bytes were downloaded. Redirect support is an explicit feature of this new policy.
- **Correction direction:** Return the effective URL from the guarded client and propagate it, or explicitly define this field as the requested URL and remove the contrary claim.

## Coverage / handoff

Review ongoing. Source read: the three media-import production files; HTTP client, transport, types, policy definitions; relevant production/hermetic composition injections and catalog registration. Main confirmed SSRF controls seen in source: HTTPS/embedded-credential checks, every resolved address checked, connection pinned to vetted peer, and full checks repeated on redirects. This is not a blanket proof against every address-classification bypass or deployment-specific route.

Next assignee: continue source audit, then operator triage. No source changes made.
