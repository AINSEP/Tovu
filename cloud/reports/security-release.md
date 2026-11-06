# security-release — assistant catalog admission

Status: in progress. Tovu `cloud/security-release` only; no tag, publication, deployment or main push. Jini unchanged.

The packaged journey created a daemon run without a persisted staff-chat/message binding. Its private bearer was valid, but the site correctly refused catalog discovery because no accepted current attempt existed. The release caller now creates a real authenticated chat and sends its conversation/message identity through existing durable acceptance. The actual route/admission is unchanged.

A regression calls the actual journey callback over real site and daemon HTTP routes, with real session/bearer guards and the real durable store. Before the fix it failed with the exact catalog 403; after the fix the actual daemon catalog client succeeds. Wrong credentials, unaccepted attempts, another principal and cancelled attempts remain refused. All 16 focused checks pass. Root typecheck passes; E2E/type/lint verification is being finalized. Prior diagnostic reporting remains intact.

Previous report: https://github.com/AINSEP/Tovu/blob/8ea4f216bf7f3a799a6bf1e01620e9f6ad3482a4/cloud/reports/security-release.md
