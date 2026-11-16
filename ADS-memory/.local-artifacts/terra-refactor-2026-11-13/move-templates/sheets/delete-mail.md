# website/platform/mail — 3 jobs, 4 rows (W1 #12). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra), group D.
Skeletons: `split-mail.gen.md`, `delete-mail.gen.md`, `dedupe-mail.gen.md` (kept as evidence). Paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

## Re-kind (read first)
Nothing in this feature moves to Jini: every generic body is ALREADY in `@jini-ai/platform/mail` (`smtp.ts`, `plugin-abi.ts`, `purpose-scoped-mailer.ts`, `delivery-availability.ts`). What is left in Tovu is wrappers, aliases and re-exports. So:
- SPLIT `smtp.nodemailer.ts` -> **DELETE keep-only** (DL-mail-1): the `SmtpMailerAdapter` wrapper class (0 prod callers; only translates `nowIso`->`nowMs` and the transport shape) and its deps type go; the lazy `nodemailer` loader stays (STAY-WIRING: the host owns vendor loading). Its 12 adapter tests are byte-for-byte twins of `packages/platform/src/mail/__tests__/smtp.test.ts` (check command below), so they are dropped, not moved.
- SPLIT `purpose-scoped-mailer.ts` -> **DELETE keep-only** (DL-mail-3): only the `toJiniMailer`/`toTovuMailer` re-export line goes; `wrapMailerWithPurposeGate` STAYS-WIRING (binds Tovu `RuntimeMode` + durable-outbox readiness). Its 3 consumers import the Jini names `fromPositionalMailer`/`toPositionalMailer` under the old local aliases (one import line per file, no call-site churn in hot boot files).
- DELETE `mail-status.ts` stays DELETE but in **keep-only** form (DL-mail-2): `non_reexport_statements: 1` (`MailProviderControl`, a Tovu port). The re-export block goes; importers take the Jini types from `@jini-ai/platform/mail`.
- DEDUPE `ports.ts` -> **DEDUPE delete-and-repoint** (DD-mail-1): `MailerPort` is member-for-member `PositionalMailer` (`JINI core/src/contracts/mail.ts:129`, re-exported by `@jini-ai/platform/mail`); the two type aliases `ConsoleMailerAdapter`/`InMemoryMailerAdapter` have 0 importers through the barrel (every `ConsoleMailerAdapter` import resolves to the members CLASS). No forwarder is kept (COMMON 19).

## Order and overlap
Run in order: **Job 1** (DL-mail-1 then DL-mail-3), **Job 2** (DL-mail-2), **Job 3** (DD-mail-1). Each job is one Tovu commit; no Jini commit anywhere in this feature.
untangle_overlap: C5.repoint.tsv:335,336 (`smtp.nodemailer.ts` SmtpMailPayload import/export -> `@jini-ai/core/contracts/mail`), C5:337 (`index.ts`, KEEP), C5:357 (`resolve-mailer.unit.test.ts`, not edited here), C11:145-147 (`mail-status-tool.test.ts`, `provider-tools.unit.test.ts`, `suppressions-feedback.unit.test.ts` createSystemClock import), C5:287 (`suppressions-feedback.unit.test.ts` dynamic import), C3:443,497,503 + C4:259 + C6:245 (`server/routes/types.ts`, other lines). **All three jobs: execute after wave B merge.** Every edited file is guarded by exact text (OLD must occur exactly once), never by blob. DL-mail-1's FILE_AFTER assumes C5 landed (precondition below).
blocked: no. Owner decisions: none.

