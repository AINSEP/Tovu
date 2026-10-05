import assert from "node:assert/strict";
import test from "node:test";
import { buildZipFixture, type ZipFixtureEntry } from "../../../agent-plugins/__tests__/fixtures/build-zip.js";
import { readSkillArchive } from "../../archive.js";
import { SkillInputError } from "../../validation.js";

// Direct tests for the skill ZIP reader (install-service.unit.test.ts reaches it for one valid
// archive, one symlink and one non-ZIP). Real archives from yazl; nothing is mocked.
const zip = async (entries: readonly ZipFixtureEntry[]) => (await buildZipFixture(entries)).toString("base64");
const refuses = (promise: Promise<unknown>, message: string) => assert.rejects(promise, (error: unknown) => error instanceof SkillInputError && error.message === message);
const MIB = 1024 * 1024;

test("returns each regular file's archive path and exact bytes, skipping directory entries", async () => {
  const binary = Buffer.from([0, 1, 2, 255]);
  const files = await readSkillArchive(await zip([
    { path: "pkg/", content: "" },
    { path: "pkg/SKILL.md", content: "---\nname: a\n---\n" },
    { path: "pkg/scripts/run.sh", content: "echo hi\n", mode: 0o100755 },
    { path: "pkg/assets/a.png", content: binary },
    // No file-type bits (a DOS-style entry) is treated as a regular file.
    { path: "pkg/LICENSE", content: "MIT", mode: 0o644 },
  ]));
  assert.deepEqual(files, [
    { path: "pkg/SKILL.md", contentBase64: Buffer.from("---\nname: a\n---\n").toString("base64") },
    { path: "pkg/scripts/run.sh", contentBase64: Buffer.from("echo hi\n").toString("base64") },
    { path: "pkg/assets/a.png", contentBase64: binary.toString("base64") },
    { path: "pkg/LICENSE", contentBase64: Buffer.from("MIT").toString("base64") },
  ]);
});

test("symlinks and other special entries are refused", async () => {
  await refuses(readSkillArchive(await zip([{ path: "SKILL.md", content: "x" }, { path: "link.md", content: "/etc/passwd", mode: 0o120777 }])), "Skill archives may contain only regular files and directories.");
  await refuses(readSkillArchive(await zip([{ path: "fifo", content: "", mode: 0o010644 }])), "Skill archives may contain only regular files and directories.");
});

test("unsafe entry names are refused with the shared path rule", async () => {
  await refuses(readSkillArchive(await zip([{ path: ".hidden/SKILL.md", content: "x" }])), "Unsafe skill file path: .hidden/SKILL.md");
  await refuses(readSkillArchive(await zip([{ path: "pkg/", content: "" }, { path: "pkg/.git/", content: "" }])), "Unsafe skill file path: pkg/.git");
});

test("more than 256 entries are refused", async () => {
  await refuses(readSkillArchive(await zip(Array.from({ length: 257 }, (_, i) => ({ path: `references/${i}.md`, content: "x" })))), "A skill archive may contain at most 256 entries.");
  assert.equal((await readSkillArchive(await zip(Array.from({ length: 256 }, (_, i) => ({ path: `references/${i}.md`, content: "x" }))))).length, 256);
});

test("a file over 1 MiB is refused from its declared size", async () => {
  await refuses(readSkillArchive(await zip([{ path: "references/big.md", content: Buffer.alloc(MIB + 1, 97) }])), "Skill archive file exceeds 1 MiB.");
  assert.equal((await readSkillArchive(await zip([{ path: "references/max.md", content: Buffer.alloc(MIB, 97) }])))[0]!.contentBase64.length, Math.ceil(MIB / 3) * 4);
});

test("decompressed content over 8 MiB in total is refused while streaming", async () => {
  // Highly compressible, so the archive itself stays well under the 8 MiB upload limit.
  const entries = Array.from({ length: 9 }, (_, i) => ({ path: `references/${i}.md`, content: Buffer.alloc(MIB, 97) }));
  await refuses(readSkillArchive(await zip(entries)), "Skill archive exceeds its decompressed size limit.");
});

test("malformed archives become one actionable refusal; base64 errors keep their own message", async () => {
  await refuses(readSkillArchive(Buffer.from("not a zip").toString("base64")), "Could not read skill ZIP. Use a valid ZIP with regular files only.");
  const truncated = (await buildZipFixture([{ path: "SKILL.md", content: "hello" }])).subarray(0, 40).toString("base64");
  await refuses(readSkillArchive(truncated), "Could not read skill ZIP. Use a valid ZIP with regular files only.");
  await refuses(readSkillArchive("not base64!"), "Skill upload must use valid base64.");
});
