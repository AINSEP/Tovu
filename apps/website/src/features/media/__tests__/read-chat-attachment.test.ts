import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  CHAT_ATTACHMENT_REF_PATTERN,
  chatAttachmentSidecarFileName,
  isChatAttachmentSidecarShape,
  readChatAttachmentForOwner,
  resolveContainedAttachmentPath,
} from "../read-chat-attachment.js";

/**
 * @file `readChatAttachmentForOwner` — the authorization and path-safety half of the chat-attachment
 * read-back route (`routes/assistant/get-chat-attachment.ts`).
 *
 * Every case here stages a REAL directory laid out the way `createDiskAttachmentStore` lays one out
 * with `retainAcrossRestarts` on: `<root>/.records/<reduced-id>.json` beside `<root>/<batch>/<file>`.
 * Symlink and inode cases in particular are staged on a real filesystem rather than faked, because
 * a fake cannot prove that `lstat`/`realpath` are the calls actually being made.
 *
 * WHAT MUST HOLD, one group per property:
 *   1. an owner reads their own attachment, and NOBODY else does — including the case that matters
 *      most, an attachment with no recorded owner at all, which must be readable by no one rather
 *      than by anyone;
 *   2. a `ref` can never be made to name a path outside the record directory;
 *   3. a FORGED sidecar — the interesting case, since anything with write access to the upload root
 *      can leave one — can never make this read a file outside its own batch directory;
 *   4. a file swapped, resized, or replaced by a symlink after registration is refused, and so is
 *      one whose parent directory became a symlink.
 *
 * Refusals are asserted by their internal `refusal` tag, which the HTTP layer never exposes —
 * asserting the tag is what makes "this specific check fired" observable at all. That the route
 * collapses all of them into one indistinguishable 404 is asserted separately, in
 * `server/__tests__/routes/get-chat-attachment-route.test.ts`.
 */

const OWNER = "principal-owner-1";
const OTHER = "principal-other-2";
const BATCH = "batch-0000-1111";
const REF = "attachment:11111111-2222-3333-4444-555555555555";
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);

interface Staged {
  readonly uploadDirectory: string;
  readonly batchDirectory: string;
  readonly filePath: string;
  readonly sidecarDirectory: string;
}

/** Lays out one upload root exactly as the disk store does, writes `BYTES` as the attachment file,
 *  and returns the canonical paths. The root is canonicalized first because macOS's `tmpdir()` is
 *  itself a symlink (`/var` -> `/private/var`) — the real store records a canonical `filePath`, so
 *  a test that recorded the uncanonical one would be testing a layout that never occurs. */
async function stage(t: test.TestContext): Promise<Staged> {
  const uploadDirectory = await realpath(await mkdtemp(join(tmpdir(), "tovu-chat-attachment-")));
  t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
  const batchDirectory = resolve(uploadDirectory, BATCH);
  const sidecarDirectory = resolve(uploadDirectory, ".records");
  await mkdir(batchDirectory, { recursive: true });
  await mkdir(sidecarDirectory, { recursive: true });
  const filePath = resolve(batchDirectory, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.bin");
  await writeFile(filePath, BYTES);
  return { uploadDirectory, batchDirectory, filePath, sidecarDirectory };
}

/** Writes the sidecar the real store would have written for the staged file, with `overrides`
 *  applied on top — which is how every forged-record case below is expressed. */
async function writeSidecar(
  staged: Staged,
  overrides: Record<string, unknown> = {},
  options: { ref?: string } = {}
): Promise<void> {
  const info = await lstat(staged.filePath);
  const record = {
    id: REF,
    filePath: staged.filePath,
    name: "hero.png",
    kind: "image",
    size: info.size,
    batchId: BATCH,
    dev: info.dev,
    ino: info.ino,
    createdAt: Date.now(),
    ownerId: OWNER,
    ...overrides,
  };
  const fileName = chatAttachmentSidecarFileName(options.ref ?? REF);
  await writeFile(resolve(staged.sidecarDirectory, fileName), JSON.stringify(record));
}

async function read(staged: Staged, input: { ref?: string; ownerId?: string } = {}) {
  return readChatAttachmentForOwner(
    { uploadDirectory: staged.uploadDirectory },
    { ref: input.ref ?? REF, ownerId: input.ownerId ?? OWNER }
  );
}

// ---------------------------------------------------------------------------
// 1. Ownership
// ---------------------------------------------------------------------------

test("read-chat-attachment: the recorded owner gets the exact bytes on disk", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);

  const result = await read(staged);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(new Uint8Array(result.bytes), BYTES);
});

test("read-chat-attachment: a DIFFERENT principal is refused their peer's attachment", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);

  const result = await read(staged, { ownerId: OTHER });
  assert.deepEqual(result, { ok: false, refusal: "not-owner" });
});

