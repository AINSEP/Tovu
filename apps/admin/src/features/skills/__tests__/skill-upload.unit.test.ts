import { File as NativeFile } from "node:buffer";
import { expect, it } from "vitest";
import { prepareSkillUpload } from "../skill-upload";

it("retains folder paths and binary bytes across the base64 chunk boundary", async () => {
  const bytes = Uint8Array.from({ length: 8193 }, (_, i) => i % 256);
  const md = new NativeFile(["rules"], "SKILL.md");
  const asset = new NativeFile([bytes], "asset.bin");
  const payload = await prepareSkillUpload({ files: [md, asset] as unknown as File[] }, {
    paths: ["package/SKILL.md", "package/assets/asset.bin"],
  });
  expect(payload).toEqual({ files: [
    { path: "package/SKILL.md", contentBase64: "cnVsZXM=" },
    { path: "package/assets/asset.bin", contentBase64: Buffer.from(bytes).toString("base64") },
  ] });
  expect(await prepareSkillUpload({ files: [new NativeFile([bytes], "skill.zip")] as unknown as File[] }))
    .toEqual({ archiveBase64: Buffer.from(bytes).toString("base64") });
});

it("reports the fixed read error for a rejected folder or ZIP read", async () => {
  for (const name of ["SKILL.md", "skill.zip"]) {
    const unreadable = Object.assign(new NativeFile(["x"], name), {
      arrayBuffer: async () => { throw new Error("read failed"); },
    });
    // Node's File omits browser-only path metadata, as with the readable fixtures above.
    await expect(prepareSkillUpload({ files: [unreadable] as unknown as File[] })).rejects.toMatchObject({ message: "Could not read skill files." });
  }
});
