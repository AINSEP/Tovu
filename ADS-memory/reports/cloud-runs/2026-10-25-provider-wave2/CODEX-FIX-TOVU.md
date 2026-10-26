Code Inspection(Peer Review): **Code Inspection + Security** personas selected for lifecycle correctness and secret handling.

Reviewed `c45c14251…e4b0c0065` (`origin/cloud/prov-wave2-tovu`). References below are branch source.

Prior findings: **TDZ boot failure closed; retired calls closed; load timeout closed; settings cards closed.** Site attribution now reaches factories; vendor emission and non-spoofing still require the Jini review.

1. **High / Required — Settings and secrets can form a mismatched credential pair.** `apps/website/src/server/runtime/composition/provider-config-source.ts:61–71` reads two rows separately and saves them in separate commits. During endpoint/key rotation, another site boot can combine the old endpoint with the new secret, potentially sending credentials to the wrong backend. A failed second write also leaves a partial save. **Smallest fix:** atomically commit both rows and read a consistent snapshot through the existing transaction mechanism.

2. **Medium / Required — Project-key creation exposes an incomplete file.** `apps/website/src/server/runtime/composition/project-store.ts:58–63`: `wx` creates the final filename before writing its contents. A simultaneous web/desktop opener can encounter `EEXIST`, read an empty file, and fall back to site-only configuration for that process. A crash in that window leaves a damaged key. **Smallest fix:** reuse/extract the existing site-key publication mechanism: write and fsync a private temporary file, then atomically link it into place.

3. **Medium / Recommended — Previously saved credentials silently stop configuring providers.** `apps/website/src/server/runtime/composition/provider-plugins.ts:125–131` reads only the new configuration source. Owners who saved `plugin:<id>` credentials must re-enter them; the old boot defect does not prove nobody saved keys. **Smallest fix:** detect legacy rows and show a re-entry notice, or migrate them once into the declared fields.

4. **Low / Recommended — Fresh project databases never enable WAL.** `apps/website/src/server/runtime/composition/project-store.ts:89–90` opens a bare SQLite handle; its kernel wrapper preserves existing pragmas. Web and desktop therefore share a rollback-journal database with greater read/write contention. **Smallest fix:** enable WAL through the shared SQLite initialization path.

5. **Low / Recommended — Existing key-file permissions are unchecked.** `apps/website/src/server/runtime/composition/project-store.ts:60–64` accepts an existing valid key regardless of mode. A restored/copied `0644` key exposes the encryption key to other local users. **Smallest fix:** validate ownership/type and enforce or refuse permissions broader than `0600`.

Static checks found consent gating intact, distinct read/save route permissions, secret-free response construction, and sealed vault payloads. Migration application re-checks its ledger under the write lock; no duplicate-application race found.

No edits, tests, or servers. Live database bytes, emitted vendor payloads, and CCN measurements were not independently verified.
