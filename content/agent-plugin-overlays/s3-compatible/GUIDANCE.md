# Tovu host guidance for s3-compatible

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/s3-compatible/SKILL.md

Open the plugin’s **Connect S3-compatible storage** card with `credential_save {kind:"plugin-provider",target:"s3-compatible"}`. It collects the bucket, region, endpoint, access key ID, public URL and masked secret access key, plus optional private-media settings. Scope the key to the selected bucket. Key creation belongs to your storage provider’s console; no single key-creation URL covers all compatible services.

| Message | Meaning | Next step |
|---|---|---|
| `Failed to upload '...' to S3-compatible storage: HTTP 403` | The key cannot write to that bucket. | Check the key's bucket permissions, the bucket name and the region. |
| `Failed to upload '...' ... HTTP 404` | The bucket does not exist at that endpoint. | Check the bucket name, region and endpoint. |
| `... Tovu-managed object manifest ...` | The host could not read or update its list of published files, so it stopped rather than guess. | Retry once; if it repeats, check the key can read and write the bucket. |
| `Concurrent publish detected ...` | Another publish changed the bucket at the same time. | Publish again. |
