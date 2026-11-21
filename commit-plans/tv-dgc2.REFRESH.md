# REFRESH

## V3

- Coordinator-authorized importer reviewed: `apps/website/src/server/inbound/admin-http/routes/media/import-url.ts:7` imports `fetchImage`; its call at `:55` remains valid because the new signal option is optional. No forced edit needed; changing its request lifecycle is outside V3.
- Listed media-import, asset-transfer, and theme callers retain their imports and calls, except the explicitly named URL theme signal propagation.
- No test importer repoints needed.
- Combine owes execution of the two new theme-file-safety cases and the independent forwarding/pre-write-check mutations. No local RED/GREEN claim.