test("read-chat-attachment: an attachment with NO recorded owner is readable by nobody", async (t) => {
  const staged = await stage(t);
  // What every attachment registered before ownership existed looks like, and what any host that
  // wires no `resolveOwnerId` still produces. An absent owner must never become a wildcard.
  await writeSidecar(staged, { ownerId: undefined });

  assert.deepEqual(await read(staged), { ok: false, refusal: "not-owner" });
  assert.deepEqual(await read(staged, { ownerId: OTHER }), { ok: false, refusal: "not-owner" });
  assert.deepEqual(await read(staged, { ownerId: "" }), { ok: false, refusal: "not-owner" });
});

test("read-chat-attachment: an ownerless record does not match a caller with no principal id either", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged, { ownerId: undefined });

  // The one input a bare `record.ownerId !== ownerId` comparison answers YES to: `undefined` does
  // equal `undefined`. `ownerId` is typed `string`, so this violates the contract on purpose —
  // that is the point. A check that cannot be reached through well-typed input is still worth
  // having when the failure it prevents is "hand someone else's upload to an unidentified caller".
  const result = await readChatAttachmentForOwner(
    { uploadDirectory: staged.uploadDirectory },
    { ref: REF, ownerId: undefined as unknown as string }
  );

  assert.deepEqual(result, { ok: false, refusal: "not-owner" });
});

test("read-chat-attachment: ownership is decided before the attachment file is read at all", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);
  // The file is gone, so an implementation that read bytes before checking the owner would report
  // an integrity failure here instead of a refusal — a difference only this ordering produces.
  await rm(staged.filePath);

  assert.deepEqual(await read(staged, { ownerId: OTHER }), { ok: false, refusal: "not-owner" });
});

test("read-chat-attachment: a ref with no sidecar at all is not found", async (t) => {
  const staged = await stage(t);

  assert.deepEqual(await read(staged), { ok: false, refusal: "no-record" });
});

// ---------------------------------------------------------------------------
// 2. The ref can never name a path
// ---------------------------------------------------------------------------

test("read-chat-attachment: every traversal-shaped ref is refused as malformed", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);

  const hostile = [
    "attachment:../../../etc/passwd",
    "../../../etc/passwd",
    "attachment:/etc/passwd",
    "/etc/passwd",
    "attachment:..",
    "attachment:.",
    // Express decodes `:ref` before a handler sees it, so this is the shape a percent-encoded
    // `%2F`/`%2E%2E` request actually arrives as.
    "attachment:aaaaaaaa/../../../etc/passwd",
    "attachment:aaaaaaaa\\..\\..\\windows",
    "attachment:aaaaaaaa.json",
    "attachment:short",
    "attachment:",
    "",
    `attachment:${"a".repeat(81)}`,
  ];
  for (const ref of hostile) {
    assert.deepEqual(await read(staged, { ref }), { ok: false, refusal: "malformed-ref" }, `ref: ${ref}`);
  }
});

test("read-chat-attachment: the ref pattern admits no path separator, dot, or NUL", () => {
  for (const ref of ["attachment:aaaaaaaa/bbbb", "attachment:aaaaaaaa.bbbb", "attachment:aaaaaaaa\\bbbb", "attachment:aaaa\0aaaa"]) {
    assert.equal(CHAT_ATTACHMENT_REF_PATTERN.test(ref), false, `ref: ${ref}`);
  }
  assert.equal(CHAT_ATTACHMENT_REF_PATTERN.test(REF), true);
});

test("read-chat-attachment: a sidecar filename is not enough — the record must claim the same id", async (t) => {
  const staged = await stage(t);
  // The filename is a LOSSY reduction of an id (`:` becomes `_`), so `attachment:x` and
  // `attachment_x` reduce to the same file. Without the id re-check, one would serve the other's
  // bytes.
  await writeSidecar(staged, { id: "attachment:99999999-9999-9999-9999-999999999999" });

  assert.deepEqual(await read(staged), { ok: false, refusal: "record-unreadable" });
});

test("read-chat-attachment: a sidecar that is not JSON, or not the right shape, is refused", async (t) => {
  const staged = await stage(t);
  await writeFile(resolve(staged.sidecarDirectory, chatAttachmentSidecarFileName(REF)), "{not json");
  assert.deepEqual(await read(staged), { ok: false, refusal: "no-record" });

  await writeFile(resolve(staged.sidecarDirectory, chatAttachmentSidecarFileName(REF)), JSON.stringify({ id: REF }));
  assert.deepEqual(await read(staged), { ok: false, refusal: "record-unreadable" });
});

test("read-chat-attachment: the shape check rejects a non-object, a wrong field type, and a non-string owner", () => {
  const valid = { id: "a", filePath: "b", name: "c", kind: "image", size: 1, batchId: "d", dev: 2, ino: 3, createdAt: 4 };
  assert.equal(isChatAttachmentSidecarShape(valid), true);
  assert.equal(isChatAttachmentSidecarShape({ ...valid, ownerId: "who" }), true);
  assert.equal(isChatAttachmentSidecarShape({ ...valid, ownerId: 7 }), false);
  assert.equal(isChatAttachmentSidecarShape({ ...valid, size: "1" }), false);
  assert.equal(isChatAttachmentSidecarShape(null), false);
  assert.equal(isChatAttachmentSidecarShape("a string"), false);
});

