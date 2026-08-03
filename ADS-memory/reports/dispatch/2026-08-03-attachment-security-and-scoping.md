# Cloud brief — attachment security claims + workspace-scoped upload dir

Unattended cloud dispatch. No human is watching — verify everything by measuring, and do not ask
questions you can answer yourself.

## Where you are

Two repos are mounted. **All edits go in `Tovu-AI-CMS`.** `Jini` is READ-ONLY reference here (you
need `packages/http-kit/src/attachments.ts` from it). **Make no commits in Jini.**

```bash
cd Tovu-AI-CMS && git checkout main && git pull origin main
cd ../Jini        && git checkout main && git pull origin main
```

At dispatch: Tovu `main` = `cd55427`, Jini `main` = `f13f92c2`.

## MANDATORY environment setup — nothing works before this

**Read this before running any command. Skipping it produces a misleading
`Cannot find module '@jini-ai/…'` that looks like missing code and is not.**

Tovu declares **ten** of its dependencies as `file:../Jini/packages/*` — relative paths to a
**sibling checkout**. Two consequences:

1. **The two repos MUST sit side by side, and the Jini one must be named exactly `Jini`.** If your
   checkout directories are named otherwise, symlink or rename so that `../Jini/packages/ui`
   resolves from the Tovu root. Verify with `ls ../Jini/packages` from inside the Tovu checkout
   before going further.
2. **Jini's `dist/` is gitignored**, so a fresh clone has **no build output at all**. Every
   `@jini-ai/*` import resolves through `dist/`, so Tovu cannot typecheck, test, or boot until Jini
   is built.

Run this, in this order, and confirm each step succeeded:

```bash
cd Jini
pnpm install            # Jini is pnpm (packageManager: pnpm@10.33.2), NOT npm
pnpm -r build           # per-package builds; there is no root build script
cd ../Tovu-AI-CMS
npm install             # Tovu is npm
npm run typecheck       # must be clean BEFORE you change anything
```

If `npm run typecheck` is not clean on an unmodified tree, **stop and report** — something about
the environment is wrong and any failure you see later will be a false lead, not your bug.

Read `AI-Dev-Shop/agents/programmer/skills.md` in Tovu before any work and confirm in your first
output that you loaded it. Do **not** read `AGENTS.md` or `CLAUDE.md` — the `<<SUBAGENT_DISPATCH>>`
marker in your trigger message exempts you.

## Background — do not re-derive

Commit `f84ae88` wired composer image uploads end to end: `@jini-ai/chat/react`'s `<ChatPane>` gets
an `uploadAttachments` prop, uploads POST to `/api/attachments`, Tovu proxies that to its agent
daemon, and the daemon claims the upload and passes real `imagePaths` to `agentExecutor.run()`. It
typechecks and is committed. The two security properties it rests on were never tested.

---

# TASK 1 (most important) — prove or disprove two load-bearing security claims

Both are asserted in code comments as though observed. Neither is tested. Prove each with a REAL
test. If either turns out FALSE, **fix the code** — do not merely document it.

## Claim A — `src/server/modules/assistant.ts`, `forwardAttachmentUpload()`

The comment asserts that Tovu's app-wide `app.use(express.json({limit:"15mb"}))` (see
`src/server/app.ts`) only consumes a request whose `content-type` it recognizes as JSON, and for
anything else calls `next()` **without touching the stream at all** — so the raw `IncomingMessage`
reaches this handler intact and can be streamed onward with `duplex: "half"`.

**This is the entire reason the upload proxy works.** If it is false, every upload silently sends
`"{}"` instead of the file.

Write an integration test that POSTs a real binary body with `content-type:
application/octet-stream` through the **actual app middleware stack** and asserts the bytes arrive
downstream **byte-identical**. Also assert the boundary is where the comment claims — i.e. that an
`application/json` body IS consumed by the parser.

## Claim B — `src/assistant/agent-daemon-server.ts`, inside `onStarted`

It builds refs as `{path: id, name: "", kind: "file"}` and the comment asserts `claim()` "only ever
reads `.path` … re-derives `name`/`kind`/`size` from what `register()` recorded at upload time,
never from a caller-supplied value."

If false, a client could lie about `kind` and smuggle a non-image through as an image.

Verify against the real implementation in `Jini/packages/http-kit/src/attachments.ts`. Then write a
test that registers an attachment as one kind, claims it with a **deliberately wrong** `name`/`kind`,
and asserts the claimed result reflects the **registered truth**, not the lie.

Report each claim as **CONFIRMED** or **REFUTED** with the test output.

---

# TASK 4 — workspace-scope the attachment upload directory

`ATTACHMENT_UPLOAD_DIRECTORY` in `src/assistant/agent-daemon-server.ts` is currently:

```ts
process.env.TOVU_CHAT_ATTACHMENTS_DIR ??
  path.join(path.dirname(defaultContentDbPath()), "uploads", "chat-attachments")
```

That is site-level, with no workspace segment. **This codebase is deliberately multi-workspace** —
one `content.db` holds many workspaces. That is intentional; do not "fix" it.

The daemon is now workspace-bound via `TOVU_WORKSPACE` / `routeDeps.workspaceId` (same file). The
hazard: `createDiskAttachmentStore` **empties its `uploadDirectory` on construction**, so two daemons
for different workspaces sharing one directory means the second boot wipes the first's staged
uploads.

Add a workspace segment to the path, cover it with a test, and keep the `TOVU_CHAT_ATTACHMENTS_DIR`
override working.

---

## Constraints

- Run **only** scoped tests relevant to this work. Do **not** run the full `npm test` suite.
- `npm run typecheck` must be clean when you finish.
- 5 pre-existing test failures elsewhere in the repo are known and are **not yours**.

## MANDATORY — persisting your work

When done, or if stuck, or if running low on context:

1. `git add` your changed files **by explicit path** and commit with a clear message.
2. `git push`. If pushing to `main` fails or would conflict, push to a NEW branch
   `cloud/attachment-security` and say so in your report.
3. **Never finish with uncommitted work. Unpushed work is lost work.**

Report: each claim CONFIRMED/REFUTED with evidence, what you changed, test results, and the
branch + SHA you pushed.