---------------------------------------------------------------------------------------------------
## Job 1, row DL-mail-1 (template T-DELETE, keep-only)
```
id: DL-mail-1
precondition: C5 landed: `rg -n "SmtpMailPayload" {JINI_CLONE}/packages/core/src/contracts/mail.ts {JINI_CLONE}/packages/core/src/contracts/mail/` prints an `export` line, AND `rg -n "core/contracts/mail" apps/website/src/platform/mail/adapters/smtp.nodemailer.ts` prints at least one line. Else SKIP "C5 not landed".
tovu_file: apps/website/src/platform/mail/adapters/smtp.nodemailer.ts | text-guarded (pre-C5 blob be223fdc0996c57e7d0075bd70e55245ad85a1b5; after C5 check `git diff b28d38c6 -- <file>` only touches lines containing `SmtpMailPayload`, else SKIP)
non_reexport_statements: 5 (SmtpTransport, SmtpMailerAdapterDeps, SmtpMailerAdapter, CreateNodemailerSmtpTransportConfig, createNodemailerSmtpTransport) -> keep only covers 3; the other 2 are deleted as superseded (below)
why_dead: superseded by `@jini-ai/platform/mail/smtp` `SmtpMailerAdapter` (+ `toPositionalMailer` from `@jini-ai/platform/mail`): the Tovu class and its deps type have 0 prod callers (index.ts re-export + 2 tests only)
tovu_file_after: keep only: SmtpTransport, CreateNodemailerSmtpTransportConfig, createNodemailerSmtpTransport, the SmtpMailPayload type re-export
file_after: "block FILE_AFTER below"
moved_bodies: -
census:                                    # python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/mail/adapters/smtp.nodemailer.ts
  - apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts:6 | static | "../smtp.nodemailer.js"
  - apps/website/src/platform/mail/index.ts:24 | reexport | "./adapters/smtp.nodemailer.js"
reach_check:
  - rg -n --no-heading "SmtpMailerAdapter\b|SmtpMailerAdapterDeps" apps content development --glob '!**/node_modules/**' --glob '!apps/website/src/platform/mail/adapters/smtp.nodemailer.ts'
    -> before: index.ts:21,22; smtp.nodemailer.unit.test.ts:6,9,48,88,98,113,131,149,166,179,192,205,220,241; mail-status-tool.test.ts:6,35; development/refactor-patterns/** (docs, ignore). After: only the `@jini-ai/platform/mail/smtp` import + use in mail-status-tool.test.ts and the docs.
importers:
  - apps/website/src/platform/mail/index.ts | OLD (exact, 5 lines):
      export {
        createNodemailerSmtpTransport, SmtpMailerAdapter,
        type CreateNodemailerSmtpTransportConfig, type SmtpMailerAdapterDeps,
        type SmtpMailPayload, type SmtpTransport,
      } from "./adapters/smtp.nodemailer.js";
    NEW:
      export {
        createNodemailerSmtpTransport,
        type CreateNodemailerSmtpTransportConfig,
        type SmtpMailPayload, type SmtpTransport,
      } from "./adapters/smtp.nodemailer.js";
  - apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts (barrel importer, not in the census) | OLD:
      import { SmtpMailerAdapter, type MailerPort } from "../../../platform/mail/index.js";
    NEW (2 lines):
      import { toPositionalMailer } from "@jini-ai/platform/mail";
      import { SmtpMailerAdapter } from "@jini-ai/platform/mail/smtp";
      import type { MailerPort } from "../../../platform/mail/index.js";
    (that is 3 lines replacing 1; order exactly as written)
folds:
  - apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts | OLD:
      const mailer = new SmtpMailerAdapter({ sendMail: async () => assert.fail("status must not send") });
    NEW:
      const mailer = toPositionalMailer({ mailer: new SmtpMailerAdapter({ transport: { sendMail: async () => assert.fail("status must not send") }, clock: { nowMs: () => 0 } }) });
    (same fake transport, same assertion on the next line; the clock is required by the Jini constructor and is never read because nothing is sent)
comment_refs: -
path_literals: -
tests:
  - apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts | text-guarded (blob d28ec49f94b2550ff46ca15818e99d6f65664019 today; no untangle row) | overwrite with block TEST_AFTER below = drop every `SmtpMailerAdapter` test (the `test(` blocks starting at lines 47, 86, 96, 111, 123, 141, 158, 171, 184, 197, 214, 230) plus `FakeSmtpTransport`, `SEND_OPTIONS`, `makeMessage` (lines 13-45, used only by them); keep the `createNodemailerSmtpTransport` test (lines 58-84) verbatim.
    check (must print exactly `DONE`; every dropped test name has a twin in Jini):
      T=apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts; rg -o '^test\("[^"]+"' $T | grep -v createNodemailerSmtpTransport | while read l; do rg -q -F "$l" {JINI_CLONE}/packages/platform/src/mail/__tests__/smtp.test.ts || echo "MISSING $l"; done; echo DONE
    (verified 2026-11-16: prints DONE. The Jini twins assert the same payloads/results; they differ only in fixture sender text and the object call shape.)
  - apps/website/src/features/mail-status/__tests__/mail-status-tool.test.ts | text-guarded (C11:145 edits its createSystemClock import line) | import + fold above; assertions untouched
relocations: -
why_moves: - (the deleted class's why "Preserves Tovu's constructor..." describes only the deleted wrapper; the delivery rationale comment stays in FILE_AFTER)
baselines: - (rg -F "adapters/smtp.nodemailer" over json/mjs/cjs/yml: no hit)
jini_commit: -
untangle_followup: C5:335/336 rows are consumed by FILE_AFTER (it already carries the core specifier); tell the coordinator so a re-run of C5 does not re-apply them.
```
FILE_AFTER (apps/website/src/platform/mail/adapters/smtp.nodemailer.ts, whole file):
```ts
/** Tovu SMTP wiring: lazily load the vendor and hand it to Jini's SMTP transport. */
import { createRequire } from "node:module";
// Delivery rationale lives in Jini/packages/platform/src/mail/smtp.ts; SMTP is the corporate-server
// escape hatch when the default hosted provider does not fit (ADR-037).
import type { SmtpMailPayload } from "@jini-ai/core/contracts/mail";
import { createNodemailerSmtpTransport as createJiniSmtpTransport } from "@jini-ai/platform/mail/smtp";
export type { SmtpMailPayload } from "@jini-ai/core/contracts/mail";

/** Existing Tovu vendor seam; the Jini adapter receives an object-shaped wrapper. */
export interface SmtpTransport {
  sendMail({ mail }: { mail: SmtpMailPayload }, optional?: Record<string, never>): Promise<{ messageId: string }>;
}

export interface CreateNodemailerSmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  timeoutMs?: number;
}

/** Injects the lazily loaded nodemailer module into Jini; connections open only on send.
 * @example createNodemailerSmtpTransport({ host, port, secure, auth, timeoutMs })
 */
export function createNodemailerSmtpTransport({ timeoutMs, ...required }: CreateNodemailerSmtpTransportConfig): SmtpTransport {
  // Host owns vendor loading so sites without SMTP never load nodemailer.
  // createRequire is needed in this ESM module. Loading an npm vendor here avoids the duplicate
  // first-party TypeScript module graph that caused earlier require-based wiring bugs.
  const nodemailer: typeof import("nodemailer") = createRequire(import.meta.url)("nodemailer");
  const transport = createJiniSmtpTransport({ ...required, nodemailer }, { timeoutMs });
  return { sendMail: ({ mail }) => transport.sendMail({ mail }) };
}
```
(The `SmtpTransport` interface and `createNodemailerSmtpTransport` keep their exact current text, including the `optional?: Record<string, never>` parameter: a verbatim keep changes no shape; `mail-provider-catalog.ts` and `resolve-mailer.unit.test.ts` implement it.)

TEST_AFTER (apps/website/src/platform/mail/adapters/__tests__/smtp.nodemailer.unit.test.ts, whole file; the `test(...)` block is lines 58-84 of today's file verbatim):
```ts
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { createNodemailerSmtpTransport, type SmtpMailPayload } from "../smtp.nodemailer.js";

/**
 * @file `createNodemailerSmtpTransport` — exercised at nodemailer's createTransport boundary, without opening a socket.
 * SMTP delivery and failure classification are tested on Jini's `SmtpMailerAdapter`
 * (`packages/platform/src/mail/__tests__/smtp.test.ts`).
 */

test("createNodemailerSmtpTransport maps configuration and forwards the complete payload", async (t) => {
  ... lines 59-84 of today's file, verbatim (ends with the line `});`) ...
});
```
The executor copies lines 58-84 exactly (`sed -n 58,84p`) in place of the `test(` ... `});` placeholder; nothing else.