// ---------------------------------------------------------------------------
// 3. A forged sidecar cannot escape the upload root
// ---------------------------------------------------------------------------

test("read-chat-attachment: a forged sidecar naming a file outside the upload root is refused", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged, { filePath: "/etc/hosts" });

  assert.deepEqual(await read(staged), { ok: false, refusal: "record-outside-upload-root" });
});

test("read-chat-attachment: a forged sidecar cannot climb out with `..` in filePath or batchId", async (t) => {
  const staged = await stage(t);

  await writeSidecar(staged, { filePath: join(staged.batchDirectory, "..", "..", "passwd") });
  assert.deepEqual(await read(staged), { ok: false, refusal: "record-outside-upload-root" });

  await writeSidecar(staged, { batchId: "../../etc" });
  assert.deepEqual(await read(staged), { ok: false, refusal: "record-outside-upload-root" });

  await writeSidecar(staged, { batchId: "a.b" });
  assert.deepEqual(await read(staged), { ok: false, refusal: "record-outside-upload-root" });
});

test("read-chat-attachment: containment is parent-EQUALITY — a nested path inside the batch is still refused", async (t) => {
  const staged = await stage(t);
  const nested = resolve(staged.batchDirectory, "deeper");
  await mkdir(nested, { recursive: true });
  const nestedFile = resolve(nested, "x.bin");
  await writeFile(nestedFile, BYTES);
  await writeSidecar(staged, { filePath: nestedFile });

  // "Is somewhere under the batch directory" would accept this; "is directly inside it" does not,
  // which is the same stronger test `AttachmentStore.register` applies to an upload path.
  assert.deepEqual(await read(staged), { ok: false, refusal: "record-outside-upload-root" });
});

test("read-chat-attachment: containment resolution is pure and rejects the same records without any disk", () => {
  const root = "/srv/site/uploads/chat-attachments";
  const base = { id: REF, filePath: `${root}/${BATCH}/f.bin`, size: 1, batchId: BATCH, dev: 1, ino: 2 };
  assert.equal(resolveContainedAttachmentPath(base, root), `${root}/${BATCH}/f.bin`);
  assert.equal(resolveContainedAttachmentPath({ ...base, filePath: "/etc/hosts" }, root), undefined);
  assert.equal(resolveContainedAttachmentPath({ ...base, batchId: "../etc" }, root), undefined);
  assert.equal(resolveContainedAttachmentPath({ ...base, batchId: "short" }, root), undefined);
  assert.equal(resolveContainedAttachmentPath({ ...base, filePath: `${root}/f.bin` }, root), undefined);
});

// ---------------------------------------------------------------------------
// 4. The file must still be the file registration accepted
// ---------------------------------------------------------------------------

test("read-chat-attachment: a file replaced by a symlink after registration is refused", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);
  const outside = resolve(staged.uploadDirectory, "..", "outside-target.txt");
  await writeFile(outside, "secret");
  t.after(() => rm(outside, { force: true }));
  await rm(staged.filePath);
  await symlink(outside, staged.filePath);

  // `lstat().isFile()` is false for a symlink, so this never follows it.
  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" });
});

test("read-chat-attachment: a file reached through a SYMLINKED batch directory is refused, even with matching dev/ino/size", async (t) => {
  const staged = await stage(t);
  const realBatch = resolve(staged.uploadDirectory, "real-batch");
  await mkdir(realBatch, { recursive: true });
  await writeFile(resolve(realBatch, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.bin"), BYTES);
  await rm(staged.batchDirectory, { recursive: true });
  await symlink(realBatch, staged.batchDirectory);
  // Recorded AFTER the swap, so the identity is the one `lstat` reports THROUGH the symlink: a
  // regular file with matching device, inode and size. `lstat` does not follow a symlinked PARENT
  // — only the final component is left unfollowed — so every other check in the gate passes and
  // the canonical-path comparison is the only one that can still refuse.
  //
  // This construction exists because the obvious version of this test (swap the directory, leave a
  // DIFFERENT file behind) is caught by the inode comparison instead, and so passes just as well
  // against an implementation with no `realpath` call at all — proven by mutating it away.
  await writeSidecar(staged);

  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" });
});

test("read-chat-attachment: a file that changed size, changed inode, or vanished is refused", async (t) => {
  const staged = await stage(t);
  await writeSidecar(staged);

  await writeFile(staged.filePath, new Uint8Array([...BYTES, 9]));
  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" }, "appended");

  await writeSidecar(staged, { ino: 999999999 });
  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" }, "different inode");

  await writeSidecar(staged, { dev: 999999999 });
  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" }, "different device");

  await writeSidecar(staged);
  await rm(staged.filePath);
  assert.deepEqual(await read(staged), { ok: false, refusal: "integrity" }, "vanished");
});

test("read-chat-attachment: an upload directory that does not exist is not found, not a crash", async (t) => {
  const staged = await stage(t);
  await rm(staged.uploadDirectory, { recursive: true, force: true });

  assert.deepEqual(await read(staged), { ok: false, refusal: "no-record" });
});
