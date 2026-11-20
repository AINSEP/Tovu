# REFRESH

Base: merge-6 (`776ce6d0f`). All seven sheets completed; no STOP conditions found.

- T1: Eight old plugin-id literals found in the named sources; the 25 published Jini agent-plugin ids are owned by the parallel Jini job. Tovu-owned ids retained. Installed-plugin rows and saved embeds keyed by the old ids need the later data migration.
- T4: The widget is at `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts`. Both existing success hooks (base lines 61 and 66) use the renamed attribute. Existing CSS fallback variables remain outside this success-class/attribute rename.
- T5: The six targeted greps reached 25 files, all in apps/ or content/. The local `SEARCH_CREDENTIAL_LABEL_PREFIX` in the reached `site-search.ts` also needed the new prefix to produce the named Meilisearch lookup label; its existing assertion and label documentation were repointed. No additional test importers needing repoints were found. No docs/ or .env.example matches; no history records edited.
- D3-T: Exactly three github-deployment references before editing; adapter-path matches were comments, not production imports. Existing deployment comments, including the specified types.ts status comment, remain untouched.
- TV-03/TV-04: Targeted shell reference searches returned no importers in apps/, development/, or packages/. No test importers to repoint.
- E-T1: All five original message-less assertions were present and received exactly the specified messages; case inventories and assertion expressions retained.

No verification commands run, per dispatch; coordinator owns checks after the Jini release is consumed. No extra deletions at diff re-read. No DC ledger rows assigned to this dispatch. Full per-sheet file lists and counts are in COMMIT-PLAN.md.