---------------------------------------------------------------------------------------------------
## Job 1, row DL-mail-3 (template T-DELETE, keep-only) — run after DL-mail-1 in the same job
```
id: DL-mail-3
tovu_file: apps/website/src/platform/mail/purpose-scoped-mailer.ts | blob bd0a1341a229242d2f9949e12a74d95a0cab1551 (no untangle row)
non_reexport_statements: 2 (WrapMailerWithPurposeGateOptions, wrapMailerWithPurposeGate) -> both kept
why_dead: superseded by `@jini-ai/platform/mail` `fromPositionalMailer`/`toPositionalMailer`: line 18 only re-exports them under Tovu aliases
tovu_file_after: keep only: everything except line 18 (`export { fromPositionalMailer as toJiniMailer, ... }`)
file_after: delete exactly the one line
  export { fromPositionalMailer as toJiniMailer, toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";
  (line 19, the `import { ... as toJiniMailer ... }` line, stays: the file still calls both)
moved_bodies: -
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/mail/purpose-scoped-mailer.ts -> after DL-mail-1:
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts:12 | static | "../../purpose-scoped-mailer.js"   (imports wrapMailerWithPurposeGate: unchanged)
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts:4 | static | "../../purpose-scoped-mailer.js"   (unchanged)
  - apps/website/src/platform/mail/delivery-availability.ts:4 | static | "./purpose-scoped-mailer.js"   (EDIT)
  - apps/website/src/platform/mail/index.ts:31 | reexport | "./purpose-scoped-mailer.js"   (EDIT)
  - apps/website/src/server/runtime/composition/app.ts:281 | static | "#src/platform/mail/purpose-scoped-mailer"   (unchanged)
  - apps/website/src/server/runtime/composition/deps.ts:385 | static | "#src/platform/mail/purpose-scoped-mailer"   (unchanged)
  - apps/website/src/contracts/core/__tests__/extract-s3-host-source.unit.test.ts:16 | path-literal (asserts the file never names JiniMailerPort: still true)
  - apps/website/src/server/runtime/boot/mail-delivery-policy.ts:22 | comment (still a live path: file kept)
  (smtp.nodemailer.ts:12 is gone after DL-mail-1. If it is still there, DL-mail-1 did not apply: SKIP.)
reach_check:
  - rg -n --no-heading "toJiniMailer|toTovuMailer" apps --glob '!**/node_modules/**' -> after: only purpose-scoped-mailer.ts:18(new numbering),26,30; delivery-availability.ts (new import line + line 13); resolve-mailer.ts (new import line + 116 comment + 167,173,181); mail-delivery-policy.ts (new import line + 68); mail-provider-catalog.ts (new import line + 115). No `from "#src/platform/mail/index"` or `"./purpose-scoped-mailer.js"` line names either alias.
importers:
  - apps/website/src/platform/mail/delivery-availability.ts | OLD: import { toJiniMailer } from "./purpose-scoped-mailer.js";
                                                            NEW: import { fromPositionalMailer as toJiniMailer } from "@jini-ai/platform/mail";
  - apps/website/src/platform/mail/index.ts | OLD: export { toJiniMailer, toTovuMailer } from "./purpose-scoped-mailer.js";
                                            NEW: (delete the line)
  - apps/website/src/server/runtime/boot/resolve-mailer.ts | text-guarded | OLD: import { toJiniMailer, toTovuMailer } from "#src/platform/mail/index";
                                                                         NEW: import { fromPositionalMailer as toJiniMailer, toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";
  - apps/website/src/server/runtime/boot/mail-delivery-policy.ts | text-guarded | OLD: import { toJiniMailer, toTovuMailer } from "#src/platform/mail/index";
                                                                               NEW: import { fromPositionalMailer as toJiniMailer, toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";
  - apps/website/src/server/runtime/boot/mail-provider-catalog.ts | text-guarded | OLD: import { toTovuMailer } from "#src/platform/mail/index";
                                                                                NEW: import { toPositionalMailer as toTovuMailer } from "@jini-ai/platform/mail";
  (These files already import other names from "@jini-ai/platform/mail" in separate statements; mail-provider-catalog.ts already has two such statements, so a second statement is the house pattern, not an eslint error. If eslint reports `import/no-duplicates` as an error on the new line, merge the alias into the existing `import { ... } from "@jini-ai/platform/mail";` value statement of that file instead — the only allowed variation.)
folds: -
comment_refs: - (resolve-mailer.ts:116 "Tovu's purpose-scoped MailerPort (`toTovuMailer`)" stays true: the local alias keeps that name)
path_literals: -
tests: - (no test imports either alias)
relocations: -
why_moves: -
baselines: - (no json/mjs/yml hit for "mail/purpose-scoped-mailer")
jini_commit: -
untangle_followup: -
tovu_msg (Job 1, both rows): "refactor(mail): drop the SMTP adapter wrapper and the positional-mailer aliases" | body "Tovu keeps the lazy nodemailer loader and the purpose-gate binding; SMTP delivery and the positional adapters come from @jini-ai/platform/mail."
Job 1 commit paths (9): smtp.nodemailer.ts, smtp.nodemailer.unit.test.ts, mail-status-tool.test.ts, index.ts, purpose-scoped-mailer.ts, delivery-availability.ts, resolve-mailer.ts, mail-delivery-policy.ts, mail-provider-catalog.ts
```

---------------------------------------------------------------------------------------------------
## Job 2, row DL-mail-2 (template T-DELETE, keep-only)
```
id: DL-mail-2
tovu_file: apps/website/src/platform/mail/mail-status.ts | blob dd531e9630859a733fdd24103029e3777086ed51 (no untangle row on it)
non_reexport_statements: 1 (MailProviderControl) -> kept
why_dead: re-exports of `@jini-ai/platform/mail` types (MailStatusReport, MailProviderError, MailProviderField, MailProviderSetup, MailProviderConfiguration, MailProviderConfigurationReport); `MailProviderControl` is a Tovu port and stays
tovu_file_after: keep only: MailProviderControl
file_after: "block FILE_AFTER below"
moved_bodies: -
census:                                    # python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/mail/mail-status.ts
  - apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts:8 | static | "#src/platform/mail/mail-status"
  - apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts:10 | static | "../../../platform/mail/mail-status.js"
  - apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts:9 | static | "../../../platform/mail/mail-status.js"
  - apps/website/src/platform/mail/index.ts:29 | reexport | "./mail-status.js"
  - apps/website/src/server/__tests__/routes/mail-providers-route.test.ts:15 | static | "#src/platform/mail/mail-status"
  - apps/website/src/server/routes/types.ts:673 | import-type | "#src/platform/mail/mail-status"
  - apps/website/src/server/routes/types.ts:676 | import-type | "#src/platform/mail/mail-status"
reach_check:
  - rg -n --no-heading -F "mail/mail-status" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/website/src/platform/mail/mail-status.ts'
    -> the census lines above + apps/admin/src/features/email/email-api.ts:15 (comment; the file is kept, so it stays as is). Nothing else.
importers:
  - apps/website/src/features/mail-status/__tests__/provider-operations.unit.test.ts | OLD: import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "#src/platform/mail/mail-status";
      NEW (2 lines): import type { MailProviderConfiguration, MailProviderConfigurationReport } from "@jini-ai/platform/mail";
                     import type { MailProviderControl } from "#src/platform/mail/mail-status";
  - apps/website/src/features/mail-status/__tests__/provider-tools.unit.test.ts | text-guarded (C11:146) | OLD: import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "../../../platform/mail/mail-status.js";
      NEW (2 lines): import type { MailProviderConfiguration, MailProviderConfigurationReport } from "@jini-ai/platform/mail";
                     import type { MailProviderControl } from "../../../platform/mail/mail-status.js";
  - apps/website/src/features/mail-status/__tests__/suppressions-feedback.unit.test.ts | text-guarded (C11:147, C5:287) | OLD: import type { MailProviderConfiguration } from "../../../platform/mail/mail-status.js";
      NEW: import type { MailProviderConfiguration } from "@jini-ai/platform/mail";
  - apps/website/src/server/__tests__/routes/mail-providers-route.test.ts | OLD: import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "#src/platform/mail/mail-status";
      NEW (2 lines): import type { MailProviderConfiguration, MailProviderConfigurationReport } from "@jini-ai/platform/mail";
                     import type { MailProviderControl } from "#src/platform/mail/mail-status";
  - apps/website/src/server/routes/types.ts | text-guarded (C3/C4/C6 edit other lines) | OLD: Promise<import("#src/platform/mail/mail-status").MailStatusReport>;
      NEW: Promise<import("@jini-ai/platform/mail").MailStatusReport>;
    (line 676 `import("#src/platform/mail/mail-status").MailProviderControl` stays: still declared there)
  - apps/website/src/platform/mail/index.ts | OLD (exact, 4 lines):
      export type {
        MailStatusReport, MailProviderField, MailProviderSetup, MailProviderConfiguration,
        MailProviderConfigurationReport, MailProviderControl,
      } from "./mail-status.js";
    NEW (5 lines):
      export type {
        MailStatusReport, MailProviderField, MailProviderSetup, MailProviderConfiguration,
        MailProviderConfigurationReport,
      } from "@jini-ai/platform/mail";
      export type { MailProviderControl } from "./mail-status.js";
    (index.ts already re-exports Jini types at lines 6-12; the barrel itself is out of scope here. If `rg -n "^export type \{" apps/website/src/platform/mail/index.ts` shows the first block already lists any of these 5 names, STOP: duplicate export.)
folds: - | comment_refs: - | path_literals: - | relocations: - | baselines: - | jini_commit: - | untangle_followup: -
tests: the 4 test files above | import lines only; assertions untouched
why_moves: - (the header why "The provider verdict remains separate from credential presence..." stays in FILE_AFTER)
tovu_msg: "refactor(mail): mail-status keeps only the Tovu provider-control port" | body "The status and configuration types are imported from @jini-ai/platform/mail directly."
Job 2 commit paths (7): mail-status.ts, index.ts, routes/types.ts, provider-operations.unit.test.ts, provider-tools.unit.test.ts, suppressions-feedback.unit.test.ts, mail-providers-route.test.ts
```
FILE_AFTER (apps/website/src/platform/mail/mail-status.ts, whole file):
```ts
/** Shared safe status/configuration contracts are owned by Jini; Tovu retains selection control.
 * The provider verdict remains separate from credential presence and delivery evidence.
 * Setup copy is plugin/host data, and credential summaries expose presence without values.
 */
import type { MailProviderConfigurationReport } from "@jini-ai/platform/mail";

/** Explicit provider selection: `check` validates without sending, `select` writes both lanes. */
export interface MailProviderControl {
  check(required: { id: string }): Promise<{ ok: true; label: string } | { ok: false; reason: string }>;
  select(required: { id: string; principalId: string; expectedRevisionSeq?: number }): Promise<void>;
  /** Exact addressed setting value and revision, read before an access approval. */
  readSelection?(): Promise<{ setting: MailProviderConfigurationReport["setting"]; revisionSeq: number }>;
  /** The safe configuration DTO for every installed provider. Absent in older roots. */
  describe?(): Promise<MailProviderConfigurationReport>;
  /** Drops cached provider mailers and status so the next send and status read start fresh. */
  invalidate?(): void;
}
```
(= today's file minus lines 6-9, the `export type { ... } from "@jini-ai/platform/mail";` block, and one blank line. `MailProviderError` had no importer through this file or the barrel.)

---------------------------------------------------------------------------------------------------
## Job 3, row DD-mail-1 (template T-DEDUPE, delete-and-repoint)
```
id: DD-mail-1
feature: website/platform/mail
tovu_files:
  - apps/website/src/platform/mail/ports.ts | blob 4bb5a6cb47d39018c4f66e5aa07350961201c4af | delete-and-repoint
jini_survivor: @jini-ai/platform/mail (barrel) PositionalMailer at {JINI_CLONE}/packages/core/src/contracts/mail.ts:129, re-exported by packages/platform/src/mail/plugin-abi.ts:3 (`export type { PositionalMailer, PluginMailHttpClient } from "@jini-ai/core/contracts/mail"`) and platform/src/mail/index.ts:34 (`export * from "./plugin-abi.js"`) | blob of core/src/contracts/mail.ts: take at execution (no guard needed beyond step 0's rg)
  step-0 rg: rg -n "export interface PositionalMailer\b" {JINI_CLONE}/packages/core/src/contracts/mail.ts -> exactly 1 line
behaviour_diff:
  - type: Tovu MailerPort { capabilities(): MailerCapabilities; send(message: OutboundEmail, options: MailerSendOptions): Promise<MailerSendResult>; sendBatch(messages: readonly OutboundEmail[], options: MailerSendOptions): Promise<readonly MailerSendResult[]> } / Jini PositionalMailer: the same 3 members, same parameter and return types (Tovu imports those 4 types from @jini-ai/platform/mail, which re-exports core's) / same
  - type: ConsoleMailerAdapter, InMemoryMailerAdapter (aliases of MailerPort) / no Jini twin / dropped: 0 importers (every `ConsoleMailerAdapter` import in apps resolves to `features/members` (the class); `InMemoryMailerAdapter` has no use)
  - type: the 7 re-exported Jini types / identical by construction / same
real_caller_check: apps/website/src/platform/mail/delivery-availability.ts:12 `isMailDeliveryAvailable(mailer: MailerPort)` passes it to `fromPositionalMailer({ mailer })`, whose parameter type IS `PositionalMailer` — it relies on exactly that shape.
binding: - (file deleted)
why_moves:
  - "Approval facts are checked again inside the selected provider's delivery policy." + "Host adapters retain the consumer call shape while translating to Jini at dispatch." -> apps/website/src/platform/mail/index.ts, as ONE comment line directly above the new line-13 export:
    /** MailerPort is Jini's positional mailer: host adapters keep the consumer call shape and translate at dispatch; approval facts are re-checked in the provider's delivery policy. */
  - "Shared contract rationale: Jini/packages/platform/src/mail/ports.ts and types.ts." -> dropped (index.ts:2 already says it)
jini_test_text: -
failing_test: - (types only; no behaviour change)
importer_edits:                            # each OLD must occur exactly once
  - apps/website/src/platform/mail/index.ts: 'export type { ConsoleMailerAdapter, InMemoryMailerAdapter, MailerPort, MailerSendOptions, MailTestApproval } from "./ports.js";' -> 'export type { PositionalMailer as MailerPort, MailerSendOptions, MailTestApproval } from "@jini-ai/platform/mail";' (with the why comment line above it)
  - apps/website/src/platform/mail/sender-identity.ts: 'import type { MailerPort } from "./ports.js";' -> 'import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/purpose-scoped-mailer.ts: 'import type { MailerPort } from "./ports.js";' -> 'import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/delivery-availability.ts: 'import type { MailerPort } from "./ports.js";' -> 'import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/adapter-module.ts: 'import type { MailerPort } from "./ports.js";' -> 'import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts: 'import type { MailerPort, OutboundEmail, MailerSendOptions, MailerSendResult } from "../../ports.js";' -> 'import type { PositionalMailer as MailerPort, OutboundEmail, MailerSendOptions, MailerSendResult } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/__tests__/unit/sender-identity.unit.test.ts: 'import type { MailerPort } from "../../ports.js";' -> 'import type { PositionalMailer as MailerPort } from "@jini-ai/platform/mail";'
  - apps/website/src/platform/mail/__tests__/integration/purpose-scoped-mailer-call-sites.integration.test.ts: 'import type { MailerPort, MailerSendOptions, MailerSendResult } from "../../ports.js";' -> 'import type { PositionalMailer as MailerPort, MailerSendOptions, MailerSendResult } from "@jini-ai/platform/mail";'
  (smtp.nodemailer.ts:11 imported ports.js before DL-mail-1; its FILE_AFTER has no such import. If `rg -n "ports.js" apps/website/src/platform/mail/adapters/smtp.nodemailer.ts` prints a line, Job 1 did not land: SKIP.)
baselines:
  - development/scripts/write-path-inventory.baseline.json: remove the 4 objects whose "file" is "src/platform/mail/ports.ts" (contractMethod MailSuppressionRepoPort.isSuppressed, MailSuppressionRepoPort.suppress, MailSendDedupRepoPort.wasSent, MailSendDedupRepoPort.markSent; today at lines 1903-1934, each object `{ ... }` plus its trailing comma). Then `node -e 'JSON.parse(require("fs").readFileSync("development/scripts/write-path-inventory.baseline.json","utf8"))'`.
    Note: those entries already cite lines 52-72 of a 20-line file (stale). The cloud run owes `write-path-inventory --check`; if it reports these 4 as "missing" on the PARENT commit too, that is pre-existing, not this slice.
census: python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/mail/ports.ts -> before: exactly the 8 importer lines above + smtp.nodemailer.ts:11 if Job 1 has not run (then SKIP) ; after: 0 hits. Also `rg -n -F "mail/ports" apps development --glob '!**/node_modules/**'` after: only index.ts:2 (Jini path in a comment, stays).
bundle_check: - (server code)
tovu_msg: "refactor(mail): MailerPort is Jini's PositionalMailer; drop the ports re-export file" | body "Same three members; the two unused aliases go."
Job 3 commit paths (10): deleted ports.ts, index.ts, sender-identity.ts, purpose-scoped-mailer.ts, delivery-availability.ts, adapter-module.ts, 3 tests, write-path-inventory.baseline.json
```
Expected cloud run (after all 3 jobs): Tovu typecheck; `smtp.nodemailer.unit.test.ts`, `mail-status-tool.test.ts`, `purpose-scoped-mailer*.test.ts`, `sender-identity.unit.test.ts`, `provider-*.unit.test.ts`, `suppressions-feedback.unit.test.ts`, `mail-providers-route.test.ts`, `resolve-mailer.unit.test.ts`, `mail-send.golden.test.ts`, `extract-s3-host-source.unit.test.ts`; `write-path-inventory --check`. No RED test: no behaviour change.
est_executor_tokens: Job 1 ~45k, Job 2 ~30k, Job 3 ~35k (Sonnet).
